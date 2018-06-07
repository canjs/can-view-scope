require("./scope-define-test");
var Scope = require('can-view-scope');
var Map = require('can-map');
var List = require('can-list');
var observeReader = require('can-stache-key');
var compute = require('can-compute');
var TemplateContext = require('../template-context');
var canSymbol = require("can-symbol");

var QUnit = require('steal-qunit');
var canBatch = require("can-event/batch/batch");
var canReflect = require("can-reflect");
var Observation = require('can-observation');
var testHelpers = require('can-test-helpers');

QUnit.module('can/view/scope');

test("basics",function(){

	var items = new Map({ people: [{name: "Justin"},[{name: "Brian"}]], count: 1000 });

	var itemsScope = new Scope(items),
	arrayScope = new Scope(itemsScope.peek('people'), itemsScope),
	firstItem = new Scope( arrayScope.peek('0'), arrayScope );

	var nameInfo;
	var c = compute(function(){
		nameInfo = firstItem.read('name');
	});
	c.bind("change", function(){});
	deepEqual(nameInfo.reads, [{key: "name", at: false}], "reads");
	equal(nameInfo.scope, firstItem, "scope");
	equal(nameInfo.value,"Justin", "value");
	equal(nameInfo.rootObserve, items.people[0], "rootObserve");

});

test('Scope.prototype.computeData', function () {
	var map = new Map();
	var base = new Scope(map);
	var age = base.computeData('age')
		.compute;
	equal(age(), undefined, 'age is not set');
	age.bind('change', function (ev, newVal, oldVal) {
		equal(newVal, 31, 'newVal is provided correctly');
		equal(oldVal, undefined, 'oldVal is undefined');
	});
	age(31);
	equal(map.attr('age'), 31, 'maps age is set correctly');
});
test('backtrack path (#163)', function () {
	var row = new Map({
		first: 'Justin'
	}),
		col = {
			format: 'str'
		}, base = new Scope(row),
		cur = base.add(col);
	equal(cur.peek('.'), col, 'got col');
	equal(cur.peek('..'), row, 'got row');
	equal(cur.peek('../first'), 'Justin', 'got row');
});

test('nested properties with compute', function () {
	var me = new Map({
		name: {
			first: 'Justin'
		}
	});
	var cur = new Scope(me);
	var compute = cur.computeData('name.first')
		.compute;
	var changes = 0;
	compute.bind('change', function (ev, newVal, oldVal) {
		if (changes === 0) {
			equal(oldVal, 'Justin');
			equal(newVal, 'Brian');
		} else if (changes === 1) {
			equal(oldVal, 'Brian');
			equal(newVal, undefined);
		} else if (changes === 2) {
			equal(oldVal, undefined);
			equal(newVal, 'Payal');
		} else if (changes === 3) {
			equal(oldVal, 'Payal');
			equal(newVal, 'Curtis');
		}
		changes++;
	});
	equal(compute(), 'Justin', 'read value after bind');
	me.attr('name.first', 'Brian');
	me.removeAttr('name');
	me.attr('name', {
		first: 'Payal'
	});
	me.attr('name', new Map({
		first: 'Curtis'
	}));
});
test('function at the end', function () {
	var compute = new Scope({
		me: {
			info: function () {
				return 'Justin';
			}
		}
	})
		.computeData('me.info')
		.compute;
	equal(compute(), 'Justin');
	var fn = function () {
		return this.name;
	};
	var compute2 = new Scope({
		me: {
			info: fn,
			name: 'Hank'
		}
	})
		.computeData('me.info', {
			isArgument: true,
			args: []
		})
		.compute;
	equal(compute2()(), 'Hank');
});
test('binds to the right scope only', function () {
	var baseMap = new Map({
		me: {
			name: {
				first: 'Justin'
			}
		}
	});
	var base = new Scope(baseMap);
	var topMap = new Map({
		me: {
			name: {}
		}
	});
	var scope = base.add(topMap);
	var compute = scope.computeData('me.name.first')
		.compute;
	compute.bind('change', function (ev, newVal, oldVal) {
		equal(oldVal, 'Justin');
		equal(newVal, 'Brian');
	});
	equal(compute(), 'Justin');
	// this should do nothing
	topMap.attr('me.name.first', 'Payal');
	baseMap.attr('me.name.first', 'Brian');
});
test('Scope read returnObserveMethods=true', function () {
	var MapConstruct = Map.extend({
		foo: function (arg) {
			equal(this, data.map, 'correct this');
			equal(arg, true, 'correct arg');
		}
	});
	var data = {
		map: new MapConstruct()
	};
	var res = Scope.read(data, observeReader.reads('map.foo'), {
		isArgument: true
	});
	res.value(true);
});
test('rooted observable is able to update correctly', function () {
	var baseMap = new Map({
		name: {
			first: 'Justin'
		}
	});
	var scope = new Scope(baseMap);
	var compute = scope.computeData('name.first')
		.compute;
	equal(compute(), 'Justin');
	baseMap.attr('name', new Map({
		first: 'Brian'
	}));
	equal(compute(), 'Brian');
});
test('computeData reading an object with a compute', function () {
	var sourceAge = 21;

	var age = compute(function (newVal) {
		if (newVal) {
			sourceAge = newVal;
		} else {
			return sourceAge;
		}
	});

	var scope = new Scope({
		person: {
			age: age
		}
	});

	var computeData = scope.computeData('person.age');
	var value = computeData.compute();

	equal(value, 21, 'correct value');

	computeData.compute(31);
	equal(age(), 31, 'age updated');
});
test('computeData with initial empty compute (#638)', function () {
	expect(2);
	var c = compute();
	var scope = new Scope({
		compute: c
	});
	var computeData = scope.computeData('compute');
	equal(computeData.compute(), undefined);
	computeData.compute.bind('change', function (ev, newVal) {
		equal(newVal, 'compute value');
	});
	c('compute value');
});

test('Can read static properties on constructors (#634)', function () {
	var Foo = Map.extend( {
		static_prop: 'baz'
	}, {
		proto_prop: 'thud'
	});
	var data = new Foo({
		own_prop: 'quux'
	}),
		scope = new Scope(data);
	equal(scope.computeData('constructor.static_prop')
		.compute(), 'baz', 'static prop');
});

test("Can read static properties on constructors (#634)", function () {
	var Foo = Map.extend({
		static_prop: "baz"
	}, {
		proto_prop: "thud"
	});
	var data = new Foo({
		own_prop: "quux"
	}),
		scope = new Scope(data);

	equal(scope.computeData("constructor.static_prop")
		.compute(), "baz", "static prop");
});

test('Scope lookup restricted to current scope with ./ (#874)', function() {
	var current;
	var scope = new Scope(
			new Map({value: "A Value"})
		).add(
			current = new Map({})
		);

	var compute = scope.computeData('./value').compute;

	equal(compute(), undefined, "no initial value");


	compute.bind("change", function(ev, newVal){
		equal(newVal, "B Value", "changed");
	});

	compute("B Value");
	equal(current.attr("value"), "B Value", "updated");

});

test('reading properties on undefined (#1314)', function(){

	var scope = new Scope(undefined);

	var compute = scope.compute("property");

	equal(compute(), undefined, "got back undefined");

});


test("Scope attributes can be set (#1297, #1304)", function(){
	var comp = compute('Test');
	var map = new Map({
		other: {
			name: "Justin"
		}
	});
	var scope = new Scope({
		name: "Matthew",
		other: {
			person: {
				name: "David"
			},
			comp: comp
		}
	});

	scope.set("name", "Wilbur");
	equal(scope.get("name"), "Wilbur", "Value updated");

	scope.set("other.person.name", "Dave");
	equal(scope.get("other.person.name"), "Dave", "Value updated");

	scope.set("other.comp", "Changed");
	equal(comp(), "Changed", "Compute updated");

	scope = new Scope(map);
	scope.set("other.name", "Brian");

	equal(scope.get("other.name"), "Brian", "Value updated");
	equal(map.attr("other.name"), "Brian", "Name update in map");
});

testHelpers.dev.devOnlyTest("Setting a value to an attribute with an undefined parent errors (canjs/can-stache-bindings#298)", function(){
	var teardown = testHelpers.dev.willError(/Attempting to set a value at (.+) where (.+) is undefined./);

	var scope = new Scope({});
	scope.set("person.name", "Christopher");

	QUnit.equal(teardown(), 1, "saw errors");
});

test("computeData.compute get/sets computes in maps", function(){
	var cmpt = compute(4);
	var map = new Map();
	map.attr("computer", cmpt);

	var scope = new Scope(map);
	var computeData = scope.computeData("computer",{});

	equal( computeData.compute(), 4, "got the value");

	computeData.compute(5);
	equal(cmpt(), 5, "updated compute value");
	equal( computeData.compute(), 5, "the compute has the right value");
});

test("computesData can find update when initially undefined parent scope becomes defined (#579)", function(){
	expect(2);

	var map = new Map();
	var scope = new Scope(map);
	var top = scope.add(new Map());

	var computeData = top.computeData("value",{});

	equal( computeData.compute(), undefined, "initially undefined");

	computeData.compute.bind("change", function(ev, newVal){
		equal(newVal, "first");
	});

	map.attr("value","first");


});

test("A scope's %root is the last context", function(){
	var map = new Map();
	var refs = Scope.refsScope();
	// Add a bunch of contexts onto the scope, we want to make sure we make it to
	// the top.
	var scope = refs.add(map).add(new Scope.Refs()).add(new Map());

	var root = scope.peek("%root");

	ok(!(root instanceof Scope.Refs), "root isn't a reference");
	equal(root, map, "The root is the map passed into the scope");
});

test("can set scope attributes with ../ (#2132)", function(){

	var map = new Map();
	var scope = new Scope(map);
	var top = scope.add(new Map());

	top.set("../foo", "bar");

	equal(map.attr("foo"), "bar");

});

test("can read parent context with ../ (#2244)", function(){
	var map = new Map();
	var scope = new Scope(map);
	var top = scope.add(new Map());

	equal( top.peek("../"), map, "looked up value correctly");

});

test("trying to read constructor from refs scope is ok", function(){
	var map = new TemplateContext();
	var construct = compute(function(){
		return map.constructor;
	});
	construct.bind("change", function(){});
	equal(construct(), TemplateContext);
});

test("reading from a string in a nested scope doesn't throw an error (#22)",function(){
	var foo = compute('foo');
	var bar = compute('bar');
	var scope = new Scope(foo);
	var localScope = scope.add(bar);

	equal(localScope.read('foo').value, undefined);
});

test("Optimize for compute().observableProperty (#29)", function(){
	var map = new Map({value: "a"});
	var wrap = compute(map);

	var scope = new Scope(wrap);
	var scopeKeyData = scope.computeData("value");
	var scopeCompute = scopeKeyData.compute;

	var changeNumber = 0;
	scopeCompute.on("change", function(ev, newVal, oldVal){
		if(changeNumber === 1) {
			QUnit.equal(newVal, "b");
			QUnit.equal(oldVal, "a");
			QUnit.ok(scopeKeyData.fastPath, "still fast path");
			changeNumber++;
			wrap(new Map({value: "c"}));
		} else if(changeNumber === 2) {
			QUnit.equal(newVal, "c", "got new value");
			QUnit.equal(oldVal, "b", "got old value");
			QUnit.notOk(scopeKeyData.fastPath, "still fast path");
		}

	});


	QUnit.ok(scopeKeyData.fastPath, "fast path");

	changeNumber++;
	map.attr("value", "b");
});

test("read should support passing %scope (#24)", function() {
	var scope = new Scope(new Map({ foo: "", bar: "" }));

	equal(scope.read("%scope").value, scope, "looked up %scope correctly");
});


test("a compute can observe the ScopeKeyData", 2, function(){
	var map = new Map({value: "a", other: "b"});
	var wrap = compute(map);

	var scope = new Scope(wrap);
	var scopeKeyData = scope.computeData("value");

	var oldOnValue = scopeKeyData[canSymbol.for("can.onValue")];

	scopeKeyData[canSymbol.for("can.onValue")] = function(){
		QUnit.ok(true, "bound on the scopeKeyData");
		return oldOnValue.apply(this, arguments);
	};

	var c = compute(function(){
		return scopeKeyData.getValue() + map.attr("other");
	});

	c.on("change", function(ev, newValue){
		QUnit.equal(newValue,"Ab");
	});

	map.attr("value","A");

});

QUnit.asyncTest("unbinding clears all event bindings", function(){
	var map = new Map({value: "a", other: "b"});
	var wrap = compute(map);

	var scope = new Scope(wrap);
	var scopeKeyData = scope.computeData("value");

	var c = compute(function(){
		return scopeKeyData.getValue() + map.attr("other");
	});

	var handlers = function(ev, newValue){
		QUnit.equal(newValue,"Ab");
	};
	c.on("change", handlers);

	c.off("change", handlers);

	setTimeout(function () {
		equal(map.__bindEvents._lifecycleBindings, 0, "there are no bindings");
		start();
	}, 30);
});

QUnit.test("computes are read as this and . and  ../", function(){
	var value = compute(1);
	var scope = new Scope(value);
	QUnit.equal(scope.get("this"), 1, "this read value");
	QUnit.equal(scope.get("."), 1, ". read value");
	scope = scope.add({});

	QUnit.equal(scope.get(".."), 1, ".. read value");
});

QUnit.test("computes are set as this and . and  ../", function(){
	var value = compute(1);
	var scope = new Scope(value);
	scope.set("this",2);
	QUnit.equal(scope.get("this"), 2, "this read value");
	scope.set(".",3);
	QUnit.equal(scope.get("this"), 3, ". read value");

	scope = scope.add({});
	scope.set("..",4);
	QUnit.equal(scope.get(".."), 4, ".. read value");
});

QUnit.test("maps are set with this.foo and ./foo", function(){
	var map = compute(new Map({value: 1}));
	var scope = new Scope(map);
	scope.set("this.value",2);
	QUnit.equal(scope.get("this.value"), 2, "this read value");
	scope.set("./value",3);
	QUnit.equal(scope.get("./value"), 3, ". read value");
});

QUnit.test("scopeKeyData fires during batch", function(){
	var map = new Map({value: "a", other: "b"});

	var scope = new Scope(map);

	var batchNum;
	map.on("value", function(){
		batchNum = canBatch.batchNum;
	});

	var scopeKeyData = scope.computeData("value");

	scopeKeyData[canSymbol.for("can.onValue")](function(value){
		QUnit.equal(batchNum, canBatch.batchNum);
	});

	map.attr("value","A");
});

QUnit.test("setting a key on a non observable context", function(){
	var context = {colors: new List([])};

	var scope = new Scope(context);

	scope.set("colors", ["red"]);

	QUnit.deepEqual(context.colors.attr(), ["red"], "can updateDeep");
});

QUnit.test("observing scope key data does not observe observation", function(){
	var map = new Map({value: "a"});

	var scope = new Scope(map);

	var computeData = scope.computeData("value");
	var oldOnValue = computeData.observation[canSymbol.for("can.onValue")];
	var bindCount = 0;

	computeData.observation[canSymbol.for("can.onValue")] = function(){
		bindCount ++;
		return oldOnValue.apply(this, arguments);
	};

	var valueCompute = computeData.compute;
	var oldComputeOnValue = valueCompute.computeInstance[canSymbol.for("can.onValue")];
	valueCompute.computeInstance[canSymbol.for("can.onValue")] = function(){
		bindCount ++;
		return oldComputeOnValue.apply(this, arguments);
	};

	var c = compute(function(){
		return valueCompute();
	});

	c.on("change", function(){});

	QUnit.equal(bindCount,2, "there should only be one event bound");

});

QUnit.test("scopeKeyData offValue resets dependencyChange/start", function() {
	var map = new Map({value: "a", other: "b"});
	var wrap = compute(map);

	var scope = new Scope(wrap);
	var scopeKeyData = scope.computeData("value");

	var handler = function() {};
	canReflect.onValue(scopeKeyData, handler);
	canReflect.offValue(scopeKeyData, handler);

	QUnit.equal(scopeKeyData.observation.dependencyChange, Observation.prototype.dependencyChange, 'dependencyChange should be restored');
	QUnit.equal(scopeKeyData.observation.start, Observation.prototype.start, 'start should be restored');
});

QUnit.test("Rendering a template with a custom scope (#55)", function() {
	var scope = new Scope({}),
		scopeRefs;

	try {
		scopeRefs = scope.getRefs();
		QUnit.ok(true, "Did not throw");
	}
	catch(e) {
		QUnit.ok(false, e.message);
	}

	QUnit.equal(scope.get('name'), undefined, "No name");
	scope.set('name', 'John');
	QUnit.equal(scope.get('name'), 'John', "Got the name");
	scope = scope.add({name: 'Justin'});
	QUnit.equal(scope.get('name'), 'Justin', "Got the top scope name");

	try {
		scopeRefs = scope.getRefs();
		QUnit.ok(true, "Did not throw");
	}
	catch(e) {
		QUnit.ok(false, e.message);
	}
});

QUnit.test("generated refs scope is a Scope", function() {
	var scope = new Scope({});
	QUnit.equal(scope._parent, undefined, "scope initially has no parent");
	var refScope = scope.getRefs();

	QUnit.ok(refScope instanceof Scope, "refScope is a scope");
	QUnit.ok(refScope._context instanceof Scope.Refs, "refScope context is a refs object");
});

QUnit.test("./ scope lookup should read current scope", function () {
	var parent = new Map();
	var map = new Map();
	var scope = new Scope(parent).add(map);
	QUnit.equal(scope.attr("./"), map);
});

QUnit.test("getTemplateContext() gives a scope with the templateContext", function() {
	var map = new Map();
	var scope = new Scope(map);

	var templateContext = scope.getTemplateContext();

	QUnit.ok(templateContext instanceof Scope, 'templateContext is a Scope');
	QUnit.ok(templateContext._context instanceof TemplateContext, 'templateContext context is a TemplateContext object');
});

QUnit.test("scope can be used to read from the templateContext", function() {
	var map = new Map();
	var scope = new Scope(map);

	QUnit.deepEqual(scope.peek("scope"), scope, "scope");

	scope.set("scope.vars.name", "Kevin");
	QUnit.equal(scope.peek("scope.vars.name"), "Kevin", "scope.vars.name === Kevin");
	QUnit.equal(scope.peek("*name"), "Kevin", "*name === Kevin");

	scope.set("*name", "Tracy");
	QUnit.equal(scope.peek("*name"), "Tracy", "*name === Tracy");
	QUnit.equal(scope.peek("scope.vars.name"), "Tracy", "scope.vars.name === Tracy");

	var ageFn = function() { return "30"; };
	scope.set("*age", ageFn);
	QUnit.equal(scope.peek("@*age")(), "30", "@*age returns a function");
	QUnit.equal(scope.peek("*age")(), "30", "*age returns a function");
	QUnit.equal(scope.peek("scope.vars.age"), "30", "scope.vars.age === 30");
});

QUnit.test("scope.index reads from special scopes", function() {
	var map1 = new Map({ index: 1 });
	var map2 = new Map({ index: 3 });
	var scope = new Scope(map1);

	QUnit.equal(scope.peek('scope.index'), undefined,
		'scope.index returns undefined if no special context exists');

	scope = scope.add({ index: 2 }, { special: true })
		.add(map2)
		.add({ index: 4 }, { special: true });

	QUnit.equal(scope.peek('scope.index'), 4, 'scope.index is read correctly');

	QUnit.equal(scope._parent.peek('scope.index'), 2, 'scope.index is only read from special contexts');
});

QUnit.test("scope.key reads from special scopes", function() {
	var map1 = new Map({ key: "one" });
	var map2 = new Map({ key: 3 });
	var scope = new Scope(map1)
		.add({ key: "two" }, { special: true })
		.add(map2)
		.add({ key: "four" }, { special: true });

	QUnit.equal(scope.peek('scope.key'), "four", 'scope.key is read correctly');

	QUnit.equal(scope._parent.peek('scope.key'), "two", 'scope.key is only read from special contexts');
});

QUnit.test("*self should return scope.view", function() {
	var view = function(){};
	var scope = new Scope({});
	scope.set("scope.view", view);

	QUnit.equal(scope.peek("scope.view"), view, "scope.view");
	QUnit.equal(scope.peek("*self"), view, "*self");
});

testHelpers.dev.devOnlyTest("using {{>*self}} should show deprecation warning", function() {
	var teardown = testHelpers.dev.willWarn("filename:10: {{>*self}} is deprecated. Use {{>scope.view}} instead.");

	var scope = new Scope({});
	scope.set("scope.filename", "filename");
	scope.set("scope.lineNumber", "10");
	scope.peek("*self");

	QUnit.equal(teardown(), 1, "deprecation warning displayed");
});

testHelpers.dev.devOnlyTest("using *foo should show deprecation warning", function() {
	var teardown = testHelpers.dev.willWarn("filename:5: {{*foo}} is deprecated. Use {{scope.vars.foo}} instead.");

	var scope = new Scope({});
	scope.set("scope.filename", "filename");
	scope.set("scope.lineNumber", "5");
	scope.peek("*foo");

	QUnit.equal(teardown(), 1, "deprecation warning displayed");
});

QUnit.test("variables starting with 'scope' should not be read from templateContext (#104)", function() {
	var map = new Map({ scope1: "this is scope1" });
	var scope = new Scope(map);

	QUnit.deepEqual(scope.peek("scope1"), "this is scope1", "scope1");
});

QUnit.test("nested properties can be read from templateContext.vars", function() {
	var foo = new Map({ bar: "baz" });

	var map = new Map();
	var scope = new Scope(map);

	QUnit.ok(!scope.peek("scope.vars.foo.bar"), "vars.foo.bar === undefined");

	scope.set("scope.vars.foo", foo);
	QUnit.equal(scope.peek("scope.vars.foo.bar"), "baz", "vars.foo.bar === baz");
});

QUnit.test("filename and lineNumber can be read from anywhere in scope chain", function() {
	var parent = new Scope({});
	var scope = parent.add({});

	parent.set("scope.filename", "my-cool-file.txt");
	parent.set("scope.lineNumber", "5");

	QUnit.equal(scope.peek("scope.filename"), "my-cool-file.txt", 'scope.peek("scope.filename")');
	QUnit.equal(scope.peek("scope.lineNumber"), "5", 'scope.peek("scope.lineNumber")');
});

QUnit.test("nested properties can be read from templateContext.root", function() {
	var root = new Map({ bar: "baz" });

	var map = new Map();
	var scope = new Scope(map);

	QUnit.ok(!scope.peek("scope.root.bar"), "root.bar === undefined");

	scope.set("scope.root", root);
	QUnit.equal(scope.peek("scope.root.bar"), "baz", "root.bar === baz");
});

QUnit.test("special scopes are skipped if options.special !== true", function() {
	var map1 = new Map({ foo: "one" });
	var scope = new Scope(map1)
		.add({ foo: "two" }, { special: true })
		.add({});

	QUnit.equal(scope.peek('foo'), "one", "foo is read from first non-special scope with a foo property");
	QUnit.equal(scope.peek('foo', { special: true }), "two", "foo is read from special scope");
});

QUnit.test("special scopes are skipped when using ../.", function() {
	var map = new Map({ foo: "one" });
	var scope = new Scope(map)
		.add({ foo: "two" }, { special: true })
		.add({});

	QUnit.equal(scope.peek('../.'), map);
});

QUnit.test("special scopes are skipped when using .", function() {
	var map = new Map({ foo: "one" });
	var scope = new Scope(map)
		.add({ foo: "two" }, { special: true });

	QUnit.equal(scope.peek('.'), map);
});

QUnit.test("scope.vm and scope.top", function() {
	var scope = new Scope({ name: "foo" })
		.add({ name: "Kevin" }, { viewModel: true }) // top
		.add({ name: "bar" }) // intermediate
		.add({ name: "Ryan" }, { viewModel: true }) // vm
		.add({ name: "baz" });

	QUnit.equal(scope.read("scope.vm.name").value, "Ryan", "scope.first can be used to read from the _first_ context with viewModel: true");
	QUnit.equal(scope.read("scope.top.name").value, "Kevin", "scope.top can be used to read from the _top_ context with viewModel: true");
});
