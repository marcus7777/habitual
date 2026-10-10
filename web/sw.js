/* Habitual Service Worker */

const CACHE_NAME = 'habitual-v1.16.3';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './sync.html',
  './styles.css',
  './fonts.css',
  './app.js',
  './manifest.json',
  './favicon.svg',
  './icon-192.png',
  './icon-512.png',
  './js/colours.js',
  './js/state.js',
  './js/storage.js',
  './js/audio-sync.js',
  './js/render.js',
  './js/ui.js',
  './js/widgets.js',
  './widgets/add.html',
  './widgets/heatmaps.html',
  './widgets/settings.html',
  './widgets/heatmap-data.json',
  './widgets/heatmap-template.json',
  './widgets/quick-add-data.json',
  './widgets/quick-add-template.json',
  './lib/ggwave.js',
  './fonts/inter-latin.woff2',
  './fonts/jetbrains-mono-latin.woff2'
];

// Install Event - Pre-cache Static Assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching offline PWA assets & widgets');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event - Clean up stale caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Stale-While-Revalidate Strategy
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          return cachedResponse;
        });

      return cachedResponse || fetchPromise;
    })
  );
});
