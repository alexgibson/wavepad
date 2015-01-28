'use strict';

var gulp = require('gulp');
var watch = require('gulp-watch');
var deploy = require('gulp-gh-pages');
var jshint = require('gulp-jshint');

var options = {
    branch: 'gh-pages'
};

gulp.task('deploy', ['js:lint'], function () {
    return gulp.src(['./**/*', '!./node_modules/**'])
        .pipe(deploy(options));
});

gulp.task('js:lint', function() {
    return gulp.src('./js/*.js')
        .pipe(jshint())
        .pipe(jshint.reporter('default'));
});

gulp.task('default', function () {
    watch('./js/*.js', function () {
        gulp.start('js:lint');
    });
});
