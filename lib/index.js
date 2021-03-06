(function() {
  var EOL, EXPORTS_REGEXP, Q, RIOT_EXT_REGEXP, _, beautify, compile, compileCss, compileLess, compileRiot, compileSass, cssBase64img, cssSprite, fixDefineParams, fs, getBodyDeps, getErrorStack, getUnixStylePath, gulpCssSprite, gutil, htmlBase64img, less, minifier, path, riot, sass, sus, through, uglify;

  _ = require('lodash');

  Q = require('q');

  fs = require('fs');

  path = require('path');

  less = require('gulp-less');

  sass = require('gulp-sass');

  gutil = require('gulp-util');

  through = require('through2');

  uglify = require('uglify-js');

  minifier = require('gulp-minifier');

  sus = require('gulp-sus');

  gulpCssSprite = require('gulp-img-css-sprite');

  riot = require('riot');

  EOL = '\n';

  EXPORTS_REGEXP = /(^|[^.])\b(module\.exports|exports\.[^.]+)\s*=[^=]/;

  RIOT_EXT_REGEXP = /(\.riot\.html|\.tag)$/;

  getUnixStylePath = function(p) {
    return p.split(path.sep).join('/');
  };

  getBodyDeps = function(def) {
    var deps, got;
    deps = [];
    got = {};
    def = def.replace(/(^|[^.])\brequire\s*\(\s*(["'])([^"']+?)\2\s*\)/mg, function(full, lead, quote, dep) {
      var pDep, qDep;
      pDep = dep.replace(/\{\{([^{}]+)\}\}/g, quote + ' + $1 + ' + quote);
      qDep = quote + pDep + quote;
      got[dep] || deps.push(qDep);
      got[dep] = 1;
      if (pDep === dep) {
        return full;
      } else {
        return lead + 'require(' + qDep + ')';
      }
    });
    return {
      def: def,
      deps: deps
    };
  };

  fixDefineParams = function(def, depId, userDefinedBaseDir) {
    var bodyDeps, fix;
    def = getBodyDeps(def);
    bodyDeps = def.deps;
    fix = function(full, b, d, quote, definedId, deps) {
      var bodyDep, id, j, len, tmp;
      if (bodyDeps.length) {
        if (/^\[\s*\]$/.test(deps)) {
          deps = "['require', 'exports', 'module', " + bodyDeps.join(', ') + "]";
        } else if (deps) {
          tmp = deps.replace(/'/g, '"').replace(/\s+/g, '').replace(/"\+"/g, '+');
          deps = deps.replace(/^\[\s*|\s*\]$/g, '').split(/\s*,\s*/);
          for (j = 0, len = bodyDeps.length; j < len; j++) {
            bodyDep = bodyDeps[j];
            if (tmp.indexOf(bodyDep.replace(/'/g, '"').replace(/\s+/g, '').replace(/"\+"/g, '+')) === -1) {
              deps.push(bodyDep);
            }
          }
          deps = '[' + deps.join(', ') + ']';
        } else {
          deps = "['require', 'exports', 'module', " + bodyDeps.join(', ') + "], ";
        }
      }
      if (definedId && !/^\./.test(definedId)) {
        id = definedId;
      } else {
        id = depId || '';
        if (id && !userDefinedBaseDir && !/^\./.test(id)) {
          id = './' + id;
        }
      }
      return [b, d, id && ("'" + getUnixStylePath(id) + "', "), deps || "['require', 'exports', 'module'], "].join('');
    };
    if (!/(^|[^.])\bdefine\s*\(/.test(def.def) && EXPORTS_REGEXP.test(def.def)) {
      def = [fix('define(', '', 'define(') + 'function(require, exports, module) {', def.def, '});'].join(EOL);
    } else {
      def = def.def.replace(/(^|[^.])\b(define\s*\()\s*(?:(["'])([^"'\s]+)\3\s*,\s*)?\s*(\[[^\[\]]*\])?/m, fix);
    }
    return def;
  };

  htmlBase64img = function(data, base, opt) {
    return Q.Promise(function(resolve, reject) {
      if (opt.generateDataUri) {
        data = data.replace(/<img\s([^>]*)src="([^"]+)"/ig, function(full, extra, imgPath) {
          if (!/^data:|\/\//i.test(imgPath)) {
            imgPath = path.resolve(base, imgPath);
            if (fs.existsSync(imgPath)) {
              return '<img ' + extra + 'src="data:image/' + path.extname(imgPath).replace(/^\./, '') + ';base64,' + fs.readFileSync(imgPath, 'base64') + '"';
            } else {
              return full;
            }
          } else {
            return full;
          }
        });
        return resolve(data);
      } else {
        return resolve(data);
      }
    });
  };

  cssBase64img = function(content, filePath, opt) {
    return Q.Promise(function(resolve, reject) {
      if (opt.generateDataUri) {
        return sus.cssContent(content, filePath).then(function(content) {
          return resolve(content);
        }, function(err) {
          return reject(err);
        }).done();
      } else {
        return resolve(content);
      }
    });
  };

  cssSprite = function(content, filePath, opt) {
    return Q.Promise(function(resolve, reject) {
      if (opt.cssSprite) {
        return gulpCssSprite.cssContent(content, filePath, opt.cssSprite).then(function(content) {
          return resolve(content);
        }, function(err) {
          return reject(err);
        }).done();
      } else {
        return resolve(content);
      }
    });
  };

  compileLess = function(file, opt) {
    return Q.Promise(function(resolve, reject) {
      var lessStream, trace;
      if (opt.trace) {
        trace = '/* trace:' + path.relative(process.cwd(), file.path) + ' */' + EOL;
      } else {
        trace = '';
      }
      file._originalPath = file.path;
      lessStream = less(opt.lessOpt);
      lessStream.pipe(through.obj(function(file, enc, next) {
        var content;
        content = opt.postcss ? opt.postcss(file, 'less') : file.contents.toString();
        return cssSprite(content, file.path, opt).then(function(content) {
          return cssBase64img(content, file.path, opt);
        }).then(function(content) {
          file.contents = new Buffer(content);
          minifier.minify(file, {
            minifyCSS: true
          });
          resolve(file);
          return next();
        }, function(err) {
          return reject(err);
        }).done();
      }));
      lessStream.on('error', function(e) {
        console.log('gulp-mt2amd Error:', e.message);
        console.log('file:', file.path);
        return console.log('line:', e.line);
      });
      return lessStream.end(file);
    });
  };

  compileSass = function(file, opt) {
    return Q.Promise(function(resolve, reject) {
      var sassStream, trace;
      if (opt.trace) {
        trace = '/* trace:' + path.relative(process.cwd(), file.path) + ' */' + EOL;
      } else {
        trace = '';
      }
      file._originalPath = file.path;
      sassStream = sass(opt.sassOpt);
      sassStream.on('data', function(file) {
        var content;
        content = opt.postcss ? opt.postcss(file, 'scss') : file.contents.toString();
        return cssSprite(content, file.path, opt).then(function(content) {
          return cssBase64img(content, file.path, opt);
        }).then(function(content) {
          file.contents = new Buffer(content);
          minifier.minify(file, {
            minifyCSS: true
          });
          return resolve(file);
        }, function(err) {
          return reject(err);
        }).done();
      });
      sassStream.on('error', function(e) {
        console.log('gulp-mt2amd Error:', e.message);
        return console.log('file:', file.path);
      });
      return sassStream.write(file);
    });
  };

  compileCss = function(file, opt) {
    return Q.Promise(function(resolve, reject) {
      var content, trace;
      if (opt.trace) {
        trace = '/* trace:' + path.relative(process.cwd(), file.path) + ' */' + EOL;
      } else {
        trace = '';
      }
      file._originalPath = file.path;
      content = opt.postcss ? opt.postcss(file, 'css') : file.contents.toString();
      return cssSprite(content, file.path, opt).then(function(content) {
        return cssBase64img(content, file.path, opt);
      }).then(function(content) {
        file.contents = new Buffer(content);
        minifier.minify(file, {
          minifyCSS: true
        });
        return resolve(file);
      }, function(err) {
        return reject(err);
      }).done();
    });
  };

  compileRiot = function(file, opt) {
    return Q.Promise(function(resolve, reject) {
      var asyncList, content;
      content = file.contents.toString();
      asyncList = [];
      content = content.replace(/<!--\s*include\s+(['"])([^'"]+)\.(less|scss|css)\1\s*-->/mg, function(full, quote, incName, ext) {
        var asyncMark, incFile, incFilePath;
        asyncMark = '<INC_PROCESS_ASYNC_MARK_' + asyncList.length + '>';
        incFilePath = path.resolve(path.dirname(file.path), incName + '.' + ext);
        incFile = new gutil.File({
          base: file.base,
          cwd: file.cwd,
          path: incFilePath,
          contents: fs.readFileSync(incFilePath)
        });
        if (ext === 'less') {
          asyncList.push(compileLess(incFile, _.extend({}, opt, {
            _riot: true
          })));
        }
        if (ext === 'scss') {
          asyncList.push(compileSass(incFile, _.extend({}, opt, {
            _riot: true
          })));
        }
        if (ext === 'css') {
          asyncList.push(compileCss(incFile, _.extend({}, opt, {
            _riot: true
          })));
        }
        return asyncMark;
      });
      return Q.all(asyncList).then(function(results) {
        return htmlBase64img(content, path.dirname(file.path), opt).then(function(content) {
          var m, riotOpt;
          results.forEach(function(incFile, i) {
            var incContent, trace;
            if (path.extname(incFile.path) === '.css') {
              incContent = ['<style type="text/css">', incFile.contents.toString(), '</style>'].join(EOL);
            } else {
              incContent = incFile.contents.toString();
            }
            if (opt.trace) {
              trace = '/* trace:' + path.relative(process.cwd(), incFile._originalPath || incFile.path) + ' */' + EOL;
            } else {
              trace = '';
            }
            return content = trace + content.replace('<INC_PROCESS_ASYNC_MARK_' + i + '>', incContent);
          });
          riotOpt = _.extend({}, opt.riotOpt);
          m = content.match(/(?:^|\r\n|\n|\r)\/\*\*\s*@riot\s+(coffeescript|es6)/);
          if (m) {
            riotOpt.type = m[1];
          }
          content = riot.compile(content, riotOpt);
          file.contents = new Buffer(content);
          return resolve(file);
        }, function(err) {
          return reject(err);
        }).done();
      }, function(err) {
        return reject(err);
      }).done();
    });
  };

  compile = function(file, opt, wrap) {
    return Q.Promise(function(resolve, reject) {
      var asyncList, content;
      content = file.contents.toString();
      asyncList = [];
      content = content.replace(/<!--\s*include\s+(['"])([^'"]+)\.(tpl\.html|less|scss|css)\1\s*-->/mg, function(full, quote, incName, ext) {
        var asyncMark, incFile, incFilePath;
        asyncMark = '<INC_PROCESS_ASYNC_MARK_' + asyncList.length + '>';
        incFilePath = path.resolve(path.dirname(file.path), incName + '.' + ext);
        incFile = new gutil.File({
          base: file.base,
          cwd: file.cwd,
          path: incFilePath,
          contents: fs.readFileSync(incFilePath)
        });
        if (ext === 'tpl.html') {
          asyncList.push(compile(incFile, opt, true));
        }
        if (ext === 'less') {
          asyncList.push(compileLess(incFile, opt));
        }
        if (ext === 'scss') {
          asyncList.push(compileSass(incFile, opt));
        }
        if (ext === 'css') {
          asyncList.push(compileCss(incFile, opt));
        }
        return asyncMark;
      });
      return Q.all(asyncList).then(function(results) {
        return htmlBase64img(content, path.dirname(file.path), opt).then(function(content) {
          var strict, trace;
          results.forEach(function(incFile, i) {
            var incContent, trace;
            if (path.extname(incFile.path) === '.css') {
              incContent = ['<style type="text/css">', incFile.contents.toString(), '</style>'].join(EOL);
            } else {
              incContent = incFile.contents.toString();
            }
            if (opt.trace) {
              trace = '<%/* trace:' + path.relative(process.cwd(), incFile._originalPath || incFile.path) + ' */%>' + EOL;
            } else {
              trace = '';
            }
            return content = content.replace('<INC_PROCESS_ASYNC_MARK_' + i + '>', trace + incContent);
          });
          strict = /(^|[^.])\B\$data\./.test(content);
          if (opt.trace) {
            trace = '<%/* trace:' + path.relative(process.cwd(), file.path) + ' */%>' + EOL;
          } else {
            trace = '';
          }
          content = [trace + content];
          if (!strict) {
            content.unshift('<%with($data) {%>');
            content.push('<%}%>');
          }
          if (wrap) {
            content.unshift('<%;(function() {%>');
            content.push('<%})();%>');
          }
          file.contents = new Buffer(content.join(EOL));
          return resolve(file);
        }, function(err) {
          return reject(err);
        }).done();
      }, function(err) {
        return reject(err);
      }).done();
    });
  };

  beautify = function(content, beautifyOpt) {
    var ast;
    if (typeof beautifyOpt !== 'object') {
      beautifyOpt = {};
    }
    beautifyOpt.beautify = true;
    beautifyOpt.comments = function() {
      return true;
    };
    ast = uglify.parse(content);
    return content = ast.print_to_string(beautifyOpt);
  };

  getErrorStack = function(content, line) {
    var maxLineNoLen, startLine;
    startLine = Math.max(1, line - 2);
    maxLineNoLen = 0;
    content = content.split(/\n|\r\n|\r/).slice(startLine - 1, line + 2);
    content.forEach(function(l, i) {
      var lineNo;
      lineNo = (startLine + i) + (startLine + i === line ? ' ->' : '   ') + '| ';
      maxLineNoLen = Math.max(maxLineNoLen, lineNo.length);
      return content[i] = lineNo + l;
    });
    content.forEach(function(l, i) {
      if (l.split('|')[0].length + 2 < maxLineNoLen) {
        return content[i] = ' ' + l;
      }
    });
    return content.join(EOL);
  };

  module.exports = function(opt) {
    if (opt == null) {
      opt = {};
    }
    return through.obj(function(file, enc, next) {
      if (file.isNull()) {
        return this.emit('error', new gutil.PluginError('gulp-mt2amd', 'File can\'t be null'));
      }
      if (file.isStream()) {
        return this.emit('error', new gutil.PluginError('gulp-mt2amd', 'Streams not supported'));
      }
      return module.exports.compile(file, opt).then((function(_this) {
        return function(file) {
          _this.push(file);
          return next();
        };
      })(this), (function(_this) {
        return function(err) {
          return _this.emit('error', new gutil.PluginError('gulp-mt2amd', err));
        };
      })(this)).done();
    });
  };

  module.exports.fixDefineParams = fixDefineParams;

  module.exports.compile = function(file, opt) {
    if (opt == null) {
      opt = {};
    }
    return Q.Promise(function(resolve, reject) {
      var content, cssCompiler, e, error, extName, originFilePath, trace;
      originFilePath = file.path;
      extName = path.extname(originFilePath).toLowerCase();
      if (RIOT_EXT_REGEXP.test(originFilePath)) {
        return compileRiot(file, opt).then(function(file) {
          var content, e, error, processedContent, trace;
          if (opt.trace) {
            trace = '/* trace:' + path.relative(process.cwd(), originFilePath) + ' */' + EOL;
          } else {
            trace = '';
          }
          processedContent = file.contents.toString();
          content = [trace, opt.commonjs ? "" : "define(function(require, exports, module) {", /(?:^|[^.])\brequire\s*\((["'])riot\1\s*\)/.test(processedContent) ? "" : "riot = require('riot');", processedContent, EXPORTS_REGEXP.test(processedContent) ? "" : "module.exports = '" + path.basename(originFilePath).replace(RIOT_EXT_REGEXP, '') + "'", opt.commonjs ? "" : "});"].join(EOL);
          if (!opt.commonjs) {
            content = fixDefineParams(content);
          }
          if (opt.beautify) {
            try {
              content = beautify(content, opt.beautify);
            } catch (error) {
              e = error;
              console.log('gulp-mt2amd Error:', e.message);
              console.log('file:', file.path);
              console.log(getErrorStack(content, e.line));
            }
          }
          file.contents = new Buffer(content);
          file.path = originFilePath.replace(RIOT_EXT_REGEXP, '.js');
          return resolve(file);
        }, function(err) {
          return reject(err);
        }).done();
      } else if (extName === '.json') {
        if (opt.trace) {
          trace = '/* trace:' + path.relative(process.cwd(), originFilePath) + ' */' + EOL;
        } else {
          trace = '';
        }
        try {
          content = JSON.parse(file.contents.toString());
        } catch (error) {
          e = error;
          gutil.log(gutil.colors.red('gulp-mt2amd Error: invalid json file ' + file.path));
          throw e;
        }
        content = [trace + (opt.commonjs ? "" : "define(function(require, exports, module) {"), 'module.exports = ' + JSON.stringify(content, null, 2) + ';', opt.commonjs ? "" : "});"].join(EOL);
        file.contents = new Buffer(content);
        file.path = originFilePath + '.js';
        return resolve(file);
      } else if (extName === '.png' || extName === '.jpg' || extName === '.jpeg' || extName === '.gif' || extName === '.svg') {
        if (opt.trace) {
          trace = '/* trace:' + path.relative(process.cwd(), originFilePath) + ' */' + EOL;
        } else {
          trace = '';
        }
        content = [trace + (opt.commonjs ? "" : "define(function(require, exports, module) {"), '	module.exports = "data:image/' + extName.replace(/^\./, '') + ';base64,' + fs.readFileSync(originFilePath, 'base64') + '";', opt.commonjs ? "" : "});"].join(EOL);
        file.contents = new Buffer(content);
        file.path = originFilePath + '.js';
        return resolve(file);
      } else if (extName === '.less' || extName === '.scss' || extName === '.css') {
        if (extName === '.less') {
          cssCompiler = compileLess;
        } else if (extName === '.scss') {
          cssCompiler = compileSass;
        } else {
          cssCompiler = compileCss;
        }
        return cssCompiler(file, opt).then(function(file) {
          var error1;
          if (opt.trace) {
            trace = '/* trace:' + path.relative(process.cwd(), originFilePath) + ' */' + EOL;
          } else {
            trace = '';
          }
          content = [trace + (opt.commonjs ? "" : "define(function(require, exports, module) {"), "var cssContent = '" + file.contents.toString().replace(/\r\n|\n|\r/g, '').replace(/('|\\)/g, '\\$1') + "';", "var moduleUri = module && module.uri;\nvar head = document.head || document.getElementsByTagName('head')[0];\nvar styleTagId = 'yom-style-module-inject-tag';\nvar styleTag = document.getElementById(styleTagId);\nif (!styleTag) {\n	styleTag = document.createElement('style');\n	styleTag.id = styleTagId;\n	styleTag.type = 'text/css';\n	styleTag = head.appendChild(styleTag);\n}\nwindow._yom_style_module_injected = window._yom_style_module_injected || {};\nif (!moduleUri) {\n	styleTag.appendChild(document.createTextNode(cssContent + '\\n'));\n} else if(!window._yom_style_module_injected[moduleUri]) {\n	styleTag.appendChild(document.createTextNode('/* ' + moduleUri + ' */\\n' + cssContent + '\\n'));\n	window._yom_style_module_injected[moduleUri] = 1;\n}\nmodule.exports = cssContent;", opt.commonjs ? "" : "});"].join(EOL);
          if (opt.beautify) {
            try {
              content = beautify(content, opt.beautify);
            } catch (error1) {
              e = error1;
              console.log('gulp-mt2amd Error:', e.message);
              console.log('file:', file.path);
              console.log(getErrorStack(content, e.line));
            }
          }
          file.contents = new Buffer(content);
          file.path = originFilePath + '.js';
          return resolve(file);
        }, function(err) {
          return reject(err);
        }).done();
      } else {
        return compile(file, opt).then((function(_this) {
          return function(processed) {
            var error1;
            content = [
              opt.commonjs ? "" : "define(function(require, exports, module) {", "	function $encodeHtml(str) {", "		return (str + '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\x60/g, '&#96;').replace(/\x27/g, '&#39;').replace(/\x22/g, '&quot;');", "	}", "	exports.render = function($data, $opt) {", "		$data = $data || {};", "		var _$out_= '';", "		var $print = function(str) {_$out_ += str;};", "		_$out_ += '" + processed.contents.toString().replace(/<\/script>/ig, '</s<%=""%>cript>').replace(/\r\n|\n|\r/g, "\v").replace(/(?:^|%>).*?(?:<%|$)/g, function($0) {
                return $0.replace(/('|\\)/g, "\\$1").replace(/[\v\t]/g, "").replace(/\s+/g, " ");
              }).replace(/[\v]/g, EOL).replace(/<%==(.*?)%>/g, "' + $encodeHtml($1) + '").replace(/<%=(.*?)%>/g, "' + ($1) + '").replace(/<%(<-)?/g, "';" + EOL + "		").replace(/->(\w+)%>/g, EOL + "		$1 += '").split("%>").join(EOL + "		_$out_ += '") + "';", "		return _$out_;", "	};", opt.commonjs ? "" : "});"
            ].join(EOL).replace(/_\$out_ \+= '';/g, '');
            if (!opt.commonjs) {
              content = fixDefineParams(content);
            }
            if (opt.beautify) {
              try {
                content = beautify(content, opt.beautify);
              } catch (error1) {
                e = error1;
                console.log('gulp-mt2amd Error:', e.message);
                console.log('file:', file.path);
                console.log(getErrorStack(content, e.line));
              }
            }
            file.contents = new Buffer(content);
            file.path = file.path + '.js';
            return resolve(file);
          };
        })(this), (function(_this) {
          return function(err) {
            return reject(err);
          };
        })(this)).done();
      }
    });
  };

}).call(this);
