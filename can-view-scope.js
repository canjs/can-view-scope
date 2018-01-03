// # can/view/scope/scope.js
//
// This allows you to define a lookup context and parent contexts that a key's value can be retrieved from.
// If no parent scope is provided, only the scope's context will be explored for values.
var observeReader = require('can-stache-key');
var ObservationRecorder = require("can-observation-recorder");
var TemplateContext = require('./template-context');
var makeComputeData = require('./compute_data');
var assign = require('can-assign');
var each = require('can-util/js/each/each');
var namespace = require('can-namespace');
var canReflect = require("can-reflect");
var canLog = require('can-log/dev/dev');
var defineLazyValue = require('can-define-lazy-value');
var stacheHelpers = require('can-stache-helpers');

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
	// can.compute.read reads properties from a parent. A much more complex version of getObject.
	read: observeReader.read,

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
		info.isInScope =
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
	find: function(attr, options) {
		return this.get(attr, assign({ currentScopeOnly: false }, options));
	},

	// ## Scope.prototype.read
	// Reads from the scope chain and returns the first non-`undefined` value.
	// `read` deals mostly with setting up "context based" keys to start reading
	// from the right scope. Once the right scope is located, `_read` is called.
	/**
	 * @hide
	 * @param {can.stache.key} attr A dot-separated path. Use `"\."` if you have a property name that includes a dot.
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

		// Identify context based keys. Context based keys try to
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

			var parentValue = parent.read(attr.substr(3) || ".", options);

			return assign( parentValue, {
				thisArg: parentValue.thisArg || parent._context
			});
		} else if (keyInfo.isCurrentContext) {
			return observeReader.read(this._context, [], options);
		} else if (keyInfo.isScope) {
			return { value: this };
		}

		var keyReads = observeReader.reads(attr);
		var readValue;

		if (keyInfo.isInScope) {
			// check for a value on Scope.prototype
			readValue = observeReader.read(this, keyReads.slice(1), options);

			// otherwise, check the templateContext
			if (typeof readValue.value === 'undefined') {
				readValue = this.readFromTemplateContext(attr.slice(6), options);
			}

			return assign(readValue, {
				thisArg: keyReads.length > 1 ? readValue.parent : undefined
			});
		}

		return this._read(keyReads, options, currentScopeOnly);
	},

	// ## Scope.prototype.readFromSpecialContext
	readFromSpecialContext: function(key) {
		return this._read(
			[{key: key, at: false }],
			{ special: true }
		);
	},

	// ## Scope.prototype.readFromTemplateContext
	readFromTemplateContext: function(key, readOptions) {
		var keyReads = observeReader.reads(key);
		return observeReader.read(this.templateContext, keyReads, readOptions);
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

		var isRecording = ObservationRecorder.isRecording();

		// Goes through each scope context provided until it finds the key (attr). Once the key is found
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
				var getObserves = ObservationRecorder.trap();

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
						ObservationRecorder.addMany(observes);
					}

					return {
						scope: currentScope,
						rootObserve: currentObserve,
						value: data.value,
						reads: currentReads,
						thisArg: keyReads.length > 1 ? data.parent : undefined
					};
				}
				// Otherwise, save all observables that were read. If no value
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

		// The **value was not found** in the scope
		// if not looking for a "special" key, check in can-stache-helpers
		if (!(options && options.special)) {
			var helper = this.getHelper(keyReads);

			if (helper && helper.value) {
				return helper;
			}
		}

		// The **value was not found**, return `undefined` for the value.
		// Make sure we listen to everything we checked for when the value becomes defined.
		// Once it becomes defined, we won't have to listen to so many things.
		ObservationRecorder.addMany(undefinedObserves);
		return {
			setRoot: currentSetObserve,
			reads: currentSetReads,
			value: undefined
		};
	},

	// ## Scope.prototype.getHelper
	// read a helper from the templateContext or global helpers list
	getHelper: function(keyReads) {
		var helper = observeReader.read(this.templateContext.helpers, keyReads, { proxyMethods: false });

		if (!helper || !helper.value) {
			helper = observeReader.read(stacheHelpers, keyReads, { proxyMethods: false });
		}

		return helper;
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
	peek: ObservationRecorder.ignore(function(key, options) {
		return this.get(key, options);
	}),
	peak: ObservationRecorder.ignore(function(key, options) {
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

		if (cur._context instanceof TemplateContext) {
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
	attr: ObservationRecorder.ignore(function(key, value, options) {
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
	// right before the last TemplateContext. And it does not include the ref.
	// this is a helper function to provide lexical semantics for refs.
	// This will not be needed for leakScope: false.
	cloneFromRef: function() {
		var contexts = [];
		var scope = this,
			context,
			parent;
		while (scope) {
			context = scope._context;
			if (context instanceof TemplateContext) {
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

var templateContextPrimitives = [
	"filename", "lineNumber"
];

// create getters/setters for primitives on the templateContext
// scope.filename -> scope.readFromTemplateContext("filename")
templateContextPrimitives.forEach(function(key) {
	Object.defineProperty(Scope.prototype, key, {
		get: function() {
			return this.readFromTemplateContext(key).value;
		},
		set: function(val) {
			this.templateContext[key] = val;
		}
	});
});

defineLazyValue(Scope.prototype, 'templateContext', function() {
	return this.getTemplateContext()._context;
});

defineLazyValue(Scope.prototype, 'root', function() {
	return this.getRoot();
});

defineLazyValue(Scope.prototype, 'helpers', function() {
	return stacheHelpers;
});

var specialKeywords = [
	'index', 'key', 'element',
	'event', 'viewModel','arguments',
	'helperOptions'
];

// create getters for "special" keys
// scope.index -> scope.readFromSpecialContext("index")
specialKeywords.forEach(function(key) {
	Object.defineProperty(Scope.prototype, key, {
		get: function() {
			return this.readFromSpecialContext(key).value;
		}
	});
});

namespace.view = namespace.view || {};
module.exports = namespace.view.Scope = Scope;
