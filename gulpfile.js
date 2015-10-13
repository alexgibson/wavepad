'use strict';

var gulp = require('gulp');
var watch = require('gulp-watch');
var deploy = require('gulp-gh-pages');
var jshint = require('gulp-jshint');
var browserify = require('browserify');
var babelify = require('babelify');
var uglify = require('gulp-uglify');
var gulpif = require('gulp-if');
var minimist = require('minimist');
var source = require('vinyl-source-stream');
var buffer = require('vinyl-buffer');
var del = require('del');

var knownOptions = {
    string: ['env', 'smp'],
    default: {
        env: process.env.NODE_ENV || 'production',
        smp: '/path/to/project/root/'
    }
};

var options = minimist(process.argv.slice(2), knownOptions);
var _debug = options.env === 'development' ? true : false;

gulp.task('deploy', ['js:compile'], function () {
    return gulp.src(['./**/*', '!./node_modules/**'])
        .pipe(deploy({ cacheDir: '.publish' }));
});

gulp.task('js:compile', ['clean', 'js:lint'], function() {
    return browserify({ debug: _debug })
        .transform(babelify.configure({
          sourceMapRelative: options.smp
        }))
        .require('./src/app.js', {
            entry: true
        })
        .bundle()
        .on('error', function (err) {
            console.log('Error : ' + err.message);
        })
        .pipe(source('bundle.js'))
        .pipe(gulpif(options.env === 'production', buffer()))
        .pipe(gulpif(options.env === 'production', uglify()))
        .pipe(gulp.dest('./dist'));
});

gulp.task('js:lint', function() {
    return gulp.src('./src/**/*.js')
        .pipe(jshint({ esnext: true }))
        .pipe(jshint.reporter('default'));
});

gulp.task('clean', function () {
    return  del(['dist/**']);
});

gulp.task('default', function () {
    gulp.start('js:compile');
    watch('./src/**/*.js', function () {
        gulp.start('js:compile');
    });
});
