// # can/view/scope/scope.js
//
// This allows you to define a lookup context and parent contexts that a key's value can be retrieved from.
// If no parent scope is provided, only the scope's context will be explored for values.
var observeReader = require('can-stache-key');
var Observation = require('can-observation');
var TemplateContext = require('./template-context');
var makeComputeData = require('./compute_data');
var assign = require('can-util/js/assign/assign');
var each = require('can-util/js/each/each');
var namespace = require('can-namespace');
var canReflect = require("can-reflect");
var canLog = require('can-log/dev/dev');
var defineLazyValue = require('can-define-lazy-value');

function Scope(context, parent, meta) {
	// The obj that will be looked on for values.
	this._context = context;
	// The next Scope object whose context should be looked on for values.
	this._parent = parent;
	// If this is a special context, it can be labeled here.
	// Options are:
	// - viewModel - This is a viewModel
	// - notContext - This can't be looked within using `./` and `../`. It will be skipped.
	//   This is for virtual contexts like those used by `%index`.
	// - special - This can't be looked within using `./` and `../`. It will be skipped.
	//   This is for reading properties like {{scope.index}}.
	this._meta = meta || {};

	// A cache that can be used to store computes used to look up within this scope.
	// For example if someone creates a compute to lookup `name`, another compute does not
	// need to be created.
	this.__cache = {};
}

assign(Scope, {
	// ## Scope.read
	// Scope.read was moved to can.compute.read
	// can.compute.read reads properties from a parent.  A much more complex version of getObject.
	read: observeReader.read,
	// ## Scope.Refs
	// A Map-like object used for the references scope.
	Refs: TemplateContext,

	// ## Scope.refsScope
	// A scope with a references scope in it and no parent.
	refsScope: function() {
		return new Scope(new TemplateContext());
	},
	keyInfo: function(attr){
		var info = {};
		info.isDotSlash = attr.substr(0, 2) === './';
		info.isThisDot = attr.substr(0,5) === "this.";
		info.isThisAt = attr.substr(0,5) === "this@";
		info.isInCurrentContext = info.isDotSlash || info.isThisDot || info.isThisAt;
		info.isInParentContext = attr.substr(0, 3) === "../";
		info.isCurrentContext = attr === "." || attr === "this";
		info.isParentContext = attr === "..";
		info.isScope = attr === "scope";
		info.isInScopeVars =
			attr.substr(0, 11) === "scope.vars.";
		info.isInScope =
			info.isInScopeVars ||
			attr.substr(0, 6) === "scope." ||
			attr.substr(0, 6) === "scope@";
		info.isContextBased = info.isInCurrentContext ||
			info.isInParentContext ||
			info.isCurrentContext ||
			info.isParentContext;
		return info;
	}
});

assign(Scope.prototype, {

	// ## Scope.prototype.add
	// Creates a new scope and sets the current scope to be the parent.
	// ```
	// var scope = new can.view.Scope([
	//   {name:"Chris"},
	//   {name: "Justin"}
	// ]).add({name: "Brian"});
	// scope.attr("name") //-> "Brian"
	// ```
	add: function(context, meta) {
		if (context !== this._context) {
			return new this.constructor(context, this, meta);
		} else {
			return this;
		}
	},

	// ## Scope.prototype.find
	find: function(attr) {
		return this.read(attr, { currentScopeOnly: false });
	},

	// ## Scope.prototype.read
	// Reads from the scope chain and returns the first non-`undefined` value.
	// `read` deals mostly with setting up "context based" keys to start reading
	// from the right scope.  Once the right scope is located, `_read` is called.
	/**
	 * @hide
	 * @param {can.stache.key} attr A dot seperated path.  Use `"\."` if you have a property name that includes a dot.
	 * @param {can.view.Scope.readOptions} options that configure how this gets read.
	 * @return {{}}
	 *   @option {Object} parent the value's immediate parent
	 *   @option {can.Map|can.compute} rootObserve the first observable to read from.
	 *   @option {Array<String>} reads An array of properties that can be used to read from the rootObserve to get the value.
	 *   @option {*} value the found value
	 */
	read: function(attr, options) {
		options = options || {};

		// make `{{./}}` an alias for `{{.}}`
		if (attr === "./") {
			attr = ".";
		}

		// Identify context based keys.  Context based keys try to
		// specify a particular context a key should be within.
		var keyInfo = Scope.keyInfo(attr);

		// `notContext` contexts should be skipped if the key is "context based".
		// For example, the context that holds `%index`.
		if (keyInfo.isContextBased && (this._meta.notContext || this._meta.special)) {
			return this._parent.read(attr, options);
		}

		// If true, lookup stops after the current context.
		var currentScopeOnly = "currentScopeOnly" in options ? options.currentScopeOnly : true;

		if (keyInfo.isInCurrentContext) {
			// Stop lookup from checking parent scopes.
			// Set flag to halt lookup from walking up scope.
			currentScopeOnly = true;
			attr = keyInfo.isDotSlash ? attr.substr(2) : attr.substr(5);
		} else if ((keyInfo.isInParentContext || keyInfo.isParentContext) && this._parent) {
			// walk up until we find a parent that can have context.
			// the `isContextBased` check above won't catch it when you go from
			// `../foo` to `foo` because `foo` isn't context based.
			var parent = this._parent;
			while (parent._meta.notContext || parent._meta.special) {
				parent = parent._parent;
			}

			if (keyInfo.isParentContext) {
				return observeReader.read(parent._context, [], options);
			}

			return parent.read(attr.substr(3) || ".", options);
		} else if (keyInfo.isCurrentContext) {
			return observeReader.read(this._context, [], options);
		} else if (keyInfo.isScope) {
			return { value: this };
		}

		var keyReads = observeReader.reads(attr),
			keyRead,
			key,
			value;

		if (keyInfo.isInScope) {
			// remove the `{ key: scope }`
			keyReads = keyReads.slice(1);

			keyRead = keyReads[0];
			key = keyRead.key;

			// default to reading from Scope.prototype values
			value = this[ key ];

			// otherwise, read from templateContext
			value = typeof value !== 'undefined' ?
				value :
				this.templateContext[ key ];

			if (keyRead.at) {
				value = value.bind(this);
			}

			if (keyReads.length === 1) {
				return { value: value };
			} else if (value) {
				return observeReader.read(value, keyReads.slice(1));
			} else {
				return this.getTemplateContext()._read(keyReads);
			}
		}

		return this._read(keyReads, options, currentScopeOnly);
	},
	// ## Scope.prototype._read
	//
	_read: function(keyReads, options, currentScopeOnly) {
		// The current scope and context we are trying to find "keyReads" within.
		var currentScope = this,
			currentContext,

			// If no value can be found, this is a list of of every observed
			// object and property name to observe.
			undefinedObserves = [],

			// Tracks the first found observe.
			currentObserve,
			// Tracks the reads to get the value from `currentObserve`.
			currentReads,

			// Tracks the most likely observable to use as a setter.
			setObserveDepth = -1,
			currentSetReads,
			currentSetObserve,

			readOptions = assign({
				/* Store found observable, incase we want to set it as the rootObserve. */
				foundObservable: function(observe, nameIndex) {
					currentObserve = observe;
					currentReads = keyReads.slice(nameIndex);
				},
				earlyExit: function(parentValue, nameIndex) {
					if (nameIndex > setObserveDepth || (nameIndex === setObserveDepth && (typeof parentValue === "object" && keyReads[nameIndex].key in parentValue))) {
						currentSetObserve = currentObserve;
						currentSetReads = currentReads;
						setObserveDepth = nameIndex;
					}
				}
			}, options);

		var isRecording = Observation.isRecording();

		// Goes through each scope context provided until it finds the key (attr).  Once the key is found
		// then it's value is returned along with an observe, the current scope and reads.
		// While going through each scope context searching for the key, each observable found is returned and
		// saved so that either the observable the key is found in can be returned, or in the case the key is not
		// found in an observable the closest observable can be returned.
		while (currentScope) {
			currentContext = currentScope._context;

			// skip this if it _is_ a special context and we aren't explicitly reading special contexts
			if ((!options || options.special !== true) && currentScope._meta.special) {
				currentScope = currentScope._parent;
				continue;
			}

			// skip this if we _are_ explicitly reading special contexts and this context is _not_ special
			if (options && options.special && !currentScope._meta.special) {
				currentScope = currentScope._parent;
				continue;
			}

			if (currentContext !== null &&
				// if its a primitive type, keep looking up the scope, since there won't be any properties
				(typeof currentContext === "object" || typeof currentContext === "function")
			) {
				// Prevent computes from temporarily observing the reading of observables.
				var getObserves = Observation.trap();

				var data = observeReader.read(currentContext, keyReads, readOptions);

				// Retrieve the observes that were read.
				var observes = getObserves();
				// If a **value was was found**, return value and location data.
				if (data.value !== undefined) {

					if(!observes.length && isRecording) {
						// if we didn't actually observe anything
						// the reads and currentObserve don't mean anything
						// we just point to the current object so setting is fast
						currentObserve = data.parent;
						currentReads = keyReads.slice(keyReads.length - 1);
					} else {
						Observation.addAll(observes);
					}

					return {
						scope: currentScope,
						rootObserve: currentObserve,
						value: data.value,
						reads: currentReads
					};
				}
				// Otherwise, save all observables that were read.  If no value
				// is found, we will observe on all of them.
				else {
					undefinedObserves.push.apply(undefinedObserves, observes);
				}
			}

			var parentIsNormalContext = currentScope._parent && currentScope._parent._meta &&
				!currentScope._parent._meta.notContext && !currentScope._parent._meta.special;

			if (currentScopeOnly && parentIsNormalContext) {
				currentScope = null;
			} else {
				// Move up to the next scope.
				currentScope = currentScope._parent;
			}
		}

		// The **value was not found**, return `undefined` for the value.
		// Make sure we listen to everything we checked for when the value becomes defined.
		// Once it becomes defined, we won't have to listen to so many things.
		Observation.addAll(undefinedObserves);
		return {
			setRoot: currentSetObserve,
			reads: currentSetReads,
			value: undefined
		};
	},

	// ## Scope.prototype.get
	// Gets a value from the scope without being observable.
	get: function(key, options) {

		options = assign({
			isArgument: true
		}, options);

		var res = this.read(key, options);
		return res.value;
	},
	peek: Observation.ignore(function(key, options) {
		return this.get(key, options);
	}),
	peak: Observation.ignore(function(key, options) {
		//!steal-remove-start
		canLog.warn('peak is deprecated, please use peek instead');
		//!steal-remove-end
		return this.peek(key, options);
	}),
	// ## Scope.prototype.getScope
	// Returns the first scope that passes the `tester` function.
	getScope: function(tester) {
		var scope = this;
		while (scope) {
			if (tester(scope)) {
				return scope;
			}
			scope = scope._parent;
		}
	},
	// ## Scope.prototype.getContext
	// Returns the first context whose scope passes the `tester` function.
	getContext: function(tester) {
		var res = this.getScope(tester);
		return res && res._context;
	},
	// ## Scope.prototype.getRefs
	// Returns the first references scope.
	// Used by `.read` when looking up `*key` and by the references
	// view binding.
	getRefs: function() {
		return this.getTemplateContext();
	},
	// ## Scope.prototype.getTemplateContext
	// Returns the template context
	getTemplateContext: function() {
		var lastScope;

		// find the first reference scope
		var templateContext = this.getScope(function(scope) {
			lastScope = scope;
			return scope._context instanceof TemplateContext;
		});

		// if there is no reference scope, add one as the root
		if(!templateContext) {
			templateContext = new Scope(new TemplateContext());

			// add templateContext to root of the scope chain so it
			// can be found using `getScope` next time it is looked up
			lastScope._parent = templateContext;
		}
		return templateContext;
	},
	// ## Scope.prototype.getRoot
	// Returns the top most context that is not a references scope.
	// Used by `.read` to provide `%root`.
	getRoot: function() {
		var cur = this,
			child = this;

		while (cur._parent) {
			child = cur;
			cur = cur._parent;
		}

		if (cur._context instanceof Scope.Refs) {
			cur = child;
		}
		return cur._context;
	},

	// ## Scope.prototype.getDataForScopeSet
	// Returns an object with data needed by `.set` to figure out what to set,
	// and how.
	getDataForScopeSet: function getDataForScopeSet(key, options) {
		var keyInfo = Scope.keyInfo(key),
			parent;

		// Use `.read` to read everything upto, but not including the last property
		// name to find the object we want to set some property on.
		// For example:
		//  - `foo.bar` -> `foo`
		//  - `../foo.bar` -> `../foo`
		//  - `../foo` -> `..`
		//  - `foo` -> `.`
		if (keyInfo.isCurrentContext) {
			return { parent: this._context, how: "setValue" };
		} else if (keyInfo.isInParentContext || keyInfo.isParentContext) {
			// walk up until we find a parent that can have context.
			// the `isContextBased` check above won't catch it when you go from
			// `../foo` to `foo` because `foo` isn't context based.
			parent = this._parent;
			while (parent._meta.notContext) {
				parent = parent._parent;
			}

			if (keyInfo.isParentContext) {
				return { parent: parent._context, how: "setValue" };
			}
			// key starts with "../" or is "."
			return { how: "set", parent: parent, passOptions: true, key: key.substr(3) || "." };
		} else if (keyInfo.isInScope) {
			if (keyInfo.isInScopeVars) {
				// key starts with "scope.vars."
				return { parent: this.vars, how: "set", key: key.substr(11) };
			}

			// key starts with "scope."
			key = key.substr(6);

			if (key.indexOf(".") < 0) {
				return { parent: this.templateContext, how: "setKeyValue", key: key };
			}

			return { parent: this.getTemplateContext(), how: "set", key: key };
		}

		var dotIndex = key.lastIndexOf('.'),
			slashIndex = key.lastIndexOf('/'),
			contextPath,
			propName;

		if (slashIndex > dotIndex) {
			// ../foo
			contextPath = key.substring(0, slashIndex);
			propName = key.substring(slashIndex + 1, key.length);
		} else {
			if (dotIndex !== -1) {
				// ./foo
				contextPath = key.substring(0, dotIndex);
				propName = key.substring(dotIndex + 1, key.length);
			} else {
				// foo.bar
				contextPath = ".";
				propName = key;
			}
		}

		var context = this.read(contextPath, options).value;
		if (context === undefined) {
			return {
				error: "Attempting to set a value at " +
					key + " where " + contextPath + " is undefined."
			};
		}

		if(!canReflect.isObservableLike(context) && canReflect.isObservableLike(context[propName])) {
			if(canReflect.isMapLike(context[propName])) {
				return {
					parent: context,
					key: propName,
					how: "updateDeep",
					warn: "can-view-scope: Merging data into \"" +
						propName + "\" because its parent is non-observable"
				};
			}
			else if(canReflect.isValueLike(context[propName])){
				return { parent: context, key: propName, how: "setValue" };
			} else {
				return { parent: context, how: "write", key: propName, passOptions: true };
			}
		} else {
			return { parent: context, how: "write", key: propName, passOptions: true };
		}
	},

	set: function(key, value, options) {
		options = options || {};

		var data = this.getDataForScopeSet(key, options);
		var parent = data.parent;

		//!steal-remove-start
		if (data.error) {
			return canLog.error(data.error);
		}
		//!steal-remove-end

		if (data.warn) {
			canLog.warn(data.warn);
		}

		switch (data.how) {
			case "set":
				parent.set(data.key, value, data.passOptions ? options : undefined);
				break;

			case "write":
				observeReader.write(parent, data.key, value, options);
				break;

			case "setValue":
				canReflect.setValue("key" in data ? parent[data.key] : parent, value);
				break;

			case "setKeyValue":
				canReflect.setKeyValue(parent, data.key, value);
				break;

			case "updateDeep":
				canReflect.updateDeep(parent[data.key], value);
				break;
		}
	},

	// ## Scope.prototype.attr
	// Gets or sets a value in the scope without being observable.
	attr: Observation.ignore(function(key, value, options) {
		canLog.warn("can-view-scope::attr is deprecated, please use peek, get or set");

		options = assign({
			isArgument: true
		}, options);

		// Allow setting a value on the context
		if (arguments.length === 2) {
			return this.set(key, value, options);

		} else {
			return this.get(key, options);
		}
	}),

	// ## Scope.prototype.computeData
	// Finds the first location of the key in the scope and then provides a get-set compute that represents the key's value
	// and other information about where the value was found.
	computeData: function(key, options) {
		return makeComputeData(this, key, options);
	},

	// ## Scope.prototype.compute
	// Provides a get-set compute that represents a key's value.
	compute: function(key, options) {
		return this.computeData(key, options)
			.compute;
	},
	// ## Scope.prototype.cloneFromRef
	//
	// This takes a scope and essentially copies its chain from
	// right before the last Refs.  And it does not include the ref.
	// this is a helper function to provide lexical semantics for refs.
	// This will not be needed for leakScope: false.
	cloneFromRef: function() {
		var contexts = [];
		var scope = this,
			context,
			parent;
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
			each(contexts, function(context) {
				parent = parent.add(context);
			});
			return parent;
		} else {
			return this;
		}
	}
});

defineLazyValue(Scope.prototype, 'templateContext', function() {
	return this.getTemplateContext()._context;
});

defineLazyValue(Scope.prototype, 'vars', function() {
	return this.templateContext.vars;
});

var specialKeywords = [
	'index', 'key', 'element',
	'event', 'viewModel','arguments'
];

var readFromSpecialContexts = function(key) {
	return function() {
		return this._read(
			[{ key: key, at: false }],
			{ special: true }
		).value;
	};
};

specialKeywords.forEach(function(key) {
	Object.defineProperty(Scope.prototype, key, {
		get: readFromSpecialContexts(key)
	});
});

function Options(data, parent, meta) {
	if (!data.helpers && !data.partials && !data.tags) {
		data = {
			helpers: data
		};
	}
	Scope.call(this, data, parent, meta);
}
Options.prototype = new Scope();
Options.prototype.constructor = Options;

Scope.Options = Options;

namespace.view = namespace.view || {};
module.exports = namespace.view.Scope = Scope;
