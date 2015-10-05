Wave-PD1
========

[![devDependency Status](https://david-dm.org/alexgibson/wavepad/dev-status.svg)](https://david-dm.org/alexgibson/wavepad/#info=devDependencies)

An experimental synthesizer built using the [Web Audio API](http://www.w3.org/TR/webaudio/), written in ES6 and compiled using [Babel](https://babeljs.io/).

https://alexgibson.github.io/wavepad

![](/images/screenshot.png?raw=true)

Audio node graph
----------------

![](/images/wavapad-audio-graph.png?raw=true)

Install
-------

```
npm install
```

Run
---

To build from source and watch for changes:

```
gulp
```

By default Javascript is compiled and minified in production mode. To run unminified and with source maps enabled, simply run:

```
gulp --env development --smp /path/to/project/root/
```

Note the `smp` argument is to append the relative path for source maps to work.

Deploy
------

To automatically build and deploy to `gh-pages` branch:

```
gulp deploy
```
