/* Habitual Service Worker */

const CACHE_NAME = 'habitual-v1.27.1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './sync.html',
  './styles.css',
  './fonts.css',
  './app.js',
  './manifest.json',
  './favicon.svg',
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

// Fetch Event - Cache First with Background Cache Replacement (Stale-While-Revalidate)
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Background fetch promise to update the cache asynchronously
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.ok && (networkResponse.type === 'basic' || networkResponse.type === 'cors')) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch((err) => {
          console.debug('[Service Worker] Background revalidation fetch failed:', err);
          return cachedResponse;
        });

      if (cachedResponse) {
        // Cache First: Immediately return cached version to user, and extend event lifetime for background update
        event.waitUntil(fetchPromise);
        return cachedResponse;
      }

      // If not in cache, fallback to network fetch
      return fetchPromise;
    })
  );
});
