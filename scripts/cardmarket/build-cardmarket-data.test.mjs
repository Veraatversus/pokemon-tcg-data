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
    nonsinglesPayload: {
      version: 1,
      createdAt: '2026-04-09T00:00:00+0000',
      products: []
    },
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
  assert.equal(artifacts.meta.nonsinglesCount, 0);
  assert.equal(artifacts.meta.priceGuideCount, 1);
  assert.equal(artifacts.index.sets.length, 1);
  assert.equal(artifacts.index.sets[0].expansionId, 2001);
  assert.equal(artifacts.index.products['1001'].expansionId, 2001);
  assert.equal(artifacts.index.products['1001'].path, 'sets/2001.json');
  assert.deepEqual(artifacts.index.names.bulbasaur, ['2001']);
  assert.equal(artifacts.index.tracker.bySetId.sv1, '2001');
  assert.equal(artifacts.index.tracker.byPtcgoCode.svi, '2001');
  assert.equal(artifacts.index.tracker.bySetName['scarlet violet'], '2001');
  assert.equal(artifacts.sets['2001'].cards.length, 1);
  assert.equal(artifacts.sets['2001'].cards[0].cardmarketProductId, 1001);
  assert.equal(artifacts.sets['2001'].cards[0].prices.avg, 2.5);
  assert.equal(artifacts.sets['2001'].cards[0].prices.low, 1.2);
  assert.equal(artifacts.sets['2001'].cards[0].prices.trend, 2.3);
  assert.deepEqual(artifacts.index.nonsinglesProducts, {});
});

test('buildCardmarketArtifacts indexes nonsingles and extends tracker bySetName from booster names', () => {
  const singlesPayload = {
    version: 1,
    createdAt: '2026-04-13T00:00:00+0000',
    products: [
      {
        idProduct: 300001,
        name: 'Dark Charizard',
        idCategory: 51,
        categoryName: 'Pokémon Single',
        idExpansion: 1528,
        idMetacard: 0,
        dateAdded: '2026-04-13 00:00:00'
      }
    ]
  };

  const nonsinglesPayload = {
    version: 1,
    createdAt: '2026-04-13T00:00:00+0000',
    products: [
      {
        idProduct: 271874,
        name: 'Team Rocket Booster',
        idCategory: 52,
        categoryName: 'Pokémon Booster',
        idExpansion: 1528,
        idMetacard: 0,
        dateAdded: '2007-01-01 00:00:00'
      },
      {
        idProduct: 271875,
        name: 'Team Rocket Theme Deck',
        idCategory: 70,
        categoryName: 'Pokémon Theme Deck',
        idExpansion: 1528,
        idMetacard: 0,
        dateAdded: '2007-01-01 00:00:00'
      }
    ]
  };

  const priceGuidePayload = {
    version: 1,
    createdAt: '2026-04-13T00:00:00+0000',
    priceGuides: [
      {
        idProduct: 300001,
        avg: 72.5,
        low: 60.0,
        trendPrice: 70.2
      }
    ]
  };

  const artifacts = buildCardmarketArtifacts({
    singlesPayload,
    nonsinglesPayload,
    priceGuidePayload,
    trackerSets: [
      { id: 'base5', name: 'Team Rocket', ptcgoCode: 'TR' }
    ],
    trackerCardsBySet: {
      base5: [
        { name: 'Dark Charizard' }
      ]
    }
  });

  assert.equal(artifacts.meta.singlesCount, 1);
  assert.equal(artifacts.meta.nonsinglesCount, 2);
  assert.equal(artifacts.meta.productIndexCount, 3);
  assert.equal(artifacts.index.tracker.bySetId.base5, '1528');
  assert.equal(artifacts.index.tracker.bySetName['team rocket'], '1528');
  assert.equal(artifacts.index.nonsinglesProducts['271874'].expansionId, 1528);
  assert.equal(artifacts.index.nonsinglesProducts['271874'].name, 'Team Rocket Booster');
  assert.equal(artifacts.index.nonsinglesProducts['271875'].categoryName, 'Pokémon Theme Deck');
});
