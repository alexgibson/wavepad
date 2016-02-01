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
var runSequence = require('run-sequence');

var knownOptions = {
    string: ['env', 'smp'],
    default: {
        env: process.env.NODE_ENV || 'production',
        smp: '/path/to/project/root/'
    }
};

var options = minimist(process.argv.slice(2), knownOptions);
var _debug = options.env === 'development' ? true : false;

gulp.task('deploy', function () {
    return runSequence('clean', ['js:compile', 'copy'], 'push');
});

gulp.task('push', function() {
    return gulp.src(['./dist/**/*'])
        .pipe(deploy({ cacheDir: '.publish' }));
});

gulp.task('copy', function() {
    return gulp.src(['./src/**/*', '!./src/js/*'])
        .pipe(gulp.dest('dist'));
});

gulp.task('clean', function () {
    return  del(['dist/**/*']);
});

gulp.task('build', function() {
    return runSequence('clean', ['js:compile', 'copy']);
});

gulp.task('js:compile', ['js:lint'], function() {
    return browserify({ debug: _debug })
        .transform(babelify.configure({
          sourceMapRelative: options.smp,
          presets: ['es2015']
        }))
        .require('./src/js/app.js', {
            entry: true
        })
        .bundle()
        .on('error', function (err) {
            console.log('Error : ' + err.message);
        })
        .pipe(source('bundle.js'))
        .pipe(gulpif(options.env === 'production', buffer()))
        .pipe(gulpif(options.env === 'production', uglify()))
        .pipe(gulp.dest('./dist/js/'));
});

gulp.task('js:lint', function() {
    return gulp.src('./src/**/*.js')
        .pipe(jshint({ esnext: true }))
        .pipe(jshint.reporter('default'));
});

gulp.task('default', function () {
    gulp.start('build');
    watch('./src/**/*', function () {
        runSequence('js:compile', 'copy');
    });
});
