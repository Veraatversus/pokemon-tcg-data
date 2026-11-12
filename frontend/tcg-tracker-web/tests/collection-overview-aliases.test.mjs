// Task 6: Overview-Zuordnung von Alias-Sets, Alias-Status in syncOverviewWithApiSets, lazy Registry-Karten
// und collectionKey im db_cards-Fallback – sheets-db.js gegen ein In-Memory-Spreadsheet.
import test from 'node:test';
import assert from 'node:assert/strict';
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
const { resetCollectionResolverCache } = await import('../js/data/collection-aliases.js');
const {
  listSetsOverviewData,
  listImportedSets,
  syncOverviewWithApiSets,
  readSetCollectionMap,
  readDbCardsForSet,
  listCollectionSetIds,
  readSummarySheet,
  upsertOverviewSet,
  markAliasSetRowsNotImported,

  resetSheetsDataCaches
} = await import('../js/data/sheets-db.js');

const REG = 'https://reg.test/registry/';
CONFIG.APIS.REGISTRY_BASE = REG;
CONFIG.APIS.V3_BASE = 'https://reg.test/v3/';

const SYN_SETS = {
  me5: { aliases: ['TCGDEX-me05'], mergedSubsets: [], pokemontcg: 'me5', tcgdex: 'me05' },
  swsh12pt5: {
    aliases: ['TCGDEX-swsh12.5', 'TCGDEX-swsh12.5gg', 'swsh12pt5gg'],
    mergedSubsets: ['swsh12pt5gg'],
    pokemontcg: 'swsh12pt5',
    tcgdex: 'swsh12.5'
  },
  base1: { aliases: [], mergedSubsets: [], pokemontcg: 'base1', tcgdex: 'base1' }
};
const card = (pt, td, keysPt, keysTd) => ({ keys: { pokemontcg: keysPt, tcgdex: keysTd }, pokemontcg: pt, tcgdex: td });
const SYN_CARDS = {
  me5: { 1: card('me5-1', [{ localId: '001', set: 'me05' }], ['1'], ['1']) },
  swsh12pt5: {
    1: card('swsh12pt5-1', [{ localId: '001', set: 'swsh12.5' }], ['1'], ['1']),
    GG1: card('swsh12pt5gg-GG01', [{ localId: 'GG01', set: 'swsh12.5gg' }], ['GG1'], ['GG1'])
  },
  base1: { 1: card('base1-1', [{ localId: '1', set: 'base1' }], ['1'], ['1']) }
};

let fetchLog = [];
function useRegistry() {
  fetchLog = [];
  globalThis.fetch = async (url) => {
    const u = String(url);
    fetchLog.push(u);
    let body;
    if (u === `${REG}sets.json`) body = SYN_SETS;
    else if (u.startsWith(`${REG}cards/`)) body = SYN_CARDS[decodeURIComponent(u.slice(`${REG}cards/`.length).replace(/\.json$/, ''))];
    if (body === undefined) return { ok: false, status: 404, json: async () => null };
    return { ok: true, status: 200, json: async () => body };
  };
}

const T0 = '2026-01-01T00:00:00.000Z';
const dbSetRow = (setId, imported, name) => [setId, imported, T0, 'matched', false, setId, '', name, '', ''];

function setup({ collection = [], overview = [], dbSets = [], dbCards = [], extraSheets = {} } = {}) {
  resetSheetsDataCaches();
  resetCollectionResolverCache();
  resetV3Caches();
  CONFIG.WRITE_DB_CARDS = true;
  useRegistry();
  const fake = createFakeSpreadsheet({
    db_sets: [SET_DB_HEADERS, ...dbSets],
    db_cards: [CARD_DB_HEADERS, ...dbCards],
    db_collection: [['setId', 'cardId', 'g', 'rh', 'updatedAt'], ...collection],
    'Sets Overview': [['Sets Overview'], ['setId', 'setName'], ...overview],
    ...extraSheets
  });
  globalThis.gapi = fake.gapi;
  return fake;
}

test('Overview: swsh12pt5gg imported -> swsh12pt5 imported, swsh12pt5gg nicht gelistet; Sheet unveraendert', async () => {
  const fake = setup({
    dbSets: [
      dbSetRow('swsh12pt5', false, 'Crown Zenith'),
      dbSetRow('swsh12pt5gg', true, 'Crown Zenith Galarian Gallery'),
      dbSetRow('TCGDEX-me05', true, 'Mega Evolution 5'),
      dbSetRow('base1', false, 'Base')
    ]
  });
  const before = fake.rows('db_sets').map((r) => [...r]);
  const sets = await listSetsOverviewData();
  assert.deepEqual(sets.map((s) => [s.setId, s.imported]).sort(), [['base1', false], ['me5', true], ['swsh12pt5', true]]);
  assert.ok(sets.find((s) => s.setId === 'swsh12pt5').aliases.includes('swsh12pt5gg'));
  assert.deepEqual(sets.find((s) => s.setId === 'me5').aliases, ['TCGDEX-me05']);
  const imported = await listImportedSets();
  assert.deepEqual(imported.map((s) => s.setId).sort(), ['me5', 'swsh12pt5']);
  assert.deepEqual(fake.rows('db_sets'), before);
  assert.equal(fake.writes.filter((w) => w.sheet === 'db_sets').length, 0);
});

test('Overview: Registry offline -> Zeilen unveraendert (keine leere Liste)', async () => {
  setup({ dbSets: [dbSetRow('swsh12pt5gg', true, 'GG'), dbSetRow('base1', false, 'Base')] });
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  const sets = await listSetsOverviewData();
  assert.deepEqual(sets.map((s) => s.setId).sort(), ['base1', 'swsh12pt5gg']);
});

test('syncOverviewWithApiSets: imported der Alias-Zeile geht per ODER aufs Hauptset, Alias-Zeile bleibt', async () => {
  const fake = setup({
    dbSets: [dbSetRow('swsh12pt5gg', true, 'Crown Zenith Galarian Gallery')],
    overview: [['swsh12pt5gg', 'Crown Zenith GG', '', '', '', '', '', '', true]]
  });
  await syncOverviewWithApiSets([{ setId: 'swsh12pt5', setName: 'Crown Zenith', aliases: SYN_SETS.swsh12pt5.aliases }], []);
  const dbSets = fake.rows('db_sets').slice(1);
  assert.deepEqual(dbSets.map((r) => [r[0], r[1]]), [['swsh12pt5gg', true], ['swsh12pt5', true]]);
  const overview = fake.rows('Sets Overview').slice(2);
  assert.deepEqual(overview.map((r) => r[0]), ['swsh12pt5gg', 'swsh12pt5']);
  assert.equal(overview[1][CONFIG.GRID.IMPORTED_COL_INDEX - 1], true);
});

test('readSetCollectionMap laedt Registry-Karten nur fuer Sets mit Zeilen oder Legacy-Blatt', async () => {
  setup({ collection: [['TCGDEX-me05', '001', true, false, T0]] });
  const empty = await readSetCollectionMap('Base', { setId: 'base1' });
  assert.equal(empty.size, 0);
  assert.deepEqual(fetchLog, [`${REG}sets.json`]);
  const me5 = await readSetCollectionMap('Mega Evolution 5', { setId: 'me5' });
  assert.equal(me5.get('1').g, true);
  assert.deepEqual(fetchLog, [`${REG}sets.json`, `${REG}cards/me5.json`]);
});

test('readSetCollectionMap: ohne Zeilen, aber mit Legacy-Blatt -> normaler Pfad (Karten werden geladen)', async () => {
  setup({ extraSheets: { Base: [[], []] } });
  await readSetCollectionMap('Base', { setId: 'base1' });
  assert.ok(fetchLog.includes(`${REG}cards/base1.json`));
});

test('listCollectionSetIds: ueber Aliase, ohne Karten-Requests; checkedOnly', async () => {
  setup({
    collection: [
      ['TCGDEX-me05', '001', true, false, T0],
      ['swsh12pt5gg', 'GG01', false, false, T0],
      ['base1', '1', true, false, T0],
      ['unknown', '1', true, false, T0]
    ]
  });
  assert.deepEqual([...await listCollectionSetIds()].sort(), ['base1', 'me5', 'swsh12pt5', 'unknown']);
  assert.deepEqual([...await listCollectionSetIds({ checkedOnly: true })].sort(), ['base1', 'me5', 'unknown']);
  assert.deepEqual(fetchLog, [`${REG}sets.json`]);
});

test('readDbCardsForSet (Offline-Fallback) setzt collectionKey aus der v3-id, sonst aus der Nummer', async () => {
  const row = (cardId, number) => {
    const r = new Array(CARD_DB_HEADERS.length).fill('');
    r[0] = 'swsh12pt5'; r[1] = cardId; r[2] = T0; r[3] = 'matched'; r[8] = number; r[10] = `Karte ${number}`;
    return r;
  };
  setup({ dbCards: [row('swsh12pt5-GG1', 'GG01'), row('swsh12pt5-1', '001'), row('swsh12pt5gg-GG02', 'GG02')] });
  const cards = await readDbCardsForSet('swsh12pt5');
  assert.deepEqual(cards.map((c) => [c.cardId, c.collectionKey]), [['swsh12pt5-GG1', 'GG1'], ['swsh12pt5-1', '1'], ['swsh12pt5gg-GG02', 'GG2']]);
});

test('readSummarySheet: Alias-Zeilen zaehlen zum Hauptset, eine Karte unter zwei Aliasen zaehlt einmal', async () => {
  setup({
    dbSets: [
      dbSetRow('swsh12pt5', true, 'Crown Zenith'),
      dbSetRow('swsh12pt5gg', false, 'Crown Zenith Galarian Gallery'),
      dbSetRow('me5', true, 'Mega Evolution 5')
    ],
    collection: [
      ['swsh12pt5', '1', true, false, T0],
      ['swsh12pt5', 'GG1', false, false, T0],
      ['swsh12pt5gg', 'GG01', true, true, T0],
      ['me5', '1', true, false, T0],
      ['me5', '001', false, false, T0]
    ]
  });
  const summary = await readSummarySheet();
  const crz = summary.find((row) => row.setName === 'Crown Zenith');
  assert.deepEqual([crz.total, crz.collected, crz.rh], [2, 2, 1]);
  assert.equal(summary.some((row) => row.setName === 'Crown Zenith Galarian Gallery'), false);
  const me5 = summary.find((row) => row.setName === 'Mega Evolution 5');
  assert.deepEqual([me5.total, me5.collected], [1, 1]);
  // Registry-Karten nur fuer das Set mit Zeilen unter mehreren Aliasen
  assert.deepEqual(fetchLog, [`${REG}sets.json`, `${REG}cards/swsh12pt5.json`]);
});

test('Set loeschen bleibt: Alias-Zeilen (db_sets + Overview) auf imported=false, nichts geloescht, kein ODER zurueck', async () => {
  const IMP = CONFIG.GRID.IMPORTED_COL_INDEX - 1;
  const ovRow = (id, name, imported) => [id, name, '', '', '', '', '', '', imported, false];
  const fake = setup({
    dbSets: [
      dbSetRow('swsh12pt5', true, 'Crown Zenith'),
      dbSetRow('swsh12pt5gg', true, 'Crown Zenith Galarian Gallery'),
      dbSetRow('TCGDEX-swsh12.5', true, 'Crown Zenith (TCGdex)'),
      dbSetRow('base1', true, 'Base')
    ],
    overview: [
      ovRow('swsh12pt5', 'Crown Zenith', true),
      ovRow('swsh12pt5gg', 'Crown Zenith GG', true),
      ovRow('base1', 'Base', true)
    ]
  });
  const [set] = (await listSetsOverviewData()).filter((s) => s.setId === 'swsh12pt5');
  assert.equal(set.imported, true);
  const dbCountBefore = fake.rows('db_sets').length;
  const ovCountBefore = fake.rows('Sets Overview').length;

  await upsertOverviewSet(set, false);
  const changed = await markAliasSetRowsNotImported(set);
  assert.deepEqual(changed, { dbSets: 2, overview: 1 });

  assert.equal(fake.rows('db_sets').length, dbCountBefore, 'keine db_sets-Zeile geloescht/angelegt');
  assert.equal(fake.rows('Sets Overview').length, ovCountBefore, 'keine Overview-Zeile geloescht/angelegt');
  assert.deepEqual(fake.rows('db_sets').slice(1).map((r) => [r[0], r[1]]),
    [['swsh12pt5', false], ['swsh12pt5gg', false], ['TCGDEX-swsh12.5', false], ['base1', true]]);
  assert.deepEqual(fake.rows('Sets Overview').slice(2).map((r) => [r[0], r[IMP]]),
    [['swsh12pt5', false], ['swsh12pt5gg', false], ['base1', true]]);
  // Nur Status-Zellen geschrieben (Alias-Zeilen: je eine Zelle)
  const aliasWrites = fake.writes.filter((w) => /!(B|I)[0-9]+$/.test(w.range));
  assert.ok(aliasWrites.length >= 3);

  resetSheetsDataCaches();
  const after = await listSetsOverviewData();
  assert.equal(after.find((s) => s.setId === 'swsh12pt5').imported, false);
  assert.equal(after.find((s) => s.setId === 'base1').imported, true);

  await syncOverviewWithApiSets([{ setId: 'swsh12pt5', setName: 'Crown Zenith', aliases: SYN_SETS.swsh12pt5.aliases }], []);
  assert.equal(fake.rows('db_sets').slice(1).find((r) => r[0] === 'swsh12pt5')[1], false, 'sync ODERt nicht zurueck');
  assert.equal(fake.rows('Sets Overview').slice(2).find((r) => r[0] === 'swsh12pt5')[IMP], false);
});

test('re-import fills empty tcgdex_serie_name without appending a row', async () => {
  const fake = setup({ dbSets: [dbSetRow('me5', true, 'Mega Evolution 5')] });
  const before = fake.rows('db_sets').length;
  await syncOverviewWithApiSets([{
    setId: 'me5', setName: 'X', aliases: ['TCGDEX-me05'],
    tcgdex_serie_name: 'Mega-Entwicklung', tcgdex_cardCount_official: 103, tcgdex_cardCount_total: 141
  }], []);
  const rows = fake.rows('db_sets');
  assert.equal(rows.length, before, 'keine neue Zeile');
  const row = rows.find((r) => r[0] === 'me5');
  const h = (name) => SET_DB_HEADERS.indexOf(name);
  assert.equal(row[h('tcgdex_serie_name')], 'Mega-Entwicklung');
  assert.equal(row[h('imported')], true);
});

test('readSetCollectionMap fresh: liest db_collection neu statt aus dem Cache (Restore plant gegen frischen Stand)', async () => {
  const fake = setup({ collection: [['me5', '1', true, false, T0]] });
  const cached = await readSetCollectionMap('Mega Evolution 5', { setId: 'me5' });
  assert.equal(cached.get('1').g, true);
  fake.rows('db_collection')[1][2] = false; // anderes Geraet hat den Haken entfernt
  const stale = await readSetCollectionMap('Mega Evolution 5', { setId: 'me5' });
  assert.equal(stale.get('1').g, true, 'ohne fresh: Cache');
  const fresh = await readSetCollectionMap('Mega Evolution 5', { setId: 'me5', strict: true, fresh: true });
  assert.equal(fresh.get('1').g, false);
});

test('markAliasSetRowsNotImported: ungemergtes Alias-Set loescht den imported-Status des kanonischen Sets nicht', async () => {
  const fake = setup({
    dbSets: [
      dbSetRow('swsh12pt5', true, 'Crown Zenith'),
      dbSetRow('swsh12pt5gg', true, 'Crown Zenith Galarian Gallery')
    ]
  });
  const changed = await markAliasSetRowsNotImported({ setId: 'swsh12pt5gg', setName: 'Crown Zenith Galarian Gallery' });
  assert.deepEqual(changed, { dbSets: 0, overview: 0 });
  assert.deepEqual(fake.rows('db_sets').slice(1).map((r) => [r[0], r[1]]), [['swsh12pt5', true], ['swsh12pt5gg', true]]);
});

test('listCollectionSetIds strict: Registry-Fehler wird durchgereicht, nicht-strict faellt auf rohe IDs zurueck', async () => {
  setup({ collection: [['TCGDEX-me05', '001', true, false, T0]] });
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  assert.deepEqual([...await listCollectionSetIds()], ['tcgdex-me05']);
  resetV3Caches();
  resetCollectionResolverCache();
  await assert.rejects(listCollectionSetIds({ strict: true }), /Failed to fetch|Registry|fetch/i);
});
