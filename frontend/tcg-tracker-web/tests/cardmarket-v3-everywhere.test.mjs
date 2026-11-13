// Task 8d: v3-Cardmarket-IDs gewinnen auf jedem Pfad (db_cards-Records, Watchlist-Links, Matcher, Set-Zuordnung).
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  attachV3CardmarketIds,
  resolveCardmarketProductId,
  resolveItemCardmarketUrl,
} from '../js/data/cardmarket-url-utils.js';
import {
  buildV3CardmarketIdMap,
  buildV3ExpansionIdMap,
  withV3CardmarketIds,
  getV3CardmarketExpansionId,
  getV3CardmarketIdMap,
} from '../js/data/v3-cardmarket-ids.js';
import {
  buildSetCardAssignmentMap,
  inferCardmarketExpansionIdFromCards,
  promoteCardmarketUrlsForCards,
  normalizeCardNameKey,
  normalizeCardmarketProductNameKey,
} from '../js/data/cardmarket-ui-helpers.js';
import {
  resolveCardmarketEntryForCard,
  resolveCardmarketEntryByProductId,
  resetCardmarketDataCaches,
  setCardmarketDataVersion,
} from '../js/data/cardmarket-data.js';
import { resolveDisplayCard } from '../js/data/schema-contract.js';
import { toCardRecord } from '../js/data/v3-records.js';

const productUrl = (id, lang = 'de') => `https://www.cardmarket.com/${lang}/Pokemon/Products?idProduct=${id}`;

// Ausschnitt aus api/v3/search-index.json (me55)
const INDEX = [
  { setId: 'me55', cardId: '48', number: '48', name: 'Pikachu', cm: 907655 },
  { setId: 'me55', cardId: '150', number: '150', name: 'Pikachu ex', cm: 907757 },
  { setId: 'me55', cardId: '151', number: '151', name: 'Ohne CM' },
  { setId: 'cel25c', cardId: '15_A', number: '15', name: 'Venusaur', cm: 555 },
];

// db_cards-Zeile so, wie readDbCardsForSet sie liefert: keine setId, collectionKey + cardId, die
// gespeicherte URL stammt vom alten Namens-Matcher (me55-150 -> 907655 = "Pikachu [Store Up]").
function dbCardsRecord({ cardId, collectionKey, number, name, storedId }) {
  const record = resolveDisplayCard({
    cardId,
    number,
    vera_number: number,
    vera_name: name,
    vera_cardmarket_url: productUrl(storedId),
  });
  return { ...record, collectionKey };
}

// ── 1. Anreicherung ───────────────────────────────────────────────────────
test('me55-150 (db_cards, gespeicherte URL 907655) -> v3-ID 907757; me55-48 -> 907655', () => {
  const stale150 = dbCardsRecord({ cardId: 'me55-150', collectionKey: '150', number: '150', name: 'Pikachu ex', storedId: 907655 });
  const record48 = dbCardsRecord({ cardId: 'me55-48', collectionKey: '48', number: '48', name: 'Pikachu', storedId: 907655 });
  assert.equal(stale150.cardmarketUrl, productUrl(907655), 'Ausgangslage: gespeicherte URL gewinnt ohne v3-ID');

  const [card150, card48] = attachV3CardmarketIds([stale150, record48], buildV3CardmarketIdMap(INDEX), { setId: 'me55', language: 'de' });
  assert.deepEqual(resolveCardmarketProductId(card150), { productId: '907757', source: 'v3' });
  assert.equal(card150.cardmarketUrl, productUrl(907757));
  assert.equal(card150.vera_cardmarket_url, productUrl(907655), 'Sheet-Wert bleibt unangetastet (kein Schreiben)');
  assert.deepEqual(resolveCardmarketProductId(card48), { productId: '907655', source: 'v3' });
  assert.equal(card48.cardmarketUrl, productUrl(907655));
});

test('attachV3CardmarketIds: Kartensprache, Lookup ueber die v3-cardId, unbekannte Karten unveraendert', () => {
  const map = buildV3CardmarketIdMap(INDEX);
  const cel = { cardId: 'cel25c-15_A', collectionKey: '15', number: '15', vera_cardmarket_url: productUrl(1) };
  const unknown = { cardId: 'me55-151', collectionKey: '151', number: '151', cardmarketUrl: productUrl(2) };
  const [celOut, unknownOut] = attachV3CardmarketIds([cel, unknown], map, { setId: 'cel25', language: 'en' });
  assert.equal(celOut.cardmarketProductId, 555);
  assert.equal(celOut.cardmarketUrl, productUrl(555, 'en'));
  assert.equal(unknownOut, unknown);
  // eigene setId am Record schlaegt die uebergebene
  const [own] = attachV3CardmarketIds([{ setId: 'ME55', collectionKey: '150' }], map, { setId: 'other' });
  assert.equal(own.cardmarketProductId, 907757);
  // eine bereits vorhandene v3-ID (aus der v3-Kartendatei) bleibt
  const [kept] = attachV3CardmarketIds([{ setId: 'me55', collectionKey: '150', cardmarketProductId: 42 }], map);
  assert.equal(kept.cardmarketProductId, 42);
});

test('withV3CardmarketIds: laedt den Index ueber den Loader; Fehler -> Records unveraendert', async () => {
  const records = [{ cardId: 'me55-150', collectionKey: '150', cardmarketUrl: productUrl(907655) }];
  const out = await withV3CardmarketIds(records, { setId: 'me55', language: 'de', loadIndex: async () => INDEX });
  assert.equal(out[0].cardmarketProductId, 907757);
  const failed = await withV3CardmarketIds(records, { setId: 'me55', loadIndex: async () => { throw new Error('offline'); } });
  assert.equal(failed, records);
});

// ── 2. Statistik/Watchlist-Link ───────────────────────────────────────────
test('Watchlist-Link: v3-ID statt gespeicherter URL, ?isReverseHolo=Y bleibt', () => {
  const stale150 = dbCardsRecord({ cardId: 'me55-150', collectionKey: '150', number: '150', name: 'Pikachu ex', storedId: 907655 });
  const [card150] = attachV3CardmarketIds([stale150], buildV3CardmarketIdMap(INDEX), { setId: 'me55' });
  assert.equal(
    resolveItemCardmarketUrl({ card: { ...card150, setId: 'me55' }, isReverseHolo: true }, { language: 'de' }),
    `${productUrl(907757)}&isReverseHolo=Y`
  );
  assert.equal(resolveItemCardmarketUrl({ card: card150, isReverseHolo: false }, { language: 'de' }), productUrl(907757));
  // Record mit v3-ID, aber veralteter cardmarketUrl (z. B. aus einem Zwischenstand): ID gewinnt
  assert.equal(
    resolveItemCardmarketUrl({ card: { cardmarketProductId: 907655, cardmarketUrl: productUrl(1) }, isReverseHolo: true }, { language: 'en' }),
    `${productUrl(907655, 'en')}&isReverseHolo=Y`
  );
  // ohne ID: bisherige Kette (gespeicherte URL), Such-URL ohne Suffix
  assert.equal(resolveItemCardmarketUrl({ card: { vera_cardmarket_url: productUrl(7) }, isReverseHolo: true }), `${productUrl(7)}&isReverseHolo=Y`);
  const search = 'https://www.cardmarket.com/de/Pokemon/Products/Search?searchString=x';
  assert.equal(resolveItemCardmarketUrl({ card: { cardmarketUrl: search }, isReverseHolo: true }), search);
  assert.equal(resolveItemCardmarketUrl(null), '');
});

// ── 3. Matcher ────────────────────────────────────────────────────────────
const entry = (id, name, extra = {}) => ({ cardmarketProductId: id, name, collectorNumber: null, ...extra });

test('Matcher: "Pikachu ex" trifft nie "Pikachu [Store Up]" (keine Teilstring-Treffer)', () => {
  const card = { number: '150', vera_name: 'Pikachu ex', tcgdex_name: 'Pikachu-ex' };
  assert.equal(buildSetCardAssignmentMap([card], { cards: [entry(907655, 'Pikachu [Store Up]')] }).get(card), undefined);
  const plain = { number: '48', vera_name: 'Pikachu' };
  assert.equal(buildSetCardAssignmentMap([plain], { cards: [entry(907757, 'Pikachu ex [Zip-Zap Frenzy | Thunder]')] }).get(plain), undefined);
  const both = buildSetCardAssignmentMap([card, plain], {
    cards: [entry(907655, 'Pikachu [Store Up]'), entry(907757, 'Pikachu ex [Zip-Zap Frenzy | Thunder]')],
  });
  assert.equal(both.get(card)?.cardmarketProductId, 907757);
  assert.equal(both.get(plain)?.cardmarketProductId, 907655);
});

test('Matcher: gleicher Name mehrfach ohne Sammlernummer -> kein Treffer statt Raten', () => {
  const card = { number: '150', vera_name: 'Pikachu ex' };
  const payload = { cards: [entry(907660, 'Pikachu ex [Pika-Pika Parade | Thunderbolt]'), entry(907757, 'Pikachu ex [Zip-Zap Frenzy | Thunder]')] };
  assert.equal(buildSetCardAssignmentMap([card], payload).get(card), undefined);
});

test('Matcher: Karten mit v3-ID belegen ihr Produkt zuerst, der Rest wird eindeutig', () => {
  const withV3 = { number: '53', vera_name: 'Pikachu ex', cardmarketProductId: 907660 };
  const without = { number: '150', vera_name: 'Pikachu ex' };
  const payload = { cards: [entry(907660, 'Pikachu ex [Pika-Pika Parade | Thunderbolt]'), entry(907757, 'Pikachu ex [Zip-Zap Frenzy | Thunder]')] };
  const map = buildSetCardAssignmentMap([without, withV3], payload);
  assert.equal(map.get(withV3)?.cardmarketProductId, 907660);
  assert.equal(map.get(without)?.cardmarketProductId, 907757);
});

test('Matcher: zwei Karten gleichen Namens, ein Produkt -> keine Zuordnung', () => {
  const a = { number: '1', vera_name: 'Professor Oak' };
  const b = { number: '2', vera_name: 'Professor Oak' };
  const map = buildSetCardAssignmentMap([a, b], { cards: [entry(1, 'Professor Oak')] });
  assert.equal(map.size, 0);
});

test('Matcher: Sammlernummer entscheidet, abweichende Nummer schliesst aus', () => {
  const card = { number: '25', vera_name: 'Pikachu' };
  const payload = { cards: [entry(1, 'Pikachu [Thunder]', { collectorNumber: '24' }), entry(2, 'Pikachu [Gnaw]', { collectorNumber: '025' })] };
  assert.equal(buildSetCardAssignmentMap([card], payload).get(card)?.cardmarketProductId, 2);
  const onlyOther = { cards: [entry(1, 'Pikachu [Thunder]', { collectorNumber: '24' })] };
  assert.equal(buildSetCardAssignmentMap([card], onlyOther).get(card), undefined);
});

test('Matcher-Namen: Suffixe bleiben, nur die Attacken-Klammer faellt weg', () => {
  const same = (cardName, productName) => normalizeCardNameKey(cardName) === normalizeCardmarketProductNameKey(productName);
  assert.ok(same('Pikachu ex', 'Pikachu ex [Zip-Zap Frenzy | Thunder]'));
  assert.ok(same('Pikachu-ex', 'Pikachu ex [Zip-Zap Frenzy | Thunder]'));
  assert.ok(!same('Pikachu ex', 'Pikachu [Store Up]'));
  for (const suffix of ['EX', 'GX', 'V', 'VMAX', 'VSTAR', 'Prime', 'LEGEND', 'BREAK']) {
    assert.ok(same(`Zoroark ${suffix}`, `Zoroark ${suffix} [Night Daze]`), suffix);
    assert.ok(!same('Zoroark', `Zoroark ${suffix} [Night Daze]`), `${suffix} darf nicht wegfallen`);
  }
  assert.ok(same('Radiant Greninja', 'Radiant Greninja [Moonlight Shuriken]'));
  assert.ok(!same('Greninja', 'Radiant Greninja [Moonlight Shuriken]'));
  assert.ok(same('M Venusaur-EX', 'MVenusaur EX [Crisis Vine]'));
  assert.ok(same('Mega Venusaur ex', 'Mega Venusaur ex [Jungle Dump]'));
  assert.ok(!same('Venusaur ex', 'Mega Venusaur ex [Jungle Dump]'));
  assert.ok(same('Umbreon ★', 'Umbreon Gold Star [Dark Ring]'));
  assert.ok(!same('Umbreon', 'Umbreon Gold Star [Dark Ring]'));
  assert.ok(same('Flygon δ', 'Flygon Delta Species [Sand Wall]'));
  assert.ok(same('Pikachu δ', 'Pikachu δ Delta Species [Thunder Wave | Iron Tail]'));
  assert.ok(same('Mystery Plate δ', 'Mystery Plate delta'));
  assert.ok(same('Giratina ◇', 'Giratina ◇ [Chaotic Star | Crisis Dive | Prism]'));
  assert.ok(same('Nidoran ♀', 'Nidoran [F] [Fury Swipes | Call for Family]'));
  assert.ok(!same('Nidoran ♂', 'Nidoran [F] [Fury Swipes | Call for Family]'));
  assert.ok(same('Nidoran ♀', 'Nidoran &female; [Call for Family | Scratch]'));
  assert.ok(same('Unown [J]', 'Unown [J] [Join | Hidden Power]'));
  assert.ok(same('Abomasnow', 'Abomasnow Lv.40 [Ice Shard]'));
  assert.ok(same('Dialga LV.X', 'Dialga LV.X [Time Skip]'));
  assert.ok(same('Grass Energy', 'Basic Grass Energy'));
});

// ── 4. Herkunft: Matcher-IDs sind nie v3 ─────────────────────────────────
test('promoteCardmarketUrlsForCards: Matcher-Treffer landet nicht in cardmarketProductId', async () => {
  const card = { setId: 'me55', number: '150', vera_name: 'Pikachu ex', cardmarketUrl: 'https://www.cardmarket.com/de/Pokemon/Products/Search?searchString=Pikachu' };
  const [promoted] = await promoteCardmarketUrlsForCards([card], { setPayload: { cards: [entry(907757, 'Pikachu ex [Zip-Zap Frenzy | Thunder]')] } });
  assert.equal(promoted.cardmarketProductId, undefined);
  assert.equal(promoted.cardmarketMatchedProductId, 907757);
  assert.deepEqual(resolveCardmarketProductId(promoted), { productId: '907757', source: 'url' });
  assert.notEqual(resolveCardmarketProductId({ cardmarketMatchedProductId: 907757 }).source, 'v3');
  assert.deepEqual(resolveCardmarketProductId({ cardmarketMatchedProductId: 907757 }), { productId: '907757', source: 'matcher' });
});

// ── 5. Set-Zuordnung: v3 ids.cardmarket zuerst ───────────────────────────
const V3_SETS = [
  { id: 'me55', aliases: ['TCGDEX-30th'], ids: { cardmarket: 6601, pokemontcg: 'me55' } },
  { id: 'sv1', ids: { cardmarket: [5001] } },
  { id: 'tcgp-A1', ids: {} },
];

test('buildV3ExpansionIdMap / getV3CardmarketExpansionId: Zahl oder Array, Aliase, Gross/Klein egal', async () => {
  const map = buildV3ExpansionIdMap(V3_SETS);
  assert.equal(map.get('me55'), '6601');
  assert.equal(map.get('tcgdex-30th'), '6601');
  assert.equal(map.get('sv1'), '5001');
  assert.equal(map.has('tcgp-a1'), false);
  assert.equal(await getV3CardmarketExpansionId('ME55', { loadSets: async () => V3_SETS }), '6601');
  assert.equal(await getV3CardmarketExpansionId('nope', { loadSets: async () => V3_SETS }), '');
  assert.equal(await getV3CardmarketExpansionId('me55', { loadSets: async () => { throw new Error('offline'); } }), '');
});

test('inferCardmarketExpansionIdFromCards: v3-Expansion schlaegt Tracker/URL-Abstimmung', () => {
  const cards = [{ setId: 'me55', vera_cardmarket_url: productUrl(1) }];
  const tracker = { bySetId: { me55: '1234' }, byPtcgoCode: {}, bySetName: {} };
  assert.equal(inferCardmarketExpansionIdFromCards(cards, { 1: { expansionId: 999 } }, { trackerSetIndex: tracker, v3ExpansionId: 6601 }), '6601');
  assert.equal(inferCardmarketExpansionIdFromCards(cards, {}, { trackerSetIndex: tracker }), '1234');
});

const CM_BASE = 'https://veraatversus.github.io/pokemon-tcg-data/cardmarket';
function installFetch(routes) {
  const calls = [];
  globalThis.fetch = async (url) => {
    const text = String(url);
    calls.push(text);
    const path = text.replace(CM_BASE, '').split('?')[0];
    if (!(path in routes)) return new Response('nope', { status: 404 });
    return new Response(JSON.stringify(routes[path]), { status: 200 });
  };
  return calls;
}

test('resolveCardmarketEntryForCard: Expansion aus v3 statt Tracker (Matcher fuer Karte ohne v3-ID)', async () => {
  resetCardmarketDataCaches();
  setCardmarketDataVersion('2026-11-13T03:00:00.000Z');
  installFetch({
    '/index/tracker.json': { bySetId: { me55: 1 }, byPtcgoCode: {}, bySetName: {} },
    '/index/names.json': {},
    '/index/products.json': {},
    '/sets/1.json': { expansionId: 1, cards: [entry(11, 'Pikachu ex [Wrong Set]')] },
    '/sets/6601.json': { expansionId: 6601, cards: [entry(907757, 'Pikachu ex [Zip-Zap Frenzy | Thunder]')] },
  });
  const card = { setId: 'me55', number: '150', vera_name: 'Pikachu ex' };
  const found = await resolveCardmarketEntryForCard(card, {
    cards: [card],
    currentSetId: 'me55',
    getV3ExpansionId: async (setId) => (setId === 'me55' ? '6601' : ''),
  });
  assert.equal(found?.cardmarketProductId, 907757);
});

test('resolveCardmarketEntryForCard: Preis zur v3-ID ueber die v3-Expansion (Tracker kennt das Set nicht)', async () => {
  resetCardmarketDataCaches();
  setCardmarketDataVersion('2026-11-13T03:00:00.000Z');
  const calls = installFetch({
    '/index/tracker.json': { bySetId: {}, byPtcgoCode: {}, bySetName: {} },
    '/sets/6601.json': { expansionId: 6601, cards: [entry(907757, 'Pikachu ex [Zip-Zap Frenzy | Thunder]', { prices: { trend: 48.86 } })] },
  });
  const card = { setId: 'me55', number: '150', vera_name: 'Pikachu ex', cardmarketProductId: 907757 };
  const found = await resolveCardmarketEntryForCard(card, { cards: [card], currentSetId: 'me55', getV3ExpansionId: async () => '6601' });
  assert.equal(found?.prices?.trend, 48.86);
  assert.ok(!calls.some((u) => u.includes('/index/products.json')));
});

// ── 6. Schreibpfad: toCardRecord traegt die v3-URL ───────────────────────
test('toCardRecord schreibt vera_cardmarket_url aus der v3-ID (me55-150)', () => {
  const record = toCardRecord({
    id: 'me55-150', cardId: '150', setId: 'me55', number: '150', name: 'Pikachu ex',
    ids: { cardmarket: [907757], pokemontcg: 'me55-150', tcgdex: '30th-150' },
    variants: [{ cardmarketId: 907757, type: 'holo' }],
  });
  assert.equal(record.vera_cardmarket_url, productUrl(907757));
  assert.equal(record.cardmarketProductId, 907757);
});

test('resolveCardmarketEntryForCard: v3-Expansion ohne Setdatei (z. B. tk1a ids.cardmarket 275771) -> Tracker-Fallback', async () => {
  resetCardmarketDataCaches();
  setCardmarketDataVersion('2026-11-13T03:00:00.000Z');
  installFetch({
    '/index/tracker.json': { bySetId: { tk1a: 77 }, byPtcgoCode: {}, bySetName: {} },
    '/index/names.json': {},
    '/index/products.json': {},
    '/sets/77.json': { expansionId: 77, cards: [entry(5, 'Pikachu [Thunder Jolt]')] },
  });
  const card = { setId: 'tk1a', number: '1', vera_name: 'Pikachu' };
  const found = await resolveCardmarketEntryForCard(card, { cards: [card], currentSetId: 'tk1a', getV3ExpansionId: async () => '275771' });
  assert.equal(found?.cardmarketProductId, 5);
});

test('getV3CardmarketIdMap: Fehlschlag wird 60 s negativ gecacht (kein erneutes Laden je Set)', async () => {
  let calls = 0;
  let clock = 1_000;
  const loadIndex = async () => { calls += 1; throw new Error('offline'); };
  const opts = { loadIndex, now: () => clock };
  assert.equal((await getV3CardmarketIdMap(opts)).size, 0);
  assert.equal((await getV3CardmarketIdMap(opts)).size, 0);
  assert.equal(calls, 1, 'innerhalb des Fensters kein zweiter Ladeversuch');
  clock += 60_001;
  await getV3CardmarketIdMap(opts);
  assert.equal(calls, 2, 'nach Ablauf wird wieder geladen');
  // Erfolg wird nicht negativ gecacht; andere Loader sind unabhaengig
  const ok = await getV3CardmarketIdMap({ loadIndex: async () => INDEX, now: () => clock });
  assert.equal(ok.get('me55::150'), '907757');
});

test('getV3CardmarketIdMap: haengender Index -> Zeitlimit, leere Map, danach negativ gecacht', async () => {
  let calls = 0;
  const loadIndex = () => { calls += 1; return new Promise(() => {}); };
  const started = Date.now();
  const map = await getV3CardmarketIdMap({ loadIndex, timeoutMs: 30 });
  assert.equal(map.size, 0);
  assert.ok(Date.now() - started < 2_000);
  await getV3CardmarketIdMap({ loadIndex, timeoutMs: 30 });
  assert.equal(calls, 1);
});

test('resolveCardmarketEntryByProductId: v3-Expansion ohne das Produkt -> Tracker-Expansion vor products.json', async () => {
  resetCardmarketDataCaches();
  setCardmarketDataVersion('2026-11-13T03:00:00.000Z');
  const calls = installFetch({
    '/index/tracker.json': { bySetId: { me55: 77 }, byPtcgoCode: {}, bySetName: {} },
    '/sets/6601.json': { expansionId: 6601, cards: [entry(1, 'Other')] },
    '/sets/77.json': { expansionId: 77, cards: [entry(907757, 'Pikachu ex [Zip-Zap Frenzy | Thunder]', { prices: { trend: 3 } })] },
  });
  const found = await resolveCardmarketEntryByProductId(907757, { setId: 'me55', expansionId: '6601' });
  assert.equal(found?.prices?.trend, 3);
  assert.ok(!calls.some((u) => u.includes('/index/products.json')));
  // v3-Expansion ohne Setdatei -> ebenfalls Tracker
  resetCardmarketDataCaches();
  setCardmarketDataVersion('2026-11-13T03:00:00.000Z');
  installFetch({
    '/index/tracker.json': { bySetId: { tk1a: 77 }, byPtcgoCode: {}, bySetName: {} },
    '/sets/77.json': { expansionId: 77, cards: [entry(5, 'Pikachu')] },
  });
  assert.equal((await resolveCardmarketEntryByProductId(5, { setId: 'tk1a', expansionId: '275771' }))?.cardmarketProductId, 5);
});
