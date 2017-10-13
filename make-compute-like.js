var singleReference = require("can-util/js/single-reference/single-reference");
var canReflect = require('can-reflect');

var Compute = function(newVal){
	if(arguments.length) {
		return this.set(newVal);
	} else {
		return this.get();
	}
};

module.exports = function(observable) {
    var compute = Compute.bind(observable);
    compute.on = compute.bind = compute.addEventListener = function(event, handler) {
        var translationHandler = function(newVal, oldVal) {
            handler.call(compute, {type:'change'}, newVal, oldVal);
        };
        singleReference.set(handler, this, translationHandler);
        observable.on(translationHandler);
    };
    compute.off = compute.unbind = compute.removeEventListener = function(event, handler) {
        observable.off( singleReference.getAndDelete(handler, this) );
    };

    canReflect.assignSymbols(compute, {
        "can.getValue": observable.get.bind(observable),
        "can.setValue": observable.set.bind(observable),
        "can.onValue": compute.on,
        "can.offValue": compute.off,
        "can.valueHasDependencies": observable.hasDependencies.bind(observable)
    });
    compute.isComputed = true;
    return compute;
};
