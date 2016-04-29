"use strict";
var Scope = require('can-view-scope');
var DefineMap = require('can-define/map/map');
var DefineList = require('can-define/list/list');
var observeReader = require('can-observe-info/reader/reader');
var compute = require('can-compute');

var QUnit = require('steal-qunit');

QUnit.module('can-view-scope with define');

test("basics",function(){

	var items = new DefineMap({ people: [{name: "Justin"},{name: "Brian"}], count: 1000 });

	var itemsScope = new Scope(items),
	arrayScope = new Scope(itemsScope.attr("people"), itemsScope),
	firstItem = new Scope( arrayScope.attr('0'), arrayScope );

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
	var map = new DefineMap({age: undefined});
	var base = new Scope(map);
	var age = base.computeData('age')
		.compute;
	equal(age(), undefined, 'age is not set');
	age.bind('change', function (ev, newVal, oldVal) {
		equal(newVal, 31, 'newVal is provided correctly');
		equal(oldVal, undefined, 'oldVal is undefined');
	});
	age(31);
	equal(map.age, 31, 'maps age is set correctly');
});
test('backtrack path (#163)', function () {
	var row = new DefineMap({
		first: 'Justin'
	}),
		col = {
			format: 'str'
		}, base = new Scope(row),
		cur = base.add(col);
	equal(cur.attr('.'), col, 'got col');
	equal(cur.attr('..'), row, 'got row');
	equal(cur.attr('../first'), 'Justin', 'got row');
});

test('nested properties with compute', function () {
	var me = new DefineMap({
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
	me.name.first = 'Brian';
	me.name = undefined;
	me.name = {
		first: 'Payal'
	};
	me.name = new DefineMap({
		first: 'Curtis'
	});
});

test('binds to the right scope only', 3,function () {
	var baseMap = new DefineMap({
		me: {
			name: {
				first: 'Justin'
			}
		}
	});
	var base = new Scope(baseMap);
	var topMap = new DefineMap({
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

	baseMap.me.name.first = 'Brian';
});

test('Scope read returnObserveMethods=true', function () {
	var MapConstruct = DefineMap.extend({
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
	var baseMap = new DefineMap({
		name: {
			first: 'Justin'
		}
	});
	var scope = new Scope(baseMap);
	var compute = scope.computeData('name.first')
		.compute;
	equal(compute(), 'Justin');
	baseMap.name = new DefineMap({
		first: 'Brian'
	});

	equal(compute(), 'Brian');
});


test('Can read static properties on constructors (#634)', function () {
	var Foo = DefineMap.extend( {
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
