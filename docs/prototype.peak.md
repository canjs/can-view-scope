@function can-view-scope.prototype.peak peak
@parent can-view-scope.prototype

Read a value from the scope without being observable.

@signature `scope.peak(key [, options])`

Works just like [can-view-scope.prototype.get], but prevents any calls to [can-observation.add].


Walks up the scope to find a value at `key`.  Stops at the first context where `key` has
a value.

```js
scope.peak("first.name");
```

@param {can-stache.key} key A dot seperated path.  Use `"\."` if you have a
property name that includes a dot.

@return {*} The found value or undefined if no value is found.

@body

## Use

`scope.peak(key)` looks up a value in the current scope's
context, if a value is not found, parent scope's context
will be explored.

    var list = [{name: "Justin"},{name: "Brian"}],
        justin = list[0];

    var curScope = new Scope(list).add(justin);

    curScope.peak("name"); //-> "Justin"
    curScope.peak("length"); //-> 2