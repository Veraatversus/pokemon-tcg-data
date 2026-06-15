import { formatCardmarketEntryLabel, formatCardmarketEntryTitle } from '../data/cardmarket-data.js?v=20260613-tcgdex-merge-fix-v2';
import { isGeneratedCardmarketSearchUrl, applyReverseHoloQueryParam } from '../data/cardmarket-url-utils.js';

// ============================================================================
// Pure helpers
// ============================================================================

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

// Stable cache key for a card's price summary. Uses setId/number/name when
// available, falls back to the cardmarket URL for purely-URL-keyed lookups.
// Imported by app.js and views/set-view-controller.js for the price summary
// Map caches.
export function getCardmarketPriceCacheKey(card = {}) {
  const setId = String(card?.setId || '').trim();
  const number = String(card?.number || '').trim();
  const name = String(card?.name || '').trim();
  if (setId || number || name) {
    return `${setId}::${number}::${name}`;
  }
  return String(card?.cardmarketUrl || '').trim();
}

// ============================================================================
// Base-Price-Type + Candidate-Listen
// ============================================================================

export const CARDMARKET_BASE_PRICE_DEFAULT = 'trend';
export const CARDMARKET_BASE_PRICE_ALLOWED = new Set([
  'trend',
  'average',
  'average1',
  'average7',
  'average30',
  'low'
]);

// Fallback-Kandidatenliste in der Reihenfolge, in der sie abgeklappert wird,
// wenn der Primaerschluessel (per `basePriceType` gewaehlt) keinen Wert
// liefert. Format: [[keys...], label].
const CARDMARKET_LINK_FALLBACK_NORMAL = [
  [['trend'], 'Trend'],
  [['average', 'avg'], 'Ø'],
  [['average1', 'avg1'], 'Ø1'],
  [['average7', 'avg7'], 'Ø7'],
  [['average30', 'avg30'], 'Ø30'],
  [['low'], 'Low']
];

const CARDMARKET_LINK_FALLBACK_REVERSE = [
  [['trendHolo'], 'RH Trend'],
  [['averageHolo', 'avgHolo'], 'RH Ø'],
  [['average1Holo', 'avg1Holo'], 'RH Ø1'],
  [['average7Holo', 'avg7Holo'], 'RH Ø7'],
  [['average30Holo', 'avg30Holo'], 'RH Ø30'],
  [['lowHolo'], 'RH Low'],
  [['reverseHoloSell'], 'RH Sell']
];

// Primaerschluessel pro Basis-Preistyp (Normal + RH-Variante).
const CARDMARKET_BASE_TO_CANDIDATE = {
  trend: {
    normal: [['trend'], 'Trend'],
    reverseHolo: [['trendHolo'], 'RH Trend']
  },
  average: {
    normal: [['average', 'avg'], 'Ø'],
    reverseHolo: [['averageHolo', 'avgHolo'], 'RH Ø']
  },
  average1: {
    normal: [['average1', 'avg1'], 'Ø1'],
    reverseHolo: [['average1Holo', 'avg1Holo'], 'RH Ø1']
  },
  average7: {
    normal: [['average7', 'avg7'], 'Ø7'],
    reverseHolo: [['average7Holo', 'avg7Holo'], 'RH Ø7']
  },
  average30: {
    normal: [['average30', 'avg30'], 'Ø30'],
    reverseHolo: [['average30Holo', 'avg30Holo'], 'RH Ø30']
  },
  low: {
    normal: [['low'], 'Low'],
    reverseHolo: [['lowHolo'], 'RH Low']
  }
};

export function normalizeCardmarketBasePriceType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return CARDMARKET_BASE_PRICE_ALLOWED.has(normalized)
    ? normalized
    : CARDMARKET_BASE_PRICE_DEFAULT;
}

// Baut die priorisierte Kandidatenliste (Primaerschluessel + Fallbacks)
// fuer den Link-/Lightbox-Pick. Doppelte Schluessel werden herausgefiltert,
// damit z.B. `basePriceType: 'average'` und die Fallback-Liste nicht beide
// auf den gleichen Schluessel verweisen.
export function getCardmarketPrimaryCandidates({ reverseHolo = false, basePriceType = CARDMARKET_BASE_PRICE_DEFAULT } = {}) {
  const normalizedType = normalizeCardmarketBasePriceType(basePriceType);
  const selected = reverseHolo
    ? CARDMARKET_BASE_TO_CANDIDATE[normalizedType]?.reverseHolo
    : CARDMARKET_BASE_TO_CANDIDATE[normalizedType]?.normal;
  const fallback = reverseHolo ? CARDMARKET_LINK_FALLBACK_REVERSE : CARDMARKET_LINK_FALLBACK_NORMAL;
  const seen = new Set();

  return [selected, ...fallback]
    .filter((candidate) => Array.isArray(candidate?.[0]))
    .filter((candidate) => {
      const signature = candidate[0].join('|');
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    });
}

// ============================================================================
// Tooltip / Title-Builder
// ============================================================================

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

export function buildCardmarketLinkPresentation(summary, { preferReverseHolo = false, basePriceType = CARDMARKET_BASE_PRICE_DEFAULT } = {}) {
  if (!summary?.entry) return null;

  const entry = summary.entry;
  const prices = entry?.prices || {};
  const reverseCandidates = getCardmarketPrimaryCandidates({ reverseHolo: true, basePriceType });
  const normalCandidates = getCardmarketPrimaryCandidates({ reverseHolo: false, basePriceType });

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

// ============================================================================
// DOM-Renderer
// ============================================================================

/**
 * Rendert das zweispaltige "Normal / Reverse Holo"-Preis-Panel im Lightbox.
 *
 * @param {object} targets - DOM-Targets.
 * @param {HTMLElement} targets.priceMode - Element fuer den Status-Text ("Reverse Holo aktiv" / "Normal aktiv").
 * @param {HTMLElement} targets.priceGrid - Container-Element fuer die Preis-Gruppen.
 * @param {object|null} summary - Aufgeloester Cardmarket-Summary (mit `.entry.prices`).
 * @param {object} [opts]
 * @param {boolean} [opts.preferReverseHolo=false] - Zeigt im Header "Reverse Holo aktiv" an und
 *        priorisiert im RH-Panel die Holo-Preise (mit Fallback auf Normal, wenn keine
 *        verlaesslichen Holo-Daten vorliegen).
 */
export function renderLightboxCardmarketPrices(targets, summary, { preferReverseHolo = false } = {}) {
  const { priceMode, priceGrid } = targets || {};
  if (!priceMode || !priceGrid) return;

  priceMode.textContent = preferReverseHolo ? 'Reverse Holo aktiv' : 'Normal aktiv';
  priceGrid.innerHTML = '';

  if (!summary) {
    const loading = document.createElement('p');
    loading.className = 'lightbox-price-loading';
    loading.textContent = 'Preise werden geladen…';
    priceGrid.appendChild(loading);
    return;
  }

  const prices = summary?.entry?.prices;
  if (!prices || typeof prices !== 'object') {
    const empty = document.createElement('p');
    empty.className = 'lightbox-price-empty';
    empty.textContent = 'Keine Preisdetails verfügbar.';
    priceGrid.appendChild(empty);
    return;
  }

  // Wenn der User die Karte als RH markiert hat, in Cardmarket aber keine
  // eigene Holo-Variante existiert (`avgHolo == null`), wuerden die
  // Holo-Zeilen mit Werten einer anderen Variante befuellt. Stattdessen
  // zeigen wir im "Reverse Holo"-Panel die normalen Kartenpreise an.
  const reliableHolo = hasReliableHoloPrices(prices);
  const reverseRows = reliableHolo
    ? [
        ['Trend', getCardmarketPriceValue(prices, 'trendHolo')],
        ['Durchschnitt', getCardmarketPriceValue(prices, 'averageHolo', 'avgHolo')],
        ['Ø 1 Tag', getCardmarketPriceValue(prices, 'average1Holo', 'avg1Holo')],
        ['Ø 7 Tage', getCardmarketPriceValue(prices, 'average7Holo', 'avg7Holo')],
        ['Ø 30 Tage', getCardmarketPriceValue(prices, 'average30Holo', 'avg30Holo')],
        ['Low', getCardmarketPriceValue(prices, 'lowHolo')],
        ['Sell', getCardmarketPriceValue(prices, 'reverseHoloSell')]
      ]
    : [
        ['Trend', getCardmarketPriceValue(prices, 'trend')],
        ['Durchschnitt', getCardmarketPriceValue(prices, 'average', 'avg')],
        ['Ø 1 Tag', getCardmarketPriceValue(prices, 'average1', 'avg1')],
        ['Ø 7 Tage', getCardmarketPriceValue(prices, 'average7', 'avg7')],
        ['Ø 30 Tage', getCardmarketPriceValue(prices, 'average30', 'avg30')],
        ['Low', getCardmarketPriceValue(prices, 'low')]
      ];

  const createPriceGroup = (title, rows) => {
    const group = document.createElement('section');
    group.className = 'lightbox-price-group';

    const heading = document.createElement('h4');
    heading.textContent = title;
    group.appendChild(heading);

    let visibleRows = 0;
    rows.forEach(([label, value]) => {
      const formatted = formatEuroPrice(value);
      if (!formatted) return;

      const row = document.createElement('div');
      row.className = 'lightbox-price-row';

      const labelNode = document.createElement('span');
      labelNode.textContent = label;
      const valueNode = document.createElement('strong');
      valueNode.textContent = formatted;

      row.append(labelNode, valueNode);
      group.appendChild(row);
      visibleRows += 1;
    });

    return visibleRows ? group : null;
  };

  const groups = [
    createPriceGroup('Normal', [
      ['Trend', getCardmarketPriceValue(prices, 'trend')],
      ['Durchschnitt', getCardmarketPriceValue(prices, 'average', 'avg')],
      ['Ø 1 Tag', getCardmarketPriceValue(prices, 'average1', 'avg1')],
      ['Ø 7 Tage', getCardmarketPriceValue(prices, 'average7', 'avg7')],
      ['Ø 30 Tage', getCardmarketPriceValue(prices, 'average30', 'avg30')],
      ['Low', getCardmarketPriceValue(prices, 'low')]
    ]),
    createPriceGroup('Reverse Holo', reverseRows)
  ].filter(Boolean);

  if (!groups.length) {
    const empty = document.createElement('p');
    empty.className = 'lightbox-price-empty';
    empty.textContent = 'Keine Preisdetails verfügbar.';
    priceGrid.appendChild(empty);
    return;
  }

  groups.forEach((group) => priceGrid.appendChild(group));
}

/**
 * Aktualisiert einen Cardmarket-Link-Knoten mit Label, Tooltip und URL.
 *
 * @param {HTMLElement} linkEl
 * @param {object} summary
 * @param {object} [opts]
 * @param {boolean} [opts.compact=false] - Kompakte Variante (CM statt Cardmarket).
 * @param {boolean} [opts.preferReverseHolo=false] - Wirkt sich auf Picker + URL-Suffix aus.
 * @param {string}  [opts.basePriceType='trend'] - Basis-Preistyp fuer den Picker.
 * @param {string}  [opts.labelPrefix=''] - Optionales Prefix vor "CM"/"Cardmarket"
 *        (z.B. Emoji fuer die Set-View).
 * @param {string}  [opts.labelSeparator=' - '] - Trenner zwischen Prefix+Name und Preis.
 */
export function applyCardmarketPriceSummary(linkEl, summary, {
  compact = false,
  preferReverseHolo = false,
  basePriceType = CARDMARKET_BASE_PRICE_DEFAULT,
  labelPrefix = '',
  labelSeparator = ' - '
} = {}) {
  // Duck-Typing statt `instanceof HTMLElement`, damit die Funktion auch in
  // Node-Tests ohne DOM aufgerufen werden kann und mit jedem objektartigen
  // Link-Element funktioniert.
  if (!linkEl || typeof linkEl.href !== 'string' || !summary) return;
  const presentation = buildCardmarketLinkPresentation(summary, { preferReverseHolo, basePriceType });
  if (!presentation) return;

  if (summary.url) {
    // Beim Rendern den `?isReverseHolo=Y`-Suffix anhaengen, wenn die Karte als
    // RH gesammelt ist. So landet der User direkt auf der richtigen
    // Cardmarket-Produktseite. Search-URLs bleiben unveraendert (apply...
    // erkennt sie und passt nichts an).
    const finalUrl = applyReverseHoloQueryParam(summary.url, preferReverseHolo);
    linkEl.href = finalUrl;
    linkEl.dataset.cardmarketUrl = finalUrl;
    linkEl.classList.toggle('card-cm-link-fallback', isGeneratedCardmarketSearchUrl(finalUrl));
  }
  if (presentation.title) linkEl.title = presentation.title;
  if (presentation.label) {
    const prefix = compact ? 'CM' : 'Cardmarket';
    linkEl.textContent = `${labelPrefix}${prefix}${labelSeparator}${presentation.label}`;
  }
}
