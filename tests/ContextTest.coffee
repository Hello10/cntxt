Assert = require('assert')
Context = require('../build/Context')

module.exports = {
  'Context' : {
    'should run through callbacks' : (done)->
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
  }
}
