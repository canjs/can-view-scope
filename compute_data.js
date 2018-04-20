"use strict";

var ScopeKeyData = require('./scope-key-data');

var scopeKeyDataCache = new WeakMap();

module.exports = function(scope, key, options) {
	var scopeCache = scopeKeyDataCache.get(scope);

	if (!scopeCache) {
		scopeCache = {};
		scopeKeyDataCache.set(scope, scopeCache);
	}

	var existingComputeData = scopeCache[key];

	if (existingComputeData) {
		return existingComputeData;
	} else {
		var newComputeData = new ScopeKeyData(scope, key, options || {
			args: []
		});

		scopeCache[key] = newComputeData;

		return newComputeData;
	}
};
