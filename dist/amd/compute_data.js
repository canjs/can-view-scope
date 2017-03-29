/*can-view-scope@3.2.0-pre.0#compute_data*/
define(function (require, exports, module) {
    var Observation = require('can-observation');
    var observeReader = require('can-observation/reader');
    var makeCompute = require('can-compute');
    var types = require('can-types');
    var isFunction = require('can-util/js/is-function');
    var canReflect = require('can-reflect');
    var canSymbol = require('can-symbol');
    var getFastPathRoot = function (computeData) {
        if (computeData.reads && computeData.reads.length === 1) {
            var root = computeData.root;
            if (types.isCompute(root)) {
                root = root();
            }
            return types.isMapLike(root) && !isFunction(root[computeData.reads[0].key]) && root;
        }
        return;
    };
    var isEventObject = function (obj) {
        return obj && obj.target && typeof obj.batchNum === 'number' && obj.type;
    };
    var ScopeKeyData = function (scope, key, options) {
        this.startingScope = scope;
        this.key = key;
        this.options = options;
        this.observation = new Observation(this.read, this);
        this.handlers = [];
        this.fastPath = undefined;
        this.root = undefined;
        this.initialValue = undefined;
        this.reads = undefined;
        this.setRoot = undefined;
    };
    ScopeKeyData.prototype.getValue = function () {
        Observation.add(this);
        return this.observation.get();
    };
    ScopeKeyData.prototype.read = function () {
        if (this.root) {
            return observeReader.read(this.root, this.reads, this.options).value;
        }
        var data = this.startingScope.read(this.key, this.options);
        this.scope = data.scope;
        this.reads = data.reads;
        this.root = data.rootObserve;
        this.setRoot = data.setRoot;
        return this.initialValue = data.value;
    };
    ScopeKeyData.prototype.setValue = function (newVal) {
        var root = this.root || this.setRoot;
        if (root) {
            observeReader.write(root, this.reads, newVal, this.options);
        } else {
            this.startingScope.set(this.key, newVal, this.options);
        }
    };
    var canOnValue = canSymbol.for('can.onValue'), canOffValue = canSymbol.for('can.offValue');
    canReflect.set(ScopeKeyData.prototype, canOnValue, function (handler) {
        if (!this.handlers.length) {
            canReflect.onValue(this.observation, this.dispatch.bind(this));
            var fastPathRoot = getFastPathRoot(this);
            if (fastPathRoot) {
                var self = this, observation = this.observation;
                this.fastPath = true;
                observation.dependencyChange = function (target, newVal, altNewValue) {
                    if (isEventObject(newVal)) {
                        newVal = altNewValue;
                    }
                    if (target === fastPathRoot && typeof newVal !== 'function') {
                        this.newVal = newVal;
                    } else {
                        observation.dependencyChange = Observation.prototype.dependencyChange;
                        observation.start = Observation.prototype.start;
                        self.fastPath = false;
                    }
                    return Observation.prototype.dependencyChange.call(this, target, newVal, altNewValue);
                };
                observation.start = function () {
                    this.value = this.newVal;
                };
            }
        }
        this.handlers.push(handler);
    });
    ScopeKeyData.prototype.dispatch = function () {
        var handlers = this.handlers.slice(0);
        for (var i = 0, len = handlers.length; i < len; i++) {
            handlers[i].apply(this, arguments);
        }
    };
    canReflect.set(ScopeKeyData.prototype, canOffValue, function (handler) {
        var index = this.handlers.indexOf(handler);
        this.handlers.splice(index, 1);
    });
    canReflect.set(ScopeKeyData.prototype, canSymbol.for('can.getValue'), function (handler) {
        return this.observation.get();
    });
    canReflect.set(ScopeKeyData.prototype, canSymbol.for('can.setValue'), ScopeKeyData.prototype.getValue);
    Object.defineProperty(ScopeKeyData.prototype, 'compute', {
        get: function () {
            var scopeKeyData = this;
            var compute = makeCompute(undefined, {
                on: function (updater) {
                    scopeKeyData[canOnValue](updater);
                    this.value = scopeKeyData.observation.value;
                },
                off: function (updater) {
                    scopeKeyData[canOffValue](updater);
                },
                get: function () {
                    return scopeKeyData.observation.get();
                },
                set: function (newValue) {
                    return scopeKeyData.setValue(newValue);
                }
            });
            this.compute = compute;
            return compute;
        }
    });
    module.exports = function (scope, key, options) {
        options = options || { args: [] };
        return new ScopeKeyData(scope, key, options);
    };
});