module.exports = (grunt)->
  grunt.initConfig(
    pkg : grunt.file.readJSON('package.json')

    coffee: {
      glob_to_multiple: {
        expand  : true
        flatten : false
        cwd     : "#{__dirname}/source/"
        src     : ['**/*.coffee']
        dest    : "#{__dirname}/build/"
        ext     : '.js'
      }
    }

    watch: {
      files: '**/*.coffee',
      tasks: ['coffee', 'docco']
    }

    docco: {
      debug: {
        src: ['source/**/*.coffee'],
        options: {
          output: 'docs/'
        }
      }
    }
  )

  grunt.loadNpmTasks('grunt-contrib-coffee')
  grunt.loadNpmTasks('grunt-contrib-watch')
  grunt.loadNpmTasks('grunt-docco')

  grunt.registerTask('build', ['coffee'])
