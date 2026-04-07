// ══════════════════════════════════════════════════════════════════════════
// SERVICE WORKER - Offline Support & Caching
// ══════════════════════════════════════════════════════════════════════════

const SW_SCOPE_PATH = new URL(self.registration.scope).pathname.toLowerCase();
const SW_SCOPE = /(^|\/)dev(\/|$)/.test(SW_SCOPE_PATH) ? 'dev' : 'release';
const CACHE_NAME = `poke-tcg-${SW_SCOPE}-v12`;
const RUNTIME_CACHE = `poke-tcg-runtime-${SW_SCOPE}-v12`;
const IMAGE_CACHE = `poke-tcg-images-${SW_SCOPE}-v12`;

const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/main.css',
  './css/trading-marketplace.css',
  './assets/branding/logo-veras-pokemon.jpg',
  './js/app.js',
  './js/auth.js',
  './js/sheets-db.js',
  './js/pokemon-api.js',
  './js/cache.js',
  './js/config.js',
  './js/utils.js',
  './js/smart-engine.js',
  './js/collection-versioning.js',
  './js/command-palette.js',
  './js/enhanced-features.js',
  './js/ui-components.js',
  './js/advanced-tools.js',
  './js/social-features.js',
  './js/social-ui.js',
  './js/advanced-features.js',
  './js/community-features.js',
  './js/community-ui.js',
  './js/card-filters.js',
  './js/trading-system.js',
  './js/trading-ui.js',
  './js/realtime-sync.js'
];

// Install event: cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Some static assets could not be cached:', err);
        // Don't fail install if some files are missing
        return Promise.resolve();
      });
    })
  );
  self.skipWaiting();
});

// Activate event: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== RUNTIME_CACHE && name !== IMAGE_CACHE)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
  );
  self.clients.claim();
});

// Fetch event: serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-HTTP requests
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // Handle API requests
  if (request.method === 'GET') {
    // HTML/Navigations: network-first, damit neue index.html/app-Versionen sofort aktiv werden
    if (request.mode === 'navigate' || request.destination === 'document') {
      event.respondWith(
        fetch(request)
          .then((response) => {
            if (response && response.status === 200) {
              const responseToCache = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, responseToCache).catch((err) => {
                  console.warn('[SW] cache.put failed:', err);
                });
              });
            }
            return response;
          })
          .catch(() => caches.match(request))
      );
      return;
    }

    // Images: cache first, then network
    if (request.destination === 'image') {
      event.respondWith(
        caches.open(IMAGE_CACHE).then((cache) => {
          return cache.match(request).then((response) => {
            if (response) return response;

            return fetch(request).then((response) => {
              if (response && response.status === 200) {
                cache.put(request, response.clone());
              }
              return response;
            }).catch(() => {
              // Return placeholder for failed images
              return new Response(
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 280"><rect fill="#ccc" width="200" height="280"/><text x="100" y="140" text-anchor="middle" dominant-baseline="middle" font-size="18" fill="#999">No Image</text></svg>',
                {
                  headers: { 'Content-Type': 'image/svg+xml' }
                }
              );
            });
          });
        })
      );
      return;
    }

    // API calls: network first, then cache
    if (url.hostname !== location.hostname) {
      event.respondWith(
        fetch(request)
          .then((response) => {
            if (response && response.status === 200) {
              const responseToCache = response.clone();
              const cache_name = request.url.includes('api') ? RUNTIME_CACHE : CACHE_NAME;
              caches.open(cache_name).then((cache) => {
                cache.put(request, responseToCache).catch((err) => {
                  console.warn('[SW] cache.put failed:', err);
                });
              });
            }
            return response;
          })
          .catch(() => {
            // Try cache
            return caches.match(request).then((response) => {
              if (response) {
                console.log('[SW] Serving from cache:', request.url);
                return response;
              }

              // Return offline page
              return new Response(
                '<h1>Offline</h1><p>Diese Ressource ist nicht verfügbar im Offline-Modus.</p>',
                { headers: { 'Content-Type': 'text/html' } }
              );
            });
          })
      );
      return;
    }

    // JS/CSS: network-first to avoid stale app modules after deploys
    const isCodeAsset = request.destination === 'script'
      || request.destination === 'style'
      || url.pathname.endsWith('.js')
      || url.pathname.endsWith('.css');
    if (isCodeAsset) {
      event.respondWith(
        fetch(request)
          .then((response) => {
            if (response && response.status === 200) {
              const responseToCache = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, responseToCache).catch((err) => {
                  console.warn('[SW] cache.put failed:', err);
                });
              });
            }
            return response;
          })
          .catch(() => caches.match(request))
      );
      return;
    }

    // Static assets: cache first
    event.respondWith(
      caches.match(request).then((response) => {
        if (response) {
          console.log('[SW] Serving from cache:', request.url);
          return response;
        }

        return fetch(request).then((response) => {
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache).catch((err) => {
                console.warn('[SW] cache.put failed:', err);
              });
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // POST requests: always go to network
  event.respondWith(fetch(request));
});

// Handle messages from client
self.addEventListener('message', (event) => {
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data.type === 'CLEAR_CACHE') {
    caches.delete(RUNTIME_CACHE).then(() => {
      event.ports[0].postMessage({ success: true });
    });
  }
  if (event.data.type === 'CACHE_URLS') {
    const urls = event.data.urls;
    caches.open(IMAGE_CACHE).then((cache) => {
      cache.addAll(urls).catch(() => {
        // Some URLs might fail, that's ok
      });
    });
  }
});

// Background sync for failed operations
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-collection') {
    event.waitUntil(
      fetch('/api/sync', { method: 'POST' })
        .then(() => {
          // Notify clients about successful sync
          self.clients.matchAll().then((clients) => {
            clients.forEach((client) => {
              client.postMessage({
                type: 'sync-complete',
                success: true
              });
            });
          });
        })
        .catch(() => {
          // Retry sync later
          return Promise.reject();
        })
    );
  }
});

// Push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const options = {
    body: event.data.text(),
    icon: './assets/branding/logo-veras-pokemon.jpg',
    badge: './assets/branding/logo-veras-pokemon.jpg',
    tag: 'poke-notification',
    requireInteraction: false
  };

  event.waitUntil(
    self.registration.showNotification('Pokémon TCG Tracker', options)
  );
});

console.log('[SW] Service Worker loaded and ready');
