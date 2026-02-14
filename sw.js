const CACHE_NAME = 'ora-cache-v1';

// We do not cache local extension files in 'install' because:
// 1. They are already local in the extension package (fast access).
// 2. The Cache API 'addAll' often fails or throws errors with 'chrome-extension://' scheme.
// 3. It avoids data duplication.

self.addEventListener('install', (event) => {
    // Force immediate activation
    self.skipWaiting();
    console.log('[Service Worker] Installed');
});

self.addEventListener('activate', (event) => {
    // Claim clients immediately so the SW controls the page on first load
    event.waitUntil(clients.claim());
    
    // Clear old caches if any
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

    // Only cache HTTP/HTTPS requests (external resources like Unsplash images, fonts, etc.)
    // Do NOT try to cache chrome-extension:// resources
    if (requestUrl.protocol.startsWith('http')) {
        /* 
        // TEMPORARILY DISABLED: Runtime caching seems to be causing issues with Icons and Favicons.
        // Reverting to direct network fetch to ensure assets load correctly.
        event.respondWith(
            caches.match(event.request).then((response) => {
                if (response) {
                    return response;
                }
                
                // Clone the request because it's a stream
                const fetchRequest = event.request.clone();

                return fetch(fetchRequest).then((response) => {
                    // Check if we received a valid response
                    if (!response || response.status !== 200 || response.type !== 'basic' && response.type !== 'cors') {
                        return response;
                    }

                    // Clone the response because it's a stream
                    const responseToCache = response.clone();

                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });

                    return response;
                }).catch(() => {
                    // Start of offline fallback logic if needed
                });
            })
        );
        */
        return; // Let the browser handle the fetch normally
    }
    // For chrome-extension:// requests, let the browser handle them (from disk)
});
