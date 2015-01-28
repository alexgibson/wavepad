let wavepad = (function () {

    let canvas;
    let main;
    let surface;
    let finger;
    let source;
    let nodes = {};
    let myAudioContext;
    let myAudioAnalyser;
    let hasTouch = false;
    let isSmallViewport = false;
    let isPlaying = false;

    let filters = new Map();
    filters.set('lowpass', 0);
    filters.set('highpass', 1);
    filters.set('bandpass', 2);
    filters.set('lowshelf', 3);
    filters.set('highshelf', 4);
    filters.set('peaking', 5);
    filters.set('notch', 6);
    filters.set('allpass', 7);

    let waves = new Map();
    waves.set('sine', 0);
    waves.set('square', 1);
    waves.set('sawtooth', 2);
    waves.set('triangle', 3);

    const isSafari = navigator.userAgent.indexOf('Safari') !== -1 && navigator.userAgent.indexOf('Chrome') == -1;

    return {

        init: function () {
            let doc = document;

            window.AudioContext = window.AudioContext || window.webkitAudioContext;

            if ('AudioContext' in window) {
                myAudioContext = new AudioContext();
            } else {
                alert('Your browser does not yet support the Web Audio API');
                return;
            }

            if (window.matchMedia) {
                isSmallViewport = window.matchMedia('(max-width: 512px)').matches ? true : false;

                window.matchMedia('(max-width: 512px)').addListener(mql => {
                    if (mql.matches) {
                        isSmallViewport = true;
                    } else {
                        isSmallViewport = false;
                    }
                });
            }

            doc.getElementById('power').addEventListener('click', wavepad.togglePower);
            doc.getElementById('waveform').addEventListener('change', wavepad.setWaveform);
            doc.getElementById('filter-type').addEventListener('change', wavepad.filterChange);
            doc.getElementById('delay').addEventListener('input', wavepad.sliderChange);
            doc.getElementById('feedback').addEventListener('input', wavepad.sliderChange);

            main = doc.querySelector('.main');
            canvas = doc.querySelector('canvas');
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

            doc.querySelector('.surface').addEventListener('touchmove', e => {
                e.preventDefault();
            });
        },

        routeSounds: function () {
            let doc = document;

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
            let doc = document;

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
            let x;
            let y;
            let multiplier = isSmallViewport ? 2 : 1;

            if (!isPlaying) {
                if (!main.classList.contains('off')) {
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

            finger.style.webkitTransform = finger.style.transform = 'translate3d(' + x + 'px,' + y  + 'px, 0)';
            finger.classList.add('active');

            surface.addEventListener('touchmove', wavepad.effect);
            surface.addEventListener('touchend', wavepad.stop);
            surface.addEventListener('touchcancel', wavepad.stop);
            surface.addEventListener('mousemove', wavepad.effect);
            surface.addEventListener('mouseup', wavepad.stop);
        },

        stop: function (e) {
            let x = e.pageX - surface.offsetLeft;
            let y = e.pageY - surface.offsetTop;
            let multiplier = isSmallViewport ? 2 : 1;

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

            surface.removeEventListener('mousemove', wavepad.effect);
            surface.removeEventListener('mouseup', wavepad.stop);
            surface.removeEventListener('touchmove', wavepad.effect);
            surface.removeEventListener('touchend', wavepad.stop);
            surface.removeEventListener('touchcancel', wavepad.stop);
        },

        effect: function (e) {
            let x = e.pageX - surface.offsetLeft;
            let y = e.pageY - surface.offsetTop;
            let multiplier = isSmallViewport ? 2 : 1;

            if (e.type === 'mousemove' && hasTouch) {
                return;
            }

            if (isPlaying) {
                source.frequency.value = x * multiplier;
                wavepad.setFilterFrequency(y);
            }

            finger.style.webkitTransform = finger.style.transform = 'translate3d(' + x + 'px,' + y + 'px, 0)';
        },

        updateOutputs: function () {
            let doc = document;
            doc.getElementById('delay-output').value = Math.round(doc.getElementById('delay').value * 1000) + ' ms';
            doc.getElementById('feedback-output').value = Math.round(doc.getElementById('feedback').value * 10);
        },

        setWaveform: function (option) {
            let value = option.value || this.value;
            if (isSafari) {
                source.type = waves.get(value);
            } else {
                source.type = value;
            }
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
            let min = 40; // min 40Hz
            let max = myAudioContext.sampleRate / 2; // max half of the sampling rate
            let numberOfOctaves = Math.log(max / min) / Math.LN2; // Logarithm (base 2) to compute how many octaves fall in the range.
            let multiplier = Math.pow(2, numberOfOctaves * (((2 / surface.clientHeight) * (surface.clientHeight - y)) - 1.0)); // Compute a multiplier from 0 to 1 based on an exponential scale.
            nodes.filter.frequency.value = max * multiplier; // Get back to the frequency value between min and max.
        },

        filterChange: function (option) {
            let value = option.value || this.value;
            let id = option.id || this.id;

            if (id === 'filter-type') {
                if (isSafari) {
                    nodes.filter.type = filters.get(value);
                } else {
                    nodes.filter.type = value;
                }
            }
        },

        animateSpectrum: function () {
            setTimeout(function() {
                wavepad.drawSpectrum();
                requestAnimationFrame(wavepad.animateSpectrum, canvas);
            }, 1000 / 40);
        },

        drawSpectrum: function () {
            let ctx = canvas.getContext('2d');
            let canvasSize = isSmallViewport ? 256 : 512;
            let multiplier = isSmallViewport ? 1 : 2;
            let width = canvasSize;
            let height = canvasSize;
            let barWidth = isSmallViewport ? 10 : 20;
            let freqByteData;
            let barCount;

            canvas.width = canvasSize - 10;
            canvas.height = canvasSize - 10;

            ctx.clearRect(0, 0, width, height);
            ctx.fillStyle = '#1d1c25';

            freqByteData = new Uint8Array(myAudioAnalyser.frequencyBinCount);
            myAudioAnalyser.getByteFrequencyData(freqByteData);
            barCount = Math.round(width / barWidth);

            for (let i = 0; i < barCount; i += 1) {
                let magnitude = freqByteData[i];
                // some values need adjusting to fit on the canvas
                ctx.fillRect(barWidth * i, height, barWidth - 1, -magnitude * multiplier);
            }
        }
    };
}());

window.addEventListener('DOMContentLoaded', wavepad.init, true);
