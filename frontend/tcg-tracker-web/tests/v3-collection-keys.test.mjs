import test from 'node:test';
import assert from 'node:assert/strict';
import { createCollectionKeyResolver } from '../js/data/v3-collection-keys.js';

const sets = {
  me5: { pokemontcg: 'me5', tcgdex: 'me05', mergedSubsets: [], aliases: ['TCGDEX-me05'] },
  swsh12pt5: { pokemontcg: 'swsh12pt5', tcgdex: 'swsh12.5', mergedSubsets: ['swsh12pt5gg'], aliases: ['TCGDEX-swsh12.5'] },
  me55: { pokemontcg: 'me55', tcgdex: null, mergedSubsets: ['me55c'], aliases: [] },
  'TCGDEX-30th-c': { pokemontcg: null, tcgdex: '30th-c', mergedSubsets: [], aliases: [] },
  cel25: { pokemontcg: 'cel25', tcgdex: 'cel25', mergedSubsets: ['cel25c'], aliases: ['TCGDEX-cel25'] },
};
const cardsBySet = new Map([
  ['me5', { 1: { pokemontcg: 'me5-1', tcgdex: [{ set: 'me05', localId: '001' }], keys: { pokemontcg: ['1'], tcgdex: ['1'] } } }],
  ['swsh12pt5', {
    GG1: { pokemontcg: 'swsh12pt5gg-GG1', tcgdex: [], keys: { pokemontcg: ['GG1'], tcgdex: [] } },
    1: { pokemontcg: 'swsh12pt5-1', tcgdex: [], keys: { pokemontcg: ['1'], tcgdex: [] } },
  }],
  ['me55', { 4: { pokemontcg: 'me55c-4', tcgdex: [], keys: { pokemontcg: ['4'], tcgdex: [] } } }],
  ['TCGDEX-30th-c', { 4: { pokemontcg: null, tcgdex: [{ set: '30th-c', localId: '4' }], keys: { pokemontcg: [], tcgdex: ['4'] } } }],
  ['cel25', {
    '15': { pokemontcg: 'cel25-15', tcgdex: [], keys: { pokemontcg: [], tcgdex: [] } },
    '15_A1': { pokemontcg: 'cel25c-15_A1', tcgdex: [], keys: { pokemontcg: [], tcgdex: [] }, ambiguousLegacyKey: '15' },
    '15_A2': { pokemontcg: 'cel25c-15_A2', tcgdex: [], keys: { pokemontcg: [], tcgdex: [] }, ambiguousLegacyKey: '15' },
  }],
]);
const r = createCollectionKeyResolver(sets, cardsBySet);

test('me55c/4 und TCGDEX-30th-c/4 sind verschiedene Karten', () => {
  assert.deepEqual(r.resolve('me55c', '4'), { setId: 'me55', collectionKey: '4' });
  assert.deepEqual(r.resolve('TCGDEX-30th-c', '4'), { setId: 'TCGDEX-30th-c', collectionKey: '4' });
});
test('Unterset-Alias loest nur Karten des Untersets auf', () => {
  assert.deepEqual(r.resolve('swsh12pt5gg', 'GG1'), { setId: 'swsh12pt5', collectionKey: 'GG1' });
  assert.equal(r.resolve('swsh12pt5gg', '1'), null);
});
test('TCGDEX-Namensraum', () => {
  assert.deepEqual(r.resolve('TCGDEX-me05', '001'), { setId: 'me5', collectionKey: '1' });
});
test('mehrdeutiger Altschluessel', () => {
  assert.equal(r.resolve('cel25c', '15'), null);
  assert.deepEqual(r.ambiguous('cel25c', '15'), { setId: 'cel25', legacyKey: '15', collectionKeys: ['15_A1', '15_A2'] });
  assert.equal(r.ambiguous('me5', '1'), null);
});
test('Set-Aliase case-insensitiv', () => {
  assert.equal(r.resolveSetKey('ME5'), 'me5');
  assert.equal(r.resolveSetKey('tcgdex-ME05'), 'me5');
  assert.equal(r.resolveSetKey('nope'), null);
  assert.deepEqual(r.resolve('SWSH12PT5GG', 'gg1'), { setId: 'swsh12pt5', collectionKey: 'GG1' });
});
test('aliasesOf enthaelt eigene ID', () => {
  assert.deepEqual(r.aliasesOf('swsh12pt5').sort(), ['TCGDEX-swsh12.5', 'swsh12pt5', 'swsh12pt5gg']);
  assert.deepEqual(r.aliasesOf('unknown'), []);
});
test('nicht geladene Karten: beschreibender Fehler, unbekanntes Set/leere Karte -> null', () => {
  const r2 = createCollectionKeyResolver(sets, new Map());
  assert.equal(r2.resolveSetKey('me5'), 'me5');
  assert.equal(r2.resolve('nope', '1'), null);
  assert.equal(r2.resolve('me5', ''), null);
  assert.throws(() => r2.resolve('me5', '1'), (e) => e.code === 'CARDS_NOT_LOADED' && e.setId === 'me5');
  assert.throws(() => r2.ambiguous('me5', '1'), (e) => e.code === 'CARDS_NOT_LOADED');
});
test('spaeter nachgeladene Karten werden gesehen', () => {
  const m = new Map();
  const r3 = createCollectionKeyResolver(sets, m);
  m.set('me5', cardsBySet.get('me5'));
  assert.deepEqual(r3.resolve('me5', '1'), { setId: 'me5', collectionKey: '1' });
});
