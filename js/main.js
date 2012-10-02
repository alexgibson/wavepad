var wavepad = (function () {

    'use strict';

    var surface,
        finger,
        source,
        nodes = {},
        myAudioContext,
        myAudioAnalyser,
        mySpectrum,
        impulseResponse,
        hasTouch = 'ontouchstart' in window || 'createTouch' in document,
        eventStart = hasTouch ? 'touchstart' : 'mousedown',
        eventMove = hasTouch ? 'touchmove' : 'mousemove',
        eventEnd = hasTouch ? 'touchend' : 'mouseup',
        isSmallViewport = false,
        isMuted = false;

        return {

            init: function () {
                var doc = document;

                if ('webkitAudioContext' in window || 'AudioContext' in window) {
                    myAudioContext = new webkitAudioContext() || AudioContext();
                } else {
                    alert('Your browser does not support Web Audio API');
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

                doc.getElementById('waveform').addEventListener('change', wavepad.sliderChange, false);
                doc.getElementById('filter-type').addEventListener('change', wavepad.filterChange, false);
                doc.getElementById('delay').addEventListener('input', wavepad.sliderChange, false);
                doc.getElementById('feedback').addEventListener('input', wavepad.sliderChange, false);

                surface = doc.querySelector('.surface');
                surface.addEventListener(eventStart, wavepad.play, false);

                finger = doc.querySelector('.finger');

                doc.querySelector('.surface').addEventListener('touchmove', function (e) {
                    e.preventDefault();
                });

                wavepad.updateOutputs();
                wavepad.routeSounds();
            },

            routeSounds: function () {
                var doc = document;
                var filterType = doc.querySelector('#filter-type').value;
                var delay = doc.querySelector('#delay').value;
                var feedback = doc.querySelector('#feedback').value;

                source = myAudioContext.createOscillator();
                source.type = doc.querySelector('#waveform').value; // sine wave

                nodes.filter = myAudioContext.createBiquadFilter();  
                nodes.volume = myAudioContext.createGainNode();
                nodes.delay = myAudioContext.createDelayNode();
                nodes.feedbackGain = myAudioContext.createGainNode();

                nodes.filter.type = filterType;
                nodes.volume.gain.value = 0.2;
                nodes.feedbackGain.gain.value = feedback;
                nodes.delay.delayTime.value = delay;

                myAudioAnalyser = myAudioContext.createAnalyser();
                myAudioAnalyser.smoothingTimeConstant = 0.85;

                source.connect(nodes.filter);
                nodes.filter.connect(nodes.volume);
                nodes.filter.connect(nodes.delay);
                nodes.delay.connect(nodes.feedbackGain);
                nodes.feedbackGain.connect(nodes.volume);
                nodes.feedbackGain.connect(nodes.delay);
                nodes.volume.connect(myAudioAnalyser);
                myAudioAnalyser.connect(myAudioContext.destination);
            },

            play: function (e) {
                var x = e.pageX - surface.offsetLeft;
                var y = e.pageY - surface.offsetTop;
                var multiplier = isSmallViewport ? 2 : 1;

                if (myAudioContext.activeSourceCount > 0) {
                    wavepad.kill();
                }

                wavepad.routeSounds();
                source.frequency.value = x * multiplier;
                nodes.filter.frequency.value = 512 - (y * multiplier);
                source.noteOn(0);

                finger.style.webkitTransform = finger.style.MozTransform = finger.style.msTransform = finger.style.OTransform = finger.style.transform = 'translate(' + (x - finger.offsetWidth / 2) + 'px,' + (y - finger.offsetHeight / 2) + 'px)';
                finger.classList.add('active');
                surface.classList.add('pressed');                

                surface.addEventListener(eventMove, wavepad.effect, false);
                surface.addEventListener(eventEnd, wavepad.stop, false);

                if (hasTouch) {
                    surface.addEventListener('touchcancel', wavepad.kill, false);
                }

                wavepad.animateSpectrum();
            },

            stop: function (e) {
                var x = e.pageX - surface.offsetLeft;
                var y = e.pageY - surface.offsetTop;
                var multiplier = isSmallViewport ? 2 : 1;

                if (myAudioContext.activeSourceCount > 0) {
                    source.frequency.value = x * multiplier;
                    nodes.filter.frequency.value = 512 - (y * multiplier);
                    source.noteOff(0);
                }

                finger.classList.remove('active');
                surface.classList.remove('pressed');

                setTimeout(function () {
                    window.cancelAnimationFrame(mySpectrum);
                }, 10000);

                surface.removeEventListener(eventMove, wavepad.effect, false);
                surface.removeEventListener(eventEnd, wavepad.stop, false);

                if (hasTouch) {
                    surface.removeEventListener('touchcancel', wavepad.kill, false);
                }
            },

            kill: function () {
                source.noteOff(0);
                finger.classList.remove('active');
                surface.classList.remove('pressed');

                window.cancelAnimationFrame(mySpectrum);

                surface.removeEventListener(eventMove, wavepad.effect, false);
                surface.removeEventListener(eventEnd, wavepad.stop, false);

                if (hasTouch) {
                    surface.removeEventListener('touchcancel', wavepad.kill, false);
                }
            },

            effect: function (e) {
                var x = e.pageX - surface.offsetLeft;
                var y = e.pageY - surface.offsetTop;
                var multiplier = isSmallViewport ? 2 : 1;

                if (myAudioContext.activeSourceCount > 0) {
                    source.frequency.value = x * multiplier;
                    nodes.filter.frequency.value = 512 - (y * multiplier);
                    finger.style.webkitTransform = finger.style.MozTransform = finger.style.msTransform = finger.style.OTransform = finger.style.transform = 'translate(' + (x - finger.offsetWidth / 2) + 'px,' + (y - finger.offsetHeight / 2) + 'px)';
                }

            },

            updateOutputs: function (e) {
                var doc = document;
                doc.getElementById('delay-output').value = Math.round(doc.getElementById('delay').value * 1000) + ' ms';
                doc.getElementById('feedback-output').value = doc.getElementById('feedback').value;
            },

            sliderChange: function (slider) {
                if (myAudioContext.activeSourceCount > 0) {
                    if (slider.id == 'waveform') {
                        wavepad.stop();
                        wavepad.play();
                    } else if (slider.id === 'frequency') {
                        source.frequency.value = slider.value;
                    } else if (slider.id === 'delay') {
                        nodes.delay.delayTime.value = slider.value;
                    } else if (slider.id === 'feedback') {
                        nodes.feedbackGain.gain.value = slider.value;
                    }
                }
                wavepad.updateOutputs();
            },

            filterChange: function (slider) {
                if (myAudioContext.activeSourceCount > 0) {
                    if (slider.id == 'filter-type') {
                        nodes.filter.type = slider.value;
                    }
                }
            },

            animateSpectrum: function () {
                mySpectrum = requestAnimationFrame(wavepad.animateSpectrum, document.querySelector('canvas'));
                wavepad.drawSpectrum();
            },

            drawSpectrum: function () {
                var canvas = document.querySelector('canvas');
                var ctx = canvas.getContext('2d');
                var canvasSize = isSmallViewport ? 256 : 512;
                var multiplier = isSmallViewport ? 1 : 2;
                var width = canvasSize;
                var height = canvasSize;
                var bar_width = isSmallViewport ? 10 : 20;

                canvas.width = canvasSize - 10;
                canvas.height = canvasSize - 10;
     
                ctx.clearRect(0, 0, width, height);
                ctx.fillStyle = '#1d1c25';
     
                var freqByteData = new Uint8Array(myAudioAnalyser.frequencyBinCount);
                myAudioAnalyser.getByteFrequencyData(freqByteData);
     
                var barCount = Math.round(width / bar_width);
                for (var i = 0; i < barCount; i++) {
                    var magnitude = freqByteData[i];
                    // some values need adjusting to fit on the canvas
                    ctx.fillRect(bar_width * i, height, bar_width - 1, -magnitude * multiplier);
                }
            }
        };
}());

window.addEventListener("DOMContentLoaded", wavepad.init, true);