/*can-view-scope@3.5.7#can-view-scope*/
define([
    'require',
    'exports',
    'module',
    'can-stache-key',
    'can-observation',
    './template-context',
    './compute_data',
    'can-util/js/assign',
    'can-util/js/each',
    'can-namespace',
    'can-reflect',
    'can-log/dev',
    'can-define-lazy-value'
], function (require, exports, module) {
    var observeReader = require('can-stache-key');
    var Observation = require('can-observation');
    var TemplateContext = require('./template-context');
    var makeComputeData = require('./compute_data');
    var assign = require('can-util/js/assign');
    var each = require('can-util/js/each');
    var namespace = require('can-namespace');
    var canReflect = require('can-reflect');
    var canLog = require('can-log/dev');
    var defineLazyValue = require('can-define-lazy-value');
    var specialKeywords = {
        index: true,
        key: true,
        element: true,
        event: true,
        viewModel: true,
        arguments: true
    };
    function Scope(context, parent, meta) {
        this._context = context;
        this._parent = parent;
        this._meta = meta || {};
        this.__cache = {};
    }
    assign(Scope, {
        read: observeReader.read,
        Refs: TemplateContext,
        refsScope: function () {
            return new Scope(new TemplateContext());
        },
        keyInfo: function (attr) {
            var info = {};
            info.isDotSlash = attr.substr(0, 2) === './';
            info.isThisDot = attr.substr(0, 5) === 'this.';
            info.isThisAt = attr.substr(0, 5) === 'this@';
            info.isInCurrentContext = info.isDotSlash || info.isThisDot || info.isThisAt;
            info.isInParentContext = attr.substr(0, 3) === '../';
            info.isCurrentContext = attr === '.' || attr === 'this';
            info.isParentContext = attr === '..';
            info.isScope = attr === 'scope';
            info.isLegacyView = attr === '*self';
            info.isInLegacyRefsScope = info.isLegacyView || attr.substr(0, 1) === '*' || attr.substr(0, 2) === '@*';
            info.isInTemplateContextVars = info.isInLegacyRefsScope || attr.substr(0, 11) === 'scope.vars.';
            info.isInTemplateContext = info.isInTemplateContextVars || attr.substr(0, 6) === 'scope.';
            info.isContextBased = info.isInCurrentContext || info.isInParentContext || info.isCurrentContext || info.isParentContext;
            return info;
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
            if (attr === './') {
                attr = '.';
            }
            var keyInfo = Scope.keyInfo(attr);
            if (keyInfo.isContextBased && (this._meta.notContext || this._meta.special)) {
                return this._parent.read(attr, options);
            }
            var currentScopeOnly;
            if (keyInfo.isInCurrentContext) {
                currentScopeOnly = true;
                attr = keyInfo.isDotSlash ? attr.substr(2) : attr.substr(5);
            } else if (keyInfo.isInParentContext || keyInfo.isParentContext) {
                var parent = this._parent;
                while (parent._meta.notContext || parent._meta.special) {
                    parent = parent._parent;
                }
                if (keyInfo.isParentContext) {
                    return observeReader.read(parent._context, [], options);
                }
                return parent.read(attr.substr(3) || '.', options);
            } else if (keyInfo.isCurrentContext) {
                return observeReader.read(this._context, [], options);
            } else if (keyInfo.isScope) {
                return { value: this };
            }
            var keyReads = observeReader.reads(attr);
            if (keyInfo.isInTemplateContext) {
                if (keyInfo.isInLegacyRefsScope) {
                    if (keyInfo.isLegacyView) {
                        keyReads[0].key = 'view';
                    } else {
                        keyReads[0] = {
                            key: keyReads[0].key.substr(1),
                            at: true
                        };
                        keyReads.unshift({ key: 'vars' });
                    }
                } else {
                    keyReads = keyReads.slice(1);
                }
                if (specialKeywords[keyReads[0].key]) {
                    return this._read(keyReads, { special: true });
                }
                if (keyReads.length === 1) {
                    return { value: this.templateContext[keyReads[0].key] };
                }
                return this.getTemplateContext()._read(keyReads);
            }
            return this._read(keyReads, options, currentScopeOnly);
        },
        _read: function (keyReads, options, currentScopeOnly) {
            var currentScope = this, currentContext, undefinedObserves = [], currentObserve, currentReads, setObserveDepth = -1, currentSetReads, currentSetObserve, ignoreSpecialContexts, ignoreNonSpecialContexts, readOptions = assign({
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
                ignoreNonSpecialContexts = options && options.special && !currentScope._meta.special;
                ignoreSpecialContexts = (!options || options.special !== true) && currentScope._meta.special;
                if (currentContext !== null && (typeof currentContext === 'object' || typeof currentContext === 'function') && !ignoreNonSpecialContexts && !ignoreSpecialContexts) {
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
            return this.getTemplateContext();
        },
        getTemplateContext: function () {
            var lastScope;
            var templateContext = this.getScope(function (scope) {
                lastScope = scope;
                return scope._context instanceof TemplateContext;
            });
            if (!templateContext) {
                templateContext = new Scope(new TemplateContext());
                lastScope._parent = templateContext;
            }
            return templateContext;
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
            options = options || {};
            var keyInfo = Scope.keyInfo(key), parent;
            if (keyInfo.isCurrentContext) {
                return canReflect.setValue(this._context, value);
            } else if (keyInfo.isInParentContext || keyInfo.isParentContext) {
                parent = this._parent;
                while (parent._meta.notContext) {
                    parent = parent._parent;
                }
                if (keyInfo.isParentContext) {
                    return canReflect.setValue(parent._context, value);
                }
                return parent.set(key.substr(3) || '.', value, options);
            } else if (keyInfo.isInTemplateContext) {
                if (keyInfo.isInLegacyRefsScope) {
                    return this.vars.set(key.substr(1), value);
                }
                if (keyInfo.isInTemplateContextVars) {
                    return this.vars.set(key.substr(11), value);
                }
                key = key.substr(6);
                if (key.indexOf('.') < 0) {
                    return this.templateContext[key] = value;
                }
                return this.getTemplateContext().set(key, value);
            }
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
            var context = this.read(contextPath, options).value;
            if (context === undefined) {
                return;
            }
            if (!canReflect.isObservableLike(context) && canReflect.isObservableLike(context[propName])) {
                if (canReflect.isMapLike(context[propName])) {
                    canLog.warn('can-view-scope: Merging data into "' + propName + '" because its parent is non-observable');
                    canReflect.updateDeep(context[propName], value);
                } else if (canReflect.isValueLike(context[propName])) {
                    canReflect.setValue(context[propName], value);
                } else {
                    observeReader.write(context, propName, value, options);
                }
            } else {
                observeReader.write(context, propName, value, options);
            }
        },
        attr: Observation.ignore(function (key, value, options) {
            canLog.warn('can-view-scope::attr is deprecated, please use peek, get or set');
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
    defineLazyValue(Scope.prototype, 'templateContext', function () {
        return this.getTemplateContext()._context;
    });
    defineLazyValue(Scope.prototype, 'vars', function () {
        return this.templateContext.vars;
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