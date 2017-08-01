require("./scope-define-test");
var Scope = require('can-view-scope');
var Map = require('can-map');
var List = require('can-list');
var observeReader = require('can-stache-key');
var compute = require('can-compute');
var ReferenceMap = require('../reference-map');
var canSymbol = require("can-symbol");

var QUnit = require('steal-qunit');
var canBatch = require("can-event/batch/batch");
var canReflect = require("can-reflect");
var Observation = require('can-observation');

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
	var map = new ReferenceMap();
	var construct = compute(function(){
		return map.attr("constructor");
	});
	construct.bind("change", function(){});
	equal(construct(), ReferenceMap);
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
		scopeRefs._read;
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
		var scopeRefs = scope.getRefs();
		scopeRefs._read;
		QUnit.ok(true, "Did not throw");
	}
	catch(e) {
		QUnit.ok(false, e.message);
	}
});
