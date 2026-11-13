// Task 8c: Cardmarket im Frontend - v3-Produkt-IDs bevorzugen, korrekte Links, tagesfrische Preise.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveCardmarketProductId,
  resolveCardmarketLink,
  buildCardmarketProductUrl,
} from '../js/data/cardmarket-url-utils.js';
import { resolveDisplayCard } from '../js/data/schema-contract.js';
import { indexEntryToCard } from '../js/features/search/search-index-prefilter.js';
import {
  resolveCardmarketEntryForCard,
  loadCardmarketSetPayload,
  resetCardmarketDataCaches,
  setCardmarketDataVersion,
} from '../js/data/cardmarket-data.js';

const SEARCH_URL = 'https://www.cardmarket.com/de/Pokemon/Products/Search?searchMode=v2&searchString=SVI+12';
const legacyUrl = (id) => `https://www.cardmarket.com/de/Pokemon/Products?idProduct=${id}`;

// ── 1. Aufloesungsreihenfolge ────────────────────────────────────────────
test('resolveCardmarketProductId: v3-Feld > Legacy-URL mit idProduct > Matcher > nichts', () => {
  assert.deepEqual(
    resolveCardmarketProductId({ cardmarketProductId: 111, vera_cardmarket_url: legacyUrl(222) }, { matchedEntry: { cardmarketProductId: 333 } }),
    { productId: '111', source: 'v3' }
  );
  assert.deepEqual(
    resolveCardmarketProductId({ vera_cardmarket_url: legacyUrl(222) }, { matchedEntry: { cardmarketProductId: 333 } }),
    { productId: '222', source: 'url' }
  );
  assert.deepEqual(
    resolveCardmarketProductId({ cardmarketUrl: SEARCH_URL }, { matchedEntry: { cardmarketProductId: 333 } }),
    { productId: '333', source: 'matcher' }
  );
  assert.deepEqual(resolveCardmarketProductId({ cardmarketUrl: SEARCH_URL }), { productId: '', source: '' });
  assert.deepEqual(resolveCardmarketProductId({ cardmarketProductId: 'abc' }), { productId: '', source: '' });
});

// ── 2. Links ──────────────────────────────────────────────────────────────
test('resolveCardmarketLink: Produkt-URL in Kartensprache, nie Such-URL wenn eine ID existiert', () => {
  assert.equal(
    resolveCardmarketLink({ cardmarketProductId: 111, cardmarketUrl: SEARCH_URL }, { language: 'en' }),
    'https://www.cardmarket.com/en/Pokemon/Products?idProduct=111'
  );
  // Legacy-URL (de) wird auf die Kartensprache umgeschrieben
  assert.equal(
    resolveCardmarketLink({ vera_cardmarket_url: legacyUrl(222) }, { language: 'en' }),
    'https://www.cardmarket.com/en/Pokemon/Products?idProduct=222'
  );
  // Matcher-Treffer ersetzt die Such-URL
  assert.equal(
    resolveCardmarketLink({ cardmarketUrl: SEARCH_URL }, { language: 'de', matchedEntry: { cardmarketProductId: 333 } }),
    legacyUrl(333)
  );
  // ohne ID: Such-URL als letzter Ausweg
  assert.equal(resolveCardmarketLink({ cardmarketUrl: SEARCH_URL }, { language: 'de' }), SEARCH_URL);
  assert.equal(resolveCardmarketLink({}, { language: 'de' }), '');
  assert.equal(buildCardmarketProductUrl(5, { language: 'en' }), 'https://www.cardmarket.com/en/Pokemon/Products?idProduct=5');
});

test('resolveDisplayCard: v3-ID schlaegt gespeicherte Such-URL', () => {
  const display = resolveDisplayCard({ setId: 'x', number: '1', cardmarketProductId: 4711, vera_cardmarket_url: SEARCH_URL });
  assert.equal(display.cardmarketUrl, legacyUrl(4711)); // Standardsprache de
});

test('Suche: Indexeintrag mit cm traegt Produkt-ID und Link in Kartensprache', () => {
  const entry = { cardId: 'sv1-1', setId: 'sv1', number: '1', name: 'Pineco', nameDe: 'Tannza', cm: 702306 };
  const en = indexEntryToCard(entry, { language: 'en' });
  assert.equal(en.cardmarketProductId, 702306);
  assert.equal(en.cardmarketUrl, 'https://www.cardmarket.com/en/Pokemon/Products?idProduct=702306');
  assert.equal(indexEntryToCard(entry, { language: 'de' }).cardmarketUrl, legacyUrl(702306));
  const none = indexEntryToCard({ cardId: 'a-1', setId: 'a', number: '1', name: 'X' }, { language: 'de' });
  assert.equal(none.cardmarketProductId, undefined);
  assert.equal(none.cardmarketUrl, undefined);
});

// ── Preisaufloesung ueber die v3-ID ───────────────────────────────────────
const CM_BASE = 'https://veraatversus.github.io/pokemon-tcg-data/cardmarket';

function installFetch(routes) {
  const calls = [];
  globalThis.fetch = async (url) => {
    const text = String(url);
    calls.push(text);
    const path = text.replace(CM_BASE, '').split('?')[0];
    if (!(path in routes)) return new Response('nope', { status: 404 });
    return new Response(JSON.stringify(typeof routes[path] === 'function' ? routes[path](text) : routes[path]), { status: 200 });
  };
  return calls;
}

const SET_PAYLOAD = {
  expansionId: 9,
  cards: [
    // Der Namens-/Nummern-Matcher wuerde diesen Eintrag waehlen (gleicher Name, gleiche Nummer) ...
    { cardmarketProductId: 500, name: 'Pikachu', collectorNumber: '25', prices: { trend: 1 } },
    // ... die v3-ID zeigt aber auf dieses Produkt.
    { cardmarketProductId: 501, name: 'Pikachu [Stamp]', collectorNumber: '25', prices: { trend: 9 } },
  ],
};

test('resolveCardmarketEntryForCard: v3-ID gewinnt gegen den Matcher (Tracker -> Set-Payload, ohne products.json)', async () => {
  resetCardmarketDataCaches();
  setCardmarketDataVersion('2026-11-12T03:00:00.000Z');
  const calls = installFetch({
    '/index/tracker.json': { bySetId: { sv1: 9 }, byPtcgoCode: {}, bySetName: {} },
    '/index/names.json': {},
    '/index/products.json': { 500: { expansionId: 9 }, 501: { expansionId: 9 } },
    '/sets/9.json': SET_PAYLOAD,
  });
  const card = { setId: 'sv1', number: '25', name: 'Pikachu', vera_name: 'Pikachu', cardmarketProductId: 501 };
  const entry = await resolveCardmarketEntryForCard(card, { cards: [card], currentSetId: 'sv1' });
  assert.equal(entry?.cardmarketProductId, 501);
  assert.ok(!calls.some((u) => u.includes('/index/products.json')), 'products.json (4 MB) wird nicht geladen');
});

test('resolveCardmarketEntryForCard: v3-ID ohne Preisdaten -> null statt Matcher-Treffer', async () => {
  resetCardmarketDataCaches();
  setCardmarketDataVersion('2026-11-12T03:00:00.000Z');
  installFetch({
    '/index/tracker.json': { bySetId: { sv1: 9 }, byPtcgoCode: {}, bySetName: {} },
    '/index/names.json': {},
    '/index/products.json': {},
    '/sets/9.json': SET_PAYLOAD,
  });
  const card = { setId: 'sv1', number: '25', name: 'Pikachu', vera_name: 'Pikachu', cardmarketProductId: 999 };
  assert.equal(await resolveCardmarketEntryForCard(card, { cards: [card], currentSetId: 'sv1' }), null);
});

test('resolveCardmarketEntryForCard: Legacy-URL-ID vor dem Matcher', async () => {
  resetCardmarketDataCaches();
  setCardmarketDataVersion('2026-11-12T03:00:00.000Z');
  installFetch({
    '/index/tracker.json': { bySetId: { sv1: 9 }, byPtcgoCode: {}, bySetName: {} },
    '/index/names.json': {},
    '/index/products.json': { 501: { expansionId: 9 } },
    '/sets/9.json': SET_PAYLOAD,
  });
  const card = { setId: 'sv1', number: '25', name: 'Pikachu', vera_name: 'Pikachu', vera_cardmarket_url: legacyUrl(501) };
  const entry = await resolveCardmarketEntryForCard(card, { cards: [card], currentSetId: 'sv1' });
  assert.equal(entry?.cardmarketProductId, 501);
});

// ── 3. Frische: Build-Stamp als Cache-Buster ─────────────────────────────
test('Cardmarket-Daten-URLs tragen den Build-Stamp (?v=), neuer Stamp -> neue URL', async () => {
  resetCardmarketDataCaches();
  setCardmarketDataVersion('2026-11-11T03:00:00.000Z');
  const calls = installFetch({ '/sets/9.json': SET_PAYLOAD });
  await loadCardmarketSetPayload(9);
  resetCardmarketDataCaches();
  setCardmarketDataVersion('2026-11-12T03:00:00.000Z');
  await loadCardmarketSetPayload(9);
  assert.deepEqual(calls, [
    `${CM_BASE}/sets/9.json?v=${encodeURIComponent('2026-11-11T03:00:00.000Z')}`,
    `${CM_BASE}/sets/9.json?v=${encodeURIComponent('2026-11-12T03:00:00.000Z')}`,
  ]);
});

test('ohne gesetzten Stamp wird meta.json einmal gelesen und als ?v= verwendet', async () => {
  resetCardmarketDataCaches();
  const calls = installFetch({
    '/meta.json': { generatedAt: '2026-11-12T03:00:00.000Z' },
    '/sets/9.json': SET_PAYLOAD,
  });
  await loadCardmarketSetPayload(9);
  await loadCardmarketSetPayload(10).catch(() => {});
  assert.equal(calls.filter((u) => u.includes('/meta.json')).length, 1);
  assert.ok(calls.includes(`${CM_BASE}/sets/9.json?v=${encodeURIComponent('2026-11-12T03:00:00.000Z')}`), calls.join('\n'));
});
