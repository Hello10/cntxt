const Type = require('type-of-is');

const AsyncFunction = (async function af () {}).constructor;

function buildEnum (types) {
  return types.reduce((Types, type)=> {
    Types[type] = type;
    return Types;
  }, {});
}

function isPromise (p) {
  return (p && p.then && p.catch);
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

    for (let i = 0; i < this.steps.length; i++) {
      const step = this.steps[i];
      if (!step) {
        throw new Error(`Step #${i + 1} does not exist`);
      }
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
      const promise_keys = [];
      const promise_vals = [];
      for (const [k, v] of Object.entries(data)) {
        if (isPromise(v)) {
          promise_keys.push(k);
          promise_vals.push(v);
        }
      }

      try {
        const values = await Promise.all(promise_vals);
        values.forEach((value, index)=> {
          const key = promise_keys[index];
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
    const stepThrow = (error)=> {
      this.throw(error, step);
    }

    if (!step) {
      // Since we reprocess the output of a function or promise step, need to
      // check in case it didn't return anything, which could happen if they
      // called context.next instead of returning
      return;
    }

    if (isPromise(step)) {
      step
        .then(this.processStep.bind(this))
        .catch(stepThrow);
      return;
    }

    const type = Type(step);
    switch (type) {
      case Context:
        // Handle a nested context (i.e. Parallel within Series)
        step.run()
          .then((context)=> {
            this.next(context.data);
          })
          .catch(stepThrow);
        return;

      case Object:
        // step is data, go to next step
        this.next(step);
        return;

      case AsyncFunction:
        const run = async (step)=> {
          try {
            const result = await step(this);
            this.processStep(result);
          } catch (error) {
            stepThrow(error);
          }
        }
        run(step);
        return;

      case Function:
        const {length} = step;
        if ((length < 1) || (length > 2)) {
          const error = new Error(`Invalid pipeline step function: must have 1 or 2 args`)
          stepThrow(error);
          return;
        }

        try {
          if (length === 2) {
            // set is callback with sig (data, next)
            step(this.data, this.wrap());
          } else {
            // set is callback with sig (context)
            const before = this.nexts;
            const result = step(this);
            const after = this.nexts;

            // if next wasn't called and still running and return value
            // is defined, then process the return value;
            if (this.running() && (before === after) && (result !== undefined)) {
              this.processStep(result);
            }
          }
        } catch (error) {
          stepThrow(error);
        }
        return;

      default:
        const error = new Error(`Invalid pipeline type ${type} for step: ${step}`);
        stepThrow(error);
    }
  }

  succeed (data) {
    if (data) {
      this.addData(data);
    }
    this.finish(State.Succeeded);
  }

  fail (failure) {
    this.failure = failure;
    this.finish(State.Failed);
  }

  throw (error, step = null) {
    if (step) {
      error.cntxt_step = step.name || step;
      this.error_step = step;
    }
    this.error = error;
    this.finish(State.Errored);
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
        const error = new Error(`Key already exists: ${key}`);
        this.throw(error);
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
