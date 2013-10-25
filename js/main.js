/*global alert: false, clearInterval: false, clearTimeout: false, document: false, event: false, frames: false, history: false, Image: false, location: false, name: false, navigator: false, Option: false, parent: false, screen: false, setInterval: false, setTimeout: false, window: false, XMLHttpRequest: false, console: false, webkitAudioContext: false, AudioContext: false, requestAnimationFrame: false, Uint8Array: false, Tap: false */

var wavepad = (function () {

    'use strict';

    var surface,
        finger,
        source,
        nodes = {},
        myAudioContext,
        myAudioAnalyser,
        mySpectrum,
        hasTouch = false,
        isSmallViewport = false,
        isMuted = false,
        isPlaying = false,
        isSafari = navigator.userAgent.indexOf("Safari") !== -1;

    return {

        init: function () {
            var doc = document;

            window.AudioContext = window.AudioContext || window.webkitAudioContext;

            if ('AudioContext' in window) {
                myAudioContext = new AudioContext();
            } else {
                alert('Your browser does not yet support the Web Audio API');
                return;
            }

            if (window.matchMedia) {
                isSmallViewport = window.matchMedia("(max-width: 512px)").matches ? true : false;

                window.matchMedia("(max-width: 512px)").addListener(function (mql) {
                    if (mql.matches) {
                        isSmallViewport = true;
                    } else {
                        isSmallViewport = false;
                    }
                });
            }

            doc.getElementById('power').addEventListener('click', wavepad.togglePower, false);
            doc.getElementById('waveform').addEventListener('change', wavepad.setWaveform, false);
            doc.getElementById('filter-type').addEventListener('change', wavepad.filterChange, false);
            doc.getElementById('delay').addEventListener('input', wavepad.sliderChange, false);
            doc.getElementById('feedback').addEventListener('input', wavepad.sliderChange, false);

            surface = doc.querySelector('.surface');
            finger = doc.querySelector('.finger');

            nodes.oscVolume = myAudioContext.createGain ? myAudioContext.createGain() : myAudioContext.createGainNode();
            nodes.filter = myAudioContext.createBiquadFilter();
            nodes.volume = myAudioContext.createGain ? myAudioContext.createGain() : myAudioContext.createGainNode();
            nodes.delay = myAudioContext.createDelay ? myAudioContext.createDelay() : myAudioContext.createDelayNode();
            nodes.feedbackGain = myAudioContext.createGain ? myAudioContext.createGain() : myAudioContext.createGainNode();
            nodes.compressor = myAudioContext.createDynamicsCompressor();

            myAudioAnalyser = myAudioContext.createAnalyser();
            myAudioAnalyser.smoothingTimeConstant = 0.85;

            wavepad.updateOutputs();
            wavepad.animateSpectrum();

            surface.addEventListener('mousedown', wavepad.play, false);
            surface.addEventListener('touchstart', wavepad.play, false);

            doc.querySelector('.surface').addEventListener('touchmove', function (e) {
                e.preventDefault();
            });
        },

        routeSounds: function () {
            var doc = document;

            source = myAudioContext.createOscillator();

            wavepad.setWaveform(doc.getElementById('waveform'));
            wavepad.filterChange(doc.getElementById('filter-type'));
            nodes.feedbackGain.gain.value = doc.getElementById('feedback').value;
            nodes.delay.delayTime.value = doc.getElementById('delay').value;
            nodes.volume.gain.value = 0.2;
            nodes.oscVolume.gain.value = 0;

            source.connect(nodes.oscVolume);
            nodes.oscVolume.connect(nodes.filter);
            nodes.filter.connect(nodes.compressor);
            nodes.filter.connect(nodes.delay);
            nodes.delay.connect(nodes.feedbackGain);
            nodes.delay.connect(nodes.compressor);
            nodes.feedbackGain.connect(nodes.delay);
            nodes.compressor.connect(nodes.volume);
            nodes.volume.connect(myAudioAnalyser);
            myAudioAnalyser.connect(myAudioContext.destination);

            if (!source.start) {
                source.start = source.noteOn;
            }

            source.start(0);
        },

        togglePower: function () {

            var doc = document;

            if (isPlaying) {
                if (!source.stop) {
                    source.stop = source.noteOff;
                }
                source.stop(0);
                myAudioAnalyser.disconnect();
                doc.querySelector('.main').classList.add('off');
                isPlaying = false;
            } else {
                wavepad.routeSounds();
                doc.querySelector('.main').classList.remove('off');
                isPlaying = true;
            }
        },

        play: function (e) {
            var x,
                y,
                multiplier = isSmallViewport ? 2 : 1;

            if (!isPlaying) {
                if (!document.querySelector('.main').classList.contains('off')) {
                    wavepad.routeSounds();
                    isPlaying = true;
                } else {
                    return;
                }

            }

            if (e.type === 'touchstart') {
                hasTouch = true;
            } else if (e.type === 'mousedown' && hasTouch) {
                return;
            }

            x = e.pageX - surface.offsetLeft;
            y = e.pageY - surface.offsetTop;

            nodes.oscVolume.gain.value = 1;

            source.frequency.value = x * multiplier;
            wavepad.setFilterFrequency(y);

            finger.style.webkitTransform = finger.style.MozTransform = finger.style.msTransform = finger.style.OTransform = finger.style.transform = 'translate3d(' + x + 'px,' + y  + 'px, 0)';
            finger.classList.add('active');

            surface.addEventListener('touchmove', wavepad.effect, false);
            surface.addEventListener('touchend', wavepad.stop, false);
            surface.addEventListener('touchcancel', wavepad.stop, false);
            surface.addEventListener('mousemove', wavepad.effect, false);
            surface.addEventListener('mouseup', wavepad.stop, false);
        },

        stop: function (e) {
            var x = e.pageX - surface.offsetLeft,
                y = e.pageY - surface.offsetTop,
                multiplier = isSmallViewport ? 2 : 1;

            if (e.type === 'mouseup' && hasTouch) {
                hasTouch = false;
                return;
            }

            if (isPlaying) {
                source.frequency.value = x * multiplier;
                wavepad.setFilterFrequency(y);
                nodes.oscVolume.gain.value = 0;
            }

            finger.classList.remove('active');

            surface.removeEventListener('mousemove', wavepad.effect, false);
            surface.removeEventListener('mouseup', wavepad.stop, false);
            surface.removeEventListener('touchmove', wavepad.effect, false);
            surface.removeEventListener('touchend', wavepad.stop, false);
            surface.removeEventListener('touchcancel', wavepad.stop, false);
        },

        effect: function (e) {
            var x = e.pageX - surface.offsetLeft,
                y = e.pageY - surface.offsetTop,
                multiplier = isSmallViewport ? 2 : 1;

            if (e.type === 'mousemove' && hasTouch) {
                return;
            }

            if (isPlaying) {
                source.frequency.value = x * multiplier;
                wavepad.setFilterFrequency(y);
            }

            finger.style.webkitTransform = finger.style.MozTransform = finger.style.msTransform = finger.style.OTransform = finger.style.transform = 'translate3d(' + x + 'px,' + y + 'px, 0)';
        },

        updateOutputs: function (e) {
            var doc = document;
            doc.getElementById('delay-output').value = Math.round(doc.getElementById('delay').value * 1000) + ' ms';
            doc.getElementById('feedback-output').value = Math.round(doc.getElementById('feedback').value * 10);
        },

        setWaveform: function (option) {
            var value = option.value || this.value;
            var waves = isSafari ? [0,1,2,3] : ["sine", "square", "sawtooth", "triangle"];
            source.type = waves[value];
        },

        sliderChange: function (slider) {

            if (isPlaying) {
                if (!source.stop) {
                    source.stop = source.noteOff;
                }
                source.stop(0);
                isPlaying = false;
                if (slider.id === 'delay') {
                    nodes.delay.delayTime.value = slider.value;
                } else if (slider.id === 'feedback') {
                    nodes.feedbackGain.gain.value = slider.value;
                }
            }
            wavepad.updateOutputs();
        },

        setFilterFrequency: function (y) {
            var min = 40; // min 40Hz
            var max = myAudioContext.sampleRate / 2; // max half of the sampling rate
            var numberOfOctaves = Math.log(max / min) / Math.LN2; // Logarithm (base 2) to compute how many octaves fall in the range.
            var multiplier = Math.pow(2, numberOfOctaves * (((2 / surface.clientHeight) * (surface.clientHeight - y)) - 1.0)); // Compute a multiplier from 0 to 1 based on an exponential scale.
            nodes.filter.frequency.value = max * multiplier; // Get back to the frequency value between min and max.
        },

        filterChange: function (option) {
            var value = option.value || this.value;
            var id = option.id || this.id;
            var filters = isSafari ? [0,1,2,3,4,5,6,7] : ["lowpass", "highpass", "bandpass", "lowshelf", "highshelf", "peaking", "notch", "allpass"];
            if (id === 'filter-type') {
                nodes.filter.type = filters[value];
            }
        },

        animateSpectrum: function () {
            mySpectrum = requestAnimationFrame(wavepad.animateSpectrum, document.querySelector('canvas'));
            wavepad.drawSpectrum();
        },

        drawSpectrum: function () {
            var canvas = document.querySelector('canvas'),
                ctx = canvas.getContext('2d'),
                canvasSize = isSmallViewport ? 256 : 512,
                multiplier = isSmallViewport ? 1 : 2,
                width = canvasSize,
                height = canvasSize,
                bar_width = isSmallViewport ? 10 : 20,
                freqByteData,
                barCount,
                magnitude,
                i;

            canvas.width = canvasSize - 10;
            canvas.height = canvasSize - 10;

            ctx.clearRect(0, 0, width, height);
            ctx.fillStyle = '#1d1c25';

            freqByteData = new Uint8Array(myAudioAnalyser.frequencyBinCount);
            myAudioAnalyser.getByteFrequencyData(freqByteData);
            barCount = Math.round(width / bar_width);

            for (i = 0; i < barCount; i += 1) {
                magnitude = freqByteData[i];
                // some values need adjusting to fit on the canvas
                ctx.fillRect(bar_width * i, height, bar_width - 1, -magnitude * multiplier);
            }
        }
    };
}());

window.addEventListener("DOMContentLoaded", wavepad.init, true);
