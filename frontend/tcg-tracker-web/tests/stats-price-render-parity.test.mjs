// Paritaetstest fuer die Statistik-Ansicht und den Preis-Tab.
//
// Die HTML-Ausgabe von buildStatsPriceTabContent, renderStatsPriceSnapshot (inkl. Loading/Partial/
// Final/Error und der Lazy-Lade-Pipeline) und renderStats wurde VOR dem Umbau (Verschieben aus
// app.js, Zerlegen der Riesenfunktionen) in tests/fixtures/stats-price-render-parity.json
// festgehalten (kompakt: sha256 je Szenario plus volle Ausgabe einiger Stichproben). Der Test
// prueft, dass der aktuelle Code fuer dieselben Eingaben exakt dieselbe Ausgabe liefert.
//
// Die Funktionen laufen in einem vm-Kontext: der Quelltext wird ohne import/export-Zeilen
// ausgewertet, Abhaengigkeiten sind echte Hilfsmodule (Escape, Cardmarket-URL, Bilder, Analytics)
// oder einfache Stubs (DOM-Container, Datenzugriffe). So braucht der Test weder Browser noch app.js.
//
// Fixture neu schreiben (nur mit dem alten, unveraenderten Code!):
//   STATS_PARITY_WRITE_FIXTURE=1 node --test tests/stats-price-render-parity.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

import { resolveItemCardmarketUrl } from '../js/data/cardmarket-url-utils.js';
import { collectionKeyOf } from '../js/data/collection-writes.js';
import { normalizeCardNumber, toBoolean } from '../js/core/utils.js';
import { imageCandidates, fallbackImgAttrs } from '../js/ui/image-fallback.js';
import { computePriceAnalyticsFromSummaries, pickCardPriceFromSummary } from '../js/ui/stats-price-analytics.js';
import { filterSetsBySeriesKey, getStatsSeriesLabel } from '../js/ui/stats-series.js';

const ROOT = new URL('../', import.meta.url);
const FIXTURE_URL = new URL('fixtures/stats-price-render-parity.json', import.meta.url);
const WRITE_FIXTURE = process.env.STATS_PARITY_WRITE_FIXTURE === '1';

function readSource(relPath) {
  return readFileSync(new URL(relPath, ROOT), 'utf8');
}

// Schneidet eine Top-Level-Deklaration (Funktion) aus einem Quelltext: von der Kopfzeile bis zur
// ersten Zeile, die an Spalte 0 mit '}' beginnt.
function extractTopLevelFunction(source, name) {
  const lines = source.split('\n');
  const head = new RegExp(`^(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\(`);
  const start = lines.findIndex((line) => head.test(line));
  assert.ok(start >= 0, `Funktion ${name} nicht gefunden`);
  const end = lines.findIndex((line, index) => index > start && /^\}/.test(line));
  assert.ok(end > start, `Ende von ${name} nicht gefunden`);
  return lines.slice(start, end + 1).join('\n');
}

// Entfernt import-Anweisungen und export-Schluesselwoerter, damit ein ES-Modul als Skript laeuft.
function stripModuleSyntax(source) {
  return source
    .replace(/^import\s[\s\S]*?from\s+['"][^'"]+['"];?[ \t]*$/gm, '')
    .replace(/^export\s+\{[^}]*\};?[ \t]*$/gm, '')
    .replace(/^export\s+(?=(?:async\s+)?function|const\s|let\s|class\s)/gm, '');
}

// Quelltext der Statistik-Funktionen: js/views/stats-price.js und js/views/stats.js (frueher Abschnitt
// STATISTIKEN in app.js; die Fixture stammt aus diesem alten Stand).
function loadStatsSource() {
  return [
    readSource('js/views/stats-price.js'),
    readSource('js/views/stats.js'),
    extractTopLevelFunction(readSource('js/ui/helpers.js'), 'escapeHtml'),
  ].map(stripModuleSyntax).join('\n');
}

// --------------------------------------------------------------------------
// DOM-Attrappen: protokollieren alle Schreibzugriffe in `log`.
// --------------------------------------------------------------------------
function selectorMarker(selector) {
  if (selector === '#stats-price-analytics') return 'id="stats-price-analytics"';
  if (selector === '.stats-price-head p') return 'class="stats-price-head"';
  const attr = selector.match(/^\[([\w-]+)/);
  return attr ? attr[1] : null;
}

function createFakeChild(name, log) {
  const child = { dataset: {}, style: {} };
  let html = '';
  let text = '';
  let scrollTop = 0;
  Object.defineProperty(child, 'innerHTML', {
    get: () => html,
    set: (value) => { html = String(value); log.push({ write: `${name}.innerHTML`, value: html }); },
  });
  Object.defineProperty(child, 'textContent', {
    get: () => text,
    set: (value) => { text = String(value); log.push({ write: `${name}.textContent`, value: text }); },
  });
  Object.defineProperty(child, 'scrollTop', {
    get: () => scrollTop,
    set: (value) => { scrollTop = Number(value); log.push({ write: `${name}.scrollTop`, value: scrollTop }); },
  });
  child.scrollHeight = 500;
  child.clientHeight = 200;
  const style = {};
  Object.defineProperty(style, 'width', {
    set: (value) => log.push({ write: `${name}.style.width`, value: String(value) }),
  });
  child.style = style;
  return child;
}

function createFakeContainer(name, log, { initialHtml = '' } = {}) {
  let html = initialHtml;
  const children = new Map();
  const dataset = new Proxy({}, {
    set(target, key, value) {
      target[key] = value;
      log.push({ write: `${name}.dataset.${String(key)}`, value: String(value) });
      return true;
    },
  });
  const container = {
    dataset,
    // Verknuepfte Unter-Container: { selector: { element, always } }; ohne `always` nur, wenn das
    // eigene Markup den Selektor enthaelt.
    linked: {},
    querySelector(selector) {
      const marker = selectorMarker(selector);
      const link = container.linked[selector];
      if (link) return (link.always || (marker && html.includes(marker))) ? link.element : null;
      if (!marker || !html.includes(marker)) return null;
      if (!children.has(selector)) children.set(selector, createFakeChild(`${name} ${selector}`, log));
      return children.get(selector);
    },
    querySelectorAll(selector) {
      log.push({ queryAll: `${name} ${selector}` });
      return [];
    },
  };
  Object.defineProperty(container, 'innerHTML', {
    get: () => html,
    set: (value) => { html = String(value); log.push({ write: `${name}.innerHTML`, value: html }); },
  });
  return container;
}

// --------------------------------------------------------------------------
// Harness: frischer vm-Kontext je Szenario.
// --------------------------------------------------------------------------
let cachedScript = null;
function getScript() {
  if (!cachedScript) cachedScript = new vm.Script(loadStatsSource(), { filename: 'stats-under-test.js' });
  return cachedScript;
}

function createInitialStatsPriceState() {
  return {
    requestId: '',
    status: 'idle',
    totals: null,
    bySet: [],
    topCards: [],
    items: [],
    activeTab: 'dashboard',
    loadedCards: 0,
    totalCards: 0,
    errors: 0,
    watchlist: {
      filters: {},
      visibleCount: 0,
      debounceTimers: {},
      autoLoadBudget: 0,
      autoLoadInFlight: false,
    },
  };
}

function createHarness({ priceContainerHtml = '', withPriceContainer = true, data = {} } = {}) {
  const log = [];
  const state = {
    sets: [],
    summaryData: null,
    statsPrice: createInitialStatsPriceState(),
  };
  const priceContainer = createFakeContainer('price', log, { initialHtml: priceContainerHtml });
  const statsContent = createFakeContainer('stats', log);
  // Snapshot-Szenarien: der Preis-Container existiert schon. renderStats-Szenarien: er entsteht erst
  // mit dem Markup (id="stats-price-analytics").
  statsContent.linked['#stats-price-analytics'] = { element: priceContainer, always: withPriceContainer };

  const loadSetCardsWithHydration = async (setId) => (data.cardsBySet?.[setId] || []);
  const getCurrentCardmarketBasePriceType = () => 'trend';
  const loadCardmarketPriceSummary = async (card) => {
    const summary = data.summaries?.[`${card.setId}::${collectionKeyOf(card)}`];
    if (summary === 'throw') throw new Error('lookup failed');
    return summary || null;
  };

  const sandbox = {
    console: { log() {}, warn() {}, error() {}, info() {} },
    window: {
      setTimeout: () => 0,
      clearTimeout: () => {},
    },
    document: { getElementById: () => null },
    Element: class Element {},
    state,
    uiState: {},
    dom: { statsContent },
    actions: {
      loadSetCardsWithHydration,
      getCurrentCardmarketBasePriceType,
      loadCardmarketPriceSummary,
    },
    // Echte Hilfsfunktionen
    resolveItemCardmarketUrl,
    collectionKeyOf,
    normalizeCardNumber,
    toBoolean,
    imageCandidates,
    fallbackImgAttrs,
    computePriceAnalyticsFromSummaries,
    pickCardPriceFromSummary,
    filterSetsBySeriesKey,
    getStatsSeriesLabel,
    // Stubs
    getCardLanguage: () => 'de',
    readVisibleSummary: async () => data.visibleSummary || [],
    getSetSeriesGroupInfo: (set) => {
      if (data.throwInSeriesInfo) throw new Error('kaputt');
      return { key: set.seriesKey || 'other', label: set.seriesLabel || '' };
    },
    initStatsCharts: () => {},
    initStatsDrillDown: () => {},
    listCollectionSetIds: async () => (data.setsWithChecks ? new Set(data.setsWithChecks) : null),
    readSetCollectionMap: async (setName) => new Map(Object.entries(data.collectionBySetName?.[setName] || {})),
    getSetById: () => null,
    navigate: () => {},
    showToast: () => {},
    navigateToSearchResultSet: () => {},
    openSearchResultLightbox: async () => {},
  };
  const context = vm.createContext(sandbox);
  getScript().runInContext(context);
  const fn = (name) => {
    const value = vm.runInContext(name, context);
    assert.equal(typeof value, 'function', `${name} ist keine Funktion`);
    return value;
  };
  return { state, log, priceContainer, statsContent, fn };
}

async function flushAsync() {
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function summarizeStatsPriceState(statsPrice) {
  const watchlist = statsPrice.watchlist
    ? {
      filters: statsPrice.watchlist.filters,
      visibleCount: statsPrice.watchlist.visibleCount,
      autoLoadBudget: statsPrice.watchlist.autoLoadBudget,
      autoLoadInFlight: statsPrice.watchlist.autoLoadInFlight,
    }
    : null;
  return JSON.parse(JSON.stringify({
    requestId: String(statsPrice.requestId || '').startsWith('stats-price-') ? '<generated>' : statsPrice.requestId,
    status: statsPrice.status,
    activeTab: statsPrice.activeTab,
    loadedCards: statsPrice.loadedCards,
    totalCards: statsPrice.totalCards,
    errors: statsPrice.errors,
    advanced: statsPrice.advanced || null,
    watchlist,
    itemKeys: (statsPrice.items || []).map((item) => `${item.cardKey}=${item.value}${item.failed ? '!' : ''}`),
    bySet: (statsPrice.bySet || []).map((entry) => entry.setId),
    topCards: (statsPrice.topCards || []).map((entry) => entry?.cardKey),
  }));
}

// --------------------------------------------------------------------------
// Eingaben (angelehnt an die Fixtures aus stats-price-analytics.test.mjs)
// --------------------------------------------------------------------------
function baseItems() {
  return [
    {
      cardKey: 'sv1::001', cardName: 'Bulbasaur', setId: 'sv1', setName: 'Scarlet & Violet', isCollected: true, value: 2.5,
      card: { number: '001', name: 'Bulbasaur', cardmarketProductId: 12345, images: { small: 'https://img.example/sv1/001.png' } },
    },
    {
      cardKey: 'sv1::002', cardName: 'Ivysaur', setId: 'sv1', setName: 'Scarlet & Violet', isCollected: true, value: 3.5, isReverseHolo: true,
      card: { number: '002', name: 'Ivysaur', cardmarketUrl: 'https://www.cardmarket.com/de/Pokemon/Products/Singles/Scarlet-Violet/Ivysaur' },
    },
    {
      cardKey: 'sv2::010', cardName: 'Mew', setId: 'sv2', setName: 'Paldea Evolved', isCollected: true, value: 9.0,
      card: { number: '010', name: 'Mew', collectionKey: '010-a', i18n: { de: { images: { small: 'https://img.example/de/mew.png' } } }, images: { small: 'https://img.example/en/mew.png' } },
    },
    {
      cardKey: 'sv2::011', cardName: 'NoPriceCard', setId: 'sv2', setName: 'Paldea Evolved', isCollected: true, value: null,
      card: { number: '011', name: 'NoPriceCard' },
    },
    {
      cardKey: 'sv2::012', cardName: 'Kaputt', setId: 'sv2', setName: 'Paldea Evolved', isCollected: true, value: null, failed: true,
      card: { number: '012' },
    },
    {
      cardKey: 'sv3::TG01', cardName: 'Glurak <ex> & "Co"', setId: 'sv3', setName: "Obsidian 'Flammen'", isCollected: true, value: 25.75, isReverseHolo: true,
      card: { number: 'TG01', name: 'Glurak', cardmarketProductId: 777 },
    },
    {
      cardKey: 'sv3::005', cardName: 'Magikarp', setId: 'sv3', setName: "Obsidian 'Flammen'", isCollected: true, value: 0.4,
      image: 'https://img.example/fallback/magikarp.png',
      card: { number: '005' },
    },
    {
      cardKey: '::x', cardName: '', setId: '', setName: '', isCollected: true, value: 1.2,
      card: {},
    },
  ];
}

function manyItems(count = 70) {
  return Array.from({ length: count }, (_, index) => {
    const number = String(index + 1).padStart(3, '0');
    return {
      cardKey: `big::${number}`,
      cardName: `Karte ${number}`,
      setId: 'big',
      setName: 'Grosses Set',
      isCollected: true,
      value: index % 9 === 0 ? null : Math.round((index * 0.37 + 0.2) * 100) / 100,
      isReverseHolo: index % 5 === 0,
      card: { number, name: `Karte ${number}` },
    };
  });
}

const TABS = ['dashboard', 'top-values', 'trends', 'comparisons', 'advanced', 'watchlist', 'timeline', 'drilldown', 'gibt-es-nicht'];

// --------------------------------------------------------------------------
// Szenarien
// --------------------------------------------------------------------------
const scenarios = [];

function tabScenario(name, { items = baseItems(), analytics = 'compute', advanced, watchlist, args = {} } = {}) {
  scenarios.push({
    name: `tab-content/${name}`,
    run: async () => {
      const h = createHarness();
      h.state.statsPrice.items = items;
      if (advanced !== undefined) h.state.statsPrice.advanced = advanced;
      if (watchlist !== undefined) h.state.statsPrice.watchlist = watchlist;
      const resolvedAnalytics = analytics === 'compute' ? computePriceAnalyticsFromSummaries(items) : analytics;
      const result = h.fn('buildStatsPriceTabContent')({ analytics: resolvedAnalytics, ...args });
      return { result: { ...result }, statsPrice: summarizeStatsPriceState(h.state.statsPrice) };
    },
  });
}

for (const tab of TABS) {
  tabScenario(`${tab}/final-mit-preisen`, { args: { activeTab: tab, status: 'final', loadedCards: 8, totalCards: 8, errors: 1 } });
  tabScenario(`${tab}/leer-ohne-analytics`, { items: [], analytics: null, args: { activeTab: tab } });
}
tabScenario('default-args', { analytics: null, items: [] });
tabScenario('dashboard/partial-mit-message', { args: { activeTab: 'dashboard', status: 'partial', loadedCards: 3, totalCards: 8, message: 'Teilresultate <live>' } });
tabScenario('timeline/fertig-ohne-fehler', { args: { activeTab: 'timeline', status: 'final', loadedCards: 8, totalCards: 8, errors: 0 } });
tabScenario('timeline/hohe-abdeckung', {
  items: baseItems().filter((item) => item.value != null),
  args: { activeTab: 'timeline', status: 'partial', loadedCards: 2, totalCards: 9, errors: 0 },
});

for (const detailMode of ['summary', 'top', 'missing', 'distribution', 'unbekannt']) {
  tabScenario(`advanced/detail-${detailMode}`, {
    advanced: { filters: {}, selectedGroupKey: '', detailMode },
    args: { activeTab: 'advanced', status: 'final' },
  });
}
const advancedFilterCases = [
  ['set-sv2-gruppe-gewaehlt', { setId: 'sv2' }, 'set:sv2', 'missing'],
  ['preisband-nach-wert-aufsteigend', { groupBy: 'value-band', sortBy: 'value-asc' }, 'band:from1to5', 'top'],
  ['quantil-nur-bepreist', { groupBy: 'quantile', quality: 'priced-only' }, '', 'distribution'],
  ['ohne-preis-top10-anzahl', { valueBand: 'missing', quantile: 'top10', sortBy: 'count-desc' }, '', 'summary'],
  ['nur-fehler-gap', { quality: 'failed-only', sortBy: 'gap-desc' }, '', 'missing'],
  ['nur-fehlende-bottom20', { quality: 'missing-only', quantile: 'bottom20' }, '', 'top'],
  ['top1-ueber20', { quantile: 'top1', valueBand: 'over20' }, '', 'top'],
  ['top5-unter1', { quantile: 'top5', valueBand: 'under1' }, '', 'summary'],
];
for (const [name, filters, selectedGroupKey, detailMode] of advancedFilterCases) {
  tabScenario(`advanced/${name}`, {
    advanced: { filters, selectedGroupKey, detailMode },
    args: { activeTab: 'advanced', status: 'final' },
  });
}

const watchlistFilterCases = [
  ['suche-mew', { search: 'mew' }],
  ['suche-ohne-treffer', { search: 'gibtsnicht' }],
  ['nur-reverse-holo', { variant: 'reverse-holo-only' }],
  ['nur-holo', { variant: 'holo-only' }],
  ['min-max-komma', { minValue: '3', maxValue: '10,5' }],
  ['mit-link', { cardmarket: 'with-link' }],
  ['ohne-link', { cardmarket: 'without-link' }],
  ['wert-aufsteigend', { sortBy: 'value-asc' }],
  ['karte-a-z', { sortBy: 'card-asc' }],
  ['set-a-z', { sortBy: 'set-asc' }],
  ['nummer', { sortBy: 'number-asc' }],
  ['watch-score', { sortBy: 'watch-score-desc' }],
  ['nur-fehler', { quality: 'failed-only' }],
  ['nur-fehlend', { quality: 'missing-only' }],
  ['nur-bepreist-ueber20', { quality: 'priced-only', valueBand: 'over20' }],
  ['top1-set-sv3', { quantile: 'top1', setId: 'sv3' }],
  ['ungueltige-zahl', { minValue: 'abc' }],
];
for (const [name, filters] of watchlistFilterCases) {
  tabScenario(`watchlist/${name}`, {
    watchlist: { filters, visibleCount: 0, debounceTimers: {}, autoLoadBudget: 2, autoLoadInFlight: 1 },
    args: { activeTab: 'watchlist', status: 'final' },
  });
}
tabScenario('watchlist/viele-karten-mehr-laden', {
  items: [...baseItems(), ...manyItems()],
  args: { activeTab: 'watchlist', status: 'partial', loadedCards: 40, totalCards: 78 },
});
tabScenario('watchlist/viele-karten-alles-sichtbar', {
  items: [...baseItems(), ...manyItems()],
  watchlist: { filters: {}, visibleCount: 120, debounceTimers: {}, autoLoadBudget: 0, autoLoadInFlight: false },
  args: { activeTab: 'watchlist', status: 'final' },
});
tabScenario('advanced/viele-karten-nach-quantil', {
  items: [...baseItems(), ...manyItems()],
  advanced: { filters: { groupBy: 'quantile' }, selectedGroupKey: 'quantile:Top 10%', detailMode: 'distribution' },
  args: { activeTab: 'advanced', status: 'final' },
});

// renderStatsPriceSnapshot
function snapshotScenario(name, { activeTab = 'dashboard', items = baseItems(), analytics = 'compute', priceContainerHtml = '', withPriceContainer = true, args = {}, before } = {}) {
  scenarios.push({
    name: `snapshot/${name}`,
    run: async () => {
      const h = createHarness({ priceContainerHtml, withPriceContainer });
      h.state.statsPrice.items = items;
      h.state.statsPrice.activeTab = activeTab;
      if (before) before(h);
      const resolvedAnalytics = analytics === 'compute' ? computePriceAnalyticsFromSummaries(items) : analytics;
      const returned = h.fn('renderStatsPriceSnapshot')({ analytics: resolvedAnalytics, ...args });
      return { returned: returned === undefined ? 'undefined' : returned, log: h.log, statsPrice: summarizeStatsPriceState(h.state.statsPrice) };
    },
  });
}

snapshotScenario('loading-ohne-analytics', { items: [], analytics: null, args: { status: 'loading', message: 'Preiswerte werden schrittweise geladen...' } });
snapshotScenario('default-args', { items: [], analytics: null });
for (const tab of TABS) {
  snapshotScenario(`final/${tab}`, { activeTab: tab, args: { status: 'final', loadedCards: 8, totalCards: 8, errors: 1 } });
}
snapshotScenario('final/watchlist-mit-scrollbereich', {
  activeTab: 'watchlist',
  priceContainerHtml: '<ol data-watchlist-scroll-region="1"></ol>',
  args: { status: 'final', loadedCards: 8, totalCards: 8 },
});
snapshotScenario('final/watchlist-scroll-snapshot-objekt', {
  activeTab: 'watchlist',
  args: { status: 'final', loadedCards: 8, totalCards: 8, preserveWatchlistScroll: { scrollTop: 40 } },
});
snapshotScenario('final/watchlist-scroll-false', {
  activeTab: 'watchlist',
  priceContainerHtml: '<ol data-watchlist-scroll-region="1"></ol>',
  args: { status: 'final', loadedCards: 8, totalCards: 8, preserveWatchlistScroll: false },
});
snapshotScenario('final/dashboard-scroll-snapshot-ignoriert', {
  activeTab: 'dashboard',
  args: { status: 'final', loadedCards: 8, totalCards: 8, preserveWatchlistScroll: { scrollTop: 40 } },
});
snapshotScenario('partial/live-update-ohne-fehler', {
  priceContainerHtml: '<header class="stats-price-head"><p>alt</p><strong data-stats-progress-pct>0%</strong><span data-stats-progress-bar></span></header><section data-stats-tab-content></section>',
  args: { status: 'partial', loadedCards: 3, totalCards: 8, errors: 0, message: '' },
});
snapshotScenario('partial/live-update-mit-fehlern-und-kpi', {
  activeTab: 'watchlist',
  priceContainerHtml: '<header class="stats-price-head"><p>alt</p><strong data-stats-progress-pct>0%</strong><span data-stats-progress-bar></span></header><span data-stats-total-value></span><span data-stats-avg-value></span><span data-stats-pricing></span><span data-stats-pricing-detail></span><span data-stats-missing></span><span data-stats-errors-detail></span><section data-stats-tab-content></section><ol data-watchlist-scroll-region="1"></ol>',
  args: { status: 'partial', loadedCards: 5, totalCards: 8, errors: 2, message: 'Teilresultate werden laufend aktualisiert.' },
});
snapshotScenario('partial/ohne-shell-voller-aufbau', { args: { status: 'partial', loadedCards: 0, totalCards: 0 } });
snapshotScenario('ohne-container', { withPriceContainer: false, args: { status: 'final' } });
snapshotScenario('error-status', { args: { status: 'error', message: 'Fehler <b>' } });

// Lade-Pipeline: Loading/Partial/Final/Error-Wrapper
scenarios.push({
  name: 'pipeline/loading-partial-final-error',
  run: async () => {
    const h = createHarness();
    const items = baseItems();
    const analytics = computePriceAnalyticsFromSummaries(items);
    h.state.statsPrice.watchlist = { filters: { search: 'saur' }, visibleCount: 5, debounceTimers: {}, autoLoadBudget: 1, autoLoadInFlight: false };
    const steps = [];
    h.fn('renderStatsPriceLoading')({ requestId: 'req-1', loadedCards: 0, totalCards: 8 });
    steps.push(summarizeStatsPriceState(h.state.statsPrice));
    h.fn('renderStatsPricePartial')(analytics, { requestId: 'anderer', loadedCards: 4, totalCards: 8, items });
    steps.push(summarizeStatsPriceState(h.state.statsPrice));
    h.fn('renderStatsPricePartial')(analytics, { requestId: 'req-1', loadedCards: 4, totalCards: 8, errors: 1, items: items.slice(0, 4) });
    steps.push(summarizeStatsPriceState(h.state.statsPrice));
    h.state.statsPrice.watchlist = null;
    h.fn('renderStatsPricePartial')(analytics, { requestId: 'req-1', loadedCards: 6, totalCards: 8, errors: 1, items: 'kein-array' });
    steps.push(summarizeStatsPriceState(h.state.statsPrice));
    h.fn('renderStatsPriceFinal')(analytics, { requestId: 'anderer', loadedCards: 8, totalCards: 8, items });
    steps.push(summarizeStatsPriceState(h.state.statsPrice));
    h.state.statsPrice.watchlist = null;
    h.fn('renderStatsPriceFinal')(analytics, { requestId: 'req-1', loadedCards: 8, totalCards: 8, errors: 1, items });
    steps.push(summarizeStatsPriceState(h.state.statsPrice));
    h.fn('renderStatsPriceError')();
    steps.push(summarizeStatsPriceState(h.state.statsPrice));
    h.fn('renderStatsPriceError')('Eigene Meldung');
    steps.push(summarizeStatsPriceState(h.state.statsPrice));
    return { log: h.log, steps };
  },
});

function lazyData() {
  // Schluessel wie in der App: collectionKeyOf(card) (normalisierte Nummer bzw. explizite collectionKey).
  const key = (number) => collectionKeyOf({ number });
  // 30 weitere gesammelte Karten, damit die Pipeline mehrere Chunks (je 25) und Teilresultate liefert.
  const extraNumbers = Array.from({ length: 30 }, (_, index) => String(100 + index));
  const extraCards = extraNumbers.map((number) => ({ number, name: `Extra ${number}` }));
  const extraCollection = Object.fromEntries(extraNumbers.map((number) => [key(number), { g: true, rh: Number(number) % 7 === 0 }]));
  const extraSummaries = Object.fromEntries(extraNumbers.map((number) => [
    `sv1::${key(number)}`,
    Number(number) % 4 === 0 ? null : { entry: { prices: { trend: Number(number) / 40, trendHolo: Number(number) / 20 } } },
  ]));
  return {
    setsWithChecks: ['sv1', 'sv2'],
    cardsBySet: {
      sv1: [
        { number: '001', name: 'Bulbasaur', cardmarketProductId: 12345 },
        { number: '002', name: 'Ivysaur' },
        { number: '003', vera_name: 'Venusaur' },
        { number: '004' },
        { name: 'Ohne Nummer' },
        ...extraCards,
      ],
      sv2: [
        { number: '010', collectionKey: '010-a', name: 'Mew' },
        { number: '011', name: 'Fehler' },
        { number: '010', collectionKey: '010-a', name: 'Mew doppelt' },
      ],
      sv9: [{ number: '001', name: 'Nicht gecheckt' }],
    },
    collectionBySetName: {
      'Scarlet & Violet': { [key('001')]: { g: true }, [key('002')]: { g: true, rh: true }, [key('003')]: { g: false, rh: true }, [key('004')]: { g: true }, ...extraCollection },
      'Paldea Evolved': { '010-a': { g: true }, [key('011')]: { g: true, rh: true } },
      'Ungecheckt': { [key('001')]: { g: true } },
    },
    summaries: {
      [`sv1::${key('001')}`]: { entry: { prices: { trend: 2.1, avg: 2.2 } } },
      [`sv1::${key('002')}`]: { entry: { prices: { productId: 1, trend: 1, trendHolo: 3 } } },
      'sv2::010-a': { entry: { prices: { trend: 9 } } },
      ...extraSummaries,
      [`sv2::${key('011')}`]: 'throw',
    },
  };
}

scenarios.push({
  name: 'pipeline/lazy-mit-kandidaten',
  run: async () => {
    const h = createHarness({ data: lazyData() });
    h.state.sets = [
      { setId: 'sv1', setName: 'Scarlet & Violet', imported: true },
      { setId: 'sv2', setName: 'Paldea Evolved', imported: 'TRUE' },
      { setId: 'sv9', setName: 'Ungecheckt', imported: true },
      { setId: 'sv4', setName: 'Nicht importiert', imported: false },
      { setId: '', setName: 'Ohne Id', imported: true },
    ];
    h.state.statsPrice.activeTab = '';
    await h.fn('loadStatsPriceAnalyticsLazy')({ requestId: 'lazy-1' });
    return { log: h.log, statsPrice: summarizeStatsPriceState(h.state.statsPrice) };
  },
});

scenarios.push({
  name: 'pipeline/lazy-ohne-kandidaten-und-ohne-request',
  run: async () => {
    const h = createHarness({ data: {} });
    h.state.sets = [{ setId: 'sv4', setName: 'Nicht importiert', imported: false }];
    await h.fn('loadStatsPriceAnalyticsLazy')({});
    const afterNoRequest = summarizeStatsPriceState(h.state.statsPrice);
    await h.fn('loadStatsPriceAnalyticsLazy')({ requestId: 'lazy-2' });
    return { log: h.log, afterNoRequest, statsPrice: summarizeStatsPriceState(h.state.statsPrice) };
  },
});

scenarios.push({
  name: 'pipeline/mapWithConcurrency',
  run: async () => {
    const h = createHarness();
    const mapWithConcurrency = h.fn('mapWithConcurrency');
    return {
      empty: await mapWithConcurrency([], 4, async (x) => x),
      notArray: await mapWithConcurrency(null),
      values: await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (x, i) => x * 10 + i),
      zeroConcurrency: await mapWithConcurrency([1, 2], 0, async (x) => x + 1),
    };
  },
});

// renderStats
function summaryRow(setName, total, collected, rh = 0) {
  return { setName, total, collected, rh };
}

function statsScenario(name, { summaryData, sets, data = {} }) {
  scenarios.push({
    name: `stats/${name}`,
    run: async () => {
      const h = createHarness({ withPriceContainer: false, data });
      // Der Preis-Container entsteht erst durch renderStats (id="stats-price-analytics" im Markup).
      h.state.summaryData = summaryData;
      h.state.sets = sets;
      await h.fn('renderStats')();
      await flushAsync();
      return { log: h.log, statsPrice: summarizeStatsPriceState(h.state.statsPrice) };
    },
  });
}

const STATS_SETS = [
  { setId: 'sv1', setName: 'Scarlet & Violet', seriesKey: 'sv', seriesLabel: 'Karmesin & Purpur', imported: false },
  { setId: 'sv2', setName: 'Paldea Evolved', seriesKey: 'sv', seriesLabel: 'Karmesin & Purpur', imported: false },
  { setId: 'swsh1', setName: 'Sword & Shield', seriesKey: 'swsh', seriesLabel: 'Schwert "&" Schild', imported: false },
  { setId: 'base1', setName: 'Base Set', seriesKey: 'base', seriesLabel: '', imported: false },
  { setId: 'x1', setName: 'Ohne Zusammenfassung', imported: false },
];

statsScenario('gemischt-aufbauphase', {
  summaryData: [
    summaryRow('Scarlet & Violet', 200, 200, 40),
    summaryRow('Paldea Evolved', 250, 120, 10),
    summaryRow('Sword & Shield', 210, 10, 0),
    summaryRow('Base Set', 102, 101, 0),
    summaryRow('Leer', 0, 0, 0),
    summaryRow('Fast fertig', 50, 48, 2),
    summaryRow('Halb', 80, 40, 1),
  ],
  sets: STATS_SETS,
});
statsScenario('fortschritt-50', { summaryData: [summaryRow('Scarlet & Violet', 100, 55), summaryRow('Paldea Evolved', 100, 50)], sets: STATS_SETS });
statsScenario('fortschritt-75', { summaryData: [summaryRow('Scarlet & Violet', 100, 80, 3), summaryRow('Paldea Evolved', 100, 72)], sets: STATS_SETS });
statsScenario('fortschritt-90', { summaryData: [summaryRow('Scarlet & Violet', 100, 100, 100), summaryRow('Paldea Evolved', 100, 91)], sets: STATS_SETS });
statsScenario('alles-komplett', { summaryData: [summaryRow('Scarlet & Violet', 100, 100), summaryRow('Base Set', 102, 102)], sets: STATS_SETS });
statsScenario('ein-set-komplett', { summaryData: [summaryRow('Base Set', 10, 10)], sets: STATS_SETS });
statsScenario('leer', { summaryData: [], sets: [] });
statsScenario('summary-kein-array', { summaryData: { kaputt: true }, sets: [] });
statsScenario('summary-wird-geladen', {
  summaryData: null,
  sets: STATS_SETS,
  data: { visibleSummary: [summaryRow('Scarlet & Violet', 20, 5)] },
});
statsScenario('fehler-in-serien-info', { summaryData: [summaryRow('Base Set', 10, 3)], sets: STATS_SETS, data: { throwInSeriesInfo: true } });
statsScenario('mit-preisdaten', {
  summaryData: [summaryRow('Scarlet & Violet', 4, 2), summaryRow('Paldea Evolved', 2, 2)],
  sets: [
    { setId: 'sv1', setName: 'Scarlet & Violet', seriesKey: 'sv', seriesLabel: 'Karmesin & Purpur', imported: true },
    { setId: 'sv2', setName: 'Paldea Evolved', seriesKey: 'sv', seriesLabel: 'Karmesin & Purpur', imported: true },
  ],
  data: lazyData(),
});

// --------------------------------------------------------------------------
// Ausfuehrung
// --------------------------------------------------------------------------
// Die Fixture haelt je Szenario einen sha256 der kanonischen Ausgabe (Objektschluessel sortiert) und
// fuer wenige Stichproben die volle Ausgabe, damit eine Abweichung als lesbarer Diff erscheint.
const SAMPLE_SCENARIOS = [
  'tab-content/watchlist/final-mit-preisen',
  'tab-content/advanced/final-mit-preisen',
  'snapshot/final/dashboard',
  'pipeline/lazy-mit-kandidaten',
  'stats/mit-preisdaten',
];

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function hashOutput(value) {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

async function runScenario(scenario) {
  return JSON.parse(JSON.stringify(await scenario.run()));
}

if (WRITE_FIXTURE) {
  test('stats parity: Fixture schreiben', async () => {
    const hashes = {};
    const samples = {};
    for (const scenario of scenarios) {
      assert.ok(!(scenario.name in hashes), `Szenario doppelt: ${scenario.name}`);
      const output = await runScenario(scenario);
      hashes[scenario.name] = hashOutput(output);
      if (SAMPLE_SCENARIOS.includes(scenario.name)) samples[scenario.name] = output;
    }
    mkdirSync(new URL('fixtures/', import.meta.url), { recursive: true });
    writeFileSync(FIXTURE_URL, `${JSON.stringify({ hashes, samples }, null, 1)}\n`, 'utf8');
  });
} else {
  const fixture = JSON.parse(readFileSync(FIXTURE_URL, 'utf8'));

  test('stats parity: Fixture deckt genau die Szenarien ab', () => {
    assert.deepEqual(Object.keys(fixture.hashes).sort(), scenarios.map((scenario) => scenario.name).sort());
    assert.deepEqual(Object.keys(fixture.samples).sort(), [...SAMPLE_SCENARIOS].sort());
  });

  for (const scenario of scenarios) {
    test(`stats parity: ${scenario.name}`, async () => {
      const actual = await runScenario(scenario);
      if (scenario.name in fixture.samples) {
        assert.deepEqual(actual, fixture.samples[scenario.name]);
      }
      assert.equal(hashOutput(actual), fixture.hashes[scenario.name], `Ausgabe von ${scenario.name} weicht ab`);
    });
  }
}
