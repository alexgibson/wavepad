import rAF from './rAF';
import Wavepad from './wavepad';

window.addEventListener('DOMContentLoaded', () => {

    var app = new Wavepad('wave-pd1');

    app.init();
});
