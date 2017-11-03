var SimpleMap = require("can-simple-map");
var defineLazyValue = require("can-define-lazy-value");

var TemplateContext = SimpleMap.extend({});
defineLazyValue(TemplateContext.prototype, 'vars', function() {
	return new SimpleMap({});
});

module.exports = TemplateContext;
