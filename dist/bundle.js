(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";

var _interopRequire = function (obj) { return obj && obj.__esModule ? obj["default"] : obj; };

var rAF = _interopRequire(require("./rAF"));

var Wavepad = _interopRequire(require("./wavepad"));

window.addEventListener("DOMContentLoaded", function () {
    var app = new Wavepad("wave-pd1");

    app.init();
});

},{"./rAF":2,"./wavepad":3}],2:[function(require,module,exports){
"use strict";

// http://paulirish.com/2011/requestanimationframe-for-smart-animating/
// http://my.opera.com/emoller/blog/2011/12/20/requestanimationframe-for-smart-er-animating

// requestAnimationFrame polyfill by Erik Möller
// fixes from Paul Irish and Tino Zijdel

var rAF = (function () {
    var lastTime = 0;
    var vendors = ["ms", "moz", "webkit", "o"];
    for (var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
        window.requestAnimationFrame = window[vendors[x] + "RequestAnimationFrame"];
        window.cancelAnimationFrame = window[vendors[x] + "CancelAnimationFrame"] || window[vendors[x] + "CancelRequestAnimationFrame"];
    }

    if (!window.requestAnimationFrame) {
        window.requestAnimationFrame = function (callback, element) {
            var currTime = new Date().getTime();
            var timeToCall = Math.max(0, 16 - (currTime - lastTime));
            var id = window.setTimeout(function () {
                callback(currTime + timeToCall);
            }, timeToCall);
            lastTime = currTime + timeToCall;
            return id;
        };
    }

    if (!window.cancelAnimationFrame) {
        window.cancelAnimationFrame = function (id) {
            clearTimeout(id);
        };
    }
})();

module.exports = rAF;

},{}],3:[function(require,module,exports){
"use strict";

var _prototypeProperties = function (child, staticProps, instanceProps) { if (staticProps) Object.defineProperties(child, staticProps); if (instanceProps) Object.defineProperties(child.prototype, instanceProps); };

var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };

var Wavepad = (function () {
    function Wavepad(id, options) {
        _classCallCheck(this, Wavepad);

        // default options
        this.options = {
            waveform: "square",
            filter: "lowpass",
            delay: 0.5,
            feedback: 0.4,
            barColor: "#1d1c25"
        };

        // set configurable options
        if (typeof options === "object") {
            for (var i in options) {
                if (options.hasOwnProperty(i)) {
                    this.options[i] = options[i];
                }
            }
        }

        // Web Audio Node references
        this.source = null;
        this.nodes = {};
        this.myAudioContext = null;
        this.myAudioAnalyser = null;

        // normalize and create a new AudioContext if supported
        window.AudioContext = window.AudioContext || window.webkitAudioContext;

        if ("AudioContext" in window) {
            this.myAudioContext = new AudioContext();
        } else {
            throw new Error("wavepad.js: browser does not support Web Audio API");
        }

        if (typeof id !== "string" && typeof id !== "object") {
            throw new Error("wavepad.js: first argument must be a valid DOM identifier");
        }

        // UI DOM references
        this.synth = typeof id === "object" ? id : document.getElementById(id);
        this.surface = this.synth.querySelector(".surface");
        this.finger = this.synth.querySelector(".finger");
        this.waveform = this.synth.querySelector("#waveform");
        this.filter = this.synth.querySelector("#filter-type");
        this.powerToggle = this.synth.querySelector("#power");
        this.delayTimeInput = this.synth.querySelector("#delay");
        this.feedbackGainInput = this.synth.querySelector("#feedback");
        this.delayTimeOutput = this.synth.querySelector("#delay-output");
        this.feedbackGainOutput = this.synth.querySelector("#feedback-output");

        // Canvas graph for audio frequency analyzer
        this.canvas = this.synth.querySelector("canvas");
        this.ctx = this.canvas.getContext("2d");

        this.hasTouch = false;
        this.isSmallViewport = false;
        this.isPlaying = false;
    }

    _prototypeProperties(Wavepad, null, {
        init: {
            value: function init() {
                // bind resize handler for canvas & touch references
                this.handleResize();

                // store references to bound events
                // so we can unbind when needed
                this.startHandler = this.start.bind(this);
                this.moveHandler = this.move.bind(this);
                this.stopHandler = this.stop.bind(this);

                // set default values that we're supplied
                this.delayTimeInput.value = this.options.delay;
                this.feedbackGainInput.value = this.options.feedback;
                this.waveform.value = this.options.waveform;
                this.filter.value = this.options.filter;
                this.updateOutputs();

                // bind UI control events
                this.powerToggle.addEventListener("click", this.togglePower.bind(this));
                this.waveform.addEventListener("change", this.setWaveform.bind(this));
                this.filter.addEventListener("change", this.filterChange.bind(this));
                this.delayTimeInput.addEventListener("input", this.delayChange.bind(this));
                this.feedbackGainInput.addEventListener("input", this.feedbackChange.bind(this));

                // create Web Audio nodes
                this.nodes.oscVolume = this.myAudioContext.createGain();
                this.nodes.filter = this.myAudioContext.createBiquadFilter();
                this.nodes.volume = this.myAudioContext.createGain();
                this.nodes.delay = this.myAudioContext.createDelay();
                this.nodes.feedbackGain = this.myAudioContext.createGain();
                this.nodes.compressor = this.myAudioContext.createDynamicsCompressor();

                // create frequency analyser node
                this.myAudioAnalyser = this.myAudioContext.createAnalyser();
                this.myAudioAnalyser.smoothingTimeConstant = 0.85;

                // start fAF for frequency analyser
                this.animateSpectrum();

                // prevent default scrolling when touchmove fires on surface
                this.surface.addEventListener("touchmove", function (e) {
                    e.preventDefault();
                });
            },
            writable: true,
            configurable: true
        },
        handleResize: {
            value: function handleResize() {
                var _this = this;
                var breakPoint = window.matchMedia("(max-width: 512px)");
                // set default canvas size
                this.isSmallViewport = breakPoint.matches ? true : false;
                this.setCanvasSize();

                // listen for resize events
                breakPoint.addListener(function (mql) {
                    _this.isSmallViewport = mql.matches ? true : false;
                    _this.setCanvasSize();
                });
            },
            writable: true,
            configurable: true
        },
        routeSounds: {
            value: function routeSounds() {
                this.source = this.myAudioContext.createOscillator();

                this.setWaveform(this.waveform);
                this.filterChange(this.filter);
                this.nodes.feedbackGain.gain.value = this.options.feedback;
                this.nodes.delay.delayTime.value = this.options.delay;
                this.nodes.volume.gain.value = 0.2;
                this.nodes.oscVolume.gain.value = 0;

                this.source.connect(this.nodes.oscVolume);
                this.nodes.oscVolume.connect(this.nodes.filter);
                this.nodes.filter.connect(this.nodes.compressor);
                this.nodes.filter.connect(this.nodes.delay);
                this.nodes.delay.connect(this.nodes.feedbackGain);
                this.nodes.delay.connect(this.nodes.compressor);
                this.nodes.feedbackGain.connect(this.nodes.delay);
                this.nodes.compressor.connect(this.nodes.volume);
                this.nodes.volume.connect(this.myAudioAnalyser);
                this.myAudioAnalyser.connect(this.myAudioContext.destination);
            },
            writable: true,
            configurable: true
        },
        startOsc: {
            value: function startOsc() {
                this.source.start(0);
                this.isPlaying = true;
            },
            writable: true,
            configurable: true
        },
        stopOsc: {
            value: function stopOsc() {
                this.source.stop(0);
                this.isPlaying = false;
            },
            writable: true,
            configurable: true
        },
        bindSurfaceEvents: {
            value: function bindSurfaceEvents() {
                this.surface.addEventListener("mousedown", this.startHandler);
                this.surface.addEventListener("touchstart", this.startHandler);
            },
            writable: true,
            configurable: true
        },
        unbindSurfaceEvents: {
            value: function unbindSurfaceEvents() {
                this.surface.removeEventListener("mousedown", this.startHandler);
                this.surface.removeEventListener("touchstart", this.startHandler);
            },
            writable: true,
            configurable: true
        },
        togglePower: {
            value: function togglePower() {
                if (this.isPlaying) {
                    this.stopOsc();
                    this.myAudioAnalyser.disconnect();
                    this.unbindSurfaceEvents();
                } else {
                    this.routeSounds();
                    this.startOsc();
                    this.bindSurfaceEvents();
                }

                this.synth.classList.toggle("off");
            },
            writable: true,
            configurable: true
        },
        start: {
            value: function start(e) {
                var x = e.type === "touchstart" ? e.touches[0].pageX : e.pageX;
                var y = e.type === "touchstart" ? e.touches[0].pageY : e.pageY;
                var multiplier = this.isSmallViewport ? 2 : 1;

                if (e.type === "touchstart") {
                    this.hasTouch = true;
                } else if (e.type === "mousedown" && this.hasTouch) {
                    return;
                }

                if (!this.isPlaying) {
                    this.routeSounds();
                    this.startOsc();
                }

                x = x - this.surface.offsetLeft;
                y = y - this.surface.offsetTop;

                this.nodes.oscVolume.gain.value = 1;
                this.source.frequency.value = x * multiplier;
                this.nodes.filter.frequency.value = this.setFilterFrequency(y);

                this.finger.style.webkitTransform = this.finger.style.transform = "translate3d(" + x + "px, " + y + "px, 0)";
                this.finger.classList.add("active");

                this.surface.addEventListener("touchmove", this.moveHandler);
                this.surface.addEventListener("touchend", this.stopHandler);
                this.surface.addEventListener("touchcancel", this.stopHandler);
                this.surface.addEventListener("mousemove", this.moveHandler);
                this.surface.addEventListener("mouseup", this.stopHandler);
            },
            writable: true,
            configurable: true
        },
        move: {
            value: function move(e) {
                var x = e.type === "touchmove" ? e.touches[0].pageX : e.pageX;
                var y = e.type === "touchmove" ? e.touches[0].pageY : e.pageY;

                if (e.type === "mousemove" && this.hasTouch) {
                    return;
                }

                if (this.isPlaying) {
                    var multiplier = this.isSmallViewport ? 2 : 1;
                    x = x - this.surface.offsetLeft;
                    y = y - this.surface.offsetTop;
                    this.source.frequency.value = x * multiplier;
                    this.nodes.filter.frequency.value = this.setFilterFrequency(y);
                }

                this.finger.style.webkitTransform = this.finger.style.transform = "translate3d(" + x + "px, " + y + "px, 0)";
            },
            writable: true,
            configurable: true
        },
        stop: {
            value: function stop(e) {
                var x = e.type === "touchend" ? e.changedTouches[0].pageX : e.pageX;
                var y = e.type === "touchend" ? e.changedTouches[0].pageY : e.pageY;

                if (this.isPlaying) {
                    var multiplier = this.isSmallViewport ? 2 : 1;
                    x = x - this.surface.offsetLeft;
                    y = y - this.surface.offsetTop;
                    this.source.frequency.value = x * multiplier;
                    this.nodes.filter.frequency.value = this.setFilterFrequency(y);
                    this.nodes.oscVolume.gain.value = 0;
                }

                this.finger.classList.remove("active");

                this.surface.removeEventListener("mousemove", this.moveHandler);
                this.surface.removeEventListener("mouseup", this.stopHandler);
                this.surface.removeEventListener("touchmove", this.moveHandler);
                this.surface.removeEventListener("touchend", this.stopHandler);
                this.surface.removeEventListener("touchcancel", this.stopHandler);
            },
            writable: true,
            configurable: true
        },
        updateOutputs: {
            value: function updateOutputs() {
                this.delayTimeOutput.value = Math.round(this.delayTimeInput.value * 1000) + " ms";
                this.feedbackGainOutput.value = Math.round(this.feedbackGainInput.value * 10);
            },
            writable: true,
            configurable: true
        },
        setWaveform: {
            value: function setWaveform(option) {
                this.source.type = option.value || option.target.value;
            },
            writable: true,
            configurable: true
        },
        delayChange: {
            value: function delayChange(e) {
                this.options.delay = e.target.value;
                if (this.isPlaying) {
                    this.stopOsc();
                    this.nodes.delay.delayTime.value = this.options.delay;
                }
                this.updateOutputs();
            },
            writable: true,
            configurable: true
        },
        feedbackChange: {
            value: function feedbackChange(e) {
                this.options.feedback = e.target.value;
                if (this.isPlaying) {
                    this.stopOsc();
                    this.nodes.feedbackGain.gain.value = this.options.feedback;
                }
                this.updateOutputs();
            },
            writable: true,
            configurable: true
        },
        setFilterFrequency: {

            /**
             * Set filter frequency based on (y) axis value
             */
            value: function setFilterFrequency(y) {
                // min 40Hz
                var min = 40;
                // max half of the sampling rate
                var max = this.myAudioContext.sampleRate / 2;
                // Logarithm (base 2) to compute how many octaves fall in the range.
                var numberOfOctaves = Math.log(max / min) / Math.LN2;
                // Compute a multiplier from 0 to 1 based on an exponential scale.
                var multiplier = Math.pow(2, numberOfOctaves * (2 / this.surface.clientHeight * (this.surface.clientHeight - y) - 1));
                // Get back to the frequency value between min and max.
                return max * multiplier;
            },
            writable: true,
            configurable: true
        },
        filterChange: {
            value: function filterChange(option) {
                this.nodes.filter.type = option.value || option.target.value;
            },
            writable: true,
            configurable: true
        },
        animateSpectrum: {
            value: function animateSpectrum() {
                // Limit canvas redraw to 40 fps
                setTimeout(this.onTick.bind(this), 1000 / 40);
            },
            writable: true,
            configurable: true
        },
        onTick: {
            value: function onTick() {
                this.drawSpectrum();
                requestAnimationFrame(this.animateSpectrum.bind(this));
            },
            writable: true,
            configurable: true
        },
        setCanvasSize: {
            value: function setCanvasSize() {
                var canvasSize = this.isSmallViewport ? 256 : 512;
                this.canvas.width = this.canvas.height = canvasSize - 10;
                // set canvas graph color
                this.ctx.fillStyle = this.options.barColor;
            },
            writable: true,
            configurable: true
        },
        drawSpectrum: {

            /**
             * Draw the canvas frequency data graph
             */
            value: function drawSpectrum() {
                var canvasSize = this.isSmallViewport ? 256 : 512;
                var barWidth = this.isSmallViewport ? 10 : 20;
                var barCount = Math.round(canvasSize / barWidth);
                var freqByteData = new Uint8Array(this.myAudioAnalyser.frequencyBinCount);

                this.myAudioAnalyser.getByteFrequencyData(freqByteData);
                this.ctx.clearRect(0, 0, canvasSize, canvasSize);

                for (var i = 0; i < barCount; i += 1) {
                    var magnitude = freqByteData[i];
                    var multiplier = this.isSmallViewport ? 1 : 2;
                    // some values need adjusting to fit on the canvas
                    this.ctx.fillRect(barWidth * i, canvasSize, barWidth - 1, -magnitude * multiplier);
                }
            },
            writable: true,
            configurable: true
        }
    });

    return Wavepad;
})();

module.exports = Wavepad;

},{}]},{},[1])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvYXBwLmpzIiwic3JjL3JBRi5qcyIsInNyYy93YXZlcGFkLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7OztJQ0FPLEdBQUcsMkJBQU0sT0FBTzs7SUFDaEIsT0FBTywyQkFBTSxXQUFXOztBQUUvQixNQUFNLENBQUMsZ0JBQWdCLENBQUMsa0JBQWtCLEVBQUUsWUFBTTtBQUU5QyxRQUFJLEdBQUcsR0FBRyxJQUFJLE9BQU8sQ0FBQyxVQUFVLENBQUMsQ0FBQzs7QUFFbEMsT0FBRyxDQUFDLElBQUksRUFBRSxDQUFDO0NBQ2QsQ0FBQyxDQUFDOzs7Ozs7Ozs7OztBQ0ZILElBQUksR0FBRyxHQUFHLENBQUMsWUFBWTtBQUNuQixRQUFJLFFBQVEsR0FBRyxDQUFDLENBQUM7QUFDakIsUUFBSSxPQUFPLEdBQUcsQ0FBQyxJQUFJLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxHQUFHLENBQUMsQ0FBQztBQUMzQyxTQUFJLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsT0FBTyxDQUFDLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxxQkFBcUIsRUFBRSxFQUFFLENBQUMsRUFBRTtBQUNyRSxjQUFNLENBQUMscUJBQXFCLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsR0FBQyx1QkFBdUIsQ0FBQyxDQUFDO0FBQzFFLGNBQU0sQ0FBQyxvQkFBb0IsR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxHQUFDLHNCQUFzQixDQUFDLElBQUksTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsR0FBQyw2QkFBNkIsQ0FBQyxDQUFDO0tBQy9IOztBQUVELFFBQUksQ0FBQyxNQUFNLENBQUMscUJBQXFCLEVBQUU7QUFDL0IsY0FBTSxDQUFDLHFCQUFxQixHQUFHLFVBQVMsUUFBUSxFQUFF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Q0FBQyxpQkFBaUIsQ0FBQyxDQUFDOztBQUU1RSxvQkFBSSxDQUFDLGVBQWUsQ0FBQyxvQkFBb0IsQ0FBQyxZQUFZLENBQUMsQ0FBQztBQUN4RCxvQkFBSSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxVQUFVLEVBQUUsVUFBVSxDQUFDLENBQUM7O0FBRWpELHFCQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsUUFBUSxFQUFFLENBQUMsSUFBSSxDQUFDLEVBQUU7QUFDbEMsd0JBQU0sU0FBUyxHQUFHLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNsQyx3QkFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLGVBQWUsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDOztBQUVoRCx3QkFBSSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsUUFBUSxHQUFHLENBQUMsRUFBRSxVQUFVLEVBQUUsUUFBUSxHQUFHLENBQUMsRUFBRSxDQUFDLFNBQVMsR0FBRyxVQUFVLENBQUMsQ0FBQztpQkFDdEY7YUFDSjs7Ozs7O1dBM1VDLE9BQU87OztpQkE4VUUsT0FBTyIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJpbXBvcnQgckFGIGZyb20gJy4vckFGJztcbmltcG9ydCBXYXZlcGFkIGZyb20gJy4vd2F2ZXBhZCc7XG5cbndpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdET01Db250ZW50TG9hZGVkJywgKCkgPT4ge1xuXG4gICAgdmFyIGFwcCA9IG5ldyBXYXZlcGFkKCd3YXZlLXBkMScpO1xuXG4gICAgYXBwLmluaXQoKTtcbn0pO1xuIiwiLy8gaHR0cDovL3BhdWxpcmlzaC5jb20vMjAxMS9yZXF1ZXN0YW5pbWF0aW9uZnJhbWUtZm9yLXNtYXJ0LWFuaW1hdGluZy9cbi8vIGh0dHA6Ly9teS5vcGVyYS5jb20vZW1vbGxlci9ibG9nLzIwMTEvMTIvMjAvcmVxdWVzdGFuaW1hdGlvbmZyYW1lLWZvci1zbWFydC1lci1hbmltYXRpbmdcblxuLy8gcmVxdWVzdEFuaW1hdGlvbkZyYW1lIHBvbHlmaWxsIGJ5IEVyaWsgTcO2bGxlclxuLy8gZml4ZXMgZnJvbSBQYXVsIElyaXNoIGFuZCBUaW5vIFppamRlbFxuXG52YXIgckFGID0gKGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgbGFzdFRpbWUgPSAwO1xuICAgIHZhciB2ZW5kb3JzID0gWydtcycsICdtb3onLCAnd2Via2l0JywgJ28nXTtcbiAgICBmb3IodmFyIHggPSAwOyB4IDwgdmVuZG9ycy5sZW5ndGggJiYgIXdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWU7ICsreCkge1xuICAgICAgICB3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lID0gd2luZG93W3ZlbmRvcnNbeF0rJ1JlcXVlc3RBbmltYXRpb25GcmFtZSddO1xuICAgICAgICB3aW5kb3cuY2FuY2VsQW5pbWF0aW9uRnJhbWUgPSB3aW5kb3dbdmVuZG9yc1t4XSsnQ2FuY2VsQW5pbWF0aW9uRnJhbWUnXSB8fCB3aW5kb3dbdmVuZG9yc1t4XSsnQ2FuY2VsUmVxdWVzdEFuaW1hdGlvbkZyYW1lJ107XG4gICAgfVxuXG4gICAgaWYgKCF3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lKSB7XG4gICAgICAgIHdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUgPSBmdW5jdGlvbihjYWxsYmFjaywgZWxlbWVudCkge1xuICAgICAgICAgICAgdmFyIGN1cnJUaW1lID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG4gICAgICAgICAgICB2YXIgdGltZVRvQ2FsbCA9IE1hdGgubWF4KDAsIDE2IC0gKGN1cnJUaW1lIC0gbGFzdFRpbWUpKTtcbiAgICAgICAgICAgIHZhciBpZCA9IHdpbmRvdy5zZXRUaW1lb3V0KGZ1bmN0aW9uKCkgeyBjYWxsYmFjayhjdXJyVGltZSArIHRpbWVUb0NhbGwpOyB9LFxuICAgICAgICAgICAgICB0aW1lVG9DYWxsKTtcbiAgICAgICAgICAgIGxhc3RUaW1lID0gY3VyclRpbWUgKyB0aW1lVG9DYWxsO1xuICAgICAgICAgICAgcmV0dXJuIGlkO1xuICAgICAgICB9O1xuICAgIH1cblxuICAgIGlmICghd2luZG93LmNhbmNlbEFuaW1hdGlvbkZyYW1lKSB7XG4gICAgICAgIHdpbmRvdy5jYW5jZWxBbmltYXRpb25GcmFtZSA9IGZ1bmN0aW9uKGlkKSB7XG4gICAgICAgICAgICBjbGVhclRpbWVvdXQoaWQpO1xuICAgICAgICB9O1xuICAgIH1cbn0pKCk7XG5cbmV4cG9ydCBkZWZhdWx0IHJBRjtcbiIsImNsYXNzIFdhdmVwYWQge1xuXG4gICAgY29uc3RydWN0b3IoaWQsIG9wdGlvbnMpIHtcbiAgICAgICAgLy8gZGVmYXVsdCBvcHRpb25zXG4gICAgICAgIHRoaXMub3B0aW9ucyA9IHtcbiAgICAgICAgICAgIHdhdmVmb3JtOiAnc3F1YXJlJyxcbiAgICAgICAgICAgIGZpbHRlcjogJ2xvd3Bhc3MnLFxuICAgICAgICAgICAgZGVsYXk6IDAuNTAwLFxuICAgICAgICAgICAgZmVlZGJhY2s6IDAuNCxcbiAgICAgICAgICAgIGJhckNvbG9yOiAnIzFkMWMyNSdcbiAgICAgICAgfTtcblxuICAgICAgICAvLyBzZXQgY29uZmlndXJhYmxlIG9wdGlvbnNcbiAgICAgICAgaWYgKHR5cGVvZiBvcHRpb25zID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgZm9yIChsZXQgaSBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICAgICAgaWYgKG9wdGlvbnMuaGFzT3duUHJvcGVydHkoaSkpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5vcHRpb25zW2ldID0gb3B0aW9uc1tpXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBXZWIgQXVkaW8gTm9kZSByZWZlcmVuY2VzXG4gICAgICAgIHRoaXMuc291cmNlID0gbnVsbDtcbiAgICAgICAgdGhpcy5ub2RlcyA9IHt9O1xuICAgICAgICB0aGlzLm15QXVkaW9Db250ZXh0ID0gbnVsbDtcbiAgICAgICAgdGhpcy5teUF1ZGlvQW5hbHlzZXIgPSBudWxsO1xuXG4gICAgICAgIC8vIG5vcm1hbGl6ZSBhbmQgY3JlYXRlIGEgbmV3IEF1ZGlvQ29udGV4dCBpZiBzdXBwb3J0ZWRcbiAgICAgICAgd2luZG93LkF1ZGlvQ29udGV4dCA9IHdpbmRvdy5BdWRpb0NvbnRleHQgfHwgd2luZG93LndlYmtpdEF1ZGlvQ29udGV4dDtcblxuICAgICAgICBpZiAoJ0F1ZGlvQ29udGV4dCcgaW4gd2luZG93KSB7XG4gICAgICAgICAgICB0aGlzLm15QXVkaW9Db250ZXh0ID0gbmV3IEF1ZGlvQ29udGV4dCgpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCd3YXZlcGFkLmpzOiBicm93c2VyIGRvZXMgbm90IHN1cHBvcnQgV2ViIEF1ZGlvIEFQSScpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHR5cGVvZiBpZCAhPT0gJ3N0cmluZycgJiYgdHlwZW9mIGlkICE9PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCd3YXZlcGFkLmpzOiBmaXJzdCBhcmd1bWVudCBtdXN0IGJlIGEgdmFsaWQgRE9NIGlkZW50aWZpZXInKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFVJIERPTSByZWZlcmVuY2VzXG4gICAgICAgIHRoaXMuc3ludGggPSB0eXBlb2YgaWQgPT09ICdvYmplY3QnID8gaWQgOiBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChpZCk7XG4gICAgICAgIHRoaXMuc3VyZmFjZSA9IHRoaXMuc3ludGgucXVlcnlTZWxlY3RvcignLnN1cmZhY2UnKTtcbiAgICAgICAgdGhpcy5maW5nZXIgPSB0aGlzLnN5bnRoLnF1ZXJ5U2VsZWN0b3IoJy5maW5nZXInKTtcbiAgICAgICAgdGhpcy53YXZlZm9ybSA9IHRoaXMuc3ludGgucXVlcnlTZWxlY3RvcignI3dhdmVmb3JtJyk7XG4gICAgICAgIHRoaXMuZmlsdGVyID0gdGhpcy5zeW50aC5xdWVyeVNlbGVjdG9yKCcjZmlsdGVyLXR5cGUnKTtcbiAgICAgICAgdGhpcy5wb3dlclRvZ2dsZSA9IHRoaXMuc3ludGgucXVlcnlTZWxlY3RvcignI3Bvd2VyJyk7XG4gICAgICAgIHRoaXMuZGVsYXlUaW1lSW5wdXQgPSB0aGlzLnN5bnRoLnF1ZXJ5U2VsZWN0b3IoJyNkZWxheScpO1xuICAgICAgICB0aGlzLmZlZWRiYWNrR2FpbklucHV0ID0gdGhpcy5zeW50aC5xdWVyeVNlbGVjdG9yKCcjZmVlZGJhY2snKTtcbiAgICAgICAgdGhpcy5kZWxheVRpbWVPdXRwdXQgPSB0aGlzLnN5bnRoLnF1ZXJ5U2VsZWN0b3IoJyNkZWxheS1vdXRwdXQnKTtcbiAgICAgICAgdGhpcy5mZWVkYmFja0dhaW5PdXRwdXQgPSB0aGlzLnN5bnRoLnF1ZXJ5U2VsZWN0b3IoJyNmZWVkYmFjay1vdXRwdXQnKTtcblxuICAgICAgICAvLyBDYW52YXMgZ3JhcGggZm9yIGF1ZGlvIGZyZXF1ZW5jeSBhbmFseXplclxuICAgICAgICB0aGlzLmNhbnZhcyA9IHRoaXMuc3ludGgucXVlcnlTZWxlY3RvcignY2FudmFzJyk7XG4gICAgICAgIHRoaXMuY3R4ID0gdGhpcy5jYW52YXMuZ2V0Q29udGV4dCgnMmQnKTtcblxuICAgICAgICB0aGlzLmhhc1RvdWNoID0gZmFsc2U7XG4gICAgICAgIHRoaXMuaXNTbWFsbFZpZXdwb3J0ID0gZmFsc2U7XG4gICAgICAgIHRoaXMuaXNQbGF5aW5nID0gZmFsc2U7XG4gICAgfVxuXG4gICAgaW5pdCgpIHtcbiAgICAgICAgLy8gYmluZCByZXNpemUgaGFuZGxlciBmb3IgY2FudmFzICYgdG91Y2ggcmVmZXJlbmNlc1xuICAgICAgICB0aGlzLmhhbmRsZVJlc2l6ZSgpO1xuXG4gICAgICAgIC8vIHN0b3JlIHJlZmVyZW5jZXMgdG8gYm91bmQgZXZlbnRzXG4gICAgICAgIC8vIHNvIHdlIGNhbiB1bmJpbmQgd2hlbiBuZWVkZWRcbiAgICAgICAgdGhpcy5zdGFydEhhbmRsZXIgPSB0aGlzLnN0YXJ0LmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMubW92ZUhhbmRsZXIgPSB0aGlzLm1vdmUuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5zdG9wSGFuZGxlciA9IHRoaXMuc3RvcC5iaW5kKHRoaXMpO1xuXG4gICAgICAgIC8vIHNldCBkZWZhdWx0IHZhbHVlcyB0aGF0IHdlJ3JlIHN1cHBsaWVkXG4gICAgICAgIHRoaXMuZGVsYXlUaW1lSW5wdXQudmFsdWUgPSB0aGlzLm9wdGlvbnMuZGVsYXk7XG4gICAgICAgIHRoaXMuZmVlZGJhY2tHYWluSW5wdXQudmFsdWUgPSB0aGlzLm9wdGlvbnMuZmVlZGJhY2s7XG4gICAgICAgIHRoaXMud2F2ZWZvcm0udmFsdWUgPSB0aGlzLm9wdGlvbnMud2F2ZWZvcm07XG4gICAgICAgIHRoaXMuZmlsdGVyLnZhbHVlID0gdGhpcy5vcHRpb25zLmZpbHRlcjtcbiAgICAgICAgdGhpcy51cGRhdGVPdXRwdXRzKCk7XG5cbiAgICAgICAgLy8gYmluZCBVSSBjb250cm9sIGV2ZW50c1xuICAgICAgICB0aGlzLnBvd2VyVG9nZ2xlLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgdGhpcy50b2dnbGVQb3dlci5iaW5kKHRoaXMpKTtcbiAgICAgICAgdGhpcy53YXZlZm9ybS5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCB0aGlzLnNldFdhdmVmb3JtLmJpbmQodGhpcykpO1xuICAgICAgICB0aGlzLmZpbHRlci5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCB0aGlzLmZpbHRlckNoYW5nZS5iaW5kKHRoaXMpKTtcbiAgICAgICAgdGhpcy5kZWxheVRpbWVJbnB1dC5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsIHRoaXMuZGVsYXlDaGFuZ2UuYmluZCh0aGlzKSk7XG4gICAgICAgIHRoaXMuZmVlZGJhY2tHYWluSW5wdXQuYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCB0aGlzLmZlZWRiYWNrQ2hhbmdlLmJpbmQodGhpcykpO1xuXG4gICAgICAgIC8vIGNyZWF0ZSBXZWIgQXVkaW8gbm9kZXNcbiAgICAgICAgdGhpcy5ub2Rlcy5vc2NWb2x1bWUgPSB0aGlzLm15QXVkaW9Db250ZXh0LmNyZWF0ZUdhaW4oKTtcbiAgICAgICAgdGhpcy5ub2Rlcy5maWx0ZXIgPSB0aGlzLm15QXVkaW9Db250ZXh0LmNyZWF0ZUJpcXVhZEZpbHRlcigpO1xuICAgICAgICB0aGlzLm5vZGVzLnZvbHVtZSA9IHRoaXMubXlBdWRpb0NvbnRleHQuY3JlYXRlR2FpbigpO1xuICAgICAgICB0aGlzLm5vZGVzLmRlbGF5ID0gdGhpcy5teUF1ZGlvQ29udGV4dC5jcmVhdGVEZWxheSgpO1xuICAgICAgICB0aGlzLm5vZGVzLmZlZWRiYWNrR2FpbiA9IHRoaXMubXlBdWRpb0NvbnRleHQuY3JlYXRlR2FpbigpO1xuICAgICAgICB0aGlzLm5vZGVzLmNvbXByZXNzb3IgPSB0aGlzLm15QXVkaW9Db250ZXh0LmNyZWF0ZUR5bmFtaWNzQ29tcHJlc3NvcigpO1xuXG4gICAgICAgIC8vIGNyZWF0ZSBmcmVxdWVuY3kgYW5hbHlzZXIgbm9kZVxuICAgICAgICB0aGlzLm15QXVkaW9BbmFseXNlciA9IHRoaXMubXlBdWRpb0NvbnRleHQuY3JlYXRlQW5hbHlzZXIoKTtcbiAgICAgICAgdGhpcy5teUF1ZGlvQW5hbHlzZXIuc21vb3RoaW5nVGltZUNvbnN0YW50ID0gMC44NTtcblxuICAgICAgICAvLyBzdGFydCBmQUYgZm9yIGZyZXF1ZW5jeSBhbmFseXNlclxuICAgICAgICB0aGlzLmFuaW1hdGVTcGVjdHJ1bSgpO1xuXG4gICAgICAgIC8vIHByZXZlbnQgZGVmYXVsdCBzY3JvbGxpbmcgd2hlbiB0b3VjaG1vdmUgZmlyZXMgb24gc3VyZmFjZVxuICAgICAgICB0aGlzLnN1cmZhY2UuYWRkRXZlbnRMaXN0ZW5lcigndG91Y2htb3ZlJywgZSA9PiB7XG4gICAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGhhbmRsZVJlc2l6ZSgpIHtcbiAgICAgICAgdmFyIGJyZWFrUG9pbnQgPSB3aW5kb3cubWF0Y2hNZWRpYSgnKG1heC13aWR0aDogNTEycHgpJyk7XG4gICAgICAgIC8vIHNldCBkZWZhdWx0IGNhbnZhcyBzaXplXG4gICAgICAgIHRoaXMuaXNTbWFsbFZpZXdwb3J0ID0gYnJlYWtQb2ludC5tYXRjaGVzID8gdHJ1ZSA6IGZhbHNlO1xuICAgICAgICB0aGlzLnNldENhbnZhc1NpemUoKTtcblxuICAgICAgICAvLyBsaXN0ZW4gZm9yIHJlc2l6ZSBldmVudHNcbiAgICAgICAgYnJlYWtQb2ludC5hZGRMaXN0ZW5lcihtcWwgPT4ge1xuICAgICAgICAgICAgdGhpcy5pc1NtYWxsVmlld3BvcnQgPSBtcWwubWF0Y2hlcyA/IHRydWUgOiBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMuc2V0Q2FudmFzU2l6ZSgpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICByb3V0ZVNvdW5kcygpIHtcbiAgICAgICAgdGhpcy5zb3VyY2UgPSB0aGlzLm15QXVkaW9Db250ZXh0LmNyZWF0ZU9zY2lsbGF0b3IoKTtcblxuICAgICAgICB0aGlzLnNldFdhdmVmb3JtKHRoaXMud2F2ZWZvcm0pO1xuICAgICAgICB0aGlzLmZpbHRlckNoYW5nZSh0aGlzLmZpbHRlcik7XG4gICAgICAgIHRoaXMubm9kZXMuZmVlZGJhY2tHYWluLmdhaW4udmFsdWUgPSB0aGlzLm9wdGlvbnMuZmVlZGJhY2s7XG4gICAgICAgIHRoaXMubm9kZXMuZGVsYXkuZGVsYXlUaW1lLnZhbHVlID0gdGhpcy5vcHRpb25zLmRlbGF5O1xuICAgICAgICB0aGlzLm5vZGVzLnZvbHVtZS5nYWluLnZhbHVlID0gMC4yO1xuICAgICAgICB0aGlzLm5vZGVzLm9zY1ZvbHVtZS5nYWluLnZhbHVlID0gMDtcblxuICAgICAgICB0aGlzLnNvdXJjZS5jb25uZWN0KHRoaXMubm9kZXMub3NjVm9sdW1lKTtcbiAgICAgICAgdGhpcy5ub2Rlcy5vc2NWb2x1bWUuY29ubmVjdCh0aGlzLm5vZGVzLmZpbHRlcik7XG4gICAgICAgIHRoaXMubm9kZXMuZmlsdGVyLmNvbm5lY3QodGhpcy5ub2Rlcy5jb21wcmVzc29yKTtcbiAgICAgICAgdGhpcy5ub2Rlcy5maWx0ZXIuY29ubmVjdCh0aGlzLm5vZGVzLmRlbGF5KTtcbiAgICAgICAgdGhpcy5ub2Rlcy5kZWxheS5jb25uZWN0KHRoaXMubm9kZXMuZmVlZGJhY2tHYWluKTtcbiAgICAgICAgdGhpcy5ub2Rlcy5kZWxheS5jb25uZWN0KHRoaXMubm9kZXMuY29tcHJlc3Nvcik7XG4gICAgICAgIHRoaXMubm9kZXMuZmVlZGJhY2tHYWluLmNvbm5lY3QodGhpcy5ub2Rlcy5kZWxheSk7XG4gICAgICAgIHRoaXMubm9kZXMuY29tcHJlc3Nvci5jb25uZWN0KHRoaXMubm9kZXMudm9sdW1lKTtcbiAgICAgICAgdGhpcy5ub2Rlcy52b2x1bWUuY29ubmVjdCh0aGlzLm15QXVkaW9BbmFseXNlcik7XG4gICAgICAgIHRoaXMubXlBdWRpb0FuYWx5c2VyLmNvbm5lY3QodGhpcy5teUF1ZGlvQ29udGV4dC5kZXN0aW5hdGlvbik7XG4gICAgfVxuXG4gICAgc3RhcnRPc2MoKSB7XG4gICAgICAgIHRoaXMuc291cmNlLnN0YXJ0KDApO1xuICAgICAgICB0aGlzLmlzUGxheWluZyA9IHRydWU7XG4gICAgfVxuXG4gICAgc3RvcE9zYygpIHtcbiAgICAgICAgdGhpcy5zb3VyY2Uuc3RvcCgwKTtcbiAgICAgICAgdGhpcy5pc1BsYXlpbmcgPSBmYWxzZTtcbiAgICB9XG5cbiAgICBiaW5kU3VyZmFjZUV2ZW50cygpIHtcbiAgICAgICAgdGhpcy5zdXJmYWNlLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZG93bicsIHRoaXMuc3RhcnRIYW5kbGVyKTtcbiAgICAgICAgdGhpcy5zdXJmYWNlLmFkZEV2ZW50TGlzdGVuZXIoJ3RvdWNoc3RhcnQnLCB0aGlzLnN0YXJ0SGFuZGxlcik7XG4gICAgfVxuXG4gICAgdW5iaW5kU3VyZmFjZUV2ZW50cygpIHtcbiAgICAgICAgdGhpcy5zdXJmYWNlLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21vdXNlZG93bicsIHRoaXMuc3RhcnRIYW5kbGVyKTtcbiAgICAgICAgdGhpcy5zdXJmYWNlLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3RvdWNoc3RhcnQnLCB0aGlzLnN0YXJ0SGFuZGxlcik7XG4gICAgfVxuXG4gICAgdG9nZ2xlUG93ZXIoKSB7XG4gICAgICAgIGlmICh0aGlzLmlzUGxheWluZykge1xuICAgICAgICAgICAgdGhpcy5zdG9wT3NjKCk7XG4gICAgICAgICAgICB0aGlzLm15QXVkaW9BbmFseXNlci5kaXNjb25uZWN0KCk7XG4gICAgICAgICAgICB0aGlzLnVuYmluZFN1cmZhY2VFdmVudHMoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMucm91dGVTb3VuZHMoKTtcbiAgICAgICAgICAgIHRoaXMuc3RhcnRPc2MoKTtcbiAgICAgICAgICAgIHRoaXMuYmluZFN1cmZhY2VFdmVudHMoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuc3ludGguY2xhc3NMaXN0LnRvZ2dsZSgnb2ZmJyk7XG4gICAgfVxuXG4gICAgc3RhcnQoZSkge1xuICAgICAgICBsZXQgeCA9IGUudHlwZSA9PT0gJ3RvdWNoc3RhcnQnID8gZS50b3VjaGVzWzBdLnBhZ2VYIDogZS5wYWdlWDtcbiAgICAgICAgbGV0IHkgPSBlLnR5cGUgPT09ICd0b3VjaHN0YXJ0JyA/IGUudG91Y2hlc1swXS5wYWdlWSA6IGUucGFnZVk7XG4gICAgICAgIGNvbnN0IG11bHRpcGxpZXIgPSB0aGlzLmlzU21hbGxWaWV3cG9ydCA/IDIgOiAxO1xuXG4gICAgICAgIGlmIChlLnR5cGUgPT09ICd0b3VjaHN0YXJ0Jykge1xuICAgICAgICAgICAgdGhpcy5oYXNUb3VjaCA9IHRydWU7XG4gICAgICAgIH0gZWxzZSBpZiAoZS50eXBlID09PSAnbW91c2Vkb3duJyAmJiB0aGlzLmhhc1RvdWNoKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIXRoaXMuaXNQbGF5aW5nKSB7XG4gICAgICAgICAgICB0aGlzLnJvdXRlU291bmRzKCk7XG4gICAgICAgICAgICB0aGlzLnN0YXJ0T3NjKCk7XG4gICAgICAgIH1cblxuICAgICAgICB4ID0geCAtIHRoaXMuc3VyZmFjZS5vZmZzZXRMZWZ0O1xuICAgICAgICB5ID0geSAtIHRoaXMuc3VyZmFjZS5vZmZzZXRUb3A7XG5cbiAgICAgICAgdGhpcy5ub2Rlcy5vc2NWb2x1bWUuZ2Fpbi52YWx1ZSA9IDE7XG4gICAgICAgIHRoaXMuc291cmNlLmZyZXF1ZW5jeS52YWx1ZSA9IHggKiBtdWx0aXBsaWVyO1xuICAgICAgICB0aGlzLm5vZGVzLmZpbHRlci5mcmVxdWVuY3kudmFsdWUgPSB0aGlzLnNldEZpbHRlckZyZXF1ZW5jeSh5KTtcblxuICAgICAgICB0aGlzLmZpbmdlci5zdHlsZS53ZWJraXRUcmFuc2Zvcm0gPSB0aGlzLmZpbmdlci5zdHlsZS50cmFuc2Zvcm0gPSBgdHJhbnNsYXRlM2QoJHt4fXB4LCAke3l9cHgsIDApYDtcbiAgICAgICAgdGhpcy5maW5nZXIuY2xhc3NMaXN0LmFkZCgnYWN0aXZlJyk7XG5cbiAgICAgICAgdGhpcy5zdXJmYWNlLmFkZEV2ZW50TGlzdGVuZXIoJ3RvdWNobW92ZScsIHRoaXMubW92ZUhhbmRsZXIpO1xuICAgICAgICB0aGlzLnN1cmZhY2UuYWRkRXZlbnRMaXN0ZW5lcigndG91Y2hlbmQnLCB0aGlzLnN0b3BIYW5kbGVyKTtcbiAgICAgICAgdGhpcy5zdXJmYWNlLmFkZEV2ZW50TGlzdGVuZXIoJ3RvdWNoY2FuY2VsJywgdGhpcy5zdG9wSGFuZGxlcik7XG4gICAgICAgIHRoaXMuc3VyZmFjZS5hZGRFdmVudExpc3RlbmVyKCdtb3VzZW1vdmUnLCB0aGlzLm1vdmVIYW5kbGVyKTtcbiAgICAgICAgdGhpcy5zdXJmYWNlLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNldXAnLCB0aGlzLnN0b3BIYW5kbGVyKTtcbiAgICB9XG5cbiAgICBtb3ZlKGUpIHtcbiAgICAgICAgbGV0IHggPSBlLnR5cGUgPT09ICd0b3VjaG1vdmUnID8gZS50b3VjaGVzWzBdLnBhZ2VYIDogZS5wYWdlWDtcbiAgICAgICAgbGV0IHkgPSBlLnR5cGUgPT09ICd0b3VjaG1vdmUnID8gZS50b3VjaGVzWzBdLnBhZ2VZIDogZS5wYWdlWTtcblxuICAgICAgICBpZiAoZS50eXBlID09PSAnbW91c2Vtb3ZlJyAmJiB0aGlzLmhhc1RvdWNoKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5pc1BsYXlpbmcpIHtcbiAgICAgICAgICAgIGNvbnN0IG11bHRpcGxpZXIgPSB0aGlzLmlzU21hbGxWaWV3cG9ydCA/IDIgOiAxO1xuICAgICAgICAgICAgeCA9IHggLSB0aGlzLnN1cmZhY2Uub2Zmc2V0TGVmdDtcbiAgICAgICAgICAgIHkgPSB5IC0gdGhpcy5zdXJmYWNlLm9mZnNldFRvcDtcbiAgICAgICAgICAgIHRoaXMuc291cmNlLmZyZXF1ZW5jeS52YWx1ZSA9IHggKiBtdWx0aXBsaWVyO1xuICAgICAgICAgICAgdGhpcy5ub2Rlcy5maWx0ZXIuZnJlcXVlbmN5LnZhbHVlID0gdGhpcy5zZXRGaWx0ZXJGcmVxdWVuY3koeSk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmZpbmdlci5zdHlsZS53ZWJraXRUcmFuc2Zvcm0gPSB0aGlzLmZpbmdlci5zdHlsZS50cmFuc2Zvcm0gPSBgdHJhbnNsYXRlM2QoJHt4fXB4LCAke3l9cHgsIDApYDtcbiAgICB9XG5cbiAgICBzdG9wKGUpIHtcbiAgICAgICAgbGV0IHggPSBlLnR5cGUgPT09ICd0b3VjaGVuZCcgPyBlLmNoYW5nZWRUb3VjaGVzWzBdLnBhZ2VYIDogZS5wYWdlWDtcbiAgICAgICAgbGV0IHkgPSBlLnR5cGUgPT09ICd0b3VjaGVuZCcgPyBlLmNoYW5nZWRUb3VjaGVzWzBdLnBhZ2VZIDogZS5wYWdlWTtcblxuICAgICAgICBpZiAodGhpcy5pc1BsYXlpbmcpIHtcbiAgICAgICAgICAgIGNvbnN0IG11bHRpcGxpZXIgPSB0aGlzLmlzU21hbGxWaWV3cG9ydCA/IDIgOiAxO1xuICAgICAgICAgICAgeCA9IHggLSB0aGlzLnN1cmZhY2Uub2Zmc2V0TGVmdDtcbiAgICAgICAgICAgIHkgPSB5IC0gdGhpcy5zdXJmYWNlLm9mZnNldFRvcDtcbiAgICAgICAgICAgIHRoaXMuc291cmNlLmZyZXF1ZW5jeS52YWx1ZSA9IHggKiBtdWx0aXBsaWVyO1xuICAgICAgICAgICAgdGhpcy5ub2Rlcy5maWx0ZXIuZnJlcXVlbmN5LnZhbHVlID0gdGhpcy5zZXRGaWx0ZXJGcmVxdWVuY3koeSk7XG4gICAgICAgICAgICB0aGlzLm5vZGVzLm9zY1ZvbHVtZS5nYWluLnZhbHVlID0gMDtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuZmluZ2VyLmNsYXNzTGlzdC5yZW1vdmUoJ2FjdGl2ZScpO1xuXG4gICAgICAgIHRoaXMuc3VyZmFjZS5yZW1vdmVFdmVudExpc3RlbmVyKCdtb3VzZW1vdmUnLCB0aGlzLm1vdmVIYW5kbGVyKTtcbiAgICAgICAgdGhpcy5zdXJmYWNlLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21vdXNldXAnLCB0aGlzLnN0b3BIYW5kbGVyKTtcbiAgICAgICAgdGhpcy5zdXJmYWNlLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3RvdWNobW92ZScsIHRoaXMubW92ZUhhbmRsZXIpO1xuICAgICAgICB0aGlzLnN1cmZhY2UucmVtb3ZlRXZlbnRMaXN0ZW5lcigndG91Y2hlbmQnLCB0aGlzLnN0b3BIYW5kbGVyKTtcbiAgICAgICAgdGhpcy5zdXJmYWNlLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3RvdWNoY2FuY2VsJywgdGhpcy5zdG9wSGFuZGxlcik7XG4gICAgfVxuXG4gICAgdXBkYXRlT3V0cHV0cygpIHtcbiAgICAgICAgdGhpcy5kZWxheVRpbWVPdXRwdXQudmFsdWUgPSBNYXRoLnJvdW5kKHRoaXMuZGVsYXlUaW1lSW5wdXQudmFsdWUgKiAxMDAwKSArICcgbXMnO1xuICAgICAgICB0aGlzLmZlZWRiYWNrR2Fpbk91dHB1dC52YWx1ZSA9IE1hdGgucm91bmQodGhpcy5mZWVkYmFja0dhaW5JbnB1dC52YWx1ZSAqIDEwKTtcbiAgICB9XG5cbiAgICBzZXRXYXZlZm9ybShvcHRpb24pIHtcbiAgICAgICAgdGhpcy5zb3VyY2UudHlwZSA9IG9wdGlvbi52YWx1ZSB8fCBvcHRpb24udGFyZ2V0LnZhbHVlO1xuICAgIH1cblxuICAgIGRlbGF5Q2hhbmdlKGUpIHtcbiAgICAgICAgdGhpcy5vcHRpb25zLmRlbGF5ID0gZS50YXJnZXQudmFsdWU7XG4gICAgICAgIGlmICh0aGlzLmlzUGxheWluZykge1xuICAgICAgICAgICAgdGhpcy5zdG9wT3NjKCk7XG4gICAgICAgICAgICB0aGlzLm5vZGVzLmRlbGF5LmRlbGF5VGltZS52YWx1ZSA9IHRoaXMub3B0aW9ucy5kZWxheTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnVwZGF0ZU91dHB1dHMoKTtcbiAgICB9XG5cbiAgICBmZWVkYmFja0NoYW5nZShlKSB7XG4gICAgICAgIHRoaXMub3B0aW9ucy5mZWVkYmFjayA9IGUudGFyZ2V0LnZhbHVlO1xuICAgICAgICBpZiAodGhpcy5pc1BsYXlpbmcpIHtcbiAgICAgICAgICAgIHRoaXMuc3RvcE9zYygpO1xuICAgICAgICAgICAgdGhpcy5ub2Rlcy5mZWVkYmFja0dhaW4uZ2Fpbi52YWx1ZSA9IHRoaXMub3B0aW9ucy5mZWVkYmFjaztcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnVwZGF0ZU91dHB1dHMoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXQgZmlsdGVyIGZyZXF1ZW5jeSBiYXNlZCBvbiAoeSkgYXhpcyB2YWx1ZVxuICAgICAqL1xuICAgIHNldEZpbHRlckZyZXF1ZW5jeSh5KSB7XG4gICAgICAgIC8vIG1pbiA0MEh6XG4gICAgICAgIGNvbnN0IG1pbiA9IDQwO1xuICAgICAgICAvLyBtYXggaGFsZiBvZiB0aGUgc2FtcGxpbmcgcmF0ZVxuICAgICAgICBjb25zdCBtYXggPSB0aGlzLm15QXVkaW9Db250ZXh0LnNhbXBsZVJhdGUgLyAyO1xuICAgICAgICAvLyBMb2dhcml0aG0gKGJhc2UgMikgdG8gY29tcHV0ZSBob3cgbWFueSBvY3RhdmVzIGZhbGwgaW4gdGhlIHJhbmdlLlxuICAgICAgICBjb25zdCBudW1iZXJPZk9jdGF2ZXMgPSBNYXRoLmxvZyhtYXggLyBtaW4pIC8gTWF0aC5MTjI7XG4gICAgICAgIC8vIENvbXB1dGUgYSBtdWx0aXBsaWVyIGZyb20gMCB0byAxIGJhc2VkIG9uIGFuIGV4cG9uZW50aWFsIHNjYWxlLlxuICAgICAgICBjb25zdCBtdWx0aXBsaWVyID0gTWF0aC5wb3coMiwgbnVtYmVyT2ZPY3RhdmVzICogKCgoMiAvIHRoaXMuc3VyZmFjZS5jbGllbnRIZWlnaHQpICogKHRoaXMuc3VyZmFjZS5jbGllbnRIZWlnaHQgLSB5KSkgLSAxLjApKTtcbiAgICAgICAgLy8gR2V0IGJhY2sgdG8gdGhlIGZyZXF1ZW5jeSB2YWx1ZSBiZXR3ZWVuIG1pbiBhbmQgbWF4LlxuICAgICAgICByZXR1cm4gbWF4ICogbXVsdGlwbGllcjtcbiAgICB9XG5cbiAgICBmaWx0ZXJDaGFuZ2Uob3B0aW9uKSB7XG4gICAgICAgIHRoaXMubm9kZXMuZmlsdGVyLnR5cGUgPSBvcHRpb24udmFsdWUgfHwgb3B0aW9uLnRhcmdldC52YWx1ZTtcbiAgICB9XG5cbiAgICBhbmltYXRlU3BlY3RydW0oKSB7XG4gICAgICAgIC8vIExpbWl0IGNhbnZhcyByZWRyYXcgdG8gNDAgZnBzXG4gICAgICAgIHNldFRpbWVvdXQodGhpcy5vblRpY2suYmluZCh0aGlzKSwgMTAwMCAvIDQwKTtcbiAgICB9XG5cbiAgICBvblRpY2soKSB7XG4gICAgICAgIHRoaXMuZHJhd1NwZWN0cnVtKCk7XG4gICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLmFuaW1hdGVTcGVjdHJ1bS5iaW5kKHRoaXMpKTtcbiAgICB9XG5cbiAgICBzZXRDYW52YXNTaXplKCkge1xuICAgICAgICBjb25zdCBjYW52YXNTaXplID0gdGhpcy5pc1NtYWxsVmlld3BvcnQgPyAyNTYgOiA1MTI7XG4gICAgICAgIHRoaXMuY2FudmFzLndpZHRoID0gdGhpcy5jYW52YXMuaGVpZ2h0ID0gY2FudmFzU2l6ZSAtIDEwO1xuICAgICAgICAvLyBzZXQgY2FudmFzIGdyYXBoIGNvbG9yXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IHRoaXMub3B0aW9ucy5iYXJDb2xvcjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBEcmF3IHRoZSBjYW52YXMgZnJlcXVlbmN5IGRhdGEgZ3JhcGhcbiAgICAgKi9cbiAgICBkcmF3U3BlY3RydW0oKSB7XG4gICAgICAgIGNvbnN0IGNhbnZhc1NpemUgPSB0aGlzLmlzU21hbGxWaWV3cG9ydCA/IDI1NiA6IDUxMjtcbiAgICAgICAgY29uc3QgYmFyV2lkdGggPSB0aGlzLmlzU21hbGxWaWV3cG9ydCA/IDEwIDogMjA7XG4gICAgICAgIGNvbnN0IGJhckNvdW50ID0gTWF0aC5yb3VuZChjYW52YXNTaXplIC8gYmFyV2lkdGgpO1xuICAgICAgICBjb25zdCBmcmVxQnl0ZURhdGEgPSBuZXcgVWludDhBcnJheSh0aGlzLm15QXVkaW9BbmFseXNlci5mcmVxdWVuY3lCaW5Db3VudCk7XG5cbiAgICAgICAgdGhpcy5teUF1ZGlvQW5hbHlzZXIuZ2V0Qnl0ZUZyZXF1ZW5jeURhdGEoZnJlcUJ5dGVEYXRhKTtcbiAgICAgICAgdGhpcy5jdHguY2xlYXJSZWN0KDAsIDAsIGNhbnZhc1NpemUsIGNhbnZhc1NpemUpO1xuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYmFyQ291bnQ7IGkgKz0gMSkge1xuICAgICAgICAgICAgY29uc3QgbWFnbml0dWRlID0gZnJlcUJ5dGVEYXRhW2ldO1xuICAgICAgICAgICAgY29uc3QgbXVsdGlwbGllciA9IHRoaXMuaXNTbWFsbFZpZXdwb3J0ID8gMSA6IDI7XG4gICAgICAgICAgICAvLyBzb21lIHZhbHVlcyBuZWVkIGFkanVzdGluZyB0byBmaXQgb24gdGhlIGNhbnZhc1xuICAgICAgICAgICAgdGhpcy5jdHguZmlsbFJlY3QoYmFyV2lkdGggKiBpLCBjYW52YXNTaXplLCBiYXJXaWR0aCAtIDEsIC1tYWduaXR1ZGUgKiBtdWx0aXBsaWVyKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgV2F2ZXBhZDtcbiJdfQ==
