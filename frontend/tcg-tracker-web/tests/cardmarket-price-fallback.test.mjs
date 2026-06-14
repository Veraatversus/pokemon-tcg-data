import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCardmarketLinkPresentation,
  getCardmarketPriceDetails,
  hasReliableHoloPrices,
} from '../js/ui/cardmarket-price.js';

const makeEntry = (prices) => ({
  entry: {
    productId: 123,
    name: 'Test Card',
    expansionId: 999,
    prices,
    url: 'https://www.cardmarket.com/...',
  },
  url: 'https://www.cardmarket.com/...',
});

test('hasReliableHoloPrices returns true when avgHolo is a finite positive number', () => {
  assert.equal(hasReliableHoloPrices({ avgHolo: 1.5 }), true);
  assert.equal(hasReliableHoloPrices({ avgHolo: 0.5, averageHolo: null }), true);
});

test('hasReliableHoloPrices returns true when only the averageHolo alias is set', () => {
  assert.equal(hasReliableHoloPrices({ averageHolo: 2.0 }), true);
});

test('hasReliableHoloPrices returns false when avgHolo and averageHolo are both null/0', () => {
  assert.equal(hasReliableHoloPrices({ avgHolo: null, averageHolo: null }), false);
  assert.equal(hasReliableHoloPrices({}), false);
  assert.equal(hasReliableHoloPrices({ avgHolo: 0 }), false);
  assert.equal(hasReliableHoloPrices({ avgHolo: null, trendHolo: 5.0, avg1Holo: 0.2 }), false);
});

test('getCardmarketPriceDetails returns an empty list for reverseHolo when no reliable holo data exists', () => {
  // Karten ohne eigene Holo-Variante (avgHolo == null) sollen im
  // Tooltip/Title keine "Reverse Holo: ..."-Zeile mit Werten einer
  // anderen Variante anzeigen.
  const prices = {
    trend: 2.1,
    average: 2.2,
    avgHolo: null,
    trendHolo: 7.5,
    avg1Holo: 0.2,
    lowHolo: 0.24,
  };
  assert.deepEqual(getCardmarketPriceDetails(prices, { reverseHolo: true }), []);
  // Die normalen Preise muessen weiterhin verfuegbar sein.
  const normal = getCardmarketPriceDetails(prices, { reverseHolo: false });
  assert.ok(normal.length > 0);
  assert.ok(normal.some((line) => line.startsWith('Trend:')));
});

test('getCardmarketPriceDetails still shows holo rows when avgHolo is set', () => {
  const prices = {
    trend: 2.1,
    average: 2.2,
    avgHolo: 6.2,
    trendHolo: 7.5,
  };
  const reverse = getCardmarketPriceDetails(prices, { reverseHolo: true });
  assert.ok(reverse.length > 0, 'expected at least one reverse-holo detail line');
  assert.ok(reverse.some((line) => line.includes('6,20') || line.includes('6.20')));
});

test('buildCardmarketLinkPresentation falls back to normal prices when avgHolo is null', () => {
  const prices = {
    trend: 2.1,
    average: 2.2,
    avgHolo: null,
    trendHolo: 7.5,
    avg1Holo: 0.2,
    lowHolo: 0.24,
  };
  const summary = makeEntry(prices);

  // Trotz preferReverseHolo: true muss der Label-Preis aus den normalen
  // Feldern stammen (2,10 €), nicht aus dem (unzuverlaessigen) Holo-Feld.
  const presentation = buildCardmarketLinkPresentation(summary, { preferReverseHolo: true });
  assert.ok(presentation, 'expected a presentation');
  assert.match(presentation.label, /2,10/);
  assert.ok(!presentation.label.includes('7,50'));

  // Der Title darf keinen "Reverse Holo:"-Block enthalten, der Werte
  // einer anderen Variante zitiert.
  assert.ok(
    !presentation.title.includes('Reverse Holo:'),
    `title still contained "Reverse Holo:" block: ${presentation.title}`
  );
  // Der activeMode muss auf "Normal" stehen, weil wir auf die normale
  // Variante zurueckgefallen sind.
  assert.match(presentation.title, /Cardmarket \(Normal\)/);
});

test('buildCardmarketLinkPresentation keeps reverse-holo prices when avgHolo is set', () => {
  const prices = {
    trend: 2.1,
    averageHolo: 7.3,
  };
  const summary = makeEntry(prices);

  const presentation = buildCardmarketLinkPresentation(summary, { preferReverseHolo: true });
  assert.ok(presentation);
  assert.match(presentation.label, /7,30/);
  assert.match(presentation.title, /Cardmarket \(Reverse Holo\)/);
  assert.ok(presentation.title.includes('Reverse Holo:'));
});
