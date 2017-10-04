/*can-view-scope@3.3.7#reference-map*/
define([
    'require',
    'exports',
    'module',
    'can-simple-map'
], function (require, exports, module) {
    var SimpleMap = require('can-simple-map');
    var ReferenceMap = SimpleMap.extend({});
    module.exports = ReferenceMap;
});