import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCardmarketProductUrl,
  extractCardmarketProductId,
  formatCardmarketEntryLabel,
  formatCardmarketEntryTitle,
  getCardmarketBaseUrl,
  inferCardmarketExpansionIdFromCards,
  promoteCardmarketUrlsForCards,
  resolveCardmarketEntryForCardFromSetPayload,
  resolveCardmarketEntryFromSetPayload,
} from '../js/data/cardmarket-data.js';

test('getCardmarketBaseUrl prefers the local app origin during localhost development', () => {
  assert.equal(getCardmarketBaseUrl({ origin: 'http://localhost:8080' }), 'http://localhost:8080/cardmarket');
});

test('extractCardmarketProductId reads numeric product ids from Cardmarket product URLs', () => {
  const url = 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Scarlet-Violet-Base-Set/Gardevoir-ex-086-198?language=1&idProduct=696421';

  assert.equal(extractCardmarketProductId(url), '696421');
});

test('extractCardmarketProductId returns empty string for non-product URLs', () => {
  const url = 'https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=Gardevoir';

  assert.equal(extractCardmarketProductId(url), '');
});

test('resolveCardmarketEntryFromSetPayload matches the exact product record', () => {
  const setPayload = {
    expansionId: 2001,
    cards: [
      {
        cardmarketProductId: 1001,
        name: 'Bulbasaur',
        prices: { avg: 2.5, low: 1.2, trend: 2.3 }
      },
      {
        cardmarketProductId: 1002,
        name: 'Ivysaur',
        prices: { avg: 5.0, low: 3.0, trend: 4.6 }
      }
    ]
  };

  const result = resolveCardmarketEntryFromSetPayload(setPayload, '1002');

  assert.equal(result?.cardmarketProductId, 1002);
  assert.equal(result?.prices?.avg, 5.0);
});

test('inferCardmarketExpansionIdFromCards uses anchored product urls from the current tracker set', () => {
  const cards = [
    {
      setId: 'sv1',
      number: '001',
      cardmarketUrl: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Scarlet-Violet-Base-Set/Bulbasaur?language=1&idProduct=1001'
    },
    {
      setId: 'sv1',
      number: '002',
      cardmarketUrl: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Scarlet-Violet-Base-Set/Ivysaur?language=1&idProduct=1002'
    },
    {
      setId: 'sv1',
      number: '003',
      cardmarketUrl: 'https://www.cardmarket.com/de/Pokemon/Products/Search?searchMode=v2&searchString=SVI+003'
    }
  ];

  const productIndex = {
    '1001': { expansionId: 2001, path: 'sets/2001.json' },
    '1002': { expansionId: 2001, path: 'sets/2001.json' }
  };

  assert.equal(inferCardmarketExpansionIdFromCards(cards, productIndex), '2001');
});

test('inferCardmarketExpansionIdFromCards uses the generated tracker set index when no direct product urls are available', () => {
  const cards = [
    { setId: 'sv1', number: '001', name: 'Bulbasaur', cardmarketUrl: 'https://www.cardmarket.com/de/Pokemon/Products/Search?searchString=SVI+001' },
    { setId: 'sv1', number: '002', name: 'Ivysaur', cardmarketUrl: 'https://www.cardmarket.com/de/Pokemon/Products/Search?searchString=SVI+002' },
    { setId: 'sv1', number: '003', name: 'Venusaur', cardmarketUrl: 'https://www.cardmarket.com/de/Pokemon/Products/Search?searchString=SVI+003' }
  ];

  const productIndex = {};
  const trackerSetIndex = {
    bySetId: { sv1: '2001' },
    byPtcgoCode: { svi: '2001' }
  };

  assert.equal(inferCardmarketExpansionIdFromCards(cards, productIndex, { trackerSetIndex }), '2001');
});

test('resolveCardmarketEntryForCardFromSetPayload disambiguates same-name cards using attack names', () => {
  const card = {
    vera_name: 'Pikachu',
    tcgdex_name: 'Pikachu',
    vera_attacks: [
      { name: 'Thunder Jolt' },
      { name: 'Volt Tackle' }
    ],
    vera_abilities: []
  };

  const setPayload = {
    expansionId: 2001,
    cards: [
      {
        cardmarketProductId: 1001,
        name: 'Pikachu [Gnaw]',
        prices: { trend: 1.2 }
      },
      {
        cardmarketProductId: 1002,
        name: 'Pikachu [Thunder Jolt | Volt Tackle]',
        prices: { trend: 4.6 }
      }
    ]
  };

  const result = resolveCardmarketEntryForCardFromSetPayload(card, setPayload);

  assert.equal(result?.cardmarketProductId, 1002);
  assert.equal(result?.prices?.trend, 4.6);
});

test('resolveCardmarketEntryForCardFromSetPayload falls back to source names when the localized display name differs', () => {
  const card = {
    name: 'Tannza',
    vera_name: 'Tarountula',
    tcgdex_name: 'Tarountula',
    vera_attacks: [],
    vera_abilities: []
  };

  const setPayload = {
    expansionId: 5223,
    cards: [
      {
        cardmarketProductId: 702298,
        name: 'Tarountula',
        prices: { trend: 0.18 }
      }
    ]
  };

  const result = resolveCardmarketEntryForCardFromSetPayload(card, setPayload);

  assert.equal(result?.cardmarketProductId, 702298);
  assert.equal(result?.prices?.trend, 0.18);
});

test('buildCardmarketProductUrl creates a stable direct product link from the product id', () => {
  assert.equal(
    buildCardmarketProductUrl(1001),
    'https://www.cardmarket.com/de/Pokemon/Products?idProduct=1001'
  );
});

test('promoteCardmarketUrlsForCards upgrades search fallbacks to direct product links when the set payload can identify the exact card', async () => {
  const cards = [
    {
      setId: 'sv1',
      number: '001',
      vera_name: 'Pikachu',
      tcgdex_name: 'Pikachu',
      cardmarketUrl: 'https://www.cardmarket.com/de/Pokemon/Products/Search?searchMode=v2&searchString=SVI+001',
      vera_cardmarket_url: 'https://www.cardmarket.com/de/Pokemon/Products/Search?searchMode=v2&searchString=SVI+001',
      vera_attacks: [{ name: 'Thunder Jolt' }, { name: 'Volt Tackle' }],
      vera_abilities: []
    },
    {
      setId: 'sv1',
      number: '002',
      name: 'Raichu',
      cardmarketUrl: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Scarlet-Violet-Base-Set/Raichu?language=1&idProduct=1002'
    }
  ];

  const promoted = await promoteCardmarketUrlsForCards(cards, {
    productIndex: {
      '1001': { expansionId: 2001, path: 'sets/2001.json' },
      '1002': { expansionId: 2001, path: 'sets/2001.json' }
    },
    setPayload: {
      expansionId: 2001,
      cards: [
        { cardmarketProductId: 1001, name: 'Pikachu [Thunder Jolt | Volt Tackle]', prices: { trend: 4.6 } },
        { cardmarketProductId: 1002, name: 'Raichu [Thunderbolt]', prices: { trend: 3.2 } }
      ]
    }
  });

  assert.equal(promoted[0].cardmarketUrl, 'https://www.cardmarket.com/de/Pokemon/Products?idProduct=1001');
  assert.equal(promoted[0].vera_cardmarket_url, 'https://www.cardmarket.com/de/Pokemon/Products?idProduct=1001');
});

test('formatCardmarketEntryLabel prefers the trend price for compact UI badges', () => {
  const entry = {
    prices: { avg: 5.0, low: 3.0, trend: 4.6 }
  };

  assert.equal(formatCardmarketEntryLabel(entry), '4,60 €');
});

test('formatCardmarketEntryTitle summarizes the available price points for tooltips', () => {
  const entry = {
    prices: { avg: 5.0, low: 3.0, trend: 4.6 }
  };

  assert.equal(formatCardmarketEntryTitle(entry), 'Cardmarket: Trend 4,60 € · AVG 5,00 € · Low 3,00 €');
});
