import rAF from './rAF';
import Wavepad from './wavepad';

window.addEventListener('DOMContentLoaded', () => {

    var app = new Wavepad({
        'waveform': 'square',
        'filter': 'lowpass'
    });

    app.init();
});
