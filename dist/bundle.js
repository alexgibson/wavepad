(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";

var _interopRequire = function (obj) { return obj && obj.__esModule ? obj["default"] : obj; };

var rAF = _interopRequire(require("./rAF"));

var Wavepad = _interopRequire(require("./wavepad"));

window.addEventListener("DOMContentLoaded", function () {
    var app = new Wavepad({
        waveform: "square",
        filter: "lowpass"
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
            filter: "lowpass"
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
        var doc = document;
        this.canvas = doc.querySelector("canvas");
        this.main = doc.querySelector(".main");
        this.surface = doc.querySelector(".surface");
        this.finger = doc.querySelector(".finger");
        this.waveform = doc.getElementById("waveform");
        this.filter = doc.getElementById("filter-type");
        this.powerToggle = doc.getElementById("power");
        this.delayTimeInput = doc.getElementById("delay");
        this.feedbackGainInput = doc.getElementById("feedback");
        this.delayTimeOutput = doc.getElementById("delay-output");
        this.feedbackGainOutput = doc.getElementById("feedback-output");

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
                var _this = this;


                // normalize and create a new AudioContext if supported
                window.AudioContext = window.AudioContext || window.webkitAudioContext;

                if ("AudioContext" in window) {
                    this.myAudioContext = new AudioContext();
                } else {
                    alert("Your browser does not yet support the Web Audio API");
                    return;
                }

                // get default surface size and listen for resize changes
                this.isSmallViewport = window.matchMedia("(max-width: 512px)").matches ? true : false;

                window.matchMedia("(max-width: 512px)").addListener(function (mql) {
                    if (mql.matches) {
                        _this.isSmallViewport = true;
                    } else {
                        _this.isSmallViewport = false;
                    }
                });

                // store references to bound events
                // so we can unbind when needed
                this.playHandler = this.play.bind(this);
                this.moveHandler = this.move.bind(this);
                this.stopHandler = this.stop.bind(this);

                // set default values that we're supplied
                this.waveform.value = this.options.waveform;
                this.filter.value = this.options.filter;
                this.updateOutputs();

                // bind UI control events
                this.powerToggle.addEventListener("click", this.togglePower.bind(this));
                this.waveform.addEventListener("change", this.setWaveform.bind(this));
                this.filter.addEventListener("change", this.filterChange.bind(this));
                this.delayTimeInput.addEventListener("input", this.sliderChange.bind(this));
                this.feedbackGainInput.addEventListener("input", this.sliderChange.bind(this));

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
        routeSounds: {
            value: function routeSounds() {
                this.source = this.myAudioContext.createOscillator();

                this.setWaveform(this.waveform);
                this.filterChange(this.filter);
                this.nodes.feedbackGain.gain.value = this.feedbackGainInput.value;
                this.nodes.delay.delayTime.value = this.delayTimeInput.value;
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
                var x = e.pageX - this.surface.offsetLeft;
                var y = e.pageY - this.surface.offsetTop;
                var multiplier = this.isSmallViewport ? 2 : 1;

                if (!this.isPlaying) {
                    this.routeSounds();
                    this.startOsc();
                }

                if (e.type === "touchstart") {
                    this.hasTouch = true;
                } else if (e.type === "mousedown" && this.hasTouch) {
                    return;
                }

                this.nodes.oscVolume.gain.value = 1;
                this.source.frequency.value = x * multiplier;
                this.setFilterFrequency(y);

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
                var x = e.pageX - this.surface.offsetLeft;
                var y = e.pageY - this.surface.offsetTop;
                var multiplier = this.isSmallViewport ? 2 : 1;

                if (e.type === "mousemove" && this.hasTouch) {
                    return;
                }

                if (this.isPlaying) {
                    this.source.frequency.value = x * multiplier;
                    this.setFilterFrequency(y);
                }

                this.finger.style.webkitTransform = this.finger.style.transform = "translate3d(" + x + "px, " + y + "px, 0)";
            },
            writable: true,
            configurable: true
        },
        stop: {
            value: function stop(e) {
                var x = e.pageX - this.surface.offsetLeft;
                var y = e.pageY - this.surface.offsetTop;
                var multiplier = this.isSmallViewport ? 2 : 1;

                if (this.isPlaying) {
                    this.source.frequency.value = x * multiplier;
                    this.setFilterFrequency(y);
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
        sliderChange: {
            value: function sliderChange(slider) {
                if (this.isPlaying) {
                    this.stopOsc();
                    if (slider.id === "delay") {
                        this.nodes.delay.delayTime.value = slider.value;
                    } else if (slider.id === "feedback") {
                        this.nodes.feedbackGain.gain.value = slider.value;
                    }
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
                this.nodes.filter.frequency.value = max * multiplier;
            },
            writable: true,
            configurable: true
        },
        filterChange: {
            value: function filterChange(option) {
                var value = option.value || option.target.value;
                var id = option.id || option.target.id;

                if (id === "filter-type") {
                    this.nodes.filter.type = this.isSafari ? this.filters.get(value) : value;
                }
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
        drawSpectrum: {

            /**
             * Draw the canvas frequency data graph
             */
            value: function drawSpectrum() {
                var ctx = this.canvas.getContext("2d");
                var canvasSize = this.isSmallViewport ? 256 : 512;
                var multiplier = this.isSmallViewport ? 1 : 2;
                var barWidth = this.isSmallViewport ? 10 : 20;
                var freqByteData = new Uint8Array(this.myAudioAnalyser.frequencyBinCount);
                var barCount = Math.round(canvasSize / barWidth);

                this.canvas.width = canvasSize - 10;
                this.canvas.height = canvasSize - 10;

                ctx.clearRect(0, 0, canvasSize, canvasSize);
                ctx.fillStyle = "#1d1c25";

                this.myAudioAnalyser.getByteFrequencyData(freqByteData);

                for (var i = 0; i < barCount; i += 1) {
                    var magnitude = freqByteData[i];
                    // some values need adjusting to fit on the canvas
                    ctx.fillRect(barWidth * i, canvasSize, barWidth - 1, -magnitude * multiplier);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvVXNlcnMvYWxleGdpYnNvbi9HaXQvd2F2ZXBhZC9zcmMvYXBwLmpzIiwiL1VzZXJzL2FsZXhnaWJzb24vR2l0L3dhdmVwYWQvc3JjL3JBRi5qcyIsIi9Vc2Vycy9hbGV4Z2lic29uL0dpdC93YXZlcGFkL3NyYy93YXZlcGFkLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7OztJQ0FPLEdBQUcsMkJBQU0sT0FBTzs7SUFDaEIsT0FBTywyQkFBTSxXQUFXOztBQUUvQixNQUFNLENBQUMsZ0JBQWdCLENBQUMsa0JBQWtCLEVBQUUsWUFBTTtBQUU5QyxRQUFJLEdBQUcsR0FBRyxJQUFJLE9BQU8sQ0FBQztBQUNsQixrQkFBWSxRQUFRO0FBQ3BCLGdCQUFVLFNBQVM7S0FDdEIsQ0FBQyxDQUFDOztBQUVILE9BQUcsQ0FBQyxJQUFJLEVBQUUsQ0FBQztDQUNkLENBQUMsQ0FBQzs7Ozs7Ozs7Ozs7QUNMSCxJQUFJLEdBQUcsR0FBRyxDQUFDLFlBQVk7QUFDbkIsUUFBSSxRQUFRLEdBQUcsQ0FBQyxDQUFDO0FBQ2pCLFFBQUksT0FBTyxHQUFHLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsR0FBRyxDQUFDLENBQUM7QUFDM0MsU0FBSSxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLE9BQU8sQ0FBQyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMscUJBQXFCLEVBQUUsRUFBRSxDQUFDLEVBQUU7QUFDckUsY0FBTSxDQUFDLHFCQUFxQixHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEdBQUMsdUJBQXVCLENBQUMsQ0FBQztBQUMxRSxjQUFNLENBQUMsb0JBQW9CLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsR0FBQyxzQkFBc0IsQ0FBQyxJQUFJLE1BQU0sQ0FBQyxPQUFP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aWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiaW1wb3J0IHJBRiBmcm9tICcuL3JBRic7XG5pbXBvcnQgV2F2ZXBhZCBmcm9tICcuL3dhdmVwYWQnO1xuXG53aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ29udGVudExvYWRlZCcsICgpID0+IHtcblxuICAgIHZhciBhcHAgPSBuZXcgV2F2ZXBhZCh7XG4gICAgICAgICd3YXZlZm9ybSc6ICdzcXVhcmUnLFxuICAgICAgICAnZmlsdGVyJzogJ2xvd3Bhc3MnXG4gICAgfSk7XG5cbiAgICBhcHAuaW5pdCgpO1xufSk7XG4iLCIvLyBodHRwOi8vcGF1bGlyaXNoLmNvbS8yMDExL3JlcXVlc3RhbmltYXRpb25mcmFtZS1mb3Itc21hcnQtYW5pbWF0aW5nL1xuLy8gaHR0cDovL215Lm9wZXJhLmNvbS9lbW9sbGVyL2Jsb2cvMjAxMS8xMi8yMC9yZXF1ZXN0YW5pbWF0aW9uZnJhbWUtZm9yLXNtYXJ0LWVyLWFuaW1hdGluZ1xuXG4vLyByZXF1ZXN0QW5pbWF0aW9uRnJhbWUgcG9seWZpbGwgYnkgRXJpayBNw7ZsbGVyXG4vLyBmaXhlcyBmcm9tIFBhdWwgSXJpc2ggYW5kIFRpbm8gWmlqZGVsXG5cbnZhciByQUYgPSAoZnVuY3Rpb24gKCkge1xuICAgIHZhciBsYXN0VGltZSA9IDA7XG4gICAgdmFyIHZlbmRvcnMgPSBbJ21zJywgJ21veicsICd3ZWJraXQnLCAnbyddO1xuICAgIGZvcih2YXIgeCA9IDA7IHggPCB2ZW5kb3JzLmxlbmd0aCAmJiAhd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZTsgKyt4KSB7XG4gICAgICAgIHdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUgPSB3aW5kb3dbdmVuZG9yc1t4XSsnUmVxdWVzdEFuaW1hdGlvbkZyYW1lJ107XG4gICAgICAgIHdpbmRvdy5jYW5jZWxBbmltYXRpb25GcmFtZSA9IHdpbmRvd1t2ZW5kb3JzW3hdKydDYW5jZWxBbmltYXRpb25GcmFtZSddIHx8IHdpbmRvd1t2ZW5kb3JzW3hdKydDYW5jZWxSZXF1ZXN0QW5pbWF0aW9uRnJhbWUnXTtcbiAgICB9XG5cbiAgICBpZiAoIXdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUpIHtcbiAgICAgICAgd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSA9IGZ1bmN0aW9uKGNhbGxiYWNrLCBlbGVtZW50KSB7XG4gICAgICAgICAgICB2YXIgY3VyclRpbWUgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcbiAgICAgICAgICAgIHZhciB0aW1lVG9DYWxsID0gTWF0aC5tYXgoMCwgMTYgLSAoY3VyclRpbWUgLSBsYXN0VGltZSkpO1xuICAgICAgICAgICAgdmFyIGlkID0gd2luZG93LnNldFRpbWVvdXQoZnVuY3Rpb24oKSB7IGNhbGxiYWNrKGN1cnJUaW1lICsgdGltZVRvQ2FsbCk7IH0sXG4gICAgICAgICAgICAgIHRpbWVUb0NhbGwpO1xuICAgICAgICAgICAgbGFzdFRpbWUgPSBjdXJyVGltZSArIHRpbWVUb0NhbGw7XG4gICAgICAgICAgICByZXR1cm4gaWQ7XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgaWYgKCF3aW5kb3cuY2FuY2VsQW5pbWF0aW9uRnJhbWUpIHtcbiAgICAgICAgd2luZG93LmNhbmNlbEFuaW1hdGlvbkZyYW1lID0gZnVuY3Rpb24oaWQpIHtcbiAgICAgICAgICAgIGNsZWFyVGltZW91dChpZCk7XG4gICAgICAgIH07XG4gICAgfVxufSkoKTtcblxuZXhwb3J0IGRlZmF1bHQgckFGO1xuIiwiY2xhc3MgV2F2ZXBhZCB7XG5cbiAgICBjb25zdHJ1Y3RvcihvcHRpb25zKSB7XG5cbiAgICAgICAgLy8gZGVmYXVsdCBvcHRpb25zXG4gICAgICAgIHRoaXMub3B0aW9ucyA9IHtcbiAgICAgICAgICAgIHdhdmVmb3JtOiAnc2luZScsXG4gICAgICAgICAgICBmaWx0ZXI6ICdsb3dwYXNzJ1xuICAgICAgICB9O1xuXG4gICAgICAgIC8vIHNldCBjb25maWd1cmFibGUgb3B0aW9uc1xuICAgICAgICBpZiAodHlwZW9mIG9wdGlvbnMgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICBmb3IgKGxldCBpIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgICAgICBpZiAob3B0aW9ucy5oYXNPd25Qcm9wZXJ0eShpKSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLm9wdGlvbnNbaV0gPSBvcHRpb25zW2ldO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFVJIERPTSByZWZlcmVuY2VzXG4gICAgICAgIGxldCBkb2MgPSBkb2N1bWVudDtcbiAgICAgICAgdGhpcy5jYW52YXMgPSBkb2MucXVlcnlTZWxlY3RvcignY2FudmFzJyk7XG4gICAgICAgIHRoaXMubWFpbiA9IGRvYy5xdWVyeVNlbGVjdG9yKCcubWFpbicpO1xuICAgICAgICB0aGlzLnN1cmZhY2UgPSBkb2MucXVlcnlTZWxlY3RvcignLnN1cmZhY2UnKTtcbiAgICAgICAgdGhpcy5maW5nZXIgPSBkb2MucXVlcnlTZWxlY3RvcignLmZpbmdlcicpO1xuICAgICAgICB0aGlzLndhdmVmb3JtID0gZG9jLmdldEVsZW1lbnRCeUlkKCd3YXZlZm9ybScpO1xuICAgICAgICB0aGlzLmZpbHRlciA9IGRvYy5nZXRFbGVtZW50QnlJZCgnZmlsdGVyLXR5cGUnKTtcbiAgICAgICAgdGhpcy5wb3dlclRvZ2dsZSA9IGRvYy5nZXRFbGVtZW50QnlJZCgncG93ZXInKTtcbiAgICAgICAgdGhpcy5kZWxheVRpbWVJbnB1dCA9IGRvYy5nZXRFbGVtZW50QnlJZCgnZGVsYXknKTtcbiAgICAgICAgdGhpcy5mZWVkYmFja0dhaW5JbnB1dCA9IGRvYy5nZXRFbGVtZW50QnlJZCgnZmVlZGJhY2snKTtcbiAgICAgICAgdGhpcy5kZWxheVRpbWVPdXRwdXQgPSBkb2MuZ2V0RWxlbWVudEJ5SWQoJ2RlbGF5LW91dHB1dCcpO1xuICAgICAgICB0aGlzLmZlZWRiYWNrR2Fpbk91dHB1dCA9IGRvYy5nZXRFbGVtZW50QnlJZCgnZmVlZGJhY2stb3V0cHV0Jyk7XG5cbiAgICAgICAgLy8gV2ViIEF1ZGlvIE5vZGUgcmVmZXJlbmNlc1xuICAgICAgICB0aGlzLnNvdXJjZSA9IG51bGw7XG4gICAgICAgIHRoaXMubm9kZXMgPSB7fTtcbiAgICAgICAgdGhpcy5teUF1ZGlvQ29udGV4dCA9IG51bGw7XG4gICAgICAgIHRoaXMubXlBdWRpb0FuYWx5c2VyID0gbnVsbDtcblxuICAgICAgICAvLyBNYXAgZm9yIGxlZ2FjeSBXZWIgQXVkaW8gZmlsdGVyIHZhbHVlc1xuICAgICAgICB0aGlzLmZpbHRlcnMgPSBuZXcgTWFwKCk7XG4gICAgICAgIHRoaXMuZmlsdGVycy5zZXQoJ2xvd3Bhc3MnLCAwKTtcbiAgICAgICAgdGhpcy5maWx0ZXJzLnNldCgnaGlnaHBhc3MnLCAxKTtcbiAgICAgICAgdGhpcy5maWx0ZXJzLnNldCgnYmFuZHBhc3MnLCAyKTtcbiAgICAgICAgdGhpcy5maWx0ZXJzLnNldCgnbG93c2hlbGYnLCAzKTtcbiAgICAgICAgdGhpcy5maWx0ZXJzLnNldCgnaGlnaHNoZWxmJywgNCk7XG4gICAgICAgIHRoaXMuZmlsdGVycy5zZXQoJ3BlYWtpbmcnLCA1KTtcbiAgICAgICAgdGhpcy5maWx0ZXJzLnNldCgnbm90Y2gnLCA2KTtcbiAgICAgICAgdGhpcy5maWx0ZXJzLnNldCgnYWxscGFzcycsIDcpO1xuXG4gICAgICAgIC8vIE1hcCBmb3IgbGVnYWN5IFdlYiBBdWRpbyB3YXZlZm9ybSB2YWx1ZXNcbiAgICAgICAgdGhpcy53YXZlcyA9IG5ldyBNYXAoKTtcbiAgICAgICAgdGhpcy53YXZlcy5zZXQoJ3NpbmUnLCAwKTtcbiAgICAgICAgdGhpcy53YXZlcy5zZXQoJ3NxdWFyZScsIDEpO1xuICAgICAgICB0aGlzLndhdmVzLnNldCgnc2F3dG9vdGgnLCAyKTtcbiAgICAgICAgdGhpcy53YXZlcy5zZXQoJ3RyaWFuZ2xlJywgMyk7XG5cbiAgICAgICAgdGhpcy5oYXNUb3VjaCA9IGZhbHNlO1xuICAgICAgICB0aGlzLmlzU21hbGxWaWV3cG9ydCA9IGZhbHNlO1xuICAgICAgICB0aGlzLmlzUGxheWluZyA9IGZhbHNlO1xuXG4gICAgICAgIC8vIFNhZmFyaSBuZWVkcyBzb21lIHNwZWNpYWwgYXR0ZW50aW9uIGZvciBpdHMgbm9uLXN0YW5kYXJkc1xuICAgICAgICB0aGlzLmlzU2FmYXJpID0gbmF2aWdhdG9yLnVzZXJBZ2VudC5pbmRleE9mKCdTYWZhcmknKSAhPT0gLTEgJiYgbmF2aWdhdG9yLnVzZXJBZ2VudC5pbmRleE9mKCdDaHJvbWUnKSA9PSAtMTtcbiAgICB9XG5cbiAgICBpbml0KCkge1xuXG4gICAgICAgIC8vIG5vcm1hbGl6ZSBhbmQgY3JlYXRlIGEgbmV3IEF1ZGlvQ29udGV4dCBpZiBzdXBwb3J0ZWRcbiAgICAgICAgd2luZG93LkF1ZGlvQ29udGV4dCA9IHdpbmRvdy5BdWRpb0NvbnRleHQgfHwgd2luZG93LndlYmtpdEF1ZGlvQ29udGV4dDtcblxuICAgICAgICBpZiAoJ0F1ZGlvQ29udGV4dCcgaW4gd2luZG93KSB7XG4gICAgICAgICAgICB0aGlzLm15QXVkaW9Db250ZXh0ID0gbmV3IEF1ZGlvQ29udGV4dCgpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgYWxlcnQoJ1lvdXIgYnJvd3NlciBkb2VzIG5vdCB5ZXQgc3VwcG9ydCB0aGUgV2ViIEF1ZGlvIEFQSScpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gZ2V0IGRlZmF1bHQgc3VyZmFjZSBzaXplIGFuZCBsaXN0ZW4gZm9yIHJlc2l6ZSBjaGFuZ2VzXG4gICAgICAgIHRoaXMuaXNTbWFsbFZpZXdwb3J0ID0gd2luZG93Lm1hdGNoTWVkaWEoJyhtYXgtd2lkdGg6IDUxMnB4KScpLm1hdGNoZXMgPyB0cnVlIDogZmFsc2U7XG5cbiAgICAgICAgd2luZG93Lm1hdGNoTWVkaWEoJyhtYXgtd2lkdGg6IDUxMnB4KScpLmFkZExpc3RlbmVyKG1xbCA9PiB7XG4gICAgICAgICAgICBpZiAobXFsLm1hdGNoZXMpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmlzU21hbGxWaWV3cG9ydCA9IHRydWU7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMuaXNTbWFsbFZpZXdwb3J0ID0gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIHN0b3JlIHJlZmVyZW5jZXMgdG8gYm91bmQgZXZlbnRzXG4gICAgICAgIC8vIHNvIHdlIGNhbiB1bmJpbmQgd2hlbiBuZWVkZWRcbiAgICAgICAgdGhpcy5wbGF5SGFuZGxlciA9IHRoaXMucGxheS5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLm1vdmVIYW5kbGVyID0gdGhpcy5tb3ZlLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuc3RvcEhhbmRsZXIgPSB0aGlzLnN0b3AuYmluZCh0aGlzKTtcblxuICAgICAgICAvLyBzZXQgZGVmYXVsdCB2YWx1ZXMgdGhhdCB3ZSdyZSBzdXBwbGllZFxuICAgICAgICB0aGlzLndhdmVmb3JtLnZhbHVlID0gdGhpcy5vcHRpb25zLndhdmVmb3JtO1xuICAgICAgICB0aGlzLmZpbHRlci52YWx1ZSA9IHRoaXMub3B0aW9ucy5maWx0ZXI7XG4gICAgICAgIHRoaXMudXBkYXRlT3V0cHV0cygpO1xuXG4gICAgICAgIC8vIGJpbmQgVUkgY29udHJvbCBldmVudHNcbiAgICAgICAgdGhpcy5wb3dlclRvZ2dsZS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIHRoaXMudG9nZ2xlUG93ZXIuYmluZCh0aGlzKSk7XG4gICAgICAgIHRoaXMud2F2ZWZvcm0uYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgdGhpcy5zZXRXYXZlZm9ybS5iaW5kKHRoaXMpKTtcbiAgICAgICAgdGhpcy5maWx0ZXIuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgdGhpcy5maWx0ZXJDaGFuZ2UuYmluZCh0aGlzKSk7XG4gICAgICAgIHRoaXMuZGVsYXlUaW1lSW5wdXQuYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCB0aGlzLnNsaWRlckNoYW5nZS5iaW5kKHRoaXMpKTtcbiAgICAgICAgdGhpcy5mZWVkYmFja0dhaW5JbnB1dC5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsIHRoaXMuc2xpZGVyQ2hhbmdlLmJpbmQodGhpcykpO1xuXG4gICAgICAgIC8vIGNyZWF0ZSBXZWIgQXVkaW8gbm9kZXNcbiAgICAgICAgdGhpcy5ub2Rlcy5vc2NWb2x1bWUgPSB0aGlzLm15QXVkaW9Db250ZXh0LmNyZWF0ZUdhaW4gPyB0aGlzLm15QXVkaW9Db250ZXh0LmNyZWF0ZUdhaW4oKSA6IHRoaXMubXlBdWRpb0NvbnRleHQuY3JlYXRlR2Fpbk5vZGUoKTtcbiAgICAgICAgdGhpcy5ub2Rlcy5maWx0ZXIgPSB0aGlzLm15QXVkaW9Db250ZXh0LmNyZWF0ZUJpcXVhZEZpbHRlcigpO1xuICAgICAgICB0aGlzLm5vZGVzLnZvbHVtZSA9IHRoaXMubXlBdWRpb0NvbnRleHQuY3JlYXRlR2FpbiA/IHRoaXMubXlBdWRpb0NvbnRleHQuY3JlYXRlR2FpbigpIDogdGhpcy5teUF1ZGlvQ29udGV4dC5jcmVhdGVHYWluTm9kZSgpO1xuICAgICAgICB0aGlzLm5vZGVzLmRlbGF5ID0gdGhpcy5teUF1ZGlvQ29udGV4dC5jcmVhdGVEZWxheSA/IHRoaXMubXlBdWRpb0NvbnRleHQuY3JlYXRlRGVsYXkoKSA6IHRoaXMubXlBdWRpb0NvbnRleHQuY3JlYXRlRGVsYXlOb2RlKCk7XG4gICAgICAgIHRoaXMubm9kZXMuZmVlZGJhY2tHYWluID0gdGhpcy5teUF1ZGlvQ29udGV4dC5jcmVhdGVHYWluID8gdGhpcy5teUF1ZGlvQ29udGV4dC5jcmVhdGVHYWluKCkgOiB0aGlzLm15QXVkaW9Db250ZXh0LmNyZWF0ZUdhaW5Ob2RlKCk7XG4gICAgICAgIHRoaXMubm9kZXMuY29tcHJlc3NvciA9IHRoaXMubXlBdWRpb0NvbnRleHQuY3JlYXRlRHluYW1pY3NDb21wcmVzc29yKCk7XG5cbiAgICAgICAgLy8gY3JlYXRlIGZyZXF1ZW5jeSBhbmFseXNlciBub2RlXG4gICAgICAgIHRoaXMubXlBdWRpb0FuYWx5c2VyID0gdGhpcy5teUF1ZGlvQ29udGV4dC5jcmVhdGVBbmFseXNlcigpO1xuICAgICAgICB0aGlzLm15QXVkaW9BbmFseXNlci5zbW9vdGhpbmdUaW1lQ29uc3RhbnQgPSAwLjg1O1xuXG4gICAgICAgIC8vIHN0YXJ0IGZBRiBmb3IgZnJlcXVlbmN5IGFuYWx5c2VyXG4gICAgICAgIHRoaXMuYW5pbWF0ZVNwZWN0cnVtKCk7XG5cbiAgICAgICAgLy8gcHJldmVudCBkZWZhdWx0IHNjcm9sbGluZyB3aGVuIHRvdWNobW92ZSBmaXJlcyBvbiBzdXJmYWNlXG4gICAgICAgIHRoaXMuc3VyZmFjZS5hZGRFdmVudExpc3RlbmVyKCd0b3VjaG1vdmUnLCBlID0+IHtcbiAgICAgICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcm91dGVTb3VuZHMoKSB7XG4gICAgICAgIHRoaXMuc291cmNlID0gdGhpcy5teUF1ZGlvQ29udGV4dC5jcmVhdGVPc2NpbGxhdG9yKCk7XG5cbiAgICAgICAgdGhpcy5zZXRXYXZlZm9ybSh0aGlzLndhdmVmb3JtKTtcbiAgICAgICAgdGhpcy5maWx0ZXJDaGFuZ2UodGhpcy5maWx0ZXIpO1xuICAgICAgICB0aGlzLm5vZGVzLmZlZWRiYWNrR2Fpbi5nYWluLnZhbHVlID0gdGhpcy5mZWVkYmFja0dhaW5JbnB1dC52YWx1ZTtcbiAgICAgICAgdGhpcy5ub2Rlcy5kZWxheS5kZWxheVRpbWUudmFsdWUgPSB0aGlzLmRlbGF5VGltZUlucHV0LnZhbHVlO1xuICAgICAgICB0aGlzLm5vZGVzLnZvbHVtZS5nYWluLnZhbHVlID0gMC4yO1xuICAgICAgICB0aGlzLm5vZGVzLm9zY1ZvbHVtZS5nYWluLnZhbHVlID0gMDtcblxuICAgICAgICB0aGlzLnNvdXJjZS5jb25uZWN0KHRoaXMubm9kZXMub3NjVm9sdW1lKTtcbiAgICAgICAgdGhpcy5ub2Rlcy5vc2NWb2x1bWUuY29ubmVjdCh0aGlzLm5vZGVzLmZpbHRlcik7XG4gICAgICAgIHRoaXMubm9kZXMuZmlsdGVyLmNvbm5lY3QodGhpcy5ub2Rlcy5jb21wcmVzc29yKTtcbiAgICAgICAgdGhpcy5ub2Rlcy5maWx0ZXIuY29ubmVjdCh0aGlzLm5vZGVzLmRlbGF5KTtcbiAgICAgICAgdGhpcy5ub2Rlcy5kZWxheS5jb25uZWN0KHRoaXMubm9kZXMuZmVlZGJhY2tHYWluKTtcbiAgICAgICAgdGhpcy5ub2Rlcy5kZWxheS5jb25uZWN0KHRoaXMubm9kZXMuY29tcHJlc3Nvcik7XG4gICAgICAgIHRoaXMubm9kZXMuZmVlZGJhY2tHYWluLmNvbm5lY3QodGhpcy5ub2Rlcy5kZWxheSk7XG4gICAgICAgIHRoaXMubm9kZXMuY29tcHJlc3Nvci5jb25uZWN0KHRoaXMubm9kZXMudm9sdW1lKTtcbiAgICAgICAgdGhpcy5ub2Rlcy52b2x1bWUuY29ubmVjdCh0aGlzLm15QXVkaW9BbmFseXNlcik7XG4gICAgICAgIHRoaXMubXlBdWRpb0FuYWx5c2VyLmNvbm5lY3QodGhpcy5teUF1ZGlvQ29udGV4dC5kZXN0aW5hdGlvbik7XG4gICAgfVxuXG4gICAgc3RhcnRPc2MoKSB7XG4gICAgICAgIGlmICghdGhpcy5zb3VyY2Uuc3RhcnQpIHtcbiAgICAgICAgICAgIHRoaXMuc291cmNlLnN0YXJ0ID0gdGhpcy5zb3VyY2Uubm90ZU9uO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuc291cmNlLnN0YXJ0KDApO1xuICAgICAgICB0aGlzLmlzUGxheWluZyA9IHRydWU7XG4gICAgfVxuXG4gICAgc3RvcE9zYygpIHtcbiAgICAgICAgaWYgKCF0aGlzLnNvdXJjZS5zdG9wKSB7XG4gICAgICAgICAgICB0aGlzLnNvdXJjZS5zdG9wID0gdGhpcy5zb3VyY2Uubm90ZU9mZjtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnNvdXJjZS5zdG9wKDApO1xuICAgICAgICB0aGlzLmlzUGxheWluZyA9IGZhbHNlO1xuICAgIH1cblxuICAgIGJpbmRTdXJmYWNlRXZlbnRzKCkge1xuICAgICAgICB0aGlzLnN1cmZhY2UuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vkb3duJywgdGhpcy5wbGF5SGFuZGxlcik7XG4gICAgICAgIHRoaXMuc3VyZmFjZS5hZGRFdmVudExpc3RlbmVyKCd0b3VjaHN0YXJ0JywgdGhpcy5wbGF5SGFuZGxlcik7XG4gICAgfVxuXG4gICAgdW5iaW5kU3VyZmFjZUV2ZW50cygpIHtcbiAgICAgICAgdGhpcy5zdXJmYWNlLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21vdXNlZG93bicsIHRoaXMucGxheUhhbmRsZXIpO1xuICAgICAgICB0aGlzLnN1cmZhY2UucmVtb3ZlRXZlbnRMaXN0ZW5lcigndG91Y2hzdGFydCcsIHRoaXMucGxheUhhbmRsZXIpO1xuICAgIH1cblxuICAgIHRvZ2dsZVBvd2VyKCkge1xuICAgICAgICBpZiAodGhpcy5pc1BsYXlpbmcpIHtcbiAgICAgICAgICAgIHRoaXMuc3RvcE9zYygpO1xuICAgICAgICAgICAgdGhpcy5teUF1ZGlvQW5hbHlzZXIuZGlzY29ubmVjdCgpO1xuICAgICAgICAgICAgdGhpcy51bmJpbmRTdXJmYWNlRXZlbnRzKCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLnJvdXRlU291bmRzKCk7XG4gICAgICAgICAgICB0aGlzLnN0YXJ0T3NjKCk7XG4gICAgICAgICAgICB0aGlzLmJpbmRTdXJmYWNlRXZlbnRzKCk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLm1haW4uY2xhc3NMaXN0LnRvZ2dsZSgnb2ZmJyk7XG4gICAgfVxuXG4gICAgcGxheShlKSB7XG4gICAgICAgIGxldCB4ID0gZS5wYWdlWCAtIHRoaXMuc3VyZmFjZS5vZmZzZXRMZWZ0O1xuICAgICAgICBsZXQgeSA9IGUucGFnZVkgLSB0aGlzLnN1cmZhY2Uub2Zmc2V0VG9wO1xuICAgICAgICBsZXQgbXVsdGlwbGllciA9IHRoaXMuaXNTbWFsbFZpZXdwb3J0ID8gMiA6IDE7XG5cbiAgICAgICAgaWYgKCF0aGlzLmlzUGxheWluZykge1xuICAgICAgICAgICAgdGhpcy5yb3V0ZVNvdW5kcygpO1xuICAgICAgICAgICAgdGhpcy5zdGFydE9zYygpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGUudHlwZSA9PT0gJ3RvdWNoc3RhcnQnKSB7XG4gICAgICAgICAgICB0aGlzLmhhc1RvdWNoID0gdHJ1ZTtcbiAgICAgICAgfSBlbHNlIGlmIChlLnR5cGUgPT09ICdtb3VzZWRvd24nICYmIHRoaXMuaGFzVG91Y2gpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMubm9kZXMub3NjVm9sdW1lLmdhaW4udmFsdWUgPSAxO1xuICAgICAgICB0aGlzLnNvdXJjZS5mcmVxdWVuY3kudmFsdWUgPSB4ICogbXVsdGlwbGllcjtcbiAgICAgICAgdGhpcy5zZXRGaWx0ZXJGcmVxdWVuY3koeSk7XG5cbiAgICAgICAgdGhpcy5maW5nZXIuc3R5bGUud2Via2l0VHJhbnNmb3JtID0gdGhpcy5maW5nZXIuc3R5bGUudHJhbnNmb3JtID0gYHRyYW5zbGF0ZTNkKCR7eH1weCwgJHt5fXB4LCAwKWA7XG4gICAgICAgIHRoaXMuZmluZ2VyLmNsYXNzTGlzdC5hZGQoJ2FjdGl2ZScpO1xuXG4gICAgICAgIHRoaXMuc3VyZmFjZS5hZGRFdmVudExpc3RlbmVyKCd0b3VjaG1vdmUnLCB0aGlzLm1vdmVIYW5kbGVyKTtcbiAgICAgICAgdGhpcy5zdXJmYWNlLmFkZEV2ZW50TGlzdGVuZXIoJ3RvdWNoZW5kJywgdGhpcy5zdG9wSGFuZGxlcik7XG4gICAgICAgIHRoaXMuc3VyZmFjZS5hZGRFdmVudExpc3RlbmVyKCd0b3VjaGNhbmNlbCcsIHRoaXMuc3RvcEhhbmRsZXIpO1xuICAgICAgICB0aGlzLnN1cmZhY2UuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vtb3ZlJywgdGhpcy5tb3ZlSGFuZGxlcik7XG4gICAgICAgIHRoaXMuc3VyZmFjZS5hZGRFdmVudExpc3RlbmVyKCdtb3VzZXVwJywgdGhpcy5zdG9wSGFuZGxlcik7XG4gICAgfVxuXG4gICAgbW92ZShlKSB7XG4gICAgICAgIGxldCB4ID0gZS5wYWdlWCAtIHRoaXMuc3VyZmFjZS5vZmZzZXRMZWZ0O1xuICAgICAgICBsZXQgeSA9IGUucGFnZVkgLSB0aGlzLnN1cmZhY2Uub2Zmc2V0VG9wO1xuICAgICAgICBsZXQgbXVsdGlwbGllciA9IHRoaXMuaXNTbWFsbFZpZXdwb3J0ID8gMiA6IDE7XG5cbiAgICAgICAgaWYgKGUudHlwZSA9PT0gJ21vdXNlbW92ZScgJiYgdGhpcy5oYXNUb3VjaCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuaXNQbGF5aW5nKSB7XG4gICAgICAgICAgICB0aGlzLnNvdXJjZS5mcmVxdWVuY3kudmFsdWUgPSB4ICogbXVsdGlwbGllcjtcbiAgICAgICAgICAgIHRoaXMuc2V0RmlsdGVyRnJlcXVlbmN5KHkpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5maW5nZXIuc3R5bGUud2Via2l0VHJhbnNmb3JtID0gdGhpcy5maW5nZXIuc3R5bGUudHJhbnNmb3JtID0gYHRyYW5zbGF0ZTNkKCR7eH1weCwgJHt5fXB4LCAwKWA7XG4gICAgfVxuXG4gICAgc3RvcChlKSB7XG4gICAgICAgIGxldCB4ID0gZS5wYWdlWCAtIHRoaXMuc3VyZmFjZS5vZmZzZXRMZWZ0O1xuICAgICAgICBsZXQgeSA9IGUucGFnZVkgLSB0aGlzLnN1cmZhY2Uub2Zmc2V0VG9wO1xuICAgICAgICBsZXQgbXVsdGlwbGllciA9IHRoaXMuaXNTbWFsbFZpZXdwb3J0ID8gMiA6IDE7XG5cbiAgICAgICAgaWYgKHRoaXMuaXNQbGF5aW5nKSB7XG4gICAgICAgICAgICB0aGlzLnNvdXJjZS5mcmVxdWVuY3kudmFsdWUgPSB4ICogbXVsdGlwbGllcjtcbiAgICAgICAgICAgIHRoaXMuc2V0RmlsdGVyRnJlcXVlbmN5KHkpO1xuICAgICAgICAgICAgdGhpcy5ub2Rlcy5vc2NWb2x1bWUuZ2Fpbi52YWx1ZSA9IDA7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmZpbmdlci5jbGFzc0xpc3QucmVtb3ZlKCdhY3RpdmUnKTtcblxuICAgICAgICB0aGlzLnN1cmZhY2UucmVtb3ZlRXZlbnRMaXN0ZW5lcignbW91c2Vtb3ZlJywgdGhpcy5tb3ZlSGFuZGxlcik7XG4gICAgICAgIHRoaXMuc3VyZmFjZS5yZW1vdmVFdmVudExpc3RlbmVyKCdtb3VzZXVwJywgdGhpcy5zdG9wSGFuZGxlcik7XG4gICAgICAgIHRoaXMuc3VyZmFjZS5yZW1vdmVFdmVudExpc3RlbmVyKCd0b3VjaG1vdmUnLCB0aGlzLm1vdmVIYW5kbGVyKTtcbiAgICAgICAgdGhpcy5zdXJmYWNlLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3RvdWNoZW5kJywgdGhpcy5zdG9wSGFuZGxlcik7XG4gICAgICAgIHRoaXMuc3VyZmFjZS5yZW1vdmVFdmVudExpc3RlbmVyKCd0b3VjaGNhbmNlbCcsIHRoaXMuc3RvcEhhbmRsZXIpO1xuICAgIH1cblxuICAgIHVwZGF0ZU91dHB1dHMoKSB7XG4gICAgICAgIHRoaXMuZGVsYXlUaW1lT3V0cHV0LnZhbHVlID0gTWF0aC5yb3VuZCh0aGlzLmRlbGF5VGltZUlucHV0LnZhbHVlICogMTAwMCkgKyAnIG1zJztcbiAgICAgICAgdGhpcy5mZWVkYmFja0dhaW5PdXRwdXQudmFsdWUgPSBNYXRoLnJvdW5kKHRoaXMuZmVlZGJhY2tHYWluSW5wdXQudmFsdWUgKiAxMCk7XG4gICAgfVxuXG4gICAgc2V0V2F2ZWZvcm0ob3B0aW9uKSB7XG4gICAgICAgIGxldCB2YWx1ZSA9IG9wdGlvbi52YWx1ZSB8fCBvcHRpb24udGFyZ2V0LnZhbHVlO1xuICAgICAgICB0aGlzLnNvdXJjZS50eXBlID0gdGhpcy5pc1NhZmFyaSA/IHRoaXMud2F2ZXMuZ2V0KHZhbHVlKSA6IHZhbHVlO1xuICAgIH1cblxuICAgIHNsaWRlckNoYW5nZShzbGlkZXIpIHtcbiAgICAgICAgaWYgKHRoaXMuaXNQbGF5aW5nKSB7XG4gICAgICAgICAgICB0aGlzLnN0b3BPc2MoKTtcbiAgICAgICAgICAgIGlmIChzbGlkZXIuaWQgPT09ICdkZWxheScpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm5vZGVzLmRlbGF5LmRlbGF5VGltZS52YWx1ZSA9IHNsaWRlci52YWx1ZTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoc2xpZGVyLmlkID09PSAnZmVlZGJhY2snKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5ub2Rlcy5mZWVkYmFja0dhaW4uZ2Fpbi52YWx1ZSA9IHNsaWRlci52YWx1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0aGlzLnVwZGF0ZU91dHB1dHMoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXQgZmlsdGVyIGZyZXF1ZW5jeSBiYXNlZCBvbiAoeSkgYXhpcyB2YWx1ZVxuICAgICAqL1xuICAgIHNldEZpbHRlckZyZXF1ZW5jeSh5KSB7XG4gICAgICAgIC8vIG1pbiA0MEh6XG4gICAgICAgIGxldCBtaW4gPSA0MDtcbiAgICAgICAgLy8gbWF4IGhhbGYgb2YgdGhlIHNhbXBsaW5nIHJhdGVcbiAgICAgICAgbGV0IG1heCA9IHRoaXMubXlBdWRpb0NvbnRleHQuc2FtcGxlUmF0ZSAvIDI7XG4gICAgICAgIC8vIExvZ2FyaXRobSAoYmFzZSAyKSB0byBjb21wdXRlIGhvdyBtYW55IG9jdGF2ZXMgZmFsbCBpbiB0aGUgcmFuZ2UuXG4gICAgICAgIGxldCBudW1iZXJPZk9jdGF2ZXMgPSBNYXRoLmxvZyhtYXggLyBtaW4pIC8gTWF0aC5MTjI7XG4gICAgICAgIC8vIENvbXB1dGUgYSBtdWx0aXBsaWVyIGZyb20gMCB0byAxIGJhc2VkIG9uIGFuIGV4cG9uZW50aWFsIHNjYWxlLlxuICAgICAgICBsZXQgbXVsdGlwbGllciA9IE1hdGgucG93KDIsIG51bWJlck9mT2N0YXZlcyAqICgoKDIgLyB0aGlzLnN1cmZhY2UuY2xpZW50SGVpZ2h0KSAqICh0aGlzLnN1cmZhY2UuY2xpZW50SGVpZ2h0IC0geSkpIC0gMS4wKSk7XG4gICAgICAgIC8vIEdldCBiYWNrIHRvIHRoZSBmcmVxdWVuY3kgdmFsdWUgYmV0d2VlbiBtaW4gYW5kIG1heC5cbiAgICAgICAgdGhpcy5ub2Rlcy5maWx0ZXIuZnJlcXVlbmN5LnZhbHVlID0gbWF4ICogbXVsdGlwbGllcjtcbiAgICB9XG5cbiAgICBmaWx0ZXJDaGFuZ2Uob3B0aW9uKSB7XG4gICAgICAgIGxldCB2YWx1ZSA9IG9wdGlvbi52YWx1ZSB8fCBvcHRpb24udGFyZ2V0LnZhbHVlO1xuICAgICAgICBsZXQgaWQgPSBvcHRpb24uaWQgfHwgb3B0aW9uLnRhcmdldC5pZDtcblxuICAgICAgICBpZiAoaWQgPT09ICdmaWx0ZXItdHlwZScpIHtcbiAgICAgICAgICAgIHRoaXMubm9kZXMuZmlsdGVyLnR5cGUgPSB0aGlzLmlzU2FmYXJpID8gdGhpcy5maWx0ZXJzLmdldCh2YWx1ZSkgOiB2YWx1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGFuaW1hdGVTcGVjdHJ1bSgpIHtcbiAgICAgICAgLy8gTGltaXQgY2FudmFzIHJlZHJhdyB0byA0MCBmcHNcbiAgICAgICAgc2V0VGltZW91dCh0aGlzLm9uVGljay5iaW5kKHRoaXMpLCAxMDAwIC8gNDApO1xuICAgIH1cblxuICAgIG9uVGljaygpIHtcbiAgICAgICAgdGhpcy5kcmF3U3BlY3RydW0oKTtcbiAgICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHRoaXMuYW5pbWF0ZVNwZWN0cnVtLmJpbmQodGhpcyksIHRoaXMuY2FudmFzKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBEcmF3IHRoZSBjYW52YXMgZnJlcXVlbmN5IGRhdGEgZ3JhcGhcbiAgICAgKi9cbiAgICBkcmF3U3BlY3RydW0oKSB7XG4gICAgICAgIGxldCBjdHggPSB0aGlzLmNhbnZhcy5nZXRDb250ZXh0KCcyZCcpO1xuICAgICAgICBsZXQgY2FudmFzU2l6ZSA9IHRoaXMuaXNTbWFsbFZpZXdwb3J0ID8gMjU2IDogNTEyO1xuICAgICAgICBsZXQgbXVsdGlwbGllciA9IHRoaXMuaXNTbWFsbFZpZXdwb3J0ID8gMSA6IDI7XG4gICAgICAgIGxldCBiYXJXaWR0aCA9IHRoaXMuaXNTbWFsbFZpZXdwb3J0ID8gMTAgOiAyMDtcbiAgICAgICAgbGV0IGZyZXFCeXRlRGF0YSA9IG5ldyBVaW50OEFycmF5KHRoaXMubXlBdWRpb0FuYWx5c2VyLmZyZXF1ZW5jeUJpbkNvdW50KTtcbiAgICAgICAgbGV0IGJhckNvdW50ID0gTWF0aC5yb3VuZChjYW52YXNTaXplIC8gYmFyV2lkdGgpO1xuXG4gICAgICAgIHRoaXMuY2FudmFzLndpZHRoID0gY2FudmFzU2l6ZSAtIDEwO1xuICAgICAgICB0aGlzLmNhbnZhcy5oZWlnaHQgPSBjYW52YXNTaXplIC0gMTA7XG5cbiAgICAgICAgY3R4LmNsZWFyUmVjdCgwLCAwLCBjYW52YXNTaXplLCBjYW52YXNTaXplKTtcbiAgICAgICAgY3R4LmZpbGxTdHlsZSA9ICcjMWQxYzI1JztcblxuICAgICAgICB0aGlzLm15QXVkaW9BbmFseXNlci5nZXRCeXRlRnJlcXVlbmN5RGF0YShmcmVxQnl0ZURhdGEpO1xuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYmFyQ291bnQ7IGkgKz0gMSkge1xuICAgICAgICAgICAgbGV0IG1hZ25pdHVkZSA9IGZyZXFCeXRlRGF0YVtpXTtcbiAgICAgICAgICAgIC8vIHNvbWUgdmFsdWVzIG5lZWQgYWRqdXN0aW5nIHRvIGZpdCBvbiB0aGUgY2FudmFzXG4gICAgICAgICAgICBjdHguZmlsbFJlY3QoYmFyV2lkdGggKiBpLCBjYW52YXNTaXplLCBiYXJXaWR0aCAtIDEsIC1tYWduaXR1ZGUgKiBtdWx0aXBsaWVyKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgV2F2ZXBhZDtcbiJdfQ==
