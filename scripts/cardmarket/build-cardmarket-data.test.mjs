import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractProductsList,
  extractPriceGuideList,
  buildCardmarketArtifacts,
} from './lib/build-helpers.mjs';

test('extractProductsList supports Cardmarket object payloads', () => {
  const payload = {
    version: 1,
    createdAt: '2026-04-09T00:00:00+0000',
    products: [
      { idProduct: 1001, name: 'Bulbasaur', idExpansion: 2001 },
      { idProduct: 1002, name: 'Ivysaur', idExpansion: 2001 },
    ],
  };

  const result = extractProductsList(payload);

  assert.equal(result.length, 2);
  assert.equal(result[0].idProduct, 1001);
});

test('extractPriceGuideList supports Cardmarket object payloads', () => {
  const payload = {
    version: 1,
    createdAt: '2026-04-09T00:00:00+0000',
    priceGuides: [
      { idProduct: 1001, avg: 2.5, low: 1.2, trendPrice: 2.3 },
    ],
  };

  const result = extractPriceGuideList(payload);

  assert.equal(result.length, 1);
  assert.equal(result[0].idProduct, 1001);
});

test('buildCardmarketArtifacts groups singles by expansion and merges price data', () => {
  const singlesPayload = {
    version: 1,
    createdAt: '2026-04-09T00:00:00+0000',
    products: [
      {
        idProduct: 1001,
        name: 'Bulbasaur',
        idCategory: 51,
        categoryName: 'Pokémon Single',
        idExpansion: 2001,
        idMetacard: 3001,
        dateAdded: '2026-04-09 00:00:00',
      },
    ],
  };

  const priceGuidePayload = {
    version: 1,
    createdAt: '2026-04-09T00:00:00+0000',
    priceGuides: [
      {
        idProduct: 1001,
        avg: 2.5,
        low: 1.2,
        trendPrice: 2.3,
      },
    ],
  };

  const artifacts = buildCardmarketArtifacts({
    singlesPayload,
    priceGuidePayload,
    trackerSets: [
      { id: 'sv1', name: 'Scarlet & Violet', ptcgoCode: 'SVI' }
    ],
    trackerCardsBySet: {
      sv1: [
        { name: 'Bulbasaur' },
        { name: 'Ivysaur' }
      ]
    }
  });

  assert.equal(artifacts.meta.singlesCount, 1);
  assert.equal(artifacts.meta.priceGuideCount, 1);
  assert.equal(artifacts.index.sets.length, 1);
  assert.equal(artifacts.index.sets[0].expansionId, 2001);
  assert.equal(artifacts.index.products['1001'].expansionId, 2001);
  assert.equal(artifacts.index.products['1001'].path, 'sets/2001.json');
  assert.deepEqual(artifacts.index.names.bulbasaur, ['2001']);
  assert.equal(artifacts.index.tracker.bySetId.sv1, '2001');
  assert.equal(artifacts.index.tracker.byPtcgoCode.svi, '2001');
  assert.equal(artifacts.sets['2001'].cards.length, 1);
  assert.equal(artifacts.sets['2001'].cards[0].cardmarketProductId, 1001);
  assert.equal(artifacts.sets['2001'].cards[0].prices.avg, 2.5);
  assert.equal(artifacts.sets['2001'].cards[0].prices.low, 1.2);
  assert.equal(artifacts.sets['2001'].cards[0].prices.trend, 2.3);
});
