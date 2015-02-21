(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";

var _interopRequire = function (obj) { return obj && obj.__esModule ? obj["default"] : obj; };

var rAF = _interopRequire(require("./rAF"));

var Wavepad = _interopRequire(require("./wavepad"));

window.addEventListener("DOMContentLoaded", function () {
    var app = new Wavepad("wave-pd1", {
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
    function Wavepad(id, options) {
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
                    throw new Error("wavepad.js: browser does not support Web Audio API");
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

                this.synth.classList.toggle("off");
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvVXNlcnMvYWxleGdpYnNvbi9HaXQvd2F2ZXBhZC9zcmMvYXBwLmpzIiwiL1VzZXJzL2FsZXhnaWJzb24vR2l0L3dhdmVwYWQvc3JjL3JBRi5qcyIsIi9Vc2Vycy9hbGV4Z2lic29uL0dpdC93YXZlcGFkL3NyYy93YXZlcGFkLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7OztJQ0FPLEdBQUcsMkJBQU0sT0FBTzs7SUFDaEIsT0FBTywyQkFBTSxXQUFXOztBQUUvQixNQUFNLENBQUMsZ0JBQWdCLENBQUMsa0JBQWtCLEVBQUUsWUFBTTtBQUU5QyxRQUFJLEdBQUcsR0FBRyxJQUFJLE9BQU8sQ0FBQyxVQUFVLEVBQUU7QUFDOUIsZ0JBQVEsRUFBRSxRQUFRO0FBQ2xCLGNBQU0sRUFBRSxTQUFTO0FBQ2pCLGFBQUssRUFBRSxHQUFLO0FBQ1osZ0JBQVEsRUFBRSxHQUFHO0tBQ2hCLENBQUMsQ0FBQzs7QUFFSCxPQUFHLENBQUMsSUFBSSxFQUFFLENBQUM7Q0FDZCxDQUFDLENBQUM7Ozs7Ozs7Ozs7O0FDUEgsSUFBSSxHQUFHLEdBQUcsQ0FBQyxZQUFZO0FBQ25CLFFBQUksUUFBUSxHQUFHLENBQUMsQ0FBQztBQUNqQixRQUFJLE9BQU8sR0FBRyxDQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLEdBQUcsQ0FBQyxDQUFDO0FBQzNDLFNBQUksSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxPQUFPLENBQUMsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLHFCQUFxQixFQUFFLEVBQUUsQ0FBQyxFQUFFO0FBQ3JFLGNBQU0sQ0FBQyxxQkFBcUIsR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxHQUFDLHVCQUF1QixDQUFDLENBQUM7QUFDMUUsY0FBTSxDQUFDLG9CQUFvQixHQUFHLE1BQU0s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R0FBRyxJQUFJLFVBQVUsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLGlCQUFpQixDQUFDLENBQUM7O0FBRTVFLG9CQUFJLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLFVBQVUsRUFBRSxVQUFVLENBQUMsQ0FBQztBQUNqRCxvQkFBSSxDQUFDLEdBQUcsQ0FBQyxTQUFTLEdBQUcsU0FBUyxDQUFDOztBQUUvQixvQkFBSSxDQUFDLGVBQWUsQ0FBQyxvQkFBb0IsQ0FBQyxZQUFZLENBQUMsQ0FBQzs7QUFFeEQscUJBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxRQUFRLEVBQUUsQ0FBQyxJQUFJLENBQUMsRUFBRTtBQUNsQyx3QkFBTSxTQUFTLEdBQUcsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ2xDLHdCQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsZUFBZSxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7O0FBRWhELHdCQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxRQUFRLEdBQUcsQ0FBQyxFQUFFLFVBQVUsRUFBRSxRQUFRLEdBQUcsQ0FBQyxFQUFFLENBQUMsU0FBUyxHQUFHLFVBQVUsQ0FBQyxDQUFDO2lCQUN0RjthQUNKOzs7Ozs7V0E1V0MsT0FBTzs7O2lCQStXRSxPQUFPIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsImltcG9ydCByQUYgZnJvbSAnLi9yQUYnO1xuaW1wb3J0IFdhdmVwYWQgZnJvbSAnLi93YXZlcGFkJztcblxud2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUNvbnRlbnRMb2FkZWQnLCAoKSA9PiB7XG5cbiAgICB2YXIgYXBwID0gbmV3IFdhdmVwYWQoJ3dhdmUtcGQxJywge1xuICAgICAgICB3YXZlZm9ybTogJ3NxdWFyZScsXG4gICAgICAgIGZpbHRlcjogJ2xvd3Bhc3MnLFxuICAgICAgICBkZWxheTogMC41MDAsXG4gICAgICAgIGZlZWRiYWNrOiAwLjRcbiAgICB9KTtcblxuICAgIGFwcC5pbml0KCk7XG59KTtcbiIsIi8vIGh0dHA6Ly9wYXVsaXJpc2guY29tLzIwMTEvcmVxdWVzdGFuaW1hdGlvbmZyYW1lLWZvci1zbWFydC1hbmltYXRpbmcvXG4vLyBodHRwOi8vbXkub3BlcmEuY29tL2Vtb2xsZXIvYmxvZy8yMDExLzEyLzIwL3JlcXVlc3RhbmltYXRpb25mcmFtZS1mb3Itc21hcnQtZXItYW5pbWF0aW5nXG5cbi8vIHJlcXVlc3RBbmltYXRpb25GcmFtZSBwb2x5ZmlsbCBieSBFcmlrIE3DtmxsZXJcbi8vIGZpeGVzIGZyb20gUGF1bCBJcmlzaCBhbmQgVGlubyBaaWpkZWxcblxudmFyIHJBRiA9IChmdW5jdGlvbiAoKSB7XG4gICAgdmFyIGxhc3RUaW1lID0gMDtcbiAgICB2YXIgdmVuZG9ycyA9IFsnbXMnLCAnbW96JywgJ3dlYmtpdCcsICdvJ107XG4gICAgZm9yKHZhciB4ID0gMDsgeCA8IHZlbmRvcnMubGVuZ3RoICYmICF3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lOyArK3gpIHtcbiAgICAgICAgd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSA9IHdpbmRvd1t2ZW5kb3JzW3hdKydSZXF1ZXN0QW5pbWF0aW9uRnJhbWUnXTtcbiAgICAgICAgd2luZG93LmNhbmNlbEFuaW1hdGlvbkZyYW1lID0gd2luZG93W3ZlbmRvcnNbeF0rJ0NhbmNlbEFuaW1hdGlvbkZyYW1lJ10gfHwgd2luZG93W3ZlbmRvcnNbeF0rJ0NhbmNlbFJlcXVlc3RBbmltYXRpb25GcmFtZSddO1xuICAgIH1cblxuICAgIGlmICghd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSkge1xuICAgICAgICB3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lID0gZnVuY3Rpb24oY2FsbGJhY2ssIGVsZW1lbnQpIHtcbiAgICAgICAgICAgIHZhciBjdXJyVGltZSA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuICAgICAgICAgICAgdmFyIHRpbWVUb0NhbGwgPSBNYXRoLm1heCgwLCAxNiAtIChjdXJyVGltZSAtIGxhc3RUaW1lKSk7XG4gICAgICAgICAgICB2YXIgaWQgPSB3aW5kb3cuc2V0VGltZW91dChmdW5jdGlvbigpIHsgY2FsbGJhY2soY3VyclRpbWUgKyB0aW1lVG9DYWxsKTsgfSxcbiAgICAgICAgICAgICAgdGltZVRvQ2FsbCk7XG4gICAgICAgICAgICBsYXN0VGltZSA9IGN1cnJUaW1lICsgdGltZVRvQ2FsbDtcbiAgICAgICAgICAgIHJldHVybiBpZDtcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBpZiAoIXdpbmRvdy5jYW5jZWxBbmltYXRpb25GcmFtZSkge1xuICAgICAgICB3aW5kb3cuY2FuY2VsQW5pbWF0aW9uRnJhbWUgPSBmdW5jdGlvbihpZCkge1xuICAgICAgICAgICAgY2xlYXJUaW1lb3V0KGlkKTtcbiAgICAgICAgfTtcbiAgICB9XG59KSgpO1xuXG5leHBvcnQgZGVmYXVsdCByQUY7XG4iLCJjbGFzcyBXYXZlcGFkIHtcblxuICAgIGNvbnN0cnVjdG9yKGlkLCBvcHRpb25zKSB7XG5cbiAgICAgICAgLy8gZGVmYXVsdCBvcHRpb25zXG4gICAgICAgIHRoaXMub3B0aW9ucyA9IHtcbiAgICAgICAgICAgIHdhdmVmb3JtOiAnc2luZScsXG4gICAgICAgICAgICBmaWx0ZXI6ICdsb3dwYXNzJyxcbiAgICAgICAgICAgIGRlbGF5OiAwLjUwMCxcbiAgICAgICAgICAgIGZlZWRiYWNrOiAwLjRcbiAgICAgICAgfTtcblxuICAgICAgICAvLyBzZXQgY29uZmlndXJhYmxlIG9wdGlvbnNcbiAgICAgICAgaWYgKHR5cGVvZiBvcHRpb25zID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgZm9yIChsZXQgaSBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICAgICAgaWYgKG9wdGlvbnMuaGFzT3duUHJvcGVydHkoaSkpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5vcHRpb25zW2ldID0gb3B0aW9uc1tpXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodHlwZW9mIGlkICE9PSAnc3RyaW5nJyAmJiB0eXBlb2YgaWQgIT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ3dhdmVwYWQuanM6IGZpcnN0IGFyZ3VtZW50IG11c3QgYmUgYSB2YWxpZCBET00gaWRlbnRpZmllcicpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gVUkgRE9NIHJlZmVyZW5jZXNcbiAgICAgICAgdGhpcy5zeW50aCA9IHR5cGVvZiBpZCA9PT0gJ29iamVjdCcgPyBpZCA6IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGlkKTtcbiAgICAgICAgdGhpcy5zdXJmYWNlID0gdGhpcy5zeW50aC5xdWVyeVNlbGVjdG9yKCcuc3VyZmFjZScpO1xuICAgICAgICB0aGlzLmZpbmdlciA9IHRoaXMuc3ludGgucXVlcnlTZWxlY3RvcignLmZpbmdlcicpO1xuICAgICAgICB0aGlzLndhdmVmb3JtID0gdGhpcy5zeW50aC5xdWVyeVNlbGVjdG9yKCcjd2F2ZWZvcm0nKTtcbiAgICAgICAgdGhpcy5maWx0ZXIgPSB0aGlzLnN5bnRoLnF1ZXJ5U2VsZWN0b3IoJyNmaWx0ZXItdHlwZScpO1xuICAgICAgICB0aGlzLnBvd2VyVG9nZ2xlID0gdGhpcy5zeW50aC5xdWVyeVNlbGVjdG9yKCcjcG93ZXInKTtcbiAgICAgICAgdGhpcy5kZWxheVRpbWVJbnB1dCA9IHRoaXMuc3ludGgucXVlcnlTZWxlY3RvcignI2RlbGF5Jyk7XG4gICAgICAgIHRoaXMuZmVlZGJhY2tHYWluSW5wdXQgPSB0aGlzLnN5bnRoLnF1ZXJ5U2VsZWN0b3IoJyNmZWVkYmFjaycpO1xuICAgICAgICB0aGlzLmRlbGF5VGltZU91dHB1dCA9IHRoaXMuc3ludGgucXVlcnlTZWxlY3RvcignI2RlbGF5LW91dHB1dCcpO1xuICAgICAgICB0aGlzLmZlZWRiYWNrR2Fpbk91dHB1dCA9IHRoaXMuc3ludGgucXVlcnlTZWxlY3RvcignI2ZlZWRiYWNrLW91dHB1dCcpO1xuXG4gICAgICAgIC8vIENhbnZhcyBncmFwaCBmb3IgYXVkaW8gZnJlcXVlbmN5IGFuYWx5emVyXG4gICAgICAgIHRoaXMuY2FudmFzID0gdGhpcy5zeW50aC5xdWVyeVNlbGVjdG9yKCdjYW52YXMnKTtcbiAgICAgICAgdGhpcy5jdHggPSB0aGlzLmNhbnZhcy5nZXRDb250ZXh0KCcyZCcpO1xuXG4gICAgICAgIC8vIFdlYiBBdWRpbyBOb2RlIHJlZmVyZW5jZXNcbiAgICAgICAgdGhpcy5zb3VyY2UgPSBudWxsO1xuICAgICAgICB0aGlzLm5vZGVzID0ge307XG4gICAgICAgIHRoaXMubXlBdWRpb0NvbnRleHQgPSBudWxsO1xuICAgICAgICB0aGlzLm15QXVkaW9BbmFseXNlciA9IG51bGw7XG5cbiAgICAgICAgLy8gTWFwIGZvciBsZWdhY3kgV2ViIEF1ZGlvIGZpbHRlciB2YWx1ZXNcbiAgICAgICAgdGhpcy5maWx0ZXJzID0gbmV3IE1hcCgpO1xuICAgICAgICB0aGlzLmZpbHRlcnMuc2V0KCdsb3dwYXNzJywgMCk7XG4gICAgICAgIHRoaXMuZmlsdGVycy5zZXQoJ2hpZ2hwYXNzJywgMSk7XG4gICAgICAgIHRoaXMuZmlsdGVycy5zZXQoJ2JhbmRwYXNzJywgMik7XG4gICAgICAgIHRoaXMuZmlsdGVycy5zZXQoJ2xvd3NoZWxmJywgMyk7XG4gICAgICAgIHRoaXMuZmlsdGVycy5zZXQoJ2hpZ2hzaGVsZicsIDQpO1xuICAgICAgICB0aGlzLmZpbHRlcnMuc2V0KCdwZWFraW5nJywgNSk7XG4gICAgICAgIHRoaXMuZmlsdGVycy5zZXQoJ25vdGNoJywgNik7XG4gICAgICAgIHRoaXMuZmlsdGVycy5zZXQoJ2FsbHBhc3MnLCA3KTtcblxuICAgICAgICAvLyBNYXAgZm9yIGxlZ2FjeSBXZWIgQXVkaW8gd2F2ZWZvcm0gdmFsdWVzXG4gICAgICAgIHRoaXMud2F2ZXMgPSBuZXcgTWFwKCk7XG4gICAgICAgIHRoaXMud2F2ZXMuc2V0KCdzaW5lJywgMCk7XG4gICAgICAgIHRoaXMud2F2ZXMuc2V0KCdzcXVhcmUnLCAxKTtcbiAgICAgICAgdGhpcy53YXZlcy5zZXQoJ3Nhd3Rvb3RoJywgMik7XG4gICAgICAgIHRoaXMud2F2ZXMuc2V0KCd0cmlhbmdsZScsIDMpO1xuXG4gICAgICAgIHRoaXMuaGFzVG91Y2ggPSBmYWxzZTtcbiAgICAgICAgdGhpcy5pc1NtYWxsVmlld3BvcnQgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5pc1BsYXlpbmcgPSBmYWxzZTtcblxuICAgICAgICAvLyBTYWZhcmkgbmVlZHMgc29tZSBzcGVjaWFsIGF0dGVudGlvbiBmb3IgaXRzIG5vbi1zdGFuZGFyZHNcbiAgICAgICAgdGhpcy5pc1NhZmFyaSA9IG5hdmlnYXRvci51c2VyQWdlbnQuaW5kZXhPZignU2FmYXJpJykgIT09IC0xICYmIG5hdmlnYXRvci51c2VyQWdlbnQuaW5kZXhPZignQ2hyb21lJykgPT0gLTE7XG4gICAgfVxuXG4gICAgaW5pdCgpIHtcblxuICAgICAgICAvLyBub3JtYWxpemUgYW5kIGNyZWF0ZSBhIG5ldyBBdWRpb0NvbnRleHQgaWYgc3VwcG9ydGVkXG4gICAgICAgIHdpbmRvdy5BdWRpb0NvbnRleHQgPSB3aW5kb3cuQXVkaW9Db250ZXh0IHx8IHdpbmRvdy53ZWJraXRBdWRpb0NvbnRleHQ7XG5cbiAgICAgICAgaWYgKCdBdWRpb0NvbnRleHQnIGluIHdpbmRvdykge1xuICAgICAgICAgICAgdGhpcy5teUF1ZGlvQ29udGV4dCA9IG5ldyBBdWRpb0NvbnRleHQoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignd2F2ZXBhZC5qczogYnJvd3NlciBkb2VzIG5vdCBzdXBwb3J0IFdlYiBBdWRpbyBBUEknKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGJpbmQgcmVzaXplIGhhbmRsZXIgZm9yIGNhbnZhcyAmIHRvdWNoIHJlZmVyZW5jZXNcbiAgICAgICAgdGhpcy5oYW5kbGVSZXNpemUoKTtcblxuICAgICAgICAvLyBzdG9yZSByZWZlcmVuY2VzIHRvIGJvdW5kIGV2ZW50c1xuICAgICAgICAvLyBzbyB3ZSBjYW4gdW5iaW5kIHdoZW4gbmVlZGVkXG4gICAgICAgIHRoaXMucGxheUhhbmRsZXIgPSB0aGlzLnBsYXkuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5tb3ZlSGFuZGxlciA9IHRoaXMubW92ZS5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLnN0b3BIYW5kbGVyID0gdGhpcy5zdG9wLmJpbmQodGhpcyk7XG5cbiAgICAgICAgLy8gc2V0IGRlZmF1bHQgdmFsdWVzIHRoYXQgd2UncmUgc3VwcGxpZWRcbiAgICAgICAgdGhpcy5kZWxheVRpbWVJbnB1dC52YWx1ZSA9IHRoaXMub3B0aW9ucy5kZWxheTtcbiAgICAgICAgdGhpcy5mZWVkYmFja0dhaW5JbnB1dC52YWx1ZSA9IHRoaXMub3B0aW9ucy5mZWVkYmFjaztcbiAgICAgICAgdGhpcy53YXZlZm9ybS52YWx1ZSA9IHRoaXMub3B0aW9ucy53YXZlZm9ybTtcbiAgICAgICAgdGhpcy5maWx0ZXIudmFsdWUgPSB0aGlzLm9wdGlvbnMuZmlsdGVyO1xuICAgICAgICB0aGlzLnVwZGF0ZU91dHB1dHMoKTtcblxuICAgICAgICAvLyBiaW5kIFVJIGNvbnRyb2wgZXZlbnRzXG4gICAgICAgIHRoaXMucG93ZXJUb2dnbGUuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCB0aGlzLnRvZ2dsZVBvd2VyLmJpbmQodGhpcykpO1xuICAgICAgICB0aGlzLndhdmVmb3JtLmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIHRoaXMuc2V0V2F2ZWZvcm0uYmluZCh0aGlzKSk7XG4gICAgICAgIHRoaXMuZmlsdGVyLmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsIHRoaXMuZmlsdGVyQ2hhbmdlLmJpbmQodGhpcykpO1xuICAgICAgICB0aGlzLmRlbGF5VGltZUlucHV0LmFkZEV2ZW50TGlzdGVuZXIoJ2lucHV0JywgdGhpcy5kZWxheUNoYW5nZS5iaW5kKHRoaXMpKTtcbiAgICAgICAgdGhpcy5mZWVkYmFja0dhaW5JbnB1dC5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsIHRoaXMuZmVlZGJhY2tDaGFuZ2UuYmluZCh0aGlzKSk7XG5cbiAgICAgICAgLy8gY3JlYXRlIFdlYiBBdWRpbyBub2Rlc1xuICAgICAgICB0aGlzLm5vZGVzLm9zY1ZvbHVtZSA9IHRoaXMubXlBdWRpb0NvbnRleHQuY3JlYXRlR2FpbiA/IHRoaXMubXlBdWRpb0NvbnRleHQuY3JlYXRlR2FpbigpIDogdGhpcy5teUF1ZGlvQ29udGV4dC5jcmVhdGVHYWluTm9kZSgpO1xuICAgICAgICB0aGlzLm5vZGVzLmZpbHRlciA9IHRoaXMubXlBdWRpb0NvbnRleHQuY3JlYXRlQmlxdWFkRmlsdGVyKCk7XG4gICAgICAgIHRoaXMubm9kZXMudm9sdW1lID0gdGhpcy5teUF1ZGlvQ29udGV4dC5jcmVhdGVHYWluID8gdGhpcy5teUF1ZGlvQ29udGV4dC5jcmVhdGVHYWluKCkgOiB0aGlzLm15QXVkaW9Db250ZXh0LmNyZWF0ZUdhaW5Ob2RlKCk7XG4gICAgICAgIHRoaXMubm9kZXMuZGVsYXkgPSB0aGlzLm15QXVkaW9Db250ZXh0LmNyZWF0ZURlbGF5ID8gdGhpcy5teUF1ZGlvQ29udGV4dC5jcmVhdGVEZWxheSgpIDogdGhpcy5teUF1ZGlvQ29udGV4dC5jcmVhdGVEZWxheU5vZGUoKTtcbiAgICAgICAgdGhpcy5ub2Rlcy5mZWVkYmFja0dhaW4gPSB0aGlzLm15QXVkaW9Db250ZXh0LmNyZWF0ZUdhaW4gPyB0aGlzLm15QXVkaW9Db250ZXh0LmNyZWF0ZUdhaW4oKSA6IHRoaXMubXlBdWRpb0NvbnRleHQuY3JlYXRlR2Fpbk5vZGUoKTtcbiAgICAgICAgdGhpcy5ub2Rlcy5jb21wcmVzc29yID0gdGhpcy5teUF1ZGlvQ29udGV4dC5jcmVhdGVEeW5hbWljc0NvbXByZXNzb3IoKTtcblxuICAgICAgICAvLyBjcmVhdGUgZnJlcXVlbmN5IGFuYWx5c2VyIG5vZGVcbiAgICAgICAgdGhpcy5teUF1ZGlvQW5hbHlzZXIgPSB0aGlzLm15QXVkaW9Db250ZXh0LmNyZWF0ZUFuYWx5c2VyKCk7XG4gICAgICAgIHRoaXMubXlBdWRpb0FuYWx5c2VyLnNtb290aGluZ1RpbWVDb25zdGFudCA9IDAuODU7XG5cbiAgICAgICAgLy8gc3RhcnQgZkFGIGZvciBmcmVxdWVuY3kgYW5hbHlzZXJcbiAgICAgICAgdGhpcy5hbmltYXRlU3BlY3RydW0oKTtcblxuICAgICAgICAvLyBwcmV2ZW50IGRlZmF1bHQgc2Nyb2xsaW5nIHdoZW4gdG91Y2htb3ZlIGZpcmVzIG9uIHN1cmZhY2VcbiAgICAgICAgdGhpcy5zdXJmYWNlLmFkZEV2ZW50TGlzdGVuZXIoJ3RvdWNobW92ZScsIGUgPT4ge1xuICAgICAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBoYW5kbGVSZXNpemUoKSB7XG4gICAgICAgIC8vIHNldCBkZWZhdWx0IGNhbnZhcyBzaXplXG4gICAgICAgIHRoaXMuaXNTbWFsbFZpZXdwb3J0ID0gd2luZG93Lm1hdGNoTWVkaWEoJyhtYXgtd2lkdGg6IDUxMnB4KScpLm1hdGNoZXMgPyB0cnVlIDogZmFsc2U7XG4gICAgICAgIHRoaXMuc2V0Q2FudmFzU2l6ZSgpO1xuXG4gICAgICAgIC8vIGxpc3RlbiBmb3IgcmVzaXplIGV2ZW50c1xuICAgICAgICB3aW5kb3cubWF0Y2hNZWRpYSgnKG1heC13aWR0aDogNTEycHgpJykuYWRkTGlzdGVuZXIobXFsID0+IHtcbiAgICAgICAgICAgIGlmIChtcWwubWF0Y2hlcykge1xuICAgICAgICAgICAgICAgIHRoaXMuaXNTbWFsbFZpZXdwb3J0ID0gdHJ1ZTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5pc1NtYWxsVmlld3BvcnQgPSBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuc2V0Q2FudmFzU2l6ZSgpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICByb3V0ZVNvdW5kcygpIHtcbiAgICAgICAgdGhpcy5zb3VyY2UgPSB0aGlzLm15QXVkaW9Db250ZXh0LmNyZWF0ZU9zY2lsbGF0b3IoKTtcblxuICAgICAgICB0aGlzLnNldFdhdmVmb3JtKHRoaXMud2F2ZWZvcm0pO1xuICAgICAgICB0aGlzLmZpbHRlckNoYW5nZSh0aGlzLmZpbHRlcik7XG4gICAgICAgIHRoaXMubm9kZXMuZmVlZGJhY2tHYWluLmdhaW4udmFsdWUgPSB0aGlzLm9wdGlvbnMuZmVlZGJhY2s7XG4gICAgICAgIHRoaXMubm9kZXMuZGVsYXkuZGVsYXlUaW1lLnZhbHVlID0gdGhpcy5vcHRpb25zLmRlbGF5O1xuICAgICAgICB0aGlzLm5vZGVzLnZvbHVtZS5nYWluLnZhbHVlID0gMC4yO1xuICAgICAgICB0aGlzLm5vZGVzLm9zY1ZvbHVtZS5nYWluLnZhbHVlID0gMDtcblxuICAgICAgICB0aGlzLnNvdXJjZS5jb25uZWN0KHRoaXMubm9kZXMub3NjVm9sdW1lKTtcbiAgICAgICAgdGhpcy5ub2Rlcy5vc2NWb2x1bWUuY29ubmVjdCh0aGlzLm5vZGVzLmZpbHRlcik7XG4gICAgICAgIHRoaXMubm9kZXMuZmlsdGVyLmNvbm5lY3QodGhpcy5ub2Rlcy5jb21wcmVzc29yKTtcbiAgICAgICAgdGhpcy5ub2Rlcy5maWx0ZXIuY29ubmVjdCh0aGlzLm5vZGVzLmRlbGF5KTtcbiAgICAgICAgdGhpcy5ub2Rlcy5kZWxheS5jb25uZWN0KHRoaXMubm9kZXMuZmVlZGJhY2tHYWluKTtcbiAgICAgICAgdGhpcy5ub2Rlcy5kZWxheS5jb25uZWN0KHRoaXMubm9kZXMuY29tcHJlc3Nvcik7XG4gICAgICAgIHRoaXMubm9kZXMuZmVlZGJhY2tHYWluLmNvbm5lY3QodGhpcy5ub2Rlcy5kZWxheSk7XG4gICAgICAgIHRoaXMubm9kZXMuY29tcHJlc3Nvci5jb25uZWN0KHRoaXMubm9kZXMudm9sdW1lKTtcbiAgICAgICAgdGhpcy5ub2Rlcy52b2x1bWUuY29ubmVjdCh0aGlzLm15QXVkaW9BbmFseXNlcik7XG4gICAgICAgIHRoaXMubXlBdWRpb0FuYWx5c2VyLmNvbm5lY3QodGhpcy5teUF1ZGlvQ29udGV4dC5kZXN0aW5hdGlvbik7XG4gICAgfVxuXG4gICAgc3RhcnRPc2MoKSB7XG4gICAgICAgIGlmICghdGhpcy5zb3VyY2Uuc3RhcnQpIHtcbiAgICAgICAgICAgIHRoaXMuc291cmNlLnN0YXJ0ID0gdGhpcy5zb3VyY2Uubm90ZU9uO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuc291cmNlLnN0YXJ0KDApO1xuICAgICAgICB0aGlzLmlzUGxheWluZyA9IHRydWU7XG4gICAgfVxuXG4gICAgc3RvcE9zYygpIHtcbiAgICAgICAgaWYgKCF0aGlzLnNvdXJjZS5zdG9wKSB7XG4gICAgICAgICAgICB0aGlzLnNvdXJjZS5zdG9wID0gdGhpcy5zb3VyY2Uubm90ZU9mZjtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnNvdXJjZS5zdG9wKDApO1xuICAgICAgICB0aGlzLmlzUGxheWluZyA9IGZhbHNlO1xuICAgIH1cblxuICAgIGJpbmRTdXJmYWNlRXZlbnRzKCkge1xuICAgICAgICB0aGlzLnN1cmZhY2UuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vkb3duJywgdGhpcy5wbGF5SGFuZGxlcik7XG4gICAgICAgIHRoaXMuc3VyZmFjZS5hZGRFdmVudExpc3RlbmVyKCd0b3VjaHN0YXJ0JywgdGhpcy5wbGF5SGFuZGxlcik7XG4gICAgfVxuXG4gICAgdW5iaW5kU3VyZmFjZUV2ZW50cygpIHtcbiAgICAgICAgdGhpcy5zdXJmYWNlLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21vdXNlZG93bicsIHRoaXMucGxheUhhbmRsZXIpO1xuICAgICAgICB0aGlzLnN1cmZhY2UucmVtb3ZlRXZlbnRMaXN0ZW5lcigndG91Y2hzdGFydCcsIHRoaXMucGxheUhhbmRsZXIpO1xuICAgIH1cblxuICAgIHRvZ2dsZVBvd2VyKCkge1xuICAgICAgICBpZiAodGhpcy5pc1BsYXlpbmcpIHtcbiAgICAgICAgICAgIHRoaXMuc3RvcE9zYygpO1xuICAgICAgICAgICAgdGhpcy5teUF1ZGlvQW5hbHlzZXIuZGlzY29ubmVjdCgpO1xuICAgICAgICAgICAgdGhpcy51bmJpbmRTdXJmYWNlRXZlbnRzKCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLnJvdXRlU291bmRzKCk7XG4gICAgICAgICAgICB0aGlzLnN0YXJ0T3NjKCk7XG4gICAgICAgICAgICB0aGlzLmJpbmRTdXJmYWNlRXZlbnRzKCk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnN5bnRoLmNsYXNzTGlzdC50b2dnbGUoJ29mZicpO1xuICAgIH1cblxuICAgIHBsYXkoZSkge1xuICAgICAgICBsZXQgeCA9IGUudHlwZSA9PT0gJ3RvdWNoc3RhcnQnID8gZS50b3VjaGVzWzBdLnBhZ2VYIDogZS5wYWdlWDtcbiAgICAgICAgbGV0IHkgPSBlLnR5cGUgPT09ICd0b3VjaHN0YXJ0JyA/IGUudG91Y2hlc1swXS5wYWdlWSA6IGUucGFnZVk7XG4gICAgICAgIGNvbnN0IG11bHRpcGxpZXIgPSB0aGlzLmlzU21hbGxWaWV3cG9ydCA/IDIgOiAxO1xuXG4gICAgICAgIGlmIChlLnR5cGUgPT09ICd0b3VjaHN0YXJ0Jykge1xuICAgICAgICAgICAgdGhpcy5oYXNUb3VjaCA9IHRydWU7XG4gICAgICAgIH0gZWxzZSBpZiAoZS50eXBlID09PSAnbW91c2Vkb3duJyAmJiB0aGlzLmhhc1RvdWNoKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIXRoaXMuaXNQbGF5aW5nKSB7XG4gICAgICAgICAgICB0aGlzLnJvdXRlU291bmRzKCk7XG4gICAgICAgICAgICB0aGlzLnN0YXJ0T3NjKCk7XG4gICAgICAgIH1cblxuICAgICAgICB4ID0geCAtIHRoaXMuc3VyZmFjZS5vZmZzZXRMZWZ0O1xuICAgICAgICB5ID0geSAtIHRoaXMuc3VyZmFjZS5vZmZzZXRUb3A7XG5cbiAgICAgICAgdGhpcy5ub2Rlcy5vc2NWb2x1bWUuZ2Fpbi52YWx1ZSA9IDE7XG4gICAgICAgIHRoaXMuc291cmNlLmZyZXF1ZW5jeS52YWx1ZSA9IHggKiBtdWx0aXBsaWVyO1xuICAgICAgICB0aGlzLm5vZGVzLmZpbHRlci5mcmVxdWVuY3kudmFsdWUgPSB0aGlzLnNldEZpbHRlckZyZXF1ZW5jeSh5KTtcblxuICAgICAgICB0aGlzLmZpbmdlci5zdHlsZS53ZWJraXRUcmFuc2Zvcm0gPSB0aGlzLmZpbmdlci5zdHlsZS50cmFuc2Zvcm0gPSBgdHJhbnNsYXRlM2QoJHt4fXB4LCAke3l9cHgsIDApYDtcbiAgICAgICAgdGhpcy5maW5nZXIuY2xhc3NMaXN0LmFkZCgnYWN0aXZlJyk7XG5cbiAgICAgICAgdGhpcy5zdXJmYWNlLmFkZEV2ZW50TGlzdGVuZXIoJ3RvdWNobW92ZScsIHRoaXMubW92ZUhhbmRsZXIpO1xuICAgICAgICB0aGlzLnN1cmZhY2UuYWRkRXZlbnRMaXN0ZW5lcigndG91Y2hlbmQnLCB0aGlzLnN0b3BIYW5kbGVyKTtcbiAgICAgICAgdGhpcy5zdXJmYWNlLmFkZEV2ZW50TGlzdGVuZXIoJ3RvdWNoY2FuY2VsJywgdGhpcy5zdG9wSGFuZGxlcik7XG4gICAgICAgIHRoaXMuc3VyZmFjZS5hZGRFdmVudExpc3RlbmVyKCdtb3VzZW1vdmUnLCB0aGlzLm1vdmVIYW5kbGVyKTtcbiAgICAgICAgdGhpcy5zdXJmYWNlLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNldXAnLCB0aGlzLnN0b3BIYW5kbGVyKTtcbiAgICB9XG5cbiAgICBtb3ZlKGUpIHtcbiAgICAgICAgbGV0IHggPSBlLnR5cGUgPT09ICd0b3VjaG1vdmUnID8gZS50b3VjaGVzWzBdLnBhZ2VYIDogZS5wYWdlWDtcbiAgICAgICAgbGV0IHkgPSBlLnR5cGUgPT09ICd0b3VjaG1vdmUnID8gZS50b3VjaGVzWzBdLnBhZ2VZIDogZS5wYWdlWTtcblxuICAgICAgICBpZiAoZS50eXBlID09PSAnbW91c2Vtb3ZlJyAmJiB0aGlzLmhhc1RvdWNoKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5pc1BsYXlpbmcpIHtcbiAgICAgICAgICAgIGNvbnN0IG11bHRpcGxpZXIgPSB0aGlzLmlzU21hbGxWaWV3cG9ydCA/IDIgOiAxO1xuICAgICAgICAgICAgeCA9IHggLSB0aGlzLnN1cmZhY2Uub2Zmc2V0TGVmdDtcbiAgICAgICAgICAgIHkgPSB5IC0gdGhpcy5zdXJmYWNlLm9mZnNldFRvcDtcbiAgICAgICAgICAgIHRoaXMuc291cmNlLmZyZXF1ZW5jeS52YWx1ZSA9IHggKiBtdWx0aXBsaWVyO1xuICAgICAgICAgICAgdGhpcy5ub2Rlcy5maWx0ZXIuZnJlcXVlbmN5LnZhbHVlID0gdGhpcy5zZXRGaWx0ZXJGcmVxdWVuY3koeSk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmZpbmdlci5zdHlsZS53ZWJraXRUcmFuc2Zvcm0gPSB0aGlzLmZpbmdlci5zdHlsZS50cmFuc2Zvcm0gPSBgdHJhbnNsYXRlM2QoJHt4fXB4LCAke3l9cHgsIDApYDtcbiAgICB9XG5cbiAgICBzdG9wKGUpIHtcbiAgICAgICAgbGV0IHggPSBlLnR5cGUgPT09ICd0b3VjaGVuZCcgPyBlLmNoYW5nZWRUb3VjaGVzWzBdLnBhZ2VYIDogZS5wYWdlWDtcbiAgICAgICAgbGV0IHkgPSBlLnR5cGUgPT09ICd0b3VjaGVuZCcgPyBlLmNoYW5nZWRUb3VjaGVzWzBdLnBhZ2VZIDogZS5wYWdlWTtcblxuICAgICAgICBpZiAodGhpcy5pc1BsYXlpbmcpIHtcbiAgICAgICAgICAgIGNvbnN0IG11bHRpcGxpZXIgPSB0aGlzLmlzU21hbGxWaWV3cG9ydCA/IDIgOiAxO1xuICAgICAgICAgICAgeCA9IHggLSB0aGlzLnN1cmZhY2Uub2Zmc2V0TGVmdDtcbiAgICAgICAgICAgIHkgPSB5IC0gdGhpcy5zdXJmYWNlLm9mZnNldFRvcDtcbiAgICAgICAgICAgIHRoaXMuc291cmNlLmZyZXF1ZW5jeS52YWx1ZSA9IHggKiBtdWx0aXBsaWVyO1xuICAgICAgICAgICAgdGhpcy5ub2Rlcy5maWx0ZXIuZnJlcXVlbmN5LnZhbHVlID0gdGhpcy5zZXRGaWx0ZXJGcmVxdWVuY3koeSk7XG4gICAgICAgICAgICB0aGlzLm5vZGVzLm9zY1ZvbHVtZS5nYWluLnZhbHVlID0gMDtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuZmluZ2VyLmNsYXNzTGlzdC5yZW1vdmUoJ2FjdGl2ZScpO1xuXG4gICAgICAgIHRoaXMuc3VyZmFjZS5yZW1vdmVFdmVudExpc3RlbmVyKCdtb3VzZW1vdmUnLCB0aGlzLm1vdmVIYW5kbGVyKTtcbiAgICAgICAgdGhpcy5zdXJmYWNlLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21vdXNldXAnLCB0aGlzLnN0b3BIYW5kbGVyKTtcbiAgICAgICAgdGhpcy5zdXJmYWNlLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3RvdWNobW92ZScsIHRoaXMubW92ZUhhbmRsZXIpO1xuICAgICAgICB0aGlzLnN1cmZhY2UucmVtb3ZlRXZlbnRMaXN0ZW5lcigndG91Y2hlbmQnLCB0aGlzLnN0b3BIYW5kbGVyKTtcbiAgICAgICAgdGhpcy5zdXJmYWNlLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3RvdWNoY2FuY2VsJywgdGhpcy5zdG9wSGFuZGxlcik7XG4gICAgfVxuXG4gICAgdXBkYXRlT3V0cHV0cygpIHtcbiAgICAgICAgdGhpcy5kZWxheVRpbWVPdXRwdXQudmFsdWUgPSBNYXRoLnJvdW5kKHRoaXMuZGVsYXlUaW1lSW5wdXQudmFsdWUgKiAxMDAwKSArICcgbXMnO1xuICAgICAgICB0aGlzLmZlZWRiYWNrR2Fpbk91dHB1dC52YWx1ZSA9IE1hdGgucm91bmQodGhpcy5mZWVkYmFja0dhaW5JbnB1dC52YWx1ZSAqIDEwKTtcbiAgICB9XG5cbiAgICBzZXRXYXZlZm9ybShvcHRpb24pIHtcbiAgICAgICAgY29uc3QgdmFsdWUgPSBvcHRpb24udmFsdWUgfHwgb3B0aW9uLnRhcmdldC52YWx1ZTtcbiAgICAgICAgdGhpcy5zb3VyY2UudHlwZSA9IHRoaXMuaXNTYWZhcmkgPyB0aGlzLndhdmVzLmdldCh2YWx1ZSkgOiB2YWx1ZTtcbiAgICB9XG5cbiAgICBkZWxheUNoYW5nZShlKSB7XG4gICAgICAgIHRoaXMub3B0aW9ucy5kZWxheSA9IGUudGFyZ2V0LnZhbHVlO1xuICAgICAgICBpZiAodGhpcy5pc1BsYXlpbmcpIHtcbiAgICAgICAgICAgIHRoaXMuc3RvcE9zYygpO1xuICAgICAgICAgICAgdGhpcy5ub2Rlcy5kZWxheS5kZWxheVRpbWUudmFsdWUgPSB0aGlzLm9wdGlvbnMuZGVsYXk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy51cGRhdGVPdXRwdXRzKCk7XG4gICAgfVxuXG4gICAgZmVlZGJhY2tDaGFuZ2UoZSkge1xuICAgICAgICB0aGlzLm9wdGlvbnMuZmVlZGJhY2sgPSBlLnRhcmdldC52YWx1ZTtcbiAgICAgICAgaWYgKHRoaXMuaXNQbGF5aW5nKSB7XG4gICAgICAgICAgICB0aGlzLnN0b3BPc2MoKTtcbiAgICAgICAgICAgIHRoaXMubm9kZXMuZmVlZGJhY2tHYWluLmdhaW4udmFsdWUgPSB0aGlzLm9wdGlvbnMuZmVlZGJhY2s7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy51cGRhdGVPdXRwdXRzKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0IGZpbHRlciBmcmVxdWVuY3kgYmFzZWQgb24gKHkpIGF4aXMgdmFsdWVcbiAgICAgKi9cbiAgICBzZXRGaWx0ZXJGcmVxdWVuY3koeSkge1xuICAgICAgICAvLyBtaW4gNDBIelxuICAgICAgICBjb25zdCBtaW4gPSA0MDtcbiAgICAgICAgLy8gbWF4IGhhbGYgb2YgdGhlIHNhbXBsaW5nIHJhdGVcbiAgICAgICAgY29uc3QgbWF4ID0gdGhpcy5teUF1ZGlvQ29udGV4dC5zYW1wbGVSYXRlIC8gMjtcbiAgICAgICAgLy8gTG9nYXJpdGhtIChiYXNlIDIpIHRvIGNvbXB1dGUgaG93IG1hbnkgb2N0YXZlcyBmYWxsIGluIHRoZSByYW5nZS5cbiAgICAgICAgY29uc3QgbnVtYmVyT2ZPY3RhdmVzID0gTWF0aC5sb2cobWF4IC8gbWluKSAvIE1hdGguTE4yO1xuICAgICAgICAvLyBDb21wdXRlIGEgbXVsdGlwbGllciBmcm9tIDAgdG8gMSBiYXNlZCBvbiBhbiBleHBvbmVudGlhbCBzY2FsZS5cbiAgICAgICAgY29uc3QgbXVsdGlwbGllciA9IE1hdGgucG93KDIsIG51bWJlck9mT2N0YXZlcyAqICgoKDIgLyB0aGlzLnN1cmZhY2UuY2xpZW50SGVpZ2h0KSAqICh0aGlzLnN1cmZhY2UuY2xpZW50SGVpZ2h0IC0geSkpIC0gMS4wKSk7XG4gICAgICAgIC8vIEdldCBiYWNrIHRvIHRoZSBmcmVxdWVuY3kgdmFsdWUgYmV0d2VlbiBtaW4gYW5kIG1heC5cbiAgICAgICAgcmV0dXJuIG1heCAqIG11bHRpcGxpZXI7XG4gICAgfVxuXG4gICAgZmlsdGVyQ2hhbmdlKG9wdGlvbikge1xuICAgICAgICBjb25zdCB2YWx1ZSA9IG9wdGlvbi52YWx1ZSB8fCBvcHRpb24udGFyZ2V0LnZhbHVlO1xuICAgICAgICB0aGlzLm5vZGVzLmZpbHRlci50eXBlID0gdGhpcy5pc1NhZmFyaSA/IHRoaXMuZmlsdGVycy5nZXQodmFsdWUpIDogdmFsdWU7XG4gICAgfVxuXG4gICAgYW5pbWF0ZVNwZWN0cnVtKCkge1xuICAgICAgICAvLyBMaW1pdCBjYW52YXMgcmVkcmF3IHRvIDQwIGZwc1xuICAgICAgICBzZXRUaW1lb3V0KHRoaXMub25UaWNrLmJpbmQodGhpcyksIDEwMDAgLyA0MCk7XG4gICAgfVxuXG4gICAgb25UaWNrKCkge1xuICAgICAgICB0aGlzLmRyYXdTcGVjdHJ1bSgpO1xuICAgICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUodGhpcy5hbmltYXRlU3BlY3RydW0uYmluZCh0aGlzKSwgdGhpcy5jYW52YXMpO1xuICAgIH1cblxuICAgIHNldENhbnZhc1NpemUoKSB7XG4gICAgICAgIGNvbnN0IGNhbnZhc1NpemUgPSB0aGlzLmlzU21hbGxWaWV3cG9ydCA/IDI1NiA6IDUxMjtcbiAgICAgICAgdGhpcy5jYW52YXMud2lkdGggPSB0aGlzLmNhbnZhcy5oZWlnaHQgPSBjYW52YXNTaXplIC0gMTA7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRHJhdyB0aGUgY2FudmFzIGZyZXF1ZW5jeSBkYXRhIGdyYXBoXG4gICAgICovXG4gICAgZHJhd1NwZWN0cnVtKCkge1xuICAgICAgICBjb25zdCBjYW52YXNTaXplID0gdGhpcy5pc1NtYWxsVmlld3BvcnQgPyAyNTYgOiA1MTI7XG4gICAgICAgIGNvbnN0IGJhcldpZHRoID0gdGhpcy5pc1NtYWxsVmlld3BvcnQgPyAxMCA6IDIwO1xuICAgICAgICBjb25zdCBiYXJDb3VudCA9IE1hdGgucm91bmQoY2FudmFzU2l6ZSAvIGJhcldpZHRoKTtcbiAgICAgICAgY29uc3QgZnJlcUJ5dGVEYXRhID0gbmV3IFVpbnQ4QXJyYXkodGhpcy5teUF1ZGlvQW5hbHlzZXIuZnJlcXVlbmN5QmluQ291bnQpO1xuXG4gICAgICAgIHRoaXMuY3R4LmNsZWFyUmVjdCgwLCAwLCBjYW52YXNTaXplLCBjYW52YXNTaXplKTtcbiAgICAgICAgdGhpcy5jdHguZmlsbFN0eWxlID0gJyMxZDFjMjUnO1xuXG4gICAgICAgIHRoaXMubXlBdWRpb0FuYWx5c2VyLmdldEJ5dGVGcmVxdWVuY3lEYXRhKGZyZXFCeXRlRGF0YSk7XG5cbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBiYXJDb3VudDsgaSArPSAxKSB7XG4gICAgICAgICAgICBjb25zdCBtYWduaXR1ZGUgPSBmcmVxQnl0ZURhdGFbaV07XG4gICAgICAgICAgICBjb25zdCBtdWx0aXBsaWVyID0gdGhpcy5pc1NtYWxsVmlld3BvcnQgPyAxIDogMjtcbiAgICAgICAgICAgIC8vIHNvbWUgdmFsdWVzIG5lZWQgYWRqdXN0aW5nIHRvIGZpdCBvbiB0aGUgY2FudmFzXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsUmVjdChiYXJXaWR0aCAqIGksIGNhbnZhc1NpemUsIGJhcldpZHRoIC0gMSwgLW1hZ25pdHVkZSAqIG11bHRpcGxpZXIpO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBXYXZlcGFkO1xuIl19
