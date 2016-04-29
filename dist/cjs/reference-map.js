/*can-view-scope@3.0.0-pre.2#reference-map*/
var Construct = require('can-construct');
var canBatch = require('can-event/batch/batch');
var canEvent = require('can-event');
var assign = require('can-util/js/assign/assign');
var types = require('can-util/js/types/types');
var ObserveInfo = require('can-observe-info');
var ReferenceMap = Construct.extend('ReferenceMap', {
    setup: function () {
        this._data = {};
    },
    attr: function (prop, value) {
        if (arguments.length > 1) {
            var old = this._data[prop];
            this._data[prop] = value;
            canBatch.trigger.call(this, prop, old);
        } else {
            if (prop !== 'constructor') {
                ObserveInfo.observe(this, prop);
                return this._data[prop];
            } else {
                return this.constructor;
            }
        }
    }
});
assign(ReferenceMap.prototype, canEvent);
var oldIsMapLike = types.isMapLike;
types.isMapLike = function (obj) {
    if (obj instanceof ReferenceMap) {
        return true;
    } else {
        return oldIsMapLike.call(this, obj);
    }
};
module.exports = ReferenceMap;