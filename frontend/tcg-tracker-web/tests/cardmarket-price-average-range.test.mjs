// Grundpreis "Durchschnitt": unter der Karte steht die Spanne vom guenstigsten Angebot (low) bis zum groessten
// Durchschnittswert (avg, avg1, avg7, avg30); Cardmarket liefert keinen Hoechstpreis. Reverse Holo nutzt die Holo-Werte.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCardmarketLinkPresentation, formatEuroPrice } from '../js/ui/cardmarket-price.js';

const prices = {
  trend: 8.2, low: 2.5, avg: 6.8, avg1: 8.47, avg7: 6.1, avg30: 7.0,
  trendHolo: 12, lowHolo: 4, avgHolo: 11, avg1Holo: 15.5, avg7Holo: 10.25, avg30Holo: 12,
};
const summary = (p) => ({ entry: { prices: p } });

test('Durchschnitt: low bis groesster Durchschnitt', () => {
  const pres = buildCardmarketLinkPresentation(summary(prices), { basePriceType: 'average' });
  assert.equal(pres.label, `${formatEuroPrice(2.5)} – ${formatEuroPrice(8.47)}`);
});

test('Durchschnitt mit Reverse Holo: lowHolo bis groesster Holo-Durchschnitt', () => {
  const pres = buildCardmarketLinkPresentation(summary(prices), { basePriceType: 'average', preferReverseHolo: true });
  assert.equal(pres.label, `RH ${formatEuroPrice(4)} – ${formatEuroPrice(15.5)}`);
});

test('Durchschnitt: fehlt eine Seite oder sind beide gleich, steht ein Preis', () => {
  assert.equal(buildCardmarketLinkPresentation(summary({ avg: 3 }), { basePriceType: 'average' }).label, formatEuroPrice(3));
  assert.equal(buildCardmarketLinkPresentation(summary({ low: 2 }), { basePriceType: 'average' }).label, formatEuroPrice(2));
  assert.equal(buildCardmarketLinkPresentation(summary({ low: 3, avg: 3 }), { basePriceType: 'average' }).label, formatEuroPrice(3));
});

test('andere Grundpreise bleiben unveraendert (Trend)', () => {
  const pres = buildCardmarketLinkPresentation(summary(prices), { basePriceType: 'trend' });
  assert.ok(pres.label.includes(formatEuroPrice(8.2)));
  assert.ok(!pres.label.includes('–'));
});
