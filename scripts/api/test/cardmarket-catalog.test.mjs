import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalog, parseCatalog } from '../sources/cardmarket-catalog.mjs';

const line = (id, name, expansionId, collectorNumber = null) => JSON.stringify({ id, name, expansionId, collectorNumber, metacardId: null, dateAdded: 'x' });

test('catalog loader: numbers only from custom-sets, missing custom-set products reported', () => {
  const products = parseCatalog(`${[line(1, 'Pikachu', 10, '25'), line(2, 'Pikachu', 10), line(3, 'Mew', 11)].join('\n')}\n`);
  const catalog = buildCatalog(products, [{ expansionId: 10, name: 'X', cards: [{ productId: 2, collectorNumber: '4V2' }, { productId: 9, collectorNumber: '5' }, { productId: 3, collectorNumber: '6' }] }]);
  assert.deepEqual([...catalog.expansions].sort(), [10, 11]);
  assert.equal(catalog.byId.get(3).expansionId, 11);
  assert.deepEqual(catalog.loadExpansion(10), {
    expansionId: 10,
    cards: [
      // Feed-Nummer zaehlt nicht (sie war frueher abgeleitet), nur custom-set
      { cardmarketProductId: 1, name: 'Pikachu', collectorNumber: null, categoryId: 51 },
      { cardmarketProductId: 2, name: 'Pikachu', collectorNumber: '4V2', categoryId: 51, customSet: true },
    ],
  });
  assert.equal(catalog.loadExpansion(99), null);
  assert.deepEqual(catalog.missingCustomSetProducts, [
    { expansionId: 10, productId: 9, collectorNumber: '5' },
    { expansionId: 10, productId: 3, collectorNumber: '6', actualExpansion: 11 },
  ]);
});

test('catalog loader: lot-Eintraege der custom-sets werden ignoriert (keine Nummer, nicht als fehlend gemeldet)', () => {
  const products = parseCatalog(`${[line(1, 'Pikachu', 10), line(2, 'Pikachu Lot', 10)].join('\n')}\n`);
  const catalog = buildCatalog(products, [{ expansionId: 10, name: 'X', cards: [
    { productId: 1, collectorNumber: '4' },
    { productId: 2, collectorNumber: '224a', lot: true },
    { productId: 9, collectorNumber: '224b', lot: true },
  ] }]);
  assert.deepEqual(catalog.missingCustomSetProducts, []);
  assert.equal(catalog.customSetNumbers.has(2), false);
  assert.equal(catalog.customSetNumbers.get(1), '4');
  assert.deepEqual(catalog.lotCustomSetProducts, [
    { expansionId: 10, productId: 2, collectorNumber: '224a' },
    { expansionId: 10, productId: 9, collectorNumber: '224b' },
  ]);
});
