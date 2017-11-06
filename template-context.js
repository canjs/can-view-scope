var SimpleMap = require("can-simple-map");

var TemplateContext = function() {
	this.vars = new SimpleMap({});
};

module.exports = TemplateContext;
