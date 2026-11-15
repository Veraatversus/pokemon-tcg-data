// Suche-Ansicht: Suche ueber alle Sets, Ergebnisliste und Autocomplete.
// Funktionen anderer Ansichten, die noch in app.js liegen, werden ueber actions.<name>() aufgerufen.
import { isGeneratedCardmarketSearchUrl } from '../data/cardmarket-url-utils.js';
import { readSetCollectionMap } from '../data/sheets-db.js?v=20261115-price-range-2';
import { collectionKeyOf, emptyCollectionEntry } from '../data/collection-writes.js';
import { describeCardDataFailure } from '../core/card-enrichment.js';
import { searchFromIndex, searchResultsForDisplay } from '../features/search/search-index-prefilter.js';
import { readCollectionMapCached } from '../features/search/search-collection-maps.js';
import { parseStructuredSearchQuery, normalizeSearchText, cardNumberMatchesQuery, collectSearchStrings } from '../features/search/query-utils.js';
import { getCardLanguage } from '../data/schema-contract.js?v=20261115-price-range-2';
import { buildCombinedSearchDropdownOptions, buildSearchProgressLabel, normalizeCardNumber, resolveCombinedSearchSelection, toBoolean } from '../core/utils.js';
import { getCollectionUiState, resolveCollectionToggleState, effectiveCollectionStatus } from '../core/collection-state.js?v=20261115-price-range-2';
import * as cache from '../core/cache.js';
import { CONFIG } from '../core/config.js';
import { loadSearchHistory, addSearchHistory } from '../enhanced-features.js?v=20261115-price-range-2';
import { sanitizeDisplayText } from '../core/display-text.js';
import { dom } from '../app/dom.js';
import { state } from '../app/state.js';
import { showView, navigate } from '../app/router.js';
import { showToast, setCardSaveState, beginTrackedWrite, finishTrackedWrite, pushUndoEntry, updateUndoUi, attachImageFallback, syncRefreshControls, escapeHtml } from '../ui/helpers.js';
import { actions } from '../app/actions.js';

const SEARCH_INPUT_DEBOUNCE_MS = 900;
// Suche: hoechstens so viele Treffer als Karten zeichnen (z. B. 'pokemon' trifft ~20 000 Indexeintraege).
const SEARCH_RESULT_RENDER_LIMIT = 240;
const SEARCH_SCOPE_IMPORTED = 'imported';
const SEARCH_SCOPE_ALL = 'all';
const SEARCH_SCOPE_ONLINE = 'online';

function getSearchSelectionState() {
  const fallbackValue = `scope:${SEARCH_SCOPE_ALL}`;
  return resolveCombinedSearchSelection(dom.searchSetFilter?.value || fallbackValue, SEARCH_SCOPE_ALL);
}

function getSearchScopeMode() {
  const { mode } = getSearchSelectionState();
  if (mode === SEARCH_SCOPE_ALL || mode === SEARCH_SCOPE_ONLINE) {
    return mode;
  }
  return SEARCH_SCOPE_IMPORTED;
}

function getSearchSetFilterValue() {
  return getSearchSelectionState().setId || '';
}

function getSetsForSearchMode(mode) {
  if (mode === SEARCH_SCOPE_IMPORTED) {
    return state.sets || [];
  }
  return state.allSets?.length ? state.allSets : (state.sets || []);
}

function getSearchModeMeta(mode) {
  if (mode === SEARCH_SCOPE_ONLINE) {
    return {
      label: 'Modus: Online-Suche',
      className: 'online',
      hint: 'Nur API fuer alle Sets'
    };
  }
  if (mode === SEARCH_SCOPE_ALL) {
    return {
      label: 'Modus: Alle Sets',
      className: 'all',
      hint: 'Importierte aus DB, nicht importierte online'
    };
  }
  return {
    label: 'Modus: Importierte Sets',
    className: 'imported',
    hint: 'Nur importierte Sets/DB'
  };
}

export function renderSearchSetFilterOptions() {
  if (!dom.searchSetFilter) return;

  const previousValue = String(dom.searchSetFilter.value || `scope:${SEARCH_SCOPE_ALL}`);
  const previousSelection = resolveCombinedSearchSelection(previousValue, SEARCH_SCOPE_ALL);
  const selectedSetId = String(previousSelection.setId || '').trim();
  const knownSets = state.allSets?.length ? state.allSets : (state.sets || []);
  const selectedSet = selectedSetId
    ? knownSets.find((set) => String(set?.setId || '').trim() === selectedSetId)
    : null;
  const desiredValue = selectedSetId
    ? (previousSelection.mode === SEARCH_SCOPE_ALL && !toBoolean(selectedSet?.imported)
      ? `set:all:${selectedSetId}`
      : selectedSetId)
    : `scope:${previousSelection.mode}`;
  const groups = buildCombinedSearchDropdownOptions(knownSets);
  const availableValues = [];

  dom.searchSetFilter.innerHTML = '';
  groups.forEach((group) => {
    const options = Array.isArray(group?.options) ? group.options : [];
    if (!options.length) return;

    const optgroup = document.createElement('optgroup');
    optgroup.label = group.label || '';

    options.forEach((entry) => {
      const opt = document.createElement('option');
      opt.value = entry.value;
      opt.textContent = entry.label;
      if (entry.disabled) opt.disabled = true;
      if (entry.mode) opt.dataset.searchMode = entry.mode;
      if (typeof entry.imported === 'boolean') {
        opt.dataset.imported = String(entry.imported);
        if (!entry.imported) {
          opt.classList.add('option-not-imported');
        }
      }
      optgroup.appendChild(opt);
      availableValues.push(entry.value);
    });

    dom.searchSetFilter.appendChild(optgroup);
  });

  const fallbackValue = `scope:${SEARCH_SCOPE_ALL}`;
  dom.searchSetFilter.value = availableValues.includes(desiredValue) ? desiredValue : fallbackValue;

  if (dom.searchScopeMode) {
    dom.searchScopeMode.value = getSearchScopeMode();
  }
}

function renderSearchToolbarMeta({
  rawQuery = '',
  searchScopeMode = SEARCH_SCOPE_IMPORTED,
  resultCount = 0,
  totalCount = resultCount,
  setsProcessed = 0,
  totalSets = 0,
  apiProcessed = 0,
  totalApiSets = 0,
  isSearching = false,
  emptyMessage = '',
} = {}) {
  if (!dom.searchToolbarMeta) return;

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
      statusText = `${safeResultCount || '0'} Ergebnis${safeResultCount === 1 ? '' : 'se'} - Suche läuft${progressSuffix}`;
    } else if (safeResultCount > 0) {
      statusText = `${totalCount} Ergebnis${totalCount === 1 ? '' : 'se'} gefunden`
        + (totalCount > safeResultCount ? ` (erste ${safeResultCount} angezeigt)` : '');
    } else {
      statusText = `Keine Treffer${progressSuffix}`;
    }
  }

  dom.searchToolbarMeta.innerHTML = `
    <span class="search-mode-badge ${modeMeta.className}">${modeMeta.label}</span>
    <span class="search-meta-pill${isSearching ? ' is-live' : ''}">${statusText}</span>
  `;
}

// Sammlungs-Map eines Sets aus dem Cache; null = noch nicht geladen (Haken bleiben bis dahin gesperrt,
// sonst koennte ein Klick eine zweite Zeile neben einer noch nicht gelesenen anlegen).
function cachedSearchCollectionMap(set) {
  const key = `db_${set?.setId}`;
  return cache.has(key) ? cache.get(key) : null;
}

function renderSearchResultsList(results = [], searchScopeMode, options = {}) {
  if (!dom.searchResults) return;

  const {
    rawQuery = '',
    totalCount = Array.isArray(results) ? results.length : 0,
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
    totalCount,
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
          <span class="search-mode-badge ${modeMeta.className}">${modeMeta.label}</span>
        </div>
        <p class="loading-placeholder">Suche laeuft...${progressSuffix}</p>
      `;
      return;
    }

    dom.searchResults.innerHTML = `
      <div class="search-results-head">
        <span class="search-mode-badge ${modeMeta.className}">${modeMeta.label}</span>
      </div>
      <p class="empty-state">Keine Karten fuer "${escapeHtml(rawQuery)}" gefunden (durchsucht: ${totalSets} Sets, ${modeMeta.hint}).</p>
    `;
    return;
  }

  const countLabel = totalCount > safeResults.length
    ? `${totalCount} Ergebnisse (erste ${safeResults.length} angezeigt, Suche verfeinern)`
    : `${safeResults.length} Ergebnis${safeResults.length !== 1 ? 'se' : ''}`;
  dom.searchResults.innerHTML = `
    <div class="search-results-head">
      <p class="search-result-count">${countLabel}</p>
      <span class="search-mode-badge ${modeMeta.className}">${modeMeta.label}</span>
    </div>
  `;

  const frag = document.createDocumentFragment();
  safeResults.forEach(({ card, set, apiOnly }) => {
    const key = collectionKeyOf(card);
    const dbMap = cachedSearchCollectionMap(set);
    frag.appendChild(createSearchResultCard(card, key, dbMap?.get(key), set, apiOnly, {
      collectionPending: Boolean(set?.setName && set?.imported) && !dbMap
    }));
  });

  dom.searchResults.appendChild(frag);
}

// Sammlungs-Maps der importierten Sets mit Treffern laden (max. 4 parallel, Ergebnis im Cache wie bisher).
// Fehler werden nicht als leere Map gecacht: die Haken dieser Karten bleiben dann gesperrt.
async function loadSearchCollectionMaps(sets = [], { isCancelled = () => false } = {}) {
  const queue = [...sets];
  const worker = async () => {
    while (queue.length && !isCancelled()) {
      const set = queue.shift();
      await readCollectionMapCached(set, {
        cache,
        read: readSetCollectionMap,
        ttlMs: CONFIG.CACHE_TTL_MS,
        onError: (err) => console.warn('[runSearch] Sammlung nicht lesbar fuer', set.setId, err?.message || err),
      });
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker));
}

export async function runSearch(options = {}) {
  const { force = false } = options;
  const runId = ++state.searchRunId;
  const isStale = () => runId !== state.searchRunId;
  if (state.searchAbortController) {
    state.searchAbortController.abort();
  }
  const abortController = new AbortController();
  state.searchAbortController = abortController;
  const isCancelled = () => isStale() || abortController.signal.aborted;

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
  // Fr ptcgoCode-Lookup state.allSets nutzen (hat zuverlaessige Daten aus den JSON-Dateien),
  // da state.sets (aus Google Sheets) ptcgoCode leer haben kann.
  const lookupPool = state.allSets?.length ? state.allSets : baseSetsToSearch;
  const structuredQuery = parseStructuredSearchQuery(rawQuery, lookupPool);
  if (!force && !structuredQuery && query.length < 2) {
    state.lastSearchResults = [];
    renderSearchToolbarMeta({
      rawQuery,
      searchScopeMode,
      emptyMessage: 'Mindestens 2 Zeichen eingeben oder Enter druecken.'
    });
    dom.searchResults.innerHTML = '<p class="empty-state">Mindestens 2 Zeichen eingeben oder Enter druecken.</p>';
    return;
  }

  if (force || structuredQuery || rawQuery.length >= 3) {
    window.SEARCH_HISTORY = addSearchHistory(rawQuery);
  }
  // Fr die eigentliche Suche das importierte Set bevorzugen (hat Collection-Daten),
  // fallback auf das Set aus allSets falls nicht importiert.
  const setsToSearch = structuredQuery
    ? [baseSetsToSearch.find((s) => s.setId === structuredQuery.setId) ?? structuredQuery.set]
    : baseSetsToSearch;
  if (!setsToSearch.length) {
    renderSearchToolbarMeta({
      rawQuery,
      searchScopeMode,
      emptyMessage: 'Keine passenden Sets verfuegbar.'
    });
    dom.searchResults.innerHTML = '<p class="empty-state">Keine passenden Sets verfuegbar.</p>';
    return;
  }
  renderSearchResultsList([], searchScopeMode, { rawQuery, totalSets: setsToSearch.length, isSearching: true });

  // Treffer direkt aus api/v3/search-index.json (Name DE/EN, Nummer, Kuenstler, Typen, Seltenheit, Set),
  // ohne Kartendateien je Set. Strukturierte Suche ("SVI 12 Pikachu"): Set-Kuerzel waehlt das Set.
  const indexQuery = structuredQuery
    ? [structuredQuery.cardNumber, ...(structuredQuery.namePart || [])].filter(Boolean).join(' ')
    : rawQuery;
  let hits;
  try {
    hits = await searchFromIndex(indexQuery, {
      sets: setsToSearch,
      setFilter: structuredQuery?.setId || ''
    }, { signal: abortController.signal });
  } catch (err) {
    if (err?.name === 'AbortError' || isCancelled()) return;
    console.warn('[runSearch] search-index nicht verfuegbar:', err?.message || err);
    state.lastSearchResults = [];
    renderSearchToolbarMeta({ rawQuery, searchScopeMode, emptyMessage: 'Suchindex nicht erreichbar.' });
    dom.searchResults.innerHTML = '<p class="empty-state">Suchindex nicht erreichbar - bitte spaeter erneut versuchen.</p>';
    return;
  }
  if (isCancelled()) return;

  // Karten-Objekte nur fuer die gezeigten Treffer bauen.
  const shown = searchResultsForDisplay(hits, { limit: SEARCH_RESULT_RENDER_LIMIT, language: getCardLanguage() })
    .map((result) => ({
      ...result,
      // Karten nicht importierter Sets: Haken loest den Auto-Import aus (pendingSearchSetImport).
      apiOnly: !toBoolean(result.set?.imported)
    }));
  state.lastSearchResults = shown.slice(0, 60);

  const renderShown = () => renderSearchResultsList(shown, searchScopeMode, {
    rawQuery,
    totalCount: hits.length,
    totalSets: setsToSearch.length
  });
  renderShown();
  if (!shown.length) return;

  const pendingSets = [...new Map(shown
    .filter(({ set }) => Boolean(set?.setName && set?.imported) && !cachedSearchCollectionMap(set))
    .map(({ set }) => [set.setId, set])).values()];
  if (!pendingSets.length) return;
  await loadSearchCollectionMaps(pendingSets, { isCancelled });
  if (!isCancelled()) renderShown();
}

function createSearchResultCard(card, key, db, set, apiOnly = false, { collectionPending = false } = {}) {
  const article = document.createElement('article');
  article.className = 'card search-result-card';
  const shownStatus = effectiveCollectionStatus(db);
  if (shownStatus.rh)     article.classList.add('reverse');
  else if (shownStatus.g) article.classList.add('collected');

  const imgWrap = document.createElement('div');
  imgWrap.className = 'card-img-wrap';
  const img = document.createElement('img');
  img.alt = card.name || key;
  img.loading = 'lazy';
  imgWrap.appendChild(img);
  attachImageFallback(img, card);

  const meta    = document.createElement('div'); meta.className = 'meta';
  const setTag  = document.createElement('span'); setTag.className = 'search-set-tag'; setTag.textContent = set.setName;
  const cardLabel = `${card.number} \u2013 ${card.name || '?'}`;
  const title   = document.createElement('div'); title.className = 'title'; title.textContent = cardLabel; title.title = cardLabel;

  const isEditable = Boolean(set?.setName && set?.imported) && !collectionPending;
  const checksDiv = document.createElement('div'); checksDiv.className = 'checks search-checks-bar';
  checksDiv.append(
    actions.makeCheckbox('G', 'g', shownStatus.g, !isEditable),
    actions.makeCheckbox('RH', 'rh', shownStatus.rh, getCollectionUiState(db, { isEditable }).rhDisabled)
  );
  actions.syncSharedLegacyBadge(checksDiv, db);

  const goToSetBtn = document.createElement('button');
  goToSetBtn.type = 'button';
  goToSetBtn.className = 'btn-goto-set';
  goToSetBtn.textContent = '↗';
  goToSetBtn.title = `${set.setName} oeffnen`;
  checksDiv.appendChild(goToSetBtn);
  meta.append(setTag, title, checksDiv);

  if (card.cardmarketUrl) {
    const isFallbackCardmarket = isGeneratedCardmarketSearchUrl(card.cardmarketUrl);
    const cm = document.createElement('a');
    cm.href = card.cardmarketUrl; cm.target = '_blank'; cm.rel = 'noopener noreferrer';
    cm.className = `card-cm-link${isFallbackCardmarket ? ' card-cm-link-fallback' : ''}`;
    cm.textContent = '\uD83D\uDED2 CM';
    cm.title = isFallbackCardmarket ? 'Generierter Cardmarket-Suchlink' : 'Cardmarket-Produktseite';
    meta.appendChild(cm);
    actions.hydrateCardmarketLink(cm, card, { compact: true, preferReverseHolo: Boolean(db?.rh) });
  }

  article.append(imgWrap, meta);

  article.addEventListener('click', async (e) => {
    if (e.target instanceof HTMLElement && e.target.closest('input, a, label, button')) return;
    try {
      await openSearchResultLightbox(card, set, { apiOnly });
    } catch (err) {
      showToast(`Karte konnte nicht geoeffnet werden: ${err.message}`, 'error');
    }
  });

  goToSetBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    navigateToSearchResultSet(set, card);
  });

  if (isEditable) {
    attachSearchResultCheckboxListeners(article, db, key, set, card);
  }

  return article;
}

function attachSearchResultCheckboxListeners(article, dbEntry, key, set, card) {
  const gInput  = article.querySelector('input[data-type="g"]');
  const rhInput = article.querySelector('input[data-type="rh"]');
  const db = dbEntry || emptyCollectionEntry(card, key);

  async function ensureDbEntry() {
    await actions.ensureWritableCollectionEntry(set, db, key);
    // Neu angelegte Eintraege in der gecachten Sammlungs-Map des Sets fuehren (Suche/Set-Ansicht).
    const cachedMap = cache.get(`db_${set.setId}`);
    if (cachedMap instanceof Map) cachedMap.set(key, db);
    return db;
  }

  function updateSearchCardState() {
    actions.syncCollectionCheckboxUi(gInput, rhInput, db, { isEditable: true });
    const status = effectiveCollectionStatus(db);
    article.classList.toggle('reverse',   status.rh);
    article.classList.toggle('collected', status.g && !status.rh);
    actions.syncSharedLegacyBadge(article.querySelector('.checks'), db);
    const cm = article.querySelector('.card-cm-link');
    if (cm) {
      actions.hydrateCardmarketLink(cm, card, { compact: true, preferReverseHolo: Boolean(db?.rh) });
    }
  }

  gInput.addEventListener('change', async () => {
    if (state.bulkMode) { gInput.checked = !gInput.checked; return; }
    const checked = gInput.checked;
    const prevState = { g: Boolean(db?.g), rh: Boolean(db?.rh) };
    setCardSaveState(article, 'saving');
    beginTrackedWrite(`Karte #${db?.displayId || key} speichern`);
    try {
      await ensureDbEntry();
      const nextState = resolveCollectionToggleState(db, { isG: true, checked });
      await actions.writeCollectionEntryState(set.setName, db, nextState);
      updateSearchCardState();
      pushUndoEntry({
        setId: set?.setId,
        setName: set?.setName,
        label: 'Kartenstatus geaendert',
        changes: [{ key, prev: prevState, next: { g: Boolean(db.g), rh: Boolean(db.rh) } }]
      });
      updateUndoUi();
      setCardSaveState(article, 'saved');
      finishTrackedWrite(`Karte #${db?.displayId || key} speichern`, null);
    } catch (err) {
      actions.reportCollectionWriteError(err);
      gInput.checked = !checked;
      setCardSaveState(article, 'error');
      finishTrackedWrite(`Karte #${db?.displayId || key} speichern`, err);
    }
  });

  rhInput.addEventListener('change', async () => {
    if (state.bulkMode) { rhInput.checked = !rhInput.checked; return; }
    const checked = rhInput.checked;
    const prevState = { g: Boolean(db?.g), rh: Boolean(db?.rh) };
    setCardSaveState(article, 'saving');
    beginTrackedWrite(`Karte #${db?.displayId || key} RH speichern`);
    try {
      await ensureDbEntry();
      if (!db?.rhCell) { rhInput.checked = false; setCardSaveState(article, ''); finishTrackedWrite(`Karte #${db?.displayId || key} RH speichern`, null); return; }
      const nextState = resolveCollectionToggleState(db, { isG: false, checked });
      await actions.writeCollectionEntryState(set.setName, db, nextState);
      updateSearchCardState();
      pushUndoEntry({
        setId: set?.setId,
        setName: set?.setName,
        label: 'RH-Status geaendert',
        changes: [{ key, prev: prevState, next: { g: Boolean(db.g), rh: Boolean(db.rh) } }]
      });
      updateUndoUi();
      setCardSaveState(article, 'saved');
      finishTrackedWrite(`Karte #${db?.displayId || key} RH speichern`, null);
    } catch (err) {
      actions.reportCollectionWriteError(err);
      rhInput.checked = !checked;
      setCardSaveState(article, 'error');
      finishTrackedWrite(`Karte #${db?.displayId || key} RH speichern`, err);
    }
  });
}

export function navigateToSearchResultSet(set, card = null) {
  if (!set?.setId) return;
  const resolvedSet = actions.getSetById(set.setId) || set;
  state.pendingSearchSetImport = Boolean(!resolvedSet?.imported);
  state.pendingSearchCardFocusKey = card ? (collectionKeyOf(card) || null) : null;
  actions.ensureSetSelectorOption(resolvedSet);
  dom.selector.value = resolvedSet.setId;

  const targetHash = `#set/${resolvedSet.setId}`;
  if (window.location.hash === targetHash) {
    showView('set');
    actions.loadCurrentSet(false);
    return;
  }

  navigate(`set/${resolvedSet.setId}`);
}

export async function openSearchResultLightbox(card, set, { apiOnly = false } = {}) {
  if (!set?.setId || !card) return;

  const searchScopeMode = getSearchScopeMode();
  const searchCacheKey = `${set.setId}::${searchScopeMode}`;

  // Karten aus api/v3 (massgeblich), db_cards nur als Offline-Fallback.
  const [cards, dbMap] = await Promise.all([
    state.searchCache.has(searchCacheKey)
      ? state.searchCache.get(searchCacheKey)
      : actions.loadSetCardsV3First(set.setId).then(({ cards: loadedCards, error }) => {
        if (!loadedCards.length && error) throw new Error(describeCardDataFailure(error));
        state.searchCache.set(searchCacheKey, loadedCards);
        return loadedCards;
      }),
    // Lesefehler: leere Map nur fuer diese Ansicht, nicht im Cache (wie bei den Suchergebnissen).
    readCollectionMapCached(set, {
      cache,
      read: readSetCollectionMap,
      ttlMs: CONFIG.CACHE_TTL_MS,
      onError: (err) => console.warn('[openSearchResultLightbox] Sammlung nicht lesbar fuer', set.setId, err?.message || err),
    }).then((loadedDbMap) => loadedDbMap || new Map())
  ]);

  if (!Array.isArray(cards) || cards.length === 0) {
    showToast('Keine Kartendaten fuer dieses Set gefunden.', 'info', 4500);
    return;
  }

  const targetKey = collectionKeyOf(card);
  const targetIndex = cards.findIndex((item) => collectionKeyOf(item) === targetKey);
  if (targetIndex < 0) return;

  state.currentSet = set;
  syncRefreshControls();
  state.cards = cards;
  state.dbMap = dbMap;
  state.lightboxIndex = targetIndex;
  state.pendingSearchSetImport = Boolean(apiOnly || !set?.imported);

  actions.openLightbox(targetIndex);
}

function shouldDismissMobileSearchKeyboard() {
  try {
    return Boolean(
      window.matchMedia?.('(pointer: coarse)')?.matches
      || /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent || '')
    );
  } catch {
    return false;
  }
}

function dismissSearchAutocomplete({ blurInput = false } = {}) {
  const list = document.getElementById('search-autocomplete');
  if (list) {
    list.classList.add('hidden');
  }

  if (blurInput && dom.searchInput && typeof dom.searchInput.blur === 'function') {
    window.requestAnimationFrame(() => dom.searchInput?.blur());
  }
}

export function initSearch() {
  let debounce;
  dom.searchInput.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => runSearch(), SEARCH_INPUT_DEBOUNCE_MS);
  });
  dom.searchSetFilter.addEventListener('change', () => {
    if (dom.searchScopeMode) {
      dom.searchScopeMode.value = getSearchScopeMode();
    }
    state.searchCache.clear();
    runSearch({ force: true });
  });
  dom.searchScopeMode?.addEventListener('change', () => {
    const selectedMode = String(dom.searchScopeMode?.value || SEARCH_SCOPE_IMPORTED);
    renderSearchSetFilterOptions();
    if (dom.searchSetFilter) {
      dom.searchSetFilter.value = `scope:${selectedMode}`;
    }
    state.searchCache.clear();
    runSearch({ force: true });
  });
  dom.searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(debounce);
      dismissSearchAutocomplete({ blurInput: shouldDismissMobileSearchKeyboard() });
      runSearch({ force: true });
    }
  });
}

let autocompleteInitialized = false;

const AUTOCOMPLETE_HIDE_DELAY_MS = 220;

// Eingabefeld, Liste, Auswahlindex, Trefferliste und Ausblend-Timer des Autocompletes liegen in einem
// Zustandsobjekt, das alle Teilfunktionen gemeinsam nutzen (vorher Closure-Variablen in initSearchAutocomplete).
function createAutocompleteState(input, list) {
  return { input, list, selectedIndex: -1, activeItems: [], hideTimer: null };
}

// Lokale Variante ohne &#39; (Verhalten wie zuvor); die globale escapeHtml escaped zusaetzlich das Apostroph.
function escapeAutocompleteHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function clearAutocompleteHideTimer(ac) {
  if (ac.hideTimer) {
    clearTimeout(ac.hideTimer);
    ac.hideTimer = null;
  }
}

function hideAutocompleteList(ac) {
  clearAutocompleteHideTimer(ac);
  ac.list.classList.add('hidden');
}

function scheduleAutocompleteHide(ac) {
  clearAutocompleteHideTimer(ac);
  ac.hideTimer = setTimeout(() => {
    ac.list.classList.add('hidden');
  }, AUTOCOMPLETE_HIDE_DELAY_MS);
}

function pushAutocompleteCandidate(map, candidate, score = 0) {
  if (!candidate?.key || !candidate?.label) return;
  const label = sanitizeDisplayText(candidate.label);
  if (!label) return;
  const meta = sanitizeDisplayText(candidate.meta || '');
  const badge = sanitizeDisplayText(candidate.badge || '');

  const existing = map.get(candidate.key);
  if (!existing || score > existing.score) {
    map.set(candidate.key, {
      ...candidate,
      label,
      meta,
      badge,
      score
    });
  }
}

function addHistoryCandidates(entries, history, normalizedQuery) {
  history
    .filter((item) => !normalizedQuery || normalizeSearchText(item).includes(normalizedQuery))
    .slice(0, normalizedQuery ? 4 : 6)
    .forEach((item, idx) => {
      pushAutocompleteCandidate(entries, {
        key: `history:${normalizeSearchText(item)}`,
        label: item,
        value: item,
        badge: 'Zuletzt',
        meta: 'Vorherige Suche',
        type: 'history'
      }, 120 - idx);
    });
}

function addSetCandidates(entries, normalizedQuery) {
  const setsPool = getSetsForSearchMode(getSearchScopeMode());
  (Array.isArray(setsPool) ? setsPool : []).forEach((set) => {
    const label = String(set?.setName || set?.tcgdex_name || set?.vera_name || set?.setId || '').trim();
    if (!label) return;

    const haystackValues = collectSearchStrings([
      label,
      set?.setId,
      set?.series,
      set?.vera_series,
      set?.tcgdex_serie_name,
      set?.ptcgoCode,
      set?.vera_ptcgoCode,
      set?.tcgdex_abbreviation_official,
      set?.vera_name,
      set?.tcgdex_name
    ]);
    const haystack = haystackValues.join(' ');
    if (normalizedQuery && !haystack.includes(normalizedQuery)) return;

    const labelNorm = normalizeSearchText(label);
    let score = 70;
    if (labelNorm === normalizedQuery) score += 180;
    else if (labelNorm.startsWith(normalizedQuery)) score += 130;
    else if (labelNorm.includes(normalizedQuery)) score += 95;

    pushAutocompleteCandidate(entries, {
      key: `set:${set?.setId || labelNorm}`,
      label,
      value: label,
      badge: set?.ptcgoCode || set?.setId || 'Set',
      meta: set?.series || set?.tcgdex_serie_name || 'Set',
      type: 'set',
      setId: set?.setId || ''
    }, score);
  });
}

// Karten aus letzter Suche, aktuellem Set und Such-Cache (hoechstens 800 Cache-Karten) mit ihrem Set.
function collectCardBundles() {
  const cardBundles = [];
  const pushCardBundle = (card, set) => {
    if (!card) return;
    cardBundles.push({ card, set: set || null });
  };

  (Array.isArray(state.lastSearchResults) ? state.lastSearchResults : []).forEach((entry) => {
    pushCardBundle(entry?.card, entry?.set);
  });

  if (Array.isArray(state.cards) && state.currentSet) {
    state.cards.forEach((card) => pushCardBundle(card, state.currentSet));
  }

  let inspectedCards = 0;
  state.searchCache?.forEach((cards, key) => {
    if (inspectedCards >= 800) return;
    const setId = String(key || '').split('::')[0];
    const setMeta = (state.allSets || state.sets || []).find((entry) => String(entry?.setId || '') === setId) || null;
    (Array.isArray(cards) ? cards : []).slice(0, 40).forEach((card) => {
      if (inspectedCards >= 800) return;
      inspectedCards += 1;
      pushCardBundle(card, setMeta);
    });
  });
  return cardBundles;
}

function addCardCandidates(entries, cardBundles, normalizedQuery) {
  const seenCards = new Set();
  cardBundles.forEach(({ card, set }) => {
    const uniqueKey = `${set?.setId || 'unknown'}::${normalizeCardNumber(card?.number || card?.vera_number || card?.tcgdex_localId || '')}`;
    if (!card?.name || seenCards.has(uniqueKey)) return;
    seenCards.add(uniqueKey);

    const label = String(card?.name || card?.tcgdex_name || card?.vera_name || '').trim();
    if (!label) return;

    const nameValues = collectSearchStrings([card?.name, card?.vera_name, card?.tcgdex_name]);
    const haystack = collectSearchStrings([
      label,
      card?.number,
      card?.vera_number,
      card?.tcgdex_localId,
      nameValues,
      set?.setName,
      set?.series,
      set?.ptcgoCode
    ]).join(' ');
    if (normalizedQuery && !haystack.includes(normalizedQuery)) return;

    const labelNorm = normalizeSearchText(label);
    let score = 60;
    if (labelNorm === normalizedQuery) score += 200;
    else if (labelNorm.startsWith(normalizedQuery)) score += 150;
    else if (labelNorm.includes(normalizedQuery)) score += 105;
    if (cardNumberMatchesQuery(card?.number, normalizedQuery)) score += 120;

    const altNames = nameValues.filter((value) => value !== labelNorm).slice(0, 2);
    const metaParts = [
      set?.setName || set?.series || '',
      altNames.length ? `Alias: ${altNames.join(' - ')}` : ''
    ].filter(Boolean);

    pushAutocompleteCandidate(entries, {
      key: `card:${uniqueKey}`,
      label,
      value: label,
      badge: card?.number || card?.tcgdex_localId || 'Karte',
      meta: metaParts.join(' - '),
      type: 'card',
      setId: set?.setId || ''
    }, score);
  });
}

// Eingabe -> bis zu 10 Vorschlaege (Verlauf, Sets, Karten), nach Score und Label sortiert.
function buildAutocompleteCandidates(query) {
  const normalizedQuery = normalizeSearchText(query).trim();
  const entries = new Map();
  const history = Array.isArray(window.SEARCH_HISTORY) ? window.SEARCH_HISTORY : loadSearchHistory();

  addHistoryCandidates(entries, history, normalizedQuery);
  addSetCandidates(entries, normalizedQuery);
  addCardCandidates(entries, collectCardBundles(), normalizedQuery);

  return [...entries.values()]
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return String(left.label || '').localeCompare(String(right.label || ''), 'de', { sensitivity: 'base' });
    })
    .slice(0, 10);
}

function renderAutocompleteList(ac, items) {
  ac.activeItems = items;
  ac.selectedIndex = -1;
  if (!items.length) {
    ac.list.classList.add('hidden');
    ac.list.innerHTML = '';
    return;
  }

  ac.list.innerHTML = items.map((item, idx) => {
    const safeLabel = sanitizeDisplayText(item.label);
    const safeMeta = sanitizeDisplayText(item.meta || '');
    const safeBadge = sanitizeDisplayText(item.badge || '');
    return `
      <li class="search-ac-item search-ac-item--${escapeAutocompleteHtml(item.type)}" role="option" data-idx="${idx}">
        <span class="ac-main">
          <span class="ac-label">${escapeAutocompleteHtml(safeLabel)}</span>
          ${safeMeta ? `<small class="ac-meta">${escapeAutocompleteHtml(safeMeta)}</small>` : ''}
        </span>
        <span class="ac-badge">${escapeAutocompleteHtml(safeBadge)}</span>
      </li>
    `;
  }).join('');
  ac.list.classList.remove('hidden');
}

function applyAutocompleteSelection(ac, item) {
  if (!item) return;
  clearAutocompleteHideTimer(ac);
  if (item.setId && dom.searchSetFilter) {
    const hasOption = [...dom.searchSetFilter.options].some((option) => option.value === item.setId);
    if (hasOption) dom.searchSetFilter.value = item.setId;
  }
  ac.input.value = item.value || item.label || '';
  ac.list.classList.add('hidden');
  window.SEARCH_HISTORY = addSearchHistory(ac.input.value);
  runSearch({ force: true });
  ac.input.focus();
}

function handleAutocompleteKeydown(ac, event) {
  if (ac.list.classList.contains('hidden') && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
    renderAutocompleteList(ac, buildAutocompleteCandidates(ac.input.value));
  }

  const items = [...ac.list.querySelectorAll('.search-ac-item')];
  if (!items.length || ac.list.classList.contains('hidden')) {
    if (event.key === 'Escape') hideAutocompleteList(ac);
    if (event.key === 'Enter') dismissSearchAutocomplete({ blurInput: shouldDismissMobileSearchKeyboard() });
    return;
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    ac.selectedIndex = Math.min(ac.selectedIndex + 1, items.length - 1);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    ac.selectedIndex = Math.max(ac.selectedIndex - 1, 0);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    if (ac.selectedIndex >= 0) {
      applyAutocompleteSelection(ac, ac.activeItems[ac.selectedIndex]);
    } else {
      dismissSearchAutocomplete({ blurInput: shouldDismissMobileSearchKeyboard() });
    }
    return;
  } else if (event.key === 'Escape') {
    hideAutocompleteList(ac);
    return;
  } else {
    return;
  }

  items.forEach((item, idx) => item.classList.toggle('keyboard-focus', idx === ac.selectedIndex));
}

function bindAutocompleteInputEvents(ac) {
  const { input, list } = ac;
  input.addEventListener('focus', () => {
    clearAutocompleteHideTimer(ac);
    renderAutocompleteList(ac, buildAutocompleteCandidates(input.value));
  });

  input.addEventListener('input', () => {
    clearAutocompleteHideTimer(ac);
    renderAutocompleteList(ac, buildAutocompleteCandidates(input.value));
  });

  input.addEventListener('blur', () => scheduleAutocompleteHide(ac));
  list.addEventListener('pointerenter', () => clearAutocompleteHideTimer(ac));
  list.addEventListener('pointerleave', () => {
    if (document.activeElement !== input) scheduleAutocompleteHide(ac);
  });

  input.addEventListener('keydown', (event) => handleAutocompleteKeydown(ac, event));
}

function bindAutocompleteListEvents(ac) {
  const { input, list } = ac;
  list.addEventListener('mousedown', (event) => {
    const item = event.target.closest('.search-ac-item');
    if (!item) return;
    event.preventDefault();
    const idx = Number(item.dataset.idx || '-1');
    applyAutocompleteSelection(ac, ac.activeItems[idx]);
  });

  document.addEventListener('pointerdown', (event) => {
    if (!input.contains(event.target) && !list.contains(event.target)) {
      scheduleAutocompleteHide(ac);
    } else {
      clearAutocompleteHideTimer(ac);
    }
  });
}

export function initSearchAutocomplete() {
  if (autocompleteInitialized) return;
  autocompleteInitialized = true;

  const input = document.getElementById('search-input');
  const list = document.getElementById('search-autocomplete');
  if (!input || !list) return;

  const ac = createAutocompleteState(input, list);
  bindAutocompleteInputEvents(ac);
  bindAutocompleteListEvents(ac);
}
