// Task B1: Preise aus api/v3/prices/<setId>.json (Spec §2.3, §5) - Set-Ansicht, Suche, Statistik,
// Tag-1/Tag-2-Frische ueber prices/meta.json generatedAt (?v=), offline, Produkt-ID-Abgleich.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  loadPriceStamp,
  loadSetPrices,
  getCardPrice,
  priceCardRef,
  resetV3PriceCaches,
  refreshV3Prices,
} from '../js/data/v3-prices.js';

const HREF = 'https://example.test/app/index.html';
const V3 = 'https://example.test/app/api/v3/';
const DAY1 = '2026-11-13T01:00:00.000Z';
const DAY2 = '2026-11-14T01:00:00.000Z';

function makeStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    store,
  };
}

function makeServer(files) {
  const server = { files, offline: false, calls: [] };
  server.fetchImpl = async (url) => {
    server.calls.push(url);
    if (server.offline) throw new TypeError('Failed to fetch');
    const path = new URL(url).pathname.replace('/app/api/v3/', '');
    const body = server.files[path];
    if (body === undefined) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(body)) };
  };
  return server;
}

function opts(server, storage = makeStorage()) {
  return { href: HREF, config: { APIS: {} }, fetchImpl: server.fetchImpl, storage };
}

const SV1_PRICES = {
  '1': { productId: 1001, trend: 1.5, avg30: 1.2, low: 0.5, trendHolo: 3 },
  '2': { productId: 1002, trend: 7 },
};

test.beforeEach(() => resetV3PriceCaches());

test('set view price from set file (Karten-ID = collectionKey, kanonische setId)', async () => {
  const server = makeServer({ 'prices/meta.json': { generatedAt: DAY1 }, 'prices/sv1.json': SV1_PRICES });
  const o = opts(server);

  const prices = await loadSetPrices('sv1', o);
  assert.ok(prices instanceof Map);
  assert.equal(prices.get('1').trend, 1.5);
  assert.ok(server.calls.includes(`${V3}prices/sv1.json?v=${encodeURIComponent(DAY1)}`), 'Preisdatei mit ?v=<generatedAt>');

  // v3-Kartenrecord (toCardRecord): setId, cardId (= v3-id), collectionKey, cardmarketProductId
  const card = { setId: 'sv1', cardId: 'sv1-1', collectionKey: '1', number: '001', cardmarketProductId: 1001 };
  const price = await getCardPrice(card, o);
  assert.equal(price.productId, 1001);
  assert.equal(price.trend, 1.5);
  assert.equal(price.trendHolo, 3);
  assert.equal(server.calls.filter((u) => u.includes('prices/sv1.json')).length, 1, 'Set-Datei nur einmal geladen');
});

test('priceCardRef: collectionKey vor v3-cardId, sonst cardId ohne Set-Praefix', () => {
  assert.deepEqual(priceCardRef({ setId: 'sv1', collectionKey: '15_A1', cardId: 'sv1-x' }), { setId: 'sv1', cardId: '15_A1' });
  assert.deepEqual(priceCardRef({ setId: 'TCGDEX-mee', cardId: 'TCGDEX-mee-1' }), { setId: 'TCGDEX-mee', cardId: '1' });
  assert.deepEqual(priceCardRef({ setId: '', collectionKey: '1' }), { setId: '', cardId: '1' });
  assert.deepEqual(priceCardRef({ collectionKey: '1' }, { setId: 'sv1' }), { setId: 'sv1', cardId: '1' }, 'setId-Fallback (aktuelles Set)');
});

test('search loads price files only for shown sets (je Set eine Datei, gesammelt)', async () => {
  const server = makeServer({
    'prices/meta.json': { generatedAt: DAY1 },
    'prices/sv1.json': SV1_PRICES,
    'prices/base1.json': { '4': { productId: 273699, trend: 300 } },
    'prices/sv2.json': { '1': { productId: 5, trend: 1 } },
  });
  const o = opts(server);
  // Suchtreffer aus dem Suchindex (search-index-prefilter): setId, collectionKey, cardmarketProductId aus `cm`
  const shown = [
    { setId: 'sv1', collectionKey: '1', cardmarketProductId: 1001 },
    { setId: 'sv1', collectionKey: '2', cardmarketProductId: 1002 },
    { setId: 'base1', collectionKey: '4', cardmarketProductId: 273699 },
  ];
  const results = await Promise.all(shown.map((card) => getCardPrice(card, o)));
  assert.deepEqual(results.map((p) => p?.trend), [1.5, 7, 300]);
  const priceFiles = server.calls.filter((u) => /prices\/(?!meta)/.test(u)).map((u) => new URL(u).pathname.split('/').pop());
  assert.deepEqual(priceFiles.sort(), ['base1.json', 'sv1.json'], 'nur Sets der angezeigten Treffer, je einmal');
  assert.equal(server.calls.filter((u) => u.includes('prices/meta.json')).length, 1, 'meta.json einmal je Sitzung');
});

test('stats price for db_cards record (v3-ID ueber attachV3CardmarketIds bzw. Sheet-URL)', async () => {
  const server = makeServer({ 'prices/meta.json': { generatedAt: DAY1 }, 'prices/sv1.json': SV1_PRICES });
  const o = opts(server);
  // Statistik-Kandidat: { ...dbCardsRecord, setId } - db_cards-Zeile mit collectionKey und angehaengter v3-ID
  const withV3Id = { setId: 'sv1', collectionKey: '2', number: '2', name: 'X', cardmarketProductId: '1002', vera_cardmarket_url: '' };
  assert.equal((await getCardPrice(withV3Id, o))?.trend, 7);
  // Ohne v3-ID: Produkt-ID aus der gespeicherten Sheet-URL (resolveCardmarketProductId)
  const withUrl = { setId: 'sv1', collectionKey: '2', vera_cardmarket_url: 'https://www.cardmarket.com/de/Pokemon/Products?idProduct=1002' };
  assert.equal((await getCardPrice(withUrl, o))?.trend, 7);
});

test('productId mismatch -> no price (kein falscher Preis)', async () => {
  const server = makeServer({ 'prices/meta.json': { generatedAt: DAY1 }, 'prices/sv1.json': SV1_PRICES });
  const o = opts(server);
  assert.equal(await getCardPrice({ setId: 'sv1', collectionKey: '1', cardmarketProductId: 9999 }, o), null);
  assert.equal(await getCardPrice({ setId: 'sv1', collectionKey: '1' }, o), null, 'ohne Produkt-ID kein Preis');
  assert.equal(await getCardPrice({ setId: 'sv1', collectionKey: '3', cardmarketProductId: 1003 }, o), null, 'Karte ohne Eintrag');
  assert.equal(await getCardPrice({ setId: 'nope', collectionKey: '1', cardmarketProductId: 1001 }, o), null, 'Set ohne Preisdatei (404)');
});

test('day-2 stamp fetches new file (neue Sitzung bzw. "Preise neu laden")', async () => {
  const server = makeServer({ 'prices/meta.json': { generatedAt: DAY1 }, 'prices/sv1.json': SV1_PRICES });
  const storage = makeStorage();
  const o = opts(server, storage);
  const card = { setId: 'sv1', collectionKey: '1', cardmarketProductId: 1001 };

  assert.equal(await loadPriceStamp(o), DAY1);
  assert.equal((await getCardPrice(card, o)).trend, 1.5);

  // Taeglicher Build
  server.files['prices/meta.json'] = { generatedAt: DAY2 };
  server.files['prices/sv1.json'] = { '1': { productId: 1001, trend: 2.5 } };

  // gleiche Sitzung: Stamp und Datei bleiben gemerkt
  assert.equal((await getCardPrice(card, o)).trend, 1.5);

  resetV3PriceCaches();
  assert.equal(await loadPriceStamp(o), DAY2);
  assert.equal((await getCardPrice(card, o)).trend, 2.5);
  assert.ok(server.calls.includes(`${V3}prices/sv1.json?v=${encodeURIComponent(DAY2)}`), 'Tag 2: neue URL');
  assert.equal(server.calls.filter((u) => u.includes('prices/meta.json')).length, 2);
});

test('offline uses cached (zuletzt gespeicherter Stamp)', async () => {
  const server = makeServer({ 'prices/meta.json': { generatedAt: DAY1 }, 'prices/sv1.json': SV1_PRICES });
  const storage = makeStorage();
  const o = opts(server, storage);
  assert.equal(await loadPriceStamp(o), DAY1);

  resetV3PriceCaches();
  server.offline = true;
  assert.equal(await loadPriceStamp(o), DAY1, 'offline: gespeicherter Stamp');
  // Offline-Datei kommt ueber den Service Worker; hier: Abruf scheitert -> Fehler, Promise wird nicht gemerkt
  await assert.rejects(loadSetPrices('sv1', o));
  server.offline = false;
  const prices = await loadSetPrices('sv1', o);
  assert.equal(prices.get('1').trend, 1.5, 'nach Fehler erneuter Versuch');
  assert.ok(server.calls.includes(`${V3}prices/sv1.json?v=${encodeURIComponent(DAY1)}`), 'gleiche URL wie gecacht (SW-Schluessel)');
});

test('meta.json wird ohne HTTP-Cache abgefragt', async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, init });
    return { ok: true, status: 200, json: async () => ({ generatedAt: DAY1 }) };
  };
  await loadPriceStamp({ href: HREF, config: { APIS: {} }, fetchImpl, storage: makeStorage() });
  assert.equal(seen[0].url, `${V3}prices/meta.json`);
  assert.equal(seen[0].init?.cache, 'no-store');
});

test('"Preise neu laden": refreshV3Prices leert Preis-Caches und liest meta.json neu', async () => {
  const server = makeServer({ 'prices/meta.json': { generatedAt: DAY1 }, 'prices/sv1.json': SV1_PRICES });
  const o = opts(server);
  const card = { setId: 'sv1', collectionKey: '1', cardmarketProductId: 1001 };
  assert.equal((await getCardPrice(card, o)).trend, 1.5);

  const same = await refreshV3Prices(o);
  assert.deepEqual(same, { changed: false, previousStamp: DAY1, currentStamp: DAY1 });

  server.files['prices/meta.json'] = { generatedAt: DAY2 };
  server.files['prices/sv1.json'] = { '1': { productId: 1001, trend: 2.5 } };
  const changed = await refreshV3Prices(o);
  assert.deepEqual(changed, { changed: true, previousStamp: DAY1, currentStamp: DAY2 });
  assert.equal((await getCardPrice(card, o)).trend, 2.5);
});

test('setId in anderer Schreibweise: Preisdatei unter der kanonischen v3-setId (sets.json)', async () => {
  const server = makeServer({
    'prices/meta.json': { generatedAt: DAY1 },
    'prices/TCGDEX-mee.json': { '1': { productId: 77, trend: 0.2 } },
    'sets.json': [{ id: 'TCGDEX-mee' }, { id: 'sv1' }],
  });
  const o = opts(server);
  const price = await getCardPrice({ setId: 'tcgdex-MEE', collectionKey: '1', cardmarketProductId: 77 }, o);
  assert.equal(price?.trend, 0.2);
  assert.ok(server.calls.some((u) => u.includes('/prices/TCGDEX-mee.json?v=')));
  // gleiche Datei fuer beide Schreibweisen nur einmal
  await getCardPrice({ setId: 'TCGDEX-mee', collectionKey: '1', cardmarketProductId: 77 }, o);
  assert.equal(server.calls.filter((u) => u.includes('/prices/TCGDEX-mee.json')).length, 1);
});

test('ohne sets.json (offline/Fehler): setId unveraendert', async () => {
  const server = makeServer({ 'prices/meta.json': { generatedAt: DAY1 }, 'prices/sv1.json': SV1_PRICES });
  const o = opts(server);
  assert.equal((await getCardPrice({ setId: 'sv1', collectionKey: '1', cardmarketProductId: 1001 }, o))?.trend, 1.5);
});
