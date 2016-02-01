import Wavepad from './wavepad';

window.addEventListener('DOMContentLoaded', () => {

    var app = new Wavepad('wave-pd1');
    app.init();

    if (!navigator.serviceWorker) {
        return;
    }

    function trackInstalling(worker) {
        console.log('Service Worker update installing...');
        worker.addEventListener('statechange', function() {
            if (worker.state === 'installed') {
                updateReady();
            }
        });
    }

    function updateReady() {
        console.log('New Service Worker is ready!');
    }

    navigator.serviceWorker.register('sw.js', {
        scope: './'
    }).then(function(reg) {
        console.log('Service Worker registered!');

        if (!navigator.serviceWorker.controller) {
            return;
        }

        if (reg.waiting) {
            updateReady();
            return;
        }

        if (reg.installing) {
            trackInstalling(reg.installing);
            return;
        }

        reg.addEventListener('updatefound', function() {
            trackInstalling(reg.installing);
        });

    }).catch(function(err) {
        console.log('Service Worker registration failed! ', err);
    });
});
