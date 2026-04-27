// Service Worker básico para PWA Lebrel.
// Usa Network-First para que los desarrolladores vean los cambios al instante.

self.addEventListener('install', (e) => {
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(clients.claim());
});

self.addEventListener('fetch', (e) => {
    // Siempre intentamos descargar de la red primero (ideal para desarrollo continuo)
    e.respondWith(
        fetch(e.request).catch(() => {
            return caches.match(e.request);
        })
    );
});
