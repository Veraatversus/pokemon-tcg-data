import test from 'node:test';
import assert from 'node:assert/strict';

import { createStatsPriceViewController } from '../js/views/stats-price-view.js';

function createContainer() {
  return {
    dataset: {},
    innerHTML: '',
    querySelectorAll: () => [],
  };
}

function makePriceItems(count = 10, { withMissing = false } = {}) {
  return Array.from({ length: count }, (_, index) => ({
    cardKey: `card-${index + 1}`,
    cardName: `Card ${index + 1}`,
    setId: 'sv1',
    setName: 'Scarlet & Violet',
    value: withMissing ? null : 25 + index,
    isCollected: true,
    card: {
      number: String(index + 1).padStart(3, '0'),
      name: `Card ${index + 1}`,
      vera_cardmarket_url: `https://example.com/card-${index + 1}`,
    },
  }));
}

function makeSetBreakdown(count = 10) {
  return Array.from({ length: count }, (_, index) => ({
    setId: `set-${index + 1}`,
    setName: `Set ${index + 1}`,
    value: 100 - index,
    pricedCards: 1,
    collectedCards: 1,
  }));
}

function renderForTab(activeTab, { items = [], topCards = [], setBreakdown = [], avgValue = 10 } = {}) {
  const container = createContainer();
  const state = {
    statsPrice: {
      activeTab,
      items,
    },
  };

  const view = createStatsPriceViewController({
    state,
    navigate: () => {},
    getContainer: () => container,
    isActiveRequest: () => true,
  });

  view.renderStatsPriceSnapshot({
    status: 'final',
    analytics: {
      totalValue: 999,
      avgCollectedCardValue: avgValue,
      collectedCards: items.length,
      pricedCollectedCards: items.filter((entry) => Number(entry?.value) > 0).length,
      priceCoverage: 80,
      setBreakdown,
      topCards,
      details: {
        medianValue: 10,
        p90Value: 20,
        minValue: 1,
        maxValue: 100,
        topFiveValueShare: 20,
        pricedSetCoverage: 50,
        priceSpreadRatio: 4,
      },
    },
    loadedCards: items.length,
    totalCards: items.length,
    errors: 0,
    message: 'Preisradar abgeschlossen.',
  });

  return container.innerHTML;
}

function countMatches(source, pattern) {
  return (source.match(pattern) || []).length;
}

test('top-values and comparisons render complete data without hard truncation', () => {
  const topCards = makePriceItems(30, { withMissing: false });
  const setBreakdown = makeSetBreakdown(12);

  const topValuesHtml = renderForTab('top-values', {
    items: topCards,
    topCards,
    setBreakdown,
  });

  assert.equal(countMatches(topValuesHtml, /class="stats-price-rich-item"/g), 30);

  const comparisonsHtml = renderForTab('comparisons', {
    items: topCards,
    topCards,
    setBreakdown,
  });

  assert.equal(countMatches(comparisonsHtml, /class="stats-price-compare-row"/g), 12);
});

test('watchlist, advanced top cards and drilldown list remain complete for large datasets', () => {
  const pricedItems = makePriceItems(35, { withMissing: false });
  const missingItems = makePriceItems(130, { withMissing: true }).map((entry, index) => ({
    ...entry,
    cardKey: `missing-${index + 1}`,
    cardName: `Missing ${index + 1}`,
  }));

  const watchlistHtml = renderForTab('watchlist', {
    items: pricedItems,
    topCards: pricedItems,
    setBreakdown: makeSetBreakdown(1),
    avgValue: 10,
  });

  assert.equal(countMatches(watchlistHtml, /class="stats-price-rich-item"/g), 35);

  const advancedHtml = renderForTab('advanced', {
    items: pricedItems,
    topCards: pricedItems,
    setBreakdown: makeSetBreakdown(1),
  });

  assert.match(advancedHtml, /data-advanced-detail-mode="top" class="is-active"/);
  assert.equal(countMatches(advancedHtml, /class="stats-price-rich-item"/g), 35);

  const drilldownHtml = renderForTab('drilldown', {
    items: missingItems,
    topCards: missingItems,
    setBreakdown: makeSetBreakdown(1),
  });

  assert.equal(countMatches(drilldownHtml, /class="stats-price-drill-item"/g), 130);
});
