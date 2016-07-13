'use strict';

var Assert = require('assert');
var Context = require('../');

module.exports = {
  'Context' : {
    '.run should' : {
      'go through callbacks then call done' : function (done) {
        function what (context) {
          context.next({
            what : 10
          });
        }

        function foo (context) {
          context.next({
            x : 9,
            what : context('what') * 2
          })
        }

        function barf (context) {
          context.next({
            y : 11,
            what : context('what') * 2
          })
        }

        Context.run([
          what,
          foo,
          barf
        ]).done(function (context) {
          Assert(context.succeeded());
          Assert.equal(context('what') / 4, (context('x') + context('y')) / 2);
          done();
        })
      },

      'allow objects in pipeline to augment data' : function (done) {
        var params = {
          what : 10
        };

        var more = {
          why  : 11,
          when : 12
        };

        var masmas = {
          when : 13,
          how  : 14
        };

        var maaaaas = {
          how   : 15,
          where : 16
        };

        Context.run([
          params,
          more,
          masmas,
          maaaaas
        ]).done(function (context) {
          Assert(context.succeeded());
          Assert.deepEqual(context(), {
            what  : 10,
            why   : 11,
            when  : 13,
            how   : 15,
            where : 16
          });
          done();
        })
      },

      'handle unexpected errors in callbacks' : function (done) {
        var msg = 'wwwwwuttttt'
        function zomg (context) {
          throw new Error(msg);
        };

        Context.run([
          zomg
        ]).done(function (context) {
          Assert(context.errored());
          Assert.equal(context.error.message, msg);
          done();
        });
      },

      'allow for (error, data) .done callback' : function (done) {
        function fun (context) {
          context.next({
            x : 10
          });
        }

        Context.run([
          fun
        ]).done(function (error, data) {
          Assert.equal(error, null);
          Assert.equal(data.x, 10);
          done();
        })
      },

      'allow (data, next) pipeline callbacks' : {
        'to succeed' : function (done) {
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
          ]).done(function (context) {
            Assert(context.succeeded());
            Assert.equal(context('x'), 20);
            done();
          })
        },

        'to error' : function (done) {
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
          ]).done(function (context) {
            Assert(context.errored());
            Assert.equal(context.error.message, 'derp');
            Assert.equal(context('z'), 10);
            done();
          })
        }
      }
    },

    'instance methods' : {
      '.wrap should wrap (error, data) callbacks' : function (done) {
        function yarp (label, callback) {
          var result = {};
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
        ]).done(function (context) {
          Assert(context.errored());
          Assert.equal(context('honk.EFGH'), 'ABCD');
          done();
        });
      },

      '.succeed should short circuit pipeline' : function (done) {
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
        ]).done(function (context) {
          Assert(context.succeeded());
          Assert(context.has('x'));
          Assert(!context.has('will'));
          done();
        });
      },

      '.error should set error and short circuit pipeline' : function (done) {
        function err (context) {
          context.throw('OMG');
        }

        Context.run([
          err
        ]).done(function (context) {
          Assert(context.errored);
          Assert.equal(context.error.message, 'OMG');
          done();
        });
      },

      '.fail should set error message and short circuit pipeline' : function (done) {
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
        ]).done(function (context) {
          Assert(context.failed);
          Assert.equal(context.error, null);
          Assert.equal(context('error.message'), 'I pity');
          Assert(context.has('wow'));
          Assert(!context.has('honk'));
          done();
        });
      }
    }
  }
}
