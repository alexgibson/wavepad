(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";

var _interopRequire = function (obj) { return obj && obj.__esModule ? obj["default"] : obj; };

var rAF = _interopRequire(require("./rAF"));

var Wavepad = _interopRequire(require("./wavepad"));

window.addEventListener("DOMContentLoaded", function () {
    var app = new Wavepad({
        waveform: "square",
        filter: "lowpass",
        delay: 0.5,
        feedback: 0.4
    });

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
    function Wavepad(options) {
        _classCallCheck(this, Wavepad);

        // default options
        this.options = {
            waveform: "sine",
            filter: "lowpass",
            delay: 0.5,
            feedback: 0.4
        };

        // set configurable options
        if (typeof options === "object") {
            for (var i in options) {
                if (options.hasOwnProperty(i)) {
                    this.options[i] = options[i];
                }
            }
        }

        // UI DOM references
        this.main = document.querySelector(".main");
        this.surface = document.querySelector(".surface");
        this.finger = document.querySelector(".finger");
        this.waveform = document.getElementById("waveform");
        this.filter = document.getElementById("filter-type");
        this.powerToggle = document.getElementById("power");
        this.delayTimeInput = document.getElementById("delay");
        this.feedbackGainInput = document.getElementById("feedback");
        this.delayTimeOutput = document.getElementById("delay-output");
        this.feedbackGainOutput = document.getElementById("feedback-output");

        // Canvas graph for audio frequency analyzer
        this.canvas = document.querySelector("canvas");
        this.ctx = this.canvas.getContext("2d");

        // Web Audio Node references
        this.source = null;
        this.nodes = {};
        this.myAudioContext = null;
        this.myAudioAnalyser = null;

        // Map for legacy Web Audio filter values
        this.filters = new Map();
        this.filters.set("lowpass", 0);
        this.filters.set("highpass", 1);
        this.filters.set("bandpass", 2);
        this.filters.set("lowshelf", 3);
        this.filters.set("highshelf", 4);
        this.filters.set("peaking", 5);
        this.filters.set("notch", 6);
        this.filters.set("allpass", 7);

        // Map for legacy Web Audio waveform values
        this.waves = new Map();
        this.waves.set("sine", 0);
        this.waves.set("square", 1);
        this.waves.set("sawtooth", 2);
        this.waves.set("triangle", 3);

        this.hasTouch = false;
        this.isSmallViewport = false;
        this.isPlaying = false;

        // Safari needs some special attention for its non-standards
        this.isSafari = navigator.userAgent.indexOf("Safari") !== -1 && navigator.userAgent.indexOf("Chrome") == -1;
    }

    _prototypeProperties(Wavepad, null, {
        init: {
            value: function init() {
                // normalize and create a new AudioContext if supported
                window.AudioContext = window.AudioContext || window.webkitAudioContext;

                if ("AudioContext" in window) {
                    this.myAudioContext = new AudioContext();
                } else {
                    throw new Error("browser does not support Web Audio API");
                }

                // bind resize handler for canvas & touch references
                this.handleResize();

                // store references to bound events
                // so we can unbind when needed
                this.playHandler = this.play.bind(this);
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
                this.nodes.oscVolume = this.myAudioContext.createGain ? this.myAudioContext.createGain() : this.myAudioContext.createGainNode();
                this.nodes.filter = this.myAudioContext.createBiquadFilter();
                this.nodes.volume = this.myAudioContext.createGain ? this.myAudioContext.createGain() : this.myAudioContext.createGainNode();
                this.nodes.delay = this.myAudioContext.createDelay ? this.myAudioContext.createDelay() : this.myAudioContext.createDelayNode();
                this.nodes.feedbackGain = this.myAudioContext.createGain ? this.myAudioContext.createGain() : this.myAudioContext.createGainNode();
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
                // set default canvas size
                this.isSmallViewport = window.matchMedia("(max-width: 512px)").matches ? true : false;
                this.setCanvasSize();

                // listen for resize events
                window.matchMedia("(max-width: 512px)").addListener(function (mql) {
                    if (mql.matches) {
                        _this.isSmallViewport = true;
                    } else {
                        _this.isSmallViewport = false;
                    }
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
                if (!this.source.start) {
                    this.source.start = this.source.noteOn;
                }
                this.source.start(0);
                this.isPlaying = true;
            },
            writable: true,
            configurable: true
        },
        stopOsc: {
            value: function stopOsc() {
                if (!this.source.stop) {
                    this.source.stop = this.source.noteOff;
                }
                this.source.stop(0);
                this.isPlaying = false;
            },
            writable: true,
            configurable: true
        },
        bindSurfaceEvents: {
            value: function bindSurfaceEvents() {
                this.surface.addEventListener("mousedown", this.playHandler);
                this.surface.addEventListener("touchstart", this.playHandler);
            },
            writable: true,
            configurable: true
        },
        unbindSurfaceEvents: {
            value: function unbindSurfaceEvents() {
                this.surface.removeEventListener("mousedown", this.playHandler);
                this.surface.removeEventListener("touchstart", this.playHandler);
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

                this.main.classList.toggle("off");
            },
            writable: true,
            configurable: true
        },
        play: {
            value: function play(e) {
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
                var value = option.value || option.target.value;
                this.source.type = this.isSafari ? this.waves.get(value) : value;
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
                var value = option.value || option.target.value;
                this.nodes.filter.type = this.isSafari ? this.filters.get(value) : value;
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
                requestAnimationFrame(this.animateSpectrum.bind(this), this.canvas);
            },
            writable: true,
            configurable: true
        },
        setCanvasSize: {
            value: function setCanvasSize() {
                var canvasSize = this.isSmallViewport ? 256 : 512;
                this.canvas.width = this.canvas.height = canvasSize - 10;
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

                this.ctx.clearRect(0, 0, canvasSize, canvasSize);
                this.ctx.fillStyle = "#1d1c25";

                this.myAudioAnalyser.getByteFrequencyData(freqByteData);

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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvVXNlcnMvYWxleGdpYnNvbi9HaXQvd2F2ZXBhZC9zcmMvYXBwLmpzIiwiL1VzZXJzL2FsZXhnaWJzb24vR2l0L3dhdmVwYWQvc3JjL3JBRi5qcyIsIi9Vc2Vycy9hbGV4Z2lic29uL0dpdC93YXZlcGFkL3NyYy93YXZlcGFkLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7OztJQ0FPLEdBQUcsMkJBQU0sT0FBTzs7SUFDaEIsT0FBTywyQkFBTSxXQUFXOztBQUUvQixNQUFNLENBQUMsZ0JBQWdCLENBQUMsa0JBQWtCLEVBQUUsWUFBTTtBQUU5QyxRQUFJLEdBQUcsR0FBRyxJQUFJLE9BQU8sQ0FBQztBQUNsQixnQkFBUSxFQUFFLFFBQVE7QUFDbEIsY0FBTSxFQUFFLFNBQVM7QUFDakIsYUFBSyxFQUFFLEdBQUs7QUFDWixnQkFBUSxFQUFFLEdBQUc7S0FDaEIsQ0FBQyxDQUFDOztBQUVILE9BQUcsQ0FBQyxJQUFJLEVBQUUsQ0FBQztDQUNkLENBQUMsQ0FBQzs7Ozs7Ozs7Ozs7QUNQSCxJQUFJLEdBQUcsR0FBRyxDQUFDLFlBQVk7QUFDbkIsUUFBSSxRQUFRLEdBQUcsQ0FBQyxDQUFDO0FBQ2pCLFFBQUksT0FBTyxHQUFHLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsR0FBRyxDQUFDLENBQUM7QUFDM0MsU0FBSSxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLE9BQU8sQ0FBQyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMscUJBQXFCLEVBQUUsRUFBRSxDQUFDLEVBQUU7QUFDckUsY0FBTSxDQUFDLHFCQUFxQixHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEdBQUMsdUJBQXVCLENBQUMsQ0FBQztBQUMxRSxjQUFNLENBQUMsb0JBQW9CLEdBQUcsTUFBTSxDQUFDLE9BQU8s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QUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsUUFBUSxFQUFFLENBQUMsSUFBSSxDQUFDLEVBQUU7QUFDbEMsd0JBQU0sU0FBUyxHQUFHLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNsQyx3QkFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLGVBQWUsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDOztBQUVoRCx3QkFBSSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsUUFBUSxHQUFHLENBQUMsRUFBRSxVQUFVLEVBQUUsUUFBUSxHQUFHLENBQUMsRUFBRSxDQUFDLFNBQVMsR0FBRyxVQUFVLENBQUMsQ0FBQztpQkFDdEY7YUFDSjs7Ozs7O1dBeFdDLE9BQU87OztpQkEyV0UsT0FBTyIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJpbXBvcnQgckFGIGZyb20gJy4vckFGJztcbmltcG9ydCBXYXZlcGFkIGZyb20gJy4vd2F2ZXBhZCc7XG5cbndpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdET01Db250ZW50TG9hZGVkJywgKCkgPT4ge1xuXG4gICAgdmFyIGFwcCA9IG5ldyBXYXZlcGFkKHtcbiAgICAgICAgd2F2ZWZvcm06ICdzcXVhcmUnLFxuICAgICAgICBmaWx0ZXI6ICdsb3dwYXNzJyxcbiAgICAgICAgZGVsYXk6IDAuNTAwLFxuICAgICAgICBmZWVkYmFjazogMC40XG4gICAgfSk7XG5cbiAgICBhcHAuaW5pdCgpO1xufSk7XG4iLCIvLyBodHRwOi8vcGF1bGlyaXNoLmNvbS8yMDExL3JlcXVlc3RhbmltYXRpb25mcmFtZS1mb3Itc21hcnQtYW5pbWF0aW5nL1xuLy8gaHR0cDovL215Lm9wZXJhLmNvbS9lbW9sbGVyL2Jsb2cvMjAxMS8xMi8yMC9yZXF1ZXN0YW5pbWF0aW9uZnJhbWUtZm9yLXNtYXJ0LWVyLWFuaW1hdGluZ1xuXG4vLyByZXF1ZXN0QW5pbWF0aW9uRnJhbWUgcG9seWZpbGwgYnkgRXJpayBNw7ZsbGVyXG4vLyBmaXhlcyBmcm9tIFBhdWwgSXJpc2ggYW5kIFRpbm8gWmlqZGVsXG5cbnZhciByQUYgPSAoZnVuY3Rpb24gKCkge1xuICAgIHZhciBsYXN0VGltZSA9IDA7XG4gICAgdmFyIHZlbmRvcnMgPSBbJ21zJywgJ21veicsICd3ZWJraXQnLCAnbyddO1xuICAgIGZvcih2YXIgeCA9IDA7IHggPCB2ZW5kb3JzLmxlbmd0aCAmJiAhd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZTsgKyt4KSB7XG4gICAgICAgIHdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUgPSB3aW5kb3dbdmVuZG9yc1t4XSsnUmVxdWVzdEFuaW1hdGlvbkZyYW1lJ107XG4gICAgICAgIHdpbmRvdy5jYW5jZWxBbmltYXRpb25GcmFtZSA9IHdpbmRvd1t2ZW5kb3JzW3hdKydDYW5jZWxBbmltYXRpb25GcmFtZSddIHx8IHdpbmRvd1t2ZW5kb3JzW3hdKydDYW5jZWxSZXF1ZXN0QW5pbWF0aW9uRnJhbWUnXTtcbiAgICB9XG5cbiAgICBpZiAoIXdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUpIHtcbiAgICAgICAgd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSA9IGZ1bmN0aW9uKGNhbGxiYWNrLCBlbGVtZW50KSB7XG4gICAgICAgICAgICB2YXIgY3VyclRpbWUgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcbiAgICAgICAgICAgIHZhciB0aW1lVG9DYWxsID0gTWF0aC5tYXgoMCwgMTYgLSAoY3VyclRpbWUgLSBsYXN0VGltZSkpO1xuICAgICAgICAgICAgdmFyIGlkID0gd2luZG93LnNldFRpbWVvdXQoZnVuY3Rpb24oKSB7IGNhbGxiYWNrKGN1cnJUaW1lICsgdGltZVRvQ2FsbCk7IH0sXG4gICAgICAgICAgICAgIHRpbWVUb0NhbGwpO1xuICAgICAgICAgICAgbGFzdFRpbWUgPSBjdXJyVGltZSArIHRpbWVUb0NhbGw7XG4gICAgICAgICAgICByZXR1cm4gaWQ7XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgaWYgKCF3aW5kb3cuY2FuY2VsQW5pbWF0aW9uRnJhbWUpIHtcbiAgICAgICAgd2luZG93LmNhbmNlbEFuaW1hdGlvbkZyYW1lID0gZnVuY3Rpb24oaWQpIHtcbiAgICAgICAgICAgIGNsZWFyVGltZW91dChpZCk7XG4gICAgICAgIH07XG4gICAgfVxufSkoKTtcblxuZXhwb3J0IGRlZmF1bHQgckFGO1xuIiwiY2xhc3MgV2F2ZXBhZCB7XG5cbiAgICBjb25zdHJ1Y3RvcihvcHRpb25zKSB7XG5cbiAgICAgICAgLy8gZGVmYXVsdCBvcHRpb25zXG4gICAgICAgIHRoaXMub3B0aW9ucyA9IHtcbiAgICAgICAgICAgIHdhdmVmb3JtOiAnc2luZScsXG4gICAgICAgICAgICBmaWx0ZXI6ICdsb3dwYXNzJyxcbiAgICAgICAgICAgIGRlbGF5OiAwLjUwMCxcbiAgICAgICAgICAgIGZlZWRiYWNrOiAwLjRcbiAgICAgICAgfTtcblxuICAgICAgICAvLyBzZXQgY29uZmlndXJhYmxlIG9wdGlvbnNcbiAgICAgICAgaWYgKHR5cGVvZiBvcHRpb25zID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgZm9yIChsZXQgaSBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICAgICAgaWYgKG9wdGlvbnMuaGFzT3duUHJvcGVydHkoaSkpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5vcHRpb25zW2ldID0gb3B0aW9uc1tpXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBVSSBET00gcmVmZXJlbmNlc1xuICAgICAgICB0aGlzLm1haW4gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcubWFpbicpO1xuICAgICAgICB0aGlzLnN1cmZhY2UgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcuc3VyZmFjZScpO1xuICAgICAgICB0aGlzLmZpbmdlciA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5maW5nZXInKTtcbiAgICAgICAgdGhpcy53YXZlZm9ybSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCd3YXZlZm9ybScpO1xuICAgICAgICB0aGlzLmZpbHRlciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdmaWx0ZXItdHlwZScpO1xuICAgICAgICB0aGlzLnBvd2VyVG9nZ2xlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3Bvd2VyJyk7XG4gICAgICAgIHRoaXMuZGVsYXlUaW1lSW5wdXQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZGVsYXknKTtcbiAgICAgICAgdGhpcy5mZWVkYmFja0dhaW5JbnB1dCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdmZWVkYmFjaycpO1xuICAgICAgICB0aGlzLmRlbGF5VGltZU91dHB1dCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdkZWxheS1vdXRwdXQnKTtcbiAgICAgICAgdGhpcy5mZWVkYmFja0dhaW5PdXRwdXQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZmVlZGJhY2stb3V0cHV0Jyk7XG5cbiAgICAgICAgLy8gQ2FudmFzIGdyYXBoIGZvciBhdWRpbyBmcmVxdWVuY3kgYW5hbHl6ZXJcbiAgICAgICAgdGhpcy5jYW52YXMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdjYW52YXMnKTtcbiAgICAgICAgdGhpcy5jdHggPSB0aGlzLmNhbnZhcy5nZXRDb250ZXh0KCcyZCcpO1xuXG4gICAgICAgIC8vIFdlYiBBdWRpbyBOb2RlIHJlZmVyZW5jZXNcbiAgICAgICAgdGhpcy5zb3VyY2UgPSBudWxsO1xuICAgICAgICB0aGlzLm5vZGVzID0ge307XG4gICAgICAgIHRoaXMubXlBdWRpb0NvbnRleHQgPSBudWxsO1xuICAgICAgICB0aGlzLm15QXVkaW9BbmFseXNlciA9IG51bGw7XG5cbiAgICAgICAgLy8gTWFwIGZvciBsZWdhY3kgV2ViIEF1ZGlvIGZpbHRlciB2YWx1ZXNcbiAgICAgICAgdGhpcy5maWx0ZXJzID0gbmV3IE1hcCgpO1xuICAgICAgICB0aGlzLmZpbHRlcnMuc2V0KCdsb3dwYXNzJywgMCk7XG4gICAgICAgIHRoaXMuZmlsdGVycy5zZXQoJ2hpZ2hwYXNzJywgMSk7XG4gICAgICAgIHRoaXMuZmlsdGVycy5zZXQoJ2JhbmRwYXNzJywgMik7XG4gICAgICAgIHRoaXMuZmlsdGVycy5zZXQoJ2xvd3NoZWxmJywgMyk7XG4gICAgICAgIHRoaXMuZmlsdGVycy5zZXQoJ2hpZ2hzaGVsZicsIDQpO1xuICAgICAgICB0aGlzLmZpbHRlcnMuc2V0KCdwZWFraW5nJywgNSk7XG4gICAgICAgIHRoaXMuZmlsdGVycy5zZXQoJ25vdGNoJywgNik7XG4gICAgICAgIHRoaXMuZmlsdGVycy5zZXQoJ2FsbHBhc3MnLCA3KTtcblxuICAgICAgICAvLyBNYXAgZm9yIGxlZ2FjeSBXZWIgQXVkaW8gd2F2ZWZvcm0gdmFsdWVzXG4gICAgICAgIHRoaXMud2F2ZXMgPSBuZXcgTWFwKCk7XG4gICAgICAgIHRoaXMud2F2ZXMuc2V0KCdzaW5lJywgMCk7XG4gICAgICAgIHRoaXMud2F2ZXMuc2V0KCdzcXVhcmUnLCAxKTtcbiAgICAgICAgdGhpcy53YXZlcy5zZXQoJ3Nhd3Rvb3RoJywgMik7XG4gICAgICAgIHRoaXMud2F2ZXMuc2V0KCd0cmlhbmdsZScsIDMpO1xuXG4gICAgICAgIHRoaXMuaGFzVG91Y2ggPSBmYWxzZTtcbiAgICAgICAgdGhpcy5pc1NtYWxsVmlld3BvcnQgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5pc1BsYXlpbmcgPSBmYWxzZTtcblxuICAgICAgICAvLyBTYWZhcmkgbmVlZHMgc29tZSBzcGVjaWFsIGF0dGVudGlvbiBmb3IgaXRzIG5vbi1zdGFuZGFyZHNcbiAgICAgICAgdGhpcy5pc1NhZmFyaSA9IG5hdmlnYXRvci51c2VyQWdlbnQuaW5kZXhPZignU2FmYXJpJykgIT09IC0xICYmIG5hdmlnYXRvci51c2VyQWdlbnQuaW5kZXhPZignQ2hyb21lJykgPT0gLTE7XG4gICAgfVxuXG4gICAgaW5pdCgpIHtcblxuICAgICAgICAvLyBub3JtYWxpemUgYW5kIGNyZWF0ZSBhIG5ldyBBdWRpb0NvbnRleHQgaWYgc3VwcG9ydGVkXG4gICAgICAgIHdpbmRvdy5BdWRpb0NvbnRleHQgPSB3aW5kb3cuQXVkaW9Db250ZXh0IHx8IHdpbmRvdy53ZWJraXRBdWRpb0NvbnRleHQ7XG5cbiAgICAgICAgaWYgKCdBdWRpb0NvbnRleHQnIGluIHdpbmRvdykge1xuICAgICAgICAgICAgdGhpcy5teUF1ZGlvQ29udGV4dCA9IG5ldyBBdWRpb0NvbnRleHQoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignYnJvd3NlciBkb2VzIG5vdCBzdXBwb3J0IFdlYiBBdWRpbyBBUEknKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGJpbmQgcmVzaXplIGhhbmRsZXIgZm9yIGNhbnZhcyAmIHRvdWNoIHJlZmVyZW5jZXNcbiAgICAgICAgdGhpcy5oYW5kbGVSZXNpemUoKTtcblxuICAgICAgICAvLyBzdG9yZSByZWZlcmVuY2VzIHRvIGJvdW5kIGV2ZW50c1xuICAgICAgICAvLyBzbyB3ZSBjYW4gdW5iaW5kIHdoZW4gbmVlZGVkXG4gICAgICAgIHRoaXMucGxheUhhbmRsZXIgPSB0aGlzLnBsYXkuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5tb3ZlSGFuZGxlciA9IHRoaXMubW92ZS5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLnN0b3BIYW5kbGVyID0gdGhpcy5zdG9wLmJpbmQodGhpcyk7XG5cbiAgICAgICAgLy8gc2V0IGRlZmF1bHQgdmFsdWVzIHRoYXQgd2UncmUgc3VwcGxpZWRcbiAgICAgICAgdGhpcy5kZWxheVRpbWVJbnB1dC52YWx1ZSA9IHRoaXMub3B0aW9ucy5kZWxheTtcbiAgICAgICAgdGhpcy5mZWVkYmFja0dhaW5JbnB1dC52YWx1ZSA9IHRoaXMub3B0aW9ucy5mZWVkYmFjaztcbiAgICAgICAgdGhpcy53YXZlZm9ybS52YWx1ZSA9IHRoaXMub3B0aW9ucy53YXZlZm9ybTtcbiAgICAgICAgdGhpcy5maWx0ZXIudmFsdWUgPSB0aGlzLm9wdGlvbnMuZmlsdGVyO1xuICAgICAgICB0aGlzLnVwZGF0ZU91dHB1dHMoKTtcblxuICAgICAgICAvLyBiaW5kIFVJIGNvbnRyb2wgZXZlbnRzXG4gICAgICAgIHRoaXMucG93ZXJUb2dnbGUuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCB0aGlzLnRvZ2dsZVBvd2VyLmJpbmQodGhpcykpO1xuICAgICAgICB0aGlzLndhdmVmb3JtLmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIHRoaXMuc2V0V2F2ZWZvcm0uYmluZCh0aGlzKSk7XG4gICAgICAgIHRoaXMuZmlsdGVyLmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIHRoaXMuZmlsdGVyQ2hhbmdlLmJpbmQodGhpcykpO1xuICAgICAgICB0aGlzLmRlbGF5VGltZUlucHV0LmFkZEV2ZW50TGlzdGVuZXIoJ2lucHV0JywgdGhpcy5kZWxheUNoYW5nZS5iaW5kKHRoaXMpKTtcbiAgICAgICAgdGhpcy5mZWVkYmFja0dhaW5JbnB1dC5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsIHRoaXMuZmVlZGJhY2tDaGFuZ2UuYmluZCh0aGlzKSk7XG5cbiAgICAgICAgLy8gY3JlYXRlIFdlYiBBdWRpbyBub2Rlc1xuICAgICAgICB0aGlzLm5vZGVzLm9zY1ZvbHVtZSA9IHRoaXMubXlBdWRpb0NvbnRleHQuY3JlYXRlR2FpbiA/IHRoaXMubXlBdWRpb0NvbnRleHQuY3JlYXRlR2FpbigpIDogdGhpcy5teUF1ZGlvQ29udGV4dC5jcmVhdGVHYWluTm9kZSgpO1xuICAgICAgICB0aGlzLm5vZGVzLmZpbHRlciA9IHRoaXMubXlBdWRpb0NvbnRleHQuY3JlYXRlQmlxdWFkRmlsdGVyKCk7XG4gICAgICAgIHRoaXMubm9kZXMudm9sdW1lID0gdGhpcy5teUF1ZGlvQ29udGV4dC5jcmVhdGVHYWluID8gdGhpcy5teUF1ZGlvQ29udGV4dC5jcmVhdGVHYWluKCkgOiB0aGlzLm15QXVkaW9Db250ZXh0LmNyZWF0ZUdhaW5Ob2RlKCk7XG4gICAgICAgIHRoaXMubm9kZXMuZGVsYXkgPSB0aGlzLm15QXVkaW9Db250ZXh0LmNyZWF0ZURlbGF5ID8gdGhpcy5teUF1ZGlvQ29udGV4dC5jcmVhdGVEZWxheSgpIDogdGhpcy5teUF1ZGlvQ29udGV4dC5jcmVhdGVEZWxheU5vZGUoKTtcbiAgICAgICAgdGhpcy5ub2Rlcy5mZWVkYmFja0dhaW4gPSB0aGlzLm15QXVkaW9Db250ZXh0LmNyZWF0ZUdhaW4gPyB0aGlzLm15QXVkaW9Db250ZXh0LmNyZWF0ZUdhaW4oKSA6IHRoaXMubXlBdWRpb0NvbnRleHQuY3JlYXRlR2Fpbk5vZGUoKTtcbiAgICAgICAgdGhpcy5ub2Rlcy5jb21wcmVzc29yID0gdGhpcy5teUF1ZGlvQ29udGV4dC5jcmVhdGVEeW5hbWljc0NvbXByZXNzb3IoKTtcblxuICAgICAgICAvLyBjcmVhdGUgZnJlcXVlbmN5IGFuYWx5c2VyIG5vZGVcbiAgICAgICAgdGhpcy5teUF1ZGlvQW5hbHlzZXIgPSB0aGlzLm15QXVkaW9Db250ZXh0LmNyZWF0ZUFuYWx5c2VyKCk7XG4gICAgICAgIHRoaXMubXlBdWRpb0FuYWx5c2VyLnNtb290aGluZ1RpbWVDb25zdGFudCA9IDAuODU7XG5cbiAgICAgICAgLy8gc3RhcnQgZkFGIGZvciBmcmVxdWVuY3kgYW5hbHlzZXJcbiAgICAgICAgdGhpcy5hbmltYXRlU3BlY3RydW0oKTtcblxuICAgICAgICAvLyBwcmV2ZW50IGRlZmF1bHQgc2Nyb2xsaW5nIHdoZW4gdG91Y2htb3ZlIGZpcmVzIG9uIHN1cmZhY2VcbiAgICAgICAgdGhpcy5zdXJmYWNlLmFkZEV2ZW50TGlzdGVuZXIoJ3RvdWNobW92ZScsIGUgPT4ge1xuICAgICAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBoYW5kbGVSZXNpemUoKSB7XG4gICAgICAgIC8vIHNldCBkZWZhdWx0IGNhbnZhcyBzaXplXG4gICAgICAgIHRoaXMuaXNTbWFsbFZpZXdwb3J0ID0gd2luZG93Lm1hdGNoTWVkaWEoJyhtYXgtd2lkdGg6IDUxMnB4KScpLm1hdGNoZXMgPyB0cnVlIDogZmFsc2U7XG4gICAgICAgIHRoaXMuc2V0Q2FudmFzU2l6ZSgpO1xuXG4gICAgICAgIC8vIGxpc3RlbiBmb3IgcmVzaXplIGV2ZW50c1xuICAgICAgICB3aW5kb3cubWF0Y2hNZWRpYSgnKG1heC13aWR0aDogNTEycHgpJykuYWRkTGlzdGVuZXIobXFsID0+IHtcbiAgICAgICAgICAgIGlmIChtcWwubWF0Y2hlcykge1xuICAgICAgICAgICAgICAgIHRoaXMuaXNTbWFsbFZpZXdwb3J0ID0gdHJ1ZTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5pc1NtYWxsVmlld3BvcnQgPSBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuc2V0Q2FudmFzU2l6ZSgpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICByb3V0ZVNvdW5kcygpIHtcbiAgICAgICAgdGhpcy5zb3VyY2UgPSB0aGlzLm15QXVkaW9Db250ZXh0LmNyZWF0ZU9zY2lsbGF0b3IoKTtcblxuICAgICAgICB0aGlzLnNldFdhdmVmb3JtKHRoaXMud2F2ZWZvcm0pO1xuICAgICAgICB0aGlzLmZpbHRlckNoYW5nZSh0aGlzLmZpbHRlcik7XG4gICAgICAgIHRoaXMubm9kZXMuZmVlZGJhY2tHYWluLmdhaW4udmFsdWUgPSB0aGlzLm9wdGlvbnMuZmVlZGJhY2s7XG4gICAgICAgIHRoaXMubm9kZXMuZGVsYXkuZGVsYXlUaW1lLnZhbHVlID0gdGhpcy5vcHRpb25zLmRlbGF5O1xuICAgICAgICB0aGlzLm5vZGVzLnZvbHVtZS5nYWluLnZhbHVlID0gMC4yO1xuICAgICAgICB0aGlzLm5vZGVzLm9zY1ZvbHVtZS5nYWluLnZhbHVlID0gMDtcblxuICAgICAgICB0aGlzLnNvdXJjZS5jb25uZWN0KHRoaXMubm9kZXMub3NjVm9sdW1lKTtcbiAgICAgICAgdGhpcy5ub2Rlcy5vc2NWb2x1bWUuY29ubmVjdCh0aGlzLm5vZGVzLmZpbHRlcik7XG4gICAgICAgIHRoaXMubm9kZXMuZmlsdGVyLmNvbm5lY3QodGhpcy5ub2Rlcy5jb21wcmVzc29yKTtcbiAgICAgICAgdGhpcy5ub2Rlcy5maWx0ZXIuY29ubmVjdCh0aGlzLm5vZGVzLmRlbGF5KTtcbiAgICAgICAgdGhpcy5ub2Rlcy5kZWxheS5jb25uZWN0KHRoaXMubm9kZXMuZmVlZGJhY2tHYWluKTtcbiAgICAgICAgdGhpcy5ub2Rlcy5kZWxheS5jb25uZWN0KHRoaXMubm9kZXMuY29tcHJlc3Nvcik7XG4gICAgICAgIHRoaXMubm9kZXMuZmVlZGJhY2tHYWluLmNvbm5lY3QodGhpcy5ub2Rlcy5kZWxheSk7XG4gICAgICAgIHRoaXMubm9kZXMuY29tcHJlc3Nvci5jb25uZWN0KHRoaXMubm9kZXMudm9sdW1lKTtcbiAgICAgICAgdGhpcy5ub2Rlcy52b2x1bWUuY29ubmVjdCh0aGlzLm15QXVkaW9BbmFseXNlcik7XG4gICAgICAgIHRoaXMubXlBdWRpb0FuYWx5c2VyLmNvbm5lY3QodGhpcy5teUF1ZGlvQ29udGV4dC5kZXN0aW5hdGlvbik7XG4gICAgfVxuXG4gICAgc3RhcnRPc2MoKSB7XG4gICAgICAgIGlmICghdGhpcy5zb3VyY2Uuc3RhcnQpIHtcbiAgICAgICAgICAgIHRoaXMuc291cmNlLnN0YXJ0ID0gdGhpcy5zb3VyY2Uubm90ZU9uO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuc291cmNlLnN0YXJ0KDApO1xuICAgICAgICB0aGlzLmlzUGxheWluZyA9IHRydWU7XG4gICAgfVxuXG4gICAgc3RvcE9zYygpIHtcbiAgICAgICAgaWYgKCF0aGlzLnNvdXJjZS5zdG9wKSB7XG4gICAgICAgICAgICB0aGlzLnNvdXJjZS5zdG9wID0gdGhpcy5zb3VyY2Uubm90ZU9mZjtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnNvdXJjZS5zdG9wKDApO1xuICAgICAgICB0aGlzLmlzUGxheWluZyA9IGZhbHNlO1xuICAgIH1cblxuICAgIGJpbmRTdXJmYWNlRXZlbnRzKCkge1xuICAgICAgICB0aGlzLnN1cmZhY2UuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vkb3duJywgdGhpcy5wbGF5SGFuZGxlcik7XG4gICAgICAgIHRoaXMuc3VyZmFjZS5hZGRFdmVudExpc3RlbmVyKCd0b3VjaHN0YXJ0JywgdGhpcy5wbGF5SGFuZGxlcik7XG4gICAgfVxuXG4gICAgdW5iaW5kU3VyZmFjZUV2ZW50cygpIHtcbiAgICAgICAgdGhpcy5zdXJmYWNlLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21vdXNlZG93bicsIHRoaXMucGxheUhhbmRsZXIpO1xuICAgICAgICB0aGlzLnN1cmZhY2UucmVtb3ZlRXZlbnRMaXN0ZW5lcigndG91Y2hzdGFydCcsIHRoaXMucGxheUhhbmRsZXIpO1xuICAgIH1cblxuICAgIHRvZ2dsZVBvd2VyKCkge1xuICAgICAgICBpZiAodGhpcy5pc1BsYXlpbmcpIHtcbiAgICAgICAgICAgIHRoaXMuc3RvcE9zYygpO1xuICAgICAgICAgICAgdGhpcy5teUF1ZGlvQW5hbHlzZXIuZGlzY29ubmVjdCgpO1xuICAgICAgICAgICAgdGhpcy51bmJpbmRTdXJmYWNlRXZlbnRzKCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLnJvdXRlU291bmRzKCk7XG4gICAgICAgICAgICB0aGlzLnN0YXJ0T3NjKCk7XG4gICAgICAgICAgICB0aGlzLmJpbmRTdXJmYWNlRXZlbnRzKCk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLm1haW4uY2xhc3NMaXN0LnRvZ2dsZSgnb2ZmJyk7XG4gICAgfVxuXG4gICAgcGxheShlKSB7XG4gICAgICAgIGxldCB4ID0gZS50eXBlID09PSAndG91Y2hzdGFydCcgPyBlLnRvdWNoZXNbMF0ucGFnZVggOiBlLnBhZ2VYO1xuICAgICAgICBsZXQgeSA9IGUudHlwZSA9PT0gJ3RvdWNoc3RhcnQnID8gZS50b3VjaGVzWzBdLnBhZ2VZIDogZS5wYWdlWTtcbiAgICAgICAgY29uc3QgbXVsdGlwbGllciA9IHRoaXMuaXNTbWFsbFZpZXdwb3J0ID8gMiA6IDE7XG5cbiAgICAgICAgaWYgKGUudHlwZSA9PT0gJ3RvdWNoc3RhcnQnKSB7XG4gICAgICAgICAgICB0aGlzLmhhc1RvdWNoID0gdHJ1ZTtcbiAgICAgICAgfSBlbHNlIGlmIChlLnR5cGUgPT09ICdtb3VzZWRvd24nICYmIHRoaXMuaGFzVG91Y2gpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghdGhpcy5pc1BsYXlpbmcpIHtcbiAgICAgICAgICAgIHRoaXMucm91dGVTb3VuZHMoKTtcbiAgICAgICAgICAgIHRoaXMuc3RhcnRPc2MoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHggPSB4IC0gdGhpcy5zdXJmYWNlLm9mZnNldExlZnQ7XG4gICAgICAgIHkgPSB5IC0gdGhpcy5zdXJmYWNlLm9mZnNldFRvcDtcblxuICAgICAgICB0aGlzLm5vZGVzLm9zY1ZvbHVtZS5nYWluLnZhbHVlID0gMTtcbiAgICAgICAgdGhpcy5zb3VyY2UuZnJlcXVlbmN5LnZhbHVlID0geCAqIG11bHRpcGxpZXI7XG4gICAgICAgIHRoaXMubm9kZXMuZmlsdGVyLmZyZXF1ZW5jeS52YWx1ZSA9IHRoaXMuc2V0RmlsdGVyRnJlcXVlbmN5KHkpO1xuXG4gICAgICAgIHRoaXMuZmluZ2VyLnN0eWxlLndlYmtpdFRyYW5zZm9ybSA9IHRoaXMuZmluZ2VyLnN0eWxlLnRyYW5zZm9ybSA9IGB0cmFuc2xhdGUzZCgke3h9cHgsICR7eX1weCwgMClgO1xuICAgICAgICB0aGlzLmZpbmdlci5jbGFzc0xpc3QuYWRkKCdhY3RpdmUnKTtcblxuICAgICAgICB0aGlzLnN1cmZhY2UuYWRkRXZlbnRMaXN0ZW5lcigndG91Y2htb3ZlJywgdGhpcy5tb3ZlSGFuZGxlcik7XG4gICAgICAgIHRoaXMuc3VyZmFjZS5hZGRFdmVudExpc3RlbmVyKCd0b3VjaGVuZCcsIHRoaXMuc3RvcEhhbmRsZXIpO1xuICAgICAgICB0aGlzLnN1cmZhY2UuYWRkRXZlbnRMaXN0ZW5lcigndG91Y2hjYW5jZWwnLCB0aGlzLnN0b3BIYW5kbGVyKTtcbiAgICAgICAgdGhpcy5zdXJmYWNlLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbW92ZScsIHRoaXMubW92ZUhhbmRsZXIpO1xuICAgICAgICB0aGlzLnN1cmZhY2UuYWRkRXZlbnRMaXN0ZW5lcignbW91c2V1cCcsIHRoaXMuc3RvcEhhbmRsZXIpO1xuICAgIH1cblxuICAgIG1vdmUoZSkge1xuICAgICAgICBsZXQgeCA9IGUudHlwZSA9PT0gJ3RvdWNobW92ZScgPyBlLnRvdWNoZXNbMF0ucGFnZVggOiBlLnBhZ2VYO1xuICAgICAgICBsZXQgeSA9IGUudHlwZSA9PT0gJ3RvdWNobW92ZScgPyBlLnRvdWNoZXNbMF0ucGFnZVkgOiBlLnBhZ2VZO1xuXG4gICAgICAgIGlmIChlLnR5cGUgPT09ICdtb3VzZW1vdmUnICYmIHRoaXMuaGFzVG91Y2gpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLmlzUGxheWluZykge1xuICAgICAgICAgICAgY29uc3QgbXVsdGlwbGllciA9IHRoaXMuaXNTbWFsbFZpZXdwb3J0ID8gMiA6IDE7XG4gICAgICAgICAgICB4ID0geCAtIHRoaXMuc3VyZmFjZS5vZmZzZXRMZWZ0O1xuICAgICAgICAgICAgeSA9IHkgLSB0aGlzLnN1cmZhY2Uub2Zmc2V0VG9wO1xuICAgICAgICAgICAgdGhpcy5zb3VyY2UuZnJlcXVlbmN5LnZhbHVlID0geCAqIG11bHRpcGxpZXI7XG4gICAgICAgICAgICB0aGlzLm5vZGVzLmZpbHRlci5mcmVxdWVuY3kudmFsdWUgPSB0aGlzLnNldEZpbHRlckZyZXF1ZW5jeSh5KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuZmluZ2VyLnN0eWxlLndlYmtpdFRyYW5zZm9ybSA9IHRoaXMuZmluZ2VyLnN0eWxlLnRyYW5zZm9ybSA9IGB0cmFuc2xhdGUzZCgke3h9cHgsICR7eX1weCwgMClgO1xuICAgIH1cblxuICAgIHN0b3AoZSkge1xuICAgICAgICBsZXQgeCA9IGUudHlwZSA9PT0gJ3RvdWNoZW5kJyA/IGUuY2hhbmdlZFRvdWNoZXNbMF0ucGFnZVggOiBlLnBhZ2VYO1xuICAgICAgICBsZXQgeSA9IGUudHlwZSA9PT0gJ3RvdWNoZW5kJyA/IGUuY2hhbmdlZFRvdWNoZXNbMF0ucGFnZVkgOiBlLnBhZ2VZO1xuXG4gICAgICAgIGlmICh0aGlzLmlzUGxheWluZykge1xuICAgICAgICAgICAgY29uc3QgbXVsdGlwbGllciA9IHRoaXMuaXNTbWFsbFZpZXdwb3J0ID8gMiA6IDE7XG4gICAgICAgICAgICB4ID0geCAtIHRoaXMuc3VyZmFjZS5vZmZzZXRMZWZ0O1xuICAgICAgICAgICAgeSA9IHkgLSB0aGlzLnN1cmZhY2Uub2Zmc2V0VG9wO1xuICAgICAgICAgICAgdGhpcy5zb3VyY2UuZnJlcXVlbmN5LnZhbHVlID0geCAqIG11bHRpcGxpZXI7XG4gICAgICAgICAgICB0aGlzLm5vZGVzLmZpbHRlci5mcmVxdWVuY3kudmFsdWUgPSB0aGlzLnNldEZpbHRlckZyZXF1ZW5jeSh5KTtcbiAgICAgICAgICAgIHRoaXMubm9kZXMub3NjVm9sdW1lLmdhaW4udmFsdWUgPSAwO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5maW5nZXIuY2xhc3NMaXN0LnJlbW92ZSgnYWN0aXZlJyk7XG5cbiAgICAgICAgdGhpcy5zdXJmYWNlLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21vdXNlbW92ZScsIHRoaXMubW92ZUhhbmRsZXIpO1xuICAgICAgICB0aGlzLnN1cmZhY2UucmVtb3ZlRXZlbnRMaXN0ZW5lcignbW91c2V1cCcsIHRoaXMuc3RvcEhhbmRsZXIpO1xuICAgICAgICB0aGlzLnN1cmZhY2UucmVtb3ZlRXZlbnRMaXN0ZW5lcigndG91Y2htb3ZlJywgdGhpcy5tb3ZlSGFuZGxlcik7XG4gICAgICAgIHRoaXMuc3VyZmFjZS5yZW1vdmVFdmVudExpc3RlbmVyKCd0b3VjaGVuZCcsIHRoaXMuc3RvcEhhbmRsZXIpO1xuICAgICAgICB0aGlzLnN1cmZhY2UucmVtb3ZlRXZlbnRMaXN0ZW5lcigndG91Y2hjYW5jZWwnLCB0aGlzLnN0b3BIYW5kbGVyKTtcbiAgICB9XG5cbiAgICB1cGRhdGVPdXRwdXRzKCkge1xuICAgICAgICB0aGlzLmRlbGF5VGltZU91dHB1dC52YWx1ZSA9IE1hdGgucm91bmQodGhpcy5kZWxheVRpbWVJbnB1dC52YWx1ZSAqIDEwMDApICsgJyBtcyc7XG4gICAgICAgIHRoaXMuZmVlZGJhY2tHYWluT3V0cHV0LnZhbHVlID0gTWF0aC5yb3VuZCh0aGlzLmZlZWRiYWNrR2FpbklucHV0LnZhbHVlICogMTApO1xuICAgIH1cblxuICAgIHNldFdhdmVmb3JtKG9wdGlvbikge1xuICAgICAgICBjb25zdCB2YWx1ZSA9IG9wdGlvbi52YWx1ZSB8fCBvcHRpb24udGFyZ2V0LnZhbHVlO1xuICAgICAgICB0aGlzLnNvdXJjZS50eXBlID0gdGhpcy5pc1NhZmFyaSA/IHRoaXMud2F2ZXMuZ2V0KHZhbHVlKSA6IHZhbHVlO1xuICAgIH1cblxuICAgIGRlbGF5Q2hhbmdlKGUpIHtcbiAgICAgICAgdGhpcy5vcHRpb25zLmRlbGF5ID0gZS50YXJnZXQudmFsdWU7XG4gICAgICAgIGlmICh0aGlzLmlzUGxheWluZykge1xuICAgICAgICAgICAgdGhpcy5zdG9wT3NjKCk7XG4gICAgICAgICAgICB0aGlzLm5vZGVzLmRlbGF5LmRlbGF5VGltZS52YWx1ZSA9IHRoaXMub3B0aW9ucy5kZWxheTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnVwZGF0ZU91dHB1dHMoKTtcbiAgICB9XG5cbiAgICBmZWVkYmFja0NoYW5nZShlKSB7XG4gICAgICAgIHRoaXMub3B0aW9ucy5mZWVkYmFjayA9IGUudGFyZ2V0LnZhbHVlO1xuICAgICAgICBpZiAodGhpcy5pc1BsYXlpbmcpIHtcbiAgICAgICAgICAgIHRoaXMuc3RvcE9zYygpO1xuICAgICAgICAgICAgdGhpcy5ub2Rlcy5mZWVkYmFja0dhaW4uZ2Fpbi52YWx1ZSA9IHRoaXMub3B0aW9ucy5mZWVkYmFjaztcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnVwZGF0ZU91dHB1dHMoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXQgZmlsdGVyIGZyZXF1ZW5jeSBiYXNlZCBvbiAoeSkgYXhpcyB2YWx1ZVxuICAgICAqL1xuICAgIHNldEZpbHRlckZyZXF1ZW5jeSh5KSB7XG4gICAgICAgIC8vIG1pbiA0MEh6XG4gICAgICAgIGNvbnN0IG1pbiA9IDQwO1xuICAgICAgICAvLyBtYXggaGFsZiBvZiB0aGUgc2FtcGxpbmcgcmF0ZVxuICAgICAgICBjb25zdCBtYXggPSB0aGlzLm15QXVkaW9Db250ZXh0LnNhbXBsZVJhdGUgLyAyO1xuICAgICAgICAvLyBMb2dhcml0aG0gKGJhc2UgMikgdG8gY29tcHV0ZSBob3cgbWFueSBvY3RhdmVzIGZhbGwgaW4gdGhlIHJhbmdlLlxuICAgICAgICBjb25zdCBudW1iZXJPZk9jdGF2ZXMgPSBNYXRoLmxvZyhtYXggLyBtaW4pIC8gTWF0aC5MTjI7XG4gICAgICAgIC8vIENvbXB1dGUgYSBtdWx0aXBsaWVyIGZyb20gMCB0byAxIGJhc2VkIG9uIGFuIGV4cG9uZW50aWFsIHNjYWxlLlxuICAgICAgICBjb25zdCBtdWx0aXBsaWVyID0gTWF0aC5wb3coMiwgbnVtYmVyT2ZPY3RhdmVzICogKCgoMiAvIHRoaXMuc3VyZmFjZS5jbGllbnRIZWlnaHQpICogKHRoaXMuc3VyZmFjZS5jbGllbnRIZWlnaHQgLSB5KSkgLSAxLjApKTtcbiAgICAgICAgLy8gR2V0IGJhY2sgdG8gdGhlIGZyZXF1ZW5jeSB2YWx1ZSBiZXR3ZWVuIG1pbiBhbmQgbWF4LlxuICAgICAgICByZXR1cm4gbWF4ICogbXVsdGlwbGllcjtcbiAgICB9XG5cbiAgICBmaWx0ZXJDaGFuZ2Uob3B0aW9uKSB7XG4gICAgICAgIGNvbnN0IHZhbHVlID0gb3B0aW9uLnZhbHVlIHx8IG9wdGlvbi50YXJnZXQudmFsdWU7XG4gICAgICAgIHRoaXMubm9kZXMuZmlsdGVyLnR5cGUgPSB0aGlzLmlzU2FmYXJpID8gdGhpcy5maWx0ZXJzLmdldCh2YWx1ZSkgOiB2YWx1ZTtcbiAgICB9XG5cbiAgICBhbmltYXRlU3BlY3RydW0oKSB7XG4gICAgICAgIC8vIExpbWl0IGNhbnZhcyByZWRyYXcgdG8gNDAgZnBzXG4gICAgICAgIHNldFRpbWVvdXQodGhpcy5vblRpY2suYmluZCh0aGlzKSwgMTAwMCAvIDQwKTtcbiAgICB9XG5cbiAgICBvblRpY2soKSB7XG4gICAgICAgIHRoaXMuZHJhd1NwZWN0cnVtKCk7XG4gICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aGlzLmFuaW1hdGVTcGVjdHJ1bS5iaW5kKHRoaXMpLCB0aGlzLmNhbnZhcyk7XG4gICAgfVxuXG4gICAgc2V0Q2FudmFzU2l6ZSgpIHtcbiAgICAgICAgY29uc3QgY2FudmFzU2l6ZSA9IHRoaXMuaXNTbWFsbFZpZXdwb3J0ID8gMjU2IDogNTEyO1xuICAgICAgICB0aGlzLmNhbnZhcy53aWR0aCA9IHRoaXMuY2FudmFzLmhlaWdodCA9IGNhbnZhc1NpemUgLSAxMDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBEcmF3IHRoZSBjYW52YXMgZnJlcXVlbmN5IGRhdGEgZ3JhcGhcbiAgICAgKi9cbiAgICBkcmF3U3BlY3RydW0oKSB7XG4gICAgICAgIGNvbnN0IGNhbnZhc1NpemUgPSB0aGlzLmlzU21hbGxWaWV3cG9ydCA/IDI1NiA6IDUxMjtcbiAgICAgICAgY29uc3QgYmFyV2lkdGggPSB0aGlzLmlzU21hbGxWaWV3cG9ydCA/IDEwIDogMjA7XG4gICAgICAgIGNvbnN0IGJhckNvdW50ID0gTWF0aC5yb3VuZChjYW52YXNTaXplIC8gYmFyV2lkdGgpO1xuICAgICAgICBjb25zdCBmcmVxQnl0ZURhdGEgPSBuZXcgVWludDhBcnJheSh0aGlzLm15QXVkaW9BbmFseXNlci5mcmVxdWVuY3lCaW5Db3VudCk7XG5cbiAgICAgICAgdGhpcy5jdHguY2xlYXJSZWN0KDAsIDAsIGNhbnZhc1NpemUsIGNhbnZhc1NpemUpO1xuICAgICAgICB0aGlzLmN0eC5maWxsU3R5bGUgPSAnIzFkMWMyNSc7XG5cbiAgICAgICAgdGhpcy5teUF1ZGlvQW5hbHlzZXIuZ2V0Qnl0ZUZyZXF1ZW5jeURhdGEoZnJlcUJ5dGVEYXRhKTtcblxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGJhckNvdW50OyBpICs9IDEpIHtcbiAgICAgICAgICAgIGNvbnN0IG1hZ25pdHVkZSA9IGZyZXFCeXRlRGF0YVtpXTtcbiAgICAgICAgICAgIGNvbnN0IG11bHRpcGxpZXIgPSB0aGlzLmlzU21hbGxWaWV3cG9ydCA/IDEgOiAyO1xuICAgICAgICAgICAgLy8gc29tZSB2YWx1ZXMgbmVlZCBhZGp1c3RpbmcgdG8gZml0IG9uIHRoZSBjYW52YXNcbiAgICAgICAgICAgIHRoaXMuY3R4LmZpbGxSZWN0KGJhcldpZHRoICogaSwgY2FudmFzU2l6ZSwgYmFyV2lkdGggLSAxLCAtbWFnbml0dWRlICogbXVsdGlwbGllcik7XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IFdhdmVwYWQ7XG4iXX0=
