var SimpleMap = require("can-simple-map");

var TemplateContext = function() {
	this.vars = new SimpleMap({});
	this.partials = new SimpleMap({});
};

module.exports = TemplateContext;
