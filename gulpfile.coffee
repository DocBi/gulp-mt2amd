gulp = require 'gulp'
coffee = require 'gulp-coffee'

gulp.task 'compile', ->
	gulp.src('src/**/*.coffee')
		.pipe coffee()
		.pipe gulp.dest('lib')

gulp.task 'example', ->
	mt2amd = require './lib/index'
	through = require 'through2'
	gulp.src('example/src/**/*.tpl.html')
		.pipe mt2amd()
		.pipe gulp.dest('example/dest')

gulp.task 'default', ['compile']