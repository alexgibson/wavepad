class Wavepad {

    constructor(id, options) {

        // default options
        this.options = {
            waveform: 'square',
            filter: 'lowpass',
            delay: 0.500,
            feedback: 0.4,
            barColor: '#1d1c25'
        };

        // set configurable options
        if (typeof options === 'object') {
            for (let i in options) {
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

        if ('AudioContext' in window) {
            this.myAudioContext = new AudioContext();
        } else {
            throw new Error('wavepad.js: browser does not support Web Audio API');
        }

        if (typeof id !== 'string' && typeof id !== 'object') {
            throw new Error('wavepad.js: first argument must be a valid DOM identifier');
        }

        // UI DOM references
        this.synth = typeof id === 'object' ? id : document.getElementById(id);
        this.surface = this.synth.querySelector('.surface');
        this.finger = this.synth.querySelector('.finger');
        this.waveform = this.synth.querySelector('#waveform');
        this.filter = this.synth.querySelector('#filter-type');
        this.powerToggle = this.synth.querySelector('#power');
        this.delayTimeInput = this.synth.querySelector('#delay');
        this.feedbackGainInput = this.synth.querySelector('#feedback');
        this.delayTimeOutput = this.synth.querySelector('#delay-output');
        this.feedbackGainOutput = this.synth.querySelector('#feedback-output');

        // Canvas graph for audio frequency analyzer
        this.canvas = this.synth.querySelector('canvas');
        this.ctx = this.canvas.getContext('2d');

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
        this.powerToggle.addEventListener('click', this.togglePower.bind(this));
        this.waveform.addEventListener('change', this.setWaveform.bind(this));
        this.filter.addEventListener('change', this.filterChange.bind(this));
        this.delayTimeInput.addEventListener('input', this.delayChange.bind(this));
        this.feedbackGainInput.addEventListener('input', this.feedbackChange.bind(this));

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
        this.surface.addEventListener('touchmove', e => {
            e.preventDefault();
        });
    }

    handleResize() {
        // set default canvas size
        this.isSmallViewport = window.matchMedia('(max-width: 512px)').matches ? true : false;
        this.setCanvasSize();

        // listen for resize events
        window.matchMedia('(max-width: 512px)').addListener(mql => {
            if (mql.matches) {
                this.isSmallViewport = true;
            } else {
                this.isSmallViewport = false;
            }
            this.setCanvasSize();
        });
    }

    routeSounds() {
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
        this.surface.removeEventListener('touchstart', this.playHandler);
    }

    togglePower() {
        if (this.isPlaying) {
            this.stopOsc();
            this.myAudioAnalyser.disconnect();
            this.unbindSurfaceEvents();
        } else {
            this.routeSounds();
            this.startOsc();
            this.bindSurfaceEvents();
        }

        this.synth.classList.toggle('off');
    }

    play(e) {
        let x = e.type === 'touchstart' ? e.touches[0].pageX : e.pageX;
        let y = e.type === 'touchstart' ? e.touches[0].pageY : e.pageY;
        const multiplier = this.isSmallViewport ? 2 : 1;

        if (e.type === 'touchstart') {
            this.hasTouch = true;
        } else if (e.type === 'mousedown' && this.hasTouch) {
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

        this.finger.style.webkitTransform = this.finger.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        this.finger.classList.add('active');

        this.surface.addEventListener('touchmove', this.moveHandler);
        this.surface.addEventListener('touchend', this.stopHandler);
        this.surface.addEventListener('touchcancel', this.stopHandler);
        this.surface.addEventListener('mousemove', this.moveHandler);
        this.surface.addEventListener('mouseup', this.stopHandler);
    }

    move(e) {
        let x = e.type === 'touchmove' ? e.touches[0].pageX : e.pageX;
        let y = e.type === 'touchmove' ? e.touches[0].pageY : e.pageY;

        if (e.type === 'mousemove' && this.hasTouch) {
            return;
        }

        if (this.isPlaying) {
            const multiplier = this.isSmallViewport ? 2 : 1;
            x = x - this.surface.offsetLeft;
            y = y - this.surface.offsetTop;
            this.source.frequency.value = x * multiplier;
            this.nodes.filter.frequency.value = this.setFilterFrequency(y);
        }

        this.finger.style.webkitTransform = this.finger.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    }

    stop(e) {
        let x = e.type === 'touchend' ? e.changedTouches[0].pageX : e.pageX;
        let y = e.type === 'touchend' ? e.changedTouches[0].pageY : e.pageY;

        if (this.isPlaying) {
            const multiplier = this.isSmallViewport ? 2 : 1;
            x = x - this.surface.offsetLeft;
            y = y - this.surface.offsetTop;
            this.source.frequency.value = x * multiplier;
            this.nodes.filter.frequency.value = this.setFilterFrequency(y);
            this.nodes.oscVolume.gain.value = 0;
        }

        this.finger.classList.remove('active');

        this.surface.removeEventListener('mousemove', this.moveHandler);
        this.surface.removeEventListener('mouseup', this.stopHandler);
        this.surface.removeEventListener('touchmove', this.moveHandler);
        this.surface.removeEventListener('touchend', this.stopHandler);
        this.surface.removeEventListener('touchcancel', this.stopHandler);
    }

    updateOutputs() {
        this.delayTimeOutput.value = Math.round(this.delayTimeInput.value * 1000) + ' ms';
        this.feedbackGainOutput.value = Math.round(this.feedbackGainInput.value * 10);
    }

    setWaveform(option) {
        const value = option.value || option.target.value;
        this.source.type = this.isSafari ? this.waves.get(value) : value;
    }

    delayChange(e) {
        this.options.delay = e.target.value;
        if (this.isPlaying) {
            this.stopOsc();
            this.nodes.delay.delayTime.value = this.options.delay;
        }
        this.updateOutputs();
    }

    feedbackChange(e) {
        this.options.feedback = e.target.value;
        if (this.isPlaying) {
            this.stopOsc();
            this.nodes.feedbackGain.gain.value = this.options.feedback;
        }
        this.updateOutputs();
    }

    /**
     * Set filter frequency based on (y) axis value
     */
    setFilterFrequency(y) {
        // min 40Hz
        const min = 40;
        // max half of the sampling rate
        const max = this.myAudioContext.sampleRate / 2;
        // Logarithm (base 2) to compute how many octaves fall in the range.
        const numberOfOctaves = Math.log(max / min) / Math.LN2;
        // Compute a multiplier from 0 to 1 based on an exponential scale.
        const multiplier = Math.pow(2, numberOfOctaves * (((2 / this.surface.clientHeight) * (this.surface.clientHeight - y)) - 1.0));
        // Get back to the frequency value between min and max.
        return max * multiplier;
    }

    filterChange(option) {
        const value = option.value || option.target.value;
        this.nodes.filter.type = this.isSafari ? this.filters.get(value) : value;
    }

    animateSpectrum() {
        // Limit canvas redraw to 40 fps
        setTimeout(this.onTick.bind(this), 1000 / 40);
    }

    onTick() {
        this.drawSpectrum();
        requestAnimationFrame(this.animateSpectrum.bind(this), this.canvas);
    }

    setCanvasSize() {
        const canvasSize = this.isSmallViewport ? 256 : 512;
        this.canvas.width = this.canvas.height = canvasSize - 10;
        // set canvas graph color
        this.ctx.fillStyle = this.options.barColor;
    }

    /**
     * Draw the canvas frequency data graph
     */
    drawSpectrum() {
        const canvasSize = this.isSmallViewport ? 256 : 512;
        const barWidth = this.isSmallViewport ? 10 : 20;
        const barCount = Math.round(canvasSize / barWidth);
        const freqByteData = new Uint8Array(this.myAudioAnalyser.frequencyBinCount);

        this.ctx.clearRect(0, 0, canvasSize, canvasSize);

        this.myAudioAnalyser.getByteFrequencyData(freqByteData);

        for (let i = 0; i < barCount; i += 1) {
            const magnitude = freqByteData[i];
            const multiplier = this.isSmallViewport ? 1 : 2;
            // some values need adjusting to fit on the canvas
            this.ctx.fillRect(barWidth * i, canvasSize, barWidth - 1, -magnitude * multiplier);
        }
    }
}

export default Wavepad;
