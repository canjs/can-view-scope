var Scope = require('can-view-scope');
var SimpleMap = require('can-simple-map');
var QUnit = require('steal-qunit');
var canReflect = require('can-reflect');
var SimpleObservable = require('can-simple-observable');
var Observation = require("can-observation");

QUnit.module('can-view-scope scope-key-data');

QUnit.test("able to scope-key-data this", function(){
	var value = new SimpleObservable(1);
	var scope = new Scope(value);
	var thisObservable = scope.computeData("this");
	thisObservable.on(function(){});

	QUnit.equal( canReflect.getValue(thisObservable), 1);

	canReflect.setValue(thisObservable,2);
});


QUnit.test("ScopeKeyData's thisArg is observable", function(){
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
		QUnit.equal(value, "B");
	});

	context.set("foo",{
		doSomething: doSomething,
		value: "B"
	});
});
