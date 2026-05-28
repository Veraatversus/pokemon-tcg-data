/**
 * ════════════════════════════════════════════════════════════════════════════
 * SEARCH ORCHESTRATION – Multi-Phase Search Execution Engine
 * ════════════════════════════════════════════════════════════════════════════
 */

export async function runSearchOrchestrated(options = {}) {
  const {
    force = false,
    dom,
    state,
    cache,
    CONFIG,
    // Helper functions
    normalizeSearchText,
    normalizeCardNumber,
    parseStructuredSearchQuery,
    parseMixedQuery,
    getSearchScopeMode,
    getSearchSetFilterValue,
    getSetsForSearchMode,
    addSearchHistory,
    readDbCardsForSet,
    readSetCollectionMap,
    shouldUseApiForSearchSet,
    shouldFetchApiCardsForSearchSet,
    computeSearchScore,
    getSearchResultKey,
    getSearchModeMeta,
    getSearchResultsInOrder,
    sortSearchResults,
    mergeSearchCards,
    fetchMergedCardsWithSetMeta,
    renderSearchToolbarMeta,
    renderSearchResultsList,
    showToast,
    // Constants
    SEARCH_SCOPE_IMPORTED,
    SEARCH_SCOPE_ONLINE,
  } = options;

  const runId = ++state.searchRunId;
  const isStale = () => runId !== state.searchRunId;
  if (state.searchAbortController) {
    state.searchAbortController.abort();
  }
  const abortController = new AbortController();
  state.searchAbortController = abortController;
  const isAborted = () => abortController.signal.aborted;

  const rawQuery = dom.searchInput.value.trim();
  const query = normalizeSearchText(rawQuery);
  const searchScopeMode = getSearchScopeMode();
  if (!query) {
    state.lastSearchResults = [];
    renderSearchToolbarMeta({
      searchScopeMode,
      emptyMessage: 'Suchbegriff oben eingeben.'
    });
    dom.searchResults.innerHTML = '<p class="empty-state">Suchbegriff eingeben.</p>';
    return;
  }
  const setFilter = getSearchSetFilterValue();
  const availableSetsForSearch = getSetsForSearchMode(searchScopeMode);
  const baseSetsToSearch = setFilter
    ? availableSetsForSearch.filter((s) => s.setId === setFilter)
    : availableSetsForSearch;
  const lookupPool = state.allSets?.length ? state.allSets : baseSetsToSearch;
  const structuredQuery = parseStructuredSearchQuery(rawQuery, lookupPool);
  const mixedQuery = !structuredQuery ? parseMixedQuery(rawQuery) : null;
  if (!force && !structuredQuery && !mixedQuery && query.length < 2) {
    state.lastSearchResults = [];
    renderSearchToolbarMeta({
      rawQuery,
      searchScopeMode,
      emptyMessage: 'Mindestens 2 Zeichen eingeben oder Enter drücken.'
    });
    dom.searchResults.innerHTML = '<p class="empty-state">Mindestens 2 Zeichen eingeben oder Enter drücken.</p>';
    return;
  }

  if (force || structuredQuery || mixedQuery || rawQuery.length >= 3) {
    window.SEARCH_HISTORY = addSearchHistory(rawQuery);
  }
  const setsToSearch = structuredQuery
    ? [baseSetsToSearch.find((s) => s.setId === structuredQuery.setId) ?? structuredQuery.set]
    : baseSetsToSearch;
  if (!setsToSearch.length) {
    renderSearchToolbarMeta({
      rawQuery,
      searchScopeMode,
      emptyMessage: 'Keine passenden Sets verfügbar.'
    });
    dom.searchResults.innerHTML = '<p class="empty-state">Keine passenden Sets verfügbar.</p>';
    return;
  }
  renderSearchResultsList([], searchScopeMode, {
    rawQuery,
    setsProcessed: 0,
    totalSets: setsToSearch.length,
    isSearching: true,
  });

  const resultsMap = new Map();
  const apiPhaseQueue = [];
  let apiRenderOrderKeys = null;
  let searchedSetsCount = 0;
  let apiProcessedCount = 0;
  let shouldStopSearch = false;

  const upsertMatches = (cards, set, dbMap) => {
    let matchCount = 0;
    (Array.isArray(cards) ? cards : []).forEach((card) => {
      const score = computeSearchScore(card, query, structuredQuery, mixedQuery, set);
      if (score < 0) return;
      matchCount += 1;
      const resultKey = getSearchResultKey(card, set, normalizeSearchText, normalizeCardNumber);
      const hadKey = resultsMap.has(resultKey);
      resultsMap.set(resultKey, {
        card,
        set,
        dbMap,
        score,
        apiOnly: Boolean(card?.__searchApiOnly),
        resultKey,
      });
      if (!hadKey && Array.isArray(apiRenderOrderKeys) && !apiRenderOrderKeys.includes(resultKey)) {
        apiRenderOrderKeys.push(resultKey);
      }
    });
    return matchCount;
  };

  const renderCurrentResults = ({
    isSearching = false,
    preserveSortedPrefix = false,
    apiProcessed = apiProcessedCount,
    totalApiSets = 0,
  } = {}) => {
    const currentResults = preserveSortedPrefix
      ? getSearchResultsInOrder(resultsMap, apiRenderOrderKeys)
      : Array.from(resultsMap.values());

    if (!currentResults.length) return;
    state.lastSearchResults = currentResults.slice(0, 60);
    if (isStale() || isAborted()) return;
    renderSearchResultsList(currentResults, searchScopeMode, {
      rawQuery,
      setsProcessed: searchedSetsCount,
      totalSets: setsToSearch.length,
      apiProcessed,
      totalApiSets,
      isSearching,
    });
  };

  for (const set of setsToSearch) {
    if (isStale() || isAborted()) return;
    let setMatchCount = 0;

    try {
      const cacheKey = `cards_${set.setId}`;
      const dbCardsCacheKey = `db_cards_${set.setId}`;
      const dbCacheKey = `db_${set.setId}`;
      const searchCacheKey = `${set.setId}::${searchScopeMode}`;
      const useApiForSet = shouldUseApiForSearchSet(searchScopeMode, set);

      let dbCards = [];
      if (cache.has(dbCardsCacheKey)) {
        dbCards = cache.get(dbCardsCacheKey) || [];
      } else {
        dbCards = await readDbCardsForSet(set.setId).catch(() => []);
        if (Array.isArray(dbCards) && dbCards.length > 0) {
          cache.set(dbCardsCacheKey, dbCards, CONFIG.CACHE_TTL_MS);
        }
      }

      let dbMap = new Map();
      if (cache.has(dbCacheKey)) dbMap = cache.get(dbCacheKey);
      else {
        dbMap = await readSetCollectionMap(set.setName).catch(() => new Map());
        cache.set(dbCacheKey, dbMap, CONFIG.CACHE_TTL_MS);
      }

      const hasDbCards = Array.isArray(dbCards) && dbCards.length > 0;
      const shouldFetchApiCards = shouldFetchApiCardsForSearchSet(searchScopeMode, set, hasDbCards);
      const dbSearchCards = !useApiForSet && hasDbCards ? dbCards : [];

      if (dbSearchCards.length > 0) {
        setMatchCount = upsertMatches(dbSearchCards, set, dbMap);
        state.searchCache.set(searchCacheKey, dbSearchCards);
      }

      if (shouldFetchApiCards) {
        apiPhaseQueue.push({ set, dbCards, dbMap, cacheKey, searchCacheKey });
      }

      if (!structuredQuery && !mixedQuery && resultsMap.size >= 200 && searchScopeMode === SEARCH_SCOPE_IMPORTED) {
        shouldStopSearch = true;
      }
      if (structuredQuery?.cardNumber && !structuredQuery?.namePart && resultsMap.size >= 1 && !shouldFetchApiCards) {
        shouldStopSearch = true;
      }
    } catch (err) {
      if (err?.name === 'AbortError') {
        return;
      }
      console.warn('[runSearchOrchestrated] error for set', set.setId, err);
    }

    searchedSetsCount += 1;

    if (setMatchCount > 0 && resultsMap.size > 0) {
      renderCurrentResults({
        isSearching: searchedSetsCount < setsToSearch.length || (!shouldStopSearch && apiPhaseQueue.length > 0),
      });
    }

    if (shouldStopSearch) break;
  }

  if (shouldStopSearch) {
    apiPhaseQueue.length = 0;
  }

  const hasPendingApiPhase = apiPhaseQueue.length > 0;
  if (resultsMap.size > 0) {
    const dbSortedResults = sortSearchResults(Array.from(resultsMap.values()));
    apiRenderOrderKeys = hasPendingApiPhase
      ? dbSortedResults.map((entry) => entry.resultKey)
      : null;
    state.lastSearchResults = dbSortedResults.slice(0, 60);

    if (isStale() || isAborted()) return;
    renderSearchResultsList(dbSortedResults, searchScopeMode, {
      rawQuery,
      setsProcessed: searchedSetsCount,
      totalSets: setsToSearch.length,
      apiProcessed: 0,
      totalApiSets: apiPhaseQueue.length,
      isSearching: hasPendingApiPhase,
    });
  }

  if (!shouldStopSearch && hasPendingApiPhase) {
    for (let apiIndex = 0; apiIndex < apiPhaseQueue.length; apiIndex += 1) {
      if (isStale() || isAborted()) return;
      const { set, dbCards, dbMap, cacheKey, searchCacheKey } = apiPhaseQueue[apiIndex];

      try {
        let apiCards = [];
        if (cache.has(cacheKey)) {
          apiCards = cache.get(cacheKey) || [];
        } else {
          const apiPayload = await fetchMergedCardsWithSetMeta(set.setId, { signal: abortController.signal }).catch(() => ({ cards: [], setMetaPatch: null }));
          apiCards = Array.isArray(apiPayload?.cards) ? apiPayload.cards : [];
          if (apiCards.length > 0) {
            cache.set(cacheKey, apiCards, CONFIG.CACHE_TTL_MS);
          }
        }

        const mergedCards = searchScopeMode === SEARCH_SCOPE_ONLINE
          ? mergeSearchCards([], apiCards)
          : mergeSearchCards(dbCards, apiCards);

        state.searchCache.set(searchCacheKey, mergedCards || []);

        let apiMatchCount = 0;
        if (mergedCards.length > 0) {
          apiMatchCount = upsertMatches(mergedCards, set, dbMap);
        }

        apiProcessedCount = apiIndex + 1;
        if (apiMatchCount > 0 && resultsMap.size > 0) {
          renderCurrentResults({
            isSearching: apiProcessedCount < apiPhaseQueue.length,
            preserveSortedPrefix: true,
            apiProcessed: apiProcessedCount,
            totalApiSets: apiPhaseQueue.length,
          });
        }

        if (structuredQuery?.cardNumber && !structuredQuery?.namePart && resultsMap.size >= 1) {
          shouldStopSearch = true;
        }
      } catch (err) {
        if (err?.name === 'AbortError') {
          return;
        }
        console.warn('[runSearchOrchestrated] api phase error for set', set.setId, err);
      }

      if (shouldStopSearch) break;
    }
  }

  if (!resultsMap.size) {
    const modeMeta = getSearchModeMeta(searchScopeMode);
    renderSearchToolbarMeta({
      rawQuery,
      searchScopeMode,
      resultCount: 0,
      setsProcessed: setsToSearch.length,
      totalSets: setsToSearch.length,
      emptyMessage: `Keine Treffer · ${setsToSearch.length} Sets geprüft`
    });
    dom.searchResults.innerHTML = `
      <div class="search-results-head">
        <span class="search-mode-badge ${modeMeta.className}">${modeMeta.label}</span>
      </div>
      <p class="empty-state">Keine Karten für „${rawQuery}" gefunden (durchsucht: ${setsToSearch.length} Sets, ${modeMeta.hint}).</p>
    `;
    return;
  }

  const finalResults = sortSearchResults(Array.from(resultsMap.values()));
  state.lastSearchResults = finalResults.slice(0, 60);

  if (isStale() || isAborted()) return;
  renderSearchResultsList(finalResults, searchScopeMode, {
    rawQuery,
    setsProcessed: setsToSearch.length,
    totalSets: setsToSearch.length,
    isSearching: false,
  });
}
