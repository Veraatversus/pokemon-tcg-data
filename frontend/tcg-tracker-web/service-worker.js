// ══════════════════════════════════════════════════════════════════════════
// SERVICE WORKER - Offline Support & Caching
// ══════════════════════════════════════════════════════════════════════════

const SW_SCOPE_PATH = new URL(self.registration.scope).pathname.toLowerCase();
const SW_SCOPE = /(^|\/)dev(\/|$)/.test(SW_SCOPE_PATH) ? 'dev' : 'release';
const CACHE_NAME = `poke-tcg-${SW_SCOPE}-v60`;
const RUNTIME_CACHE = `poke-tcg-runtime-${SW_SCOPE}-v60`;
const IMAGE_CACHE = `poke-tcg-images-${SW_SCOPE}-v60`;

// api/v3 + api/registry JSON in the runtime cache: keep at most API_CACHE_MAX_ENTRIES
// non-pinned entries (card files); oldest-inserted are evicted first (cache.keys() is insertion-ordered).
const API_CACHE_MAX_ENTRIES = 60;
const API_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const API_PINNED_RE = /\/api\/(v3\/(sets|meta|search-index)\.json|registry\/sets\.json)$/;
const API_ENTRY_RE = /\/api\/(v3|registry)\//;
// Preisdateien (api/v3/prices) laufen ueber handleCardmarketRequest (Stamp-Bereinigung) und zaehlen hier nicht mit.
const API_PRICES_RE = /\/api\/v3\/prices\//;

async function trimApiCache(cache) {
  const keys = await cache.keys();
  const apiKeys = keys.filter((req) => {
    const { pathname } = new URL(req.url);
    return API_ENTRY_RE.test(pathname) && !API_PRICES_RE.test(pathname);
  });
  const evictable = apiKeys.filter((req) => !API_PINNED_RE.test(new URL(req.url).pathname));
  const excess = apiKeys.length - API_CACHE_MAX_ENTRIES;
  for (let i = 0; i < excess && i < evictable.length; i += 1) {
    await cache.delete(evictable[i]);
  }
}

// Serialisiert: parallele puts zaehlen sonst jeweils vor den anderen und lassen den Cache ueber der Grenze.
let apiTrimQueue = Promise.resolve();
function enqueueApiTrim(cache) {
  const run = apiTrimQueue.then(() => trimApiCache(cache));
  apiTrimQueue = run.catch(() => {});
  return run;
}

// Freshness decision for cached API responses (pure; unit-tested in tests/service-worker-api-cache.test.mjs).
function isFresh(fetchedAtMs, nowMs, maxAgeMs) {
  if (!Number.isFinite(fetchedAtMs) || !Number.isFinite(nowMs)) return false;
  const age = nowMs - fetchedAtMs;
  return age >= 0 && age < maxAgeMs;
}

async function handleApiRequest(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  if (cached && isFresh(Number(cached.headers.get('x-sw-fetched-at')), Date.now(), API_MAX_AGE_MS)) {
    return cached;
  }
  try {
    const response = await fetch(request, { cache: 'no-cache' });
    if (response && response.status === 200) {
      const headers = new Headers(response.headers);
      headers.set('x-sw-fetched-at', String(Date.now()));
      const stored = new Response(await response.clone().blob(), {
        status: response.status,
        statusText: response.statusText,
        headers
      });
      try {
        await cache.put(request, stored);
        await enqueueApiTrim(cache);
      } catch (err) {
        console.warn('[SW] cache.put failed:', err);
      }
    }
    return response;
  } catch (err) {
    return cached || Response.error();
  }
}

// --- cardmarket-data ---
// Preisdaten api/v3/prices/*.json (js/data/v3-prices.js) werden taeglich
// neu gebaut; meta.json.generatedAt ist der Stamp. Die App haengt ihn als ?v=<stamp> an
// jede Daten-URL.
//  - meta.json und Daten ohne ?v: Netz zuerst (no-store), offline -> gecachte Kopie.
//  - Daten mit ?v: cache-first (der Stamp steckt im Schluessel). Ein neuer Stamp ist eine neue URL und
//    kommt daher beim ersten Laden nach dem Build aus dem Netz; danach werden aeltere Stamps entfernt.
// Unit-getestet in tests/service-worker-cardmarket.test.mjs.
const CARDMARKET_DATA_RE = /\/api\/v3\/prices\/[^/]+\.json$/;
const CARDMARKET_META_RE = /\/api\/v3\/prices\/meta\.json$/;

function isCardmarketDataPath(pathname) {
  return CARDMARKET_DATA_RE.test(String(pathname || ''));
}

function stampTime(stamp) {
  const time = Date.parse(stamp);
  return Number.isFinite(time) ? time : -Infinity;
}

// Entfernt Dateneintraege mit aelterem (oder ohne) Stamp; meta.json bleibt.
async function pruneCardmarketStamps(cache, keepStamp) {
  const keepTime = stampTime(keepStamp);
  const keys = await cache.keys();
  for (const req of keys) {
    const url = new URL(req.url);
    if (!isCardmarketDataPath(url.pathname) || CARDMARKET_META_RE.test(url.pathname)) continue;
    const stamp = url.searchParams.get('v') || '';
    if (stamp !== keepStamp && stampTime(stamp) < keepTime) await cache.delete(req);
  }
}

async function handleCardmarketRequest(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const url = new URL(request.url);
  const stamp = url.searchParams.get('v') || '';
  const versioned = Boolean(stamp) && !CARDMARKET_META_RE.test(url.pathname);
  if (versioned) {
    const cached = await cache.match(request);
    if (cached) return cached;
  }
  try {
    const response = versioned ? await fetch(request) : await fetch(request, { cache: 'no-store' });
    if (response && response.status === 200) {
      try {
        await cache.put(request, response.clone());
        if (versioned) await pruneCardmarketStamps(cache, stamp);
      } catch (err) {
        console.warn('[SW] cache.put failed:', err);
      }
    }
    return response;
  } catch (err) {
    return (await cache.match(request))
      || (await cache.match(request, { ignoreSearch: true }))
      || Response.error();
  }
}
// --- /cardmarket-data ---

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

// Images: cache first, then network. Netzwerkfehler (DNS, Host down, Reset) als Response.error(),
// damit das <img> ein error-Event bekommt und die Fallback-Kette (js/ui/image-fallback.js)
// zum naechsten Kandidaten weiterrueckt. Echte Antworten (auch 404) gehen unveraendert durch.
function handleImageRequest(request) {
  return caches.open(IMAGE_CACHE).then((cache) => cache.match(request).then((cached) => {
    if (cached) return cached;
    return fetch(request).then((response) => {
      if (response && response.status === 200) {
        cache.put(request, response.clone());
      }
      return response;
    }).catch(() => Response.error());
  }));
}

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

    // Preisdaten (api/v3/prices, auch vom VERA_BASE-Host): Stamp-basierte Frische,
    // siehe handleCardmarketRequest. Steht vor der api/v3-Route (24-h-Cache).
    if (request.destination !== 'image' && isCardmarketDataPath(url.pathname)) {
      event.respondWith(handleCardmarketRequest(request));
      return;
    }

    // Images: cache first, then network
    if (request.destination === 'image') {
      event.respondWith(handleImageRequest(request));
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

    // Same-origin API data (api/v3, api/registry): changes at most once a day, so cache-first
    // with a 24 h freshness window (fetch time stored in x-sw-fetched-at); stale copy = offline fallback.
    if (API_ENTRY_RE.test(url.pathname)) {
      event.respondWith(handleApiRequest(request));
      return;
    }

    // JS/CSS: network-first to avoid stale app modules after deploys
    const isCodeAsset = request.destination === 'script'
      || request.destination === 'style'
      || url.pathname.endsWith('.js')
      || url.pathname.endsWith('.css');
    if (isCodeAsset) {
      event.respondWith(
        fetch(request, { cache: 'no-cache' })
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
