/*can-view-scope@3.2.0-pre.4#can-view-scope*/
define(function (require, exports, module) {
    var observeReader = require('can-observation/reader');
    var Observation = require('can-observation');
    var ReferenceMap = require('./reference-map');
    var makeComputeData = require('./compute_data');
    var assign = require('can-util/js/assign');
    var each = require('can-util/js/each');
    var namespace = require('can-namespace');
    var dev = require('can-util/js/dev');
    function Scope(context, parent, meta) {
        this._context = context;
        this._parent = parent;
        this._meta = meta || {};
        this.__cache = {};
    }
    assign(Scope, {
        read: observeReader.read,
        Refs: ReferenceMap,
        refsScope: function () {
            return new Scope(new this.Refs());
        }
    });
    assign(Scope.prototype, {
        add: function (context, meta) {
            if (context !== this._context) {
                return new this.constructor(context, this, meta);
            } else {
                return this;
            }
        },
        read: function (attr, options) {
            if (attr === '%root') {
                return { value: this.getRoot() };
            }
            if (attr === '%scope') {
                return { value: this };
            }
            var isDotSlash = attr.substr(0, 2) === './', isThisDot = attr.substr(0, 5) === 'this.', isInCurrentContext = isDotSlash || isThisDot, isInParentContext = attr.substr(0, 3) === '../', isCurrentContext = attr === '.' || attr === 'this', isParentContext = attr === '..', isContextBased = isInCurrentContext || isInParentContext || isCurrentContext || isParentContext;
            if (isContextBased && this._meta.notContext) {
                return this._parent.read(attr, options);
            }
            var currentScopeOnly;
            if (isInCurrentContext) {
                currentScopeOnly = true;
                attr = isDotSlash ? attr.substr(2) : attr.substr(5);
            } else if (isInParentContext || isParentContext) {
                var parent = this._parent;
                while (parent._meta.notContext) {
                    parent = parent._parent;
                }
                if (isParentContext) {
                    return observeReader.read(parent._context, [], options);
                }
                return parent.read(attr.substr(3) || '.', options);
            } else if (isCurrentContext) {
                return observeReader.read(this._context, [], options);
            }
            var keyReads = observeReader.reads(attr);
            if (keyReads[0].key.charAt(0) === '*') {
                return this.getRefs()._read(keyReads, options, true);
            } else {
                return this._read(keyReads, options, currentScopeOnly);
            }
        },
        _read: function (keyReads, options, currentScopeOnly) {
            var currentScope = this, currentContext, undefinedObserves = [], currentObserve, currentReads, setObserveDepth = -1, currentSetReads, currentSetObserve, readOptions = assign({
                    foundObservable: function (observe, nameIndex) {
                        currentObserve = observe;
                        currentReads = keyReads.slice(nameIndex);
                    },
                    earlyExit: function (parentValue, nameIndex) {
                        if (nameIndex > setObserveDepth || nameIndex === setObserveDepth && (typeof parentValue === 'object' && keyReads[nameIndex].key in parentValue)) {
                            currentSetObserve = currentObserve;
                            currentSetReads = currentReads;
                            setObserveDepth = nameIndex;
                        }
                    }
                }, options);
            while (currentScope) {
                currentContext = currentScope._context;
                if (currentContext !== null && (typeof currentContext === 'object' || typeof currentContext === 'function')) {
                    var getObserves = Observation.trap();
                    var data = observeReader.read(currentContext, keyReads, readOptions);
                    var observes = getObserves();
                    if (data.value !== undefined) {
                        Observation.addAll(observes);
                        return {
                            scope: currentScope,
                            rootObserve: currentObserve,
                            value: data.value,
                            reads: currentReads
                        };
                    } else {
                        undefinedObserves.push.apply(undefinedObserves, observes);
                    }
                }
                if (currentScopeOnly) {
                    currentScope = null;
                } else {
                    currentScope = currentScope._parent;
                }
            }
            Observation.addAll(undefinedObserves);
            return {
                setRoot: currentSetObserve,
                reads: currentSetReads,
                value: undefined
            };
        },
        get: function (key, options) {
            options = assign({ isArgument: true }, options);
            var res = this.read(key, options);
            return res.value;
        },
        peek: Observation.ignore(function (key, options) {
            return this.get(key, options);
        }),
        peak: Observation.ignore(function (key, options) {
            return this.peek(key, options);
        }),
        getScope: function (tester) {
            var scope = this;
            while (scope) {
                if (tester(scope)) {
                    return scope;
                }
                scope = scope._parent;
            }
        },
        getContext: function (tester) {
            var res = this.getScope(tester);
            return res && res._context;
        },
        getRefs: function () {
            return this.getScope(function (scope) {
                return scope._context instanceof Scope.Refs;
            });
        },
        getRoot: function () {
            var cur = this, child = this;
            while (cur._parent) {
                child = cur;
                cur = cur._parent;
            }
            if (cur._context instanceof Scope.Refs) {
                cur = child;
            }
            return cur._context;
        },
        set: function (key, value, options) {
            var dotIndex = key.lastIndexOf('.'), slashIndex = key.lastIndexOf('/'), contextPath, propName;
            if (slashIndex > dotIndex) {
                contextPath = key.substring(0, slashIndex);
                propName = key.substring(slashIndex + 1, key.length);
            } else {
                if (dotIndex !== -1) {
                    contextPath = key.substring(0, dotIndex);
                    propName = key.substring(dotIndex + 1, key.length);
                } else {
                    contextPath = '.';
                    propName = key;
                }
            }
            if (key.charAt(0) === '*') {
                observeReader.write(this.getRefs()._context, key, value, options);
            } else {
                var context = this.read(contextPath, options).value;
                observeReader.write(context, propName, value, options);
            }
        },
        attr: Observation.ignore(function (key, value, options) {
            console.warn('can-view-scope::attr is deprecated, please use peek, get or set');
            options = assign({ isArgument: true }, options);
            if (arguments.length === 2) {
                return this.set(key, value, options);
            } else {
                return this.get(key, options);
            }
        }),
        computeData: function (key, options) {
            return makeComputeData(this, key, options);
        },
        compute: function (key, options) {
            return this.computeData(key, options).compute;
        },
        cloneFromRef: function () {
            var contexts = [];
            var scope = this, context, parent;
            while (scope) {
                context = scope._context;
                if (context instanceof Scope.Refs) {
                    parent = scope._parent;
                    break;
                }
                contexts.unshift(context);
                scope = scope._parent;
            }
            if (parent) {
                each(contexts, function (context) {
                    parent = parent.add(context);
                });
                return parent;
            } else {
                return this;
            }
        }
    });
    function Options(data, parent, meta) {
        if (!data.helpers && !data.partials && !data.tags) {
            data = { helpers: data };
        }
        Scope.call(this, data, parent, meta);
    }
    Options.prototype = new Scope();
    Options.prototype.constructor = Options;
    Scope.Options = Options;
    namespace.view = namespace.view || {};
    module.exports = namespace.view.Scope = Scope;
});