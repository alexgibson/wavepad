class Wavepad {

    constructor(options) {

        // default options
        this.options = {
            waveform: 'sine',
            filter: 'lowpass'
        };

        // set configurable options
        if (typeof options === 'object') {
            for (let i in options) {
                if (options.hasOwnProperty(i)) {
                    this.options[i] = options[i];
                }
            }
        }

        // UI DOM references
        let doc = document;
        this.canvas = doc.querySelector('canvas');
        this.main = doc.querySelector('.main');
        this.surface = doc.querySelector('.surface');
        this.finger = doc.querySelector('.finger');
        this.waveform = doc.getElementById('waveform');
        this.filter = doc.getElementById('filter-type');
        this.powerToggle = doc.getElementById('power');
        this.delayTimeInput = doc.getElementById('delay');
        this.feedbackGainInput = doc.getElementById('feedback');
        this.delayTimeOutput = doc.getElementById('delay-output');
        this.feedbackGainOutput = doc.getElementById('feedback-output');

        // Web Audio Node references
        this.source = null;
        this.nodes = {};
        this.myAudioContext = null;
        this.myAudioAnalyser = null;

        // Map for legacy Web Audio filter values
        this.filters = new Map();
        this.filters.set('lowpass', 0);
        this.filters.set('highpass', 1);
        this.filters.set('bandpass', 2);
        this.filters.set('lowshelf', 3);
        this.filters.set('highshelf', 4);
        this.filters.set('peaking', 5);
        this.filters.set('notch', 6);
        this.filters.set('allpass', 7);

        // Map for legacy Web Audio waveform values
        this.waves = new Map();
        this.waves.set('sine', 0);
        this.waves.set('square', 1);
        this.waves.set('sawtooth', 2);
        this.waves.set('triangle', 3);

        this.hasTouch = false;
        this.isSmallViewport = false;
        this.isPlaying = false;

        // Safari needs some special attention for its non-standards
        this.isSafari = navigator.userAgent.indexOf('Safari') !== -1 && navigator.userAgent.indexOf('Chrome') == -1;
    }

    init() {

        // normalize and create a new AudioContext if supported
        window.AudioContext = window.AudioContext || window.webkitAudioContext;

        if ('AudioContext' in window) {
            this.myAudioContext = new AudioContext();
        } else {
            alert('Your browser does not yet support the Web Audio API');
            return;
        }

        // get default surface size and listen for resize changes
        if (window.matchMedia) {
            this.isSmallViewport = window.matchMedia('(max-width: 512px)').matches ? true : false;

            window.matchMedia('(max-width: 512px)').addListener(mql => {
                if (mql.matches) {
                    this.isSmallViewport = true;
                } else {
                    this.isSmallViewport = false;
                }
            });
        }

        // store references to bound events
        // so we can unbind when needed
        this.playHandler = this.play.bind(this);
        this.effectHandler = this.effect.bind(this);
        this.stopHandler = this.stop.bind(this);

        // set default values that we're supplied
        this.waveform.value = this.options.waveform;
        this.filter.value = this.options.filter;
        this.updateOutputs();

        // bind UI control events
        this.powerToggle.addEventListener('click', this.togglePower.bind(this));
        this.waveform.addEventListener('change', this.setWaveform.bind(this));
        this.filter.addEventListener('change', this.filterChange.bind(this));
        this.delayTimeInput.addEventListener('input', this.sliderChange.bind(this));
        this.feedbackGainInput.addEventListener('input', this.sliderChange.bind(this));

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
        this.surface.removeEventListener('touchmove', e => {
            e.preventDefault();
        });
    }

    routeSounds() {
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
    }

    startOsc() {
        if (!this.source.start) {
            this.source.start = this.source.noteOn;
        }
        this.source.start(0);
        this.isPlaying = true;
    }

    stopOsc() {
        if (!this.source.stop) {
            this.source.stop = this.source.noteOff;
        }
        this.source.stop(0);
        this.isPlaying = false;
    }

    bindSurfaceEvents() {
        this.surface.addEventListener('mousedown', this.playHandler);
        this.surface.addEventListener('touchstart', this.playHandler);
    }

    unbindSurfaceEvents() {
        this.surface.removeEventListener('mousedown', this.playHandler);
        this.surface.removeEventListener('mousemove', this.effectHandler);
        this.surface.removeEventListener('mouseup', this.stopHandler);
        this.surface.removeEventListener('touchstart', this.playHandler);
        this.surface.removeEventListener('touchmove', this.effectHandler);
        this.surface.removeEventListener('touchend', this.stopHandler);
        this.surface.removeEventListener('touchcancel', this.stopHandler);
    }

    togglePower() {
        if (this.isPlaying) {
            this.stopOsc();
            this.myAudioAnalyser.disconnect();
            this.unbindSurfaceEvents();
            this.main.classList.add('off');
        } else {
            this.routeSounds();
            this.startOsc();
            this.bindSurfaceEvents();
            this.main.classList.remove('off');
        }
    }

    play(e) {
        let x;
        let y;
        let multiplier = this.isSmallViewport ? 2 : 1;

        if (!this.isPlaying) {
            this.routeSounds();
            this.startOsc();
        }

        if (e.type === 'touchstart') {
            this.hasTouch = true;
        } else if (e.type === 'mousedown' && this.hasTouch) {
            return;
        }

        x = e.pageX - this.surface.offsetLeft;
        y = e.pageY - this.surface.offsetTop;

        this.nodes.oscVolume.gain.value = 1;

        this.source.frequency.value = x * multiplier;
        this.setFilterFrequency(y);

        this.finger.style.webkitTransform = this.finger.style.transform = 'translate3d(' + x + 'px,' + y  + 'px, 0)';
        this.finger.classList.add('active');

        this.surface.addEventListener('touchmove', this.effectHandler);
        this.surface.addEventListener('touchend', this.stopHandler);
        this.surface.addEventListener('touchcancel', this.stopHandler);
        this.surface.addEventListener('mousemove', this.effectHandler);
        this.surface.addEventListener('mouseup', this.stopHandler);
    }

    stop(e) {
        let x = e.pageX - this.surface.offsetLeft;
        let y = e.pageY - this.surface.offsetTop;
        let multiplier = this.isSmallViewport ? 2 : 1;

        if (e.type === 'mouseup' && this.hasTouch) {
            this.hasTouch = false;
            return;
        }

        if (this.isPlaying) {
            this.source.frequency.value = x * multiplier;
            this.setFilterFrequency(y);
            this.nodes.oscVolume.gain.value = 0;
        }

        this.finger.classList.remove('active');

        this.surface.removeEventListener('mousemove', this.effectHandler);
        this.surface.removeEventListener('mouseup', this.stopHandler);
        this.surface.removeEventListener('touchmove', this.effectHandler);
        this.surface.removeEventListener('touchend', this.stopHandler);
        this.surface.removeEventListener('touchcancel', this.stopHandler);
    }

    effect(e) {
        let x = e.pageX - this.surface.offsetLeft;
        let y = e.pageY - this.surface.offsetTop;
        let multiplier = this.isSmallViewport ? 2 : 1;

        if (e.type === 'mousemove' && this.hasTouch) {
            return;
        }

        if (this.isPlaying) {
            this.source.frequency.value = x * multiplier;
            this.setFilterFrequency(y);
        }

        this.finger.style.webkitTransform = this.finger.style.transform = 'translate3d(' + x + 'px,' + y + 'px, 0)';
    }

    updateOutputs() {
        this.delayTimeOutput.value = Math.round(this.delayTimeInput.value * 1000) + ' ms';
        this.feedbackGainOutput.value = Math.round(this.feedbackGainInput.value * 10);
    }

    setWaveform(option) {
        let value = option.value || option.target.value;
        if (this.isSafari) {
            this.source.type = this.waves.get(value);
        } else {
            this.source.type = value;
        }
    }

    sliderChange(slider) {
        if (this.isPlaying) {
            this.stopOsc();
            if (slider.id === 'delay') {
                this.nodes.delay.delayTime.value = slider.value;
            } else if (slider.id === 'feedback') {
                this.nodes.feedbackGain.gain.value = slider.value;
            }
        }
        this.updateOutputs();
    }

    /**
     * Set filter frequency based on (y) axis value
     */
    setFilterFrequency(y) {
        // min 40Hz
        let min = 40;
        // max half of the sampling rate
        let max = this.myAudioContext.sampleRate / 2;
        // Logarithm (base 2) to compute how many octaves fall in the range.
        let numberOfOctaves = Math.log(max / min) / Math.LN2;
        // Compute a multiplier from 0 to 1 based on an exponential scale.
        let multiplier = Math.pow(2, numberOfOctaves * (((2 / this.surface.clientHeight) * (this.surface.clientHeight - y)) - 1.0));
        // Get back to the frequency value between min and max.
        this.nodes.filter.frequency.value = max * multiplier;
    }

    filterChange(option) {
        let value = option.value || option.target.value;
        let id = option.id || option.target.id;

        if (id === 'filter-type') {
            if (this.isSafari) {
                this.nodes.filter.type = this.filters.get(value);
            } else {
                this.nodes.filter.type = value;
            }
        }
    }

    animateSpectrum() {
        // Limit canvas redraw to 40 fps
        setTimeout(this.onTick.bind(this), 1000 / 40);
    }

    onTick() {
        this.drawSpectrum();
        requestAnimationFrame(this.animateSpectrum.bind(this), this.canvas);
    }

    /**
     * Draw the canvas frequency data graph
     */
    drawSpectrum() {
        let ctx = this.canvas.getContext('2d');
        let canvasSize = this.isSmallViewport ? 256 : 512;
        let multiplier = this.isSmallViewport ? 1 : 2;
        let width = canvasSize;
        let height = canvasSize;
        let barWidth = this.isSmallViewport ? 10 : 20;
        let freqByteData;
        let barCount;

        this.canvas.width = canvasSize - 10;
        this.canvas.height = canvasSize - 10;

        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#1d1c25';

        freqByteData = new Uint8Array(this.myAudioAnalyser.frequencyBinCount);
        this.myAudioAnalyser.getByteFrequencyData(freqByteData);
        barCount = Math.round(width / barWidth);

        for (let i = 0; i < barCount; i += 1) {
            let magnitude = freqByteData[i];
            // some values need adjusting to fit on the canvas
            ctx.fillRect(barWidth * i, height, barWidth - 1, -magnitude * multiplier);
        }
    }
}

window.addEventListener('DOMContentLoaded', function() {

    var wavepad = new Wavepad({
        'waveform': 'square',
        'filter': 'lowpass'
    });

    wavepad.init();
}, true);
