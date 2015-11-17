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
      this._onDone = null;
      this.finished = false;
      this.callbacks = null;
      this.index = null;
      this.error = null;
      this.state = STATES.ready;
    }

    Context.run = function(callbacks) {
      var context;
      context = new Context();
      context.run(callbacks);
      return context;
    };

    Context.prototype.run = function(callbacks) {
      if (this.running) {
        return this._error('[cntxt] Run called twice');
      }
      this.state = STATES.running;
      if (!Type(callbacks, Array)) {
        callbacks = [callbacks];
      }
      if (callbacks.length === 0) {
        return this._error('[cntxt] Run passed no callbacks');
      }
      this.callbacks = callbacks;
      this.index = 0;
      return this.next();
    };

    Context.prototype.next = function(data) {
      var callback, error;
      this._addData(data);
      if (this.index >= this.callbacks.length) {
        return this.succeed();
      }
      callback = this.callbacks[this.index];
      this.index++;
      try {
        if (Type(callback, Object)) {
          return this.next(callback);
        } else {
          return callback(this);
        }
      } catch (_error) {
        error = _error;
        return this._error(error);
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

    Context.prototype._error = function(error) {
      this.error = this._makeError(error);
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
      if (Type(this._onDone, Function)) {
        this.finished = true;
        return this._onDone(this);
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
          return this._error("[cntxt] Key exists " + k);
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
