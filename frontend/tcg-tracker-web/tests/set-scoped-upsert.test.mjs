import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSetScopedKey,
  planSetScopedUpsert,
  planSetScopedDedup
} from '../js/data/set-scoped-upsert.js';

test('buildSetScopedKey normalizes set/card ids and composes a stable key', () => {
  assert.equal(buildSetScopedKey(' SV1 ', ' 001 '), 'sv1::001');
  assert.equal(buildSetScopedKey('', '001'), '');
  assert.equal(buildSetScopedKey('sv1', ''), '');
});

test('planSetScopedUpsert updates existing row, appends missing row, and clears stale duplicates', () => {
  const rows = [
    ['sv1', '001', 'old-a'],
    ['sv1', '001', 'old-b'],
    ['sv1', '099', 'stale'],
    ['swsh1', '001', 'other-set']
  ];

  const incomingRows = [
    ['sv1', '001', 'fresh'],
    ['sv1', '002', 'new-card']
  ];

  const plan = planSetScopedUpsert({
    rows,
    setId: 'sv1',
    incomingRows,
    clearMissing: true
  });

  assert.deepEqual(plan.updates, [
    { rowIndex: 1, rowValues: ['sv1', '001', 'fresh'] }
  ]);
  assert.deepEqual(plan.appendRows, [
    ['sv1', '002', 'new-card']
  ]);
  assert.deepEqual(plan.clearIndices, [0, 2]);
});

test('planSetScopedDedup keeps latest row per key and clears only older duplicates', () => {
  const rows = [
    ['sv1', '001', 'old'],
    ['sv1', '002', 'stable'],
    ['sv1', '001', 'newest'],
    ['swsh1', '001', 'foreign']
  ];

  const plan = planSetScopedDedup({ rows, setId: 'sv1' });
  assert.deepEqual(plan.clearIndices, [0]);
});