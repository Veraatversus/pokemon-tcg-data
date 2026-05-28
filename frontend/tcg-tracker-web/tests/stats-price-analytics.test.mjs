import test from 'node:test';
import assert from 'node:assert/strict';

import {
  computePriceAnalyticsFromSummaries,
  pickCardPriceFromSummary,
} from '../js/ui/stats-price-analytics.js';

test('pickCardPriceFromSummary prefers reverse holo values when requested', () => {
  const summary = {
    entry: {
      prices: {
        trend: 2.1,
        average: 2.2,
        trendHolo: 7.5,
        averageHolo: 7.3,
      },
    },
  };

  assert.equal(pickCardPriceFromSummary(summary, { preferReverseHolo: true }), 7.5);
  assert.equal(pickCardPriceFromSummary(summary, { preferReverseHolo: false }), 2.1);
});

test('computePriceAnalyticsFromSummaries aggregates totals, top set and top card', () => {
  const analytics = computePriceAnalyticsFromSummaries([
    {
      cardKey: 'sv1::001',
      cardName: 'Bulbasaur',
      setId: 'sv1',
      setName: 'Scarlet & Violet',
      isCollected: true,
      value: 2.5,
    },
    {
      cardKey: 'sv1::002',
      cardName: 'Ivysaur',
      setId: 'sv1',
      setName: 'Scarlet & Violet',
      isCollected: true,
      value: 3.5,
    },
    {
      cardKey: 'sv2::010',
      cardName: 'Mew',
      setId: 'sv2',
      setName: 'Paldea Evolved',
      isCollected: true,
      value: 9.0,
    },
    {
      cardKey: 'sv2::011',
      cardName: 'NoPriceCard',
      setId: 'sv2',
      setName: 'Paldea Evolved',
      isCollected: true,
      value: null,
    },
  ]);

  assert.equal(analytics.collectedCards, 4);
  assert.equal(analytics.pricedCollectedCards, 3);
  assert.equal(analytics.totalValue, 15.0);
  assert.equal(analytics.avgCollectedCardValue, 5.0);
  assert.equal(analytics.topSet?.setId, 'sv2');
  assert.equal(analytics.topSet?.value, 9.0);
  assert.equal(analytics.topCard?.cardKey, 'sv2::010');
  assert.equal(analytics.topCard?.value, 9.0);
  assert.equal(analytics.setBreakdown[0]?.setId, 'sv2');
  assert.equal(analytics.details?.medianValue, 3.5);
  assert.equal(analytics.details?.p90Value, 7.9);
  assert.equal(analytics.details?.pricedSets, 2);
  assert.equal(analytics.details?.totalCollectedSets, 2);
  assert.ok(Math.abs((analytics.details?.topFiveValueShare || 0) - 100) < 1e-9);
});

test('pickCardPriceFromSummary supports extended reverse-holo and avg fallbacks', () => {
  const summaryWithReverseFallback = {
    entry: {
      prices: {
        avgHolo: 6.2,
        avg: 2.9,
      },
    },
  };

  const summaryWithReverseSell = {
    entry: {
      prices: {
        reverseHoloSell: 5.1,
        low: 1.8,
      },
    },
  };

  assert.equal(pickCardPriceFromSummary(summaryWithReverseFallback, { preferReverseHolo: true }), 6.2);
  assert.equal(pickCardPriceFromSummary(summaryWithReverseFallback, { preferReverseHolo: false }), 2.9);
  assert.equal(pickCardPriceFromSummary(summaryWithReverseSell, { preferReverseHolo: true }), 5.1);
});

test('computePriceAnalyticsFromSummaries ignores uncollected and invalid prices safely', () => {
  const analytics = computePriceAnalyticsFromSummaries([
    {
      cardKey: 'sv1::001',
      cardName: 'CollectedWithoutPrice',
      setId: 'sv1',
      setName: 'Scarlet & Violet',
      isCollected: true,
      value: 0,
    },
    {
      cardKey: 'sv1::002',
      cardName: 'CollectedWithPrice',
      setId: 'sv1',
      setName: 'Scarlet & Violet',
      isCollected: true,
      value: 4.2,
    },
    {
      cardKey: 'sv1::003',
      cardName: 'NotCollected',
      setId: 'sv1',
      setName: 'Scarlet & Violet',
      isCollected: false,
      value: 9.9,
    },
    {
      cardKey: 'sv2::001',
      cardName: 'CollectedInvalidPrice',
      setId: 'sv2',
      setName: 'Paldea Evolved',
      isCollected: true,
      value: 'n/a',
    },
  ]);

  assert.equal(analytics.collectedCards, 3);
  assert.equal(analytics.pricedCollectedCards, 1);
  assert.equal(analytics.totalValue, 4.2);
  assert.ok(Math.abs(analytics.avgCollectedCardValue - 4.2) < 1e-9);
  assert.equal(analytics.topCard?.cardKey, 'sv1::002');
  assert.equal(analytics.details?.medianValue, 4.2);
  assert.equal(analytics.details?.p90Value, 4.2);
  assert.equal(analytics.details?.priceSpreadRatio, 1);
});

test('computePriceAnalyticsFromSummaries exposes advanced detail metrics for deep analysis', () => {
  const analytics = computePriceAnalyticsFromSummaries([
    { cardKey: 'a', cardName: 'A', setId: 's1', setName: 'Set 1', isCollected: true, value: 1 },
    { cardKey: 'b', cardName: 'B', setId: 's1', setName: 'Set 1', isCollected: true, value: 2 },
    { cardKey: 'c', cardName: 'C', setId: 's1', setName: 'Set 1', isCollected: true, value: 3 },
    { cardKey: 'd', cardName: 'D', setId: 's2', setName: 'Set 2', isCollected: true, value: 10 },
    { cardKey: 'e', cardName: 'E', setId: 's2', setName: 'Set 2', isCollected: true, value: 20 },
    { cardKey: 'f', cardName: 'F', setId: 's2', setName: 'Set 2', isCollected: true, value: 50 },
  ]);

  assert.equal(analytics.details?.q1Value, 2.25);
  assert.equal(analytics.details?.q3Value, 17.5);
  assert.equal(analytics.details?.iqrValue, 15.25);
  assert.equal(analytics.details?.medianValue, 6.5);
  assert.equal(analytics.details?.p90Value, 35);
  assert.equal(analytics.details?.outlierCount, 1);
  assert.ok(Math.abs((analytics.details?.madValue || 0) - 5) < 1e-9);
  assert.ok(Math.abs((analytics.details?.setHhi || 0) - 0.8702001081665764) < 1e-9);
});
