// Task 13: API-Bilder und Cardmarket-IDs gewinnen ueber veraltete Sheet-Werte (db_sets/db_cards);
// primaere Cardmarket-ID beruecksichtigt Jumbo-Varianten.
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map([['poke:release:tcg_spreadsheet_id', 'sheet-test']]);
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k)
};
const { CONFIG, scopedStorageKey } = await import('../js/core/config.js');
const { resolveDisplaySet, resolveDisplayCard, setV3SetMeta, SET_DB_HEADERS, CARD_DB_HEADERS } = await import('../js/data/schema-contract.js');
const { createFakeSpreadsheet } = await import('./helpers/fake-sheets.mjs');
const { listSetsOverviewData, readDbCardsForSet, resetSheetsDataCaches } = await import('../js/data/sheets-db.js');
const { resetV3Caches } = await import('../js/data/v3-api.js');
const { resetCollectionResolverCache } = await import('../js/data/collection-aliases.js');
const { resetV3CardmarketIdCache } = await import('../js/data/v3-cardmarket-ids.js');
const { fetchV3SetMeta } = await import('../js/data/pokemon-api.js');
const { imageCandidates } = await import('../js/ui/image-fallback.js');
const { withV3CardmarketIds, attachV3CardData, buildV3CardDataMap } = await import('../js/data/v3-cardmarket-ids.js');
const { primaryCardmarketProductId } = await import('../js/data/v3-records.js');

const SETTINGS_KEY = scopedStorageKey('user-settings');
const setLanguage = (lang) => localStorage.setItem(SETTINGS_KEY, JSON.stringify({ cardLanguage: lang }));

const STALE_DE_LOGO = 'https://assets.tcgdex.net/de/sv/sv01/logo-alt.webp';
const API_SETS = [
  {
    id: 'sv1',
    series: 'Scarlet & Violet',
    images: { logo: 'https://assets.tcgdex.net/en/sv/sv01/logo.webp', symbol: 'https://assets.tcgdex.net/en/sv/sv01/symbol.webp' },
    i18n: { de: { name: 'Karmesin & Purpur', series: 'Karmesin & Purpur', images: { logo: 'https://assets.tcgdex.net/de/sv/sv01/logo.webp' } } }
  }
];
// db_sets-Zeile vom Importzeitpunkt: damals noch ohne (bzw. mit altem) DE-Logo.
const sheetSet = (extra = {}) => ({
  setId: 'sv1',
  vera_name: 'Scarlet & Violet',
  vera_series: 'Scarlet & Violet',
  vera_images_logo: 'https://images.pokemontcg.io/sv1/logo.png',
  vera_images_symbol: 'https://images.pokemontcg.io/sv1/symbol.png',
  tcgdex_logo: STALE_DE_LOGO,
  ...extra
});

// ── 1. Set-Kacheln ───────────────────────────────────────────────────────
test('fetchV3SetMeta liefert Set-Bilder (DE-Logo, EN-Logo, EN-Symbol)', async () => {
  const meta = await fetchV3SetMeta({ loadSets: async () => API_SETS });
  assert.deepEqual(meta.get('sv1').images, {
    deLogo: 'https://assets.tcgdex.net/de/sv/sv01/logo.webp',
    deSymbol: '',
    logo: 'https://assets.tcgdex.net/en/sv/sv01/logo.webp',
    symbol: 'https://assets.tcgdex.net/en/sv/sv01/symbol.webp'
  });
  // Set nur mit Bildern (ohne Namen/Serie) erscheint trotzdem
  const onlyImages = await fetchV3SetMeta({ loadSets: async () => [{ id: 'x1', images: { logo: 'https://a.test/l.png' } }] });
  assert.equal(onlyImages.get('x1').images.logo, 'https://a.test/l.png');
});

test('Set-Kachel: DE-Logo aus api/v3 vor tcgdex_logo der Sheet-Zeile; EN-Logo/-Symbol aus api/v3 vor vera_*', async () => {
  const meta = await fetchV3SetMeta({ loadSets: async () => API_SETS });
  try {
    setV3SetMeta(meta);
    setLanguage('de');
    const tile = resolveDisplaySet(sheetSet());
    const logos = imageCandidates(tile, 'setLogo', 'de');
    assert.equal(logos[0], 'https://assets.tcgdex.net/de/sv/sv01/logo.webp');
    assert.ok(logos.includes(STALE_DE_LOGO), 'Sheet-Wert bleibt als Reserve');
    assert.ok(logos.indexOf(STALE_DE_LOGO) < logos.indexOf('https://assets.tcgdex.net/en/sv/sv01/logo.webp'));
    // ohne DE-Logo in der Zeile (Import vor TCGdex-DE-Logo) erscheint das spaeter ergaenzte DE-Logo
    assert.equal(imageCandidates(resolveDisplaySet(sheetSet({ tcgdex_logo: '' })), 'setLogo', 'de')[0], 'https://assets.tcgdex.net/de/sv/sv01/logo.webp');
    setLanguage('en');
    const tileEn = resolveDisplaySet(sheetSet());
    assert.equal(imageCandidates(tileEn, 'setLogo', 'en')[0], 'https://assets.tcgdex.net/en/sv/sv01/logo.webp');
    assert.equal(imageCandidates(tileEn, 'setSymbol', 'en')[0], 'https://assets.tcgdex.net/en/sv/sv01/symbol.webp');
    // wiederholtes Aufloesen (loadSets-Merge) bleibt stabil
    assert.deepEqual(imageCandidates(resolveDisplaySet(tileEn), 'setLogo', 'en'), imageCandidates(tileEn, 'setLogo', 'en'));
    // Sheet-Spalten selbst bleiben unveraendert (kein Schreiben, persistierte logoUrl folgt der Zeile)
    assert.equal(tile.tcgdex_logo, STALE_DE_LOGO);
  } finally {
    setV3SetMeta(null);
    store.delete(SETTINGS_KEY);
  }
});

test('Set-Kachel offline (sets.json fehlgeschlagen): Sheet-Werte bleiben die Kette', async () => {
  const meta = await fetchV3SetMeta({ loadSets: async () => { throw new Error('offline'); } });
  try {
    setV3SetMeta(meta);
    setLanguage('de');
    const tile = resolveDisplaySet(sheetSet());
    assert.equal(imageCandidates(tile, 'setLogo', 'de')[0], STALE_DE_LOGO);
    assert.equal(imageCandidates(tile, 'setSymbol', 'de')[0], 'https://images.pokemontcg.io/sv1/symbol.png');
  } finally {
    setV3SetMeta(null);
    store.delete(SETTINGS_KEY);
  }
});

// ── 2. db_cards-Karten ───────────────────────────────────────────────────
const STALE_DE_SMALL = 'https://assets.tcgdex.net/de/sv/sv01/001/alt-low.webp';
const INDEX = [
  {
    setId: 'sv1', cardId: '1', number: '1', name: 'Sprigatito', cm: 700001,
    img: 'https://assets.tcgdex.net/en/sv/sv01/001/low.webp',
    imgDe: 'https://assets.tcgdex.net/de/sv/sv01/001/low.webp'
  },
  { setId: 'sv1', cardId: '2', number: '2', name: 'Ohne Bild', cm: 700002 },
  { setId: 'sv1', cardId: '3', number: '3', name: 'Nur Bild', img: 'https://images.pokemontcg.io/sv1/3.png' }
];
// db_cards-Zeile so, wie readDbCardsForSet sie liefert (resolveDisplayCard + collectionKey).
function dbCard({ cardId, collectionKey, deSmall = '', enSmall = '' }) {
  return {
    ...resolveDisplayCard({
      cardId,
      vera_number: collectionKey,
      vera_name: 'Karte',
      vera_images_small: enSmall,
      tcgdex_image_small: deSmall,
      tcgdex_image_large: deSmall ? deSmall.replace('low', 'high') : ''
    }),
    collectionKey
  };
}

test('db_cards: imgDe/img aus dem Suchindex vor tcgdex_image_small/vera_images_small der Zeile', async () => {
  setLanguage('de');
  try {
    const stale = dbCard({ cardId: 'sv1-1', collectionKey: '1', deSmall: STALE_DE_SMALL, enSmall: 'https://images.pokemontcg.io/sv1/1.png' });
    const [card] = await withV3CardmarketIds([stale], { setId: 'sv1', language: 'de', loadIndex: async () => INDEX });
    const de = imageCandidates(card, 'cardSmall', 'de');
    assert.equal(de[0], 'https://assets.tcgdex.net/de/sv/sv01/001/low.webp');
    assert.ok(de.includes(STALE_DE_SMALL), 'Sheet-Wert als Reserve');
    assert.equal(imageCandidates(card, 'cardSmall', 'en')[0], 'https://assets.tcgdex.net/en/sv/sv01/001/low.webp');
    // grosses Bild: TCGdex low -> high (wie rewriteTcgdexImageQuality)
    assert.equal(imageCandidates(card, 'cardLarge', 'de')[0], 'https://assets.tcgdex.net/de/sv/sv01/001/high.webp');
    assert.equal(imageCandidates(card, 'cardLarge', 'en')[0], 'https://assets.tcgdex.net/en/sv/sv01/001/high.webp');
    // Anzeigefelder folgen der Kartensprache
    assert.equal(card.image, 'https://assets.tcgdex.net/de/sv/sv01/001/low.webp');
    assert.equal(card.imageUrl, card.image);
    assert.equal(card.imageLarge, 'https://assets.tcgdex.net/de/sv/sv01/001/high.webp');
    // Cardmarket-ID im selben Schritt
    assert.equal(card.cardmarketProductId, 700001);
    // Sheet-Spalten unveraendert
    assert.equal(card.tcgdex_image_small, STALE_DE_SMALL);
  } finally {
    store.delete(SETTINGS_KEY);
  }
});

test('db_cards: Eintraege ohne Bild lassen die Sheet-Bilder stehen; Nicht-TCGdex-Bilder ohne abgeleitetes Large', () => {
  const map = buildV3CardDataMap(INDEX);
  const noImg = dbCard({ cardId: 'sv1-2', collectionKey: '2', deSmall: STALE_DE_SMALL });
  const onlyImg = dbCard({ cardId: 'sv1-3', collectionKey: '3' });
  const [a, b] = attachV3CardData([noImg, onlyImg], map, { setId: 'sv1', language: 'de' });
  assert.equal(imageCandidates(a, 'cardSmall', 'de')[0], STALE_DE_SMALL);
  assert.equal(a.cardmarketProductId, 700002);
  assert.equal(b.images.small, 'https://images.pokemontcg.io/sv1/3.png');
  assert.equal(b.images.large, undefined);
  assert.equal(b.cardmarketProductId, undefined);
  // unbekannte Karte: gleiche Referenz
  const unknown = dbCard({ cardId: 'sv1-99', collectionKey: '99' });
  assert.equal(attachV3CardData([unknown], map, { setId: 'sv1' })[0], unknown);
});

test('db_cards offline (Suchindex fehlgeschlagen): Sheet-Bilder bleiben', async () => {
  const stale = dbCard({ cardId: 'sv1-1', collectionKey: '1', deSmall: STALE_DE_SMALL });
  const out = await withV3CardmarketIds([stale], { setId: 'sv1', loadIndex: async () => { throw new Error('offline'); } });
  assert.equal(imageCandidates(out[0], 'cardSmall', 'de')[0], STALE_DE_SMALL);
});

// ── 3. Primaere Cardmarket-ID mit Jumbo-Varianten ───────────────────────
test('primaryCardmarketProductId: ungestempelt+nicht-jumbo > nicht-jumbo > ungestempelt > beliebig > ids[0]', () => {
  const card = (variants, ids = []) => ({ variants, ids: { cardmarket: ids } });
  // Jumbo-Variante vorn, ungestempelt
  assert.equal(primaryCardmarketProductId(card([
    { type: 'holo', size: 'jumbo', cardmarketId: 1 },
    { type: 'holo', stamp: ['pre-release'], cardmarketId: 2 },
    { type: 'normal', cardmarketId: 3 }
  ], [1])), 3);
  // nur gestempelte Normalgroesse + ungestempelte Jumbo -> nicht-jumbo
  assert.equal(primaryCardmarketProductId(card([
    { type: 'holo', size: 'jumbo', cardmarketId: 1 },
    { type: 'holo', stamp: ['staff'], cardmarketId: 2 }
  ])), 2);
  // nur Jumbos -> ungestempelte Jumbo
  assert.equal(primaryCardmarketProductId(card([
    { type: 'holo', size: 'jumbo', stamp: ['winner'], cardmarketId: 1 },
    { type: 'holo', size: 'jumbo', cardmarketId: 4 }
  ])), 4);
  // nur gestempelte Jumbos -> erste
  assert.equal(primaryCardmarketProductId(card([{ size: 'jumbo', stamp: ['x'], cardmarketId: 5 }])), 5);
  // keine Variante mit ID -> ids.cardmarket[0]
  assert.equal(primaryCardmarketProductId(card([{ size: 'jumbo' }], [9, 8])), 9);
  assert.equal(primaryCardmarketProductId({}), null);
});

// ── 4. Echte Sheet-Pfade (db_sets -> listSetsOverviewData -> loadSets-Merge, db_cards -> readDbCardsForSet) ──
CONFIG.APIS.REGISTRY_BASE = 'https://reg.test/registry/';
CONFIG.APIS.V3_BASE = 'https://reg.test/v3/';
const T0 = '2026-01-01T00:00:00.000Z';

function setupSheets({ dbSets = [], dbCards = [], index = null } = {}) {
  resetSheetsDataCaches(); resetCollectionResolverCache(); resetV3Caches(); resetV3CardmarketIdCache();
  globalThis.fetch = async (url) => (index && String(url) === 'https://reg.test/v3/search-index.json'
    ? { ok: true, status: 200, json: async () => index }
    : { ok: false, status: 404, json: async () => null });
  const fake = createFakeSpreadsheet({
    db_sets: [SET_DB_HEADERS, ...dbSets],
    db_cards: [CARD_DB_HEADERS, ...dbCards],
    db_collection: [['setId', 'cardId', 'g', 'rh', 'updatedAt']],
    'Sets Overview': [['Sets Overview'], ['setId', 'setName']]
  });
  globalThis.gapi = fake.gapi;
  return fake;
}

test('db_sets-Zeile mit altem tcgdex_logo: Dashboard-Kachel zeigt das DE-Logo aus api/v3; offline das Sheet-Logo', async () => {
  const r = new Array(SET_DB_HEADERS.length).fill('');
  Object.assign(r, { 0: 'sv1', 1: true, 2: T0, 3: 'matched', 4: false, 5: 'sv1', 7: 'Scarlet & Violet', 9: 'Scarlet & Violet' });
  r[SET_DB_HEADERS.indexOf('tcgdex_logo')] = STALE_DE_LOGO;
  r[SET_DB_HEADERS.indexOf('vera_images_logo')] = 'https://images.pokemontcg.io/sv1/logo.png';
  for (const online of [true, false]) {
    const fake = setupSheets({ dbSets: [r] });
    const before = fake.rows('db_sets').map((x) => [...x]);
    const meta = await fetchV3SetMeta({ loadSets: async () => { if (!online) throw new Error('offline'); return API_SETS; } });
    try {
      setV3SetMeta(meta);
      setLanguage('de');
      const overview = await listSetsOverviewData();
      // loadSets-Merge (app.js) loest jede Zeile erneut mit resolveDisplaySet auf
      const tile = resolveDisplaySet(overview.find((s) => s.setId === 'sv1'));
      assert.equal(imageCandidates(tile, 'setLogo', 'de')[0], online ? 'https://assets.tcgdex.net/de/sv/sv01/logo.webp' : STALE_DE_LOGO, `online=${online}`);
      assert.deepEqual(fake.rows('db_sets'), before, 'db_sets wird nicht geschrieben');
    } finally {
      setV3SetMeta(null);
      store.delete(SETTINGS_KEY);
    }
  }
});

test('readDbCardsForSet: imgDe aus dem Suchindex schlaegt tcgdex_image_small der Zeile; offline bleibt das Sheet-Bild', async () => {
  const r = new Array(CARD_DB_HEADERS.length).fill('');
  r[0] = 'sv1'; r[1] = 'sv1-1'; r[2] = T0; r[3] = 'matched'; r[8] = '1'; r[10] = 'Sprigatito';
  r[CARD_DB_HEADERS.indexOf('tcgdex_image_small')] = STALE_DE_SMALL;
  for (const online of [true, false]) {
    const fake = setupSheets({ dbCards: [r], index: online ? INDEX : null });
    const before = fake.rows('db_cards').map((x) => [...x]);
    setLanguage('de');
    try {
      const [card] = await readDbCardsForSet('sv1');
      assert.equal(imageCandidates(card, 'cardSmall', 'de')[0], online ? 'https://assets.tcgdex.net/de/sv/sv01/001/low.webp' : STALE_DE_SMALL, `online=${online}`);
      assert.equal(card.cardmarketProductId, online ? 700001 : undefined);
      assert.deepEqual(fake.rows('db_cards'), before, 'db_cards wird nicht geschrieben');
    } finally {
      store.delete(SETTINGS_KEY);
    }
  }
});
