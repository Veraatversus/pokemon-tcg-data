// Preis-Tab der Statistik (Cardmarket-Preisradar): Tabs, Watchlist, Advanced-Analyse und Lazy-Lade-Pipeline.
// Funktionen, die noch in app.js liegen, werden ueber actions.<name>() aufgerufen.
import { resolveItemCardmarketUrl } from '../data/cardmarket-url-utils.js';
import { readSetCollectionMap, listCollectionSetIds } from '../data/sheets-db.js?v=20261115-empty-sets';
import { collectionKeyOf } from '../data/collection-writes.js';
import { getCardLanguage } from '../data/schema-contract.js?v=20261115-empty-sets';
import { imageCandidates, fallbackImgAttrs } from '../ui/image-fallback.js';
import { normalizeCardNumber, toBoolean } from '../core/utils.js';
import { loadPriceStamp, refreshV3Prices } from '../data/v3-prices.js?v=20261115-empty-sets';
import { resetCardmarketPriceSummaryCaches } from '../ui/cardmarket-price.js?v=20261115-empty-sets';
import { computePriceAnalyticsFromSummaries, pickCardPriceFromSummary } from '../ui/stats-price-analytics.js?v=20261115-empty-sets';
import { dom } from '../app/dom.js';
import { state } from '../app/state.js';
import { navigate } from '../app/router.js';
import { showToast, escapeHtml, setLoading, getErrorMessage } from '../ui/helpers.js';
import { actions } from '../app/actions.js';
import { getSetById } from './dashboard.js';
import { navigateToSearchResultSet, openSearchResultLightbox } from './search.js';

const STATS_PRICE_CHUNK_SIZE = 25;
const STATS_PRICE_CONCURRENCY = 4;
const STATS_PRICE_WATCHLIST_BATCH_SIZE = 60;
const STATS_PRICE_WATCHLIST_INPUT_DEBOUNCE_MS = 520;

function getStatsPriceContainer() {
  return dom.statsContent?.querySelector('#stats-price-analytics') || null;
}

function formatStatsPriceEuro(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 'n/a';
  return `${numeric.toFixed(2).replace('.', ',')} EUR`;
}

export function formatStatsPriceNumber(value) {
  return Number(value || 0).toLocaleString('de-DE');
}

// v3-ID vor gespeicherter URL, `?isReverseHolo=Y` fuer als Reverse Holo gesammelte Karten.
function getItemCardmarketUrl(item = {}) {
  return resolveItemCardmarketUrl(item, { language: getCardLanguage() });
}

const STATS_PRICE_TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'top-values', label: 'Top-Werte' },
  { id: 'trends', label: 'Trends' },
  { id: 'comparisons', label: 'Vergleiche' },
  { id: 'advanced', label: 'Advanced' },
  { id: 'watchlist', label: 'Watchlist' },
  { id: 'timeline', label: 'Timeline/Story' },
  { id: 'drilldown', label: 'Fehler-Drilldown' },
];

function getStatsPriceTimeline(analytics = null, { loadedCards = 0, totalCards = 0, errors = 0 } = {}) {
  const collectedCards = Number(analytics?.collectedCards || 0);
  const pricedCards = Number(analytics?.pricedCollectedCards || 0);
  const coverage = Number(analytics?.priceCoverage || 0);
  const topSet = analytics?.topSet;
  const topCard = Array.isArray(analytics?.topCards) ? analytics.topCards[0] : null;
  const milestones = [
    {
      title: 'Scanner gestartet',
      detail: totalCards > 0
        ? `${formatStatsPriceNumber(totalCards)} gesammelte Karten in der Analyse-Pipeline.`
        : 'Sammlung wird für den Preisradar vorbereitet.',
      tone: 'cold',
    },
    {
      title: 'Bewertungsquote',
      detail: `${Math.round(coverage)}% bewertet (${formatStatsPriceNumber(pricedCards)} von ${formatStatsPriceNumber(collectedCards)}).`,
      tone: coverage >= 90 ? 'hot' : coverage >= 60 ? 'warm' : 'cold',
    },
    {
      title: 'Stärkstes Set',
      detail: topSet
        ? `${topSet.setName} führt mit ${formatStatsPriceEuro(topSet.value)} bei ${formatStatsPriceNumber(topSet.pricedCards)} Karten.`
        : 'Noch kein Set mit Preisdominanz ermittelt.',
      tone: topSet ? 'hot' : 'cold',
    },
    {
      title: 'Headline-Karte',
      detail: topCard
        ? `${topCard.cardName} (${topCard.setName}) markiert aktuell ${formatStatsPriceEuro(topCard.value)}.`
        : 'Es wurden noch keine Karten mit belastbaren Preisen gefunden.',
      tone: topCard ? 'warm' : 'cold',
    },
    {
      title: 'Qualitätssignal',
      detail: errors > 0
        ? `${formatStatsPriceNumber(errors)} Lookup-Fehler in der letzten Analyse entdeckt.`
        : 'Keine Lookup-Fehler - verbleibende Lücken sind fachliche Zuordnungsthemen.',
      tone: errors > 0 ? 'alert' : 'calm',
    },
    {
      title: 'Pipeline-Status',
      detail: totalCards > 0
        ? `${formatStatsPriceNumber(loadedCards)} von ${formatStatsPriceNumber(totalCards)} Karten wurden verarbeitet.`
        : 'Warte auf neue Preisläufe.',
      tone: loadedCards >= totalCards && totalCards > 0 ? 'hot' : 'warm',
    },
  ];

  return milestones;
}

function toFinitePositive(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function getValueBandKey(value) {
  const numeric = toFinitePositive(value);
  if (numeric == null) return 'missing';
  if (numeric < 1) return 'under1';
  if (numeric < 5) return 'from1to5';
  if (numeric < 20) return 'from5to20';
  return 'over20';
}

function getValueBandLabel(valueBand) {
  if (valueBand === 'under1') return '< 1 EUR';
  if (valueBand === 'from1to5') return '1-5 EUR';
  if (valueBand === 'from5to20') return '5-20 EUR';
  if (valueBand === 'over20') return '> 20 EUR';
  return 'Ohne Preis';
}

function normalizeAdvancedFilters(filters = {}) {
  const source = filters && typeof filters === 'object' ? filters : {};
  return {
    setId: String(source.setId || 'all'),
    valueBand: String(source.valueBand || 'all'),
    quantile: String(source.quantile || 'all'),
    quality: String(source.quality || 'all'),
    sortBy: String(source.sortBy || 'value-desc'),
    groupBy: String(source.groupBy || 'set'),
  };
}

function matchesQuantileBucket(percentile = 0, quantile = 'all') {
  if (quantile === 'all') return true;
  if (quantile === 'top1') return percentile <= 1;
  if (quantile === 'top5') return percentile <= 5;
  if (quantile === 'top10') return percentile <= 10;
  if (quantile === 'bottom20') return percentile > 80;
  return true;
}

function computeAdvancedWorkspace(items = [], filters = {}) {
  const safeItems = Array.isArray(items) ? items : [];
  const normalizedFilters = normalizeAdvancedFilters(filters);

  const withIds = safeItems.map((item, index) => ({
    ...item,
    __advancedId: String(item?.cardKey || `${item?.setId || 'unknown'}::${item?.cardName || 'card'}::${index}`),
  }));

  const pricedSorted = withIds
    .filter((item) => toFinitePositive(item?.value) != null)
    .sort((a, b) => Number(b?.value || 0) - Number(a?.value || 0));

  const quantileById = new Map();
  pricedSorted.forEach((item, index) => {
    const pct = ((index + 1) / Math.max(1, pricedSorted.length)) * 100;
    quantileById.set(item.__advancedId, pct);
  });

  const filteredItems = withIds.filter((item) => {
    const setId = String(item?.setId || '').trim();
    const value = toFinitePositive(item?.value);
    const valueBand = getValueBandKey(value);
    const percentile = quantileById.get(item.__advancedId) || 100;

    if (normalizedFilters.setId !== 'all' && setId !== normalizedFilters.setId) return false;
    if (normalizedFilters.quality === 'priced-only' && value == null) return false;
    if (normalizedFilters.quality === 'missing-only' && value != null) return false;
    if (normalizedFilters.quality === 'failed-only' && !item?.failed) return false;
    if (normalizedFilters.valueBand !== 'all' && normalizedFilters.valueBand !== valueBand) return false;
    if (!matchesQuantileBucket(percentile, normalizedFilters.quantile)) return false;

    return true;
  });

  const byGroup = new Map();
  const getGroupKeyAndLabel = (item) => {
    if (normalizedFilters.groupBy === 'value-band') {
      const band = getValueBandKey(item?.value);
      return { key: `band:${band}`, label: getValueBandLabel(band) };
    }
    if (normalizedFilters.groupBy === 'quantile') {
      const percentile = quantileById.get(item.__advancedId) || 100;
      const label = percentile <= 1
        ? 'Top 1%'
        : percentile <= 5
          ? 'Top 5%'
          : percentile <= 10
            ? 'Top 10%'
            : percentile > 80
              ? 'Bottom 20%'
              : 'Mittelbereich';
      return { key: `quantile:${label}`, label };
    }
    const setId = String(item?.setId || '').trim();
    const setName = String(item?.setName || '').trim() || 'Unbekanntes Set';
    return { key: `set:${setId || setName}`, label: setName, setId };
  };

  filteredItems.forEach((item) => {
    const grouping = getGroupKeyAndLabel(item);
    if (!byGroup.has(grouping.key)) {
      byGroup.set(grouping.key, {
        key: grouping.key,
        label: grouping.label,
        setId: grouping.setId || '',
        totalValue: 0,
        pricedCount: 0,
        missingCount: 0,
        failedCount: 0,
        items: [],
      });
    }
    const group = byGroup.get(grouping.key);
    const value = toFinitePositive(item?.value);
    group.items.push(item);
    if (value != null) {
      group.totalValue += value;
      group.pricedCount += 1;
    } else {
      group.missingCount += 1;
    }
    if (item?.failed) group.failedCount += 1;
  });

  const groups = Array.from(byGroup.values());
  const sortBy = normalizedFilters.sortBy;
  groups.sort((a, b) => {
    if (sortBy === 'value-asc') return a.totalValue - b.totalValue;
    if (sortBy === 'count-desc') return b.items.length - a.items.length;
    if (sortBy === 'gap-desc') return (b.missingCount - b.pricedCount) - (a.missingCount - a.pricedCount);
    return b.totalValue - a.totalValue;
  });

  const filteredPriced = filteredItems.filter((item) => toFinitePositive(item?.value) != null);
  const setIds = new Set(filteredItems.map((item) => String(item?.setId || '').trim()).filter(Boolean));

  return {
    filters: normalizedFilters,
    groups,
    summary: {
      cards: filteredItems.length,
      pricedCards: filteredPriced.length,
      missingCards: filteredItems.length - filteredPriced.length,
      setCount: setIds.size,
    },
  };
}

function normalizeWatchlistFilters(filters = {}) {
  const source = filters && typeof filters === 'object' ? filters : {};
  return {
    search: String(source.search || '').trim(),
    setId: String(source.setId || 'all'),
    variant: String(source.variant || 'all'),
    valueBand: String(source.valueBand || 'all'),
    quantile: String(source.quantile || 'all'),
    quality: String(source.quality || 'all'),
    cardmarket: String(source.cardmarket || 'all'),
    minValue: String(source.minValue || '').trim(),
    maxValue: String(source.maxValue || '').trim(),
    sortBy: String(source.sortBy || 'value-desc'),
  };
}

function parseWatchlistNumber(value) {
  if (value === '' || value == null) return null;
  const normalized = String(value).replace(',', '.').trim();
  if (!normalized) return null;
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

function getStatsPriceItemImageUrl(item = {}) {
  const card = item?.card || {};
  const candidates = [
    item?.image,
    item?.imageUrl,
    card?.imageSmall,
    card?.image,
    card?.imageUrl,
    card?.imageLarge,
    card?.images?.small,
    card?.images?.large,
  ];
  for (const candidate of candidates) {
    const value = String(candidate || '').trim();
    if (value) return value;
  }
  return '';
}

function getStatsPriceItemImageCandidates(item = {}) {
  // Kartenbild-Kette aus image-fallback.js (Sprachreihenfolge); item.image/imageUrl nur als Reserve
  // fuer Eintraege ohne Karten-Record.
  const candidates = [
    ...imageCandidates(item?.card || {}, 'cardSmall', getCardLanguage()),
    item?.image,
    item?.imageUrl
  ];
  const seen = new Set();
  return candidates
    .map((value) => String(value || '').trim())
    .filter((value) => value && !seen.has(value) && seen.add(value));
}

/**
 * Rendert das Thumbnail-Markup für einen Stats-Price-Listeneintrag.
 * Fallback-Kette ueber data-fallbacks (delegierter Handler in image-fallback.js),
 * am Ende pokeball-fallback.svg + .stats-price-thumb--missing.
 */
function renderStatsPriceThumbMarkup(item = {}) {
  const candidates = getStatsPriceItemImageCandidates(item);
  if (!candidates.length) {
    return '<span class="stats-price-thumb-fallback" aria-hidden="true">?</span>';
  }
  const altText = String(item?.cardName || item?.card?.name || item?.card?.number || 'Kartenbild').trim();
  return `<img class="stats-price-thumb-img" ${fallbackImgAttrs(candidates)} alt="${escapeHtml(altText)}" loading="lazy" decoding="async" />`;
}

function computeWatchlistWorkspace(items = [], filters = {}, analytics = null) {
  const safeItems = Array.isArray(items) ? items : [];
  const normalizedFilters = normalizeWatchlistFilters(filters);
  const minValue = parseWatchlistNumber(normalizedFilters.minValue);
  const maxValue = parseWatchlistNumber(normalizedFilters.maxValue);

  const withIds = safeItems.map((item, index) => ({
    ...item,
    __watchId: String(item?.cardKey || `${item?.setId || 'unknown'}::${item?.cardName || 'card'}::${index}`),
  }));

  const pricedSorted = withIds
    .filter((item) => toFinitePositive(item?.value) != null)
    .sort((a, b) => Number(b?.value || 0) - Number(a?.value || 0));
  const quantileById = new Map();
  pricedSorted.forEach((item, index) => {
    const pct = ((index + 1) / Math.max(1, pricedSorted.length)) * 100;
    quantileById.set(item.__watchId, pct);
  });

  const searchToken = normalizedFilters.search.toLocaleLowerCase('de-DE');
  const filtered = withIds.filter((item) => {
    const setId = String(item?.setId || '').trim();
    const value = toFinitePositive(item?.value);
    const valueBand = getValueBandKey(value);
    const percentile = quantileById.get(item.__watchId) || 100;
    const cardmarketUrl = getItemCardmarketUrl(item);
    const searchable = [
      item?.cardName,
      item?.setName,
      item?.card?.name,
      item?.card?.number,
      item?.cardKey,
    ].map((entry) => String(entry || '').toLocaleLowerCase('de-DE')).join(' ');

    if (searchToken && !searchable.includes(searchToken)) return false;
    if (normalizedFilters.setId !== 'all' && normalizedFilters.setId !== setId) return false;
    if (normalizedFilters.variant === 'holo-only' && item?.isReverseHolo) return false;
    if (normalizedFilters.variant === 'reverse-holo-only' && !item?.isReverseHolo) return false;
    if (normalizedFilters.valueBand !== 'all' && normalizedFilters.valueBand !== valueBand) return false;
    if (!matchesQuantileBucket(percentile, normalizedFilters.quantile)) return false;
    if (normalizedFilters.quality === 'priced-only' && value == null) return false;
    if (normalizedFilters.quality === 'missing-only' && value != null) return false;
    if (normalizedFilters.quality === 'failed-only' && !item?.failed) return false;
    if (normalizedFilters.cardmarket === 'with-link' && !cardmarketUrl) return false;
    if (normalizedFilters.cardmarket === 'without-link' && cardmarketUrl) return false;
    if (minValue != null && (value == null || value < minValue)) return false;
    if (maxValue != null && (value == null || value > maxValue)) return false;

    return true;
  });

  const sortBy = normalizedFilters.sortBy;
  filtered.sort((a, b) => {
    const valueA = Number(a?.value || 0);
    const valueB = Number(b?.value || 0);
    if (sortBy === 'value-asc') return valueA - valueB;
    if (sortBy === 'card-asc') {
      return String(a?.cardName || a?.card?.name || '')
        .localeCompare(String(b?.cardName || b?.card?.name || ''), 'de-DE', { sensitivity: 'base' });
    }
    if (sortBy === 'set-asc') {
      return String(a?.setName || '')
        .localeCompare(String(b?.setName || ''), 'de-DE', { sensitivity: 'base' });
    }
    if (sortBy === 'number-asc') {
      return String(a?.card?.number || a?.cardKey || '')
        .localeCompare(String(b?.card?.number || b?.cardKey || ''), 'de-DE', { numeric: true, sensitivity: 'base' });
    }
    if (sortBy === 'watch-score-desc') {
      const avgValue = Math.max(1, Number(analytics?.avgCollectedCardValue || 0));
      const scoreA = valueA <= 0 ? 0 : valueA / avgValue;
      const scoreB = valueB <= 0 ? 0 : valueB / avgValue;
      return scoreB - scoreA;
    }
    return valueB - valueA;
  });

  const pricedCards = filtered.filter((item) => toFinitePositive(item?.value) != null).length;
  const failedCards = filtered.filter((item) => item?.failed).length;
  const linkedCards = filtered.filter((item) => Boolean(getItemCardmarketUrl(item))).length;
  const setIds = new Set(filtered.map((item) => String(item?.setId || '').trim()).filter(Boolean));

  return {
    filters: normalizedFilters,
    items: filtered,
    summary: {
      cards: filtered.length,
      pricedCards,
      missingCards: filtered.length - pricedCards,
      failedCards,
      linkedCards,
      setCount: setIds.size,
    },
  };
}

/** Frischer Watchlist-Zustand (Filter, sichtbare Anzahl, Debounce-Timer, Auto-Nachladen). */
function createWatchlistState(filters = normalizeWatchlistFilters()) {
  return {
    filters,
    visibleCount: STATS_PRICE_WATCHLIST_BATCH_SIZE,
    debounceTimers: {},
    autoLoadBudget: 0,
    autoLoadInFlight: false,
  };
}

/** Liefert state.statsPrice.watchlist und legt ihn bei Bedarf an. */
function ensureWatchlistState() {
  state.statsPrice.watchlist = state.statsPrice.watchlist || createWatchlistState();
  return state.statsPrice.watchlist;
}

/** Liefert state.statsPrice.advanced (Advanced-Tab) und legt ihn bei Bedarf an. */
function ensureAdvancedState() {
  state.statsPrice.advanced = state.statsPrice.advanced || { filters: {}, selectedGroupKey: '', detailMode: 'top' };
  return state.statsPrice.advanced;
}

/** Normalisiert den Advanced- und Watchlist-Zustand vor dem Rendern der Tabs. */
function ensureStatsPriceViewState() {
  const advancedState = state.statsPrice.advanced || (state.statsPrice.advanced = {
    filters: normalizeAdvancedFilters(),
    selectedGroupKey: '',
    detailMode: 'top',
  });
  const watchlistState = ensureWatchlistState();
  advancedState.filters = normalizeAdvancedFilters(advancedState.filters);
  advancedState.detailMode = String(advancedState.detailMode || 'top');
  watchlistState.filters = normalizeWatchlistFilters(watchlistState.filters);
  watchlistState.visibleCount = Math.max(STATS_PRICE_WATCHLIST_BATCH_SIZE, Number(watchlistState.visibleCount || STATS_PRICE_WATCHLIST_BATCH_SIZE));
  watchlistState.autoLoadBudget = Math.max(0, Number(watchlistState.autoLoadBudget || 0));
  watchlistState.autoLoadInFlight = Boolean(watchlistState.autoLoadInFlight);
  return { advancedState, watchlistState };
}

/** Abgeleitete Daten aller Preis-Tabs (Kennzahlen, Watchlist- und Advanced-Arbeitsbereich). */
function buildStatsPriceTabContext(analytics, advancedState, watchlistState) {
  const safeItems = Array.isArray(state.statsPrice.items) ? state.statsPrice.items : [];
  const detailStats = analytics?.details || {};
  const watchlistWorkspace = computeWatchlistWorkspace(safeItems, watchlistState.filters, analytics);
  const watchlistItems = watchlistWorkspace.items;
  const watchlistVisibleItems = watchlistItems.slice(0, watchlistState.visibleCount);
  const advancedWorkspace = computeAdvancedWorkspace(safeItems, advancedState.filters);
  const advancedGroups = advancedWorkspace.groups;
  if (!advancedGroups.some((group) => group.key === advancedState.selectedGroupKey)) {
    advancedState.selectedGroupKey = advancedGroups[0]?.key || '';
  }

  return {
    pricedItems: safeItems.filter((item) => Number(item?.value) > 0),
    missingItems: safeItems.filter((item) => item?.value == null),
    bySet: Array.isArray(analytics?.setBreakdown) ? analytics.setBreakdown : [],
    topCards: Array.isArray(analytics?.topCards) ? analytics.topCards : [],
    coverage: Number(analytics?.priceCoverage || 0),
    avgValue: Number(analytics?.avgCollectedCardValue || 0),
    detailStats,
    medianValue: Number(detailStats?.medianValue || 0),
    p90Value: Number(detailStats?.p90Value || 0),
    topFiveShare: Number(detailStats?.topFiveValueShare || 0),
    pricedSetCoverage: Number(detailStats?.pricedSetCoverage || 0),
    spreadRatio: Number(detailStats?.priceSpreadRatio || 0),
    watchlistWorkspace,
    watchlistItems,
    watchlistVisibleItems,
    watchlistRemaining: Math.max(0, watchlistItems.length - watchlistVisibleItems.length),
    advancedWorkspace,
    advancedGroups,
    activeAdvancedGroup: advancedGroups.find((group) => group.key === advancedState.selectedGroupKey) || null,
  };
}

function renderStatsPriceTabs(activeTab) {
  return STATS_PRICE_TABS.map((tab) => `
    <button class="stats-price-tab-btn ${tab.id === activeTab ? 'is-active' : ''}" type="button" data-stats-price-tab="${tab.id}">
      ${escapeHtml(tab.label)}
    </button>`).join('');
}

function renderStatsPriceDashboardPanel({ coverage, missingItems, pricedItems, medianValue, p90Value, topFiveShare }, analytics, errors) {
  return `
    <section class="stats-price-tab-panel is-visible" data-tab-panel="dashboard">
      <div class="stats-price-panel-grid">
        <article class="stats-price-surface-card">
          <h4>Werttreiber</h4>
          <p>${analytics?.topSet ? `${escapeHtml(analytics.topSet.setName)} bleibt mit ${formatStatsPriceEuro(analytics.topSet.value)} dein stärkster Block.` : 'Noch kein Werttreiber erkannt.'}</p>
        </article>
        <article class="stats-price-surface-card">
          <h4>Momentum</h4>
          <p>${Math.round(coverage)}% Preisabdeckung, ${formatStatsPriceNumber(missingItems.length)} offene Lücken und ${formatStatsPriceNumber(errors)} technische Fehler.</p>
        </article>
        <article class="stats-price-surface-card">
          <h4>Detail-Signal</h4>
          <p>${pricedItems.length > 0
      ? `Median ${formatStatsPriceEuro(medianValue)} · P90 ${formatStatsPriceEuro(p90Value)} · Top-5 tragen ${Math.round(topFiveShare)}% vom Wert.`
      : 'Sobald High-Value-Karten erkannt werden, erscheint hier eine Prioritätenliste.'}</p>
        </article>
      </div>
    </section>`;
}

function renderStatsPriceTopValuesPanel(topCards) {
  return `
    <section class="stats-price-tab-panel" data-tab-panel="top-values">
      <ol class="stats-price-rich-list stats-price-scroll-region">
        ${topCards
          .slice()
          .map((card, index) => {
            const isReverse = Boolean(card?.isReverseHolo);
            const reverseClass = isReverse ? ' is-reverse' : '';
            const cardmarketUrl = getItemCardmarketUrl(card);
            return `
            <li class="stats-price-rich-item${reverseClass}" data-set-id="${escapeHtml(card?.setId || '')}" data-stats-card-key="${escapeHtml(statsPriceCardKey(card))}">
              <span class="stats-price-rich-rank">${index + 1}</span>
              <div class="stats-price-rich-main">
                <strong>${escapeHtml(card?.cardName || 'Unbekannte Karte')}${isReverse ? ' <span class="stats-price-rh-badge" title="Als Reverse Holo gesammelt">RH</span>' : ''}</strong>
                <small>${escapeHtml(card?.setName || 'Unbekanntes Set')} · #${escapeHtml(card?.card?.number || card?.cardNumber || card?.cardKey || '')}</small>
              </div>
              ${cardmarketUrl
      ? `<a class="stats-price-cardmarket-link" href="${escapeHtml(cardmarketUrl)}" target="_blank" rel="noopener noreferrer" data-cardmarket-link="1">Cardmarket</a>`
      : ''}
              <strong class="stats-price-rich-value">${formatStatsPriceEuro(card?.value)}</strong>
            </li>
          `;
          })
          .join('') || '<li class="stats-price-empty">Noch keine Top-Werte verfügbar.</li>'}
      </ol>
    </section>`;
}

function renderStatsPriceTrendsPanel({ coverage, avgValue, topCards, detailStats, spreadRatio, pricedSetCoverage }) {
  return `
    <section class="stats-price-tab-panel" data-tab-panel="trends">
      <div class="stats-price-trend-grid">
        <article class="stats-price-surface-card">
          <h4>Preisabdeckung</h4>
          <p>${Math.round(coverage)}% der gesammelten Karten sind bepreist.</p>
        </article>
        <article class="stats-price-surface-card">
          <h4>Preis-Mitte</h4>
          <p>Durchschnitt aktuell ${formatStatsPriceEuro(avgValue)} pro bewerteter Karte.</p>
        </article>
        <article class="stats-price-surface-card">
          <h4>Volatilität</h4>
          <p>${topCards.length > 0 ? `Spanne: ${formatStatsPriceEuro(detailStats?.minValue)} bis ${formatStatsPriceEuro(detailStats?.maxValue)} (x${spreadRatio > 0 ? spreadRatio.toFixed(1).replace('.', ',') : '0,0'}).` : 'Noch keine Daten für Volatilität.'}</p>
        </article>
        <article class="stats-price-surface-card">
          <h4>Set-Abdeckung</h4>
          <p>${Math.round(pricedSetCoverage)}% der Sets haben mindestens eine bewertete Karte.</p>
        </article>
      </div>
    </section>`;
}

function renderStatsPriceComparisonsPanel(bySet, analytics) {
  const chartRows = bySet.slice().map((entry, index) => {
    const setId = String(entry?.setId || '').trim();
    const pct = Math.max(2, Math.round((Number(entry?.value || 0) / Math.max(1, Number(analytics?.totalValue || 1))) * 100));
    return `
      <li class="stats-price-compare-row" data-set-id="${escapeHtml(setId)}">
        <span class="stats-price-compare-rank">${index + 1}</span>
        <div class="stats-price-compare-main">
          <strong>${escapeHtml(entry?.setName || 'Unbekanntes Set')}</strong>
          <small>${formatStatsPriceNumber(entry?.pricedCards)} bewertet</small>
        </div>
        <div class="stats-price-compare-bar"><span style="width:${pct}%"></span></div>
        <strong class="stats-price-compare-value">${formatStatsPriceEuro(entry?.value)}</strong>
      </li>`;
  }).join('');

  return `
    <section class="stats-price-tab-panel" data-tab-panel="comparisons">
      <ul class="stats-price-compare-list stats-price-scroll-region">
        ${chartRows || '<li class="stats-price-empty">Noch keine Set-Vergleiche verfügbar.</li>'}
      </ul>
    </section>`;
}

/** Set-Optionen fuer die Filter von Watchlist und Advanced (eindeutig je setId). */
function renderStatsPriceSetOptions(bySet, selectedSetId) {
  return Array.from(new Map(bySet.map((entry) => [String(entry?.setId || '').trim(), entry])).values())
    .filter((entry) => String(entry?.setId || '').trim())
    .map((entry) => `<option value="${escapeHtml(entry.setId)}" ${selectedSetId === String(entry.setId) ? 'selected' : ''}>${escapeHtml(entry.setName || entry.setId)}</option>`)
    .join('');
}

function renderStatsPriceWatchlistToolbar(filters, bySet) {
  return `
      <div class="stats-price-watchlist-toolbar">
        <label>Suche
          <input type="search" value="${escapeHtml(filters.search)}" data-watchlist-filter="search" placeholder="Karte, Set, Nummer" autocomplete="off" />
        </label>
        <label>Set
          <select data-watchlist-filter="setId">
            <option value="all" ${filters.setId === 'all' ? 'selected' : ''}>Alle Sets</option>
            ${renderStatsPriceSetOptions(bySet, filters.setId)}
          </select>
        </label>
        <label>Variante
          <select data-watchlist-filter="variant">
            <option value="all" ${filters.variant === 'all' ? 'selected' : ''}>Alle</option>
            <option value="holo-only" ${filters.variant === 'holo-only' ? 'selected' : ''}>Holo</option>
            <option value="reverse-holo-only" ${filters.variant === 'reverse-holo-only' ? 'selected' : ''}>Reverse Holo</option>
          </select>
        </label>
        <label>Preisband
          <select data-watchlist-filter="valueBand">
            <option value="all" ${filters.valueBand === 'all' ? 'selected' : ''}>Alle</option>
            <option value="under1" ${filters.valueBand === 'under1' ? 'selected' : ''}>&lt; 1 EUR</option>
            <option value="from1to5" ${filters.valueBand === 'from1to5' ? 'selected' : ''}>1-5 EUR</option>
            <option value="from5to20" ${filters.valueBand === 'from5to20' ? 'selected' : ''}>5-20 EUR</option>
            <option value="over20" ${filters.valueBand === 'over20' ? 'selected' : ''}>&gt; 20 EUR</option>
            <option value="missing" ${filters.valueBand === 'missing' ? 'selected' : ''}>Ohne Preis</option>
          </select>
        </label>
        <label>Quantil
          <select data-watchlist-filter="quantile">
            <option value="all" ${filters.quantile === 'all' ? 'selected' : ''}>Alle</option>
            <option value="top1" ${filters.quantile === 'top1' ? 'selected' : ''}>Top 1%</option>
            <option value="top5" ${filters.quantile === 'top5' ? 'selected' : ''}>Top 5%</option>
            <option value="top10" ${filters.quantile === 'top10' ? 'selected' : ''}>Top 10%</option>
            <option value="bottom20" ${filters.quantile === 'bottom20' ? 'selected' : ''}>Bottom 20%</option>
          </select>
        </label>
        <label>Qualität
          <select data-watchlist-filter="quality">
            <option value="all" ${filters.quality === 'all' ? 'selected' : ''}>Alles</option>
            <option value="priced-only" ${filters.quality === 'priced-only' ? 'selected' : ''}>Nur bepreist</option>
            <option value="missing-only" ${filters.quality === 'missing-only' ? 'selected' : ''}>Nur fehlend</option>
            <option value="failed-only" ${filters.quality === 'failed-only' ? 'selected' : ''}>Nur Fehler</option>
          </select>
        </label>
        <label>Cardmarket
          <select data-watchlist-filter="cardmarket">
            <option value="all" ${filters.cardmarket === 'all' ? 'selected' : ''}>Alle</option>
            <option value="with-link" ${filters.cardmarket === 'with-link' ? 'selected' : ''}>Mit Link</option>
            <option value="without-link" ${filters.cardmarket === 'without-link' ? 'selected' : ''}>Ohne Link</option>
          </select>
        </label>
        <label>Min EUR
          <input type="text" inputmode="decimal" value="${escapeHtml(filters.minValue)}" data-watchlist-filter="minValue" placeholder="z. B. 10" />
        </label>
        <label>Max EUR
          <input type="text" inputmode="decimal" value="${escapeHtml(filters.maxValue)}" data-watchlist-filter="maxValue" placeholder="z. B. 250" />
        </label>
        <label>Sortierung
          <select data-watchlist-filter="sortBy">
            <option value="value-desc" ${filters.sortBy === 'value-desc' ? 'selected' : ''}>Wert absteigend</option>
            <option value="value-asc" ${filters.sortBy === 'value-asc' ? 'selected' : ''}>Wert aufsteigend</option>
            <option value="watch-score-desc" ${filters.sortBy === 'watch-score-desc' ? 'selected' : ''}>Watch-Score</option>
            <option value="card-asc" ${filters.sortBy === 'card-asc' ? 'selected' : ''}>Karte A-Z</option>
            <option value="set-asc" ${filters.sortBy === 'set-asc' ? 'selected' : ''}>Set A-Z</option>
            <option value="number-asc" ${filters.sortBy === 'number-asc' ? 'selected' : ''}>Nummer</option>
          </select>
        </label>
        <button type="button" class="stats-price-watchlist-reset" data-watchlist-reset="1">Filter zurücksetzen</button>
      </div>`;
}

function renderStatsPriceWatchlistItem(item, index) {
  const globalRank = index + 1;
  const watchlistCardNumber = String(item?.card?.number || item?.cardKey || '').trim();
  const isReverse = Boolean(item?.isReverseHolo);
  const reverseClass = isReverse ? ' is-reverse' : '';
  const cardmarketUrl = getItemCardmarketUrl(item);
  return `
            <li class="stats-price-rich-item stats-price-rich-item--thumb${reverseClass}" data-set-id="${escapeHtml(item?.setId || '')}" data-stats-card-key="${escapeHtml(statsPriceCardKey(item))}" data-watchlist-card="1" data-watchlist-card-key="${escapeHtml(collectionKeyOf(item?.card))}" data-watchlist-card-number="${escapeHtml(watchlistCardNumber)}">
              <span class="stats-price-rich-rank">${globalRank}</span>
              <span class="stats-price-thumb" aria-hidden="true">
                ${renderStatsPriceThumbMarkup(item)}
              </span>
              <div class="stats-price-rich-main">
                <strong>${escapeHtml(item?.cardName || item?.card?.name || 'Unbekannte Karte')}${isReverse ? ' <span class="stats-price-rh-badge" title="Als Reverse Holo gesammelt">RH</span>' : ''}</strong>
                <small>${escapeHtml(item?.setName || 'Unbekanntes Set')} · #${escapeHtml(item?.card?.number || item?.cardKey || '')}</small>
              </div>
              <button type="button" class="btn-goto-set stats-price-open-set-btn" data-watchlist-open-set="1" title="Setansicht oeffnen">↗</button>
              ${cardmarketUrl
      ? `<a class="stats-price-cardmarket-link" href="${escapeHtml(cardmarketUrl)}" target="_blank" rel="noopener noreferrer" data-cardmarket-link="1">Cardmarket</a>`
      : ''}
              <strong class="stats-price-rich-value">${formatStatsPriceEuro(item?.value)}</strong>
            </li>`;
}

function renderStatsPriceWatchlistPanel({ watchlistWorkspace, watchlistItems, watchlistVisibleItems, watchlistRemaining, bySet }) {
  return `
    <section class="stats-price-tab-panel" data-tab-panel="watchlist">${renderStatsPriceWatchlistToolbar(watchlistWorkspace.filters, bySet)}

      <div class="stats-price-watchlist-summary">
        <article class="stats-price-card"><span>Treffer</span><strong>${formatStatsPriceNumber(watchlistWorkspace.summary.cards)}</strong></article>
        <article class="stats-price-card"><span>Bepreist</span><strong>${formatStatsPriceNumber(watchlistWorkspace.summary.pricedCards)}</strong></article>
        <article class="stats-price-card"><span>Mit Link</span><strong>${formatStatsPriceNumber(watchlistWorkspace.summary.linkedCards)}</strong></article>
        <article class="stats-price-card"><span>Sets</span><strong>${formatStatsPriceNumber(watchlistWorkspace.summary.setCount)}</strong></article>
      </div>

      <ol class="stats-price-rich-list stats-price-scroll-region stats-price-watchlist-scroll" data-watchlist-scroll-region="1" data-watchlist-total="${watchlistItems.length}">
        ${watchlistVisibleItems
          .map(renderStatsPriceWatchlistItem)
          .join('') || '<li class="stats-price-empty">Keine Treffer für aktuelle Filter.</li>'}
        ${watchlistRemaining > 0 ? '<li class="stats-price-watchlist-sentinel" data-watchlist-sentinel="1" aria-hidden="true"></li>' : ''}
      </ol>

      <div class="stats-price-watchlist-footer">
        <small>${formatStatsPriceNumber(watchlistVisibleItems.length)} von ${formatStatsPriceNumber(watchlistItems.length)} Karten geladen</small>
        ${watchlistRemaining > 0
      ? `<button type="button" class="stats-price-watchlist-more" data-watchlist-load-more="1">Mehr laden (${formatStatsPriceNumber(watchlistRemaining)} verbleibend)</button>`
      : '<span class="stats-price-watchlist-end">Ende der Liste erreicht</span>'}
      </div>
    </section>`;
}

function renderStatsPriceAdvancedGroups(advancedGroups, selectedGroupKey) {
  return advancedGroups
    .map((group) => {
      const isActive = group.key === selectedGroupKey;
      return `
          <li class="stats-price-advanced-group ${isActive ? 'is-active' : ''}" data-advanced-group-key="${escapeHtml(group.key)}" ${group.setId ? `data-set-id="${escapeHtml(group.setId)}"` : ''}>
            <div class="stats-price-advanced-group-main">
              <strong>${escapeHtml(group.label)}</strong>
              <small>${formatStatsPriceNumber(group.items.length)} Karten · ${formatStatsPriceNumber(group.pricedCount)} bepreist · ${formatStatsPriceNumber(group.missingCount)} ohne Preis</small>
            </div>
            <strong class="stats-price-advanced-group-value">${formatStatsPriceEuro(group.totalValue)}</strong>
          </li>`;
    })
    .join('');
}

function renderStatsPriceAdvancedSummaryDetail(activeAdvancedGroup, activeGroupItems) {
  return `
      <div class="stats-price-advanced-summary-grid">
        <article class="stats-price-surface-card">
          <h4>Gruppe</h4>
          <p>${activeAdvancedGroup ? `${escapeHtml(activeAdvancedGroup.label)} mit ${formatStatsPriceNumber(activeGroupItems.length)} Karten.` : 'Keine Gruppe ausgewählt.'}</p>
        </article>
        <article class="stats-price-surface-card">
          <h4>Wert</h4>
          <p>${activeAdvancedGroup ? `${formatStatsPriceEuro(activeAdvancedGroup.totalValue)} Gesamtwert bei ${formatStatsPriceNumber(activeAdvancedGroup.pricedCount)} bewerteten Karten.` : 'n/a'}</p>
        </article>
        <article class="stats-price-surface-card">
          <h4>Risiko</h4>
          <p>${activeAdvancedGroup ? `${formatStatsPriceNumber(activeAdvancedGroup.missingCount)} unbewertete Karten, ${formatStatsPriceNumber(activeAdvancedGroup.failedCount)} technische Fehler.` : 'n/a'}</p>
        </article>
      </div>`;
}

function renderStatsPriceAdvancedTopDetail(activeGroupPriced) {
  return `
      <ol class="stats-price-rich-list stats-price-scroll-region">
        ${activeGroupPriced
      .slice()
      .sort((a, b) => Number(b?.value || 0) - Number(a?.value || 0))
      .map((item, index) => {
        const isReverse = Boolean(item?.isReverseHolo);
        const reverseClass = isReverse ? ' is-reverse' : '';
        const cardmarketUrl = getItemCardmarketUrl(item);
        return `
            <li class="stats-price-rich-item${reverseClass}" ${item?.setId ? `data-set-id="${escapeHtml(item.setId)}" data-stats-card-key="${escapeHtml(statsPriceCardKey(item))}"` : ''}>
              <span class="stats-price-rich-rank">${index + 1}</span>
              <div class="stats-price-rich-main">
                <strong>${escapeHtml(item?.cardName || item?.card?.name || 'Unbekannte Karte')}${isReverse ? ' <span class="stats-price-rh-badge" title="Als Reverse Holo gesammelt">RH</span>' : ''}</strong>
                <small>${escapeHtml(item?.setName || 'Unbekanntes Set')} · #${escapeHtml(item?.card?.number || item?.cardKey || '')}</small>
              </div>
              ${cardmarketUrl
      ? `<a class="stats-price-cardmarket-link" href="${escapeHtml(cardmarketUrl)}" target="_blank" rel="noopener noreferrer" data-cardmarket-link="1">Cardmarket</a>`
      : ''}
              <strong class="stats-price-rich-value">${formatStatsPriceEuro(item?.value)}</strong>
            </li>
          `;
      })
      .join('') || '<li class="stats-price-empty">Keine bepreisten Karten in dieser Auswahl.</li>'}
      </ol>`;
}

function renderStatsPriceAdvancedMissingDetail(activeGroupMissing) {
  const advancedDetailMissingMarkup = `
      <ul class="stats-price-drill-list stats-price-scroll-region">
        ${activeGroupMissing
      .slice()
      .map((item) => `
            <li class="stats-price-drill-item" ${item?.setId ? `data-set-id="${escapeHtml(item.setId)}"` : ''}>
              <span class="stats-price-drill-number">${escapeHtml(item?.card?.number || item?.cardKey || '')}</span>
              <strong>${escapeHtml(item?.cardName || item?.card?.name || 'Unbekannte Karte')}</strong>
              <small>${item?.failed ? 'Lookup-Fehler' : 'Kein Preis-Mapping'}</small>
            </li>
          `)
      .join('') || '<li class="stats-price-empty">Keine Missing-Items in dieser Auswahl.</li>'}
      </ul>`;
  return advancedDetailMissingMarkup;
}

function renderStatsPriceAdvancedDistributionDetail(activeGroupItems) {
  const advancedDistributionByBand = activeGroupItems.reduce((acc, item) => {
    const band = getValueBandKey(item?.value);
    acc.set(band, (acc.get(band) || 0) + 1);
    return acc;
  }, new Map());
  return `
      <ul class="stats-price-advanced-distribution">
        ${['under1', 'from1to5', 'from5to20', 'over20', 'missing'].map((band) => `
          <li>
            <span>${getValueBandLabel(band)}</span>
            <strong>${formatStatsPriceNumber(advancedDistributionByBand.get(band) || 0)}</strong>
          </li>
        `).join('')}
      </ul>`;
}

/** Detailbereich der gewaehlten Advanced-Gruppe; unbekannter Modus zeigt die Summary. */
function renderStatsPriceAdvancedDetail(advancedDetailMode, activeAdvancedGroup) {
  const activeGroupItems = Array.isArray(activeAdvancedGroup?.items) ? activeAdvancedGroup.items : [];
  if (advancedDetailMode === 'top') {
    return renderStatsPriceAdvancedTopDetail(activeGroupItems.filter((item) => toFinitePositive(item?.value) != null));
  }
  if (advancedDetailMode === 'missing') {
    return renderStatsPriceAdvancedMissingDetail(activeGroupItems.filter((item) => toFinitePositive(item?.value) == null));
  }
  if (advancedDetailMode === 'distribution') return renderStatsPriceAdvancedDistributionDetail(activeGroupItems);
  return renderStatsPriceAdvancedSummaryDetail(activeAdvancedGroup, activeGroupItems);
}

function renderStatsPriceAdvancedToolbar(filters, bySet) {
  return `
      <div class="stats-price-advanced-toolbar">
        <label>Set
          <select data-advanced-filter="setId">
            <option value="all" ${filters.setId === 'all' ? 'selected' : ''}>Alle Sets</option>
            ${renderStatsPriceSetOptions(bySet, filters.setId)}
          </select>
        </label>
        <label>Preisband
          <select data-advanced-filter="valueBand">
            <option value="all" ${filters.valueBand === 'all' ? 'selected' : ''}>Alle</option>
            <option value="under1" ${filters.valueBand === 'under1' ? 'selected' : ''}>&lt; 1 EUR</option>
            <option value="from1to5" ${filters.valueBand === 'from1to5' ? 'selected' : ''}>1-5 EUR</option>
            <option value="from5to20" ${filters.valueBand === 'from5to20' ? 'selected' : ''}>5-20 EUR</option>
            <option value="over20" ${filters.valueBand === 'over20' ? 'selected' : ''}>&gt; 20 EUR</option>
            <option value="missing" ${filters.valueBand === 'missing' ? 'selected' : ''}>Ohne Preis</option>
          </select>
        </label>
        <label>Quantil
          <select data-advanced-filter="quantile">
            <option value="all" ${filters.quantile === 'all' ? 'selected' : ''}>Alle</option>
            <option value="top1" ${filters.quantile === 'top1' ? 'selected' : ''}>Top 1%</option>
            <option value="top5" ${filters.quantile === 'top5' ? 'selected' : ''}>Top 5%</option>
            <option value="top10" ${filters.quantile === 'top10' ? 'selected' : ''}>Top 10%</option>
            <option value="bottom20" ${filters.quantile === 'bottom20' ? 'selected' : ''}>Bottom 20%</option>
          </select>
        </label>
        <label>Qualität
          <select data-advanced-filter="quality">
            <option value="all" ${filters.quality === 'all' ? 'selected' : ''}>Alles</option>
            <option value="priced-only" ${filters.quality === 'priced-only' ? 'selected' : ''}>Nur bepreist</option>
            <option value="missing-only" ${filters.quality === 'missing-only' ? 'selected' : ''}>Nur fehlende Preise</option>
            <option value="failed-only" ${filters.quality === 'failed-only' ? 'selected' : ''}>Nur Lookup-Fehler</option>
          </select>
        </label>
        <label>Gruppierung
          <select data-advanced-filter="groupBy">
            <option value="set" ${filters.groupBy === 'set' ? 'selected' : ''}>Nach Set</option>
            <option value="value-band" ${filters.groupBy === 'value-band' ? 'selected' : ''}>Nach Preisband</option>
            <option value="quantile" ${filters.groupBy === 'quantile' ? 'selected' : ''}>Nach Quantil</option>
          </select>
        </label>
        <label>Sortierung
          <select data-advanced-filter="sortBy">
            <option value="value-desc" ${filters.sortBy === 'value-desc' ? 'selected' : ''}>Wert absteigend</option>
            <option value="value-asc" ${filters.sortBy === 'value-asc' ? 'selected' : ''}>Wert aufsteigend</option>
            <option value="count-desc" ${filters.sortBy === 'count-desc' ? 'selected' : ''}>Kartenanzahl</option>
            <option value="gap-desc" ${filters.sortBy === 'gap-desc' ? 'selected' : ''}>Coverage Gap</option>
          </select>
        </label>
      </div>`;
}

function renderStatsPriceAdvancedPanel({ advancedWorkspace, advancedGroups, activeAdvancedGroup, bySet }, advancedState) {
  const advancedGroupsMarkup = renderStatsPriceAdvancedGroups(advancedGroups, advancedState.selectedGroupKey);
  const advancedDetailMode = advancedState.detailMode;
  return `
    <section class="stats-price-tab-panel" data-tab-panel="advanced">${renderStatsPriceAdvancedToolbar(advancedWorkspace.filters, bySet)}

      <div class="stats-price-advanced-summary">
        <article class="stats-price-card"><span>Treffer</span><strong>${formatStatsPriceNumber(advancedWorkspace.summary.cards)}</strong></article>
        <article class="stats-price-card"><span>Bepreist</span><strong>${formatStatsPriceNumber(advancedWorkspace.summary.pricedCards)}</strong></article>
        <article class="stats-price-card"><span>Fehlend</span><strong>${formatStatsPriceNumber(advancedWorkspace.summary.missingCards)}</strong></article>
        <article class="stats-price-card"><span>Set-Abdeckung</span><strong>${formatStatsPriceNumber(advancedWorkspace.summary.setCount)}</strong></article>
      </div>

      <div class="stats-price-advanced-layout">
        <aside>
          <ul class="stats-price-advanced-groups stats-price-scroll-region">
            ${advancedGroupsMarkup || '<li class="stats-price-empty">Keine Gruppen für den aktuellen Filter.</li>'}
          </ul>
        </aside>
        <section class="stats-price-advanced-detail">
          <div class="stats-price-advanced-detail-tabs">
            <button type="button" data-advanced-detail-mode="summary" class="${advancedDetailMode === 'summary' ? 'is-active' : ''}">Summary</button>
            <button type="button" data-advanced-detail-mode="top" class="${advancedDetailMode === 'top' ? 'is-active' : ''}">Top Cards</button>
            <button type="button" data-advanced-detail-mode="missing" class="${advancedDetailMode === 'missing' ? 'is-active' : ''}">Missing</button>
            <button type="button" data-advanced-detail-mode="distribution" class="${advancedDetailMode === 'distribution' ? 'is-active' : ''}">Distribution</button>
          </div>
          ${renderStatsPriceAdvancedDetail(advancedDetailMode, activeAdvancedGroup)}
        </section>
      </div>
    </section>`;
}

function renderStatsPriceTimelinePanel(analytics, { loadedCards, totalCards, errors }) {
  const timelineMarkup = getStatsPriceTimeline(analytics, { loadedCards, totalCards, errors })
    .map((step, index) => `
      <li class="stats-price-story-item tone-${escapeHtml(step.tone)}">
        <span class="stats-price-story-dot">${index + 1}</span>
        <div>
          <strong>${escapeHtml(step.title)}</strong>
          <p>${escapeHtml(step.detail)}</p>
        </div>
      </li>
    `)
    .join('');

  return `
    <section class="stats-price-tab-panel" data-tab-panel="timeline">
      <ol class="stats-price-story-list">${timelineMarkup}</ol>
    </section>`;
}

/** Karten ohne Preis, gruppiert nach Set (meiste Luecken zuerst). */
function renderStatsPriceDrilldownGroups(missingItems) {
  const drilldownBySet = missingItems.reduce((acc, item) => {
    const key = String(item?.setId || '').trim() || 'unknown';
    if (!acc.has(key)) {
      acc.set(key, {
        setId: key,
        setName: String(item?.setName || 'Unbekanntes Set').trim(),
        items: [],
      });
    }
    acc.get(key).items.push(item);
    return acc;
  }, new Map());

  return Array.from(drilldownBySet.values())
    .sort((a, b) => b.items.length - a.items.length)
    .map((group) => `
      <details class="stats-price-drill-group">
        <summary>
          <strong>${escapeHtml(group.setName)}</strong>
          <small>${formatStatsPriceNumber(group.items.length)} ohne Preis</small>
        </summary>
        <ul class="stats-price-drill-list stats-price-scroll-region">
          ${group.items
            .map((item) => `
              <li class="stats-price-drill-item" data-set-id="${escapeHtml(item?.setId || '')}">
                <span class="stats-price-drill-number">${escapeHtml(item?.card?.number || item?.cardName || item?.cardKey || '')}</span>
                <strong>${escapeHtml(item?.cardName || item?.card?.name || 'Unbekannte Karte')}</strong>
                <small>${item?.failed ? 'Lookup-Fehler' : 'Kein Mapping-Eintrag'}</small>
              </li>
            `)
            .join('')}
        </ul>
      </details>
    `)
    .join('');
}

function renderStatsPriceDrilldownPanel(missingItems, errors) {
  return `
    <section class="stats-price-tab-panel" data-tab-panel="drilldown">
      <div class="stats-price-drill-headline">
        <strong>${formatStatsPriceNumber(missingItems.length)} Karten ohne Preis</strong>
        <small>${errors > 0 ? `${formatStatsPriceNumber(errors)} technische Fehler` : 'Keine technischen Fehler gemeldet'}</small>
      </div>
      <div class="stats-price-drill-groups">
        ${renderStatsPriceDrilldownGroups(missingItems) || '<p class="stats-price-empty">Keine Drilldown-Lücken vorhanden.</p>'}
      </div>
    </section>`;
}

function buildStatsPriceTabContent({
  activeTab = 'dashboard',
  analytics = null,
  status = 'loading',
  loadedCards = 0,
  totalCards = 0,
  errors = 0,
  message = '',
} = {}) {
  const { advancedState, watchlistState } = ensureStatsPriceViewState();
  const context = buildStatsPriceTabContext(analytics, advancedState, watchlistState);

  const panelMap = {
    dashboard: renderStatsPriceDashboardPanel(context, analytics, errors),
    'top-values': renderStatsPriceTopValuesPanel(context.topCards),
    trends: renderStatsPriceTrendsPanel(context),
    comparisons: renderStatsPriceComparisonsPanel(context.bySet, analytics),
    advanced: renderStatsPriceAdvancedPanel(context, advancedState),
    watchlist: renderStatsPriceWatchlistPanel(context),
    timeline: renderStatsPriceTimelinePanel(analytics, { loadedCards, totalCards, errors }),
    drilldown: renderStatsPriceDrilldownPanel(context.missingItems, errors),
  };

  return {
    tabsMarkup: renderStatsPriceTabs(activeTab),
    contentMarkup: panelMap[activeTab] || panelMap.dashboard,
    completionLabel: message || (status === 'final' ? 'Preisradar abgeschlossen.' : `${formatStatsPriceNumber(loadedCards)} / ${formatStatsPriceNumber(totalCards)} Karten geladen`),
  };
}

function isActiveStatsPriceRequest(requestId) {
  return state.statsPrice.requestId === requestId;
}

/**
 * Aktualisiert nur die Progress-Anzeige und KPI-Karten im bestehenden
 * Stats-View-DOM — wird bei jedem 'partial'-Chunk aufgerufen, damit der
 * User live mitverfolgen kann, wie die Berechnung voranschreitet, ohne
 * dass der ganze Container neu gebaut wird.
 */
function updateStatsPriceKpiDom(container, { progress, totalValue, averageValue, collectedCards, pricedCollectedCards, priceCoverage, errors, message, tabContent } = {}) {
  const progressPct = container.querySelector('[data-stats-progress-pct]');
  if (progressPct) progressPct.textContent = `${progress}%`;
  const progressBar = container.querySelector('[data-stats-progress-bar]');
  if (progressBar) progressBar.style.width = `${progress}%`;

  // KPI-Cards per QuerySelector — die Labels sind statisch, nur die
  // Werte werden ersetzt. data-stats-* Attribute sind beim Shell-Build
  // gesetzt worden.
  const totalValueEl = container.querySelector('[data-stats-total-value]');
  if (totalValueEl) totalValueEl.textContent = formatStatsPriceEuro(totalValue);
  const avgValueEl = container.querySelector('[data-stats-avg-value]');
  if (avgValueEl) avgValueEl.textContent = formatStatsPriceEuro(averageValue);
  const pricingEl = container.querySelector('[data-stats-pricing]');
  if (pricingEl) pricingEl.textContent = `${Math.round(priceCoverage)}%`;
  const pricingDetailEl = container.querySelector('[data-stats-pricing-detail]');
  if (pricingDetailEl) pricingDetailEl.textContent = `${formatStatsPriceNumber(pricedCollectedCards)} von ${formatStatsPriceNumber(collectedCards)}`;
  const missingEl = container.querySelector('[data-stats-missing]');
  if (missingEl) missingEl.textContent = formatStatsPriceNumber(collectedCards - pricedCollectedCards);
  const errorsDetailEl = container.querySelector('[data-stats-errors-detail]');
  if (errorsDetailEl) errorsDetailEl.textContent = errors > 0 ? `${formatStatsPriceNumber(errors)} Fehler` : 'keine Fehler';

  // Completion-Label (z.B. "100 / 200 Karten geladen")
  if (tabContent?.completionLabel) {
    const labelEl = container.querySelector('.stats-price-head p');
    if (labelEl) labelEl.textContent = tabContent.completionLabel;
  }

  // Tab-Inhalt (Item-Listen) aktualisieren — bei partial werden die
  // Listen länger, also muss der tab-content-Bereich neu gerendert werden.
  // Das ist deutlich billiger als der ganze Container, weil das Shell,
  // die KPI-Cards und die Tabs erhalten bleiben.
  const tabContentEl = container.querySelector('[data-stats-tab-content]');
  if (tabContentEl && tabContent?.contentMarkup) {
    tabContentEl.innerHTML = tabContent.contentMarkup;
  }
}

function getActiveStatsPriceTab() {
  return STATS_PRICE_TABS.some((tab) => tab.id === state.statsPrice.activeTab)
    ? state.statsPrice.activeTab
    : 'dashboard';
}

function captureWatchlistScrollSnapshot(container) {
  const scrollRegion = container.querySelector('[data-watchlist-scroll-region]');
  if (!scrollRegion) return null;
  return {
    scrollTop: Math.max(0, Number(scrollRegion.scrollTop || 0)),
  };
}

/** Kennzahlen fuer Fortschritt und KPI-Karten. */
function computeStatsPriceKpis(analytics, loadedCards, totalCards) {
  return {
    progress: totalCards > 0 ? Math.round((loadedCards / totalCards) * 100) : 0,
    totalValue: analytics?.totalValue || 0,
    averageValue: analytics?.avgCollectedCardValue || 0,
    collectedCards: analytics?.collectedCards || 0,
    pricedCollectedCards: analytics?.pricedCollectedCards || 0,
    priceCoverage: analytics?.priceCoverage || 0,
  };
}

/** Komplettes Markup des Preis-Panels (Kopf, KPI-Karten, Tabs, Tab-Inhalt). */
function renderStatsPriceShell({ status, tabContent, kpis, errors }) {
  const { progress, totalValue, averageValue, collectedCards, pricedCollectedCards, priceCoverage } = kpis;
  return `
    <article class="stats-price-panel ${status === 'final' ? 'stats-price-enter' : ''}">
      <header class="stats-price-head">
        <div>
          <span class="stats-price-kicker">Cardmarket Analyse</span>
          <h3>Preisradar f&#xfc;r deine Sammlung</h3>
          <p>${tabContent.completionLabel}</p>
        </div>
        <div class="stats-price-progress-wrap">
          <strong data-stats-progress-pct>${progress}%</strong>
          <div class="stats-price-progress"><span data-stats-progress-bar style="width:${progress}%"></span></div>
        </div>
      </header>

      <div class="stats-price-grid">
        <section class="stats-price-kpi-cluster">
          <article class="stats-price-card">
            <span>Gesamtwert</span>
            <strong>${formatStatsPriceEuro(totalValue)}</strong>
          </article>
          <article class="stats-price-card">
            <span>&#216; Preis / bewertet</span>
            <strong>${formatStatsPriceEuro(averageValue)}</strong>
          </article>
          <article class="stats-price-card">
            <span>Bewertet</span>
            <strong>${Math.round(priceCoverage)}%</strong>
            <small>${formatStatsPriceNumber(pricedCollectedCards)} von ${formatStatsPriceNumber(collectedCards)}</small>
          </article>
          <article class="stats-price-card">
            <span>Ohne Preis</span>
            <strong>${formatStatsPriceNumber(collectedCards - pricedCollectedCards)}</strong>
            <small>${errors > 0 ? `${formatStatsPriceNumber(errors)} Fehler` : 'keine Fehler'}</small>
          </article>
        </section>
      </div>

      <section class="stats-price-tabs" aria-label="Preis-Insights Tabs">
        ${tabContent.tabsMarkup}
      </section>

      <section class="stats-price-tab-content" data-stats-tab-content>
        ${tabContent.contentMarkup}
      </section>
    </article>`;
}

function renderStatsPriceSnapshot({
  status = 'loading',
  analytics = null,
  loadedCards = 0,
  totalCards = 0,
  errors = 0,
  message = '',
  preserveWatchlistScroll = undefined,
} = {}) {
  const container = getStatsPriceContainer();
  if (!container) return;

  // Argumente fuer das erneute Rendern aus den Event-Handlern.
  const snapshotArgs = { status, analytics, loadedCards, totalCards, errors, message };
  const kpis = computeStatsPriceKpis(analytics, loadedCards, totalCards);
  const activeTab = getActiveStatsPriceTab();
  const effectiveWatchlistScrollSnapshot = preserveWatchlistScroll === false
    ? null
    : (preserveWatchlistScroll && typeof preserveWatchlistScroll === 'object'
      ? preserveWatchlistScroll
      : (activeTab === 'watchlist' ? captureWatchlistScrollSnapshot(container) : null));
  const tabContent = buildStatsPriceTabContent({
    activeTab,
    analytics,
    status,
    loadedCards,
    totalCards,
    errors,
    message,
  });

  container.dataset.state = status;
  // Performance: bei 'partial' nur die Progress-/KPI-Werte im bestehenden
  // DOM aktualisieren — KEIN kompletter innerHTML-Rebuild. Der wäre bei
  // 7000+ Karten pro Chunk teuer und würde den Browser einfrieren lassen.
  // Beim 'loading' (erster Aufruf) und 'final' rendern wir die Shell neu.
  const partialLiveUpdate = status === 'partial'
    && container.querySelector('[data-stats-progress-pct]') !== null;
  if (partialLiveUpdate) {
    updateStatsPriceKpiDom(container, { ...kpis, errors, message, tabContent });
  } else {
    container.innerHTML = renderStatsPriceShell({ status, tabContent, kpis, errors });
  }

  const restoreWatchlistScrollSnapshot = (snapshot) => {
    if (!snapshot || activeTab !== 'watchlist') return;

    const applySnapshot = () => {
      const scrollRegion = container.querySelector('[data-watchlist-scroll-region]');
      if (!scrollRegion) return;
      const maxScrollTop = Math.max(0, scrollRegion.scrollHeight - scrollRegion.clientHeight);
      const targetScrollTop = Math.max(0, Math.min(maxScrollTop, Number(snapshot.scrollTop || 0)));
      scrollRegion.scrollTop = targetScrollTop;
    };

    applySnapshot();
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => {
        applySnapshot();
      });
    }
  };

  restoreWatchlistScrollSnapshot(effectiveWatchlistScrollSnapshot);

  const loadMoreWatchlistItems = (options) => loadMoreStatsPriceWatchlistItems(container, snapshotArgs, options);
  bindStatsPriceTabButtons(container, snapshotArgs);
  bindStatsPriceAdvancedControls(container, snapshotArgs);
  bindStatsPriceWatchlistFilters(container, snapshotArgs);
  bindStatsPriceWatchlistButtons(container, snapshotArgs, loadMoreWatchlistItems);
  bindStatsPriceWatchlistScrollRegions(container, loadMoreWatchlistItems);
  bindStatsPriceNavigation(container);
}

function bindStatsPriceTabButtons(container, snapshotArgs) {
  container.querySelectorAll('.stats-price-tab-btn[data-stats-price-tab]').forEach((tabButton) => {
    tabButton.addEventListener('click', () => {
      const nextTab = String(tabButton.dataset.statsPriceTab || '').trim();
      if (!nextTab || nextTab === state.statsPrice.activeTab) return;
      state.statsPrice.activeTab = nextTab;
      renderStatsPriceSnapshot({ ...snapshotArgs });
    });
  });
}

function bindStatsPriceAdvancedControls(container, snapshotArgs) {
  container.querySelectorAll('select[data-advanced-filter]').forEach((select) => {
    select.addEventListener('change', () => {
      const filterKey = String(select.dataset.advancedFilter || '').trim();
      if (!filterKey) return;
      const advanced = ensureAdvancedState();
      const nextFilters = normalizeAdvancedFilters(advanced.filters);
      nextFilters[filterKey] = String(select.value || 'all');
      advanced.filters = nextFilters;
      advanced.selectedGroupKey = '';
      renderStatsPriceSnapshot({ ...snapshotArgs });
    });
  });

  container.querySelectorAll('[data-advanced-group-key]').forEach((groupButton) => {
    groupButton.addEventListener('click', () => {
      const nextGroupKey = String(groupButton.dataset.advancedGroupKey || '').trim();
      if (!nextGroupKey) return;
      ensureAdvancedState().selectedGroupKey = nextGroupKey;
      renderStatsPriceSnapshot({ ...snapshotArgs });
    });
  });

  container.querySelectorAll('[data-advanced-detail-mode]').forEach((detailButton) => {
    detailButton.addEventListener('click', () => {
      const nextMode = String(detailButton.dataset.advancedDetailMode || '').trim();
      if (!nextMode) return;
      ensureAdvancedState().detailMode = nextMode;
      renderStatsPriceSnapshot({ ...snapshotArgs });
    });
  });
}

function bindStatsPriceWatchlistFilters(container, snapshotArgs) {
  container.querySelectorAll('[data-watchlist-filter]').forEach((control) => {
    bindWatchlistFilterControl(control, snapshotArgs);
  });
}

/** Ein Filter-Feld der Watchlist: Textfelder entprellt, Auswahllisten sofort. */
function bindWatchlistFilterControl(control, snapshotArgs) {
  const readFilterKey = () => String(control.dataset.watchlistFilter || '').trim();
  const applyWatchlistFilter = () => {
    const filterKey = readFilterKey();
    if (!filterKey) return;
    const watchlist = ensureWatchlistState();
    const nextFilters = normalizeWatchlistFilters(watchlist.filters);
    nextFilters[filterKey] = String(control.value || '').trim();
    watchlist.filters = nextFilters;
    watchlist.visibleCount = STATS_PRICE_WATCHLIST_BATCH_SIZE;
    renderStatsPriceSnapshot({ ...snapshotArgs, preserveWatchlistScroll: false });
  };

  const debounceable = control.tagName === 'INPUT';
  const scheduleWatchlistFilter = () => {
    const filterKey = readFilterKey();
    if (!filterKey) return;
    const watchlist = ensureWatchlistState();
    const timers = watchlist.debounceTimers || (watchlist.debounceTimers = {});
    if (timers[filterKey]) {
      window.clearTimeout(timers[filterKey]);
    }
    timers[filterKey] = window.setTimeout(() => {
      timers[filterKey] = 0;
      applyWatchlistFilter();
    }, STATS_PRICE_WATCHLIST_INPUT_DEBOUNCE_MS);
  };
  // Change/Enter: laufenden Debounce-Timer verwerfen und sofort filtern.
  const applyWatchlistFilterNow = () => {
    const filterKey = readFilterKey();
    if (filterKey && state.statsPrice.watchlist?.debounceTimers?.[filterKey]) {
      window.clearTimeout(state.statsPrice.watchlist.debounceTimers[filterKey]);
      state.statsPrice.watchlist.debounceTimers[filterKey] = 0;
    }
    applyWatchlistFilter();
  };

  if (control.tagName === 'INPUT') {
    control.addEventListener('input', scheduleWatchlistFilter);
    control.addEventListener('change', applyWatchlistFilterNow);
  } else {
    control.addEventListener('change', applyWatchlistFilter);
  }

  if (debounceable) {
    control.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      applyWatchlistFilterNow();
    });
  }
}

/** Zeigt den naechsten Block Watchlist-Karten; Quelle 'scroll' sperrt parallele Auto-Nachlader. */
function loadMoreStatsPriceWatchlistItems(container, snapshotArgs, { source = 'manual' } = {}) {
  const scrollRegion = container.querySelector('[data-watchlist-scroll-region]');
  if (!scrollRegion) return false;

  const total = Number(scrollRegion.dataset.watchlistTotal || 0);
  if (!Number.isFinite(total) || total <= 0) return false;

  const watchlist = ensureWatchlistState();
  if (source === 'scroll' && watchlist.autoLoadInFlight) return false;
  const visible = Number(watchlist.visibleCount || STATS_PRICE_WATCHLIST_BATCH_SIZE);
  if (visible >= total) return false;

  if (source === 'scroll') {
    watchlist.autoLoadInFlight = true;
    watchlist.autoLoadBudget = 0;
  }

  const captureCurrentWatchlistScrollSnapshot = () => {
    return {
      scrollTop: Math.max(0, Number(scrollRegion.scrollTop || 0)),
    };
  };
  const scrollSnapshot = captureCurrentWatchlistScrollSnapshot();

  watchlist.visibleCount = Math.min(total, visible + STATS_PRICE_WATCHLIST_BATCH_SIZE);
  renderStatsPriceSnapshot({
    ...snapshotArgs,
    preserveWatchlistScroll: scrollSnapshot,
  });
  if (source === 'scroll' && state.statsPrice.watchlist) {
    state.statsPrice.watchlist.autoLoadInFlight = false;
    state.statsPrice.watchlist.autoLoadBudget = 0;
  }
  return true;
}

function bindStatsPriceWatchlistButtons(container, snapshotArgs, loadMoreWatchlistItems) {
  container.querySelectorAll('[data-watchlist-reset]').forEach((button) => {
    button.addEventListener('click', () => {
      const nextFilters = normalizeWatchlistFilters();
      state.statsPrice.watchlist = createWatchlistState(nextFilters);
      renderStatsPriceSnapshot({ ...snapshotArgs, preserveWatchlistScroll: false });
    });
  });

  container.querySelectorAll('[data-watchlist-load-more]').forEach((button) => {
    button.addEventListener('click', () => {
      loadMoreWatchlistItems({ source: 'button' });
    });
  });
}

/** Auto-Nachladen: erst nach einer Nutzer-Scrollgeste (Budget) und beim Erreichen des Listenendes. */
function bindStatsPriceWatchlistScrollRegions(container, loadMoreWatchlistItems) {
  container.querySelectorAll('[data-watchlist-scroll-region]').forEach((scrollRegion) => {
    const armWatchlistAutoLoad = () => {
      ensureWatchlistState();
      if (state.statsPrice.watchlist.autoLoadInFlight) return;
      state.statsPrice.watchlist.autoLoadBudget = 1;
    };

    scrollRegion.addEventListener('wheel', armWatchlistAutoLoad, { passive: true });
    scrollRegion.addEventListener('touchmove', armWatchlistAutoLoad, { passive: true });
    scrollRegion.addEventListener('pointerdown', armWatchlistAutoLoad, { passive: true });
    scrollRegion.addEventListener('keydown', (event) => {
      if (!['ArrowDown', 'PageDown', 'End', ' '].includes(event.key)) return;
      armWatchlistAutoLoad();
    });

    let wasNearBottom = scrollRegion.scrollTop + scrollRegion.clientHeight >= scrollRegion.scrollHeight - 72;

    scrollRegion.addEventListener('scroll', () => {
      const nearBottom = scrollRegion.scrollTop + scrollRegion.clientHeight >= scrollRegion.scrollHeight - 72;
      if (nearBottom && !wasNearBottom) {
        const watchlist = state.statsPrice.watchlist || createWatchlistState();
        const budget = Math.max(0, Number(watchlist.autoLoadBudget || 0));
        if (budget > 0 && !watchlist.autoLoadInFlight) {
          loadMoreWatchlistItems({ source: 'scroll' });
        }
      }
      wasNearBottom = nearBottom;
    });
  });
}

/** Set und Karte zu einer Watchlist-Zeile (collectionKey zuerst, Nummer als Fallback). */
function resolveWatchlistSetAndCard(sourceEl) {
  const watchlistRow = sourceEl instanceof Element ? sourceEl.closest('[data-watchlist-card="1"]') : null;
  if (!watchlistRow) return null;

  const setId = String(watchlistRow.dataset.setId || '').trim();
  if (!setId) return null;

  const cardNumberRaw = String(watchlistRow.dataset.watchlistCardNumber || '').trim();
  // collectionKey zuerst (eindeutig); Nummer nur als Fallback fuer Zeilen ohne data-watchlist-card-key.
  const targetCollectionKey = String(watchlistRow.dataset.watchlistCardKey || '').trim();
  const targetCardKey = normalizeCardNumber(cardNumberRaw);
  if (!targetCollectionKey && !targetCardKey) return null;

  const sourceItems = Array.isArray(state.statsPrice.items) ? state.statsPrice.items : [];
  const inSet = sourceItems.filter((item) => String(item?.setId || '').trim() === setId);
  const matched = (targetCollectionKey && inSet.find((item) => collectionKeyOf(item?.card) === targetCollectionKey))
    || inSet.find((item) => normalizeCardNumber(item?.card?.number || item?.cardKey || '') === targetCardKey)
    || null;

  const setMeta = getSetById(setId) || {
    setId,
    setName: matched?.setName || setId,
    imported: false,
  };
  const cardMeta = {
    ...(matched?.card || {}),
    number: matched?.card?.number || cardNumberRaw,
    name: matched?.cardName || matched?.card?.name || cardNumberRaw,
    image: getStatsPriceItemImageUrl(matched || {}),
    cardmarketUrl: getItemCardmarketUrl(matched || null),
  };

  return {
    set: setMeta,
    card: cardMeta,
  };
}

/** Klicks: Watchlist-Karte -> Lightbox, Set-Zeilen -> Set-Ansicht, Cardmarket-Links ohne Navigation. */
function bindStatsPriceNavigation(container) {
  container.querySelectorAll('[data-watchlist-open-set]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const resolved = resolveWatchlistSetAndCard(button);
      if (!resolved?.set?.setId) return;
      navigateToSearchResultSet(resolved.set, resolved.card);
    });
  });

  container.querySelectorAll('[data-set-id]').forEach((item) => {
    item.addEventListener('click', async () => {
      const setId = item.dataset.setId;
      if (!setId) return;

      if (item.matches('[data-watchlist-card="1"]')) {
        const resolved = resolveWatchlistSetAndCard(item);
        if (!resolved?.set?.setId || !resolved?.card?.number) return;
        try {
          await openSearchResultLightbox(resolved.card, resolved.set, { apiOnly: !resolved.set?.imported });
        } catch (error) {
          showToast(`Karte konnte nicht geoeffnet werden: ${error.message}`, 'error');
        }
        return;
      }

      navigate(`set/${encodeURIComponent(setId)}`);
    });
  });

  container.querySelectorAll('[data-cardmarket-link]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.stopPropagation();
    });
  });
}

export function renderStatsPriceLoading({ requestId, loadedCards = 0, totalCards = 0 } = {}) {
  state.statsPrice.requestId = String(requestId || '');
  state.statsPrice.status = 'loading';
  state.statsPrice.items = [];
  state.statsPrice.watchlist = createWatchlistState(normalizeWatchlistFilters(state.statsPrice.watchlist?.filters));
  state.statsPrice.loadedCards = Number(loadedCards || 0);
  state.statsPrice.totalCards = Number(totalCards || 0);
  state.statsPrice.errors = 0;
  renderStatsPriceSnapshot({
    status: 'loading',
    loadedCards,
    totalCards,
    errors: 0,
    message: 'Preiswerte werden schrittweise geladen...'
  });
}

function renderStatsPricePartial(analytics, { requestId, loadedCards = 0, totalCards = 0, errors = 0, items = [] } = {}) {
  if (!isActiveStatsPriceRequest(requestId)) return;
  state.statsPrice.status = 'partial';
  state.statsPrice.totals = analytics;
  state.statsPrice.bySet = analytics?.setBreakdown || [];
  state.statsPrice.items = Array.isArray(items) ? items : [];
  ensureWatchlistState();
  state.statsPrice.loadedCards = Number(loadedCards || 0);
  state.statsPrice.totalCards = Number(totalCards || 0);
  state.statsPrice.errors = Number(errors || 0);
  renderStatsPriceSnapshot({
    status: 'partial',
    analytics,
    loadedCards,
    totalCards,
    errors,
    message: 'Teilresultate werden laufend aktualisiert.'
  });
}

function renderStatsPriceFinal(analytics, { requestId, loadedCards = 0, totalCards = 0, errors = 0, items = [] } = {}) {
  if (!isActiveStatsPriceRequest(requestId)) return;
  state.statsPrice.status = 'final';
  state.statsPrice.totals = analytics;
  state.statsPrice.bySet = analytics?.setBreakdown || [];
  state.statsPrice.topCards = analytics?.topCard ? [analytics.topCard] : [];
  state.statsPrice.items = Array.isArray(items) ? items : [];
  ensureWatchlistState();
  state.statsPrice.loadedCards = Number(loadedCards || 0);
  state.statsPrice.totalCards = Number(totalCards || 0);
  state.statsPrice.errors = Number(errors || 0);
  renderStatsPriceSnapshot({
    status: 'final',
    analytics,
    loadedCards,
    totalCards,
    errors,
    message: 'Preisradar abgeschlossen.'
  });
}

export function renderStatsPriceError(message = 'Preisanalysen konnten nicht geladen werden.') {
  const container = getStatsPriceContainer();
  if (!container) return;
  state.statsPrice.status = 'error';
  container.dataset.state = 'error';
  container.innerHTML = `<p class="stats-price-error">${message}</p>`;
}

async function mapWithConcurrency(items = [], concurrency = 4, mapper = async (item) => item) {
  const safeItems = Array.isArray(items) ? items : [];
  if (!safeItems.length) return [];

  const limit = Math.max(1, Number(concurrency) || 1);
  const results = new Array(safeItems.length);
  let nextIndex = 0;

  const workers = Array.from({ length: Math.min(limit, safeItems.length) }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= safeItems.length) return;
      results[index] = await mapper(safeItems[index], index);
    }
  });

  await Promise.all(workers);
  return results;
}

async function buildCollectedCardCandidates() {
  const importedSets = (state.sets || [])
    .filter((set) => toBoolean(set?.imported) && String(set?.setId || '').trim() && String(set?.setName || '').trim());

  const candidates = [];
  const dedupe = new Set();
  // Nur Sets mit gesammelten Zeilen (ueber alle Aliase) lesen: spart Registry-Karten und Kartendaten
  // fuer Sets ohne Haken. Registry/Sheet nicht lesbar -> null -> alle Sets wie bisher.
  const setsWithChecks = await listCollectionSetIds({ checkedOnly: true }).catch(() => null);

  for (const set of importedSets) {
    const setId = String(set.setId || '').trim();
    const setName = String(set.setName || '').trim();
    if (!setId || !setName) continue;
    if (setsWithChecks && !setsWithChecks.has(setId.toLowerCase())) continue;

    const [cards, collectionMap] = await Promise.all([
      actions.loadSetCardsWithHydration(setId, { allowApiFallback: false }),
      readSetCollectionMap(setName, { setId }).catch(() => new Map())
    ]);

    (Array.isArray(cards) ? cards : []).forEach((card) => {
      const collectionKey = collectionKeyOf(card);
      if (!collectionKey) return;

      const mapEntry = collectionMap.get(collectionKey) || {};
      const isCollected = Boolean(mapEntry?.g);
      if (!isCollected) return;

      // Schluessel der Preisstatistik = setId::collectionKey (nicht persistiert; Watchlist-Zeilen tragen
      // zusaetzlich die Nummer als Fallback).
      const cardKey = `${setId}::${collectionKey}`;
      if (dedupe.has(cardKey)) return;
      dedupe.add(cardKey);

      candidates.push({
        cardKey,
        setId,
        setName,
        cardName: String(card?.name || card?.vera_name || card?.number || 'Unbekannte Karte'),
        card: { ...card, setId },
        sourceCard: card,
        sourceCards: Array.isArray(cards) ? cards : [],
        isCollected,
        isReverseHolo: Boolean(mapEntry?.rh && mapEntry?.g)
      });
    });
  }

  return candidates;
}

export async function loadStatsPriceAnalyticsLazy({ requestId } = {}) {
  const normalizedRequestId = String(requestId || '').trim();
  if (!normalizedRequestId) return;

  state.statsPrice.requestId = normalizedRequestId;
  state.statsPrice.status = 'loading';
  state.statsPrice.activeTab = state.statsPrice.activeTab || 'dashboard';
  state.statsPrice.items = [];

  const candidates = await buildCollectedCardCandidates();
  if (!isActiveStatsPriceRequest(normalizedRequestId)) return;

  const totalCards = candidates.length;
  if (!totalCards) {
    renderStatsPriceFinal(computePriceAnalyticsFromSummaries([]), {
      requestId: normalizedRequestId,
      loadedCards: 0,
      totalCards: 0,
      errors: 0,
      items: [],
    });
    return;
  }

  renderStatsPriceLoading({ requestId: normalizedRequestId, loadedCards: 0, totalCards });

  let loadedCards = 0;
  let errors = 0;
  const resolvedItems = [];
  const basePriceType = actions.getCurrentCardmarketBasePriceType();

  for (let offset = 0; offset < candidates.length; offset += STATS_PRICE_CHUNK_SIZE) {
    const chunk = candidates.slice(offset, offset + STATS_PRICE_CHUNK_SIZE);

    const chunkResults = await mapWithConcurrency(chunk, STATS_PRICE_CONCURRENCY, async (candidate) => {
      try {
        const summary = await actions.loadCardmarketPriceSummary(candidate.card);
        const value = pickCardPriceFromSummary(summary, {
          preferReverseHolo: candidate.isReverseHolo,
          basePriceType
        });
        return {
          ...candidate,
          value,
        };
      } catch {
        return {
          ...candidate,
          value: null,
          failed: true,
        };
      }
    });

    if (!isActiveStatsPriceRequest(normalizedRequestId)) return;

    loadedCards += chunkResults.length;
    errors += chunkResults.filter((item) => item?.failed).length;
    resolvedItems.push(...chunkResults);

    const partialAnalytics = computePriceAnalyticsFromSummaries(resolvedItems);
    renderStatsPricePartial(partialAnalytics, {
      requestId: normalizedRequestId,
      loadedCards,
      totalCards,
      errors,
      items: resolvedItems,
    });
  }

  const finalAnalytics = computePriceAnalyticsFromSummaries(resolvedItems);
  renderStatsPriceFinal(finalAnalytics, {
    requestId: normalizedRequestId,
    loadedCards,
    totalCards,
    errors,
    items: resolvedItems,
  });
}

/** Schluessel eines Preisstatistik-Eintrags: `setId::collectionKey` (eindeutig auch bei gleicher Nummer). */
function statsPriceCardKey(entry) {
  const setId = String(entry?.setId || '').trim();
  const key = collectionKeyOf(entry?.card) || normalizeCardNumber(entry?.cardNumber || '');
  return key ? `${setId}::${key}` : String(entry?.cardKey || '');
}

/**
 * Live-Update eines Eintrags in `state.statsPrice.items`, wenn der
 * Sammelstatus einer Karte in der Set-Ansicht umgeschaltet wird. Findet
 * das passende Item per `cardKey` (= `setId::collectionKey`), patcht
 * `isReverseHolo` + `card.rh`, und aktualisiert — wenn die Stats-View
 * gerade gerendert ist — das `<a class="stats-price-cardmarket-link">`-
 * Element (mit neuem `?isReverseHolo=Y`-Suffix) sowie die
 * `is-reverse`-Klasse und den RH-Badge.
 */
export function refreshStatsPriceItem({ setId, collectionKey = '', number, rh = false } = {}) {
  if (!state.statsPrice?.items?.length) return;
  if (!setId) return;
  const key = String(collectionKey || '').trim() || normalizeCardNumber(number || '');
  if (!key) return;
  const cardKey = `${setId}::${key}`;

  const item = state.statsPrice.items.find((entry) => entry?.cardKey === cardKey);
  if (!item) return;

  item.isReverseHolo = Boolean(rh);
  if (item.card && typeof item.card === 'object') {
    item.card.rh = Boolean(rh);
  }

  // Nur wenn die Stats-View gerade sichtbar ist, das DOM patchen.
  // Sonst genügt der State-Update; beim nächsten Render wird der Wert
  // aus dem frischen State gelesen.
  const container = getStatsPriceContainer();
  if (!container || container.dataset.state === 'loading') return;
  if (container.dataset.state === 'final' || container.dataset.state === 'partial') {
    const li = container.querySelector(`.stats-price-rich-item[data-stats-card-key="${cssEscapeAttr(cardKey)}"]`);
    if (li) {
      li.classList.toggle('is-reverse', Boolean(rh));
      // Cardmarket-Link in derselben Kachel
      const link = li.querySelector('.stats-price-cardmarket-link');
      if (link) {
        const cardmarketUrl = getItemCardmarketUrl(item);
        link.setAttribute('href', cardmarketUrl);
        if (item?.card?.cardmarketUrl) link.setAttribute('data-cardmarket-url', item.card.cardmarketUrl);
      }
      // RH-Badge hinzufügen/entfernen — wir tauschen den Slot im Markup
      const strong = li.querySelector('.stats-price-rich-main strong');
      if (strong) {
        const existingBadge = strong.querySelector('.stats-price-rh-badge');
        if (rh && !existingBadge) {
          const badge = document.createElement('span');
          badge.className = 'stats-price-rh-badge';
          badge.title = 'Als Reverse Holo gesammelt';
          badge.textContent = 'RH';
          strong.appendChild(badge);
        } else if (!rh && existingBadge) {
          existingBadge.remove();
        }
      }
    }
  }
}

function cssEscapeAttr(value) {
  // Lightweight Escape für Attribut-Selektoren — reicht für unsere
  // cardKey-Werte (setId::number).
  return String(value || '').replace(/(["\\'])/g, '\\$1');
}

// --------------------------------------------------------------------------
// PREIS-STAMP UND MANUELLER PREIS-REFRESH (frueher app.js)
// --------------------------------------------------------------------------
/**
 * App-Start: liest den Preis-Stamp (api/v3/prices/meta.json generatedAt) vorab, damit die ersten
 * Preisdateien sofort mit ?v=<stamp> geladen werden. Fire-and-forget – blockiert den Bootstrap nicht.
 * @returns {Promise<string>} Stamp ('' ohne Stamp/bei Fehler)
 */
export async function prefetchPriceStamp() {
  try {
    return await loadPriceStamp();
  } catch (err) {
    console.warn('[v3-prices] stamp prefetch failed', err);
    return '';
  }
}

/**
 * Manueller Cardmarket-Preis-Refresh, ausgeloest vom Settings-Button 'Preise neu laden'.
 * Leert immer die Preis-Caches (Preisdateien + Preis-Zusammenfassungen je Karte) und liest
 * api/v3/prices/meta.json neu; ein neuer Stamp laedt neue Preisdateien.
 */
export async function reloadCardmarketPricesManually() {
  const btn = dom.btnCardmarketReloadPrices;
  if (!btn) return;

  setLoading(true, 'Pruefe Cardmarket-Preise...');
  btn.disabled = true;
  try {
    const result = await refreshV3Prices();
    resetCardmarketPriceSummaryCaches();
    const stampLabel = result.currentStamp
      ? new Date(result.currentStamp).toLocaleString('de-DE')
      : '(unbekannt)';

    if (result.changed) {
      showToast(`Cardmarket-Preise aktualisiert (Stand ${stampLabel}).`, 'success', 5000);
    } else {
      showToast(
        `Cardmarket-Preise sind aktuell (Stand ${stampLabel}). Preis-Caches wurden geleert.`,
        'info',
        4000
      );
    }
  } catch (err) {
    const message = getErrorMessage(err, 'Unbekannter Fehler');
    showToast(`Preis-Refresh fehlgeschlagen: ${message}`, 'error', 6000);
    console.warn('[cardmarket-manual-refresh] failed', err);
  } finally {
    setLoading(false);
    btn.disabled = false;
  }
}
