function registerServiceWorker() {

    if (!navigator.serviceWorker) {
        return;
    }

    function trackInstalling(worker) {
        console.log('Service Worker: installing...');
        worker.addEventListener('statechange', () => {
            console.log('Service Worker: ', worker.state);
        });
    }

    navigator.serviceWorker.register('sw.js', {
        scope: './'
    }).then(reg => {
        console.log('Service Worker: registered');

        if (!navigator.serviceWorker.controller) {
            return;
        }

        if (reg.waiting) {
            console.log('Service Worker: installed');
            return;
        }

        if (reg.installing) {
            trackInstalling(reg.installing);
            return;
        }

        reg.addEventListener('updatefound', () => {
            trackInstalling(reg.installing);
        });

    }).catch(err => {
        console.log('Service Worker: registration failed ', err);
    });
}

export default registerServiceWorker;
