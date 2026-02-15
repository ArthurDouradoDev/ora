const CACHE_NAME = 'ora-cache-v1';

// Only precache external assets if needed. 
// Local extension files are already fast and 'cache.addAll' often fails with chrome-extension:// scheme.
const PRECACHE_URLS = [
    // Add external static assets here if you want them to be available offline immediately
    // e.g. 'https://fonts.googleapis.com/...' (though usually better to cache on demand)
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    console.log('[Service Worker] Install');
    // Skip addAll if array is empty or implementation is risky for local files
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

self.addEventListener('fetch', (event) => {
    const requestUrl = new URL(event.request.url);

    // Filter: Only cache HTTP/HTTPS (External resources)
    // Ignore chrome-extension://, data:, etc.
    if (!requestUrl.protocol.startsWith('http')) {
        return; 
    }

    // Strategy: Stale-While-Revalidate for external static assets (Fonts, Icons, etc.)
    event.respondWith(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.match(event.request).then((cachedResponse) => {
                const fetchPromise = fetch(event.request).then((networkResponse) => {
                    // Check if we received a valid response
                    // Note: Chrome extensions have CORS limitations. 
                    // 'opaque' responses (status 0) from no-cors requests can be cached but limit JS access.
                    // For fonts/images it's usually fine.
                    if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
                         cache.put(event.request, networkResponse.clone());
                    }
                    return networkResponse;
                }).catch((err) => {
                    // Network failed
                    console.log('[SW] Network fetch failed for', event.request.url, err);
                    return cachedResponse; 
                });
                return cachedResponse || fetchPromise;
            });
        })
    );
});
