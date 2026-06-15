import test from 'node:test';
import assert from 'node:assert/strict';

import {
  collectDeleteSetCellUpdates,
  applyDeleteSetCellUpdates,
} from '../js/features/collection/delete-set-cells.js';

function makeCollectionMap(entries = []) {
  return new Map(entries.map((entry) => [entry.cardId, entry]));
}

test('collectDeleteSetCellUpdates liefert leere Liste ohne Karteureinträge', () => {
  assert.deepEqual(collectDeleteSetCellUpdates(new Map()), []);
});

test('collectDeleteSetCellUpdates ignoriert Einträge ohne gültige Zell-Koordinaten', () => {
  const map = makeCollectionMap([
    { cardId: '1', gCell: { row: 4, col: 3 }, rhCell: { row: 4, col: 4 } },
    { cardId: '2', gCell: { row: 0, col: 3 } }, // ungültig (row=0)
    { cardId: '3', gCell: { row: 7 } }, // ungültig (col fehlt)
    { cardId: '4' }, // komplett ohne gCell/rhCell
  ]);
  assert.deepEqual(collectDeleteSetCellUpdates(map), [
    { row: 4, col: 3, value: false },
    { row: 4, col: 4, value: false },
  ]);
});

test('collectDeleteSetCellUpdates behandelt nullish und kaputte Map-Argumente', () => {
  assert.deepEqual(collectDeleteSetCellUpdates(null), []);
  assert.deepEqual(collectDeleteSetCellUpdates(undefined), []);
  assert.deepEqual(collectDeleteSetCellUpdates({}), []);
});

test('collectDeleteSetSetCellUpdates normalisiert Strings zu Zahlen', () => {
  const map = makeCollectionMap([
    { cardId: '1', gCell: { row: '5', col: '3' }, rhCell: { row: '6', col: '4' } },
  ]);
  assert.deepEqual(collectDeleteSetCellUpdates(map), [
    { row: 5, col: 3, value: false },
    { row: 6, col: 4, value: false },
  ]);
});

test('applyDeleteSetCellUpdates ruft updateCellBooleansBatch genau einmal mit allen Updates auf', async () => {
  const map = makeCollectionMap([
    { cardId: '1', gCell: { row: 4, col: 3 }, rhCell: { row: 4, col: 4 } },
    { cardId: '2', gCell: { row: 8, col: 3 }, rhCell: { row: 8, col: 4 } },
    { cardId: '3', gCell: { row: 12, col: 3 } },
  ]);
  const calls = [];
  const updateCellBooleansBatch = async (setName, updates, opts) => {
    calls.push({ setName, updates, opts });
    return updates.length;
  };

  const result = await applyDeleteSetCellUpdates({
    setName: 'Optimale Ordnung',
    collectionMap: map,
    updateCellBooleansBatch,
    chunkSize: 250,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].setName, 'Optimale Ordnung');
  assert.equal(calls[0].opts.chunkSize, 250);
  assert.deepEqual(calls[0].updates, [
    { row: 4, col: 3, value: false },
    { row: 4, col: 4, value: false },
    { row: 8, col: 3, value: false },
    { row: 8, col: 4, value: false },
    { row: 12, col: 3, value: false },
  ]);
  assert.equal(result, 5);
});

test('applyDeleteSetCellUpdates ist No-Op bei leerer Map und ruft den Batch-Endpoint NICHT', async () => {
  let callCount = 0;
  const updateCellBooleansBatch = async () => {
    callCount += 1;
    return 0;
  };

  const result = await applyDeleteSetCellUpdates({
    setName: 'leeres Set',
    collectionMap: new Map(),
    updateCellBooleansBatch,
  });

  assert.equal(callCount, 0);
  assert.equal(result, 0);
});

test('applyDeleteSetCellUpdates wirft, wenn kein Batch-Updater übergeben wurde', async () => {
  await assert.rejects(
    applyDeleteSetCellUpdates({ setName: 'x', collectionMap: new Map() }),
    /updateCellBooleansBatch ist erforderlich/
  );
});

test('applyDeleteSetCellUpdates verarbeitet 240 Karten (Batch < 429-Limit) in einem Aufruf', async () => {
  // Reale Sets haben ~180–240 Karten; die alten Per-Cell-Updates führten
  // hier reproduzierbar zu 429. Wir vergewissern uns, dass der Aufruf
  // weiterhin in einem einzigen batchUpdate bleibt.
  const entries = [];
  for (let i = 0; i < 120; i += 1) {
    entries.push({
      cardId: `c-${i}`,
      gCell: { row: 4 + i, col: 3 },
      rhCell: { row: 4 + i, col: 4 },
    });
  }
  const map = makeCollectionMap(entries);

  const calls = [];
  const updateCellBooleansBatch = async (setName, updates) => {
    calls.push(updates.length);
    return updates.length;
  };

  const result = await applyDeleteSetCellUpdates({
    setName: 'big-set',
    collectionMap: map,
    updateCellBooleansBatch,
    chunkSize: 250,
  });

  assert.equal(calls.length, 1, 'genau EIN batchUpdate für ein 240-Zellen-Set');
  assert.equal(calls[0], 240);
  assert.equal(result, 240);
});
