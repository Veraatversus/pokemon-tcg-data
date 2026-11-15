// Oeffentliche API von sheets-db.js: Die Exportliste vor der Aufteilung in sheets-client.js bleibt unveraendert.
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k)
};

const EXPECTED_EXPORTS = [
  'appendCollectionRows',
  'cellsForUpdate',
  'ensureCollectionEntry',
  'ensureSettingsSheet',
  'importSetIntoCollection',
  'invalidateCollectionRowCache',
  'listCollectionSetIds',
  'listImportedSets',
  'listSetsOverviewData',
  'markAliasSetRowsNotImported',
  'prefetchSetsOverviewRows',
  'readDbCardsForSet',
  'readSetCollectionMap',
  'readSettings',
  'readSummarySheet',
  'recoverImportedIdsFromOverview',
  'resetSheetsDataCaches',
  'syncOverviewWithApiSets',
  'updateCellBoolean',
  'updateCellBooleansBatch',
  'upsertOverviewSet',
  'writeSetting'
];

test('sheets-db.js exportiert genau die bisherigen Namen als Funktionen', async () => {
  const mod = await import('../js/data/sheets-db.js');
  assert.deepEqual(Object.keys(mod).sort(), [...EXPECTED_EXPORTS].sort());
  for (const name of EXPECTED_EXPORTS) {
    assert.equal(typeof mod[name], 'function', name);
  }
});
