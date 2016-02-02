/* globals self, caches */

var staticCacheName = 'wave-pd1-v10';

self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(staticCacheName).then(function(cache) {
            return cache.addAll([
                './',
                'index.html',
                'js/bundle.js',
                'css/styles.css',
                'favicon.ico',
                'images/iOS-144.png'
            ]);
        }).then(function() {
            return self.skipWaiting();
        })
    );
});

self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(cacheNames) {
            return Promise.all(
                cacheNames.filter(function(cacheName) {
                    return cacheName.startsWith('wave-pd1-') &&
                        cacheName != staticCacheName;
                    }).map(function(cacheName) {
                        return caches.delete(cacheName);
                    })
            );
        }).then(function() {
            self.clients.claim();
        })
    );
});

self.addEventListener('fetch', function(event) {
    event.respondWith(
        caches.match(event.request).then(function(response) {
            return response || fetch(event.request);
        })
    );
});
