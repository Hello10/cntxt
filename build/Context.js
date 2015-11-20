(function() {
  var Context, STATES, Type;

  Type = require('type-of-is');

  STATES = {
    ready: 'ready',
    running: 'running',
    errored: 'errored',
    failed: 'failed',
    succeeded: 'succeeded'
  };

  Context = (function() {
    function Context(args) {
      args || (args = {});
      this.data = {};
      this._addData(args.data);
      this.overwrite = !args.overwrite;
      this.state = STATES.ready;
      this.finished = false;
      this._onDone = null;
      this._error = null;
      this.callbacks = null;
      this.index = null;
    }

    Context.run = function(callbacks) {
      var context;
      context = new Context();
      context.run(callbacks);
      return context;
    };

    Context.prototype.run = function(callbacks) {
      if (this.running) {
        return this.error('[cntxt] Run called twice');
      }
      this.state = STATES.running;
      if (!Type(callbacks, Array)) {
        callbacks = [callbacks];
      }
      if (callbacks.length === 0) {
        return this.error('[cntxt] Run passed no callbacks');
      }
      this.callbacks = callbacks;
      this.index = 0;
      return this.next();
    };

    Context.prototype.wrap = function(key) {
      return (function(_this) {
        return function(error, data) {
          var _data;
          if (error) {
            return _this.error(error);
          } else {
            if (key) {
              _data = {};
              _data[key] = data;
              data = _data;
            }
            return _this.next(data);
          }
        };
      })(this);
    };

    Context.prototype.next = function(data) {
      var callback, error, type;
      this._addData(data);
      if (this.index >= this.callbacks.length) {
        return this.succeed();
      }
      callback = this.callbacks[this.index];
      this.index++;
      try {
        type = Type(callback);
        switch (type) {
          case Object:
            return this.next(callback);
          case Function:
            if (callback.length === 2) {
              return callback(this.data, this.wrap());
            } else {
              return callback(this);
            }
            break;
          default:
            return this.error("Invalid callback type: " + type);
        }
      } catch (_error) {
        error = _error;
        return this.error(error);
      }
    };

    Context.prototype.done = function(onDone) {
      this._onDone = onDone;
      if ((!this.finished) && (this.errored || this.failed || this.succeeded)) {
        return this._finish();
      }
    };

    Context.prototype.hasKey = function(key) {
      return key in this.data;
    };

    Context.prototype.fail = function(error) {
      this._addData({
        error: this._makeError(error)
      });
      return this._finish(STATES.failed);
    };

    Context.prototype.succeed = function(data) {
      this._addData(data);
      return this._finish(STATES.succeeded);
    };

    Context.prototype.error = function(error) {
      this._error = this._makeError(error);
      return this._finish(STATES.errored);
    };

    Context.prototype._makeError = function(error) {
      if (Type(error, Error)) {
        return error;
      } else {
        return new Error(error);
      }
    };

    Context.prototype._finish = function(state) {
      if (state) {
        this.state = state;
      }
      this.error = this.errored ? this._error : null;
      if (Type(this._onDone, Function)) {
        this.finished = true;
        if (this._onDone.length === 2) {
          return this._onDone(this.error, this.data);
        } else {
          return this._onDone(this);
        }
      }
    };

    Context.prototype._addData = function(data) {
      var k, v;
      if (!data) {
        return;
      }
      for (k in data) {
        v = data[k];
        if (this.hasKey(k) && !this.overwrite) {
          return this.error("[cntxt] Key exists " + k);
        }
        this.data[k] = v;
      }
    };

    return Context;

  })();

  Object.keys(STATES).forEach(function(state) {
    return Object.defineProperty(Context.prototype, state, {
      get: function() {
        return this.state === state;
      }
    });
  });

  module.exports = Context;

}).call(this);
