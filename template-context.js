var canSymbol = require("can-symbol");
var SimpleMap = require("can-simple-map");
var defineLazyValue = require("can-define-lazy-value");
var dev = require("can-log/dev/dev");

var getKeyValueSymbol = canSymbol.for("can.getKeyValue"),
	setKeyValueSymbol = canSymbol.for("can.setKeyValue");

// these values are context-specific, so should not be observable
// if they were observable, {{scope.index}} would display the last value
// for each item in a loop
var nonObservableVars = {
	index: true,
	key: true,
	element: true,
	event: true,
	viewModel: true,
	arguments: true
};

var getKeyAndParent = function(parent, key) {
	if (key.substr(0, 6) === "scope.") {
		key = key.substr(6);
		parent = parent;
	} else if (key === "*self") {
		key = "view";
		parent = parent;

		//!steal-remove-start
		dev.warn("{{>*self}} is deprecated. Use {{>scope.view}} instead.");
		//!steal-remove-end
	} else if (key.substr(0, 1) === "*") {
		key = key.substr(1);
		parent = parent.vars;

		//!steal-remove-start
		dev.warn("{{*" + key + "}} is deprecated. Use {{scope.vars." + key + "}} instead.");
		//!steal-remove-end
	}

	if (nonObservableVars[key]) {
		parent = parent.nonObservableVars;
	}

	if (key.substr(0, 5) === "vars.") {
		key = key.substr(5);
		parent = parent.vars;
	}

	return {
		key: key,
		parent: parent
	};
};

var TemplateContext = SimpleMap.extend("TemplateContext", {});

defineLazyValue(TemplateContext.prototype, "vars", function() {
	return new SimpleMap({});
});

defineLazyValue(TemplateContext.prototype, "nonObservableVars", function() {
	return {};
});

TemplateContext.prototype[getKeyValueSymbol] = function(originalKey) {
	var keyAndParent = getKeyAndParent(this, originalKey);
	var key = keyAndParent.key;
	var parent = keyAndParent.parent;

	if (parent instanceof SimpleMap) {
		return SimpleMap.prototype[getKeyValueSymbol].call(parent, key);
	} else {
		return parent[key];
	}
};

TemplateContext.prototype[setKeyValueSymbol] = function(originalKey, value) {
	var keyAndParent = getKeyAndParent(this, originalKey);
	var key = keyAndParent.key;
	var parent = keyAndParent.parent || this;

	if (parent instanceof SimpleMap) {
		return SimpleMap.prototype[setKeyValueSymbol].call(parent, key, value);
	} else {
		return parent[key] = value;
	}
};

module.exports = TemplateContext;
