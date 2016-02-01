import Wavepad from './wavepad';
import registerServiceWorker from './sw-bootstrap';

window.addEventListener('DOMContentLoaded', () => {

    var app = new Wavepad('wave-pd1');
    app.init();

    registerServiceWorker();
});
