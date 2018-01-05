var SimpleMap = require("can-simple-map");

var TemplateContext = function() {
	this.vars = new SimpleMap({});
	this.helpers = new SimpleMap({});
	this.partials = new SimpleMap({});
	this.tags = new SimpleMap({});
	this.letVariables = new SimpleMap({});
};

module.exports = TemplateContext;
