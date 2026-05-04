const CACHE_NAME = 'lebrel-v26';
// Usa Network-First para que los desarrolladores vean los cambios al instante.

self.addEventListener('install', (e) => {
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    // Borrar cachés antiguas para forzar actualización
    e.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                return caches.delete(key);
            }));
        }).then(() => clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    // No interceptar peticiones POST ni llamadas a la API o OCR
    if (e.request.method !== 'GET' || e.request.url.includes('/api/') || e.request.url.includes('/ocr')) {
        return; // El navegador manejará la petición de forma nativa
    }

    // Siempre intentamos descargar de la red primero (ideal para desarrollo continuo)
    e.respondWith(
        fetch(e.request).catch(() => {
            return caches.match(e.request);
        })
    );
});
