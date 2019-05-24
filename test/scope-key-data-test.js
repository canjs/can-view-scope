var Scope = require('can-view-scope');
var SimpleMap = require('can-simple-map');
var QUnit = require('steal-qunit');
var canReflect = require('can-reflect');
var SimpleObservable = require('can-simple-observable');
var Observation = require("can-observation");
var ObservationRecorder = require("can-observation-recorder");

QUnit.module('can-view-scope scope-key-data');

QUnit.test("able to scope-key-data this", function(assert) {
	var value = new SimpleObservable(1);
	var scope = new Scope(value);
	var thisObservable = scope.computeData("this");
	thisObservable.on(function(){});

	assert.equal( canReflect.getValue(thisObservable), 1);

	canReflect.setValue(thisObservable,2);
});


QUnit.test("ScopeKeyData's thisArg is observable", function(assert) {
	var doSomething = function(){
		return this.value;
	};
	var context = new SimpleMap({
		foo: {
			doSomething: doSomething,
			value: "A"
		}
	});
	var res = new Scope(context).computeData("this.foo@doSomething",{proxyMethods: false});

	// This is basically what CallExpression does:
	var obs = new Observation(function(){
		var func = canReflect.getValue(res);
		return func.call(res.thisArg);
	});

	canReflect.onValue(obs, function(value){
		assert.equal(value, "B");
	});

	context.set("foo",{
		doSomething: doSomething,
		value: "B"
	});
});

QUnit.test("reading ScopeKeyData will update underlying observable", function(assert) {
	var context = new SimpleMap({
		"prop" :"value"
	});

	var prop = new Scope(context).computeData("this.prop",{proxyMethods: false});

	canReflect.onValue(prop, function(){});

	context.on("prop", function(){

		assert.equal(canReflect.getValue(prop), "VALUE", "able to read fastPath value");
	},"notify");

	context.set("prop", "VALUE");


	var root = new SimpleObservable("value");
	var observation = new Observation(function(){
		return root.value;
	});

	context = {
		"prop" : observation
	};

	prop = new Scope(context).computeData("this.prop",{proxyMethods: false});

	canReflect.onValue(prop, function(){});


	canReflect.onValue(root, function(){

		assert.equal(canReflect.getValue(prop), "VALUE", "able to read deep, non-fast-path value");
	},"notify");

	root.value = "VALUE";
});


QUnit.test("able to read from primitives (#197)", function(assert) {
	var map = new SimpleMap({
		someProperty: "hello"
	});
	var scope = new Scope(map);
	var scopeKeyData = scope.computeData("someProperty@split");

	// the problem was adding a string as a mutated dependency
	canReflect.onValue(scopeKeyData, function(){});

	assert.ok(true,"does not error");
});

QUnit.test("initialValue should not emit ObservationRecords (#198)", function(assert) {
	var map = new SimpleMap({
		someProperty: "hello"
	});
	var scope = new Scope(map);
	var scopeKeyData = scope.computeData("someProperty");

	ObservationRecorder.start();
	assert.equal(scopeKeyData.initialValue, "hello");
	var records = ObservationRecorder.stop();
	assert.equal(records.valueDependencies.size, 0, "no value deps");
});
