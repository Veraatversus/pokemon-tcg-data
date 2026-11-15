// Preisdaten (api/v3/prices) im Service Worker - meta.json network-first, Daten mit ?v=<Stamp>
// cache-first, alte Stamps werden entfernt. Simuliert Tag 1 -> Tag 2.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = readFileSync(fileURLToPath(new URL('../service-worker.js', import.meta.url)), 'utf8');
const start = src.indexOf('// --- prices-data ---');
const end = src.indexOf('// --- /prices-data ---');
assert.ok(start >= 0 && end > start, 'Cardmarket-Block in service-worker.js gefunden');
const block = src.slice(start, end);

function fakeCache() {
  const map = new Map();
  const strip = (u) => u.split('?')[0];
  return {
    map,
    async match(req, opts = {}) {
      const url = typeof req === 'string' ? req : req.url;
      if (map.has(url)) return map.get(url).clone();
      if (opts.ignoreSearch) {
        for (const [k, v] of map) if (strip(k) === strip(url)) return v.clone();
      }
      return undefined;
    },
    async put(req, res) { map.set(typeof req === 'string' ? req : req.url, res); },
    async keys() { return [...map.keys()].map((url) => new Request(url)); },
    async delete(req) { return map.delete(typeof req === 'string' ? req : req.url); },
  };
}

function makeSw(server) {
  const cache = fakeCache();
  const caches = { open: async () => cache };
  const network = [];
  const fetchImpl = async (req) => {
    network.push(req.url);
    if (server.offline) throw new TypeError('offline');
    const path = new URL(req.url).pathname;
    const body = server.files[path];
    return body === undefined ? new Response('', { status: 404 }) : new Response(JSON.stringify(body), { status: 200 });
  };
  const api = new Function('caches', 'fetch', 'RUNTIME_CACHE', `${block}; return { handlePricesRequest, isPricesDataPath };`)(caches, fetchImpl, 'rt');
  return { ...api, cache, network };
}

const ORIGIN = 'https://veraatversus.github.io/pokemon-tcg-data';
const META = `${ORIGIN}/api/v3/prices/meta.json`;
const setUrl = (stamp) => `${ORIGIN}/api/v3/prices/sv1.json?v=${encodeURIComponent(stamp)}`;
const DAY1 = '2026-11-11T03:00:00.000Z';
const DAY2 = '2026-11-12T03:00:00.000Z';

async function json(res) { return JSON.parse(await res.text()); }

test('Tag 1 -> Tag 2: meta.json immer aus dem Netz, Preisdatei mit neuem Stamp aus dem Netz', async () => {
  const server = {
    offline: false,
    files: {
      '/pokemon-tcg-data/api/v3/prices/meta.json': { generatedAt: DAY1 },
      '/pokemon-tcg-data/api/v3/prices/sv1.json': { cards: [{ cardmarketProductId: 1, prices: { trend: 1 } }] },
    },
  };
  const sw = makeSw(server);

  // Tag 1
  assert.equal((await json(await sw.handlePricesRequest(new Request(META)))).generatedAt, DAY1);
  assert.equal((await json(await sw.handlePricesRequest(new Request(setUrl(DAY1))))).cards[0].prices.trend, 1);
  await sw.handlePricesRequest(new Request(setUrl(DAY1)));
  assert.equal(sw.network.filter((u) => u === setUrl(DAY1)).length, 1, 'Tag 1: zweiter Abruf aus dem Cache');

  // Taeglicher Build
  server.files['/pokemon-tcg-data/api/v3/prices/meta.json'] = { generatedAt: DAY2 };
  server.files['/pokemon-tcg-data/api/v3/prices/sv1.json'] = { cards: [{ cardmarketProductId: 1, prices: { trend: 2 } }] };

  // Tag 2, erster Start
  assert.equal((await json(await sw.handlePricesRequest(new Request(META)))).generatedAt, DAY2, 'meta.json nicht aus dem Cache');
  const day2 = await json(await sw.handlePricesRequest(new Request(setUrl(DAY2))));
  assert.equal(day2.cards[0].prices.trend, 2, 'neue Tagespreise');
  assert.ok(sw.network.includes(setUrl(DAY2)), 'Preisdatei an Tag 2 aus dem Netz');
  assert.equal(sw.network.filter((u) => u === META).length, 2);
  assert.ok(!sw.cache.map.has(setUrl(DAY1)), 'alter Stamp entfernt');
  assert.ok(sw.cache.map.has(setUrl(DAY2)));
});

test('offline: meta.json und Preisdatei aus dem Cache (auch ohne passenden Stamp)', async () => {
  const server = {
    offline: false,
    files: {
      '/pokemon-tcg-data/api/v3/prices/meta.json': { generatedAt: DAY1 },
      '/pokemon-tcg-data/api/v3/prices/sv1.json': { cards: [] },
    },
  };
  const sw = makeSw(server);
  await sw.handlePricesRequest(new Request(META));
  await sw.handlePricesRequest(new Request(setUrl(DAY1)));
  server.offline = true;
  assert.equal((await json(await sw.handlePricesRequest(new Request(META)))).generatedAt, DAY1);
  assert.equal((await sw.handlePricesRequest(new Request(setUrl(DAY1)))).status, 200);
  assert.equal((await sw.handlePricesRequest(new Request(`${ORIGIN}/api/v3/prices/sv1.json`))).status, 200, 'ohne ?v -> Fallback auf gecachte Kopie');
});

test('aelterer Stamp (alter Tab) loescht den neueren nicht', async () => {
  const server = { offline: false, files: { '/pokemon-tcg-data/api/v3/prices/sv1.json': { cards: [] } } };
  const sw = makeSw(server);
  await sw.handlePricesRequest(new Request(setUrl(DAY2)));
  await sw.handlePricesRequest(new Request(setUrl(DAY1)));
  assert.ok(sw.cache.map.has(setUrl(DAY2)));
});

test('Routing: nur api/v3/prices-JSON; Altpfad /cardmarket/ wird nicht mehr behandelt', () => {
  const sw = makeSw({ files: {} });
  assert.equal(sw.isPricesDataPath('/pokemon-tcg-data/api/v3/prices/sv1.json'), true);
  assert.equal(sw.isPricesDataPath('/dev/api/v3/prices/meta.json'), true);
  assert.equal(sw.isPricesDataPath('/dev/api/v3/cards/sv1.json'), false);
  assert.equal(sw.isPricesDataPath('/pokemon-tcg-data/cardmarket/sets/9.json'), false);
  assert.equal(sw.isPricesDataPath('/51/SVI/1/1.jpg'), false);
  assert.ok(!src.includes('purgeCardmarketFromCache'));
});

test('Debug-Ausgaben/CM_FETCH entfernt', () => {
  assert.ok(!src.includes('CM_FETCH'));
  assert.ok(!src.includes("console.log('[SW] cardmarket fetch"));
});


