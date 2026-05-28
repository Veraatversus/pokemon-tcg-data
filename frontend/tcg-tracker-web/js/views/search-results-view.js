export function renderSearchToolbarMetaView({
  dom,
  getSearchModeMeta,
  buildSearchProgressLabel,
  rawQuery = '',
  searchScopeMode,
  resultCount = 0,
  setsProcessed = 0,
  totalSets = 0,
  apiProcessed = 0,
  totalApiSets = 0,
  isSearching = false,
  emptyMessage = '',
} = {}) {
  const escapeHtml = (value = '') => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

  if (!dom?.searchToolbarMeta) return;

  const modeMeta = getSearchModeMeta(searchScopeMode);
  const safeResultCount = Number.isFinite(resultCount) ? Math.max(0, resultCount) : 0;
  const progressSuffix = buildSearchProgressLabel({
    setsProcessed,
    totalSets,
    apiProcessed,
    totalApiSets,
  });

  let statusText = emptyMessage || 'Suchbegriff oben eingeben.';
  if (!emptyMessage && rawQuery) {
    if (isSearching) {
      statusText = `${safeResultCount || '…'} Ergebnis${safeResultCount === 1 ? '' : 'se'} · Suche läuft${progressSuffix}`;
    } else if (safeResultCount > 0) {
      statusText = `${safeResultCount} Ergebnis${safeResultCount === 1 ? '' : 'se'} gefunden`;
    } else {
      statusText = `Keine Treffer${progressSuffix}`;
    }
  }

  dom.searchToolbarMeta.innerHTML = `
    <span class="search-mode-badge ${escapeHtml(modeMeta.className)}">${escapeHtml(modeMeta.label)}</span>
    <span class="search-meta-pill${isSearching ? ' is-live' : ''}">${escapeHtml(statusText)}</span>
  `;
}

export function renderSearchResultsListView({
  dom,
  getSearchModeMeta,
  buildSearchProgressLabel,
  renderSearchToolbarMeta,
  createSearchResultCard,
  normalizeCardNumber,
  results = [],
  searchScopeMode,
  options = {},
} = {}) {
  const escapeHtml = (value = '') => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

  if (!dom?.searchResults) return;

  const {
    rawQuery = '',
    setsProcessed = 0,
    totalSets = 0,
    apiProcessed = 0,
    totalApiSets = 0,
    isSearching = false,
  } = options;

  const safeResults = Array.isArray(results) ? results : [];
  const modeMeta = getSearchModeMeta(searchScopeMode);
  const progressDetails = buildSearchProgressLabel({
    setsProcessed,
    totalSets,
    apiProcessed,
    totalApiSets,
  }).replace(/^ · /, '');
  const progressSuffix = progressDetails ? ` (${progressDetails})` : '';

  renderSearchToolbarMeta({
    rawQuery,
    searchScopeMode,
    resultCount: safeResults.length,
    setsProcessed,
    totalSets,
    apiProcessed,
    totalApiSets,
    isSearching,
  });

  if (!safeResults.length) {
    if (isSearching) {
      dom.searchResults.innerHTML = `
        <div class="search-results-head">
          <span class="search-mode-badge ${escapeHtml(modeMeta.className)}">${escapeHtml(modeMeta.label)}</span>
        </div>
        <p class="loading-placeholder">${escapeHtml(`Suche läuft…${progressSuffix}`)}</p>
      `;
      return;
    }

    dom.searchResults.innerHTML = `
      <div class="search-results-head">
        <span class="search-mode-badge ${escapeHtml(modeMeta.className)}">${escapeHtml(modeMeta.label)}</span>
      </div>
      <p class="empty-state">${escapeHtml(`Keine Karten für „${rawQuery}“ gefunden (durchsucht: ${totalSets} Sets, ${modeMeta.hint}).`)}</p>
    `;
    return;
  }

  dom.searchResults.innerHTML = `
    <div class="search-results-head">
      <p class="search-result-count">${escapeHtml(`${safeResults.length} Ergebnis${safeResults.length !== 1 ? 'se' : ''}${isSearching ? ' · Suche läuft…' : ''}`)}</p>
      <span class="search-mode-badge ${escapeHtml(modeMeta.className)}">${escapeHtml(modeMeta.label)}</span>
    </div>
  `;

  const frag = document.createDocumentFragment();
  safeResults.forEach(({ card, set, dbMap, apiOnly }) => {
    const key = normalizeCardNumber(card.number);
    frag.appendChild(createSearchResultCard(card, key, dbMap.get(key), set, apiOnly));
  });

  if (isSearching) {
    const loading = document.createElement('p');
    loading.className = 'loading-placeholder';
    loading.textContent = `Suche läuft…${progressSuffix}`;
    frag.appendChild(loading);
  }

  dom.searchResults.appendChild(frag);
}

export function createSearchResultsViewController({
  dom,
  getSearchModeMeta,
  buildSearchProgressLabel,
  createSearchResultCard,
  normalizeCardNumber,
} = {}) {
  function renderSearchToolbarMeta(params = {}) {
    return renderSearchToolbarMetaView({
      dom,
      getSearchModeMeta,
      buildSearchProgressLabel,
      ...params,
    });
  }

  function renderSearchResultsList(results = [], searchScopeMode, options = {}) {
    return renderSearchResultsListView({
      dom,
      getSearchModeMeta,
      buildSearchProgressLabel,
      renderSearchToolbarMeta,
      createSearchResultCard,
      normalizeCardNumber,
      results,
      searchScopeMode,
      options,
    });
  }

  return {
    renderSearchToolbarMeta,
    renderSearchResultsList,
  };
}
