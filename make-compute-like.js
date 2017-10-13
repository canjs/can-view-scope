var singleReference = require("can-util/js/single-reference/single-reference");
var canReflect = require('can-reflect');

var Compute = function(newVal){
	if(arguments.length) {
		return canReflect.setValue(this, newVal);
	} else {
		return canReflect.getValue(this);
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
        "can.getValue": function(){
            return canReflect.getValue(observable);
        },
        "can.setValue": function(){
            return canReflect.setValue(observable);
        },
        "can.onValue": function(){
            return canReflect.onValue(observable);
        },
        "can.offValue": function(){
            return canReflect.offValue(observable);
        },
        "can.valueHasDependencies": function(){
            return canReflect.valueHasDependencies(observable);
        }
    });
    compute.isComputed = true;
    return compute;
};
