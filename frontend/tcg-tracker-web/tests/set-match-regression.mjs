import assert from 'node:assert/strict';
import { combineSetsForOverviewCompat, findMatchingTcgdexSet, resolvePreferredTcgdexSetBases } from '../js/pokecode-compat.js';
import { buildCardRecordFromSources, resolveDisplayCard, resolveDisplaySet, resolveSeriesGroupInfo } from '../js/data/schema-contract.js';
import { getCollectionUiState, resolveCollectionToggleState } from '../js/core/collection-state.js';
import {
  buildCombinedSearchDropdownOptions,
  buildSearchProgressLabel,
  createSpreadsheetSwitchStatePatch,
  resolveCombinedSearchSelection,
  shouldFetchApiCardsForSearchSet
} from '../js/core/utils.js';
import { filterSetsBySeriesKey, getStatsSeriesLabel } from '../js/ui/stats-series.js';

function testDoesNotFalseMatchSubsetName() {
  const result = findMatchingTcgdexSet(
    { id: 'ex7', name: 'Team Rocket Returns', ptcgoCode: '' },
    [
      {
        id: 'base5',
        name: 'Team Rocket',
        abbreviation: { official: 'RO' }
      }
    ],
    {}
  );

  assert.equal(
    result,
    null,
    'A subset-name fallback must not map Team Rocket Returns (ex7) to Team Rocket (base5).'
  );
}

function testDirectIdWinsWhenEnglishFallbackSetExists() {
  const result = findMatchingTcgdexSet(
    { id: 'ex7', name: 'Team Rocket Returns', ptcgoCode: 'TRR' },
    [
      {
        id: 'base5',
        name: 'Team Rocket',
        abbreviation: { official: 'RO' }
      },
      {
        id: 'ex7',
        name: 'Team Rocket Returns',
        abbreviation: { official: 'TRR' }
      }
    ],
    {}
  );

  assert.equal(result?.id, 'ex7');
}

function testExactEnglishNameBeatsConflictingCode() {
  const result = findMatchingTcgdexSet(
    { id: 'unknown-set', name: 'Team Rocket Returns', ptcgoCode: 'RO' },
    [
      {
        id: 'base5',
        name: 'Team Rocket',
        abbreviation: { official: 'RO' }
      },
      {
        id: 'ex7',
        name: 'Team Rocket Returns',
        abbreviation: { official: 'TR' }
      }
    ],
    {}
  );

  assert.equal(
    result?.id,
    'ex7',
    'Exact English set-name matching must win even if a conflicting code would point to base5.'
  );
}

function testLocaleResolutionSkipsGerman404WhenSetIsKnownEnOnly() {
  const bases = resolvePreferredTcgdexSetBases('ex7', {
    tcgdexBase: 'https://api.tcgdex.net/v2/de',
    tcgdexFallbackBase: 'https://api.tcgdex.net/v2/en',
    tcgdexDeSetIds: new Set(['base5']),
    tcgdexEnSetIds: new Set(['base5', 'ex7'])
  });

  assert.deepEqual(
    bases,
    ['https://api.tcgdex.net/v2/en'],
    'Known EN-only sets should skip the DE endpoint instead of producing a predictable 404 first.'
  );
}

function testSeriesGroupingUsesStableTcgdexKeyAcrossLocalizedLabels() {
  const germanDisplay = resolveSeriesGroupInfo({
    setId: 'swsh12pt5',
    series: 'Schwert & Schild',
    vera_series: 'Sword & Shield',
    tcgdex_serie_name: 'Schwert & Schild',
    tcgdex_serie_id: 'swsh'
  });

  const englishFallbackDisplay = resolveSeriesGroupInfo({
    setId: 'swsh12pt5gg',
    series: 'Sword & Shield',
    vera_series: 'Sword & Shield',
    tcgdex_serie_name: '',
    tcgdex_serie_id: ''
  });

  assert.equal(germanDisplay.key, englishFallbackDisplay.key, 'Localized and English display labels must land in the same dashboard series bucket even when one set has no TCGDex series metadata.');
  assert.equal(germanDisplay.label, 'Schwert & Schild', 'When a localized Vera label exists, it should remain available for UI display.');
}

function testGermanTcgdexSetAssetsFallbackToEnglishSummaryAssets() {
  const [combined] = combineSetsForOverviewCompat({
    primarySets: [{
      id: 'sv1',
      name: 'Karmesin & Purpur',
      series: 'Karmesin & Purpur',
      total: 198,
      printedTotal: 198,
      images: { logo: '', symbol: '' },
      legalities: {},
      releaseDate: '2023-03-31',
      ptcgoCode: 'SVI'
    }],
    tcgdexSets: [{
      id: 'sv1',
      name: 'Scarlet & Violet',
      logo: 'https://assets.tcgdex.net/en/sv/sv1/logo.webp',
      symbol: 'https://assets.tcgdex.net/en/sv/sv1/symbol.webp',
      abbreviation: { official: 'SVI' },
      serie: { id: 'sv', name: 'Scarlet & Violet' }
    }],
    tcgdexResolvedSets: [{
      id: 'sv1',
      name: 'Karmesin & Purpur',
      logo: '',
      symbol: '',
      abbreviation: { official: 'SVI' },
      serie: { id: 'sv', name: 'Karmesin & Purpur' }
    }],
    customMappings: {},
    mapPrimarySetToOverviewModel: (set) => ({ setId: set.id }),
    toNumber: Number
  }).map((set) => resolveDisplaySet(set));

  assert.equal(combined.logoUrl, 'https://assets.tcgdex.net/en/sv/sv1/logo.webp');
  assert.equal(combined.symbolUrl, 'https://assets.tcgdex.net/en/sv/sv1/symbol.webp');
}

function testCardResolverUsesTcgdexDetailFieldsWhenPrimaryDataIsMissing() {
  const merged = buildCardRecordFromSources({
    setId: 'swsh12pt5gg',
    primaryCard: {
      id: 'swsh12pt5gg-TG01',
      number: 'TG01',
      name: 'Pikachu',
      images: { small: '', large: '' },
      types: []
    },
    tcgdexCard: {
      id: 'swsh12pt5gg-1',
      localId: 'TG01',
      name: 'Pikachu',
      rarity: 'Trainer Gallery Rare Holo',
      hp: 60,
      types: ['Lightning'],
      category: 'Pokemon',
      stage: 'Basic',
      suffix: 'TAG',
      illustrator: 'Naoki Saito',
      regulationMark: 'F',
      description: 'Spark mouse Pokémon.',
      effect: { en: 'Static' },
      variants: { normal: true, reverse: true },
      image: 'https://assets.tcgdex.net/en/swsh/swsh12pt5gg/TG01'
    },
    tcgdexSetId: 'swsh12pt5gg',
    tcgdexSeriesId: 'swsh'
  });

  const display = resolveDisplayCard(merged);

  assert.equal(display.rarity, 'Trainer Gallery Rare Holo');
  assert.equal(display.hp, '60');
  assert.deepEqual(display.types, ['Lightning']);
  assert.equal(display.supertype, 'Pokemon');
  assert.deepEqual(display.subtypes, ['Basic']);
  assert.equal(display.artist, 'Naoki Saito');
  assert.equal(display.regulationMark, 'F');
  assert.ok(Array.isArray(display.rules) && display.rules.some((entry) => String(entry).includes('Spark mouse Pokémon.')), 'TCGDex description/effect should still populate rules when Vera data is sparse.');
  assert.equal(display.flavorText, 'Spark mouse Pokémon.');
}

function testCardImageResolverDefaultsToTcgdexFirstPriority() {
  const display = resolveDisplayCard({
    vera_number: '001',
    vera_name: 'Tannza',
    vera_images_small: 'https://images.pokemontcg.io/sv1/1.png',
    vera_images_large: 'https://images.pokemontcg.io/sv1/1_hires.png',
    tcgdex_localId: '001',
    tcgdex_name: 'Tannza',
    tcgdex_image_small: 'https://assets.tcgdex.net/de/sv/sv01/001/low.webp',
    tcgdex_image_large: 'https://assets.tcgdex.net/de/sv/sv01/001/high.webp'
  });

  assert.equal(display.image, 'https://assets.tcgdex.net/de/sv/sv01/001/low.webp');
  assert.equal(display.imageLarge, 'https://assets.tcgdex.net/de/sv/sv01/001/high.webp');
}

function testCardmarketResolverPrefersDirectProductLinksOverSearchFallbacks() {
  const display = resolveDisplayCard({
    vera_number: '001',
    vera_name: 'Tannza',
    vera_cardmarket_url: 'https://www.cardmarket.com/de/Pokemon/Products/Singles?idProduct=696421',
    tcgdex_cardmarket_url: 'https://www.cardmarket.com/de/Pokemon/Products/Search?searchString=SVI+001+Tannza'
  });

  assert.equal(
    display.cardmarketUrl,
    'https://www.cardmarket.com/de/Pokemon/Products/Singles?idProduct=696421',
    'Display cards should surface the stable product URL when one source has already resolved it.'
  );
}

function testCollectionUiKeepsRhToggleAvailableWithoutCollectedFlag() {
  const uiState = getCollectionUiState({
    g: false,
    rh: false,
    gCell: { row: 2, col: 3 },
    rhCell: { row: 2, col: 4 }
  }, { isEditable: true });

  assert.equal(uiState.gDisabled, false);
  assert.equal(uiState.rhDisabled, false);
}

function testStatsSeriesHelpersPreferDisplayNamesOverIds() {
  const sets = [
    { setId: 'mep1', series: 'Mega-Entwicklung', tcgdex_serie_id: 'me' },
    { setId: 'sv1', series: 'Karmesin & Purpur', tcgdex_serie_id: 'sv' }
  ];

  assert.equal(getStatsSeriesLabel('me', { label: 'Mega-Entwicklung' }), 'Mega-Entwicklung');
  assert.equal(filterSetsBySeriesKey(sets, 'me').length, 1);
  assert.equal(filterSetsBySeriesKey(sets, 'me')[0].setId, 'mep1');
}

function testRhToggleAutoEnablesCollectedStatus() {
  const nextState = resolveCollectionToggleState({
    g: false,
    rh: false
  }, {
    isG: false,
    checked: true
  });

  assert.deepEqual(nextState, { g: true, rh: true });
}

function testSpreadsheetSwitchStatePatchClearsStaleCollectionState() {
  const patch = createSpreadsheetSwitchStatePatch({
    searchRunId: 4,
    currentSet: { setId: 'sv1' },
    cards: [{ id: 'sv1-1' }],
    summaryData: [{ setName: 'Scarlet & Violet', collected: 3 }],
    summaryOverrides: new Map([['sv1', { collected: 3 }]]),
    dbMap: new Map([['sv1-1', { g: true }]]),
    searchCache: new Map([['pikachu', [{ id: 'sv1-1' }]]]),
    pendingSearchSetImport: true,
    pendingSearchCardFocusKey: 'sv1-1'
  });

  assert.equal(patch.summaryData, null);
  assert.equal(patch.currentSet, null);
  assert.deepEqual(patch.cards, []);
  assert.ok(patch.summaryOverrides instanceof Map && patch.summaryOverrides.size === 0);
  assert.ok(patch.dbMap instanceof Map && patch.dbMap.size === 0);
  assert.ok(patch.searchCache instanceof Map && patch.searchCache.size === 0);
  assert.equal(patch.pendingSearchSetImport, false);
  assert.equal(patch.pendingSearchCardFocusKey, null);
  assert.equal(patch.searchRunId, 5, 'Spreadsheet switch should invalidate older search runs and caches.');
}

function testCombinedSearchSelectionKeepsModesAndImportedSetTargetsDistinct() {
  assert.deepEqual(resolveCombinedSearchSelection('', 'all'), {
    mode: 'all',
    setId: ''
  });

  assert.deepEqual(resolveCombinedSearchSelection('scope:imported'), {
    mode: 'imported',
    setId: ''
  });

  assert.deepEqual(resolveCombinedSearchSelection('scope:all'), {
    mode: 'all',
    setId: ''
  });

  assert.deepEqual(resolveCombinedSearchSelection('scope:online'), {
    mode: 'online',
    setId: ''
  });

  assert.deepEqual(resolveCombinedSearchSelection('sv1'), {
    mode: 'imported',
    setId: 'sv1'
  });

  assert.deepEqual(resolveCombinedSearchSelection('set:all:sv4'), {
    mode: 'all',
    setId: 'sv4'
  });
}

function testCombinedSearchDropdownOptionsIncludeGlobalModesAndImportedSets() {
  const groups = buildCombinedSearchDropdownOptions([
    { setId: 'sv1', setName: 'Scarlet & Violet', imported: true },
    { setId: 'pal', setName: 'Paldea Evolved', imported: true },
    { setId: 'sv4', setName: 'Paradox Rift', imported: false },
    { setId: 'sv3', setName: 'Obsidian Flames', imported: false }
  ]);

  assert.equal(groups.length, 3, 'Combined search dropdown should render search scopes, imported sets, and marked non-imported sets.');
  assert.equal(groups[0]?.label, 'Suchbereich');
  assert.deepEqual(
    groups[0]?.options?.map((entry) => entry.value),
    ['scope:all', 'scope:imported', 'scope:online']
  );
  assert.equal(groups[1]?.label, 'Importierte Sets');
  assert.deepEqual(
    groups[1]?.options?.map((entry) => entry.value),
    ['sv1', 'pal']
  );
  assert.equal(groups[2]?.label, 'Weitere Sets (noch nicht importiert)');
  assert.deepEqual(
    groups[2]?.options?.map((entry) => entry.value),
    ['set:all:sv3', 'set:all:sv4']
  );
  assert.deepEqual(
    groups[2]?.options?.map((entry) => entry.label),
    ['Obsidian Flames', 'Paradox Rift']
  );
  assert.ok(
    groups[2]?.options?.every((entry) => entry.mode === 'all' && entry.imported === false),
    'Non-imported set options should stay selectable via all/API mode and be marked through metadata instead of verbose label text.'
  );
}

function testImportedSearchFallsBackToApiWhenImportedSetHasNoDbCards() {
  assert.equal(
    shouldFetchApiCardsForSearchSet('imported', { imported: true, setId: 'sv11' }, false),
    true,
    'Imported-set search should still query the API when an imported set currently has no local DB cards.'
  );

  assert.equal(
    shouldFetchApiCardsForSearchSet('imported', { imported: true, setId: 'sv11' }, true),
    false,
    'Imported-set search should stay on the DB path once imported cards are available locally.'
  );
}

function testSearchProgressLabelIncludesApiPhaseAfterSetScanFinishes() {
  assert.equal(
    buildSearchProgressLabel({
      setsProcessed: 215,
      totalSets: 215,
      apiProcessed: 66,
      totalApiSets: 174
    }),
    ' · 107/215 Sets',
    'The live search pill should show unified progress across imported and API-backed set searches.'
  );
}

try {
  testDoesNotFalseMatchSubsetName();
  testDirectIdWinsWhenEnglishFallbackSetExists();
  testExactEnglishNameBeatsConflictingCode();
  testLocaleResolutionSkipsGerman404WhenSetIsKnownEnOnly();
  testSeriesGroupingUsesStableTcgdexKeyAcrossLocalizedLabels();
  testGermanTcgdexSetAssetsFallbackToEnglishSummaryAssets();
  testCardResolverUsesTcgdexDetailFieldsWhenPrimaryDataIsMissing();
  testCardImageResolverDefaultsToTcgdexFirstPriority();
  testCardmarketResolverPrefersDirectProductLinksOverSearchFallbacks();
  testCollectionUiKeepsRhToggleAvailableWithoutCollectedFlag();
  testStatsSeriesHelpersPreferDisplayNamesOverIds();
  testRhToggleAutoEnablesCollectedStatus();
  testSpreadsheetSwitchStatePatchClearsStaleCollectionState();
  testCombinedSearchSelectionKeepsModesAndImportedSetTargetsDistinct();
  testCombinedSearchDropdownOptionsIncludeGlobalModesAndImportedSets();
  testImportedSearchFallsBackToApiWhenImportedSetHasNoDbCards();
  testSearchProgressLabelIncludesApiPhaseAfterSetScanFinishes();
  console.log('set-match-regression: ok');
} catch (error) {
  console.error('set-match-regression: failed');
  console.error(error);
  process.exit(1);
}
