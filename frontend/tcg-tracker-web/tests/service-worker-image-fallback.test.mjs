// Bild-Requests im Service Worker: Netzwerkfehler muessen als Fehler beim <img> ankommen,
// damit die Fallback-Kette (js/ui/image-fallback.js) zum naechsten Kandidaten weiterruecken kann.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// service-worker.js ist kein Modul: handleImageRequest wird aus dem Quelltext extrahiert.
const src = readFileSync(fileURLToPath(new URL('../service-worker.js', import.meta.url)), 'utf8');
const m = src.match(/function handleImageRequest\([^)]*\) \{[\s\S]*?\r?\n\}/);
assert.ok(m, 'handleImageRequest in service-worker.js gefunden');

const ERROR_RESPONSE = { type: 'error', status: 0 };
function load({ cached = null, fetchImpl }) {
  const puts = [];
  const cache = { match: async () => cached, put: async (req, res) => puts.push([req, res]) };
  const caches = { open: async () => cache };
  const FakeResponse = { error: () => ERROR_RESPONSE };
  const fn = new Function('caches', 'fetch', 'Response', 'IMAGE_CACHE', `${m[0]}; return handleImageRequest;`)(
    caches, fetchImpl, FakeResponse, 'img-cache'
  );
  return { fn, puts };
}

test('SW-Bild: Netzwerkfehler -> Response.error() statt Platzhalter-SVG', async () => {
  const { fn, puts } = load({ fetchImpl: async () => { throw new TypeError('Failed to fetch'); } });
  const res = await fn({ url: 'https://assets.tcgdex.net/de/x/logo.webp' });
  assert.equal(res, ERROR_RESPONSE);
  assert.equal(puts.length, 0);
});

test('SW-Bild: 404 wird unveraendert durchgereicht und nicht gecacht', async () => {
  const notFound = { status: 404, clone() { return this; } };
  const { fn, puts } = load({ fetchImpl: async () => notFound });
  assert.equal(await fn({ url: 'x' }), notFound);
  assert.equal(puts.length, 0);
});

test('SW-Bild: 200 wird gecacht, Cache-Treffer direkt geliefert', async () => {
  const ok = { status: 200, clone() { return { ...this, cloned: true }; } };
  const { fn, puts } = load({ fetchImpl: async () => ok });
  assert.equal(await fn({ url: 'x' }), ok);
  assert.equal(puts.length, 1);

  const hit = { status: 200, fromCache: true };
  const cachedRun = load({ cached: hit, fetchImpl: async () => { throw new Error('darf nicht laufen'); } });
  assert.equal(await cachedRun.fn({ url: 'x' }), hit);
});

test('SW-Cache-Version ist v59 (alte Bild-Platzhalter werden verworfen)', () => {
  assert.match(src, /poke-tcg-images-\$\{SW_SCOPE\}-v59/);
  assert.doesNotMatch(src, /-v58`/);
});
