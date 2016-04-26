/*can-view-scope@3.0.0-pre.1#compute_data*/
var ObservedInfo = require('can-observe-info');
var observeReader = require('can-observe-info/reader/reader');
var types = require('can-util/js/types/types');
var isFunction = require('can-util/js/is-function/is-function');
var isEmptyObject = require('can-util/js/is-empty-object/is-empty-object');
var makeCompute = require('can-compute');
var isFastPath = function (computeData) {
    return computeData.reads && computeData.reads.length === 1 && types.isMapLike(computeData.root) && !isFunction(computeData.root[computeData.reads[0].key]);
};
var scopeReader = function (scope, key, options, computeData, newVal) {
    if (arguments.length > 4) {
        var root = computeData.root || computeData.setRoot;
        if (root) {
            if (root.isComputed) {
                root(newVal);
            } else if (computeData.reads.length) {
                var last = computeData.reads.length - 1;
                var obj = computeData.reads.length ? observeReader.read(root, computeData.reads.slice(0, last)).value : root;
                observeReader.write(obj, computeData.reads[last].key, newVal, options);
            }
        } else {
        }
    } else {
        if (computeData.root) {
            return observeReader.read(computeData.root, computeData.reads, options).value;
        }
        var data = scope.read(key, options);
        computeData.scope = data.scope;
        computeData.initialValue = data.value;
        computeData.reads = data.reads;
        computeData.root = data.rootObserve;
        computeData.setRoot = data.setRoot;
        return data.value;
    }
};
module.exports = function (scope, key, options) {
    options = options || { args: [] };
    var computeData = {}, scopeRead = function (newVal) {
            if (arguments.length) {
                return scopeReader(scope, key, options, computeData, newVal);
            } else {
                return scopeReader(scope, key, options, computeData);
            }
        }, compute = makeCompute(undefined, {
            on: function () {
                readInfo.getValueAndBind();
                if (isFastPath(computeData)) {
                    readInfo.dependencyChange = function (ev, newVal) {
                        if (typeof newVal !== 'function') {
                            this.newVal = newVal;
                        } else {
                            readInfo.dependencyChange = ObservedInfo.prototype.dependencyChange;
                            readInfo.getValueAndBind = ObservedInfo.prototype.getValueAndBind;
                        }
                        return ObservedInfo.prototype.dependencyChange.call(this, ev);
                    };
                    readInfo.getValueAndBind = function () {
                        this.value = this.newVal;
                    };
                }
                compute.computeInstance.value = readInfo.value;
                compute.computeInstance.hasDependencies = !isEmptyObject(readInfo.newObserved);
            },
            off: function () {
                readInfo.teardown();
            },
            set: scopeRead,
            get: scopeRead,
            __selfUpdater: true
        }), readInfo = new ObservedInfo(scopeRead, null, compute.computeInstance);
    computeData.compute = compute;
    return computeData;
};