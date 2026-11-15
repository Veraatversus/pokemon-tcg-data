// Einstellung "Preisspanne unter den Karten anzeigen" (cardmarketPriceRange): unabhaengig vom Grundpreis steht unter
// der Karte die Spanne vom guenstigsten Angebot (low) bis zum groessten juengeren Durchschnitt (avg1, avg7, avg30).
// Der Gesamt-Durchschnitt avg zaehlt nicht mit (alte Verkaufsspitzen). Cardmarket liefert keinen Hoechstpreis.
// Der Grundpreis bleibt fuer Berechnungen und fuer die Anzeige ohne Spanne zustaendig.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCardmarketLinkPresentation, formatEuroPrice } from '../js/ui/cardmarket-price.js';

const prices = {
  trend: 8.2, low: 2.5, avg: 19.99, avg1: 8.47, avg7: 6.1, avg30: 7.0,
  trendHolo: 12, lowHolo: 4, avgHolo: 30, avg1Holo: 15.5, avg7Holo: 10.25, avg30Holo: 12,
};
const summary = (p) => ({ entry: { prices: p } });

test('Spanne: low bis groesster juengerer Durchschnitt (avg zaehlt nicht)', () => {
  const pres = buildCardmarketLinkPresentation(summary(prices), { basePriceType: 'trend', showPriceRange: true });
  assert.equal(pres.label, `${formatEuroPrice(2.5)} – ${formatEuroPrice(8.47)}`);
});

test('Spanne gilt unabhaengig vom Grundpreis', () => {
  for (const basePriceType of ['average', 'average30', 'low']) {
    assert.equal(buildCardmarketLinkPresentation(summary(prices), { basePriceType, showPriceRange: true }).label, `${formatEuroPrice(2.5)} – ${formatEuroPrice(8.47)}`);
  }
});

test('Spanne mit Reverse Holo: RH, lowHolo bis groesster juengerer Holo-Durchschnitt', () => {
  const pres = buildCardmarketLinkPresentation(summary(prices), { showPriceRange: true, preferReverseHolo: true });
  assert.equal(pres.label, `RH ${formatEuroPrice(4)} – ${formatEuroPrice(15.5)}`);
});

test('Spanne: fehlt eine Seite oder sind beide gleich, steht ein Preis; ohne Werte der Grundpreis', () => {
  assert.equal(buildCardmarketLinkPresentation(summary({ avg7: 3 }), { showPriceRange: true }).label, formatEuroPrice(3));
  assert.equal(buildCardmarketLinkPresentation(summary({ low: 2 }), { showPriceRange: true }).label, formatEuroPrice(2));
  assert.equal(buildCardmarketLinkPresentation(summary({ low: 3, avg30: 3 }), { showPriceRange: true }).label, formatEuroPrice(3));
  assert.ok(buildCardmarketLinkPresentation(summary({ trend: 5 }), { showPriceRange: true }).label.includes(formatEuroPrice(5)));
});

test('ohne Spanne zeigt "Durchschnitt" wieder einen Wert (avg)', () => {
  const pres = buildCardmarketLinkPresentation(summary(prices), { basePriceType: 'average' });
  assert.match(pres.label, /^Ø 19,99/);
  assert.ok(!pres.label.includes('–'));
});

test('Spanne mit Grundpreis in der Mitte (zweite Einstellung)', () => {
  const pres = buildCardmarketLinkPresentation(summary(prices), { basePriceType: 'trend', showPriceRange: true, showPriceRangeBase: true });
  assert.equal(pres.label, `${formatEuroPrice(2.5)} – Trend ${formatEuroPrice(8.2)} – ${formatEuroPrice(8.47)}`);
  const rh = buildCardmarketLinkPresentation(summary(prices), { basePriceType: 'average30', showPriceRange: true, showPriceRangeBase: true, preferReverseHolo: true });
  assert.equal(rh.label, `RH ${formatEuroPrice(4)} – Ø30 ${formatEuroPrice(12)} – ${formatEuroPrice(15.5)}`);
  // ohne Spanne wirkt die zweite Einstellung nicht
  assert.ok(!buildCardmarketLinkPresentation(summary(prices), { basePriceType: 'trend', showPriceRangeBase: true }).label.includes('–'));
});
