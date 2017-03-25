var Observation = require('can-observation');
var observeReader = require('can-observation/reader/reader');
var makeCompute = require('can-compute');

var types = require('can-types');
var isFunction = require('can-util/js/is-function/is-function');
var isEmptyObject = require('can-util/js/is-empty-object/is-empty-object');


var canReflect = require('can-reflect');
var canSymbol = require('can-symbol');



// The goal of this is to create a high-performance compute that represents a key value from can.view.Scope.
// If the key value is something like {{name}} and the context is a can.Map, a faster
// binding path will be used where new rebindings don't need to be looked for with every change of
// the observable property.
// However, if the property changes to a compute, then the slower `can.compute.read` method of
// observing values will be used.

var isFastPath = function(computeData){
	if(  computeData.reads &&
				// a single property read
				computeData.reads.length === 1 ) {
		var root = computeData.root;
		if( types.isCompute(root) ) {
			root = root();
		}
		// on a map
		return types.isMapLike(root) &&
			// that isn't calling a function
			!isFunction(root[computeData.reads[0].key]);
	}
	return;
};


// could we make this an observation first ... and have a getter for the compute?

// This is a fast-path enabled Observation wrapper use many places in can-stache.
// The goal of this is to:
//
// 1.  Make something that can be passed to can-view-live directly, hopefully
//     avoiding creating expensive computes.  Instead we will only be creating
//     `ScopeKeyData` which are thin wrappers.
//
// 2. Support the old "computeData" data type structure. If someone reads the
//    .compute property, they will get a compute that behaves the same way.
//
// 3. We should begin eliminating creating computes in as many places as possible
//    within CanJS code.  All of our helpers should be made to work with "faster"
//    observable values: Observation -> ScopeKeyData -> Compute -> compute
var ScopeKeyData = function(scope, key, options){
	this.startingScope = scope;
	this.key = key;
	this.options = options;
	this.observation = new Observation(this.read, this);
	this.handlers = [];

	// things added later
	this.fastPath = undefined;
	this.root = undefined;
	this.initialValue = undefined;
	this.reads = undefined;
	this.setRoot = undefined;
};
ScopeKeyData.prototype.getValue = function(){
	//Observation.add(this);
	return this.observation.get();
};
// this is used by the Observation.
// We use the observation for `getValue`
ScopeKeyData.prototype.read = function(){
	if (this.root) {
		// if we've figured out a root observable, start reading from there
		return observeReader.read(this.root, this.reads, this.options).value;
	}
	// If the key has not already been located in a observable then we need to search the scope for the
	// key.  Once we find the key then we need to return it's value and if it is found in an observable
	// then we need to store the observable so the next time this compute is called it can grab the value
	// directly from the observable.
	var data = this.startingScope.read(this.key, this.options);
	this.scope = data.scope;
	this.reads = data.reads;
	this.root = data.rootObserve;
	this.setRoot = data.setRoot;
	return this.initialValue = data.value;
};
ScopeKeyData.prototype.setValue = function(newVal){
	var root = this.root || this.setRoot;
	if(root) {
		observeReader.write(root, this.reads, newVal, this.options);
	} else {
		this.startingScope.set(this.key, newVal, this.options);
	}
};

var canOnValue = canSymbol.for("can.onValue"),
	canOffValue = canSymbol.for("can.offValue");
canReflect.set(ScopeKeyData.prototype, canOnValue, function(handler){
	if(!this.handlers.length) {
		canReflect.onValue(this.observation, this.dispatch.bind(this));
		// TODO: we should check this sometime in the background.
		if( isFastPath(this) ) {
			// rewrite the observation to call its event handlers

			var self = this,
				observation = this.observation;

			this.fastPath = true;
			// there won't be an event in the future ...
			observation.dependencyChange = function(ev, newVal){
				// but I think we will be able to get at it b/c there should only be one
				// dependency we are binding to ...
				if(types.isMapLike(ev.target) && typeof newVal !== "function") {
					this.newVal = newVal;
				} else {
					// restore
					observation.dependencyChange = Observation.prototype.dependencyChange;
					observation.start = Observation.prototype.start;
					self.fastPath = false;
				}

				return Observation.prototype.dependencyChange.call(this, ev);
			};
			observation.start = function(){
				this.value = this.newVal;
			};

		}
	}
	this.handlers.push(handler);
});

ScopeKeyData.prototype.dispatch = function(){
	var handlers = this.handlers.slice(0);
	for(var i = 0, len = handlers.length; i < len; i++) {
		handlers[i].apply(this, arguments);
	}
};

canReflect.set(ScopeKeyData.prototype, canOffValue, function(handler){
	var index = this.handlers.indexOf(handler);
	this.handlers.splice(index, 1);
});

canReflect.set(ScopeKeyData.prototype, canSymbol.for("can.getValue"), function(handler){
	return this.observation.get();
});

canReflect.set(ScopeKeyData.prototype, canSymbol.for("can.setValue"), ScopeKeyData.prototype.getValue);


// once a compute is read, cache it
Object.defineProperty(ScopeKeyData.prototype,"compute",{
	get: function(){
		var scopeKeyData = this;
		var compute = makeCompute(undefined,{
			on: function(updater) {
				scopeKeyData[canOnValue](updater);
				// this uses a lot of inside knowledge
				this.value = scopeKeyData.observation.value;
			},
			off: function(updater){
				scopeKeyData[canOffValue](updater);
			},
			get: function(){
				return scopeKeyData.observation.get();
			},
			set: function(newValue){
				return scopeKeyData.setValue(newValue);
			}
		});
		this.compute = compute;
		return compute;
	}
});





module.exports = function(scope, key, options){
	options = options || {
		args: []
	};
	return new ScopeKeyData(scope, key, options);
	/*
	// the object we are returning
	var computeData = {},
		// a function that can be passed to Observation, or used as a setter
		scopeRead = function (newVal) {
			if(arguments.length) {
				return scopeReader(scope, key, options, computeData, newVal);
			} else {
				return scopeReader(scope, key, options, computeData);
			}
		},
		compute = makeCompute(undefined,{
			on: function() {
				// setup the observing
				observation.start();

				if( isFastPath(computeData) ) {
					// When the one dependency changes, we can simply get its newVal and
					// save it.  If it's a function, we need to start binding the old way.
					observation.dependencyChange = function(ev, newVal){

						if(types.isMapLike(ev.target) && typeof newVal !== "function") {
							this.newVal = newVal;
						} else {
							// restore
							observation.dependencyChange = Observation.prototype.dependencyChange;
							observation.start = Observation.prototype.start;
							compute.fastPath = false;
						}
						return Observation.prototype.dependencyChange.call(this, ev);
					};
					observation.start = function(){
						this.value = this.newVal;
					};
					compute.fastPath = true;
				}
				// TODO deal with this right
				compute.computeInstance.value = observation.value;
				compute.computeInstance.hasDependencies = !isEmptyObject(observation.newObserved);
			},
			off: function(){
				observation.stop();
			},
			set: scopeRead,
			get: scopeRead,
			// a hack until we clean up can.compute for 3.0
			__selfUpdater: true
		}),

		// the observables read by the last calling of `scopeRead`

	compute.computeInstance.observation = observation;

	computeData.observation = new Observation(scopeRead);


	computeData.compute = compute;
	return computeData;*/

};
