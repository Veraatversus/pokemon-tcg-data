import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSetCardAssignmentMap,
  buildCardmarketProductUrl,
  entryCollectorMatchesCard,
  extractCardmarketProductId,
  formatCardmarketEntryLabel,
  formatCardmarketEntryTitle,
  getCardmarketBaseUrl,
  inferCardmarketExpansionIdFromCards,
  promoteCardmarketUrlsForCards,
  resolveCardmarketEntryForCardFromSetPayload,
  resolveCardmarketEntryFromSetPayload,
} from './lib/cardmarket-ui-helpers.mjs';

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

test('inferCardmarketExpansionIdFromCards keeps bySetId and byPtcgoCode precedence when available', () => {
  const cards = [
    {
      setId: 'mystery-set',
      setName: 'Team Rocket',
      name: 'Dark Charizard',
      cardmarketUrl: 'https://www.cardmarket.com/de/Pokemon/Products/Search?searchString=TR+004'
    }
  ];

  const productIndex = {};
  const trackerSetIndex = {
    bySetId: { 'mystery-set': '2001' },
    byPtcgoCode: { tr: '2001' },
    bySetName: { 'team rocket': '1528' }
  };

  assert.equal(inferCardmarketExpansionIdFromCards(cards, productIndex, { trackerSetIndex }), '2001');
});

test('inferCardmarketExpansionIdFromCards falls back to bySetName when neither bySetId nor byPtcgoCode match', () => {
  const cards = [
    {
      setId: 'mystery-set',
      setName: 'Team Rocket',
      name: 'Dark Charizard',
      cardmarketUrl: 'https://www.cardmarket.com/de/Pokemon/Products/Search?searchString=TR+004'
    }
  ];

  const productIndex = {};
  const trackerSetIndex = {
    bySetId: {},
    byPtcgoCode: {},
    bySetName: { 'team rocket': '1528' }
  };

  assert.equal(inferCardmarketExpansionIdFromCards(cards, productIndex, { trackerSetIndex }), '1528');
});

test('inferCardmarketExpansionIdFromCards prefers vera_set_name for set-name fallback matching', () => {
  const cards = [
    {
      setId: 'mystery-set',
      setName: 'Team Rocket auf Deutsch',
      vera_set_name: 'Team Rocket',
      name: 'Dark Charizard',
      cardmarketUrl: 'https://www.cardmarket.com/de/Pokemon/Products/Search?searchString=TR+004'
    }
  ];

  const productIndex = {};
  const trackerSetIndex = {
    bySetId: {},
    byPtcgoCode: {},
    bySetName: { 'team rocket': '1528' }
  };

  assert.equal(inferCardmarketExpansionIdFromCards(cards, productIndex, { trackerSetIndex }), '1528');
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

test('resolveCardmarketEntryForCardFromSetPayload prefers vera_name over localized card name', () => {
  const card = {
    name: 'Tannza',
    vera_name: 'Tarountula',
    tcgdex_name: '',
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

test('resolveCardmarketEntryForCardFromSetPayload uses source-card occurrence for duplicate names', () => {
  const cards = [
    {
      number: '15',
      vera_name: 'Professor Oak',
      tcgdex_name: 'Professor Oak',
    },
    {
      number: '88',
      vera_name: 'Professor Oak',
      tcgdex_name: 'Professor Oak',
    }
  ];

  const setPayload = {
    expansionId: 2001,
    cards: [
      {
        cardmarketProductId: 1015,
        name: 'Professor Oak',
        prices: { trend: 1.2 }
      },
      {
        cardmarketProductId: 1088,
        name: 'Professor Oak',
        prices: { trend: 4.6 }
      }
    ]
  };

  const result = resolveCardmarketEntryForCardFromSetPayload(cards[1], setPayload, { sourceCards: cards });

  assert.equal(result?.cardmarketProductId, 1088);
  assert.equal(result?.prices?.trend, 4.6);
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

test('promoteCardmarketUrlsForCards keeps duplicate same-name cards aligned to their occurrence in the set', async () => {
  const cards = [
    {
      setId: 'base1',
      number: '15',
      vera_name: 'Professor Oak',
      tcgdex_name: 'Professor Oak',
      cardmarketUrl: 'https://www.cardmarket.com/de/Pokemon/Products/Search?searchMode=v2&searchString=BS+015',
      vera_cardmarket_url: 'https://www.cardmarket.com/de/Pokemon/Products/Search?searchMode=v2&searchString=BS+015'
    },
    {
      setId: 'base1',
      number: '88',
      vera_name: 'Professor Oak',
      tcgdex_name: 'Professor Oak',
      cardmarketUrl: 'https://www.cardmarket.com/de/Pokemon/Products/Search?searchMode=v2&searchString=BS+088',
      vera_cardmarket_url: 'https://www.cardmarket.com/de/Pokemon/Products/Search?searchMode=v2&searchString=BS+088'
    }
  ];

  const promoted = await promoteCardmarketUrlsForCards(cards, {
    productIndex: {},
    setPayload: {
      expansionId: 1523,
      cards: [
        { cardmarketProductId: 1015, name: 'Professor Oak', prices: { trend: 1.2 } },
        { cardmarketProductId: 1088, name: 'Professor Oak', prices: { trend: 4.6 } }
      ]
    }
  });

  assert.equal(promoted[0].cardmarketUrl, 'https://www.cardmarket.com/de/Pokemon/Products?idProduct=1015');
  assert.equal(promoted[1].cardmarketUrl, 'https://www.cardmarket.com/de/Pokemon/Products?idProduct=1088');
});

test('promoteCardmarketUrlsForCards reconciles stale direct links for duplicate same-name cards', async () => {
  const cards = [
    {
      setId: 'ecard3',
      number: '2',
      vera_name: 'Alakazam',
      tcgdex_name: 'Alakazam',
      cardmarketUrl: 'https://www.cardmarket.com/de/Pokemon/Products?idProduct=275238',
      vera_cardmarket_url: 'https://www.cardmarket.com/de/Pokemon/Products?idProduct=275238'
    },
    {
      setId: 'ecard3',
      number: 'H1',
      vera_name: 'Alakazam',
      tcgdex_name: 'Alakazam',
      cardmarketUrl: 'https://www.cardmarket.com/de/Pokemon/Products?idProduct=275238',
      vera_cardmarket_url: 'https://www.cardmarket.com/de/Pokemon/Products?idProduct=275238'
    }
  ];

  const promoted = await promoteCardmarketUrlsForCards(cards, {
    setPayload: {
      expansionId: 1538,
      cards: [
        { cardmarketProductId: 275260, name: 'Alakazam [Energy Jump | Psychic]', prices: { trend: 39.22 } },
        { cardmarketProductId: 275238, name: 'Alakazam [Energy Jump | Psychic]', prices: { trend: 335.66 } }
      ]
    }
  });

  assert.equal(promoted[0].cardmarketUrl, 'https://www.cardmarket.com/de/Pokemon/Products?idProduct=275260');
  assert.equal(promoted[1].cardmarketUrl, 'https://www.cardmarket.com/de/Pokemon/Products?idProduct=275238');
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

test('resolveCardmarketEntryForCardFromSetPayload disambiguates identically-named products via collector numbers', () => {
  const cards = [
    {
      number: '2',
      rarity: 'Rare',
      vera_name: 'Alakazam',
      tcgdex_name: 'Alakazam',
    },
    {
      number: 'H1',
      rarity: 'Holo Rare',
      vera_name: 'Alakazam',
      tcgdex_name: 'Alakazam',
    }
  ];

  const setPayload = {
    expansionId: 1538,
    cards: [
      {
        cardmarketProductId: 275238,
        name: 'Alakazam [Energy Jump | Psychic]',
        collectorNumber: 'H1',
        prices: { trend: 12.5 }
      },
      {
        cardmarketProductId: 275260,
        name: 'Alakazam [Energy Jump | Psychic]',
        collectorNumber: '2',
        prices: { trend: 8.3 }
      }
    ]
  };

  const result1 = resolveCardmarketEntryForCardFromSetPayload(cards[0], setPayload, { sourceCards: cards });
  assert.equal(result1?.cardmarketProductId, 275260);

  const result2 = resolveCardmarketEntryForCardFromSetPayload(cards[1], setPayload, { sourceCards: cards });
  assert.equal(result2?.cardmarketProductId, 275238);
});

test('resolveCardmarketEntryForCardFromSetPayload uses occurrence order for duplicates when collector numbers are unavailable', () => {
  const cards = [
    {
      number: '2',
      rarity: 'Rare',
      vera_name: 'Alakazam',
      tcgdex_name: 'Alakazam',
    },
    {
      number: 'H1',
      rarity: 'Holo Rare',
      vera_name: 'Alakazam',
      tcgdex_name: 'Alakazam',
    }
  ];

  // Cardmarket data is in the same order as the cards sorted by number:
  // #2 (regular) comes before H1 (holo) numerically, so regular entry is first.
  const setPayload = {
    expansionId: 1538,
    cards: [
      {
        cardmarketProductId: 275260,
        name: 'Alakazam [Energy Jump | Psychic]',
        prices: { trend: 39.22, trendHolo: 73.9 }
      },
      {
        cardmarketProductId: 275238,
        name: 'Alakazam [Energy Jump | Psychic]',
        prices: { trend: 335.66, trendHolo: 50.03 }
      }
    ]
  };

  const result1 = resolveCardmarketEntryForCardFromSetPayload(cards[0], setPayload, { sourceCards: cards });
  assert.equal(result1?.cardmarketProductId, 275260);

  const result2 = resolveCardmarketEntryForCardFromSetPayload(cards[1], setPayload, { sourceCards: cards });
  assert.equal(result2?.cardmarketProductId, 275238);
});

test('resolveCardmarketEntryForCardFromSetPayload falls back to rarity price profile when source order conflicts', () => {
  const cards = [
    {
      number: 'H1',
      rarity: 'Holo Rare',
      vera_name: 'Alakazam',
      tcgdex_name: 'Alakazam',
    },
    {
      number: '2',
      rarity: 'Rare',
      vera_name: 'Alakazam',
      tcgdex_name: 'Alakazam',
    }
  ];

  const setPayload = {
    expansionId: 1538,
    cards: [
      {
        cardmarketProductId: 275260,
        name: 'Alakazam [Energy Jump | Psychic]',
        prices: { trend: 39.22 }
      },
      {
        cardmarketProductId: 275238,
        name: 'Alakazam [Energy Jump | Psychic]',
        prices: { trend: 335.66 }
      }
    ]
  };

  const result1 = resolveCardmarketEntryForCardFromSetPayload(cards[0], setPayload, { sourceCards: cards });
  assert.equal(result1?.cardmarketProductId, 275238);

  const result2 = resolveCardmarketEntryForCardFromSetPayload(cards[1], setPayload, { sourceCards: cards });
  assert.equal(result2?.cardmarketProductId, 275260);
});

test('resolveCardmarketEntryForCardFromSetPayload nutzt ohne Objekt-Match das erste Vorkommen', () => {
  const sourceCards = [
    {
      number: '2',
      vera_name: 'Alakazam',
      tcgdex_name: 'Alakazam',
    },
    {
      number: 'H1',
      vera_name: 'Alakazam',
      tcgdex_name: 'Alakazam',
    }
  ];

  const renderedCard = {
    id: 'ecard3-H1',
    name: 'Simsala',
    vera_name: 'Alakazam',
    tcgdex_name: 'Alakazam',
  };

  const setPayload = {
    expansionId: 1538,
    cards: [
      { cardmarketProductId: 275260, name: 'Alakazam [Energy Jump | Psychic]', prices: { trend: 39.22 } },
      { cardmarketProductId: 275238, name: 'Alakazam [Energy Jump | Psychic]', prices: { trend: 335.66 } }
    ]
  };

  const result = resolveCardmarketEntryForCardFromSetPayload(renderedCard, setPayload, { sourceCards });
  assert.equal(result?.cardmarketProductId, 275260);
});

test('buildSetCardAssignmentMap verteilt gleichnamige Eintraege strikt nach Listenreihenfolge', () => {
  const sourceCards = [
    {
      id: 'ecard3-28',
      number: '28',
      rarity: 'Rare',
      vera_name: 'Raikou',
      tcgdex_name: 'Raikou',
    },
    {
      id: 'ecard3-H26',
      number: 'H26',
      rarity: 'Rare Holo',
      vera_name: 'Raikou',
      tcgdex_name: 'Raikou',
    }
  ];

  const setPayload = {
    expansionId: 1538,
    cards: [
      {
        cardmarketProductId: 275247,
        name: 'Raikou [Pure Body | Lightning Sphere]',
        metacardId: 213147,
        prices: { trend: 824.71, trendHolo: 51.1 }
      },
      {
        cardmarketProductId: 275286,
        name: 'Raikou [Pure Body | Lightning Sphere]',
        metacardId: 213147,
        prices: { trend: 9.96, trendHolo: 30.2 }
      }
    ]
  };

  const assignmentMap = buildSetCardAssignmentMap(sourceCards, setPayload);

  // Gleichnamige Einträge werden strikt nach Reihenfolge verteilt.
  assert.equal(assignmentMap.get(sourceCards[0])?.cardmarketProductId, 275247);
  assert.equal(assignmentMap.get(sourceCards[1])?.cardmarketProductId, 275286);
});

test('buildSetCardAssignmentMap nutzt bei Duplikaten keine Preis-Heuristik', () => {
  const sourceCards = [
    {
      id: 'ecard3-30',
      number: '30',
      rarity: 'Rare',
      vera_name: 'Starmie',
      tcgdex_name: 'Starmie',
    },
    {
      id: 'ecard3-H28',
      number: 'H28',
      rarity: 'Rare Holo',
      vera_name: 'Starmie',
      tcgdex_name: 'Starmie',
    }
  ];

  const setPayload = {
    expansionId: 1538,
    cards: [
      {
        cardmarketProductId: 275254,
        name: 'Starmie [Energy Burst | Star Back]',
        metacardId: 213149,
        prices: { trend: 128.26, avg: 341.65, trendHolo: 41.33 }
      },
      {
        cardmarketProductId: 275288,
        name: 'Starmie [Energy Burst | Star Back]',
        metacardId: 213149,
        prices: { trend: 39.29, avg: 42.37, trendHolo: 16.37 }
      }
    ]
  };

  const assignmentMap = buildSetCardAssignmentMap(sourceCards, setPayload);

  assert.equal(assignmentMap.get(sourceCards[0])?.cardmarketProductId, 275254);
  assert.equal(assignmentMap.get(sourceCards[1])?.cardmarketProductId, 275288);
});

test('buildSetCardAssignmentMap verwirft Metacard-Gruppe wenn Quellenkarte eine metacardId hat', () => {
  const sourceCards = [
    {
      id: 'ecard3-30',
      number: '30',
      rarity: 'Rare',
      metacardId: 213149,
      vera_name: 'Starmie',
      tcgdex_name: 'Starmie',
    },
    {
      id: 'ecard3-H28',
      number: 'H28',
      rarity: 'Rare Holo',
      metacardId: 213149,
      vera_name: 'Starmie',
      tcgdex_name: 'Starmie',
    }
  ];

  const setPayload = {
    expansionId: 1538,
    cards: [
      {
        cardmarketProductId: 275254,
        name: 'Starmie [Energy Burst | Star Back]',
        metacardId: 213149,
        prices: { trend: 128.26, avg: 341.65, trendHolo: 41.33 }
      },
      {
        cardmarketProductId: 275288,
        name: 'Starmie [Energy Burst | Star Back]',
        metacardId: 213149,
        prices: { trend: 39.29, avg: 42.37, trendHolo: 16.37 }
      },
      {
        cardmarketProductId: 275302,
        name: 'Starmie [Random Legacy Variant]',
        metacardId: 999999,
        prices: { trend: 3.07, avg: 3.01, trendHolo: 18.78 }
      }
    ]
  };

  const assignmentMap = buildSetCardAssignmentMap(sourceCards, setPayload);

  // Nach der ersten Zuweisung wird die gesamte metacardId-213149-Gruppe verworfen.
  assert.equal(assignmentMap.get(sourceCards[0])?.cardmarketProductId, 275254);
  assert.equal(assignmentMap.get(sourceCards[1])?.cardmarketProductId, 275302);
});

// --- Collector-first & zero-padding tests ---

test('entryCollectorMatchesCard treats H09 and H9 as equivalent via zero-padding normalization', () => {
  const card = { number: 'H09' };
  const entry = { collectorNumber: 'H9' };
  assert.equal(entryCollectorMatchesCard(entry, card), true);
});

test('entryCollectorMatchesCard treats 009 and 9 as equivalent via zero-padding normalization', () => {
  const card = { number: '009' };
  const entry = { collectorNumber: '9' };
  assert.equal(entryCollectorMatchesCard(entry, card), true);
});

test('entryCollectorMatchesCard treats A001 and A1 as equivalent via zero-padding normalization', () => {
  const card = { number: 'A001' };
  const entry = { collectorNumber: 'A1' };
  assert.equal(entryCollectorMatchesCard(entry, card), true);
});

test('entryCollectorMatchesCard still distinguishes H1 from H2', () => {
  const card = { number: 'H1' };
  const entry = { collectorNumber: 'H2' };
  assert.equal(entryCollectorMatchesCard(entry, card), false);
});

test('resolveCardmarketEntryForCardFromSetPayload resolves by collector number before name when collector is unambiguous', () => {
  const card = {
    number: 'H09',
    vera_name: 'Alakazam',
    tcgdex_name: 'Alakazam',
  };

  const setPayload = {
    expansionId: 1538,
    cards: [
      {
        cardmarketProductId: 275238,
        name: 'Alakazam [Energy Jump | Psychic]',
        collectorNumber: 'H9',
        prices: { trend: 12.5 }
      },
      {
        cardmarketProductId: 275260,
        name: 'Alakazam [Energy Jump | Psychic]',
        collectorNumber: '2',
        prices: { trend: 8.3 }
      }
    ]
  };

  const result = resolveCardmarketEntryForCardFromSetPayload(card, setPayload);
  assert.equal(result?.cardmarketProductId, 275238);
});

test('resolveCardmarketEntryForCardFromSetPayload resolves by collector number across full set even when names differ', () => {
  const card = {
    number: '009',
    vera_name: 'Bulbasaur',
    tcgdex_name: 'Bulbasaur',
  };

  const setPayload = {
    expansionId: 2001,
    cards: [
      {
        cardmarketProductId: 1001,
        name: 'Bulbasaur',
        collectorNumber: '9',
        prices: { trend: 1.2 }
      },
      {
        cardmarketProductId: 1002,
        name: 'Ivysaur',
        collectorNumber: '10',
        prices: { trend: 4.6 }
      }
    ]
  };

  const result = resolveCardmarketEntryForCardFromSetPayload(card, setPayload);
  assert.equal(result?.cardmarketProductId, 1001);
});

test('resolveCardmarketEntryForCardFromSetPayload falls back to name when collector number is absent', () => {
  const card = {
    vera_name: 'Pikachu',
    tcgdex_name: 'Pikachu',
  };

  const setPayload = {
    expansionId: 2001,
    cards: [
      {
        cardmarketProductId: 1001,
        name: 'Pikachu [Thunder Jolt]',
        prices: { trend: 1.2 }
      },
      {
        cardmarketProductId: 1002,
        name: 'Raichu',
        prices: { trend: 4.6 }
      }
    ]
  };

  const result = resolveCardmarketEntryForCardFromSetPayload(card, setPayload);
  assert.equal(result?.cardmarketProductId, 1001);
});

test('buildSetCardAssignmentMap uses collector number as primary match criterion', () => {
  const sourceCards = [
    {
      number: 'H09',
      vera_name: 'Alakazam',
      tcgdex_name: 'Alakazam',
    },
    {
      number: '2',
      vera_name: 'Alakazam',
      tcgdex_name: 'Alakazam',
    }
  ];

  const setPayload = {
    expansionId: 1538,
    cards: [
      {
        cardmarketProductId: 275238,
        name: 'Alakazam [Energy Jump | Psychic]',
        collectorNumber: 'H9',
        prices: { trend: 12.5 }
      },
      {
        cardmarketProductId: 275260,
        name: 'Alakazam [Energy Jump | Psychic]',
        collectorNumber: '2',
        prices: { trend: 8.3 }
      }
    ]
  };

  const assignmentMap = buildSetCardAssignmentMap(sourceCards, setPayload);
  assert.equal(assignmentMap.get(sourceCards[0])?.cardmarketProductId, 275238);
  assert.equal(assignmentMap.get(sourceCards[1])?.cardmarketProductId, 275260);
});

test('buildSetCardAssignmentMap falls back to name when collector number does not match', () => {
  const sourceCards = [
    {
      vera_name: 'Pikachu',
      tcgdex_name: 'Pikachu',
    },
    {
      vera_name: 'Raichu',
      tcgdex_name: 'Raichu',
    }
  ];

  const setPayload = {
    expansionId: 2001,
    cards: [
      {
        cardmarketProductId: 1001,
        name: 'Pikachu [Thunder Jolt]',
        prices: { trend: 1.2 }
      },
      {
        cardmarketProductId: 1002,
        name: 'Raichu [Thunderbolt]',
        prices: { trend: 4.6 }
      }
    ]
  };

  const assignmentMap = buildSetCardAssignmentMap(sourceCards, setPayload);
  assert.equal(assignmentMap.get(sourceCards[0])?.cardmarketProductId, 1001);
  assert.equal(assignmentMap.get(sourceCards[1])?.cardmarketProductId, 1002);
});

test('resolveCardmarketEntryForCardFromSetPayload does not match collector number when name differs (cross-name collision)', () => {
  const card = {
    number: '2',
    vera_name: 'Arkani',
    tcgdex_name: 'Arkani',
  };

  const setPayload = {
    expansionId: 1523,
    cards: [
      {
        cardmarketProductId: 273697,
        name: 'Blastoise [Rain Dance | Hydro Pump]',
        collectorNumber: '2',
        prices: { trend: 5.0 }
      },
      {
        cardmarketProductId: 273698,
        name: 'Arkani [Fire Spin | Flamethrower]',
        collectorNumber: '3',
        prices: { trend: 3.0 }
      }
    ]
  };

  // collectorNumber "2" matches Blastoise, but name is Arkani → should NOT match Blastoise
  const result = resolveCardmarketEntryForCardFromSetPayload(card, setPayload);
  assert.notEqual(result?.cardmarketProductId, 273697);
});

test('buildSetCardAssignmentMap uses name tiebreak when collector number matches multiple entries', () => {
  const sourceCards = [
    {
      number: '2',
      vera_name: 'Arkani',
      tcgdex_name: 'Arkani',
    },
    {
      number: '3',
      vera_name: 'Blastoise',
      tcgdex_name: 'Blastoise',
    }
  ];

  const setPayload = {
    expansionId: 1523,
    cards: [
      {
        cardmarketProductId: 273697,
        name: 'Blastoise [Rain Dance | Hydro Pump]',
        collectorNumber: '2',
        prices: { trend: 5.0 }
      },
      {
        cardmarketProductId: 273698,
        name: 'Arkani [Fire Spin | Flamethrower]',
        collectorNumber: '2',
        prices: { trend: 3.0 }
      }
    ]
  };

  const assignmentMap = buildSetCardAssignmentMap(sourceCards, setPayload);
  // Arkani should match the Arkani entry by name tiebreak, not Blastoise by collectorNumber
  assert.equal(assignmentMap.get(sourceCards[0])?.cardmarketProductId, 273698);
});
