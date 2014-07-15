Q = require 'q'
fs = require 'fs'
path = require 'path'
less = require 'less'
gutil = require 'gulp-util'
through = require 'through2'
uglify = require 'uglify-js'

EOL = '\n'

compileLess = (file) ->
	Q.Promise (resolve, reject) ->
		less.render(
			file.contents.toString()
			{
				paths: path.dirname file.path
				strictMaths: false
				strictUnits: false
				filename: file.path
			}
			(err, css) ->
				if err
					reject err
				else
					file.contents = new Buffer [
						'<style type="text/css">'
						css
						'</style>'
					].join EOL
					resolve file
		)

compile = (file, wrap) ->
	Q.Promise (resolve, reject) ->
		content = file.contents.toString()
		asyncList = []
		content = content.replace /<!--\s*include\s+(['"])([^'"]+)\.(tpl\.html|less)\1\s*-->/mg, (full, quote, incName, ext) ->
			asyncMark = '<INC_PROCESS_ASYNC_MARK_' + asyncList.length + '>'
			incFilePath = path.resolve path.dirname(file.path), incName + '.' + ext
			incFile = new gutil.File
				base: file.base
				cwd: file.cwd
				path: incFilePath
				contents: fs.readFileSync incFilePath
			if ext is 'less'
				asyncList.push compileLess incFile
			else
				asyncList.push compile(incFile, true)
			asyncMark
		Q.all(asyncList).then(
			(results) ->
				results.forEach (incFile, i) ->
					content = content.replace '<INC_PROCESS_ASYNC_MARK_' + i + '>', incFile.contents.toString()
				strict = (/(^|[^.]+)\B\$data\./).test content
				content = [
					content
				]
				if not strict
					content.unshift '<%with($data) {%>'
					content.push '<%}%>'
				if wrap
					content.unshift '<%;(function() {%>'
					content.push '<%})();%>'
				file.contents = new Buffer content.join EOL
				resolve file
			(err) ->
				reject err
		).done()

beautify = (content) ->
	ast = uglify.parse content
	content = ast.print_to_string beautify: true

module.exports = (opt = {}) ->
	through.obj (file, enc, next) ->
		return @emit 'error', new gutil.PluginError('gulp-mt2amd', 'File can\'t be null') if file.isNull()
		return @emit 'error', new gutil.PluginError('gulp-mt2amd', 'Streams not supported') if file.isStream()
		module.exports.compile(file, opt).then(
			(file) =>
				@push file
				next()
			(err) =>
				@emit 'error', new gutil.PluginError('gulp-mt2amd', err)
		).done()

module.exports.compile = (file, opt = {}) ->
	Q.Promise (resolve, reject) ->
		compile(file).then(
			(processed) =>
				content = [
					"define(function(require, exports, module) {"
					"	function $encodeHtml(str) {"
					"		return (str + '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\x60/g, '&#96;').replace(/\x27/g, '&#39;').replace(/\x22/g, '&quot;');"
					"	}"
					"	exports.render = function($data, $opt) {"
					"		$data = $data || {};"
					"		var _$out_= [];"
					"		var $print = function(str) {_$out_.push(str);};"
					"		_$out_.push('" + processed.contents.toString().replace /<\/script>/ig, '</s<%=""%>cript>'
							.replace(/\r\n|\n|\r/g, "\v")
							.replace(/(?:^|%>).*?(?:<%|$)/g, ($0) ->
								$0.replace(/('|\\)/g, "\\$1").replace(/[\v\t]/g, "").replace(/\s+/g, " ")
							)
							.replace(/[\v]/g, EOL)
							.replace(/<%==(.*?)%>/g, "', $encodeHtml($1), '")
							.replace(/<%=(.*?)%>/g, "', $1, '")
							.replace(/<%(<-)?/g, "');" + EOL + "		")
							.replace(/->(\w+)%>/g, EOL + "		$1.push('")
							.split("%>").join(EOL + "		_$out_.push('") + "');"
					"		return _$out_.join('');"
					"	};"
					"});"
				].join(EOL).replace(/_\$out_\.push\(''\);/g, '')
				if opt.beautify
					content = beautify content
				file.contents = new Buffer content
				file.path = file.path + '.js'
				resolve file
			(err) =>
				reject err
		).done()
