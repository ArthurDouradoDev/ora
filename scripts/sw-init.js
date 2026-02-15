if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(registration => {
                console.log('[ServiceWorker] Registered with scope:', registration.scope);
            })
            .catch(error => {
                console.log('[ServiceWorker] Registration failed:', error);
            });
    });
}
