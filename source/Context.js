const Type = require('type-of-is');

const {
  buildEnum,
  capitalize
} = require('./Utils');

const States = buildEnum([
  'ready',
  'running',
  'errored',
  'failed',
  'succeeded'
]);

const Modes = buildEnum([
  'parallel',
  'series'
])

// External facing class
// Handles data gathering and completion handling
class Context {
  constructor ({
    data = {},
    steps = null,
    overwrite = true,
    mode = Modes.series
  } = {}) {
    this.data = data;
    this.overwrite = overwrite;
    this.mode = mode;
    this.state = States.ready;
    this.steps = steps;

    // set during run
    this.error = null;
    this.callback = null;
  }

  static run (steps, callback = null) {
    let context = new Context();
    return context.run(steps, callback);
  }

  run (steps = null, callback = null) {
    if (this.running()) {
      throw new Error('Already running');
    }

    if (steps) {
      if (!Type(steps, Array)) {
        steps = [steps];
      }

      // TODO: make this recursive so its generic to n-level nesting
      steps = steps.map((step)=> {
        if (Type(step, Array)) {
          step = new Context({
            overwrite: this.overwrite,
            mode: Modes.parallel,
            steps: step
          });
        }
        return step;
      });

      this.steps = steps;
    }

    this.callback = callback;
    this.state = States.running;

    let promise = undefined;
    if (!callback) {
      promise = new Promise((resolve, reject)=> {
        this.callback = (context)=> {
          if (context.errored()) {
            reject(context.error);
          }
          else {
            resolve(context);
          }
        };
      });
    }

    this.start();

    return promise;
  }

  start () {
    if (this.mode === Modes.parallel) {
      this.completed = 0;
      for (let step of this.steps) {
        this.processStep(step);
      }
    }
    else {
      this.index = 0;
      this.next();
    }
  }

  async next (data) {
    if (data) {
      let keys = Object.keys(data).filter((key)=> {
        let value = data[key];
        return !!value.then;
      });

      let promises = keys.map((key)=> {
        return data[key];
      });

      try {
        let values = await Promise.all(promises);
        values.forEach((value, index)=> {
          let key = keys[index];
          data[key] = value;
        });
      } catch (error) {
        this.throw(error);
      }

      this.addData(data);
    }

    if (this.mode === Modes.parallel) {
      this.completed++;

      if (this.completed === this.steps.length) {
        this.succeed();
      }
    }
    else {
      if (this.index >= this.steps.length) {
        this.succeed();
        return;
      }

      let step = this.steps[this.index];
      this.index++;
      this.processStep(step);
    }
  }

  processStep (step) {
    try {
      switch (Type(step)) {
        case Context:
          step.run()
            .then((context)=> {
              this.next(context.data);
            })
            .catch(this.throw.bind(this));
          return;

        case Promise:
          step
            .then(this.next.bind(this))
            .catch(this.throw.bind(this));
          return;

        case Object:
          // step is data, not function
          this.next(step);
          return;

        case Function:
          if (step.length === 2) {
            // set is callback with sig (data, next)
            step(this.data, this.wrap());
          }
          else {
            // set is callback with sig (context)
            step(this);
          }
          return;

        default:
          this.throw(`Invalid pipeline type`);
      }
    }
    catch (error) {
      this.throw(error);
    }
  }

  succeed (data) {
    if (data) {
      this.addData(data);
    }
    this.finish(States.succeeded);
  }

  fail (error) {
    this.addData({
      failure: this.makeError(error)
    });
    this.finish(States.failed);
  }

  throw (error) {
    this.error = this.makeError(error);
    this.finish(States.errored);
  }

  makeError (error) {
    if (!Type(error, Error)) {
      error = new Error(error);
    }
    return error;
  }

  wrap (key = null) {
    return (error, data)=> {
      if (error) {
        this.throw(error);
      }
      else {
        if (key) {
          data = {
            [key]: data
          };
        }
        this.next(data);
      }
    };
  }

  addData (data) {
    for (let key in data) {
      let val = data[key];
      if (this.hasData(key) && !this.overwrite) {
        this.throw(`Key already exists: ${key}`);
        return;
      }
      else {
        this.data[key] = val;
      }
    }
  }

  hasData (key) {
    return (key in this.data);
  }

  finish (state) {
    if (state) {
      this.state = state;
    }

    if (this.callback.length === 2) {
      // callback is (error, data)
      this.callback(this.error, this.data);
    }
    else {
      // callback is (context)
      this.callback(this);
    }
  }
}

Context.States = States;
for (let state in States) {
  Context.prototype[state] = function () {
    return (this.state === state);
  };
}

Context.Modes = Modes;
for (let mode in Modes) {
  Context[mode] = function (...args) {
    let first = args[0];
    if (Type(first, Array)) {
      args = {
        steps: first
      };
    } else {
      args = first;
    }
    args.mode = mode;
    return new Context(args);
  };

  let run = `run${capitalize(mode)}`;
  Context[run] = function (steps) {
    let context = Context[mode](steps);
    return context.run();
  };
}

module.exports = Context;
