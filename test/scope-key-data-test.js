var Scope = require('can-view-scope');

var QUnit = require('steal-qunit');
var canReflect = require('can-reflect');
var SimpleObservable = require('can-simple-observable');

QUnit.module('can-view-scope scope-key-data');

QUnit.test("able to scope-key-data this", function(){
	var value = new SimpleObservable(1);
	var scope = new Scope(value);
	var thisObservable = scope.computeData("this");
	thisObservable.on(function(){});

	QUnit.equal( canReflect.getValue(thisObservable), 1);

	canReflect.setValue(thisObservable,2);
});
