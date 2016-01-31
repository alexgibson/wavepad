import Wavepad from './wavepad';

window.addEventListener('DOMContentLoaded', () => {

    var app = new Wavepad('wave-pd1');

    app.init();

    if (!navigator.serviceWorker) {
        return;
    }

    navigator.serviceWorker.register('sw.js', {
        scope: './'
    }).then(function() {
        console.log('Registration worked!');
    }).catch(function(err) {
        console.log('Registration failed! ', err);
    });
});
