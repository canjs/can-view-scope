"use strict";
var Observation = require('can-observation');
var observeReader = require('can-stache-key');
var assign = require('can-util/js/assign/assign');

var canReflect = require('can-reflect');
var canSymbol = require('can-symbol');
var KeyTree = require('can-key-tree');
var queues = require('can-queues');
var ObservationRecorder = require('can-observation-recorder');
var CIDSet = require("can-cid/set/set");
var makeComputeLike = require("./make-compute-like");


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

var peekValue = ObservationRecorder.ignore(canReflect.getValue.bind(canReflect));

var getFastPathRoot = ObservationRecorder.ignore(function(computeData){
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
			typeof root[computeData.reads[0].key] !== "function" && root;
	}
	return;
});

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
var ScopeKeyData = function(scope, key, options){

	this.startingScope = scope;
	this.key = key;
	this.options = assign({ observation: this.observation }, options);
	var observation;

	this.read = this.read.bind(this);
	this.dispatch = this.dispatch.bind(this);

	//!steal-remove-start
	Object.defineProperty(this.read, "name", {
		value: "{{" + this.key + "}}::ScopeKeyData.read",
	});
	Object.defineProperty(this.dispatch, "name", {
		value: canReflect.getName(this) + ".dispatch",
	});
	//!steal-remove-end

	this.handlers = new KeyTree([Object, Array], {
		onFirst: this.setup.bind(this),
		onEmpty: this.teardown.bind(this)
	});

	observation = this.observation = new Observation(this.read, this);


	// things added later
	this.fastPath = undefined;
	this.root = undefined;
	this.initialValue = undefined;
	this.reads = undefined;
	this.setRoot = undefined;
	var valueDependencies = new CIDSet();
	valueDependencies.add(observation);
	this.dependencies = {valueDependencies: valueDependencies};
};
ScopeKeyData.prototype = {
	constructor: ScopeKeyData,
	dispatch: function(newVal){
		var old = this.value;
		this.value = newVal;
		// adds callback handlers to be called w/i their respective queue.
		queues.enqueueByQueue(this.handlers.getNode([]), this, [newVal, old], null, [canReflect.getName(this), "changed to", newVal, "from", old]);
	},
	setup: function(){
		this.bound = true;
		canReflect.onValue(this.observation, this.dispatch, "notify");
		// TODO: we should check this sometime in the background.
		var fastPathRoot = getFastPathRoot(this);
		if( fastPathRoot ) {
			// rewrite the observation to call its event handlers
			this.toFastPath(fastPathRoot);
		}
		this.value = peekValue(this.observation);
	},
	teardown: function() {
		this.bound = false;
		canReflect.offValue(this.observation, this.dispatch, "notify");
		this.toSlowPath();
	},
	set: function(newVal){
		var root = this.root || this.setRoot;
		if(root) {
			observeReader.write(root, this.reads, newVal, this.options);
		} else {
			this.startingScope.set(this.key, newVal, this.options);
		}
	},
	get: function() {
		if (ObservationRecorder.isRecording()) {
			ObservationRecorder.add(this);
			if (!this.bound) {
				Observation.temporarilyBind(this);
			}
		}

		if (this.bound === true ) {
			return this.value;
		} else {
			return this.observation.get();
		}
	},
	on: function(handler, queue) {
		this.handlers.add([queue || "mutate", handler]);
	},
	off: function(handler, queue) {
		this.handlers.delete([queue || "mutate", handler]);
	},
	toFastPath: function(fastPathRoot){
		var self = this,
			observation = this.observation;

		this.fastPath = true;
		// there won't be an event in the future ...
		observation.dependencyChange = function(target, newVal){
			if(isEventObject(newVal)) {
				throw "no event objects!";
			}
			// but I think we will be able to get at it b/c there should only be one
			// dependency we are binding to ...
			if(target === fastPathRoot && typeof newVal !== "function") {
				this.newVal = newVal;
			} else {
				// restore
				self.toSlowPath();
			}

			return Observation.prototype.dependencyChange.apply(this, arguments);
		};
		observation.start = function(){
			this.value = this.newVal;
		};
	},
	toSlowPath: function(){
		this.observation.dependencyChange = Observation.prototype.dependencyChange;
		this.observation.start = Observation.prototype.start;
		this.fastPath = false;
	},
	read: function(){
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
	},
	hasDependencies: function(){
		return canReflect.valueHasDependencies( this.observation );
	}
};

canReflect.assignSymbols(ScopeKeyData.prototype, {
	"can.getValue": ScopeKeyData.prototype.get,
	"can.setValue": ScopeKeyData.prototype.set,
	"can.onValue": ScopeKeyData.prototype.on,
	"can.offValue": ScopeKeyData.prototype.off,
	"can.valueHasDependencies": ScopeKeyData.prototype.hasDependencies,
	"can.getValueDependencies": function(){
		return this.dependencies;
	},
	"can.getPriority": function(){
		return canReflect.getPriority( this.observation );
	},
	"can.setPriority": function(newPriority){
		canReflect.setPriority( this.observation, newPriority );
	},

	//!steal-remove-start
	"can.getName": function() {
		return canReflect.getName(this.constructor) + "{{" + this.key + "}}";
	},
	//!steal-remove-end
});

// Creates a compute-like for legacy reasons ...
Object.defineProperty(ScopeKeyData.prototype,"compute",{
	get: function(){
		var compute = makeComputeLike(this);

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
