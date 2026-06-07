import { applyReverseHoloQueryParam } from '../data/cardmarket-url-utils.js';

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

function escapeHtml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatStatsPriceEuro(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 'n/a';
  return `${numeric.toFixed(2).replace('.', ',')} EUR`;
}

function formatStatsPriceNumber(value) {
  return Number(value || 0).toLocaleString('de-DE');
}

function getItemCardmarketUrl(item = {}) {
  const base = String(
    item?.card?.cardmarketUrl
    || item?.card?.vera_cardmarket_url
    || item?.card?.tcgdex_cardmarket_url
    || item?.cardmarketUrl
    || item?.vera_cardmarket_url
    || item?.tcgdex_cardmarket_url
    || ''
  ).trim();
  // Hängt `?isReverseHolo=Y` an, wenn die Karte als Reverse Holo gesammelt
  // ist — Cardmarket zeigt dann direkt die korrekte Variante an.
  return applyReverseHoloQueryParam(base, Boolean(item?.isReverseHolo));
}

function getStatsPriceItemImageCandidates(item = {}) {
  const card = item?.card || {};
  const candidates = [
    item?.image,
    item?.imageUrl,
    card?.imageSmall,
    card?.image,
    card?.imageUrl,
    card?.imageLarge,
    card?.imageCandidates,
    card?.images?.small,
    card?.images?.large,
  ];
  const seen = new Set();
  const out = [];
  for (const list of candidates) {
    if (Array.isArray(list)) {
      for (const value of list) {
        const trimmed = String(value || '').trim();
        if (trimmed && !seen.has(trimmed)) { seen.add(trimmed); out.push(trimmed); }
      }
    } else {
      const trimmed = String(list || '').trim();
      if (trimmed && !seen.has(trimmed)) { seen.add(trimmed); out.push(trimmed); }
    }
  }
  return out;
}

function renderStatsPriceThumbMarkup(item = {}) {
  const candidates = getStatsPriceItemImageCandidates(item);
  if (!candidates.length) {
    return '<span class="stats-price-thumb-fallback" aria-hidden="true">?</span>';
  }
  const [primary, ...rest] = candidates;
  const altText = String(item?.cardName || item?.card?.name || item?.card?.number || 'Kartenbild').trim();
  const dataAttr = ` data-image-candidates='${escapeHtml(JSON.stringify(rest))}'`;
  const onerrorAttr = "this.onerror=null;var c=this.dataset.imageCandidates;if(c){var arr;try{arr=JSON.parse(c);}catch(e){arr=[];}if(Array.isArray(arr)&&arr.length){this.dataset.imageCandidates=JSON.stringify(arr.slice(1));this.src=arr[0];return;}}this.src='./assets/pokeball-fallback.svg';this.classList.add('img-fallback');this.closest('.stats-price-thumb')?.classList.add('stats-price-thumb--missing');";
  return `<img class="stats-price-thumb-img" src="${escapeHtml(primary)}" alt="${escapeHtml(altText)}" loading="lazy" decoding="async"${dataAttr} onerror="${onerrorAttr}" />`;
}

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
  const filteredValue = filteredPriced.reduce((sum, item) => sum + (toFinitePositive(item?.value) || 0), 0);
  const setIds = new Set(filteredItems.map((item) => String(item?.setId || '').trim()).filter(Boolean));

  return {
    filters: normalizedFilters,
    filteredItems,
    groups,
    summary: {
      cards: filteredItems.length,
      pricedCards: filteredPriced.length,
      missingCards: filteredItems.length - filteredPriced.length,
      failedCards: filteredItems.filter((item) => item?.failed).length,
      totalValue: filteredValue,
      avgValue: filteredPriced.length > 0 ? filteredValue / filteredPriced.length : 0,
      setCount: setIds.size,
    },
  };
}

export function createStatsPriceViewController({
  state,
  navigate,
  getContainer,
  isActiveRequest,
} = {}) {
  function buildStatsPriceTabContent({
    activeTab = 'dashboard',
    analytics = null,
    status = 'loading',
    loadedCards = 0,
    totalCards = 0,
    errors = 0,
    message = '',
  } = {}) {
    const safeItems = Array.isArray(state.statsPrice.items) ? state.statsPrice.items : [];
    const advancedState = state.statsPrice.advanced || (state.statsPrice.advanced = {
      filters: normalizeAdvancedFilters(),
      selectedGroupKey: '',
      detailMode: 'top',
    });
    advancedState.filters = normalizeAdvancedFilters(advancedState.filters);
    advancedState.detailMode = String(advancedState.detailMode || 'summary');

    const pricedItems = safeItems.filter((item) => Number(item?.value) > 0);
    const missingItems = safeItems.filter((item) => item?.value == null);
    const bySet = Array.isArray(analytics?.setBreakdown) ? analytics.setBreakdown : [];
    const topCards = Array.isArray(analytics?.topCards) ? analytics.topCards : [];
    const coverage = Number(analytics?.priceCoverage || 0);
    const avgValue = Number(analytics?.avgCollectedCardValue || 0);
    const detailStats = analytics?.details || {};
    const medianValue = Number(detailStats?.medianValue || 0);
    const p90Value = Number(detailStats?.p90Value || 0);
    const topFiveShare = Number(detailStats?.topFiveValueShare || 0);
    const pricedSetCoverage = Number(detailStats?.pricedSetCoverage || 0);
    const spreadRatio = Number(detailStats?.priceSpreadRatio || 0);
    const watchlistItems = pricedItems
      .filter((item) => Number(item?.value) >= Math.max(avgValue * 1.8, 20))
      .sort((a, b) => Number(b?.value || 0) - Number(a?.value || 0))
      .slice();
    const advancedWorkspace = computeAdvancedWorkspace(safeItems, advancedState.filters);
    const advancedGroups = advancedWorkspace.groups;
    if (!advancedGroups.some((group) => group.key === advancedState.selectedGroupKey)) {
      advancedState.selectedGroupKey = advancedGroups[0]?.key || '';
    }
    const activeAdvancedGroup = advancedGroups.find((group) => group.key === advancedState.selectedGroupKey) || null;

    const tabsMarkup = STATS_PRICE_TABS.map((tab) => `
      <button class="stats-price-tab-btn ${tab.id === activeTab ? 'is-active' : ''}" type="button" data-stats-price-tab="${tab.id}">
        ${escapeHtml(tab.label)}
      </button>`).join('');

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

    const drilldownMarkup = Array.from(drilldownBySet.values())
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

    const dashboardHighlights = `
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

    const topValuesMarkup = `
    <section class="stats-price-tab-panel" data-tab-panel="top-values">
      <ol class="stats-price-rich-list stats-price-scroll-region">
        ${topCards
          .slice()
          .map((card, index) => `
            <li class="stats-price-rich-item" data-set-id="${escapeHtml(card?.setId || '')}">
              <span class="stats-price-rich-rank">${index + 1}</span>
              <div class="stats-price-rich-main">
                <strong>${escapeHtml(card?.cardName || 'Unbekannte Karte')}</strong>
                <small>${escapeHtml(card?.setName || 'Unbekanntes Set')} · #${escapeHtml(card?.card?.number || card?.cardNumber || card?.cardKey || '')}</small>
              </div>
              ${getItemCardmarketUrl(card)
                ? `<a class="stats-price-cardmarket-link" href="${escapeHtml(getItemCardmarketUrl(card))}" target="_blank" rel="noopener noreferrer" data-cardmarket-link="1">Cardmarket</a>`
                : ''}
              <strong class="stats-price-rich-value">${formatStatsPriceEuro(card?.value)}</strong>
            </li>
          `)
          .join('') || '<li class="stats-price-empty">Noch keine Top-Werte verfügbar.</li>'}
      </ol>
    </section>`;

    const trendsMarkup = `
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

    const comparisonsMarkup = `
    <section class="stats-price-tab-panel" data-tab-panel="comparisons">
      <ul class="stats-price-compare-list stats-price-scroll-region">
        ${chartRows || '<li class="stats-price-empty">Noch keine Set-Vergleiche verfügbar.</li>'}
      </ul>
    </section>`;

    const watchlistMarkup = `
    <section class="stats-price-tab-panel" data-tab-panel="watchlist">
      <ol class="stats-price-rich-list stats-price-scroll-region">
        ${watchlistItems
          .map((item, index) => {
            const isReverse = Boolean(item?.isReverseHolo);
            const reverseClass = isReverse ? ' is-reverse' : '';
            const cardmarketUrl = getItemCardmarketUrl(item);
            return `
            <li class="stats-price-rich-item${reverseClass}" data-set-id="${escapeHtml(item?.setId || '')}">
              <span class="stats-price-rich-rank">${index + 1}</span>
              <span class="stats-price-thumb" aria-hidden="true">
                ${renderStatsPriceThumbMarkup(item)}
              </span>
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
          .join('') || '<li class="stats-price-empty">Noch keine Watchlist-Kandidaten erkannt.</li>'}
      </ol>
    </section>`;

    const advancedGroupsMarkup = advancedGroups
      .map((group) => {
        const isActive = group.key === advancedState.selectedGroupKey;
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

    const advancedDetailMode = advancedState.detailMode;
    const activeGroupItems = Array.isArray(activeAdvancedGroup?.items) ? activeAdvancedGroup.items : [];
    const activeGroupPriced = activeGroupItems.filter((item) => toFinitePositive(item?.value) != null);
    const activeGroupMissing = activeGroupItems.filter((item) => toFinitePositive(item?.value) == null);

    const advancedDetailSummaryMarkup = `
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

    const advancedDetailTopMarkup = `
      <ol class="stats-price-rich-list stats-price-scroll-region">
        ${activeGroupPriced
          .slice()
          .sort((a, b) => Number(b?.value || 0) - Number(a?.value || 0))
          .map((item, index) => {
        const isReverse = Boolean(item?.isReverseHolo);
        const reverseClass = isReverse ? ' is-reverse' : '';
        const cardmarketUrl = getItemCardmarketUrl(item);
        return `
            <li class="stats-price-rich-item${reverseClass}" ${item?.setId ? `data-set-id="${escapeHtml(item.setId)}"` : ''}>
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

    const advancedDistributionByBand = activeGroupItems.reduce((acc, item) => {
      const band = getValueBandKey(item?.value);
      acc.set(band, (acc.get(band) || 0) + 1);
      return acc;
    }, new Map());
    const advancedDetailDistributionMarkup = `
      <ul class="stats-price-advanced-distribution">
        ${['under1', 'from1to5', 'from5to20', 'over20', 'missing'].map((band) => `
          <li>
            <span>${getValueBandLabel(band)}</span>
            <strong>${formatStatsPriceNumber(advancedDistributionByBand.get(band) || 0)}</strong>
          </li>
        `).join('')}
      </ul>`;

    let advancedDetailContent = advancedDetailSummaryMarkup;
    if (advancedDetailMode === 'top') advancedDetailContent = advancedDetailTopMarkup;
    if (advancedDetailMode === 'missing') advancedDetailContent = advancedDetailMissingMarkup;
    if (advancedDetailMode === 'distribution') advancedDetailContent = advancedDetailDistributionMarkup;

    const advancedMarkup = `
    <section class="stats-price-tab-panel" data-tab-panel="advanced">
      <div class="stats-price-advanced-toolbar">
        <label>Set
          <select data-advanced-filter="setId">
            <option value="all" ${advancedWorkspace.filters.setId === 'all' ? 'selected' : ''}>Alle Sets</option>
            ${Array.from(new Map(bySet.map((entry) => [String(entry?.setId || '').trim(), entry])).values())
              .filter((entry) => String(entry?.setId || '').trim())
              .map((entry) => `<option value="${escapeHtml(entry.setId)}" ${advancedWorkspace.filters.setId === String(entry.setId) ? 'selected' : ''}>${escapeHtml(entry.setName || entry.setId)}</option>`)
              .join('')}
          </select>
        </label>
        <label>Preisband
          <select data-advanced-filter="valueBand">
            <option value="all" ${advancedWorkspace.filters.valueBand === 'all' ? 'selected' : ''}>Alle</option>
            <option value="under1" ${advancedWorkspace.filters.valueBand === 'under1' ? 'selected' : ''}>&lt; 1 EUR</option>
            <option value="from1to5" ${advancedWorkspace.filters.valueBand === 'from1to5' ? 'selected' : ''}>1-5 EUR</option>
            <option value="from5to20" ${advancedWorkspace.filters.valueBand === 'from5to20' ? 'selected' : ''}>5-20 EUR</option>
            <option value="over20" ${advancedWorkspace.filters.valueBand === 'over20' ? 'selected' : ''}>&gt; 20 EUR</option>
            <option value="missing" ${advancedWorkspace.filters.valueBand === 'missing' ? 'selected' : ''}>Ohne Preis</option>
          </select>
        </label>
        <label>Quantil
          <select data-advanced-filter="quantile">
            <option value="all" ${advancedWorkspace.filters.quantile === 'all' ? 'selected' : ''}>Alle</option>
            <option value="top1" ${advancedWorkspace.filters.quantile === 'top1' ? 'selected' : ''}>Top 1%</option>
            <option value="top5" ${advancedWorkspace.filters.quantile === 'top5' ? 'selected' : ''}>Top 5%</option>
            <option value="top10" ${advancedWorkspace.filters.quantile === 'top10' ? 'selected' : ''}>Top 10%</option>
            <option value="bottom20" ${advancedWorkspace.filters.quantile === 'bottom20' ? 'selected' : ''}>Bottom 20%</option>
          </select>
        </label>
        <label>Qualität
          <select data-advanced-filter="quality">
            <option value="all" ${advancedWorkspace.filters.quality === 'all' ? 'selected' : ''}>Alles</option>
            <option value="priced-only" ${advancedWorkspace.filters.quality === 'priced-only' ? 'selected' : ''}>Nur bepreist</option>
            <option value="missing-only" ${advancedWorkspace.filters.quality === 'missing-only' ? 'selected' : ''}>Nur fehlende Preise</option>
            <option value="failed-only" ${advancedWorkspace.filters.quality === 'failed-only' ? 'selected' : ''}>Nur Lookup-Fehler</option>
          </select>
        </label>
        <label>Gruppierung
          <select data-advanced-filter="groupBy">
            <option value="set" ${advancedWorkspace.filters.groupBy === 'set' ? 'selected' : ''}>Nach Set</option>
            <option value="value-band" ${advancedWorkspace.filters.groupBy === 'value-band' ? 'selected' : ''}>Nach Preisband</option>
            <option value="quantile" ${advancedWorkspace.filters.groupBy === 'quantile' ? 'selected' : ''}>Nach Quantil</option>
          </select>
        </label>
        <label>Sortierung
          <select data-advanced-filter="sortBy">
            <option value="value-desc" ${advancedWorkspace.filters.sortBy === 'value-desc' ? 'selected' : ''}>Wert absteigend</option>
            <option value="value-asc" ${advancedWorkspace.filters.sortBy === 'value-asc' ? 'selected' : ''}>Wert aufsteigend</option>
            <option value="count-desc" ${advancedWorkspace.filters.sortBy === 'count-desc' ? 'selected' : ''}>Kartenanzahl</option>
            <option value="gap-desc" ${advancedWorkspace.filters.sortBy === 'gap-desc' ? 'selected' : ''}>Coverage Gap</option>
          </select>
        </label>
      </div>

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
          ${advancedDetailContent}
        </section>
      </div>
    </section>`;

    const timelinePanelMarkup = `
    <section class="stats-price-tab-panel" data-tab-panel="timeline">
      <ol class="stats-price-story-list">${timelineMarkup}</ol>
    </section>`;

    const drilldownPanelMarkup = `
    <section class="stats-price-tab-panel" data-tab-panel="drilldown">
      <div class="stats-price-drill-headline">
        <strong>${formatStatsPriceNumber(missingItems.length)} Karten ohne Preis</strong>
        <small>${errors > 0 ? `${formatStatsPriceNumber(errors)} technische Fehler` : 'Keine technischen Fehler gemeldet'}</small>
      </div>
      <div class="stats-price-drill-groups">
        ${drilldownMarkup || '<p class="stats-price-empty">Keine Drilldown-Lücken vorhanden.</p>'}
      </div>
    </section>`;

    const panelMap = {
      dashboard: dashboardHighlights,
      'top-values': topValuesMarkup,
      trends: trendsMarkup,
      comparisons: comparisonsMarkup,
      advanced: advancedMarkup,
      watchlist: watchlistMarkup,
      timeline: timelinePanelMarkup,
      drilldown: drilldownPanelMarkup,
    };

    return {
      tabsMarkup,
      contentMarkup: panelMap[activeTab] || panelMap.dashboard,
      completionLabel: message || (status === 'final' ? 'Preisradar abgeschlossen.' : `${formatStatsPriceNumber(loadedCards)} / ${formatStatsPriceNumber(totalCards)} Karten geladen`),
    };
  }

  function renderStatsPriceSnapshot({
    status = 'loading',
    analytics = null,
    loadedCards = 0,
    totalCards = 0,
    errors = 0,
    message = ''
  } = {}) {
    const container = getContainer();
    if (!container) return;

    const progress = totalCards > 0 ? Math.round((loadedCards / totalCards) * 100) : 0;
    const totalValue = analytics?.totalValue || 0;
    const averageValue = analytics?.avgCollectedCardValue || 0;
    const collectedCards = analytics?.collectedCards || 0;
    const pricedCollectedCards = analytics?.pricedCollectedCards || 0;
    const priceCoverage = analytics?.priceCoverage || 0;
    const activeTab = STATS_PRICE_TABS.some((tab) => tab.id === state.statsPrice.activeTab)
      ? state.statsPrice.activeTab
      : 'dashboard';
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
    container.innerHTML = `
    <article class="stats-price-panel ${status === 'final' ? 'stats-price-enter' : ''}">
      <header class="stats-price-head">
        <div>
          <span class="stats-price-kicker">Cardmarket Analyse</span>
          <h3>Preisradar f&#xfc;r deine Sammlung</h3>
          <p>${tabContent.completionLabel}</p>
        </div>
        <div class="stats-price-progress-wrap">
          <strong>${progress}%</strong>
          <div class="stats-price-progress"><span style="width:${progress}%"></span></div>
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

      <section class="stats-price-tab-content">
        ${tabContent.contentMarkup}
      </section>
    </article>`;

    container.querySelectorAll('.stats-price-tab-btn[data-stats-price-tab]').forEach((tabButton) => {
      tabButton.addEventListener('click', () => {
        const nextTab = String(tabButton.dataset.statsPriceTab || '').trim();
        if (!nextTab || nextTab === state.statsPrice.activeTab) return;
        state.statsPrice.activeTab = nextTab;
        renderStatsPriceSnapshot({
          status,
          analytics,
          loadedCards,
          totalCards,
          errors,
          message,
        });
      });
    });

    container.querySelectorAll('select[data-advanced-filter]').forEach((select) => {
      select.addEventListener('change', () => {
        const filterKey = String(select.dataset.advancedFilter || '').trim();
        if (!filterKey) return;
        state.statsPrice.advanced = state.statsPrice.advanced || { filters: {}, selectedGroupKey: '', detailMode: 'top' };
        const nextFilters = normalizeAdvancedFilters(state.statsPrice.advanced.filters);
        nextFilters[filterKey] = String(select.value || 'all');
        state.statsPrice.advanced.filters = nextFilters;
        state.statsPrice.advanced.selectedGroupKey = '';
        renderStatsPriceSnapshot({
          status,
          analytics,
          loadedCards,
          totalCards,
          errors,
          message,
        });
      });
    });

    container.querySelectorAll('[data-advanced-group-key]').forEach((groupButton) => {
      groupButton.addEventListener('click', () => {
        const nextGroupKey = String(groupButton.dataset.advancedGroupKey || '').trim();
        if (!nextGroupKey) return;
        state.statsPrice.advanced = state.statsPrice.advanced || { filters: {}, selectedGroupKey: '', detailMode: 'top' };
        state.statsPrice.advanced.selectedGroupKey = nextGroupKey;
        renderStatsPriceSnapshot({
          status,
          analytics,
          loadedCards,
          totalCards,
          errors,
          message,
        });
      });
    });

    container.querySelectorAll('[data-advanced-detail-mode]').forEach((detailButton) => {
      detailButton.addEventListener('click', () => {
        const nextMode = String(detailButton.dataset.advancedDetailMode || '').trim();
        if (!nextMode) return;
        state.statsPrice.advanced = state.statsPrice.advanced || { filters: {}, selectedGroupKey: '', detailMode: 'top' };
        state.statsPrice.advanced.detailMode = nextMode;
        renderStatsPriceSnapshot({
          status,
          analytics,
          loadedCards,
          totalCards,
          errors,
          message,
        });
      });
    });

    container.querySelectorAll('[data-set-id]').forEach((item) => {
      item.addEventListener('click', () => {
        const setId = item.dataset.setId;
        if (!setId) return;
        navigate(`set/${encodeURIComponent(setId)}`);
      });
    });

    container.querySelectorAll('[data-cardmarket-link]').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.stopPropagation();
      });
    });
  }

  function renderStatsPriceLoading({ requestId, loadedCards = 0, totalCards = 0 } = {}) {
    state.statsPrice.requestId = String(requestId || '');
    state.statsPrice.status = 'loading';
    state.statsPrice.items = [];
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
    if (!isActiveRequest(requestId)) return;
    state.statsPrice.status = 'partial';
    state.statsPrice.totals = analytics;
    state.statsPrice.bySet = analytics?.setBreakdown || [];
    state.statsPrice.items = Array.isArray(items) ? items : [];
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
    if (!isActiveRequest(requestId)) return;
    state.statsPrice.status = 'final';
    state.statsPrice.totals = analytics;
    state.statsPrice.bySet = analytics?.setBreakdown || [];
    state.statsPrice.topCards = analytics?.topCard ? [analytics.topCard] : [];
    state.statsPrice.items = Array.isArray(items) ? items : [];
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

  function renderStatsPriceError(message = 'Preisanalysen konnten nicht geladen werden.') {
    const container = getContainer();
    if (!container) return;
    state.statsPrice.status = 'error';
    container.dataset.state = 'error';
    container.innerHTML = `<p class="stats-price-error">${message}</p>`;
  }

  return {
    renderStatsPriceSnapshot,
    renderStatsPriceLoading,
    renderStatsPricePartial,
    renderStatsPriceFinal,
    renderStatsPriceError,
  };
}