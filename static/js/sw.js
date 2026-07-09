const CACHE_NAME = 'sysvista-cache-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/static/css/style.css',
  '/static/js/dashboard.js',
  '/static/icons/icon-192.png',
  '/static/icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js'
];

// Install Event - Pre-cache assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching offline shell and CDNs');
      // Using cache.addAll with individual catch to avoid failure if one fails
      const cachePromises = ASSETS_TO_CACHE.map((asset) => {
        return cache.add(asset).catch((err) => {
          console.error(`[Service Worker] Failed to cache: ${asset}`, err);
        });
      });
      return Promise.all(cachePromises);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event - Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Clearing old cache', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Serve cached assets when offline
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Dynamic metrics endpoints must not be cached (always network-only)
  if (event.request.method !== 'GET' || url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Stale-While-Revalidate pattern for HTML and static assets
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch((err) => {
        console.log('[Service Worker] Fetch failed, returning cache if available. Error:', err);
      });

      return cachedResponse || fetchPromise;
    })
  );
});
