import rAF from './rAF';
import Wavepad from './wavepad';

window.addEventListener('DOMContentLoaded', () => {

    var app = new Wavepad({
        waveform: 'square',
        filter: 'lowpass',
        delay: 0.500,
        feedback: 0.4
    });

    app.init();
});
