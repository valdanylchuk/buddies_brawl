const CACHE_VERSION = 'v1.4';
const CACHE_NAME = `buddies-brawl-cache-${CACHE_VERSION}`;

const urlsToCache = [
  '/',
  'index.html',
  'style.css',
  'manifest.json',
  'ui.js',
  'ai.js',
  'decks.js',
  'eventBus.js',
  'gameState.js',
  'images/background.jpg',
  'images/base-001.png',
  'images/base-002.png',
  'images/base-003.png',
  'images/base-004.png',
  'images/base-005.png',
  'images/base-006.png',
  'images/base-007.png',
  'images/icon.png',
  'images/icon-192.png',
  'images/icon-512.png',
  'images/favicon.ico'
];

// --- LIFECYCLE EVENTS ---

// Install event: cache the application shell.
self.addEventListener('install', event => {
  console.log('[SW] Install event, caching app shell...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .catch(error => console.error('[SW] Failed to cache app shell:', error))
  );
});

// Activate event: This is the crucial part for updates.
// It cleans up old caches from previous versions.
self.addEventListener('activate', event => {
  console.log('[SW] Activate event');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(cacheName => {
            // Find all caches that belong to this app but are NOT our current version.
            return cacheName.startsWith('buddies-brawl-cache-') && cacheName !== CACHE_NAME;
          })
          .map(cacheName => {
            // Delete the old caches.
            console.log(`[SW] Deleting old cache: ${cacheName}`);
            return caches.delete(cacheName);
          })
      );
    }).then(() => {
      // Tell the active service worker to take control of the page immediately.
      return self.clients.claim();
    })
  );
});

// Fetch event: Serve from cache first (Cache-First strategy).
self.addEventListener('fetch', event => {
  // We only want to cache GET requests.
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // If the file is in the cache, return it.
        if (response) {
          return response;
        }
        // If it's not in the cache, fetch it from the network.
        // This allows for caching images/assets that are loaded lazily.
        return fetch(event.request).then(networkResponse => {
            // Optionally, you can cache these new requests as well,
            // but for a simple app, the initial cache is often enough.
            return networkResponse;
        });
      })
  );
});