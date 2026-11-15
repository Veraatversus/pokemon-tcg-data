// Task 8d: v3-Cardmarket-IDs gewinnen auf jedem Pfad (db_cards-Records, Watchlist-Links).
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  attachV3CardmarketIds,
  resolveCardmarketProductId,
  resolveItemCardmarketUrl,
} from '../js/data/cardmarket-url-utils.js';
import {
  buildV3CardmarketIdMap,
  withV3CardmarketIds,
  getV3CardmarketIdMap,
  V3_ID_MAP_TIMEOUT_MS,
} from '../js/data/v3-cardmarket-ids.js';
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

// ── 3. Schreibpfad und Index-Lader ────────────────────────────────────────

test('toCardRecord schreibt vera_cardmarket_url aus der v3-ID (me55-150)', () => {
  const record = toCardRecord({
    id: 'me55-150', cardId: '150', setId: 'me55', number: '150', name: 'Pikachu ex',
    ids: { cardmarket: [907757], pokemontcg: 'me55-150', tcgdex: '30th-150' },
    variants: [{ cardmarketId: 907757, type: 'holo' }],
  });
  assert.equal(record.vera_cardmarket_url, productUrl(907757));
  assert.equal(record.cardmarketProductId, 907757);
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

test('getV3CardmarketIdMap: Zeitlimit -> leere Map, aber kein Negativ-Cache; naechster Aufruf wartet auf den laufenden Load', async () => {
  // Wie loadV3SearchIndex: ein Ladevorgang je Session, weitere Aufrufe bekommen dasselbe Promise.
  let calls = 0;
  let resolveIndex;
  const inFlight = new Promise((resolve) => { resolveIndex = resolve; });
  const loadIndex = () => { calls += 1; return inFlight; };
  const started = Date.now();
  const map = await getV3CardmarketIdMap({ loadIndex, timeoutMs: 30 });
  assert.equal(map.size, 0);
  assert.ok(Date.now() - started < 2_000);
  resolveIndex(INDEX);
  const later = await getV3CardmarketIdMap({ loadIndex, timeoutMs: 30 });
  assert.equal(calls, 2, 'nach Zeitlimit wird der Loader erneut gefragt');
  assert.equal(later.get('me55::150'), '907757');
});

test('getV3CardmarketIdMap: Standard-Zeitlimit 20 s', () => {
  assert.equal(V3_ID_MAP_TIMEOUT_MS, 20_000);
});
