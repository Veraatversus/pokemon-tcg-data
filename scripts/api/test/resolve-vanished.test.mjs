// Automatische Behandlung verschwundener TCGdex-Referenzen (vor buildRegistry): eindeutige Faelle werden
// aufgeloest (stilllegen, Verweis entfernen, eindeutig umhaengen), alles andere bleibt Drift (manuell).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveVanishedRefs, MAX_VANISHED_PER_SET } from '../registry/resolve-vanished.mjs';

const tdSet = (id, cards) => ({ id, cards: Object.entries(cards).map(([localId, en]) => ({ localId, name: { en } })) });
const card = (refs, { pokemontcg = null, tcgdexKeys } = {}) => ({
  keys: { pokemontcg: pokemontcg ? ['1'] : [], tcgdex: tcgdexKeys ?? refs.map(([, l]) => l) },
  pokemontcg,
  tcgdex: refs.map(([set, localId]) => ({ set, localId })),
});

test('geloeschte Karte ohne andere Quelle wird stillgelegt (tcgdex [])', () => {
  const previous = { sets: {}, cards: { det1: { 24: card([['det1', '24']]), 25: card([['det1', '25']]) } } };
  const { registry, changes } = resolveVanishedRefs({
    previous,
    tcgdexSets: [tdSet('det1', { 24: 'Pikachu' })],
    previousNames: new Map([['det1/25', 'Lt. Yoshida']]),
  });
  assert.deepEqual(registry.cards.det1['25'].tcgdex, []);
  assert.deepEqual(registry.cards.det1['25'].keys.tcgdex, ['25'], 'Schluessel bleibt');
  assert.deepEqual(changes, [{ kind: 'retired', card: 'det1/25', ref: 'det1/25', name: 'Lt. Yoshida' }]);
  assert.deepEqual(previous.cards.det1['25'].tcgdex, [{ set: 'det1', localId: '25' }], 'Eingabe unveraendert');
});

test('Karte mit pokemontcg-Quelle verliert nur den verschwundenen Verweis', () => {
  const previous = { sets: {}, cards: { sv1: { 7: card([['sv01', '007']], { pokemontcg: 'sv1-7' }) } } };
  const { registry, changes } = resolveVanishedRefs({ previous, tcgdexSets: [tdSet('sv01', { '001': 'A' })], previousNames: new Map() });
  assert.deepEqual(registry.cards.sv1['7'].tcgdex, []);
  assert.equal(registry.cards.sv1['7'].pokemontcg, 'sv1-7');
  assert.equal(changes[0].kind, 'ref-removed');
});

test('eindeutig umnummeriert (gleicher Name, unbelegt, gleiches Set): Verweis umhaengen, neuer Schluessel dazu', () => {
  const previous = { sets: {}, cards: { s1: { 10: card([['s1', '10']]), 11: card([['s1', '11']]) } } };
  const { registry, changes } = resolveVanishedRefs({
    previous,
    tcgdexSets: [tdSet('s1', { 10: 'Alpha', '10a': 'Beta', 11: 'Gamma' })],
    previousNames: new Map([['s1/10', 'Alpha'], ['s1/11', 'Gamma']]),
  });
  // s1/10 existiert noch -> nichts; hier gibt es nichts aufzuloesen
  assert.deepEqual(changes, []);
  const prev2 = { sets: {}, cards: { s1: { 12: card([['s1', '12']]) } } };
  const r2 = resolveVanishedRefs({
    previous: prev2,
    tcgdexSets: [tdSet('s1', { '12a': 'Delta', 13: 'Epsilon' })],
    previousNames: new Map([['s1/12', 'Delta']]),
  });
  assert.deepEqual(r2.registry.cards.s1['12'].tcgdex, [{ set: 's1', localId: '12a' }]);
  assert.deepEqual(r2.registry.cards.s1['12'].keys.tcgdex, ['12', '12a']);
  assert.deepEqual(r2.changes, [{ kind: 'repointed', card: 's1/12', ref: 's1/12', to: 's1/12a', name: 'Delta' }]);
});

test('mehrdeutig (zwei unbelegte gleichnamige Karten): bleibt manuell', () => {
  const previous = { sets: {}, cards: { s1: { 12: card([['s1', '12']]) } } };
  const { registry, changes, unresolved } = resolveVanishedRefs({
    previous,
    tcgdexSets: [tdSet('s1', { '12a': 'Delta', '12b': 'Delta' })],
    previousNames: new Map([['s1/12', 'Delta']]),
  });
  assert.deepEqual(registry.cards.s1['12'].tcgdex, [{ set: 's1', localId: '12' }]);
  assert.deepEqual(changes, []);
  assert.deepEqual(unresolved, ['s1/12: s1/12 (mehrdeutig: s1/12a, s1/12b)']);
});

test('ganzes TCGdex-Set verschwunden (z. B. umbenannt): bleibt manuell', () => {
  const previous = { sets: {}, cards: { old: { 1: card([['oldset', '1']]) } } };
  const { changes, unresolved } = resolveVanishedRefs({ previous, tcgdexSets: [tdSet('newset', { 1: 'A' })], previousNames: new Map() });
  assert.deepEqual(changes, []);
  assert.equal(unresolved.length, 1);
});

test('zu viele verschwundene Karten in einem Set: bleibt manuell (Massenumbau)', () => {
  const cards = {};
  const names = new Map();
  for (let i = 1; i <= MAX_VANISHED_PER_SET + 1; i++) { cards[i] = card([['s1', String(i)]]); names.set(`s1/${i}`, `N${i}`); }
  const { changes, unresolved } = resolveVanishedRefs({ previous: { sets: {}, cards: { s1: cards } }, tcgdexSets: [tdSet('s1', { 99: 'X' })], previousNames: names });
  assert.deepEqual(changes, []);
  assert.equal(unresolved.length, MAX_VANISHED_PER_SET + 1);
});

test('ohne vorherige Registry: nichts zu tun', () => {
  assert.deepEqual(resolveVanishedRefs({ previous: null, tcgdexSets: [], previousNames: new Map() }), { registry: null, changes: [], unresolved: [] });
});

test('ein Kandidat fuer zwei verschwundene Karten: beide bleiben manuell', () => {
  const previous = { sets: {}, cards: { s1: { 12: card([['s1', '12']]), 13: card([['s1', '13']]) } } };
  const { changes, unresolved } = resolveVanishedRefs({
    previous,
    tcgdexSets: [tdSet('s1', { '12a': 'Delta' })],
    previousNames: new Map([['s1/12', 'Delta'], ['s1/13', 'Delta']]),
  });
  assert.deepEqual(changes, []);
  assert.equal(unresolved.length, 2);
});
