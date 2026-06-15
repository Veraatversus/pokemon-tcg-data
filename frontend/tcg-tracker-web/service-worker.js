// ══════════════════════════════════════════════════════════════════════════
// SERVICE WORKER - Offline Support & Caching
// ══════════════════════════════════════════════════════════════════════════

const SW_SCOPE_PATH = new URL(self.registration.scope).pathname.toLowerCase();
const SW_SCOPE = /(^|\/)dev(\/|$)/.test(SW_SCOPE_PATH) ? 'dev' : 'release';
const CACHE_NAME = `poke-tcg-${SW_SCOPE}-v55`;
const RUNTIME_CACHE = `poke-tcg-runtime-${SW_SCOPE}-v55`;
const IMAGE_CACHE = `poke-tcg-images-${SW_SCOPE}-v55`;

const SW_DEBUG = false;

function swDebug(...args) {
  if (!SW_DEBUG) return;
  console.log(...args);
}

const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './assets/branding/logo-veras-pokemon.jpg',
  './index-landingpage.html',
  './privacy.html',
  './kontakt.html'
];

// Install event: cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      swDebug('[SW] Caching static assets');
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
            swDebug('[SW] Deleting old cache:', name);
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
  if (request.url.includes('cardmarket')) {
    console.log('[SW] cardmarket fetch:', request.destination, request.url.slice(0, 80));
    event.waitUntil((async () => {
      const clients = await self.clients.matchAll();
      clients.forEach(c => c.postMessage({ type: 'CM_FETCH', url: request.url, destination: request.destination }));
    })());
  }
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
                swDebug('[SW] Serving from cache:', request.url);
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
          swDebug('[SW] Serving from cache:', request.url);
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
    const cacheTargets = [RUNTIME_CACHE, CACHE_NAME, IMAGE_CACHE];
    Promise.allSettled(cacheTargets.map((name) => caches.delete(name)))
      .then((results) => {
        const cleared = [];
        const failed = [];
        results.forEach((result, index) => {
          const name = cacheTargets[index];
          if (result.status === 'fulfilled' && result.value === true) {
            cleared.push(name);
          } else if (result.status === 'rejected') {
            failed.push(name);
          }
        });

        const replyPort = event.ports && event.ports[0];
        if (replyPort) {
          replyPort.postMessage({
            success: failed.length === 0,
            cleared,
            failed,
            reason: failed.length ? 'partial-clear-failed' : null,
          });
        }
      })
      .catch(() => {
        const replyPort = event.ports && event.ports[0];
        if (replyPort) {
          replyPort.postMessage({ success: false, cleared: [], failed: cacheTargets, reason: 'clear-cache-error' });
        }
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

swDebug('[SW] Service Worker loaded and ready');
