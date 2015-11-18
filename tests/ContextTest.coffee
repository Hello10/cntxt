Assert = require('assert')
Context = require('../')

module.exports = {
  'Context' : {
    '.run should' : {
      'go through callbacks then call done' : (done)->
        what = (context)->
          context.next({
            what : 10
          })

        foo = (context)->
          context.next(
            x : 9
            what : context.data.what * 2
          )

        barf = (context)->
          context.next(
            y : 11
            what : context.data.what * 2
          )

        Context.run([
          what,
          foo,
          barf
        ]).done((context)->
          Assert(context.succeeded)
          Assert.equal(context.data.what / 4, (context.data.x + context.data.y) / 2)
          done()
        )

      'allow objects in pipeline to augment data' : (done)->
          params = {
            what : 10
          }

          more = {
            why  : 11
            when : 12
          }

          masmas = {
            when : 13
            how  : 14
          }

          maaaaas = {
            how   : 15
            where : 16
          }

          Context.run([
            params,
            more,
            masmas,
            maaaaas
          ]).done((context)->
            Assert(context.succeeded)
            Assert.deepEqual(context.data, {
              what  : 10
              why   : 11
              when  : 13
              how   : 15
              where : 16
            })
            done()
          )

      'handle unexpected errors in callbacks' : (done)->
        msg = 'wwwwwuttttt'
        zomg = (context)->
          throw new Error(msg)

        Context.run([
          zomg
        ]).done((context)->
          Assert(context.errored)
          Assert.equal(context.error.message, msg)
          done()
        )

      'allow for (error, data) .done callback' : (done)->
        fun = (context)->
          context.next({
            x : 10
          })

        Context.run([
          fun
        ]).done((error, data)->
          Assert.equal(error, null)
          Assert.equal(data.x, 10)
          done()
        )

      'allow (data, next) pipeline callbacks' : {
        'to succeed' : (done)->
          fun = (context)->
            context.next({
              a : 10
            })

          moreFun = (data, callback)->
            callback(null, {
              x : data.a * 2
            })

          Context.run([
            fun,
            moreFun
          ]).done((context)->
            Assert(context.succeeded)
            Assert.equal(context.data.x, 20)
            done()
          )

        'to error' : (done)->
          fun = (context)->
            context.next({
              z : 10
            })

          funk = (data, callback)->
            derp = new Error('derp')
            callback(derp, null)

          narp = (context)->
            context.next(
              z : 11
            )

          Context.run([
            fun,
            funk,
            narp
          ]).done((context)->
            Assert(context.errored)
            Assert.equal(context.error.message, 'derp')
            Assert.equal(context.data.z, 10)
            done()
          )
      }
    }

    'instance methods' : {
      '.succeed should short circuit pipeline' : (done)->
        foo = (context)->
          context.next(
            x: 10
          )

        yarp = (context)->
          context.succeed()

        narp = (context)->
          context.next(
            will : 'never'
            get  : 'here'
          )

        Context.run([
          foo,
          yarp,
          narp
        ]).done((context)->
          Assert(context.succeeded)
          Assert(context.hasKey('x'))
          Assert(!context.hasKey('will'))
          done()
        )

      '.error should set error and short circuit pipeline' : (done)->
        err = (context)->
          context.error('OMG')

        Context.run([
          err
        ]).done((context)->
          Assert(context.errored)
          Assert.equal(context.error.message, 'OMG')
          done(0)
        )

      '.fail should set error message and short circuit pipeline' : (done)->
        foo = (context)->
          context.next(
            wow : 10
          )

        fool = (context)->
          context.fail('I pity')

        later = (context)->
          context.next(
            honk : 200
          )

        Context.run([
          foo,
          fool
        ]).done((context)->
          Assert(context.failed)
          Assert.equal(context.error, null)
          Assert.equal(context.data.error.message, 'I pity')
          Assert(context.hasKey('wow'))
          Assert(!context.hasKey('honk'))
          done()
        )
    }
  }
}
