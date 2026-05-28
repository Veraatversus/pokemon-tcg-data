import test from 'node:test';
import assert from 'node:assert/strict';

import { createStatsPriceViewController } from '../js/views/stats-price-view.js';

test('stats price view renders advanced workspace with filters and dynamic detail controls', () => {
  const container = {
    dataset: {},
    innerHTML: '',
    querySelectorAll: () => [],
  };

  const state = {
    statsPrice: {
      activeTab: 'advanced',
      items: [
        { cardKey: 'a', cardName: 'Alpha', setId: 'sv1', setName: 'Scarlet & Violet', value: 2.5, isCollected: true },
        { cardKey: 'b', cardName: 'Beta', setId: 'sv1', setName: 'Scarlet & Violet', value: null, isCollected: true },
        { cardKey: 'c', cardName: 'Gamma', setId: 'sv2', setName: 'Paldea Evolved', value: 24, isCollected: true, failed: true },
      ],
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
      totalValue: 26.5,
      avgCollectedCardValue: 13.25,
      collectedCards: 3,
      pricedCollectedCards: 2,
      priceCoverage: 66.7,
      setBreakdown: [
        { setId: 'sv2', setName: 'Paldea Evolved', value: 24, pricedCards: 1, collectedCards: 1 },
        { setId: 'sv1', setName: 'Scarlet & Violet', value: 2.5, pricedCards: 1, collectedCards: 2 },
      ],
      topCards: [
        { cardKey: 'c', cardName: 'Gamma', setId: 'sv2', setName: 'Paldea Evolved', value: 24 },
      ],
      details: {
        medianValue: 13.25,
        p90Value: 21,
        minValue: 2.5,
        maxValue: 24,
        topFiveValueShare: 100,
        pricedSetCoverage: 100,
        priceSpreadRatio: 9.6,
      },
    },
    loadedCards: 3,
    totalCards: 3,
    errors: 1,
    message: 'Preisradar abgeschlossen.',
  });

  assert.equal(container.dataset.state, 'final');
  assert.match(container.innerHTML, /data-tab-panel="advanced"/);
  assert.match(container.innerHTML, /data-advanced-filter="setId"/);
  assert.match(container.innerHTML, /data-advanced-filter="valueBand"/);
  assert.match(container.innerHTML, /data-advanced-filter="groupBy"/);
  assert.match(container.innerHTML, /data-advanced-group-key=/);
  assert.match(container.innerHTML, /data-advanced-detail-mode="summary"/);
  assert.match(container.innerHTML, /data-advanced-detail-mode="top"/);
  assert.match(container.innerHTML, /data-advanced-detail-mode="missing"/);
  assert.match(container.innerHTML, /data-advanced-detail-mode="distribution"/);
});
