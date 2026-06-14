import { formatCardmarketEntryLabel, formatCardmarketEntryTitle } from '../data/cardmarket-data.js?v=20260613-tcgdex-merge-fix-v2';
import { isGeneratedCardmarketSearchUrl } from '../data/cardmarket-url-utils.js';

export function toFinitePrice(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

export function formatEuroPrice(value) {
  const numeric = toFinitePrice(value);
  return numeric == null ? '' : `${numeric.toFixed(2).replace('.', ',')} €`;
}

export function getCardmarketPriceValue(prices = {}, ...keys) {
  for (const key of keys) {
    if (prices?.[key] == null) continue;
    const numeric = toFinitePrice(prices[key]);
    if (numeric != null) return numeric;
  }
  return null;
}

// Prueft, ob fuer eine Karte verlaessliche Holo-Preisdaten vorliegen.
//
// Hintergrund: Cardmarket fuehrt nicht fuer jede Karte eine eigene
// "Reverse Holo"-Listings-Variante. Fehlt diese Variante, ist `avgHolo`
// (bzw. sein Alias `averageHolo`) typischerweise `null`. Die restlichen
// Holo-Felder (z.B. `trendHolo`, `avg1Holo`, `avg7Holo`, `lowHolo`) koennen
// in dem Fall trotzdem mit Werten befuellt sein - diese stammen dann aber
// von einer anderen Variante oder sind anderweitig unzuverlaessig und
// duerfen im Frontend NICHT als Holo-Preis angezeigt werden.
//
// Wird eine Karte dennoch als "Reverse Holo" gesammelt, soll das Frontend
// auf die normalen Kartenpreise zurueckfallen.
export function hasReliableHoloPrices(prices = {}) {
  if (toFinitePrice(prices?.avgHolo) != null) return true;
  if (toFinitePrice(prices?.averageHolo) != null) return true;
  return false;
}

export function getCardmarketPriceDetails(prices = {}, { reverseHolo = false } = {}) {
  // Fallback: Wenn `reverseHolo` angefordert wird, aber keine verlaesslichen
  // Holo-Preisdaten vorliegen, geben wir bewusst eine leere Liste zurueck,
  // damit im Tooltip/Title kein "Reverse Holo: ..."-Block mit Werten
  // erscheint, die zu einer anderen Variante gehoeren.
  if (reverseHolo && !hasReliableHoloPrices(prices)) return [];

  const fields = reverseHolo
    ? [
        [['trendHolo'], 'Trend'],
        [['averageHolo', 'avgHolo'], 'Ø'],
        [['average1Holo', 'avg1Holo'], 'Ø1'],
        [['average7Holo', 'avg7Holo'], 'Ø7'],
        [['average30Holo', 'avg30Holo'], 'Ø30'],
        [['lowHolo'], 'Low'],
        [['reverseHoloSell'], 'Sell']
      ]
    : [
        [['trend'], 'Trend'],
        [['average', 'avg'], 'Ø'],
        [['average1', 'avg1'], 'Ø1'],
        [['average7', 'avg7'], 'Ø7'],
        [['average30', 'avg30'], 'Ø30'],
        [['low'], 'Low']
      ];

  return fields
    .map(([keys, label]) => {
      const value = formatEuroPrice(getCardmarketPriceValue(prices, ...keys));
      if (!value) return null;
      return `${label}: ${value}`;
    })
    .filter(Boolean);
}

export function buildCardmarketLinkPresentation(summary, { preferReverseHolo = false } = {}) {
  if (!summary?.entry) return null;

  const entry = summary.entry;
  const prices = entry?.prices || {};
  const reverseCandidates = [
    [['trendHolo'], 'RH Trend'],
    [['averageHolo', 'avgHolo'], 'RH Ø'],
    [['lowHolo'], 'RH Low'],
    [['reverseHoloSell'], 'RH Sell']
  ];
  const normalCandidates = [
    [['trend'], 'Trend'],
    [['average', 'avg'], 'Ø'],
    [['low'], 'Low']
  ];

  const pickPrice = (candidates = []) => {
    for (const [keys, label] of candidates) {
      const value = formatEuroPrice(getCardmarketPriceValue(prices, ...keys));
      if (value) return { label, value };
    }
    return null;
  };

  // Fallback: Eine Karte kann zwar als "Reverse Holo" gesammelt sein, in
  // Cardmarket aber keine eigene Holo-Variante haben. In dem Fall ist
  // `avgHolo` typischerweise `null` und alle weiteren Holo-Felder sind
  // unzuverlaessig (siehe `hasReliableHoloPrices`). Wir verhalten uns dann
  // so, als waere `preferReverseHolo` false - der User sieht trotz
  // RH-Markierung die normalen Kartenpreise.
  const effectivePreferReverseHolo = preferReverseHolo && hasReliableHoloPrices(prices);

  const reversePick = pickPrice(reverseCandidates);
  const normalPick = pickPrice(normalCandidates);
  const activePick = (effectivePreferReverseHolo && reversePick) || normalPick || reversePick;
  const activeMode = effectivePreferReverseHolo && reversePick ? 'Reverse Holo' : 'Normal';

  const label = activePick
    ? `${activePick.label} ${activePick.value}`
    : formatCardmarketEntryLabel(entry);

  const reverseDetails = getCardmarketPriceDetails(prices, { reverseHolo: true });
  const normalDetails = getCardmarketPriceDetails(prices, { reverseHolo: false });
  const detailParts = [];
  if (normalDetails.length) detailParts.push(`Normal: ${normalDetails.join(' · ')}`);
  if (reverseDetails.length) detailParts.push(`Reverse Holo: ${reverseDetails.join(' · ')}`);

  const title = detailParts.length
    ? `Cardmarket (${activeMode}) · ${detailParts.join(' | ')}`
    : formatCardmarketEntryTitle(entry);

  return {
    label,
    title,
    url: summary.url || ''
  };
}