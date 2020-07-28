const Type = require('type-of-is');

function buildEnum (types) {
  return types.reduce((Types, type)=> {
    Types[type] = type;
    return Types;
  }, {});
}

const State = buildEnum([
  'Pending',
  'Running',
  'Errored',
  'Failed',
  'Succeeded'
]);

const Mode = buildEnum([
  'Parallel',
  'Series'
])

class Context {
  constructor ({
    data = {},
    steps = null,
    mode = Mode.Series,
    overwrite = true,
    resolve = false
  } = {}) {
    this.data = data;
    this.mode = mode;
    this.state = State.Pending;
    this.steps = steps;
    this.overwrite = overwrite;
    this.resolve = resolve;

    // set during run
    this.error = null;
    this.callback = null;
  }

  static run (steps, callback = null) {
    let context = new Context();
    return context.run(steps, callback);
  }

  run (steps = null, callback = null) {
    if (!this.pending()) {
      throw new Error('Already run');
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
            mode: Mode.Parallel,
            steps: step
          });
        }
        return step;
      });

      this.steps = steps;
    }

    this.callback = callback;
    this.state = State.Running;

    let promise = undefined;
    if (!callback) {
      promise = new Promise((resolve, reject)=> {
        this.callback = (context)=> {
          if (!this.resolve && context.errored()) {
            reject(context.error);
          } else {
            resolve(context);
          }
        };
      });
    }

    if (!this.steps) {
      throw new Error('No steps defined');
    }

    this.start();

    return promise;
  }

  start () {
    if (this.mode === Mode.Parallel) {
      // Parallel
      this.completed = 0;
      for (let step of this.steps) {
        this.processStep(step);
      }
    } else {
      // Serial
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

    const num_steps = this.steps.length;
    if (this.mode === Mode.Parallel) {
      // Parallel
      this.completed++;

      if (this.completed >= num_steps) {
        this.succeed();
      }
    } else {
      // Serial
      if (this.index >= num_steps) {
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
      if (step.then && step.catch) {
        step
          .then(this.next.bind(this))
          .catch(this.throw.bind(this));
        return;
      }

      switch (Type(step)) {
        case Context:
          // Handle a nested context (i.e. Parallel within series)
          step.run()
            .then((context)=> {
              this.next(context.data);
            })
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
          } else {
            // set is callback with sig (context)
            step(this);
          }
          return;

        default:
          this.throw(`Invalid pipeline type`);
      }
    } catch (error) {
      this.throw(error);
    }
  }

  succeed (data) {
    if (data) {
      this.addData(data);
    }
    this.finish(State.Succeeded);
  }

  fail (error) {
    this.addData({
      failure: this.makeError(error)
    });
    this.finish(State.Failed);
  }

  throw (error) {
    this.error = this.makeError(error);
    this.finish(State.Errored);
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
      } else {
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
      } else {
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
    } else {
      // callback is (context)
      this.callback(this);
    }
  }
}

Context.State = State;
for (let state in State) {
  Context.prototype[state.toLowerCase()] = function () {
    return (this.state === state);
  };
}

Context.Mode = Mode;
for (let mode in Mode) {
  const mode_low = mode.toLowerCase();
  Context[mode_low] = function (...args) {
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

  let run = `run${mode}`;
  Context[run] = function (steps) {
    let context = Context[mode_low](steps);
    return context.run();
  };
}

module.exports = Context;
