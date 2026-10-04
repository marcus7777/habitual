/* Habitual Service Worker with PWA Widgets Support */

const CACHE_NAME = 'habitual-v11';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './favicon.svg',
  './icon-192.png',
  './icon-512.png',
  './please.js',
  './js/widgets.js',
  './widgets/quick-add-template.json',
  './widgets/quick-add-data.json',
  './widgets/heatmap-template.json',
  './widgets/heatmap-data.json',
  './fonts/inter-cyrillic-ext.woff2',
  './fonts/inter-cyrillic.woff2',
  './fonts/inter-greek-ext.woff2',
  './fonts/inter-greek.woff2',
  './fonts/inter-vietnamese.woff2',
  './fonts/inter-latin-ext.woff2',
  './fonts/inter-latin.woff2',
  './fonts/jetbrains-mono-cyrillic-ext.woff2',
  './fonts/jetbrains-mono-cyrillic.woff2',
  './fonts/jetbrains-mono-greek.woff2',
  './fonts/jetbrains-mono-vietnamese.woff2',
  './fonts/jetbrains-mono-latin-ext.woff2',
  './fonts/jetbrains-mono-latin.woff2',
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

// --- PWA WIDGET LIFECYCLE EVENT HANDLERS ---

// Widget Install Event
self.addEventListener('widgetinstall', (event) => {
  console.log('[PWA Widget] Widget installed:', event.widget ? event.widget.tag : 'unknown');
  event.waitUntil(
    (async () => {
      if (event.widget && typeof event.widget.updateByTag === 'function') {
        const tag = event.widget.tag;
        if (tag === 'habitual-quick-add') {
          await event.widget.updateByTag('habitual-quick-add', {
            template: './widgets/quick-add-template.json',
            data: './widgets/quick-add-data.json'
          });
        } else if (tag === 'habitual-heatmap') {
          await event.widget.updateByTag('habitual-heatmap', {
            template: './widgets/heatmap-template.json',
            data: './widgets/heatmap-data.json'
          });
        }
      }
    })()
  );
});

// Widget Uninstall Event
self.addEventListener('widgetuninstall', (event) => {
  console.log('[PWA Widget] Widget uninstalled:', event.widget ? event.widget.tag : 'unknown');
});

// Widget Resume Event
self.addEventListener('widgetresume', (event) => {
  console.log('[PWA Widget] Widget resumed:', event.widget ? event.widget.tag : 'unknown');
});

// Widget Click Action Event
self.addEventListener('widgetclick', (event) => {
  console.log('[PWA Widget] Widget action clicked:', event.action, event.data);
  const actionData = event.data || {};
  const verb = actionData.verb || event.action;
  const habitId = actionData.habitId;

  event.waitUntil(
    (async () => {
      // Broadcast widget click event to all open client windows
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clientList) {
        client.postMessage({
          type: 'WIDGET_ACTION',
          verb: verb,
          habitId: habitId,
          data: actionData
        });
      }

      // If no clients open or open action requested, open/focus client window
      let targetUrl = './index.html';
      if (verb === 'quick-add' && habitId) {
        targetUrl = `./index.html?action=quick-log&habitId=${encodeURIComponent(habitId)}`;
      } else if (verb === 'view-heatmap' && habitId) {
        targetUrl = `./index.html?action=heatmaps&habitId=${encodeURIComponent(habitId)}`;
      } else if (verb === 'open-app') {
        targetUrl = './index.html';
      }

      if (clientList.length > 0) {
        const client = clientList[0];
        if (typeof client.focus === 'function') await client.focus();
        if (typeof client.navigate === 'function' && targetUrl !== './index.html') {
          await client.navigate(targetUrl);
        }
      } else if (typeof self.clients.openWindow === 'function') {
        await self.clients.openWindow(targetUrl);
      }
    })()
  );
});
