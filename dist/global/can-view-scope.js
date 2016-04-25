/*[global-shim-start]*/
(function(exports, global, doEval){ // jshint ignore:line
	var origDefine = global.define;

	var get = function(name){
		var parts = name.split("."),
			cur = global,
			i;
		for(i = 0 ; i < parts.length; i++){
			if(!cur) {
				break;
			}
			cur = cur[parts[i]];
		}
		return cur;
	};
	var modules = (global.define && global.define.modules) ||
		(global._define && global._define.modules) || {};
	var ourDefine = global.define = function(moduleName, deps, callback){
		var module;
		if(typeof deps === "function") {
			callback = deps;
			deps = [];
		}
		var args = [],
			i;
		for(i =0; i < deps.length; i++) {
			args.push( exports[deps[i]] ? get(exports[deps[i]]) : ( modules[deps[i]] || get(deps[i]) )  );
		}
		// CJS has no dependencies but 3 callback arguments
		if(!deps.length && callback.length) {
			module = { exports: {} };
			var require = function(name) {
				return exports[name] ? get(exports[name]) : modules[name];
			};
			args.push(require, module.exports, module);
		}
		// Babel uses the exports and module object.
		else if(!args[0] && deps[0] === "exports") {
			module = { exports: {} };
			args[0] = module.exports;
			if(deps[1] === "module") {
				args[1] = module;
			}
		} else if(!args[0] && deps[0] === "module") {
			args[0] = { id: moduleName };
		}

		global.define = origDefine;
		var result = callback ? callback.apply(null, args) : undefined;
		global.define = ourDefine;

		// Favor CJS module.exports over the return value
		modules[moduleName] = module && module.exports ? module.exports : result;
	};
	global.define.orig = origDefine;
	global.define.modules = modules;
	global.define.amd = true;
	ourDefine("@loader", [], function(){
		// shim for @@global-helpers
		var noop = function(){};
		return {
			get: function(){
				return { prepareGlobal: noop, retrieveGlobal: noop };
			},
			global: global,
			__exec: function(__load){
				doEval(__load.source, global);
			}
		};
	});
}
)({},window,function(__$source__, __$global__) { // jshint ignore:line
	eval("(function() { " + __$source__ + " \n }).call(__$global__);");
}
)
/*can-view-scope@3.0.0-pre.0#compute_data*/
define('can-view-scope/compute_data', function (require, exports, module) {
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
});
/*can-view-scope@3.0.0-pre.0#can-view-scope*/
define('can-view-scope', function (require, exports, module) {
    var observeReader = require('can-observe-info/reader/reader');
    var ObserveInfo = require('can-observe-info');
    var Map = require('can-map');
    var makeComputeData = require('can-view-scope/compute_data');
    var assign = require('can-util/js/assign/assign');
    var each = require('can-util/js/each/each');
    function Scope(context, parent, meta) {
        this._context = context;
        this._parent = parent;
        this._meta = meta || {};
        this.__cache = {};
    }
    assign(Scope, {
        read: observeReader.read,
        Refs: Map.extend({ shortName: 'ReferenceMap' }, {}),
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
            var isInCurrentContext = attr.substr(0, 2) === './', isInParentContext = attr.substr(0, 3) === '../', isCurrentContext = attr === '.' || attr === 'this', isParentContext = attr === '..', isContextBased = isInCurrentContext || isInParentContext || isCurrentContext || isParentContext;
            if (isContextBased && this._meta.notContext) {
                return this._parent.read(attr, options);
            }
            var currentScopeOnly;
            if (isInCurrentContext) {
                currentScopeOnly = true;
                attr = attr.substr(2);
            } else if (isInParentContext) {
                var parent = this._parent;
                while (parent._meta.notContext) {
                    parent = parent._parent;
                }
                return parent.read(attr.substr(3) || '.', options);
            } else if (isCurrentContext) {
                return { value: this._context };
            } else if (isParentContext) {
                return { value: this._parent._context };
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
                        if (nameIndex > setObserveDepth) {
                            currentSetObserve = currentObserve;
                            currentSetReads = currentReads;
                            setObserveDepth = nameIndex;
                        }
                    }
                }, options);
            while (currentScope) {
                currentContext = currentScope._context;
                if (currentContext !== null && (typeof currentContext === 'object' || typeof currentContext === 'function')) {
                    var getObserves = ObserveInfo.trap();
                    var data = observeReader.read(currentContext, keyReads, readOptions);
                    var observes = getObserves();
                    if (data.value !== undefined) {
                        ObserveInfo.observes(observes);
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
            ObserveInfo.observes(undefinedObserves);
            return {
                setRoot: currentSetObserve,
                reads: currentSetReads,
                value: undefined
            };
        },
        get: ObserveInfo.notObserve(function (key, options) {
            options = assign({ isArgument: true }, options);
            var res = this.read(key, options);
            return res.value;
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
                observeReader.set(this.getRefs()._context, key, value, options);
            } else {
                var context = this.read(contextPath, options).value;
                observeReader.write(context, propName, value, options);
            }
        },
        attr: ObserveInfo.notObserve(function (key, value, options) {
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
    module.exports = Scope;
});
/*[global-shim-end]*/
(function(){ // jshint ignore:line
	window._define = window.define;
	window.define = window.define.orig;
}
)();