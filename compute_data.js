"use strict";
var Observation = require('can-observation');
var observeReader = require('can-stache-key');
var makeCompute = require('can-compute');
var assign = require('can-util/js/assign/assign');
var isFunction = require('can-util/js/is-function/is-function');
var canBatch = require('can-event/batch/batch');
var CID = require("can-cid");
var canReflect = require('can-reflect');
var canSymbol = require('can-symbol');




// The goal of this is to create a high-performance compute that represents a key value from can.view.Scope.
// If the key value is something like {{name}} and the context is a can.Map, a faster
// binding path will be used where new rebindings don't need to be looked for with every change of
// the observable property.
// However, if the property changes to a compute, then the slower `can.compute.read` method of
// observing values will be used.

// ideally, we would know the order things were read.  If the last thing read
// was something we can observe, and the value of it matched the value of the observation,
// and the key matched the key of the observation
// it's a fair bet that we can just listen to that last object.
// If the `this` is not that object ... freak out.  Though `this` is not necessarily part of it.  can-observation could make
// this work.
var getFastPathRoot = function(computeData){
	if( computeData.reads &&
				// a single property read
				computeData.reads.length === 1 ) {
		var root = computeData.root;
		if( root && root[canSymbol.for("can.getValue")] ) {
			root = canReflect.getValue(root);
		}
		// on a map
		return root && canReflect.isObservableLike(root) && canReflect.isMapLike(root) &&
			// that isn't calling a function
			!isFunction(root[computeData.reads[0].key]) && root;
	}
	return;
};

var isEventObject = function(obj){
	return obj && typeof obj.batchNum === "number" && typeof obj.type === "string";
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
	CID(this);
	this.startingScope = scope;
	this.key = key;
	this.observation = new Observation(this.read, this);
	this.options = assign({ observation: this.observation }, options);
	this.handlers = [];
	this.dispatchHandler = this.dispatch.bind(this);

	// things added later
	this.fastPath = undefined;
	this.root = undefined;
	this.initialValue = undefined;
	this.reads = undefined;
	this.setRoot = undefined;
};
// have things bind to this, not the underlying observation.  This makes it
// so performance optimizations will work.
ScopeKeyData.prototype.getValue = function(){
	Observation.add(this);
	return this.getObservationValue();
};
ScopeKeyData.prototype.getObservationValue = Observation.ignore(function(){
	return this.observation.get();
});
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
ScopeKeyData.prototype.hasDependencies = function(){
	return this.observation.hasDependencies();
};

var canOnValue = canSymbol.for("can.onValue"),
	canOffValue = canSymbol.for("can.offValue");
canReflect.set(ScopeKeyData.prototype, canOnValue, function(handler){
	if(!this.handlers.length) {
		canReflect.onValue(this.observation, this.dispatchHandler);
		// TODO: we should check this sometime in the background.
		var fastPathRoot = getFastPathRoot(this);
		if( fastPathRoot ) {
			// rewrite the observation to call its event handlers

			var self = this,
				observation = this.observation;

			this.fastPath = true;
			// there won't be an event in the future ...
			observation.dependencyChange = function(target, newVal, altNewValue){
				if(isEventObject(newVal)) {
					newVal = altNewValue;
				}
				// but I think we will be able to get at it b/c there should only be one
				// dependency we are binding to ...
				if(target === fastPathRoot && typeof newVal !== "function") {
					this.newVal = newVal;
				} else {
					// restore
					observation.dependencyChange = Observation.prototype.dependencyChange;
					observation.start = Observation.prototype.start;
					self.fastPath = false;
				}

				return Observation.prototype.dependencyChange.call(this, target, newVal, altNewValue);
			};
			observation.start = function(){
				this.value = this.newVal;
			};

		}
	}
	this.handlers.push(handler);
});

// Does this need to use the event queue?
ScopeKeyData.prototype.dispatch = function(){
	var handlers = this.handlers.slice(0);
	for(var i = 0, len = handlers.length; i < len; i++) {
		canBatch.batchNum = this.observation.batchNum;
		handlers[i].apply(this, arguments);
	}
};

canReflect.set(ScopeKeyData.prototype, canOffValue, function(handler){
	var index = this.handlers.indexOf(handler);
	this.handlers.splice(index, 1);
	if(!this.handlers.length) {
		canReflect.offValue(this.observation, this.dispatchHandler);

		this.observation.dependencyChange = Observation.prototype.dependencyChange;
		this.observation.start = Observation.prototype.start;
	}
});

canReflect.set(ScopeKeyData.prototype, canSymbol.for("can.getValue"), ScopeKeyData.prototype.getValue);

canReflect.set(ScopeKeyData.prototype, canSymbol.for("can.setValue"), ScopeKeyData.prototype.setValue);

canReflect.set(ScopeKeyData.prototype, canSymbol.for("can.valueHasDependencies"), ScopeKeyData.prototype.hasDependencies);



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
		// this is important so it will always call observation.get
		// This is something that should be "fixed" somehow for everything
		// related to observations.
		compute.computeInstance.observation = this.observation;
		compute.computeInstance._canObserve = false;
		Object.defineProperty(this, "compute", {
			value: compute,
			writable: false,
			configurable: false
		});
		return compute;
	},
	configurable: true
});





module.exports = function(scope, key, options){
	return new ScopeKeyData(scope, key, options || {
		args: []
	});

};
