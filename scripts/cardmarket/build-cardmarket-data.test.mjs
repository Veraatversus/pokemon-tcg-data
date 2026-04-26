import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  extractProductsList,
  extractPriceGuideList,
  buildCardmarketArtifacts,
  writeArtifactsToDirectory,
} from './lib/build-helpers.mjs';
import {
  enrichSinglesWithCollectorNumbers,
} from './build-cardmarket-data.mjs';

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
        avg1: 2.3,
        avg7: 2.4,
        avg30: 2.45,
        low: 1.2,
        trendPrice: 2.3,
        'avg-holo': 3.7,
        'avg1-holo': 3.5,
        'avg7-holo': 3.6,
        'avg30-holo': 3.65,
        'low-holo': 1.9,
        'trend-holo': 3.8,
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
  assert.equal(artifacts.index.tracker.bySetId.sv1, undefined);
  assert.equal(artifacts.index.tracker.byPtcgoCode.svi, undefined);
  assert.equal(artifacts.index.tracker.bySetName['scarlet violet'], undefined);
  assert.equal(artifacts.sets['2001'].cards.length, 1);
  assert.equal(artifacts.sets['2001'].cards[0].cardmarketProductId, 1001);
  assert.equal(artifacts.sets['2001'].cards[0].prices.avg, 2.5);
  assert.equal(artifacts.sets['2001'].cards[0].prices.avg1, 2.3);
  assert.equal(artifacts.sets['2001'].cards[0].prices.avg7, 2.4);
  assert.equal(artifacts.sets['2001'].cards[0].prices.avg30, 2.45);
  assert.equal(artifacts.sets['2001'].cards[0].prices.low, 1.2);
  assert.equal(artifacts.sets['2001'].cards[0].prices.trend, 2.3);
  assert.equal(artifacts.sets['2001'].cards[0].prices.avgHolo, 3.7);
  assert.equal(artifacts.sets['2001'].cards[0].prices.avg1Holo, 3.5);
  assert.equal(artifacts.sets['2001'].cards[0].prices.avg7Holo, 3.6);
  assert.equal(artifacts.sets['2001'].cards[0].prices.avg30Holo, 3.65);
  assert.equal(artifacts.sets['2001'].cards[0].prices.lowHolo, 1.9);
  assert.equal(artifacts.sets['2001'].cards[0].prices.trendHolo, 3.8);
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
        name: 'Team Rocket Sleeved Booster',
        idCategory: 52,
        categoryName: 'Pokémon Booster',
        idExpansion: 1528,
        idMetacard: 0,
        dateAdded: '2007-01-01 00:00:00'
      },
      {
        idProduct: 271876,
        name: 'Team Rocket Booster',
        idCategory: 52,
        categoryName: 'Pokémon Booster',
        idExpansion: 1528,
        idMetacard: 0,
        dateAdded: '2007-01-02 00:00:00'
      },
      {
        idProduct: 271875,
        name: 'Team Rocket Theme Deck',
        idCategory: 70,
        categoryName: 'Pokémon Theme Deck',
        idExpansion: 1528,
        idMetacard: 0,
        dateAdded: '2007-01-01 00:00:00'
      },
      {
        idProduct: 271877,
        name: 'Base Set Booster',
        idCategory: 52,
        categoryName: 'Pokémon Booster',
        idExpansion: 1523,
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
      { id: 'base1', name: 'Base', ptcgoCode: 'BS' },
      { id: 'base5', name: 'Team Rocket', ptcgoCode: 'TR' }
    ],
    trackerCardsBySet: {
      base1: [],
      base5: [
        { name: 'Dark Charizard' }
      ]
    }
  });

  assert.equal(artifacts.meta.singlesCount, 1);
  assert.equal(artifacts.meta.nonsinglesCount, 4);
  assert.equal(artifacts.meta.productIndexCount, 5);
  assert.equal(artifacts.index.tracker.bySetId.base5, '1528');
  assert.equal(artifacts.index.tracker.bySetId.base1, '1523');
  assert.equal(artifacts.index.tracker.bySetName['team rocket'], '1528');
  assert.equal(artifacts.index.tracker.bySetName['team rocket sleeved'], undefined);
  assert.equal(artifacts.index.tracker.bySetName.base, '1523');
  assert.deepEqual(
    Object.entries(artifacts.index.tracker.bySetName).filter(([, expansionId]) => expansionId === '1528'),
    [['team rocket', '1528']]
  );
  assert.equal(artifacts.index.nonsinglesProducts['271874'].expansionId, 1528);
  assert.equal(artifacts.index.nonsinglesProducts['271876'].name, 'Team Rocket Booster');
  assert.equal(artifacts.index.nonsinglesProducts['271875'].categoryName, 'Pokémon Theme Deck');
});

test('buildCardmarketArtifacts derives bySetId from resolved bySetName when direct set inference is noisy', () => {
  const singlesPayload = {
    version: 1,
    createdAt: '2026-04-13T00:00:00+0000',
    products: [
      {
        idProduct: 900001,
        name: 'Bulbasaur',
        idCategory: 51,
        categoryName: 'Pokémon Single',
        idExpansion: 6381,
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
        idProduct: 900101,
        name: 'Diamond & Pearl Booster',
        idCategory: 52,
        categoryName: 'Pokémon Booster',
        idExpansion: 1555,
        idMetacard: 0,
        dateAdded: '2007-01-01 00:00:00'
      }
    ]
  };

  const artifacts = buildCardmarketArtifacts({
    singlesPayload,
    nonsinglesPayload,
    priceGuidePayload: { version: 1, createdAt: '2026-04-13T00:00:00+0000', priceGuides: [] },
    trackerSets: [
      { id: 'dp1', name: 'Diamond & Pearl', ptcgoCode: 'DP' }
    ],
    trackerCardsBySet: {
      dp1: [
        { name: 'Bulbasaur' }
      ]
    }
  });

  assert.equal(artifacts.index.tracker.bySetId.dp1, '1555');
  assert.equal(artifacts.index.tracker.byPtcgoCode.dp, '1555');
  assert.equal(artifacts.index.tracker.bySetName['diamond pearl'], '1555');
});

test('buildCardmarketArtifacts can derive tracker bySetName entries from non-booster products when boosters are unavailable', () => {
  const artifacts = buildCardmarketArtifacts({
    singlesPayload: {
      version: 1,
      createdAt: '2026-04-13T00:00:00+0000',
      products: []
    },
    nonsinglesPayload: {
      version: 1,
      createdAt: '2026-04-13T00:00:00+0000',
      products: [
        {
          idProduct: 910001,
          name: 'Southern Islands Box Set',
          idCategory: 79,
          categoryName: 'Pokémon Box Set',
          idExpansion: 1633,
          idMetacard: 0,
          dateAdded: '2007-01-01 00:00:00'
        }
      ]
    },
    priceGuidePayload: {
      version: 1,
      createdAt: '2026-04-13T00:00:00+0000',
      priceGuides: []
    },
    trackerSets: [
      { id: 'si1', name: 'Southern Islands' }
    ],
    trackerCardsBySet: {
      si1: []
    }
  });

  assert.equal(artifacts.index.tracker.bySetId.si1, '1633');
  assert.equal(artifacts.index.tracker.bySetName['southern islands'], '1633');
});

test('buildCardmarketArtifacts prefers tracker-supported aliases when multiple expansion names normalize to the same set', () => {
  const artifacts = buildCardmarketArtifacts({
    singlesPayload: {
      version: 1,
      createdAt: '2026-04-13T00:00:00+0000',
      products: [
        {
          idProduct: 920001,
          name: 'Pikachu',
          idCategory: 51,
          categoryName: 'Pokémon Single',
          idExpansion: 4786,
          idMetacard: 0,
          dateAdded: '2026-04-13 00:00:00'
        },
        {
          idProduct: 920002,
          name: 'Mew ex',
          idCategory: 51,
          categoryName: 'Pokémon Single',
          idExpansion: 5328,
          idMetacard: 0,
          dateAdded: '2026-04-13 00:00:00'
        }
      ]
    },
    nonsinglesPayload: {
      version: 1,
      createdAt: '2026-04-13T00:00:00+0000',
      products: [
        {
          idProduct: 920101,
          name: 'Pokémon GO Enhanced Expansion Pack Booster',
          idCategory: 52,
          categoryName: 'Pokémon Booster',
          idExpansion: 4786,
          idMetacard: 0,
          dateAdded: '2022-02-04 12:09:29'
        },
        {
          idProduct: 920102,
          name: 'Pokémon GO Booster',
          idCategory: 52,
          categoryName: 'Pokémon Booster',
          idExpansion: 5051,
          idMetacard: 0,
          dateAdded: '2022-04-29 16:17:56'
        },
        {
          idProduct: 920103,
          name: 'Pokémon Card 151 Booster',
          idCategory: 52,
          categoryName: 'Pokémon Booster',
          idExpansion: 5328,
          idMetacard: 0,
          dateAdded: '2023-04-05 14:24:11'
        },
        {
          idProduct: 920104,
          name: '151 Booster',
          idCategory: 52,
          categoryName: 'Pokémon Booster',
          idExpansion: 5402,
          idMetacard: 0,
          dateAdded: '2023-06-21 16:23:05'
        }
      ]
    },
    priceGuidePayload: {
      version: 1,
      createdAt: '2026-04-13T00:00:00+0000',
      priceGuides: []
    },
    trackerSets: [
      { id: 'pgo', name: 'Pokémon GO', ptcgoCode: 'PGO' },
      { id: 'sv3pt5', name: '151', ptcgoCode: 'MEW' }
    ],
    trackerCardsBySet: {
      pgo: [{ name: 'Pikachu' }],
      sv3pt5: [{ name: 'Mew ex' }]
    }
  });

  assert.equal(artifacts.index.tracker.bySetId.pgo, '4786');
  assert.equal(artifacts.index.tracker.bySetName['pokemon go'], '4786');
  assert.equal(artifacts.index.tracker.bySetId.sv3pt5, '5328');
  assert.equal(artifacts.index.tracker.bySetName['151'], '5328');
});

test('buildCardmarketArtifacts falls back to inferred expansion ids for promo-like tracker set names', () => {
  const artifacts = buildCardmarketArtifacts({
    singlesPayload: {
      version: 1,
      createdAt: '2026-04-13T00:00:00+0000',
      products: [
        {
          idProduct: 930001,
          name: 'Pikachu',
          idCategory: 51,
          categoryName: 'Pokémon Single',
          idExpansion: 2916,
          idMetacard: 0,
          dateAdded: '2026-04-13 00:00:00'
        }
      ]
    },
    nonsinglesPayload: {
      version: 1,
      createdAt: '2026-04-13T00:00:00+0000',
      products: []
    },
    priceGuidePayload: {
      version: 1,
      createdAt: '2026-04-13T00:00:00+0000',
      priceGuides: []
    },
    trackerSets: [
      { id: 'swshp', name: 'SWSH Black Star Promos', ptcgoCode: 'PR-SW' }
    ],
    trackerCardsBySet: {
      swshp: [{ name: 'Pikachu' }]
    }
  });

  assert.equal(artifacts.index.tracker.bySetId.swshp, '2916');
  assert.equal(artifacts.index.tracker.bySetName['swsh black star promos'], '2916');
});

test('buildCardmarketArtifacts falls back to inferred expansion ids for HS set names when no direct name candidate exists', () => {
  const artifacts = buildCardmarketArtifacts({
    singlesPayload: {
      version: 1,
      createdAt: '2026-04-13T00:00:00+0000',
      products: [
        {
          idProduct: 940001,
          name: 'Umbreon',
          idCategory: 51,
          categoryName: 'Pokémon Single',
          idExpansion: 1567,
          idMetacard: 0,
          dateAdded: '2026-04-13 00:00:00'
        }
      ]
    },
    nonsinglesPayload: {
      version: 1,
      createdAt: '2026-04-13T00:00:00+0000',
      products: []
    },
    priceGuidePayload: {
      version: 1,
      createdAt: '2026-04-13T00:00:00+0000',
      priceGuides: []
    },
    trackerSets: [
      { id: 'hgss2', name: 'HS—Unleashed', ptcgoCode: 'UL' }
    ],
    trackerCardsBySet: {
      hgss2: [{ name: 'Umbreon' }]
    }
  });

  assert.equal(artifacts.index.tracker.bySetId.hgss2, '1567');
  assert.equal(artifacts.index.tracker.bySetName['hs unleashed'], '1567');
});

test('enrichSinglesWithCollectorNumbers annotates duplicate metacards from product page titles', async () => {
  const singlesPayload = {
    products: [
      {
        idProduct: 275238,
        name: 'Alakazam [Energy Jump | Psychic]',
        idExpansion: 1538,
        idMetacard: 213121,
      },
      {
        idProduct: 275260,
        name: 'Alakazam [Energy Jump | Psychic]',
        idExpansion: 1538,
        idMetacard: 213121,
      },
      {
        idProduct: 275259,
        name: 'Aerodactyl [Ancient Wind | Rising Lunge]',
        idExpansion: 1538,
        idMetacard: 213120,
      }
    ]
  };

  const enriched = await enrichSinglesWithCollectorNumbers(singlesPayload, {
    fetchProductPage: async (productId) => {
      if (String(productId) === '275238') return '<title>Simsala (SK H1) - Cardmarket</title>';
      if (String(productId) === '275260') return '<title>Simsala (SK 2) - Cardmarket</title>';
      throw new Error(`Unexpected product page fetch: ${productId}`);
    }
  });

  const byProductId = Object.fromEntries(enriched.products.map((product) => [String(product.idProduct), product]));
  assert.equal(byProductId['275238'].collectorNumber, 'H1');
  assert.equal(byProductId['275260'].collectorNumber, '2');
  assert.equal(byProductId['275259'].collectorNumber, undefined);
});

test('writeArtifactsToDirectory minifies generated json files', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cardmarket-build-test-'));

  const artifacts = {
    meta: { schemaVersion: 2, singlesCount: 1 },
    index: {
      sets: [{ expansionId: 2001, cardCount: 1, path: 'sets/2001.json' }],
      products: { '1001': { expansionId: 2001, path: 'sets/2001.json' } },
      names: { bulbasaur: ['2001'] },
      nonsinglesProducts: { '2002': { name: 'Base Set Booster', expansionId: 1523, path: 'sets/1523.json' } },
      tracker: { bySetId: { sv1: '2001' }, byPtcgoCode: { svi: '2001' }, bySetName: { 'base set': '1523' } },
    },
    sets: {
      '2001': {
        expansionId: 2001,
        cards: [{ cardmarketProductId: 1001, name: 'Bulbasaur', prices: { trend: 2.3 } }],
      },
    },
  };

  try {
    await writeArtifactsToDirectory(artifacts, tempDir);

    const [metaJson, trackerJson, setJson] = await Promise.all([
      fs.readFile(path.join(tempDir, 'meta.json'), 'utf8'),
      fs.readFile(path.join(tempDir, 'index', 'tracker.json'), 'utf8'),
      fs.readFile(path.join(tempDir, 'sets', '2001.json'), 'utf8'),
    ]);

    assert.equal(metaJson, '{"schemaVersion":2,"singlesCount":1}');
    assert.match(trackerJson, /^\{"bySetId":\{"sv1":"2001"\},"byPtcgoCode":\{"svi":"2001"\},"bySetName":\{"base set":"1523"\}\}$/);
    assert.equal(setJson, '{"expansionId":2001,"cards":[{"cardmarketProductId":1001,"name":"Bulbasaur","prices":{"trend":2.3}}]}');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
