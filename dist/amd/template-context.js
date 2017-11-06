/*can-view-scope@3.5.3#template-context*/
define([
    'require',
    'exports',
    'module',
    'can-simple-map'
], function (require, exports, module) {
    var SimpleMap = require('can-simple-map');
    var TemplateContext = function () {
        this.vars = new SimpleMap({});
    };
    module.exports = TemplateContext;
});