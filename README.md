# cntxt

[![Build Status](https://travis-ci.org/stephenhandley/cntxt.png)](https://travis-ci.org/stephenhandley/cntxt)
[![NPM version](https://badge.fury.io/js/cntxt.png)](https://www.npmjs.com/package/cntxt)

cntxt provides a context for executing and accumulating data through a function pipeline

## Index
* [Latest Version](#latest-version)
* [Installation](#installation)
* [Usage](#usage)

## Latest Version

2.0.1

## Installation
```
npm install --save cntxt
```

## Usage

```js
var Assert = require('assert');
var Context = require('cntxt');

function findUser(context) {
  var user_id = context.data.user_id;
  User.find({ id : user_id }, function(error, user) {
    if (error) {
      // .error is used for unexpected errors
      return context.error(error);
    }
    if (!user) {
      // .fail is used for expected errors that are
      // passed to consumer via message
      return context.fail('User not found ' + user_id);
    }

    // .next is used to pass data and invoke the next
    // function in pipeline
    context.next({ user : user });
  })
}

function findUserGames(context) {
  var user_id = context.data.user_id;

  Game.findAll({ user_id : user_id }, function(error, games) {
    if (error) {
      return context.error(error);
    }
    context.next({ games : games });
  });
}

function getOpponents(context) {
  var data = context.data;
  var user_id = data.user_id;
  var games = data.games;

  var opponents = games.map(function (game) {
    return games.players.filter(function (player) {
      return (player.user.id !== user_id);
    })[0];
  });

  context.next({ opponents : opponents });
}

var params = { user_id : 'derrrrp' };

// .run pipelines array of callbacks and calls .done when
// A) any callback calls one of [.fail, .error, .succeed]
// B) last callback calls .next (equivalent to .succeed)
Context.run([
  params,
  findUser,
  findUserGames,
  getOpponents
]).done(function(context) {
  // when this is called, one and only one of the following
  // will be true: [.succeeded, .errored, .failed], depending
  // on trigger called as mentioned in previous comment
  Assert.equal(context.succeeded, true);

  // context.error will hold error if .errored=true, else null
  Assert.equal(context.error, null);

  // accumulated data is available in context.data
  Assert.deepEqual(context.data, {
    user_id   : 'derrrrp',
    user      : { /* da user      */ },
    games     : [ /* da games     */ ],
    opponents : [ /* da opponents */ ]
  });
});
```

Pipeline callbacks can alternatively use this style
```js
function findUserGames(data, callback) {
  var user_id = context.data.user_id;

  Game.findAll({ user_id : user_id }, function(error, games) {
    if (error) {
      callback(error, null);
    } else {
      callback(null, { games : games });
    }
  });
}

```

Done callbacks also support an alternative callback style:
```js
Context.run([
  /* ... */
]).done(function (error, data) {
  // error is context.error
  // data is context.data
});
```

Check out [this test](https://github.com/stephenhandley/cntxt/blob/master/tests/ContextTest.coffee) for more usage examples.
