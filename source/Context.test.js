'use strict';

const Assert = require('assert');
const Mocha = require('mocha');

const Context = require('./Context');

describe('Context', function () {
  describe('constructor', function () {
    it('should initialize context with data', function () {
      let context = new Context({
        data: {x: 10}
      });
      Assert(context.hasData('x'));
      Assert.equal(context.data.x, 10);
    });

    it('should throw error on data key collision when overwrite is false', function (done) {
      let context = new Context({
        data: {x: 10},
        overwrite: false
      });
      context.run([
        function (context) {
          context.next({x: 11});
        }
      ]).catch((error)=> {
        Assert(error);
        Assert(error.message.match(/Key already exists: x/));
        done();
      });
    });
  });

  describe('.run', function () {
    it('should go through successful pipeline and then call .then', function (done) {
      function what (context) {
        context.next({
          what : 10
        });
      }

      function foo (context) {
        let {what} = context.data;
        context.next({
          x : 9,
          what : what * 2
        })
      }

      function barf (context) {
        let {what} = context.data;
        context.next({
          y : 11,
          what : what * 2
        })
      }

      Context.run([
        what,
        foo,
        barf
      ]).then((context)=> {
        Assert(context.succeeded());
        let {what, x, y} = context.data;
        Assert.equal(what / 4, (x + y) / 2);
        done();
      }).catch((error)=> {
        Assert.equal(error, null);
      });
    });

    it('should allow objects in pipeline to augment data', function (done) {
      let params = {
        what : 10
      };

      let more = {
        why  : 11,
        when : 12
      };

      let masmas = {
        when : 13,
        how  : 14
      };

      let maaaaas = {
        how   : 15,
        where : 16
      };

      Context.run([
        params,
        more,
        masmas,
        maaaaas
      ]).then((context)=> {
        Assert(context.succeeded());
        Assert.deepEqual(context.data, {
          what  : 10,
          why   : 11,
          when  : 13,
          how   : 15,
          where : 16
        });
        done();
      });
    });

    it('should handle unexpected errors in callbacks', function (done) {
      let msg = 'wwwwwuttttt'
      function zomg (context) {
        throw new Error(msg);
      };

      Context.run([
        zomg
      ]).catch(function (error) {
        Assert.equal(error.message, msg);
        done();
      });
    });

    it('should allow for (error, data) callback', function (done) {
      function fun (context) {
        context.next({
          x : 10
        });
      }

      Context.run([
        fun
      ], function (error, data) {
        Assert.equal(error, null);
        Assert.equal(data.x, 10);
        done();
      });
    });

    it('should allow nested array to run steps in parallel', function (done) {
      function delayed ({data, delay}) {
        return function (context) {
          setTimeout(function () {
            context.next(data)
          }, delay);
        };
      }

      let a = delayed({
        data: {a: 10},
        delay: 30
      });

      let b = delayed({
        data: {b: 12},
        delay: 50
      });

      function c (context) {
        let {a, b} = context.data;
        context.next({c: a + b});
      }

      Context.run([
        [a, b],
        c
      ], function (error, data) {
        Assert.equal(error, null);
        Assert.equal(data.c, 22);
        done();
      });
    });

    it('should error when a step is not defined', function () {
      Assert.throws(()=> {
        Context.run([
          undefined
        ]);
      });
    });

    it('should allow for combination of .series and .parallel', function (done) {
      let index = 0;
      function step (letter) {
        index++;
        return Promise.resolve({[letter]: index});
      }

      Context.runSeries([
        step('a'),
        step('b'),
        Context.parallel([
          step('c1'),
          step('c2'),
          step('c3')
        ]),
        Context.parallel([
          Context.series([
            step('d1'),
            step('d2')
          ]),
          Context.series([
            step('e1'),
            step('e2')
          ]),
        ]),
        step('f')
      ]).then((context)=> {
        Assert(context.succeeded());
        let {
          a,
          b,
          c1, c2, c3,
          d1, d2,
          e1, e2,
          f
        } = context.data;

        function inRange ({values, range}) {
          let [low, high] = range;
          for (let value of values) {
            let in_range = ((value >= low) && (value <= high));
            Assert(in_range);
          }
        }

        Assert.equal(a, 1);
        Assert.equal(b, 2);
        inRange({
          values: [c1, c2, c3],
          range: [3, 5]
        });

        // d and e run in parallel, but individual
        // steps are in series
        Assert(d1 < d2);
        inRange({
          values: [d1, d2],
          range: [6, 9]
        });

        Assert(e1 < e2);
        inRange({
          values: [e1, e2],
          range: [6, 9]
        });

        Assert.equal(f, 10);
        done();
      });
    });
  });

  describe('static helpers', function () {
    let steps = [
      Promise.resolve({x: 10}),
      Promise.resolve({y: 11})
    ];
    let data = {
      x: 10,
      y: 11
    };

    Object.keys(Context.Mode).forEach((mode)=> {
      const mode_low = mode.toLowerCase();
      it(`.${mode} should create a context in ${mode} mode`, function (done) {
        let context = Context[mode_low](steps);
        Assert.equal(context.mode, mode);
        context.run().then((context)=> {
          Assert.deepEqual(context.data, data);
          done();
        });
      });

      let run = `run${mode}`;
      it(`.${run} should create and run a context in ${mode} mode`, function (done) {
        Context[run](steps).then((context)=> {
          Assert.equal(context.mode, mode);
          Assert.deepEqual(context.data, data);
          done();
        });
      });
    });
  });

  describe('pipeline steps', function () {
    describe('function with (context) signature', function () {
      it('should handle success', function (done) {
        function okay (context) {
          context.next({ok: 'okay'});
        }

        Context.run([
          okay
        ]).then(function (context) {
          Assert(context.succeeded());
          Assert.equal(context.data.ok, 'okay');
          done();
        });
      });

      it('should handle failure', function (done) {
        function ooops (context) {
          context.throw(new Error('ooops'));
        }

        Context.run([
          ooops
        ]).catch((error)=> {
          Assert.equal(error.message, 'ooops');
          done();
        });
      });
    });

    describe('function with (data, callback) signature', function () {
      it('should handle success', function (done) {
        function fun (context) {
          context.next({
            a : 10
          });
        }

        function moreFun (data, callback) {
          callback(null, {
            x : data.a * 2
          });
        }

        Context.run([
          fun,
          moreFun
        ]).then(function (context) {
          Assert(context.succeeded());
          Assert.equal(context.data.x, 20);
          done();
        });
      });

      it('should handle failure', function (done) {
        function fun (context) {
          context.next({
            z : 10
          });
        }

        function funk (data, callback) {
          var derp = new Error('derp');
          callback(derp, null);
        }

        function narp (context) {
          context.next({
            z : 11
          });
        }

        Context.run([
          fun,
          funk,
          narp
        ]).catch(function (error) {
          Assert.equal(error.message, 'derp');
          done();
        });
      });
    });

    describe('function with invalid signature', function () {
      it('should error', function (done) {
        Context.run([
          function (x, y, z) {
            return {x, y, z};
          }
        ]).catch(function (error) {
          Assert(error.message.match(/Invalid pipeline step function/));
          done();
        });
      });
    });

    describe('promise', function () {
      it('should handle success', function (done) {
        let promise = new Promise((resolve, reject)=> {
          resolve({more: 'data'});
        });

        Context.run([
          promise
        ]).then((context)=> {
          Assert(context.succeeded());
          Assert.equal(context.data.more, 'data');
          done();
        });
      });

      it('should handle failure', function (done) {
        const msg = 'oooof';
        let promise = new Promise((resolve, reject)=> {
          let error = new Error(msg);
          reject(error);
        });

        Context.run([
          promise
        ]).catch((error)=> {
          Assert.equal(error.message, msg);
          done();
        });
      });

      it('should handle forcing to always resolve', function (done) {
        const msg = 'ressoooooooof'
        let promise = new Promise((resolve, reject)=> {
          let error = new Error(msg);
          reject(error);
        });

        const context = new Context({resolve: true});
        context.run([
          promise
        ]).then((context)=> {
          Assert(context.errored());
          Assert.equal(context.error.message, msg);
          done();
        });
      });
    });
  });

  describe('instance methods', function () {
    it('.wrap should wrap (error, data) callbacks', function (done) {
      function yarp (label, callback) {
        let result = {};
        result[label] = 'ABCD';
        callback(null, result);
      }

      function narp (callback) {
        callback(new Error('narp'), null);
      }

      function wow (context) {
        yarp('EFGH', context.wrap('honk'));
      }

      function now (context) {
        narp(context.wrap('nooooo'));
      }

      Context.run([
        wow,
        now
      ], function (context) {
        Assert(context.errored());
        Assert.equal(context.data.honk.EFGH, 'ABCD');
        done();
      });
    });

    describe('.next', function () {
      it('should add context data', function (done) {
        function foo (context) {
          context.next({
            x: 10
          });
        }

        Context.run([
          foo,
        ]).then(function (context) {
          Assert(context.succeeded());
          Assert.equal(context.data.x, 10);
          done();
        });
      });

      it('should handle resolving promises as values in data', function (done) {
        function foo (context) {
          context.next({
            x: Promise.resolve(10)
          });
        }

        Context.run([
          foo,
        ]).then(function (context) {
          Assert(context.succeeded());
          Assert.equal(context.data.x, 10);
          done();
        });
      });

      it('should handle auto next call', function (done) {
        function foo10 (context) {
          context.next({w: 10});
        }

        function foo20 (context) {
          return {
            x1: context.data.w + 10
          };
        }

        async function foo25 (context) {
          const x2 = await (new Promise((resolve, reject)=> {
            setTimeout(()=> {
              resolve(context.data.w + 15);
            }, 50);
          }));
          return {
            x2
          };
        }

        function foo30 (context) {
          return Promise.resolve({
            y: context.data.x2 + 5
          });
        }

        async function foo40 (context) {
          return {
            z: context.data.y + 10
          };
        }

        Context.run([
          foo10,
          [foo20, foo25],
          foo30,
          foo40
        ]).then(function (context) {
          Assert(context.succeeded());
          Assert.deepEqual(context.data, {
            w: 10,
            x1: 20,
            x2: 25,
            y: 30,
            z: 40
          });
          done();
        });
      });

      it('should handle reject in async function', function (done) {
        const msg = 'omg wtf';
        Context.run([
          async ()=> {
            throw new Error(msg);
          }
        ]).catch(function (error) {
          Assert.equal(error.message, msg);
          done();
        });
      });

      it('should handle rejecting promises as values in data', function (done) {
        function foo (context) {
          context.next({
            x: Promise.reject(new Error('Ooops'))
          });
        }

        Context.run([
          foo,
        ]).catch(function (error) {
          Assert.equal(error.message, 'Ooops');
          done();
        });
      });
    });

    it('.succeed should short circuit pipeline', function (done) {
      function foo (context) {
        context.next({
          x: 10
        })
      }

      function yarp (context) {
        context.succeed();
      }

      function narp (context) {
        context.next({
          will : 'never',
          get  : 'here'
        });
      }

      Context.run([
        foo,
        yarp,
        narp
      ]).then(function (context) {
        Assert(context.succeeded());
        Assert(context.hasData('x'));
        Assert(!context.hasData('will'));
        done();
      });
    });

    it('.error should set error and short circuit pipeline', function (done) {
      function err (context) {
        context.throw('OMG');
      }

      Context.run([
        err
      ]).catch((error)=> {
        Assert.equal(error.message, 'OMG');
        done();
      });
    });

    it('.fail should set error message and short circuit pipeline', function (done) {
      function foo (context) {
        context.next({
          wow : 10
        });
      }

      function fool (context) {
        context.fail('I pity');
      }

      function later (context) {
        context.next({
          honk : 200
        });
      }

      Context.run([
        foo,
        fool
      ]).then(function (context) {
        Assert(context.failed());
        Assert.equal(context.error, null);
        Assert.equal(context.failure.message, 'I pity');
        Assert(context.hasData('wow'));
        Assert(!context.hasData('honk'));
        done();
      });
    });
  });
});
