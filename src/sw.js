/* globals self, caches */

'use strict';

const version = 'v1';
const staticCachePrefix = 'wave-pd1-static-';
const staticCacheName = staticCachePrefix + version;

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(staticCacheName).then(cache => {
            return cache.addAll([
                './',
                'index.html',
                'js/bundle.js',
                'css/styles.css',
                'favicon.ico',
                'images/iOS-144.png'
            ]);
        }).then(() => {
            return self.skipWaiting();
        })
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.filter(cacheName => {
                    return cacheName.startsWith(staticCachePrefix) && cacheName !== staticCacheName;
                }).map(cacheName => {
                    return caches.delete(cacheName);
                })
            );
        }).then(() => {
            self.clients.claim();
        })
    );
});

self.addEventListener('fetch', event => {

    let request = event.request;
    let url = new URL(request.url);

    // only deal with requests on the same domain.
    if (url.origin !== location.origin) {
        return;
    }

    // for non-GET requests, go to the network
    if (request.method !== 'GET') {
        event.respondWith(fetch(request));
        return;
    }

    // for everything else look to the cahce first,
    // then fall back to the network.
    event.respondWith(
        caches.match(request).then(response => {
            return response || fetch(request);
        })
    );
});
