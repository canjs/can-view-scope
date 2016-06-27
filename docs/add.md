@function can-view-scope.add add

@signature `scope.add(context)`

Add an object (which could be another Scope, a Map, or a plain object) to the scope.

```js
var scope = new Scope({ foo: "bar" }).add({ baz: "qux" });

scope.attr("baz"); // -> "qux"
```

@param {*} context The context of the new scope object.

@return {can-view-scope}  A scope object.

@body

## Use

`scope.add(context)` creates a new scope object that
first looks up values in context and then in the
parent `scope` object.

    var list = [{name: "Justin"},{name: "Brian"}],
        justin = list[0];

    var curScope = new Scope(list).add(justin);

    curScope.attr("name") //-> "Justin"
    curScope.attr("length") //-> 2
