Assert = require('assert')
Context = require('../build/Context')

module.exports = {
  'Context' : {
    'should call done after callbacks' : (done)->
      params = {
        what : 10
      }

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
        params,
        foo,
        barf
      ]).done((context)->
        Assert(context.succeeded)
        Assert.equal(context.data.what / 4, (context.data.x + context.data.y) / 2)
        done()
      )

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

    'should handle unexpected errors in callbacks' : (done)->
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
  }
}
