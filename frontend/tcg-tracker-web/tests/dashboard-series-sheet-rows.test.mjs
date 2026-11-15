// Task 11 Runde 4: db_sets-Zeilen (np/pop1/tk1a/TCGdex-Trainer-Kits) laufen durch listSetsOverviewData, den
// loadSets-Merge und resolveDisplaySet; die Serien-Gruppen muessen dabei zusammenfallen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createFakeSpreadsheet } from './helpers/fake-sheets.mjs';

const store = new Map([['poke:release:tcg_spreadsheet_id', 'sheet-test']]);
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k)
};
const { CONFIG, scopedStorageKey } = await import('../js/core/config.js');
const { SET_DB_HEADERS, CARD_DB_HEADERS, resolveSeriesGroupInfo, resolveDisplaySet, applyDeSeriesFallback, setV3SetMeta } = await import('../js/data/schema-contract.js');
const { fetchV3SetMeta } = await import('../js/data/pokemon-api.js');
const { resetV3Caches } = await import('../js/data/v3-api.js');
const { resetCollectionResolverCache } = await import('../js/data/collection-aliases.js');
const { listSetsOverviewData, listImportedSets, resetSheetsDataCaches } = await import('../js/data/sheets-db.js');

CONFIG.APIS.REGISTRY_BASE = 'https://reg.test/registry/';
CONFIG.APIS.V3_BASE = 'https://reg.test/v3/';
const SETS = JSON.parse(readFileSync(fileURLToPath(new URL('../../../api/v3/sets.json', import.meta.url)), 'utf8'));
const T0 = '2026-01-01T00:00:00.000Z';
// Spalten wie SET_DB_HEADERS: [0] setId [1] imported [5] vera_id [7] vera_name [9] vera_series [10] tcgdex_serie_name [11] tcgdex_serie_id
const row = (setId, imported, veraName, veraSeries, deSeries, deSerieId) => {
  const r = new Array(SET_DB_HEADERS.length).fill('');
  Object.assign(r, { 0: setId, 1: imported, 2: T0, 3: 'matched', 4: false, 5: setId, 7: veraName, 9: veraSeries, 10: deSeries, 11: deSerieId });
  return r;
};

function setup(dbSets) {
  resetSheetsDataCaches(); resetCollectionResolverCache(); resetV3Caches();
  globalThis.fetch = async () => ({ ok: false, status: 404, json: async () => null });
  const fake = createFakeSpreadsheet({
    db_sets: [SET_DB_HEADERS, ...dbSets],
    db_cards: [CARD_DB_HEADERS],
    db_collection: [['setId', 'cardId', 'g', 'rh', 'updatedAt']],
    'Sets Overview': [['Sets Overview'], ['setId', 'setName']]
  });
  globalThis.gapi = fake.gapi;
}

for (const imported of [false, true]) {
  test(`db_sets-Zeilen (imported=${imported}): np gehoert zu POP, tk1a zu Trainer Kits (DE und EN)`, async () => {
    setup([
      row('np', imported, 'Nintendo Promos', 'NP', 'POP', 'pop'),
      row('pop1', imported, 'POP Series 1', 'POP', 'POP', 'pop'),
      row('tk1a', imported, 'EX Trainer Kit', 'EX', 'Trainer kits', 'tk'),
      row('TCGDEX-tk-dp-l', imported, 'Trainer Kit DP', 'Trainer kits', 'Trainer kits', 'tk'),
      row('ex1', imported, 'EX Ruby', 'EX', 'EX', 'ex')
    ]);
    const meta = await fetchV3SetMeta({ loadSets: async () => SETS });
    try {
      setV3SetMeta(meta);
      const overview = await listSetsOverviewData();
      const imp = await listImportedSets();
      assert.equal(imp.length, imported ? 5 : 0);
      // loadSets-Merge (app.js): overview, dann importierte Zeilen darueber
      const merged = new Map();
      overview.forEach((s) => merged.set(s.setId, { ...s }));
      imp.forEach((s) => merged.set(s.setId, { ...(merged.get(s.setId) || {}), ...s, imported: true }));
      const all = [...merged.values()].map((s) => resolveDisplaySet(applyDeSeriesFallback(s, null)));
      const by = Object.fromEntries(all.map((s) => [s.setId, s]));
      for (const lang of ['de', 'en']) {
        localStorage.setItem(scopedStorageKey('user-settings'), JSON.stringify({ cardLanguage: lang }));
        const key = (id) => resolveSeriesGroupInfo(by[id]).key;
        assert.equal(by.np.tcgdex_serie_name, 'POP');
        assert.equal(key('np'), key('pop1'), `${lang} np/pop1`);
        assert.equal(key('tk1a'), key('TCGDEX-tk-dp-l'), `${lang} tk1a`);
        assert.notEqual(key('tk1a'), key('ex1'), `${lang} tk1a/ex1`);
      }
    } finally {
      setV3SetMeta(null);
      localStorage.removeItem(scopedStorageKey('user-settings'));
    }
  });
}
