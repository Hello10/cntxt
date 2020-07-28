# cntxt

[![Build Status](https://api.travis-ci.org/Hello10/cntxt.svg)](https://travis-ci.org/github/hello10/cntxt)
[![NPM version](https://badge.fury.io/js/cntxt.png)](https://www.npmjs.com/package/cntxt)

Context for executing and accumulating data through a function pipeline.

## Index
* [Latest Version](#latest-version)
* [Installation](#installation)
* [Usage](#usage)
* [Example](#example)

## Latest Versions

5.3.0

## Installation
```
npm install --save cntxt
```

```
yarn add --exact cntxt
```

## Usage

### Constructor
A context instance can be created via its constructor and then run by passing an array of pipeline steps to the `.run` method which returns a promise that resolves or rejects appropriately after all the steps are either successfully run, an error is thrown, or a given step short-circuits execution via `.succeed`, `.throw`, or `.fail`.
```js
let context = new Context({
  overwrite: false,
  data: {
    wow: 9
  }
});

function a (context) {
  context.next({hello: 10});
}

function b (context) {
  context.next({barf: 11});
}

function c (context) {
  context.next({honk: 12});
}

context.run([
  a,
  [b, c] // these steps will be run in parallel
]).then((context)=> {
  let {wow, hello} = context.data;
  Assert.deepEqual(data, {
    wow: 9,
    hello: 10,
    barf: 11,
    honk: 12
  });
});
```

### Context.series, Context.parallel
The shorthand method of using nested arrays above for parallel steps is limited to single level nesting so as to avoid readability issues. These factory methods can be used for building more complicated pipelines.
```js
Context.series([
  stepA,
  stepB,
  Context.parallel([
    stepC1,
    stepC2,
    stepC2
  ]),
  Context.parallel([
    Context.series([
      stepD1,
      stepD2
    ]),
    stepE
  ]),
  stepF
])
```

### Context.runSeries, Context.runParallel
If configuration via the constructor isn't needed, the static `.runSeries` and `.runParallel` methods can be used directly to instantiate a context and run it in series or parallel respectively. A completion callback can be passed as an optional second argument.  It can either accept a single context argument, or node-style `(error, data)` arguments. If the callback is omitted, a promise is returned.
```js
// A. callback: (context)
Context.runSeries([
  function (context) {
    context.next({hello: 10});
  }
], function (context)=> {
  Assert(!context.errored());
  Assert.equal(context.data.hello, 10);
});

// B. callback: (error, data)
Context.runSeries([
  function (context) {
    context.next({hello: 10});
  }
], function (error, data)=> {
  Assert(!error);
  Assert.equal(data.hello, 10);
});

// C. promise
Context.runParallel([
  function (context) {
    context.next({hello: 10});
  },
  function (context) {
    context.next({goodbye: 11});
  }
]).then((context)=> {
  Assert.equal(context.data.hello, 10);
  Assert.equal(context.data.goodbye, 11);
});
```

### Steps
Individual pipeline steps should be in one of the following forms
```js
// A. A function that accepts a single context argument which has a
//    data attribute consisting of accumulated data from previous
//    steps and also used for flow control via the following
//    methods: .next, .fail, .error, .succeed
function contextStep (context) {
  context.next({more: 'data'});
}

// B. A function that accepts data and callback as arguments. data holds the
//    context's accumulated data and the callback is node style, and accepts
//    two arguments: (error, data_to_add)
function callbackStep (data, callback) {
  callback(null, {more: 'data'});
}

// C. A promise. When the promise resolves, the resulting value should be an
//    object with data to add to the context's accumulated data
let promiseStep = new Promise((reject, resolve)=> {
  resolve({more: 'data'});
});
```

### Context control flow
The context object has four methods used for control flow

#### `.next(data)`
Called within a step in order to advance to the next step and add `data`, which should be an object, to the context's accumulated data.
```js
Context.runSeries([
  function (context) {
    context.next({more: 'filling'});
  }
]).then((context)=> {
  Assert.equal(context.data.more, 'filling');
});
```

Promises passed as data values to `context.next` will be set to their resolved value. If the promise rejects `context.error` will be called with that error. Note that promises will be evaluated in parallel.
```js
Context.runSeries([
  function (context) {
    context.next({
      more: 'data'
      wow: new Promise((resolve, reject)=> {
        resolve('extra');
      })
    });
  }
]).then((context)=> {
  Assert.deepEqual(context.data, {
    more: 'filling',
    wow: 'extra'
  });
});
```

#### `.throw(error)`
Should be called when a step encounters an unexpected error (for example, a database isn't reachable), and the pipeline should stop processing in an errored state.
```js
Context.runSeries([
  function (context) {
    let error = new Error('OH NO!');
    context.throw(error);
  }
]).catch((error)=> {
  Assert.equal(error.message, 'OH NO!');
});
```

#### `.succeed(data)`
Should be called when a step wants to complete the context run successfully without running any other steps. `data` will be added to the context's accumulated data.
```js
Context.runSeries([
  function (context) {
    context.succeed({ok: 'done'});
  },
  function (context) {
    context.next({not: 'run'});
  }
]).then((context)=> {
  Assert.deepEqual(context.data, {
    ok: 'done'
  });
});
```

#### `.fail(failure)`
Should be called when a step encounters an expected error (for example, a record isn't found or input validation fails), and the pipeline should stop processing, but instead of ending in an error state, it will ended in failed state. The failure will be added to the context's data under the key `failure`. The common use case is to return a user-facing error message.
```js
Context.runSeries([
  function (context) {
    let error = new Error('Not Found!');
    context.fail(error);
  },
  function (context) {
    context.next({not: 'run'});
  }
]).then((context)=> {
  Assert.equal(context.error, null);
  Assert.equal(context.data.failure.message, 'Not Found!');
});
```

### `.wrap(key)`
Helper that returns a node style callback with `(error, data)` args which calls `.error` or `.next` appropriately. If the optional key is specified, data passed to `.next` will be namespaced under `key`.
```js
function createMessage (context) {
  // The following:
  Message.create(messages, context.wrap('messages'))

  // is shorthand for this:
  Message.create(messages, function (error, data) {
    if (error) {
      context.throw(error);
    }
    else {
      context.next({
        messages: data
      });
    }
  }
}
```

## Example

```js
const Assert = require('assert');
const Context = require('cntxt');

function findUser(context) {
  let {user_id} = context.data;
  User.find({id: user_id }, (error, user)=> {
    if (error) {
      // .throw is used for unexpected errors
      context.throw(error);
      return;
    }

    if (!user) {
      // .fail is used for expected errors that are
      // passed to consumer via message
      context.fail(`User not found ${user_id}`);
      return;
    }

    // .next is used to pass data and invoke the next
    // function in pipeline. after this, the next step
    // will be called, and `data.user` will be `user`
    context.next({user});
  })
}

function findUserGames(context) {
  let {user_id} = context.data;

  // games will evaluate to the result of the findAll promise
  context.next({
    games: Game.findAll({user_id})
  });
}

function getOpponents(context) {
  let {
    user_id,
    games
  } = context.data;

  let opponents = games.map((game)=> {
    return games.players.filter((player)=> {
      return (player.user.id !== user_id);
    })[0];
  });

  context.next({opponents});
}

function taunt(context) {
  let {opponents} = context.data;
  let messages = opponents.map((user_id)=> {
    return {
      recipient: user_id,
      content: 'Heehaw!'
    };
  });
  // context.wrap returns a function with (error, data) args
  // which calls .error or .next depending on those values
  Message.create(messages, context.wrap('message'))
}

var params = {user_id : 'derrrrp'};

// .runSeries runs pipeline and returns a promise
// The pipeline is finished when
// A) any step calls `.succeed`, `.throw`, or `.fail`,
// B) any step throws unexpectedly
// C) final step calls `.next` (equivalent to `.succeed`)
Context.runSeries([
  params,
  [findUser, findUserGames], // these will be run in parallel
  getOpponents,
  taunt
]).then((context)=> {
  // this is called when the pipeline `failed` or `succeeded`
  Assert.equal(context.succeeded(), true);
  Assert.equal(context.error, null);

  // accumulated data is available in context.data
  Assert.deepEqual(context.data, {
    user_id   : 'derrrrp',
    user      : { /* the user      */ },
    games     : [ /* the games     */ ],
    opponents : [ /* the opponents */ ],
    messages  : [ /* the messages  */ ]
  });
}).catch((error)=> {
  // this is called when the pipeline errored
  Assert.equal(error, null);
});
```

Or instead of a promise, callbacks can be passed as the second argument to `.run`, `.runSeries`, `.runParallel`
```js
Context.runSeries([
  params,
  [findUser, findUserGames],
  getOpponents,
  taunt
], function callback (context) {
  // A single argument callback receives the context
});

Context.runSeries([
  params,
  [findUser, findUserGames],
  getOpponents,
  taunt
], function callback (error, data) {
  // A two argument node style callback receives
  // error: context.error
  // data: context.data
});
```

[This test](https://github.com/stephenhandley/cntxt/blob/master/tests/Context.test.js) also has some more usage examples.
