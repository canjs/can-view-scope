/*can-view-scope@3.0.0-pre.16#reference-map*/
define(function (require, exports, module) {
    var types = require('can-util/js/types');
    var SimpleMap = require('can-simple-map');
    var ReferenceMap = SimpleMap.extend({});
    var oldIsMapLike = types.isMapLike;
    types.isMapLike = function (obj) {
        if (obj instanceof ReferenceMap) {
            return true;
        }
        return oldIsMapLike.call(this, obj);
    };
    module.exports = ReferenceMap;
});