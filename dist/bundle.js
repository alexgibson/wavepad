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

                this.ctx.clearRect(0, 0, canvasSize, canvasSize);

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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvVXNlcnMvYWxleGdpYnNvbi9HaXQvd2F2ZXBhZC9zcmMvYXBwLmpzIiwiL1VzZXJzL2FsZXhnaWJzb24vR2l0L3dhdmVwYWQvc3JjL3JBRi5qcyIsIi9Vc2Vycy9hbGV4Z2lic29uL0dpdC93YXZlcGFkL3NyYy93YXZlcGFkLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7OztJQ0FPLEdBQUcsMkJBQU0sT0FBTzs7SUFDaEIsT0FBTywyQkFBTSxXQUFXOztBQUUvQixNQUFNLENBQUMsZ0JBQWdCLENBQUMsa0JBQWtCLEVBQUUsWUFBTTtBQUU5QyxRQUFJLEdBQUcsR0FBRyxJQUFJLE9BQU8sQ0FBQyxVQUFVLENBQUMsQ0FBQzs7QUFFbEMsT0FBRyxDQUFDLElBQUksRUFBRSxDQUFDO0NBQ2QsQ0FBQyxDQUFDOzs7Ozs7Ozs7OztBQ0ZILElBQUksR0FBRyxHQUFHLENBQUMsWUFBWTtBQUNuQixRQUFJLFFBQVEsR0FBRyxDQUFDLENBQUM7QUFDakIsUUFBSSxPQUFPLEdBQUcsQ0FBQyxJQUFJLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxHQUFHLENBQUMsQ0FBQztBQUMzQyxTQUFJLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsT0FBTyxDQUFDLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxxQkFBcUIsRUFBRSxFQUFFLENBQUMsRUFBRTtBQUNyRSxjQUFNLENBQUMscUJBQXFCLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsR0FBQyx1QkFBdUIsQ0FBQyxDQUFDO0FBQzFFLGNBQU0sQ0FBQyxvQkFBb0IsR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxHQUFDLHNCQUFzQixDQUFDLElBQUksTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsR0FBQyw2QkFBNkIsQ0FBQyxD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VUFBVSxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsaUJBQWlCLENBQUMsQ0FBQzs7QUFFNUUsb0JBQUksQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsVUFBVSxFQUFFLFVBQVUsQ0FBQyxDQUFDOztBQUVqRCxvQkFBSSxDQUFDLGVBQWUsQ0FBQyxvQkFBb0IsQ0FBQyxZQUFZLENBQUMsQ0FBQzs7QUFFeEQscUJBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxRQUFRLEVBQUUsQ0FBQyxJQUFJLENBQUMsRUFBRTtBQUNsQyx3QkFBTSxTQUFTLEdBQUcsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ2xDLHdCQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsZUFBZSxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7O0FBRWhELHdCQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxRQUFRLEdBQUcsQ0FBQyxFQUFFLFVBQVUsRUFBRSxRQUFRLEdBQUcsQ0FBQyxFQUFFLENBQUMsU0FBUyxHQUFHLFVBQVUsQ0FBQyxDQUFDO2lCQUN0RjthQUNKOzs7Ozs7V0E5V0MsT0FBTzs7O2lCQWlYRSxPQUFPIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsImltcG9ydCByQUYgZnJvbSAnLi9yQUYnO1xuaW1wb3J0IFdhdmVwYWQgZnJvbSAnLi93YXZlcGFkJztcblxud2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUNvbnRlbnRMb2FkZWQnLCAoKSA9PiB7XG5cbiAgICB2YXIgYXBwID0gbmV3IFdhdmVwYWQoJ3dhdmUtcGQxJyk7XG5cbiAgICBhcHAuaW5pdCgpO1xufSk7XG4iLCIvLyBodHRwOi8vcGF1bGlyaXNoLmNvbS8yMDExL3JlcXVlc3RhbmltYXRpb25mcmFtZS1mb3Itc21hcnQtYW5pbWF0aW5nL1xuLy8gaHR0cDovL215Lm9wZXJhLmNvbS9lbW9sbGVyL2Jsb2cvMjAxMS8xMi8yMC9yZXF1ZXN0YW5pbWF0aW9uZnJhbWUtZm9yLXNtYXJ0LWVyLWFuaW1hdGluZ1xuXG4vLyByZXF1ZXN0QW5pbWF0aW9uRnJhbWUgcG9seWZpbGwgYnkgRXJpayBNw7ZsbGVyXG4vLyBmaXhlcyBmcm9tIFBhdWwgSXJpc2ggYW5kIFRpbm8gWmlqZGVsXG5cbnZhciByQUYgPSAoZnVuY3Rpb24gKCkge1xuICAgIHZhciBsYXN0VGltZSA9IDA7XG4gICAgdmFyIHZlbmRvcnMgPSBbJ21zJywgJ21veicsICd3ZWJraXQnLCAnbyddO1xuICAgIGZvcih2YXIgeCA9IDA7IHggPCB2ZW5kb3JzLmxlbmd0aCAmJiAhd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZTsgKyt4KSB7XG4gICAgICAgIHdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUgPSB3aW5kb3dbdmVuZG9yc1t4XSsnUmVxdWVzdEFuaW1hdGlvbkZyYW1lJ107XG4gICAgICAgIHdpbmRvdy5jYW5jZWxBbmltYXRpb25GcmFtZSA9IHdpbmRvd1t2ZW5kb3JzW3hdKydDYW5jZWxBbmltYXRpb25GcmFtZSddIHx8IHdpbmRvd1t2ZW5kb3JzW3hdKydDYW5jZWxSZXF1ZXN0QW5pbWF0aW9uRnJhbWUnXTtcbiAgICB9XG5cbiAgICBpZiAoIXdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUpIHtcbiAgICAgICAgd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSA9IGZ1bmN0aW9uKGNhbGxiYWNrLCBlbGVtZW50KSB7XG4gICAgICAgICAgICB2YXIgY3VyclRpbWUgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcbiAgICAgICAgICAgIHZhciB0aW1lVG9DYWxsID0gTWF0aC5tYXgoMCwgMTYgLSAoY3VyclRpbWUgLSBsYXN0VGltZSkpO1xuICAgICAgICAgICAgdmFyIGlkID0gd2luZG93LnNldFRpbWVvdXQoZnVuY3Rpb24oKSB7IGNhbGxiYWNrKGN1cnJUaW1lICsgdGltZVRvQ2FsbCk7IH0sXG4gICAgICAgICAgICAgIHRpbWVUb0NhbGwpO1xuICAgICAgICAgICAgbGFzdFRpbWUgPSBjdXJyVGltZSArIHRpbWVUb0NhbGw7XG4gICAgICAgICAgICByZXR1cm4gaWQ7XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgaWYgKCF3aW5kb3cuY2FuY2VsQW5pbWF0aW9uRnJhbWUpIHtcbiAgICAgICAgd2luZG93LmNhbmNlbEFuaW1hdGlvbkZyYW1lID0gZnVuY3Rpb24oaWQpIHtcbiAgICAgICAgICAgIGNsZWFyVGltZW91dChpZCk7XG4gICAgICAgIH07XG4gICAgfVxufSkoKTtcblxuZXhwb3J0IGRlZmF1bHQgckFGO1xuIiwiY2xhc3MgV2F2ZXBhZCB7XG5cbiAgICBjb25zdHJ1Y3RvcihpZCwgb3B0aW9ucykge1xuXG4gICAgICAgIC8vIGRlZmF1bHQgb3B0aW9uc1xuICAgICAgICB0aGlzLm9wdGlvbnMgPSB7XG4gICAgICAgICAgICB3YXZlZm9ybTogJ3NxdWFyZScsXG4gICAgICAgICAgICBmaWx0ZXI6ICdsb3dwYXNzJyxcbiAgICAgICAgICAgIGRlbGF5OiAwLjUwMCxcbiAgICAgICAgICAgIGZlZWRiYWNrOiAwLjQsXG4gICAgICAgICAgICBiYXJDb2xvcjogJyMxZDFjMjUnXG4gICAgICAgIH07XG5cbiAgICAgICAgLy8gc2V0IGNvbmZpZ3VyYWJsZSBvcHRpb25zXG4gICAgICAgIGlmICh0eXBlb2Ygb3B0aW9ucyA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIGZvciAobGV0IGkgaW4gb3B0aW9ucykge1xuICAgICAgICAgICAgICAgIGlmIChvcHRpb25zLmhhc093blByb3BlcnR5KGkpKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMub3B0aW9uc1tpXSA9IG9wdGlvbnNbaV07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gV2ViIEF1ZGlvIE5vZGUgcmVmZXJlbmNlc1xuICAgICAgICB0aGlzLnNvdXJjZSA9IG51bGw7XG4gICAgICAgIHRoaXMubm9kZXMgPSB7fTtcbiAgICAgICAgdGhpcy5teUF1ZGlvQ29udGV4dCA9IG51bGw7XG4gICAgICAgIHRoaXMubXlBdWRpb0FuYWx5c2VyID0gbnVsbDtcblxuICAgICAgICAvLyBub3JtYWxpemUgYW5kIGNyZWF0ZSBhIG5ldyBBdWRpb0NvbnRleHQgaWYgc3VwcG9ydGVkXG4gICAgICAgIHdpbmRvdy5BdWRpb0NvbnRleHQgPSB3aW5kb3cuQXVkaW9Db250ZXh0IHx8IHdpbmRvdy53ZWJraXRBdWRpb0NvbnRleHQ7XG5cbiAgICAgICAgaWYgKCdBdWRpb0NvbnRleHQnIGluIHdpbmRvdykge1xuICAgICAgICAgICAgdGhpcy5teUF1ZGlvQ29udGV4dCA9IG5ldyBBdWRpb0NvbnRleHQoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignd2F2ZXBhZC5qczogYnJvd3NlciBkb2VzIG5vdCBzdXBwb3J0IFdlYiBBdWRpbyBBUEknKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0eXBlb2YgaWQgIT09ICdzdHJpbmcnICYmIHR5cGVvZiBpZCAhPT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignd2F2ZXBhZC5qczogZmlyc3QgYXJndW1lbnQgbXVzdCBiZSBhIHZhbGlkIERPTSBpZGVudGlmaWVyJyk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBVSSBET00gcmVmZXJlbmNlc1xuICAgICAgICB0aGlzLnN5bnRoID0gdHlwZW9mIGlkID09PSAnb2JqZWN0JyA/IGlkIDogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoaWQpO1xuICAgICAgICB0aGlzLnN1cmZhY2UgPSB0aGlzLnN5bnRoLnF1ZXJ5U2VsZWN0b3IoJy5zdXJmYWNlJyk7XG4gICAgICAgIHRoaXMuZmluZ2VyID0gdGhpcy5zeW50aC5xdWVyeVNlbGVjdG9yKCcuZmluZ2VyJyk7XG4gICAgICAgIHRoaXMud2F2ZWZvcm0gPSB0aGlzLnN5bnRoLnF1ZXJ5U2VsZWN0b3IoJyN3YXZlZm9ybScpO1xuICAgICAgICB0aGlzLmZpbHRlciA9IHRoaXMuc3ludGgucXVlcnlTZWxlY3RvcignI2ZpbHRlci10eXBlJyk7XG4gICAgICAgIHRoaXMucG93ZXJUb2dnbGUgPSB0aGlzLnN5bnRoLnF1ZXJ5U2VsZWN0b3IoJyNwb3dlcicpO1xuICAgICAgICB0aGlzLmRlbGF5VGltZUlucHV0ID0gdGhpcy5zeW50aC5xdWVyeVNlbGVjdG9yKCcjZGVsYXknKTtcbiAgICAgICAgdGhpcy5mZWVkYmFja0dhaW5JbnB1dCA9IHRoaXMuc3ludGgucXVlcnlTZWxlY3RvcignI2ZlZWRiYWNrJyk7XG4gICAgICAgIHRoaXMuZGVsYXlUaW1lT3V0cHV0ID0gdGhpcy5zeW50aC5xdWVyeVNlbGVjdG9yKCcjZGVsYXktb3V0cHV0Jyk7XG4gICAgICAgIHRoaXMuZmVlZGJhY2tHYWluT3V0cHV0ID0gdGhpcy5zeW50aC5xdWVyeVNlbGVjdG9yKCcjZmVlZGJhY2stb3V0cHV0Jyk7XG5cbiAgICAgICAgLy8gQ2FudmFzIGdyYXBoIGZvciBhdWRpbyBmcmVxdWVuY3kgYW5hbHl6ZXJcbiAgICAgICAgdGhpcy5jYW52YXMgPSB0aGlzLnN5bnRoLnF1ZXJ5U2VsZWN0b3IoJ2NhbnZhcycpO1xuICAgICAgICB0aGlzLmN0eCA9IHRoaXMuY2FudmFzLmdldENvbnRleHQoJzJkJyk7XG5cbiAgICAgICAgLy8gTWFwIGZvciBsZWdhY3kgV2ViIEF1ZGlvIGZpbHRlciB2YWx1ZXNcbiAgICAgICAgdGhpcy5maWx0ZXJzID0gbmV3IE1hcCgpO1xuICAgICAgICB0aGlzLmZpbHRlcnMuc2V0KCdsb3dwYXNzJywgMCk7XG4gICAgICAgIHRoaXMuZmlsdGVycy5zZXQoJ2hpZ2hwYXNzJywgMSk7XG4gICAgICAgIHRoaXMuZmlsdGVycy5zZXQoJ2JhbmRwYXNzJywgMik7XG4gICAgICAgIHRoaXMuZmlsdGVycy5zZXQoJ2xvd3NoZWxmJywgMyk7XG4gICAgICAgIHRoaXMuZmlsdGVycy5zZXQoJ2hpZ2hzaGVsZicsIDQpO1xuICAgICAgICB0aGlzLmZpbHRlcnMuc2V0KCdwZWFraW5nJywgNSk7XG4gICAgICAgIHRoaXMuZmlsdGVycy5zZXQoJ25vdGNoJywgNik7XG4gICAgICAgIHRoaXMuZmlsdGVycy5zZXQoJ2FsbHBhc3MnLCA3KTtcblxuICAgICAgICAvLyBNYXAgZm9yIGxlZ2FjeSBXZWIgQXVkaW8gd2F2ZWZvcm0gdmFsdWVzXG4gICAgICAgIHRoaXMud2F2ZXMgPSBuZXcgTWFwKCk7XG4gICAgICAgIHRoaXMud2F2ZXMuc2V0KCdzaW5lJywgMCk7XG4gICAgICAgIHRoaXMud2F2ZXMuc2V0KCdzcXVhcmUnLCAxKTtcbiAgICAgICAgdGhpcy53YXZlcy5zZXQoJ3Nhd3Rvb3RoJywgMik7XG4gICAgICAgIHRoaXMud2F2ZXMuc2V0KCd0cmlhbmdsZScsIDMpO1xuXG4gICAgICAgIHRoaXMuaGFzVG91Y2ggPSBmYWxzZTtcbiAgICAgICAgdGhpcy5pc1NtYWxsVmlld3BvcnQgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5pc1BsYXlpbmcgPSBmYWxzZTtcblxuICAgICAgICAvLyBTYWZhcmkgbmVlZHMgc29tZSBzcGVjaWFsIGF0dGVudGlvbiBmb3IgaXRzIG5vbi1zdGFuZGFyZHNcbiAgICAgICAgdGhpcy5pc1NhZmFyaSA9IG5hdmlnYXRvci51c2VyQWdlbnQuaW5kZXhPZignU2FmYXJpJykgIT09IC0xICYmIG5hdmlnYXRvci51c2VyQWdlbnQuaW5kZXhPZignQ2hyb21lJykgPT0gLTE7XG4gICAgfVxuXG4gICAgaW5pdCgpIHtcblxuICAgICAgICAvLyBiaW5kIHJlc2l6ZSBoYW5kbGVyIGZvciBjYW52YXMgJiB0b3VjaCByZWZlcmVuY2VzXG4gICAgICAgIHRoaXMuaGFuZGxlUmVzaXplKCk7XG5cbiAgICAgICAgLy8gc3RvcmUgcmVmZXJlbmNlcyB0byBib3VuZCBldmVudHNcbiAgICAgICAgLy8gc28gd2UgY2FuIHVuYmluZCB3aGVuIG5lZWRlZFxuICAgICAgICB0aGlzLnBsYXlIYW5kbGVyID0gdGhpcy5wbGF5LmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMubW92ZUhhbmRsZXIgPSB0aGlzLm1vdmUuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5zdG9wSGFuZGxlciA9IHRoaXMuc3RvcC5iaW5kKHRoaXMpO1xuXG4gICAgICAgIC8vIHNldCBkZWZhdWx0IHZhbHVlcyB0aGF0IHdlJ3JlIHN1cHBsaWVkXG4gICAgICAgIHRoaXMuZGVsYXlUaW1lSW5wdXQudmFsdWUgPSB0aGlzLm9wdGlvbnMuZGVsYXk7XG4gICAgICAgIHRoaXMuZmVlZGJhY2tHYWluSW5wdXQudmFsdWUgPSB0aGlzLm9wdGlvbnMuZmVlZGJhY2s7XG4gICAgICAgIHRoaXMud2F2ZWZvcm0udmFsdWUgPSB0aGlzLm9wdGlvbnMud2F2ZWZvcm07XG4gICAgICAgIHRoaXMuZmlsdGVyLnZhbHVlID0gdGhpcy5vcHRpb25zLmZpbHRlcjtcbiAgICAgICAgdGhpcy51cGRhdGVPdXRwdXRzKCk7XG5cbiAgICAgICAgLy8gYmluZCBVSSBjb250cm9sIGV2ZW50c1xuICAgICAgICB0aGlzLnBvd2VyVG9nZ2xlLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgdGhpcy50b2dnbGVQb3dlci5iaW5kKHRoaXMpKTtcbiAgICAgICAgdGhpcy53YXZlZm9ybS5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCB0aGlzLnNldFdhdmVmb3JtLmJpbmQodGhpcykpO1xuICAgICAgICB0aGlzLmZpbHRlci5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCB0aGlzLmZpbHRlckNoYW5nZS5iaW5kKHRoaXMpKTtcbiAgICAgICAgdGhpcy5kZWxheVRpbWVJbnB1dC5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsIHRoaXMuZGVsYXlDaGFuZ2UuYmluZCh0aGlzKSk7XG4gICAgICAgIHRoaXMuZmVlZGJhY2tHYWluSW5wdXQuYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCB0aGlzLmZlZWRiYWNrQ2hhbmdlLmJpbmQodGhpcykpO1xuXG4gICAgICAgIC8vIGNyZWF0ZSBXZWIgQXVkaW8gbm9kZXNcbiAgICAgICAgdGhpcy5ub2Rlcy5vc2NWb2x1bWUgPSB0aGlzLm15QXVkaW9Db250ZXh0LmNyZWF0ZUdhaW4gPyB0aGlzLm15QXVkaW9Db250ZXh0LmNyZWF0ZUdhaW4oKSA6IHRoaXMubXlBdWRpb0NvbnRleHQuY3JlYXRlR2Fpbk5vZGUoKTtcbiAgICAgICAgdGhpcy5ub2Rlcy5maWx0ZXIgPSB0aGlzLm15QXVkaW9Db250ZXh0LmNyZWF0ZUJpcXVhZEZpbHRlcigpO1xuICAgICAgICB0aGlzLm5vZGVzLnZvbHVtZSA9IHRoaXMubXlBdWRpb0NvbnRleHQuY3JlYXRlR2FpbiA/IHRoaXMubXlBdWRpb0NvbnRleHQuY3JlYXRlR2FpbigpIDogdGhpcy5teUF1ZGlvQ29udGV4dC5jcmVhdGVHYWluTm9kZSgpO1xuICAgICAgICB0aGlzLm5vZGVzLmRlbGF5ID0gdGhpcy5teUF1ZGlvQ29udGV4dC5jcmVhdGVEZWxheSA/IHRoaXMubXlBdWRpb0NvbnRleHQuY3JlYXRlRGVsYXkoKSA6IHRoaXMubXlBdWRpb0NvbnRleHQuY3JlYXRlRGVsYXlOb2RlKCk7XG4gICAgICAgIHRoaXMubm9kZXMuZmVlZGJhY2tHYWluID0gdGhpcy5teUF1ZGlvQ29udGV4dC5jcmVhdGVHYWluID8gdGhpcy5teUF1ZGlvQ29udGV4dC5jcmVhdGVHYWluKCkgOiB0aGlzLm15QXVkaW9Db250ZXh0LmNyZWF0ZUdhaW5Ob2RlKCk7XG4gICAgICAgIHRoaXMubm9kZXMuY29tcHJlc3NvciA9IHRoaXMubXlBdWRpb0NvbnRleHQuY3JlYXRlRHluYW1pY3NDb21wcmVzc29yKCk7XG5cbiAgICAgICAgLy8gY3JlYXRlIGZyZXF1ZW5jeSBhbmFseXNlciBub2RlXG4gICAgICAgIHRoaXMubXlBdWRpb0FuYWx5c2VyID0gdGhpcy5teUF1ZGlvQ29udGV4dC5jcmVhdGVBbmFseXNlcigpO1xuICAgICAgICB0aGlzLm15QXVkaW9BbmFseXNlci5zbW9vdGhpbmdUaW1lQ29uc3RhbnQgPSAwLjg1O1xuXG4gICAgICAgIC8vIHN0YXJ0IGZBRiBmb3IgZnJlcXVlbmN5IGFuYWx5c2VyXG4gICAgICAgIHRoaXMuYW5pbWF0ZVNwZWN0cnVtKCk7XG5cbiAgICAgICAgLy8gcHJldmVudCBkZWZhdWx0IHNjcm9sbGluZyB3aGVuIHRvdWNobW92ZSBmaXJlcyBvbiBzdXJmYWNlXG4gICAgICAgIHRoaXMuc3VyZmFjZS5hZGRFdmVudExpc3RlbmVyKCd0b3VjaG1vdmUnLCBlID0+IHtcbiAgICAgICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgaGFuZGxlUmVzaXplKCkge1xuICAgICAgICAvLyBzZXQgZGVmYXVsdCBjYW52YXMgc2l6ZVxuICAgICAgICB0aGlzLmlzU21hbGxWaWV3cG9ydCA9IHdpbmRvdy5tYXRjaE1lZGlhKCcobWF4LXdpZHRoOiA1MTJweCknKS5tYXRjaGVzID8gdHJ1ZSA6IGZhbHNlO1xuICAgICAgICB0aGlzLnNldENhbnZhc1NpemUoKTtcblxuICAgICAgICAvLyBsaXN0ZW4gZm9yIHJlc2l6ZSBldmVudHNcbiAgICAgICAgd2luZG93Lm1hdGNoTWVkaWEoJyhtYXgtd2lkdGg6IDUxMnB4KScpLmFkZExpc3RlbmVyKG1xbCA9PiB7XG4gICAgICAgICAgICBpZiAobXFsLm1hdGNoZXMpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmlzU21hbGxWaWV3cG9ydCA9IHRydWU7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMuaXNTbWFsbFZpZXdwb3J0ID0gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLnNldENhbnZhc1NpemUoKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcm91dGVTb3VuZHMoKSB7XG4gICAgICAgIHRoaXMuc291cmNlID0gdGhpcy5teUF1ZGlvQ29udGV4dC5jcmVhdGVPc2NpbGxhdG9yKCk7XG5cbiAgICAgICAgdGhpcy5zZXRXYXZlZm9ybSh0aGlzLndhdmVmb3JtKTtcbiAgICAgICAgdGhpcy5maWx0ZXJDaGFuZ2UodGhpcy5maWx0ZXIpO1xuICAgICAgICB0aGlzLm5vZGVzLmZlZWRiYWNrR2Fpbi5nYWluLnZhbHVlID0gdGhpcy5vcHRpb25zLmZlZWRiYWNrO1xuICAgICAgICB0aGlzLm5vZGVzLmRlbGF5LmRlbGF5VGltZS52YWx1ZSA9IHRoaXMub3B0aW9ucy5kZWxheTtcbiAgICAgICAgdGhpcy5ub2Rlcy52b2x1bWUuZ2Fpbi52YWx1ZSA9IDAuMjtcbiAgICAgICAgdGhpcy5ub2Rlcy5vc2NWb2x1bWUuZ2Fpbi52YWx1ZSA9IDA7XG5cbiAgICAgICAgdGhpcy5zb3VyY2UuY29ubmVjdCh0aGlzLm5vZGVzLm9zY1ZvbHVtZSk7XG4gICAgICAgIHRoaXMubm9kZXMub3NjVm9sdW1lLmNvbm5lY3QodGhpcy5ub2Rlcy5maWx0ZXIpO1xuICAgICAgICB0aGlzLm5vZGVzLmZpbHRlci5jb25uZWN0KHRoaXMubm9kZXMuY29tcHJlc3Nvcik7XG4gICAgICAgIHRoaXMubm9kZXMuZmlsdGVyLmNvbm5lY3QodGhpcy5ub2Rlcy5kZWxheSk7XG4gICAgICAgIHRoaXMubm9kZXMuZGVsYXkuY29ubmVjdCh0aGlzLm5vZGVzLmZlZWRiYWNrR2Fpbik7XG4gICAgICAgIHRoaXMubm9kZXMuZGVsYXkuY29ubmVjdCh0aGlzLm5vZGVzLmNvbXByZXNzb3IpO1xuICAgICAgICB0aGlzLm5vZGVzLmZlZWRiYWNrR2Fpbi5jb25uZWN0KHRoaXMubm9kZXMuZGVsYXkpO1xuICAgICAgICB0aGlzLm5vZGVzLmNvbXByZXNzb3IuY29ubmVjdCh0aGlzLm5vZGVzLnZvbHVtZSk7XG4gICAgICAgIHRoaXMubm9kZXMudm9sdW1lLmNvbm5lY3QodGhpcy5teUF1ZGlvQW5hbHlzZXIpO1xuICAgICAgICB0aGlzLm15QXVkaW9BbmFseXNlci5jb25uZWN0KHRoaXMubXlBdWRpb0NvbnRleHQuZGVzdGluYXRpb24pO1xuICAgIH1cblxuICAgIHN0YXJ0T3NjKCkge1xuICAgICAgICBpZiAoIXRoaXMuc291cmNlLnN0YXJ0KSB7XG4gICAgICAgICAgICB0aGlzLnNvdXJjZS5zdGFydCA9IHRoaXMuc291cmNlLm5vdGVPbjtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnNvdXJjZS5zdGFydCgwKTtcbiAgICAgICAgdGhpcy5pc1BsYXlpbmcgPSB0cnVlO1xuICAgIH1cblxuICAgIHN0b3BPc2MoKSB7XG4gICAgICAgIGlmICghdGhpcy5zb3VyY2Uuc3RvcCkge1xuICAgICAgICAgICAgdGhpcy5zb3VyY2Uuc3RvcCA9IHRoaXMuc291cmNlLm5vdGVPZmY7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5zb3VyY2Uuc3RvcCgwKTtcbiAgICAgICAgdGhpcy5pc1BsYXlpbmcgPSBmYWxzZTtcbiAgICB9XG5cbiAgICBiaW5kU3VyZmFjZUV2ZW50cygpIHtcbiAgICAgICAgdGhpcy5zdXJmYWNlLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZG93bicsIHRoaXMucGxheUhhbmRsZXIpO1xuICAgICAgICB0aGlzLnN1cmZhY2UuYWRkRXZlbnRMaXN0ZW5lcigndG91Y2hzdGFydCcsIHRoaXMucGxheUhhbmRsZXIpO1xuICAgIH1cblxuICAgIHVuYmluZFN1cmZhY2VFdmVudHMoKSB7XG4gICAgICAgIHRoaXMuc3VyZmFjZS5yZW1vdmVFdmVudExpc3RlbmVyKCdtb3VzZWRvd24nLCB0aGlzLnBsYXlIYW5kbGVyKTtcbiAgICAgICAgdGhpcy5zdXJmYWNlLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3RvdWNoc3RhcnQnLCB0aGlzLnBsYXlIYW5kbGVyKTtcbiAgICB9XG5cbiAgICB0b2dnbGVQb3dlcigpIHtcbiAgICAgICAgaWYgKHRoaXMuaXNQbGF5aW5nKSB7XG4gICAgICAgICAgICB0aGlzLnN0b3BPc2MoKTtcbiAgICAgICAgICAgIHRoaXMubXlBdWRpb0FuYWx5c2VyLmRpc2Nvbm5lY3QoKTtcbiAgICAgICAgICAgIHRoaXMudW5iaW5kU3VyZmFjZUV2ZW50cygpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5yb3V0ZVNvdW5kcygpO1xuICAgICAgICAgICAgdGhpcy5zdGFydE9zYygpO1xuICAgICAgICAgICAgdGhpcy5iaW5kU3VyZmFjZUV2ZW50cygpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5zeW50aC5jbGFzc0xpc3QudG9nZ2xlKCdvZmYnKTtcbiAgICB9XG5cbiAgICBwbGF5KGUpIHtcbiAgICAgICAgbGV0IHggPSBlLnR5cGUgPT09ICd0b3VjaHN0YXJ0JyA/IGUudG91Y2hlc1swXS5wYWdlWCA6IGUucGFnZVg7XG4gICAgICAgIGxldCB5ID0gZS50eXBlID09PSAndG91Y2hzdGFydCcgPyBlLnRvdWNoZXNbMF0ucGFnZVkgOiBlLnBhZ2VZO1xuICAgICAgICBjb25zdCBtdWx0aXBsaWVyID0gdGhpcy5pc1NtYWxsVmlld3BvcnQgPyAyIDogMTtcblxuICAgICAgICBpZiAoZS50eXBlID09PSAndG91Y2hzdGFydCcpIHtcbiAgICAgICAgICAgIHRoaXMuaGFzVG91Y2ggPSB0cnVlO1xuICAgICAgICB9IGVsc2UgaWYgKGUudHlwZSA9PT0gJ21vdXNlZG93bicgJiYgdGhpcy5oYXNUb3VjaCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCF0aGlzLmlzUGxheWluZykge1xuICAgICAgICAgICAgdGhpcy5yb3V0ZVNvdW5kcygpO1xuICAgICAgICAgICAgdGhpcy5zdGFydE9zYygpO1xuICAgICAgICB9XG5cbiAgICAgICAgeCA9IHggLSB0aGlzLnN1cmZhY2Uub2Zmc2V0TGVmdDtcbiAgICAgICAgeSA9IHkgLSB0aGlzLnN1cmZhY2Uub2Zmc2V0VG9wO1xuXG4gICAgICAgIHRoaXMubm9kZXMub3NjVm9sdW1lLmdhaW4udmFsdWUgPSAxO1xuICAgICAgICB0aGlzLnNvdXJjZS5mcmVxdWVuY3kudmFsdWUgPSB4ICogbXVsdGlwbGllcjtcbiAgICAgICAgdGhpcy5ub2Rlcy5maWx0ZXIuZnJlcXVlbmN5LnZhbHVlID0gdGhpcy5zZXRGaWx0ZXJGcmVxdWVuY3koeSk7XG5cbiAgICAgICAgdGhpcy5maW5nZXIuc3R5bGUud2Via2l0VHJhbnNmb3JtID0gdGhpcy5maW5nZXIuc3R5bGUudHJhbnNmb3JtID0gYHRyYW5zbGF0ZTNkKCR7eH1weCwgJHt5fXB4LCAwKWA7XG4gICAgICAgIHRoaXMuZmluZ2VyLmNsYXNzTGlzdC5hZGQoJ2FjdGl2ZScpO1xuXG4gICAgICAgIHRoaXMuc3VyZmFjZS5hZGRFdmVudExpc3RlbmVyKCd0b3VjaG1vdmUnLCB0aGlzLm1vdmVIYW5kbGVyKTtcbiAgICAgICAgdGhpcy5zdXJmYWNlLmFkZEV2ZW50TGlzdGVuZXIoJ3RvdWNoZW5kJywgdGhpcy5zdG9wSGFuZGxlcik7XG4gICAgICAgIHRoaXMuc3VyZmFjZS5hZGRFdmVudExpc3RlbmVyKCd0b3VjaGNhbmNlbCcsIHRoaXMuc3RvcEhhbmRsZXIpO1xuICAgICAgICB0aGlzLnN1cmZhY2UuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vtb3ZlJywgdGhpcy5tb3ZlSGFuZGxlcik7XG4gICAgICAgIHRoaXMuc3VyZmFjZS5hZGRFdmVudExpc3RlbmVyKCdtb3VzZXVwJywgdGhpcy5zdG9wSGFuZGxlcik7XG4gICAgfVxuXG4gICAgbW92ZShlKSB7XG4gICAgICAgIGxldCB4ID0gZS50eXBlID09PSAndG91Y2htb3ZlJyA/IGUudG91Y2hlc1swXS5wYWdlWCA6IGUucGFnZVg7XG4gICAgICAgIGxldCB5ID0gZS50eXBlID09PSAndG91Y2htb3ZlJyA/IGUudG91Y2hlc1swXS5wYWdlWSA6IGUucGFnZVk7XG5cbiAgICAgICAgaWYgKGUudHlwZSA9PT0gJ21vdXNlbW92ZScgJiYgdGhpcy5oYXNUb3VjaCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuaXNQbGF5aW5nKSB7XG4gICAgICAgICAgICBjb25zdCBtdWx0aXBsaWVyID0gdGhpcy5pc1NtYWxsVmlld3BvcnQgPyAyIDogMTtcbiAgICAgICAgICAgIHggPSB4IC0gdGhpcy5zdXJmYWNlLm9mZnNldExlZnQ7XG4gICAgICAgICAgICB5ID0geSAtIHRoaXMuc3VyZmFjZS5vZmZzZXRUb3A7XG4gICAgICAgICAgICB0aGlzLnNvdXJjZS5mcmVxdWVuY3kudmFsdWUgPSB4ICogbXVsdGlwbGllcjtcbiAgICAgICAgICAgIHRoaXMubm9kZXMuZmlsdGVyLmZyZXF1ZW5jeS52YWx1ZSA9IHRoaXMuc2V0RmlsdGVyRnJlcXVlbmN5KHkpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5maW5nZXIuc3R5bGUud2Via2l0VHJhbnNmb3JtID0gdGhpcy5maW5nZXIuc3R5bGUudHJhbnNmb3JtID0gYHRyYW5zbGF0ZTNkKCR7eH1weCwgJHt5fXB4LCAwKWA7XG4gICAgfVxuXG4gICAgc3RvcChlKSB7XG4gICAgICAgIGxldCB4ID0gZS50eXBlID09PSAndG91Y2hlbmQnID8gZS5jaGFuZ2VkVG91Y2hlc1swXS5wYWdlWCA6IGUucGFnZVg7XG4gICAgICAgIGxldCB5ID0gZS50eXBlID09PSAndG91Y2hlbmQnID8gZS5jaGFuZ2VkVG91Y2hlc1swXS5wYWdlWSA6IGUucGFnZVk7XG5cbiAgICAgICAgaWYgKHRoaXMuaXNQbGF5aW5nKSB7XG4gICAgICAgICAgICBjb25zdCBtdWx0aXBsaWVyID0gdGhpcy5pc1NtYWxsVmlld3BvcnQgPyAyIDogMTtcbiAgICAgICAgICAgIHggPSB4IC0gdGhpcy5zdXJmYWNlLm9mZnNldExlZnQ7XG4gICAgICAgICAgICB5ID0geSAtIHRoaXMuc3VyZmFjZS5vZmZzZXRUb3A7XG4gICAgICAgICAgICB0aGlzLnNvdXJjZS5mcmVxdWVuY3kudmFsdWUgPSB4ICogbXVsdGlwbGllcjtcbiAgICAgICAgICAgIHRoaXMubm9kZXMuZmlsdGVyLmZyZXF1ZW5jeS52YWx1ZSA9IHRoaXMuc2V0RmlsdGVyRnJlcXVlbmN5KHkpO1xuICAgICAgICAgICAgdGhpcy5ub2Rlcy5vc2NWb2x1bWUuZ2Fpbi52YWx1ZSA9IDA7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmZpbmdlci5jbGFzc0xpc3QucmVtb3ZlKCdhY3RpdmUnKTtcblxuICAgICAgICB0aGlzLnN1cmZhY2UucmVtb3ZlRXZlbnRMaXN0ZW5lcignbW91c2Vtb3ZlJywgdGhpcy5tb3ZlSGFuZGxlcik7XG4gICAgICAgIHRoaXMuc3VyZmFjZS5yZW1vdmVFdmVudExpc3RlbmVyKCdtb3VzZXVwJywgdGhpcy5zdG9wSGFuZGxlcik7XG4gICAgICAgIHRoaXMuc3VyZmFjZS5yZW1vdmVFdmVudExpc3RlbmVyKCd0b3VjaG1vdmUnLCB0aGlzLm1vdmVIYW5kbGVyKTtcbiAgICAgICAgdGhpcy5zdXJmYWNlLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3RvdWNoZW5kJywgdGhpcy5zdG9wSGFuZGxlcik7XG4gICAgICAgIHRoaXMuc3VyZmFjZS5yZW1vdmVFdmVudExpc3RlbmVyKCd0b3VjaGNhbmNlbCcsIHRoaXMuc3RvcEhhbmRsZXIpO1xuICAgIH1cblxuICAgIHVwZGF0ZU91dHB1dHMoKSB7XG4gICAgICAgIHRoaXMuZGVsYXlUaW1lT3V0cHV0LnZhbHVlID0gTWF0aC5yb3VuZCh0aGlzLmRlbGF5VGltZUlucHV0LnZhbHVlICogMTAwMCkgKyAnIG1zJztcbiAgICAgICAgdGhpcy5mZWVkYmFja0dhaW5PdXRwdXQudmFsdWUgPSBNYXRoLnJvdW5kKHRoaXMuZmVlZGJhY2tHYWluSW5wdXQudmFsdWUgKiAxMCk7XG4gICAgfVxuXG4gICAgc2V0V2F2ZWZvcm0ob3B0aW9uKSB7XG4gICAgICAgIGNvbnN0IHZhbHVlID0gb3B0aW9uLnZhbHVlIHx8IG9wdGlvbi50YXJnZXQudmFsdWU7XG4gICAgICAgIHRoaXMuc291cmNlLnR5cGUgPSB0aGlzLmlzU2FmYXJpID8gdGhpcy53YXZlcy5nZXQodmFsdWUpIDogdmFsdWU7XG4gICAgfVxuXG4gICAgZGVsYXlDaGFuZ2UoZSkge1xuICAgICAgICB0aGlzLm9wdGlvbnMuZGVsYXkgPSBlLnRhcmdldC52YWx1ZTtcbiAgICAgICAgaWYgKHRoaXMuaXNQbGF5aW5nKSB7XG4gICAgICAgICAgICB0aGlzLnN0b3BPc2MoKTtcbiAgICAgICAgICAgIHRoaXMubm9kZXMuZGVsYXkuZGVsYXlUaW1lLnZhbHVlID0gdGhpcy5vcHRpb25zLmRlbGF5O1xuICAgICAgICB9XG4gICAgICAgIHRoaXMudXBkYXRlT3V0cHV0cygpO1xuICAgIH1cblxuICAgIGZlZWRiYWNrQ2hhbmdlKGUpIHtcbiAgICAgICAgdGhpcy5vcHRpb25zLmZlZWRiYWNrID0gZS50YXJnZXQudmFsdWU7XG4gICAgICAgIGlmICh0aGlzLmlzUGxheWluZykge1xuICAgICAgICAgICAgdGhpcy5zdG9wT3NjKCk7XG4gICAgICAgICAgICB0aGlzLm5vZGVzLmZlZWRiYWNrR2Fpbi5nYWluLnZhbHVlID0gdGhpcy5vcHRpb25zLmZlZWRiYWNrO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMudXBkYXRlT3V0cHV0cygpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldCBmaWx0ZXIgZnJlcXVlbmN5IGJhc2VkIG9uICh5KSBheGlzIHZhbHVlXG4gICAgICovXG4gICAgc2V0RmlsdGVyRnJlcXVlbmN5KHkpIHtcbiAgICAgICAgLy8gbWluIDQwSHpcbiAgICAgICAgY29uc3QgbWluID0gNDA7XG4gICAgICAgIC8vIG1heCBoYWxmIG9mIHRoZSBzYW1wbGluZyByYXRlXG4gICAgICAgIGNvbnN0IG1heCA9IHRoaXMubXlBdWRpb0NvbnRleHQuc2FtcGxlUmF0ZSAvIDI7XG4gICAgICAgIC8vIExvZ2FyaXRobSAoYmFzZSAyKSB0byBjb21wdXRlIGhvdyBtYW55IG9jdGF2ZXMgZmFsbCBpbiB0aGUgcmFuZ2UuXG4gICAgICAgIGNvbnN0IG51bWJlck9mT2N0YXZlcyA9IE1hdGgubG9nKG1heCAvIG1pbikgLyBNYXRoLkxOMjtcbiAgICAgICAgLy8gQ29tcHV0ZSBhIG11bHRpcGxpZXIgZnJvbSAwIHRvIDEgYmFzZWQgb24gYW4gZXhwb25lbnRpYWwgc2NhbGUuXG4gICAgICAgIGNvbnN0IG11bHRpcGxpZXIgPSBNYXRoLnBvdygyLCBudW1iZXJPZk9jdGF2ZXMgKiAoKCgyIC8gdGhpcy5zdXJmYWNlLmNsaWVudEhlaWdodCkgKiAodGhpcy5zdXJmYWNlLmNsaWVudEhlaWdodCAtIHkpKSAtIDEuMCkpO1xuICAgICAgICAvLyBHZXQgYmFjayB0byB0aGUgZnJlcXVlbmN5IHZhbHVlIGJldHdlZW4gbWluIGFuZCBtYXguXG4gICAgICAgIHJldHVybiBtYXggKiBtdWx0aXBsaWVyO1xuICAgIH1cblxuICAgIGZpbHRlckNoYW5nZShvcHRpb24pIHtcbiAgICAgICAgY29uc3QgdmFsdWUgPSBvcHRpb24udmFsdWUgfHwgb3B0aW9uLnRhcmdldC52YWx1ZTtcbiAgICAgICAgdGhpcy5ub2Rlcy5maWx0ZXIudHlwZSA9IHRoaXMuaXNTYWZhcmkgPyB0aGlzLmZpbHRlcnMuZ2V0KHZhbHVlKSA6IHZhbHVlO1xuICAgIH1cblxuICAgIGFuaW1hdGVTcGVjdHJ1bSgpIHtcbiAgICAgICAgLy8gTGltaXQgY2FudmFzIHJlZHJhdyB0byA0MCBmcHNcbiAgICAgICAgc2V0VGltZW91dCh0aGlzLm9uVGljay5iaW5kKHRoaXMpLCAxMDAwIC8gNDApO1xuICAgIH1cblxuICAgIG9uVGljaygpIHtcbiAgICAgICAgdGhpcy5kcmF3U3BlY3RydW0oKTtcbiAgICAgICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKHRoaXMuYW5pbWF0ZVNwZWN0cnVtLmJpbmQodGhpcyksIHRoaXMuY2FudmFzKTtcbiAgICB9XG5cbiAgICBzZXRDYW52YXNTaXplKCkge1xuICAgICAgICBjb25zdCBjYW52YXNTaXplID0gdGhpcy5pc1NtYWxsVmlld3BvcnQgPyAyNTYgOiA1MTI7XG4gICAgICAgIHRoaXMuY2FudmFzLndpZHRoID0gdGhpcy5jYW52YXMuaGVpZ2h0ID0gY2FudmFzU2l6ZSAtIDEwO1xuICAgICAgICAvLyBzZXQgY2FudmFzIGdyYXBoIGNvbG9yXG4gICAgICAgIHRoaXMuY3R4LmZpbGxTdHlsZSA9IHRoaXMub3B0aW9ucy5iYXJDb2xvcjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBEcmF3IHRoZSBjYW52YXMgZnJlcXVlbmN5IGRhdGEgZ3JhcGhcbiAgICAgKi9cbiAgICBkcmF3U3BlY3RydW0oKSB7XG4gICAgICAgIGNvbnN0IGNhbnZhc1NpemUgPSB0aGlzLmlzU21hbGxWaWV3cG9ydCA/IDI1NiA6IDUxMjtcbiAgICAgICAgY29uc3QgYmFyV2lkdGggPSB0aGlzLmlzU21hbGxWaWV3cG9ydCA/IDEwIDogMjA7XG4gICAgICAgIGNvbnN0IGJhckNvdW50ID0gTWF0aC5yb3VuZChjYW52YXNTaXplIC8gYmFyV2lkdGgpO1xuICAgICAgICBjb25zdCBmcmVxQnl0ZURhdGEgPSBuZXcgVWludDhBcnJheSh0aGlzLm15QXVkaW9BbmFseXNlci5mcmVxdWVuY3lCaW5Db3VudCk7XG5cbiAgICAgICAgdGhpcy5jdHguY2xlYXJSZWN0KDAsIDAsIGNhbnZhc1NpemUsIGNhbnZhc1NpemUpO1xuXG4gICAgICAgIHRoaXMubXlBdWRpb0FuYWx5c2VyLmdldEJ5dGVGcmVxdWVuY3lEYXRhKGZyZXFCeXRlRGF0YSk7XG5cbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBiYXJDb3VudDsgaSArPSAxKSB7XG4gICAgICAgICAgICBjb25zdCBtYWduaXR1ZGUgPSBmcmVxQnl0ZURhdGFbaV07XG4gICAgICAgICAgICBjb25zdCBtdWx0aXBsaWVyID0gdGhpcy5pc1NtYWxsVmlld3BvcnQgPyAxIDogMjtcbiAgICAgICAgICAgIC8vIHNvbWUgdmFsdWVzIG5lZWQgYWRqdXN0aW5nIHRvIGZpdCBvbiB0aGUgY2FudmFzXG4gICAgICAgICAgICB0aGlzLmN0eC5maWxsUmVjdChiYXJXaWR0aCAqIGksIGNhbnZhc1NpemUsIGJhcldpZHRoIC0gMSwgLW1hZ25pdHVkZSAqIG11bHRpcGxpZXIpO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBXYXZlcGFkO1xuIl19
