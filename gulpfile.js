'use strict';

var fs = require('fs');
var gulp = require('gulp');
var watch = require('gulp-watch');
var deploy = require('gulp-gh-pages');
var jshint = require('gulp-jshint');
var browserify = require('browserify');
var babelify = require('babelify');
var uglify = require('gulp-uglify');

var options = {
    cacheDir: './tmp'
};

var _debug = false;
var _sourceMapPath = '/Users/alexgibson/Git/wavepad/';

gulp.task('deploy', ['js:lint', 'js:compile'], function () {
    return gulp.src(['./**/*', '!./node_modules/**', '!./tmp/**'])
        .pipe(deploy(options));
});

gulp.task('js:compile', function() {
    browserify({ debug: _debug })
    .transform(babelify.configure({
      sourceMapRelative: _sourceMapPath
    }))
    .require('./src/app.js', {
        entry: true
    })
    .bundle()
    .on('error', function (err) {
        console.log('Error : ' + err.message);
    })
    .pipe(fs.createWriteStream('./dist/bundle.js'));
});

gulp.task('js:lint', function() {
    return gulp.src('./src/**/*.js')
        .pipe(jshint({ esnext: true }))
        .pipe(jshint.reporter('default'));
});

gulp.task('default', function () {
    watch('./src/**/*.js', function () {
        gulp.start('js:lint');
        gulp.start('js:compile');
    });
});


