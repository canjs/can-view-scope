var Scope = require('can-view-scope');
var QUnit = require('steal-qunit');
var SimpleMap = require('can-simple-map');
var canReflect = require("can-reflect");

QUnit.module('can-view-scope variable scope');

QUnit.test("reading", function(){
	var root = {
		rootProp: "ROOT",
		conflictProp: "ROOT"
	};
	var scope = new Scope(root).add({
		variableProp: "VARIABLE",
		conflictProp: "VARIABLE"
	},{variable: true});

	QUnit.equal( scope.get("variableProp"), "VARIABLE", "can read a variable");
	QUnit.equal( scope.get("this.rootProp"), "ROOT", "can pass variables for the root");

	QUnit.equal( scope.get("this.conflictProp"), "ROOT", "this.conflictProp");
	QUnit.equal( scope.get("./conflictProp"), "ROOT", "./conflictProp");
	QUnit.equal( scope.get("conflictProp"), "VARIABLE", "conflictProp");

	QUnit.equal( scope.get("this"), root, "this is right");

	var root2 = {
		root2Prop: "ROOT2",
		conflictProp: "ROOT2"
	};
	var scope2 = new Scope(root).add(root2).add({
		variableProp: "VARIABLE",
		conflictProp: "VARIABLE"
	},{variable: true});

	QUnit.equal( scope2.get("variableProp"), "VARIABLE", "can read a variable");
	QUnit.equal( scope2.get("this.root2Prop"), "ROOT2", "can pass variables for the root 2");

	QUnit.equal( scope2.get("this.conflictProp"), "ROOT2", "this.conflictProp");
	QUnit.equal( scope2.get("./conflictProp"), "ROOT2", "./conflictProp");
	QUnit.equal( scope2.get("conflictProp"), "VARIABLE", "conflictProp");

	QUnit.equal( scope2.get("../conflictProp"), "ROOT", "../conflictProp");

	var root3 = {
		root3Prop: "ROOT3",
		conflictProp: "ROOT3"
	};
	var scope3 = new Scope(root).add(root2).add(root3).add({
		variableProp: "VARIABLE",
		conflictProp: "VARIABLE"
	},{variable: true});

	QUnit.equal( scope3.get("../../conflictProp"), "ROOT", "../../conflictProp");
});

QUnit.test("writing", function(){
	var root = new SimpleMap({name: "ROOT"});
	var scope;

	scope = new Scope(root).addLetContext();

	scope.set("rootProp","VALUE");
	QUnit.equal(root.get("rootProp"), "VALUE", "wrote to property with .set");

	var rootProp = scope.computeData('rootProp2');
	canReflect.setValue(rootProp, "VALUE2");
	QUnit.equal(root.get("rootProp2"), "VALUE2", "wrote property by setting ScopeKeyData");

	var rootProp3 = scope.computeData('rootProp3');
	canReflect.onValue(rootProp3, function(){});
	canReflect.setValue(rootProp3, "VALUE3");
	QUnit.equal(root.get("rootProp3"), "VALUE3", "wrote to property by setting bound ScopeKeyData");


	scope = new Scope(root).addLetContext({tempProp: undefined});

	scope.set("tempProp", "foo");

	QUnit.equal(root.get("tempProp"), undefined, "write to undefined not set on root");
	QUnit.equal(scope.get("tempProp"), "foo", "able to read from root");
});
