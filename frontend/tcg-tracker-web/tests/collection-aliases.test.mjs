// Alias-faehige Sammlung (Task 5): sheets-db.js gegen ein In-Memory-Spreadsheet und eine Stub-Registry.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFakeSpreadsheet } from './helpers/fake-sheets.mjs';

const store = new Map([['poke:release:tcg_spreadsheet_id', 'sheet-test']]);
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k)
};

const { CONFIG } = await import('../js/core/config.js');
const { SET_DB_HEADERS, CARD_DB_HEADERS } = await import('../js/data/schema-contract.js');
const { resetV3Caches } = await import('../js/data/v3-api.js');
const { resetCollectionResolverCache, ensureResolverForSet, buildCollectionMap } = await import('../js/data/collection-aliases.js');
const sheetsDb = await import('../js/data/sheets-db.js');
const {
  readSetCollectionMap,
  ensureCollectionEntry,
  cellsForUpdate,
  updateCellBooleansBatch,
  importSetIntoCollection,
  resetSheetsDataCaches
} = sheetsDb;

const REG = 'https://reg.test/registry/';
CONFIG.APIS.REGISTRY_BASE = REG;
CONFIG.APIS.V3_BASE = 'https://reg.test/v3/';

// ── Synthetische Registry im Format von api/registry ──────────────────────────
const SYN_SETS = {
  me5: { aliases: ['TCGDEX-me05'], mergedSubsets: [], pokemontcg: 'me5', tcgdex: 'me05' },
  swsh12pt5: {
    aliases: ['TCGDEX-swsh12.5', 'TCGDEX-swsh12.5gg', 'swsh12pt5gg'],
    mergedSubsets: ['swsh12pt5gg'],
    pokemontcg: 'swsh12pt5',
    tcgdex: 'swsh12.5'
  },
  me55c: { aliases: ['TCGDEX-30th-c'], mergedSubsets: [], pokemontcg: 'me55c', tcgdex: '30th-c' },
  cel25c: { aliases: ['TCGDEX-cel25cc'], mergedSubsets: [], pokemontcg: 'cel25c', tcgdex: 'cel25cc' }
};
const card = (pt, td, keysPt, keysTd, extra = {}) => ({
  keys: { pokemontcg: keysPt, tcgdex: keysTd },
  pokemontcg: pt,
  tcgdex: td,
  ...extra
});
const SYN_CARDS = {
  me5: {
    1: card('me5-1', [{ localId: '001', set: 'me05' }], ['1'], ['1']),
    2: card('me5-2', [{ localId: '002', set: 'me05' }], ['2'], ['2'])
  },
  swsh12pt5: {
    1: card('swsh12pt5-1', [{ localId: '001', set: 'swsh12.5' }], ['1'], ['1']),
    2: card('swsh12pt5-2', [{ localId: '002', set: 'swsh12.5' }], ['2'], ['2']),
    5: card('swsh12pt5-5', [{ localId: '005', set: 'swsh12.5' }], ['5'], ['5']),
    6: card('swsh12pt5-6', [{ localId: '006', set: 'swsh12.5' }], ['6'], ['6']),
    GG1: card('swsh12pt5gg-GG01', [{ localId: 'GG01', set: 'swsh12.5gg' }], ['GG1'], ['GG1'])
  },
  me55c: {
    111: card('me55c-111', [{ localId: '011', set: '30th-c' }], ['111'], ['11']),
    '11_3': card('me55c-11', [{ localId: '003', set: '30th-c' }], [], ['3'], { ambiguousLegacyKey: '11' }),
    '11g': card('me55c-11g', [{ localId: '004', set: '30th-c' }], [], ['4'], { ambiguousLegacyKey: '11' })
  },
  cel25c: {
    1: card('cel25c-1', [{ localId: '1', set: 'cel25cc' }], ['1'], ['1']),
    '15_A1': card('cel25c-15_A1', [{ localId: '15A1', set: 'cel25cc' }], [], ['15A1'], { ambiguousLegacyKey: '15' }),
    '15_A2': card('cel25c-15_A2', [{ localId: '15A2', set: 'cel25cc' }], [], ['15A2'], { ambiguousLegacyKey: '15' })
  }
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const realRegistryDir = path.join(root, 'api/registry');

let fetchLog = [];
function useRegistry(sets, cardsBySetId) {
  fetchLog = [];
  globalThis.fetch = async (url) => {
    fetchLog.push(String(url));
    const u = String(url);
    let body;
    if (u === `${REG}sets.json`) body = typeof sets === 'function' ? sets() : sets;
    else if (u.startsWith(`${REG}cards/`)) {
      const id = decodeURIComponent(u.slice(`${REG}cards/`.length).replace(/\.json$/, ''));
      body = typeof cardsBySetId === 'function' ? cardsBySetId(id) : cardsBySetId[id];
    }
    if (body === undefined) return { ok: false, status: 404, json: async () => null };
    return { ok: true, status: 200, json: async () => body };
  };
}

const COLLECTION_HEADER = ['setId', 'cardId', 'g', 'rh', 'updatedAt'];
const T0 = '2026-01-01T00:00:00.000Z';

function setup({ collection = [], overview = [], dbSets = [], extraSheets = {}, registry = [SYN_SETS, SYN_CARDS] } = {}) {
  resetSheetsDataCaches();
  resetCollectionResolverCache();
  resetV3Caches();
  CONFIG.WRITE_DB_CARDS = true;
  useRegistry(...registry);
  const fake = createFakeSpreadsheet({
    db_sets: [SET_DB_HEADERS, ...dbSets],
    db_cards: [CARD_DB_HEADERS],
    db_collection: [COLLECTION_HEADER, ...collection],
    'Sets Overview': [['Sets Overview'], ['setId', 'setName'], ...overview],
    ...extraSheets
  });
  globalThis.gapi = fake.gapi;
  return fake;
}

const collectionRows = (fake) => fake.rows('db_collection').slice(1);

// ── Lesen ─────────────────────────────────────────────────────────────────────
test('TCGDEX-me05/1 (g) und me5/1 (nicht g) -> Karte 1 ist g, zwei Zellen', async () => {
  setup({ collection: [['TCGDEX-me05', '1', true, false, T0], ['me5', '1', false, false, T0]] });
  const map = await readSetCollectionMap('Mega Evolution 5', { setId: 'me5' });
  const entry = map.get('1');
  assert.equal(entry.g, true);
  assert.equal(entry.rh, false);
  assert.equal(entry.cells.length, 2);
  assert.deepEqual(entry.gCell, { row: 2, col: 3 });
  assert.deepEqual(entry.rhCell, { row: 2, col: 4 });
  assert.deepEqual(entry.cells.map((c) => c.gCell.row), [2, 3]);
});

test('swsh12pt5/GG1 + swsh12pt5gg/GG1 -> eine Karte, zwei Zellen; cellsForUpdate liefert beide', async () => {
  setup({
    collection: [
      ['swsh12pt5', 'GG1', true, true, T0],
      ['me5', '1', true, false, T0],
      ['swsh12pt5gg', 'GG01', true, true, T0]
    ]
  });
  const map = await readSetCollectionMap('Crown Zenith', { setId: 'swsh12pt5' });
  assert.deepEqual([...map.keys()], ['GG1']);
  const entry = map.get('GG1');
  assert.equal(entry.cells.length, 2);
  assert.equal(entry.g, true);
  assert.equal(entry.rh, true);

  assert.deepEqual(cellsForUpdate(entry, 'g', false), [
    { row: 2, col: 3, value: false },
    { row: 4, col: 3, value: false },
    { row: 2, col: 4, value: false },
    { row: 4, col: 4, value: false }
  ]);
  assert.deepEqual(cellsForUpdate(entry, 'g', true), [
    { row: 2, col: 3, value: true },
    { row: 4, col: 3, value: true }
  ]);
  // rh => g
  assert.deepEqual(cellsForUpdate(entry, 'rh', true), [
    { row: 2, col: 3, value: true },
    { row: 4, col: 3, value: true },
    { row: 2, col: 4, value: true },
    { row: 4, col: 4, value: true }
  ]);
  assert.deepEqual(cellsForUpdate(entry, 'rh', false), [
    { row: 2, col: 4, value: false },
    { row: 4, col: 4, value: false }
  ]);
  // Kompatibilitaet: Eintrag nur mit gCell/rhCell
  assert.deepEqual(cellsForUpdate({ gCell: { row: 9, col: 3 }, rhCell: { row: 9, col: 4 } }, 'g', true), [
    { row: 9, col: 3, value: true }
  ]);
  assert.throws(() => cellsForUpdate(entry, 'x', true));
});

test('Abwaehlen ueber alle Zellen bleibt nicht an der zweiten Zeile haengen', async () => {
  const fake = setup({
    collection: [['swsh12pt5', 'GG1', true, false, T0], ['swsh12pt5gg', 'GG1', true, false, T0]]
  });
  const before = await readSetCollectionMap('Crown Zenith', { setId: 'swsh12pt5' });
  await updateCellBooleansBatch('Crown Zenith', cellsForUpdate(before.get('GG1'), 'g', false));
  assert.deepEqual(collectionRows(fake).map((r) => r[2]), [false, false]);
  // Lesen nach dem Schreiben (gecachte Zeilen werden mitgefuehrt) -> nicht mehr g
  const after = await readSetCollectionMap('Crown Zenith', { setId: 'swsh12pt5' });
  assert.equal(after.get('GG1').g, false);
});

test('TCGDEX-30th-c/11 und me55c/11 landen bei verschiedenen Karten', async () => {
  setup({ collection: [['TCGDEX-30th-c', '11', true, false, T0], ['me55c', '11', false, false, T0]] });
  const map = await readSetCollectionMap('x', { setId: 'me55c' });
  assert.equal(map.get('111').g, true);
  assert.deepEqual(map.get('111').cells.map((c) => c.setKey), ['TCGDEX-30th-c']);
  // me55c/11 ist der alte mehrdeutige Schluessel -> nicht bei 111
  assert.equal(map.get('11_3').cells.length, 0);
  assert.equal(map.get('11_3').ambiguous.legacyKey, '11');
  assert.deepEqual(map.get('11_3').ambiguous.cells.map((c) => c.setKey), ['me55c']);
});

test('cel25c/15 -> ambiguous je Kandidat, g/rh der Karten bleiben unberuehrt', async () => {
  const fake = setup({ collection: [['cel25c', '15', true, true, T0], ['cel25c', '1', false, false, T0]] });
  const snapshot = JSON.stringify(collectionRows(fake));
  const map = await readSetCollectionMap('Celebrations Classic', { setId: 'cel25c' });
  for (const key of ['15_A1', '15_A2']) {
    const entry = map.get(key);
    assert.equal(entry.g, false);
    assert.equal(entry.rh, false);
    assert.deepEqual(entry.cells, []);
    assert.equal(entry.gCell, null);
    assert.deepEqual(entry.ambiguous.collectionKeys, ['15_A1', '15_A2']);
    assert.equal(entry.ambiguous.legacyKey, '15');
    assert.equal(entry.ambiguous.g, true);
    assert.deepEqual(entry.ambiguous.cells.map((c) => c.rowNo), [2]);
  }
  assert.equal(map.get('1').g, false);
  assert.deepEqual(cellsForUpdate(map.get('15_A1'), 'g', true), []);
  assert.equal(JSON.stringify(collectionRows(fake)), snapshot, 'nichts geschrieben');
});

test('Set-ID ueber den Namen (db_sets) und Alias-ID wird kanonisiert', async () => {
  const dbSetRow = ['TCGDEX-me05', true, T0, 'matched', true, '', 'me05', 'Mega Evolution 5', '', ''];
  setup({
    dbSets: [dbSetRow],
    collection: [['TCGDEX-me05', '001', true, true, T0], ['me5', '2', true, false, T0], ['base1', '1', true, false, T0]]
  });
  const map = await readSetCollectionMap('Mega Evolution 5');
  assert.deepEqual([...map.keys()].sort(), ['1', '2']);
  assert.equal(map.get('1').rh, true);
  // Nur Registry-Sets + Karten des kanonischen Sets geladen
  assert.deepEqual(fetchLog, [`${REG}sets.json`, `${REG}cards/me5.json`]);
});

test('ensureResolverForSet laedt Sets einmal und Karten nur des kanonischen Sets', async () => {
  setup();
  const r1 = await ensureResolverForSet('swsh12pt5gg');
  const r2 = await ensureResolverForSet('swsh12pt5');
  assert.equal(r1, r2);
  assert.deepEqual(r1.resolve('swsh12pt5gg', 'GG01'), { setId: 'swsh12pt5', collectionKey: 'GG1' });
  assert.deepEqual(fetchLog, [`${REG}sets.json`, `${REG}cards/swsh12pt5.json`]);
  const unknown = await ensureResolverForSet('nope');
  assert.equal(unknown.resolveSetKey('nope'), null);
  assert.equal(fetchLog.length, 2);
});

test('Registry nicht erreichbar -> Fallback auf exakte Set-ID (keine leere Sammlung)', async () => {
  setup({
    collection: [['me5', '1', true, false, T0], ['TCGDEX-me05', '2', true, false, T0]],
    registry: [undefined, {}]
  });
  const map = await readSetCollectionMap('x', { setId: 'me5' });
  assert.deepEqual([...map.keys()], ['1']);
  assert.equal(map.get('1').g, true);
  assert.equal(map.get('1').cells.length, 1);
});

test('linear: 24k Zeilen, Aufloesung nur fuer Zeilen des Sets, gecachte Zeilen', async () => {
  const rows = [];
  for (let i = 0; i < 24000; i += 1) rows.push([`other${i % 200}`, String(i), i % 3 === 0, false, T0]);
  rows.push(['me5', '1', true, false, T0]);
  const fake = setup({ collection: rows });
  const started = Date.now();
  const map = await readSetCollectionMap('x', { setId: 'me5' });
  await readSetCollectionMap('x', { setId: 'me5' });
  assert.equal(map.get('1').g, true);
  assert.ok(Date.now() - started < 3000, 'schnell');
  const collectionReads = fake.reads.filter((r) => r.startsWith("'db_collection'!A2"));
  assert.equal(collectionReads.length, 1, 'db_collection nur einmal gelesen');
});

// ── Neue Zeilen / ensureCollectionEntry ───────────────────────────────────────
test('ensureCollectionEntry: bestehende Karte (ueber Alias) -> keine neue Zeile; neue Karte -> kanonische ID', async () => {
  const fake = setup({ collection: [['TCGDEX-me05', '1', true, false, T0], ['me5', '1', false, false, T0]] });
  const existing = await ensureCollectionEntry('x', '1', { setId: 'TCGDEX-me05' });
  assert.equal(existing.cells.length, 2);
  assert.equal(existing.g, true);
  assert.equal(collectionRows(fake).length, 2);

  const created = await ensureCollectionEntry('x', '2', { setId: 'TCGDEX-me05' });
  const rows = collectionRows(fake);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[2].slice(0, 4), ['me5', '2', false, false]);
  assert.equal(created.cells.length, 1);
  assert.deepEqual(created.gCell, { row: 4, col: 3 });
  assert.deepEqual(created.rhCell, { row: 4, col: 4 });

  // Kandidat einer mehrdeutigen Altzeile bekommt eine eigene Zeile, Altzeile bleibt
  const fake2 = setup({ collection: [['cel25c', '15', true, false, T0]] });
  const amb = await ensureCollectionEntry('x', '15_A1', { setId: 'cel25c' });
  assert.deepEqual(collectionRows(fake2).map((r) => r.slice(0, 4)), [['cel25c', '15', true, false], ['cel25c', '15_A1', false, false]]);
  assert.equal(amb.cells.length, 1);
  assert.equal(amb.g, false);
});

test('Legacy-Grid-Fallback: alte Nummern werden aufgeloest und unter kanonischer ID migriert', async () => {
  const grid = [
    [], [],
    ['001', '', '', 'GG01', '', ''],
    [],
    [true, true, '', true, false, ''],
    []
  ];
  // Grid ab Zeile 3; die ersten zwei Zeilen sind Kopfzeilen
  const fake = setup({
    overview: [['TCGDEX-swsh12.5', 'Crown Zenith']],
    extraSheets: { 'Crown Zenith': grid }
  });
  const map = await readSetCollectionMap('Crown Zenith', { setId: 'TCGDEX-swsh12.5' });
  assert.deepEqual(collectionRows(fake).map((r) => r.slice(0, 4)), [
    ['swsh12pt5', '1', true, true],
    ['swsh12pt5', 'GG1', true, false]
  ]);
  assert.equal(map.get('1').rh, true);
  assert.equal(map.get('GG1').g, true);
  assert.equal(map.get('GG1').cells.length, 1);
});

// ── writeDbCollectionForSet / importSetIntoCollection ─────────────────────────
const v3Cards = (keys) => keys.map((k) => ({ collectionKey: k, number: k, cardId: `swsh12pt5-${k}` }));

test('Import: Alias-Zeilen unangetastet, neue Karten unter kanonischer ID, clearMissing nur kanonisch', async () => {
  const fake = setup({
    overview: [['swsh12pt5', 'Crown Zenith']],
    collection: [
      ['swsh12pt5gg', 'GG01', true, false, T0], // Alias-Zeile
      ['TCGDEX-swsh12.5', '001', false, false, T0], // Alias-Zeile (TCGdex-Namensraum)
      ['swsh12pt5', '5', false, false, T0], // kanonisch, nicht im Import, ohne Haken -> wird geleert
      ['swsh12pt5', '6', true, false, T0], // kanonisch, nicht im Import, mit Haken -> bleibt
      ['swsh12pt5', 'XYZ', true, false, T0], // nicht aufloesbar -> bleibt
      ['me5', '1', true, false, T0] // anderes Set
    ]
  });
  await importSetIntoCollection({ setId: 'swsh12pt5', setName: 'Crown Zenith', totalCards: 3 }, v3Cards(['1', '2', 'GG1']));
  const rows = collectionRows(fake);
  assert.deepEqual(rows[0], ['swsh12pt5gg', 'GG01', true, false, T0]);
  assert.deepEqual(rows[1], ['TCGDEX-swsh12.5', '001', false, false, T0]);
  assert.deepEqual(rows[2], ['', '', '', '', '']);
  assert.deepEqual(rows[3], ['swsh12pt5', '6', true, false, T0]);
  assert.deepEqual(rows[4], ['swsh12pt5', 'XYZ', true, false, T0]);
  assert.deepEqual(rows[5], ['me5', '1', true, false, T0]);
  // Nur Karte 2 hatte keine Zeile -> eine neue kanonische Zeile
  assert.equal(rows.length, 7);
  assert.deepEqual(rows[6].slice(0, 4), ['swsh12pt5', '2', false, false]);

  const map = await readSetCollectionMap('Crown Zenith', { setId: 'swsh12pt5' });
  assert.equal(map.get('GG1').g, true);
  assert.equal(map.get('6').g, true);
});

test('Import: kanonische Zeilen einer Karte werden mit den Alias-Haken synchronisiert, Schluessel bleibt', async () => {
  const fake = setup({
    overview: [['swsh12pt5', 'Crown Zenith']],
    collection: [
      ['swsh12pt5gg', 'GG1', true, true, T0],
      ['swsh12pt5', 'GG01', false, false, T0]
    ]
  });
  await importSetIntoCollection({ setId: 'swsh12pt5', setName: 'Crown Zenith' }, v3Cards(['GG1']));
  const rows = collectionRows(fake);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], ['swsh12pt5gg', 'GG1', true, true, T0]);
  assert.deepEqual(rows[1].slice(0, 4), ['swsh12pt5', 'GG01', true, true]);
});

test('WRITE_DB_CARDS=false -> kein db_cards-/db_sets-Write, Overview und Sammlung schon', async () => {
  const fake = setup({ overview: [['me5', 'Mega Evolution 5']] });
  CONFIG.WRITE_DB_CARDS = false;
  try {
    await importSetIntoCollection({ setId: 'me5', setName: 'Mega Evolution 5' }, [{ collectionKey: '1', number: '1', cardId: 'me5-1' }]);
  } finally {
    CONFIG.WRITE_DB_CARDS = true;
  }
  assert.equal(fake.writesTo('db_cards').length, 0);
  assert.equal(fake.writesTo('db_sets').length, 0);
  assert.ok(fake.writesTo('Sets Overview').length > 0);
  assert.deepEqual(collectionRows(fake).map((r) => r.slice(0, 4)), [['me5', '1', false, false]]);
});

test('WRITE_DB_CARDS=true -> db_cards und db_sets werden geschrieben', async () => {
  const fake = setup({ overview: [['me5', 'Mega Evolution 5']] });
  await importSetIntoCollection({ setId: 'me5', setName: 'Mega Evolution 5' }, [{ collectionKey: '1', number: '1', cardId: 'me5-1' }]);
  assert.ok(fake.writesTo('db_cards').length > 0);
  assert.ok(fake.writesTo('db_sets').length > 0);
});

// ── Echte Registry ────────────────────────────────────────────────────────────
function realRegistry() {
  const sets = JSON.parse(fs.readFileSync(path.join(realRegistryDir, 'sets.json'), 'utf8'));
  const cards = (id) => {
    const file = path.join(realRegistryDir, 'cards', `${encodeURIComponent(id)}.json`);
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : undefined;
  };
  return [sets, cards];
}

test('echte api/registry: me5, swsh12pt5, me55c, cel25c', async () => {
  setup({
    registry: realRegistry(),
    collection: [
      ['TCGDEX-me05', '1', true, false, T0],
      ['me5', '1', false, false, T0],
      ['swsh12pt5', 'GG1', true, true, T0],
      ['swsh12pt5gg', 'GG1', false, false, T0],
      ['TCGDEX-30th-c', '11', true, false, T0],
      ['me55c', '11', false, false, T0],
      ['cel25c', '15', true, false, T0]
    ]
  });
  const me5 = await readSetCollectionMap('x', { setId: 'me5' });
  assert.equal(me5.get('1').g, true);
  assert.equal(me5.get('1').cells.length, 2);

  const swsh = await readSetCollectionMap('x', { setId: 'swsh12pt5gg' });
  assert.equal(swsh.get('GG1').cells.length, 2);
  assert.equal(swsh.get('GG1').rh, true);

  const me55c = await readSetCollectionMap('x', { setId: 'me55c' });
  const tdKey = [...me55c.entries()].find(([, e]) => e.cells.some((c) => c.setKey === 'TCGDEX-30th-c'))?.[0];
  assert.ok(tdKey, 'TCGDEX-30th-c/11 aufgeloest');
  const ambEntries = [...me55c.entries()].filter(([, e]) => e.ambiguous?.legacyKey === '11');
  assert.ok(ambEntries.length >= 2, 'me55c/11 mehrdeutig');
  assert.ok(!ambEntries.some(([k]) => k === tdKey), 'verschiedene Karten');
  assert.ok(ambEntries.every(([, e]) => e.g === false));

  const cel = await readSetCollectionMap('x', { setId: 'cel25c' });
  const celAmb = [...cel.values()].filter((e) => e.ambiguous?.legacyKey === '15');
  assert.ok(celAmb.length >= 2);
  assert.ok(celAmb.every((e) => e.g === false && e.ambiguous.g === true));
});

// ── Optional: echte Referenz-DBs (.local/fixtures, nie committet) ─────────────
const fixtureDir = path.join(root, '.local/fixtures');
const fixtures = fs.existsSync(fixtureDir) ? fs.readdirSync(fixtureDir).filter((f) => f.endsWith('db_collection.csv')) : [];

test('Referenz-DBs: buildCollectionMap ueber echte db_collection-Zeilen (nur Zaehler)', async (t) => {
  if (!fixtures.length) return t.skip('keine .local/fixtures/*db_collection.csv');
  const { parseCsv } = await import('../../../scripts/api/lib/csv.mjs');
  const [sets, cards] = realRegistry();
  const { createCollectionKeyResolver } = await import('../js/data/v3-collection-keys.js');
  const cardsBySet = new Map();
  const resolver = createCollectionKeyResolver(sets, cardsBySet);
  for (const f of fixtures) {
    const parsed = parseCsv(fs.readFileSync(path.join(fixtureDir, f), 'utf8'));
    const header = parsed[0];
    const idx = ['setId', 'cardId', 'g', 'rh', 'updatedAt'].map((h) => header.indexOf(h));
    const rows = parsed.slice(1).map((r) => idx.map((i) => (i >= 0 ? r[i] ?? '' : '')));
    const canonicalIds = new Set(rows.map((r) => resolver.resolveSetKey(r[0])).filter(Boolean));
    for (const id of canonicalIds) if (!cardsBySet.has(id)) cardsBySet.set(id, cards(id) || {});
    const total = { sets: 0, rows: 0, resolved: 0, ambiguous: 0, orphan: 0, unresolvedAlias: 0, multiCell: 0, gRows: 0, gCards: 0 };
    let lost = 0;
    for (const id of canonicalIds) {
      const { map, stats } = buildCollectionMap(rows, { canonicalSetId: id, resolver });
      total.sets += 1;
      total.rows += stats.matchedRows;
      total.resolved += stats.resolvedRows;
      total.ambiguous += stats.ambiguousRows;
      total.orphan += stats.orphanRows;
      total.unresolvedAlias += stats.unresolvedAliasRows;
      for (const e of map.values()) {
        if (e.cells.length > 1) total.multiCell += 1;
        if (e.g) total.gCards += 1;
        // Kein Haken darf verloren gehen: jede g-Zeile ist in g ihrer Karte, mehrdeutig vermerkt oder verwaist sichtbar
        if (e.cells.some((c) => c.g) && !e.g) lost += 1;
      }
    }
    total.gRows = rows.filter((r) => resolver.resolveSetKey(r[0]) && String(r[2]).toLowerCase() === 'true').length;
    console.log(`# fixture#${fixtures.indexOf(f)}: ${JSON.stringify(total)} lost=${lost}`);
    assert.equal(lost, 0);
    assert.equal(total.unresolvedAlias, 0);
  }
});
