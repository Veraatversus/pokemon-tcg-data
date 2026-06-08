import { formatCardmarketEntryLabel, formatCardmarketEntryTitle } from '../data/cardmarket-data.js?v=20260608-stats-live-progress-rh-fix';
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

export function getCardmarketPriceDetails(prices = {}, { reverseHolo = false } = {}) {
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

  const reversePick = pickPrice(reverseCandidates);
  const normalPick = pickPrice(normalCandidates);
  const activePick = (preferReverseHolo && reversePick) || normalPick || reversePick;
  const activeMode = preferReverseHolo && reversePick ? 'Reverse Holo' : 'Normal';

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