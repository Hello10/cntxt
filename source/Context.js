var Type = require('type-of-is');

var STATES = {
  ready     : 'ready',
  running   : 'running',
  errored   : 'errored',
  failed    : 'failed',
  succeeded : 'succeeded'
};

var Context = function (args) {
  var context = function (path) {
    try {
      return getData(path);
    } catch (error) {
      context.throw(error);
    }
  };

  context.error = null;
  context.data = {};
  context.state = STATES.ready;
  context.STATES = STATES;

  var args = args || {};
  var overwrite = ('overwrite' in args) ? args.overwrite : true;

  addData(args.data);

  var finished = false;
  var onDone;

  // set by run
  var callbacks;
  var index;

  function getData (path) {
    if (!path) {
      return context.data;
    }

    var parts = path.split('.');

    var data = context.data;
    parts.forEach(function (part) {
      if (!data || !(part in data)) {
        throw('[cntxt] data does not exist: ' + path + '(' + part + ')');
      }
      data = data[part];
    });

    return data;
  }

  function hasData (path) {
    try {
      var data = getData(path);
      return true;
    } catch (error) {
      return false;
    }
  }

  function addData (data) {
    if (!data) {
      return;
    }

    Object.keys(data).forEach(function (k) {
      if (hasData(k) && !overwrite) {
        context.throw('[cntxt] Key exists ' + k);
        return;
      }

      context.data[k] = data[k];
    });
  };

  function finish (state) {
    if (state) {
      context.state = state;
    }

    if (Type(onDone, Function)) {
      finished = true;

      if (onDone.length === 2) {
        // onDone is (error, data)
        onDone(context.error, context.data);
      } else {
        // onDone is (context)
        onDone(context);
      }
    }
  }

  function makeError (error) {
    if (Type(error, Error)) {
      return error;
    } else {
      return new Error(error);
    }
  }

  context.run = function (_callbacks) {
    if (context.state === STATES.running) {
      context.throw('[cntxt] Run called twice');
      return;
    }

    callbacks = _callbacks;
    context.state = STATES.running;

    if (!Type(callbacks, Array)) {
      callbacks = [callbacks];
    }

    if (callbacks.length === 0) {
      context.throw('[cntxt] Run passed no callbacks');
      return;
    }

    index = 0;
    context.next();
  };

  context.wrap = function (key) {
    return function (error, data) {
      if (error) {
        context.throw(error);
      } else {
        if (key) {
          var next_data = {};
          next_data[key] = data;
          data = next_data;
        }
        context.next(data);
      }
    };
  };

  context.next = function (data) {
    addData(data);

    if (index >= callbacks.length) {
      context.succeed();
      return;
    }

    // call next callback
    var callback = callbacks[index];
    index++;

    try {
      var type = Type(callback);

      switch (type) {
        case Object:
          //callback is data, not function
          context.next(callback);
          break;

        case Function:
          if (callback.length === 2) {
            // callback is (data, next)
            callback(context.data, context.wrap());
          } else {
            // callback is (context)
            callback(context);
          }
          break;

        default:
          context.throw('Invalid callback type: ' + type);
      }
    } catch (error) {
      context.throw(error);
    }
  };

  context.done = function (_onDone) {
    onDone = _onDone;

    var done_state = context.errored() || context.failed() || context.succeeded();

    if (!finished && done_state) {
      finish();
    }
  };

  context.has = hasData;

  context.fail = function (error) {
    addData({
      error: makeError(error)
    })
    finish(STATES.failed);
  };

  context.throw = function (error) {
    // for now just keep one error. TODO: something better
    if (context.state !== STATES.errored) {
      context.error = makeError(error);
      finish(STATES.errored);
    }
  };

  context.succeed = function (data) {
    addData(data);
    finish(STATES.succeeded);
  };

  Object.keys(STATES).forEach(function (state) {
    context[state] = function () {
      return (context.state === state);
    };
  });

  return context;
}

Context.run = function (callbacks) {
  context = Context();
  context.run(callbacks);
  return context;
};

module.exports = Context;
