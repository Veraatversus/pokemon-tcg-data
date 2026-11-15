// Ein fehlgeschlagener Schema-Check (z. B. Sheets-Zugriff ohne Login im Stoebermodus) darf nicht dauerhaft
// gecacht bleiben: nach dem Login muss der naechste Zugriff den Check neu ausfuehren und gelingen.
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map([['poke:release:tcg_spreadsheet_id', 'sheet-test']]);
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { SET_DB_HEADERS, CARD_DB_HEADERS } = await import('../js/data/schema-contract.js');
const { createFakeSpreadsheet } = await import('./helpers/fake-sheets.mjs');
const { readDbCardsForSet, resetSheetsDataCaches } = await import('../js/data/sheets-db.js');

test('Schema-Check wird nach einem Fehlschlag erneut versucht', async () => {
  resetSheetsDataCaches();
  delete globalThis.gapi; // ohne Login: kein gapi
  await assert.rejects(() => readDbCardsForSet('sv1'));

  const fake = createFakeSpreadsheet({
    db_sets: [SET_DB_HEADERS],
    db_cards: [CARD_DB_HEADERS],
    db_collection: [['setId', 'cardId', 'g', 'rh', 'updatedAt']],
  });
  globalThis.gapi = fake.gapi; // Login abgeschlossen
  const cards = await readDbCardsForSet('sv1');
  assert.ok(Array.isArray(cards));
  delete globalThis.gapi;
});
