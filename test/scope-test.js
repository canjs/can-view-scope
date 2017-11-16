var Scope = require('can-view-scope');
var observeReader = require('can-stache-key');
var TemplateContext = require('../template-context');
var canSymbol = require("can-symbol");

var QUnit = require('steal-qunit');
var canReflect = require("can-reflect");
var Observation = require('can-observation');
var testHelpers = require('can-test-helpers');
var SimpleMap = require('can-simple-map');
var SimpleObservable = require('can-simple-observable');
var ObservationRecorder = require('can-observation-recorder');
var mutateDeps = require('can-reflect-mutate-dependencies');

QUnit.module('can/view/scope');

test("basics",function(){
	var address =  new SimpleMap({zip: 60647});
	var person = new SimpleMap({name: "Justin", address: address});
	var items = new SimpleMap({ people: person, count: 1000 });

	var itemsScope = new Scope(items),
		personScope = new Scope(person, itemsScope),
		zipScope = new Scope( address, personScope );

	var nameInfo;
	var c = new Observation(function(){
		nameInfo = zipScope.read('../name');
	});
	canReflect.onValue(c, function(){});

	deepEqual(nameInfo.reads, [{key: "name", at: false}], "reads");
	equal(nameInfo.scope, personScope, "scope");
	equal(nameInfo.value,"Justin", "value");
	equal(nameInfo.rootObserve, person, "rootObserve");

});

test('Scope.prototype.computeData', function () {
	var map = new SimpleMap();
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
	var row = new SimpleMap({
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
	var me = new SimpleMap({
		name: new SimpleMap({
			first: 'Justin'
		})
	});
	var cur = new Scope(me);
	var compute = cur.computeData('name.first')
		.compute;
	var changes = 0;
	var handler =  function (ev, newVal, oldVal) {
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
	};

	compute.bind('change',handler);
	equal(compute(), 'Justin', 'read value after bind');

	me.attr('name').attr('first', 'Brian');
	me.attr('name',undefined);
	me.attr('name', {
		first: 'Payal'
	});
	me.attr('name', new SimpleMap({
		first: 'Curtis'
	}));

	compute.unbind('change',handler);
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
	var baseMap = new SimpleMap({
		me: new SimpleMap({
			name: new SimpleMap({
				first: 'Justin'
			})
		})
	});
	var base = new Scope(baseMap);
	var topMap = new SimpleMap({
		me: new SimpleMap({
			name: new SimpleMap({})
		})
	});
	var scope = base.add(topMap);
	var compute = scope.computeData('../me.name.first')
		.compute;
	compute.bind('change', function (ev, newVal, oldVal) {
		equal(oldVal, 'Justin');
		equal(newVal, 'Brian');
	});
	equal(compute(), 'Justin');
	// this should do nothing
	topMap.attr('me').attr('name').attr('first', 'Payal');
	baseMap.attr('me').attr('name').attr('first', 'Brian');
});
test('Scope read returnObserveMethods=true', function () {
	var MapConstruct = SimpleMap.extend({
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
	var baseMap = new SimpleMap({
		name: new SimpleMap({
			first: 'Justin'
		})
	});
	var scope = new Scope(baseMap);
	var compute = scope.computeData('name.first')
		.compute;
	equal(compute(), 'Justin');
	baseMap.attr('name', new SimpleMap({
		first: 'Brian'
	}));
	equal(compute(), 'Brian');
});
test('computeData reading an object with a compute', function () {
	var age = new SimpleObservable(21);

	var scope = new Scope({
		person: {
			age: age
		}
	});

	var computeData = scope.computeData('person.age');
	var value = computeData.compute();

	equal(value, 21, 'correct value');

	computeData.compute(31);
	equal(age.get(), 31, 'age updated');
});
test('computeData with initial empty compute (#638)', function () {
	expect(2);
	var c = new SimpleObservable();
	var scope = new Scope({
		compute: c
	});
	var computeData = scope.computeData('compute');
	equal(computeData.compute(), undefined);
	computeData.compute.bind('change', function (ev, newVal) {
		equal(newVal, 'compute value');
	});
	c.set('compute value');
});

test('Can read static properties on constructors (#634)', function () {
	var Foo = SimpleMap.extend( {
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
	var Foo = SimpleMap.extend({
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
			new SimpleMap({value: "A Value"})
		).add(
			current = new SimpleMap({})
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
	var comp = new SimpleObservable('Test');
	var map = new SimpleMap({
		other: new SimpleMap({
			name: "Justin"
		})
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
	equal(comp.get(), "Changed", "Compute updated");

	scope = new Scope(map);
	scope.set("other.name", "Brian");

	equal(scope.get("other.name"), "Brian", "Value updated");
	equal(map.attr("other").attr("name"), "Brian", "Name update in map");
});

testHelpers.dev.devOnlyTest("Setting a value to an attribute with an undefined parent errors (canjs/can-stache-bindings#298)", function(){
	var teardown = testHelpers.dev.willError(/Attempting to set a value at (.+) where (.+) is undefined./);

	var scope = new Scope({});
	scope.set("person.name", "Christopher");

	QUnit.equal(teardown(), 1, "saw errors");
});

test("computeData.compute get/sets computes in maps", function(){
	var cmpt = new SimpleObservable(4);
	var map = new SimpleMap();
	map.attr("computer", cmpt);

	var scope = new Scope(map);
	var computeData = scope.computeData("computer",{});

	equal( computeData.compute(), 4, "got the value");

	computeData.compute(5);
	equal(cmpt.get(), 5, "updated compute value");
	equal( computeData.compute(), 5, "the compute has the right value");
});

test("computesData can find update when initially undefined parent scope becomes defined (#579)", function(){
	expect(2);

	var map = new SimpleMap();
	var scope = new Scope(map);
	var top = scope.add(new SimpleMap());

	var computeData = top.computeData("../value",{});

	equal( computeData.compute(), undefined, "initially undefined");

	computeData.compute.bind("change", function(ev, newVal){
		equal(newVal, "first");
	});

	map.attr("value","first");


});

test("can set scope attributes with ../ (#2132)", function(){

	var map = new SimpleMap();
	var scope = new Scope(map);
	var top = scope.add(new SimpleMap());

	top.set("../foo", "bar");

	equal(map.attr("foo"), "bar");

});

test("can read parent context with ../ (#2244)", function(){
	var map = new SimpleMap();
	var scope = new Scope(map);
	var top = scope.add(new SimpleMap());

	equal( top.peek("../"), map, "looked up value correctly");

});

test("trying to read constructor from refs scope is ok", function(){
	var map = new TemplateContext();
	var construct = new Observation(function(){
		return map.constructor;
	});
	canReflect.onValue(construct, function() {});
	equal(canReflect.getValue(construct), TemplateContext);
});

test("reading from a string in a nested scope doesn't throw an error (#22)",function(){
	var foo = new SimpleObservable('foo');
	var bar = new SimpleObservable('bar');
	var scope = new Scope(foo);
	var localScope = scope.add(bar);

	equal(localScope.read('foo').value, undefined);
});

test("Optimize for compute().observableProperty (#29)", function(){
	var map = new SimpleMap({value: "a"});
	var wrap = new SimpleObservable(map);

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
			wrap.set(new SimpleMap({value: "c"}));
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

test("a compute can observe the ScopeKeyData", 3, function(){
	var map = new SimpleMap({value: "a", other: "b"});
	var wrap = new SimpleObservable(map);

	var scope = new Scope(wrap);
	var scopeKeyData = scope.computeData("value");

	var oldOnValue = scopeKeyData[canSymbol.for("can.onValue")];

	// this is called twice ... once for the "temporarilyBind",
	// another for when the compute is actually binding.
	// It might be possible to avoid temporarilyBind by giving what the handler should be
	scopeKeyData[canSymbol.for("can.onValue")] = function(){
		QUnit.ok(true, "bound on the scopeKeyData");
		return oldOnValue.apply(this, arguments);
	};

	var c = new Observation(function(){
		return scopeKeyData.get() + map.attr("other");
	});

	canReflect.onValue( c, function(newValue){
		QUnit.equal(newValue,"Ab", "observation changed");
	});

	map.attr("value","A");

});

QUnit.asyncTest("unbinding clears all event bindings", function(){
	var map = new SimpleMap({value: "a", other: "b"});
	var wrap = new SimpleObservable(map);

	var scope = new Scope(wrap);
	var scopeKeyData = scope.computeData("value");

	var c = new Observation(function(){
		return scopeKeyData.get() + map.attr("other");
	});

	var handlers = function(newValue){
		QUnit.equal(newValue,"Ab");
	};
	canReflect.onValue(c, handlers);

	canReflect.offValue(c, handlers);

	setTimeout(function () {
		var handlers = map[canSymbol.for("can.meta")].handlers.get([]);
		equal(handlers.length, 0, "there are no bindings");
		start();
	}, 30);
});

QUnit.test("computes are read as this and . and  ../", function(){
	var value = new SimpleObservable(1);
	var scope = new Scope(value);
	QUnit.equal(scope.get("this"), 1, "this read value");
	QUnit.equal(scope.get("."), 1, ". read value");
	scope = scope.add({});

	QUnit.equal(scope.get(".."), 1, ".. read value");
});

QUnit.test("computes are set as this and . and  ../", function(){
	var value = new SimpleObservable(1);
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
	var map = new SimpleObservable(new SimpleMap({value: 1}));
	var scope = new Scope(map);
	scope.set("this.value",2);
	QUnit.equal(scope.get("this.value"), 2, "this read value");
	scope.set("./value",3);
	QUnit.equal(scope.get("./value"), 3, ". read value");
});


QUnit.test("setting a key on a non observable context", function(){
	var context = {colors: new SimpleMap()};

	var scope = new Scope(context);

	scope.set("colors", {prop: "bar"});

	QUnit.deepEqual(context.colors.attr(), {prop: "bar"}, "can updateDeep");
});

QUnit.test("fast path computeData dependencies", function(assert) {
	var map = new SimpleMap({value: "a"});
	var scope = new Scope(map);
	var computeData = scope.computeData("value");
	var c = new Observation(function() {
		return computeData.get();
	});

	canReflect.onValue(c, function(){});

	var dependencies = canReflect.getValueDependencies(c);
	assert.ok(dependencies.valueDependencies.has(computeData), "compute has computeData");
	assert.equal(dependencies.valueDependencies.size, 1, "compute only has computeData");

	var computeDataDependencies = canReflect.getValueDependencies(computeData);
	assert.ok(
		!computeDataDependencies.valueDependencies,
		"the internal Observation should not be a visible dependency of computeData"
	);
	assert.ok(
		computeDataDependencies.keyDependencies.get(map).has("value"),
		"the map's 'value' property should be a dependency of computeData"
	);

	var mapValueDependencies = mutateDeps.getKeyDependencies(map, "value");
	assert.ok(
		mapValueDependencies.mutatedValueDependencies.has(computeData),
		"the computeData should be a mutation dependency of the map's 'value' property"
	);
});

QUnit.test("scopeKeyData offValue resets dependencyChange/start", function() {
	var map = new SimpleMap({value: "a", other: "b"});
	var wrap = new SimpleObservable(map);

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
	var parent = new SimpleMap();
	var map = new SimpleMap();
	var scope = new Scope(parent).add(map);
	QUnit.equal(scope.attr("./"), map);
});

QUnit.test("getTemplateContext() gives a scope with the templateContext", function() {
	var map = new SimpleMap();
	var scope = new Scope(map);

	var templateContext = scope.getTemplateContext();

	QUnit.ok(templateContext instanceof Scope, 'templateContext is a Scope');
	QUnit.ok(templateContext._context instanceof TemplateContext, 'templateContext context is a TemplateContext object');
});

QUnit.test("scope can be used to read from the templateContext", function() {
	var map = new SimpleMap();
	var scope = new Scope(map);

	QUnit.deepEqual(scope.peek("scope"), scope, "scope");

	scope.set("scope.vars.name", "Kevin");
	QUnit.equal(scope.peek("scope.vars.name"), "Kevin", "scope.vars.name === Kevin");

	var ageFn = function() { return "30"; };
	scope.set("scope.vars.age", ageFn);
	QUnit.equal(scope.peek("scope.vars.age"), "30", "scope.vars.age === 30");
});

QUnit.test("scope.index reads from special scopes", function() {
	var map1 = new SimpleMap({ index: 1 });
	var map2 = new SimpleMap({ index: 3 });
	var scope = new Scope(map1);

	QUnit.equal(scope.peek('scope.index'), undefined,
		'scope.index returns undefined if no special context exists');

	scope = scope.add({ index: 2 }, { special: true })
		.add(map2)
		.add({ index: 0 }, { special: true });

	QUnit.equal(scope.peek('scope.index'), 0, 'scope.index is read correctly');

	QUnit.equal(scope._parent.peek('scope.index'), 2, 'scope.index is only read from special contexts');
});

QUnit.test("scope.key reads from special scopes", function() {
	var map1 = new SimpleMap({ key: "one" });
	var map2 = new SimpleMap({ key: 3 });
	var scope = new Scope(map1)
		.add({ key: "two" }, { special: true })
		.add(map2)
		.add({ key: "four" }, { special: true });

	QUnit.equal(scope.peek('scope.key'), "four", 'scope.key is read correctly');

	QUnit.equal(scope._parent.peek('scope.key'), "two", 'scope.key is only read from special contexts');
});

QUnit.test("variables starting with 'scope' should not be read from templateContext (#104)", function() {
	var map = new SimpleMap({ scope1: "this is scope1" });
	var scope = new Scope(map);

	QUnit.deepEqual(scope.peek("scope1"), "this is scope1", "scope1");
});

QUnit.test("nested properties can be read from templateContext.vars", function() {
	var foo = new SimpleMap({ bar: "baz" });

	var map = new SimpleMap();
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
	var root = new SimpleMap({ bar: "baz" });

	var map = new SimpleMap();
	var scope = new Scope(map);

	QUnit.ok(!scope.peek("scope.root.bar"), "root.bar === undefined");

	scope.set("scope.root", root);
	QUnit.equal(scope.peek("scope.root.bar"), "baz", "root.bar === baz");
});

QUnit.test("special scopes are skipped if options.special !== true", function() {
	var map1 = new SimpleMap({});
	var scope = new Scope(map1)
		.add({ foo: "two" }, { special: true })
		.add({});

	QUnit.equal(scope.peek('foo', { special: true }), "two", "foo is read from special scope");
});

QUnit.test("special scopes are skipped when using ../.", function() {
	var map = new SimpleMap({ foo: "one" });
	var scope = new Scope(map)
		.add({ foo: "two" }, { special: true })
		.add({});

	QUnit.equal(scope.peek('../.'), map);
});

QUnit.test("special scopes are skipped when using .", function() {
	var map = new SimpleMap({ foo: "one" });
	var scope = new Scope(map)
		.add({ foo: "two" }, { special: true });

	QUnit.equal(scope.peek('.'), map);
});

QUnit.test("this works everywhere (#45)", function(){
	var obj = {foo: "bar"};
	var scope = new Scope(obj);
	// this.foo works
	QUnit.equal(scope.get("this.foo"),"bar");
});

QUnit.test("'this' and %context give the context", 1, function(){
	var vm;
	var MyMap = SimpleMap.extend({
		doSomething: function(){
			QUnit.equal(this, vm, "event callback called on context");
		}
	});

	vm = new MyMap();

	var compute = new Scope(vm).computeData('this.doSomething', {isArgument: true, args: []}).compute;

	compute()();

});

QUnit.test("that .set with ../ is able to skip notContext scopes (#43)", function(){
	var instance = new SimpleMap({prop: 0});
	var notContextContext = {NAME: "NOT CONTEXT"};
	var top = {NAME: "TOP"};
	var scope = new Scope(instance).add(notContextContext,{notContext: true}).add(top);


	scope.set("../prop",1);

	QUnit.equal( instance.attr("prop"), 1);
});


test("undefined props should be a scope hit (#20)", function(){

	var MyType = SimpleMap.extend("MyType",{
		init: function(){
			this.value = undefined;
		}
	});
	var EmptyType = SimpleMap.extend("EmptyType",{});

	var instance = new MyType();

	var scope = new Scope(instance).add(new EmptyType());

	var c1 = scope.computeData("../value").compute;
	c1.on("change", function(){});
	c1("BAR");

	QUnit.equal(instance.attr("value"), "BAR");

	var instance2 = new MyType();
	var scope2 = new Scope(instance2).add(new SimpleObservable());

	var c2 = scope2.computeData("../value").compute;

	c2.on("change", function(){});
	c2("BAR");

	QUnit.equal(instance2.attr("value"), "BAR");

});

QUnit.test("ScopeKeyData can.valueHasDependencies", function(){
	var map = new SimpleMap({age: 21});
	var base = new Scope(map);
	var age = base.computeData('age');


	QUnit.equal(canReflect.valueHasDependencies(age), undefined, "undefined");
	canReflect.onValue(age, function(){});

	QUnit.equal(canReflect.valueHasDependencies(age), true, "undefined");
});

QUnit.test("get and set Priority", function(){
	var map = new SimpleMap({age: 21});
	var base = new Scope(map);
	var age = base.computeData('age');

	canReflect.setPriority(age, 5);


	QUnit.equal(canReflect.getPriority(age), 5, "set priority");

	var compute = age.compute;

	QUnit.equal(canReflect.getPriority(compute), 5, "set priority");

});

QUnit.test("fast path checking does not leak ObservationRecord.adds", function(){
	// reading values in setup can cause problems ... these will
	// leak to outer scope
	var map = new SimpleMap({age: 21});
	// make getter behave like can-define
	Object.defineProperty(map,"age",{
		get: function(){
			return this.attr("age");
		},
		set: function(newVal){
			this.attr("age",newVal);
		}
	});

	var base = new Scope(map);
	var age = base.computeData('age');

	ObservationRecorder.start();
	age.get();
	var dependencies = ObservationRecorder.stop();

	QUnit.equal(dependencies.keyDependencies.size, 0, "no key dependencies");
	QUnit.equal(dependencies.valueDependencies.size, 1, "only sees age");
	QUnit.ok(dependencies.valueDependencies.has(age), "only sees age");
});

QUnit.test("{{scope.set(...)}} works", function() {
	var map = new SimpleMap({ foo: 'bar' });
	var scope = new Scope(map);

	var set = scope.peek('scope@set');

	set('foo', 'baz');
	QUnit.equal(map.get('foo'), 'baz', 'map.foo updated using scope.set');
});

QUnit.test("can read a method from scope.viewModel", function() {
	var viewModel = new SimpleMap({
		method: function() {
			return 'method return value';
		}
	});
	var scope = new Scope({})
		.add({ viewModel: viewModel }, { special: true });

	var method = scope.peek('scope.viewModel@method');

	QUnit.equal(method(), 'method return value');
});

QUnit.test("can read a value from scope.element", function() {
	var element = {
		value: 'element value'
	};
	var scope = new Scope({})
		.add({ element: element }, { special: true });

	var value = scope.peek('scope.element.value');

	QUnit.equal(value, 'element value');
});

QUnit.test("scope.find can be used to find a value in the first scope it exists", function() {
	var a = new SimpleMap({ a: "a" });
	var b = new SimpleMap({ b: "b" });
	var c = new SimpleMap({ c: "c" });

	var scope = new Scope(c)
		.add(b)
		.add(a);

	QUnit.equal(scope.find("a").value, "a", "a");
	QUnit.equal(scope.find("b").value, "b", "b");
	QUnit.equal(scope.find("c").value, "c", "c");
});

QUnit.test("scope.read should not walk up normal scopes by default", function() {
	var a = new SimpleMap({ a: "a" });
	var b = new SimpleMap({ b: "b" });
	var c = new SimpleMap({ c: "c" });

	var scope = new Scope(c)
		.add(b)
		.add(a);

	QUnit.equal(scope.read("a").value, "a", "a");
	QUnit.equal(scope.read("b").value, undefined, "b");
	QUnit.equal(scope.read("c").value, undefined, "c");
});

QUnit.test("scope.read should walk over special scopes", function() {
	var map = new SimpleMap({ a: "a", b: "b", c: "c" });

	var scope = new Scope(map)
		.add({ d: "d" }, { special: true });

	QUnit.equal(scope.read("a").value, "a", "a");
	QUnit.equal(scope.read("b").value, "b", "b");
	QUnit.equal(scope.read("c").value, "c", "c");
});

QUnit.test("scope.read should skip special contexts and read from not-context scope higher in the chain", function(){
	var scope = new Scope({ a: "a" })
		.add({ b: "b" }, { notContext: true })
		.add({ c: "c" }, { special: true })
		.add({ d: "d" }, { notContext: true })
		.add({ e: "e" });

	QUnit.equal(scope.read("a").value, undefined, "a not read from normal parent context");
	QUnit.equal(scope.read("b").value, "b", "b read correctly from notContext parent context");
	QUnit.equal(scope.read("c").value, undefined, "c not read from special context");
	QUnit.equal(scope.read("d").value, "d", "d read correctly from notContext parent context");
	QUnit.equal(scope.read("e").value, "e", "e read correctly");
});

QUnit.test("reading using ../ when there is no parent returns undefined", function() {
	var scope = new Scope({});

	try {
		QUnit.equal(scope.read('../foo').value, undefined, 'returns undefined');
	} catch(e) {
		QUnit.ok(false, 'error occured: ' + e);
	}
});

// this is for can-stache-bindings#189
// The viewModel is bound to a property that does not exist like:
// <my-component vm:value:bind="./does-not-exist">
// We need to be able to re-read this value so the `sticky` works
/*
The following has been fixed a different way
QUnit.test("unobservable reads can change", function(){
	var obj = {age: 1};
	var base = new Scope(obj);
	var age = base.computeData('age');
	canReflect.onValue(age,function(){});
	QUnit.equal(canReflect.getValue(age), 1);
	obj.age = 2;
	QUnit.equal(canReflect.getValue(age), 2);
});

QUnit.test("unobservable reads get the right value", function(){
	var obj = {age: 1};
	var base = new Scope(obj).add(new SimpleMap({}));
	var age = base.computeData('age');
	canReflect.onValue(age, function(){});
	QUnit.equal(canReflect.getValue(age), 1);
	obj.age = 2;
	QUnit.equal(canReflect.getValue(age), 2);
});
*/
