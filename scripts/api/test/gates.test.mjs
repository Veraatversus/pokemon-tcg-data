import { test } from 'node:test';
import assert from 'node:assert/strict';
import { belowMinCardMatch, comparePairDrift } from '../report/gates.mjs';

const report = (pairs, extra = {}) => ({
  sets: Object.entries(pairs).map(([pokemontcgId, tcgdexId]) => ({ pokemontcgId, tcgdexId })),
  unmatchedPokemontcg: [], rejected: [], ...extra,
});
const prev = report({ a1: 'A1', b1: 'B1' });

test('kein Drift bei identischer Paarliste', () => {
  const d = comparePairDrift(prev, report({ b1: 'B1', a1: 'A1' }));
  assert.equal(d.drift, false);
  assert.deepEqual(d.messages, []);
});
test('geaendertes Paar', () => {
  const d = comparePairDrift(prev, report({ a1: 'A2', b1: 'B1' }));
  assert.equal(d.drift, true);
  assert.deepEqual(d.changed, [{ pokemontcgId: 'a1', from: 'A1', to: 'A2' }]);
  assert.match(d.messages[0], /Geaendertes Paar: a1: A1 -> A2/);
});
test('neues Paar', () => {
  const d = comparePairDrift(prev, report({ a1: 'A1', b1: 'B1', c1: 'C1' }));
  assert.deepEqual(d.added, [{ pokemontcgId: 'c1', tcgdexId: 'C1' }]);
  assert.equal(d.drift, true);
});
test('entferntes Paar', () => {
  const d = comparePairDrift(prev, report({ a1: 'A1' }));
  assert.deepEqual(d.removed, [{ pokemontcgId: 'b1', tcgdexId: 'B1' }]);
  assert.equal(d.drift, true);
});
test('ungepaarte pokemontcg-Sets sind Drift', () => {
  const d = comparePairDrift(prev, report({ a1: 'A1', b1: 'B1' }, { unmatchedPokemontcg: ['z9'] }));
  assert.equal(d.drift, true);
  assert.match(d.messages[0], /z9/);
});
test('abgelehntes Mapping ist Drift, andere Ablehnungen nicht', () => {
  const ok = comparePairDrift(prev, report({ a1: 'A1', b1: 'B1' }, { rejected: [{ pokemontcgId: 'q', tcgdexId: 'Q', method: 'name', reason: 'x' }] }));
  assert.equal(ok.drift, false);
  const bad = comparePairDrift(prev, report({ a1: 'A1', b1: 'B1' }, { rejected: [{ pokemontcgId: 'q', tcgdexId: 'Q', method: 'mapping', reason: 'x' }] }));
  assert.equal(bad.drift, true);
  assert.equal(bad.rejectedMapping.length, 1);
});

test('Mindestquote gegen ungerundeten Wert', () => {
  // 0.99496 rundet auf 0.995, darf die Schwelle 0.995 aber nicht erfuellen
  assert.equal(belowMinCardMatch({ matchedCards: 99496, ptCards: 100000 }, 0.995), true);
  assert.equal(belowMinCardMatch({ matchedCards: 99500, ptCards: 100000 }, 0.995), false);
  assert.equal(belowMinCardMatch({ matchedCards: 0, ptCards: 0 }, 0.995), false);
});
