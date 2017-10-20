var canSymbol = require("can-symbol");
var SimpleMap = require("can-simple-map");
var defineLazyValue = require("can-define-lazy-value");
var dev = require("can-log/dev/dev");

var getKeyValueSymbol = canSymbol.for("can.getKeyValue"),
	setKeyValueSymbol = canSymbol.for("can.setKeyValue");

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

	// this is a separate block to handle scope.vars.whatever
	if (key.substr(0, 5) === "vars.") {
		key = key.substr(5);
		parent = parent.vars;
	}

	return {
		key: key,
		parent: parent
	};
};

var TemplateContext = SimpleMap.extend({});

defineLazyValue(TemplateContext.prototype, "vars", function() {
	return new SimpleMap({});
});

TemplateContext.prototype[getKeyValueSymbol] = function(originalKey) {
	var keyAndParent = getKeyAndParent(this, originalKey);
	var key = keyAndParent.key;
	var parent = keyAndParent.parent;

	return SimpleMap.prototype[getKeyValueSymbol].call(parent, key);
};

TemplateContext.prototype[setKeyValueSymbol] = function(originalKey, value) {
	var keyAndParent = getKeyAndParent(this, originalKey);
	var key = keyAndParent.key;
	var parent = keyAndParent.parent || this;

	return SimpleMap.prototype[setKeyValueSymbol].call(parent, key, value);
};

module.exports = TemplateContext;
