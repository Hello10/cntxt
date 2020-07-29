const Type = require('type-of-is');

const AsyncFunction = (async function af () {}).constructor;

function buildEnum (types) {
  return types.reduce((Types, type)=> {
    Types[type] = type;
    return Types;
  }, {});
}

function isPromise (p) {
  return (p.then && p.catch);
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
    this.nexts = 0;

    // set during run
    this.error = null;
    this.failure = null;
    this.callback = null;
  }

  static run (steps, callback = null) {
    const context = new Context();
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
            data: this.data,
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

    this.start()

    return promise;
  }

  start () {
    if (this.mode === Mode.Parallel) {
      // Parallel
      this.completed = 0;
      for (const step of this.steps) {
        this.processStep(step);
      }
    } else {
      // Serial
      this.index = 0;
      this.next();
    }
  }

  async next (data) {
    this.nexts++;

    if (data) {
      const keys = Object.keys(data).filter((key)=> {
        const value = data[key];
        return !!value.then;
      });

      const promises = keys.map((key)=> {
        return data[key];
      });

      try {
        const values = await Promise.all(promises);
        values.forEach((value, index)=> {
          const key = keys[index];
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

      const step = this.steps[this.index];
      this.index++;
      this.processStep(step);
    }
  }

  processStep (step) {
    try {
      if (isPromise(step)) {
        step
          .then(this.processStep.bind(this))
          .catch(this.throw.bind(this));
        return;
      }

      switch (Type(step)) {
        case Context:
          // Handle a nested context (i.e. Parallel within Series)
          step.run()
            .then((context)=> {
              this.next(context.data);
            })
            .catch(this.throw.bind(this));
          return;

        case Object:
          // step is data, go to next step
          this.next(step);
          return;

        case AsyncFunction:
          const run = async (fn)=> {
            try {
              const result = await fn(this);
              this.processStep(result);
            } catch (error) {
              this.throw(error);
            }
          }
          run(step);
          return;

        case Function:
          if (step.length === 2) {
            // set is callback with sig (data, next)
            step(this.data, this.wrap());
          } else if (step.length == 1) {
            // set is callback with sig (context)
            const before = this.nexts;
            const result = step(this);
            const after = this.nexts;

            // if next wasn't called and still running and return value
            // is defined, then process the return value;
            if (this.running() && (before === after) && (result !== undefined)) {
              this.processStep(result);
            }
          } else {
            this.throw(`Invalid pipeline step function: must have 1 or 2 args`);
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
    this.failure = this.makeError(error);
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
    for (const key in data) {
      const val = data[key];
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

  finished () {
    return [
      State.Succeeded,
      State.Failed,
      State.Errored
    ].includes(this.state);
  }
}

Context.State = State;
for (const state in State) {
  Context.prototype[state.toLowerCase()] = function () {
    return (this.state === state);
  };
}

Context.Mode = Mode;
for (const mode in Mode) {
  const mode_low = mode.toLowerCase();
  Context[mode_low] = function (...args) {
    const first = args[0];
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

  const run = `run${mode}`;
  Context[run] = function (steps) {
    const context = Context[mode_low](steps);
    return context.run();
  };
}

module.exports = Context;
