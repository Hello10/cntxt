ParallelRun = require('./Parallel')
SeriesRun   = require('./Series')

module.exports = {
  Parallel : ParallelRun
  Series   : SeriesRun
}


# // Context.Series([
# //   A,
# //   B,
# //   Context.Parallel([C1, C2, C3]),
# //   Context.Parallel([
# //     Context.Series([D1, D2])
# //     Context.Series([E1, E2])
# //   ]),
# //   F
# // ])
