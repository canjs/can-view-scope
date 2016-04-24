# can-view-scope

[![Build Status](https://travis-ci.org/canjs/can-view-scope.png?branch=master)](https://travis-ci.org/canjs/can-view-scope)

Observable scopes

## Usage

### ES6 use

With StealJS, you can import this module directly in a template that is autorendered:

```js
import plugin from 'can-view-scope';
```

### CommonJS use

Use `require` to load `can-view-scope` and everything else
needed to create a template that uses `can-view-scope`:

```js
var plugin = require("can-view-scope");
```

## AMD use

Configure the `can` and `jquery` paths and the `can-view-scope` package:

```html
<script src="require.js"></script>
<script>
	require.config({
	    paths: {
	        "jquery": "node_modules/jquery/dist/jquery",
	        "can": "node_modules/canjs/dist/amd/can"
	    },
	    packages: [{
		    	name: 'can-view-scope',
		    	location: 'node_modules/can-view-scope/dist/amd',
		    	main: 'lib/can-view-scope'
	    }]
	});
	require(["main-amd"], function(){});
</script>
```

### Standalone use

Load the `global` version of the plugin:

```html
<script src='./node_modules/can-view-scope/dist/global/can-view-scope.js'></script>
```

## Contributing

### Making a Build

To make a build of the distributables into `dist/` in the cloned repository run

```
npm install
node build
```

### Running the tests

Tests can run in the browser by opening a webserver and visiting the `test.html` page.
Automated tests that run the tests from the command line in Firefox can be run with

```
npm test
```
