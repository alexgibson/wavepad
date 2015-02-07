'use strict';

var fs = require('fs');
var gulp = require('gulp');
var to5 = require('gulp-6to5');
var watch = require('gulp-watch');
var deploy = require('gulp-gh-pages');
var jshint = require('gulp-jshint');
var browserify = require('browserify');
var to5ify = require('6to5ify');

var options = {
    cacheDir: './tmp'
};

gulp.task('deploy', ['js:lint', 'js:compile'], function () {
    return gulp.src(['./**/*', '!./node_modules/**', '!./tmp/**'])
        .pipe(deploy(options));
});

gulp.task('js:compile', function() {
    browserify({ debug: true })
    .transform(to5ify)
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
