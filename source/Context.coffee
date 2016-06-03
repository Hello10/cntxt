Type = require('type-of-is')

STATES = {
  ready     : 'ready'
  running   : 'running'
  errored   : 'errored'
  failed    : 'failed'
  succeeded : 'succeeded'
}

class Context
  constructor : (args)->
    args ||= {}

    @data = {}
    @_addData(args.data)

    @overwrite = !args.overwrite

    @state    = STATES.ready
    @finished = false
    @_onDone  = null
    @_error   = null

    # set by ::run
    @callbacks = null
    @index     = null

  @run : (callbacks)->
    context = new Context()
    context.run(callbacks)
    return context

  run : (callbacks)->
    if (@running)
      return @error('[cntxt] Run called twice')

    @state = STATES.running

    unless Type(callbacks, Array)
      callbacks = [callbacks]

    if (callbacks.length is 0)
      return @error('[cntxt] Run passed no callbacks')

    @callbacks = callbacks
    @index     = 0

    @next()

  wrap : (key)->
    (error, data)=>
      if error
        @error(error)
      else
        if (key)
          _data = {}
          _data[key] = data
          data = _data

        @next(data)

  next : (data)->
    console.log('next!!!')
    @_addData(data)

    if (@index >= @callbacks.length)
      return @succeed()

    # call next callback
    callback = @callbacks[@index]
    @index++

    try
      if Type(callback.then, Function)
        console.log("PROMISE!")
        callback.context = @
        return callback.then((data)=>
          console.log('next')
          @next(data)
        ).catch((error)=>
          console.log('error')
          console.log(error)
          @error(error)
        )

      type = Type(callback)

      console.log('type is', type)
      switch type
        when Object
          # callback is data, not function
          @next(callback)
        when Function
          console.log('FUNCIO')
          if (callback.length is 2)
            # callback is (data, next)
            callback(@data, @wrap())
          else
            # callback is (context)
            callback(@)
        else
          @error("Invalid callback type: #{type}")

    catch error
      @error(error)

  done : (onDone)->
    @_onDone = onDone

    if ((!@finished) and (@errored or @failed or @succeeded))
      @_finish()

  hasKey : (key)->
    (key of @data)

  fail: (error)->
    @_addData({
      error: @_makeError(error)
    })
    @_finish(STATES.failed)

  succeed : (data)->
    @_addData(data)
    @_finish(STATES.succeeded)

  error : (error)->
    @_error = @_makeError(error)
    @_finish(STATES.errored)

  _makeError : (error)->
    if Type(error, Error)
      error
    else
      new Error(error)

  _finish : (state)->
    if state
      @state = state

    # we overwrite this the error method with actual error or null
    @error = if @errored
      @_error
    else
      null

    if Type(@_onDone, Function)
      @finished = true
      if (@_onDone.length is 2)
        # @_onDone is (error, data)
        @_onDone(@error, @data)
      else
        # @_onDone is (context)
        @_onDone(@)

  _addData : (data)->
    unless data
      return

    for k,v of data
      if @hasKey(k) and !@overwrite
        return @error("[cntxt] Key exists #{k}")
      @data[k] = v

Object.keys(STATES).forEach((state)->
  Object.defineProperty(Context::, state, {
    get : ()->
      (@state is state)
  })
)

module.exports = Context
