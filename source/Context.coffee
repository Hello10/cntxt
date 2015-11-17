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

    @_onDone  = null
    @finished = false

    # updated by .run
    @callbacks = null
    @index     = null
    @error     = null
    @state     = STATES.ready

  @run : (callbacks)->
    context = new Context()
    context.run(callbacks)
    return context

  run : (callbacks)->
    if (@running)
      return @_error('[cntxt] Run called twice')

    @state = STATES.running

    unless Type(callbacks, Array)
      callbacks = [callbacks]

    if (callbacks.length is 0)
      return @_error('[cntxt] Run passed no callbacks')

    @callbacks = callbacks
    @index     = 0

    @next()

  next : (data)->
    @_addData(data)

    if (@index >= @callbacks.length)
      return @succeed()

    # call next callback
    callback = @callbacks[@index]
    @index++

    try
      if Type(callback, Object)
        @next(callback)
      else
        callback(@)
    catch error
      @_error(error)

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

  _error : (error)->
    @error = @_makeError(error)
    @_finish(STATES.errored)

  _makeError : (error)->
    if Type(error, Error)
      error
    else
      new Error(error)

  _finish : (state)->
    if state
      @state = state

    if Type(@_onDone, Function)
      @finished = true
      @_onDone(@)

  _addData : (data)->
    unless data
      return

    for k,v of data
      if @hasKey(k) and !@overwrite
        return @_error("[cntxt] Key exists #{k}")
      @data[k] = v

Object.keys(STATES).forEach((state)->
  Object.defineProperty(Context::, state, {
    get : ()->
      (@state is state)
  })
)

module.exports = Context
