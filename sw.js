const CACHE_NAME = 'cancionero-cache-v1';
// Lista de archivos y librerías que la app necesita para funcionar
const urlsToCache = [
  './',
  './index.html',
  './script.js',
  './style.css',
  'https://unpkg.com/lucide@latest',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js'
];

// Instalación: Guarda los archivos en el caché
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

// Estrategia: Primero busca en caché, si no hay, va a internet
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
