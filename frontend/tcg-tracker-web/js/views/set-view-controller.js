/**
 * Set View Controller
 * Handles all set detail view logic: card rendering, filters, sorting, lightbox, collection toggles
 *
 * Dependencies injected:
 * - state (app state object)
 * - dom (DOM element map)
 * - config (CONFIG object)
 * - utilsAndHelpers (normalization, formatting, etc.)
 *
 * Exports:
 * - initSetViewController (setup phase)
 * - loadCurrentSet, renderCards, renderLightbox, etc.
 */

import { isGeneratedCardmarketSearchUrl, applyReverseHoloQueryParam } from '../data/cardmarket-url-utils.js';
import { sanitizeDisplayText } from '../core/display-text.js';

let focusedCardIndex = -1;
const cardmarketPriceSummaryCache = new Map();
const cardmarketPriceSummaryPending = new Map();

/**
 * Leert die Cardmarket-Price-Caches, die in der Set-View gehalten werden.
 * Wird nach einem täglichen Cardmarket-Build-Wechsel aufgerufen, damit
 * die UI keine veralteten Preise mehr anzeigt.
 */
export function resetCardmarketPriceCaches() {
  cardmarketPriceSummaryCache.clear();
  cardmarketPriceSummaryPending.clear();
}

export function isPointerInsideElement(eventLike, element) {
  if (!element || typeof element.getBoundingClientRect !== 'function') return false;
  const x = Number(eventLike?.clientX);
  const y = Number(eventLike?.clientY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const rect = element.getBoundingClientRect();
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

/**
 * Setup all set-view event listeners and initializers
 */
export function initSetViewController(injections = {}) {
  const {
    state,
    dom,
    CONFIG,
    // utils
    normalizeCardNumber,
    showToast,
    setLoading,
    setGlobalStatus,
    navigate,
    // data functions
    readDbCardsForSet,
    readSetCollectionMap,
    updateCellBoolean,
    ensureCollectionEntry,
    fetchMergedCardsWithSetMeta,
    writeSetting,
    // cache
    cache,
    // filters/helpers
    applyFilter,
    updateStats,
    getSearchScopeMode,
    SEARCH_SCOPE_ONLINE,
    // ui helpers
    setEmptyState,
    showView,
    broadcastRealtimeCardUpdate,
    // settings
    getCollectionUiState,
    resolveCollectionToggleState,
    shouldAutoImportForCollectionToggle,
    // cardmarket
    resolveCardmarketEntryForCard,
    buildCardmarketProductUrl,
    // dom updates
    syncRefreshControls,
    syncSetNavLink,
    sanitizeSetAssetUrl,
    attachSetAssetFallback,
    attachImageFallback,
    markSetAsRecent,
    ensureSetSelectorOption,
    getSetById,
    needsApiCardEnrichment,
    mergeSearchCards,
    // audit/undo
    pushUndoEntry,
    updateUndoUi,
    // realtime
    applyIncomingRealtimeUpdate,
    // other
    formatCardmarketEntryLabel,
    formatCardmarketEntryTitle,
    isAuthError,
    signOut,
    resetToLoggedOut
  } = injections;

  // Selector change → load set
  dom.selector?.addEventListener('change', () => {
    const setId = dom.selector.value;
    if (setId) {
      navigate(`set/${setId}`);
      return;
    }
    state.currentSet = null;
    state.cards = [];
    state.dbMap = new Map();
    syncRefreshControls?.();
    syncSetNavLink?.(null);
    dom.cards.innerHTML = '';
    dom.statsSection?.classList.add('hidden');
    dom.filterSection?.classList.add('hidden');
    dom.sortSection?.classList.add('hidden');
    dom.setLogoWrap?.classList.add('hidden');
    setEmptyState?.(true);
  });

  // Load button
  dom.load?.addEventListener('click', async () => {
    const setId = dom.selector.value;
    if (setId) {
      navigate(`set/${setId}`);
      await loadCurrentSet(injections, false);
    }
  });

  // Refresh button
  dom.refresh?.addEventListener('click', async () => {
    const setId = state.currentSet?.setId;
    if (setId) {
      await loadCurrentSet(injections, true);
    }
  });

  // Lightbox
  initLightbox(injections);

  // Bulk edit
  initBulkEdit(injections);

  // Keyboard nav
  initKeyboardNav(injections);

  // Export missing
  dom.btnMissingExport?.addEventListener('click', () => exportMissingCards(injections));
}

/**
 * Load a set's cards and collection map
 */
export async function loadCurrentSet(injections = {}, forceRefresh = false) {
  const {
    state,
    dom,
    CONFIG,
    normalizeCardNumber,
    showToast,
    setLoading,
    setGlobalStatus,
    navigate,
    readDbCardsForSet,
    readSetCollectionMap,
    writeSetting,
    fetchMergedCardsWithSetMeta,
    cache,
    applyFilter,
    updateStats,
    getSearchScopeMode,
    SEARCH_SCOPE_ONLINE,
    setEmptyState,
    syncRefreshControls,
    syncSetNavLink,
    sanitizeSetAssetUrl,
    attachSetAssetFallback,
    markSetAsRecent,
    ensureSetSelectorOption,
    getSetById,
    needsApiCardEnrichment,
    mergeSearchCards,
    isAuthError,
    signOut,
    resetToLoggedOut
  } = injections;

  const setId = dom.selector.value;
  if (!setId) return;

  const selected = state.sets.find((s) => s.setId === setId) || getSetById?.(setId);
  if (!selected) return;

  ensureSetSelectorOption?.(selected);
  state.currentSet = selected;
  syncRefreshControls?.();
  sessionStorage.setItem('tcg_last_set', setId);
  syncSetNavLink?.(selected);

  setGlobalStatus?.(`Lade ${selected.setName}…`);
  setLoading?.(true, `Lade ${selected.setName}…`);

  const safeSetLogoUrl = sanitizeSetAssetUrl?.(selected.logoUrl, selected.setId);
  const safeSetSymbolUrl = sanitizeSetAssetUrl?.(selected.symbolUrl, selected.setId);

  if (safeSetLogoUrl && dom.setLogo) {
    attachSetAssetFallback?.(dom.setLogo, './assets/pokeball-fallback.svg', selected.logoUrlCandidates);
    dom.setLogo.style.display = '';
    dom.setLogo.src = safeSetLogoUrl;

    if (safeSetSymbolUrl && dom.setSymbol) {
      attachSetAssetFallback?.(dom.setSymbol, '', selected.symbolUrlCandidates);
      dom.setSymbol.style.display = '';
      dom.setSymbol.src = safeSetSymbolUrl;
    } else if (dom.setSymbol) {
      dom.setSymbol.style.display = 'none';
      dom.setSymbol.removeAttribute('src');
    }
    dom.setLogoWrap?.classList.remove('hidden');
  } else {
    dom.setLogoWrap?.classList.add('hidden');
  }

  try {
    const cardsCacheKey = `db_cards_${setId}`;
    const dbCacheKey = `db_${setId}`;
    const allowApiFallback = getSearchScopeMode?.() === SEARCH_SCOPE_ONLINE || Boolean(state.pendingSearchSetImport) || !Boolean(selected.imported);

    if (forceRefresh) {
      cache?.del?.(cardsCacheKey);
      cache?.del?.(dbCacheKey);
    }

    const [cards, dbMap] = await Promise.all([
      cache?.has?.(cardsCacheKey)
        ? cache?.get?.(cardsCacheKey)
        : readDbCardsForSet?.(setId).then(async (dbCards) => {
          if (Array.isArray(dbCards) && dbCards.length > 0) {
            const shouldHydrateFromApi = allowApiFallback || needsApiCardEnrichment?.(dbCards);
            if (!shouldHydrateFromApi) {
              cache?.set?.(cardsCacheKey, dbCards, CONFIG.CACHE_TTL_MS);
              return dbCards;
            }

            const apiPayload = await fetchMergedCardsWithSetMeta?.(setId).catch(() => ({ cards: [], setMetaPatch: null }));
            const apiCards = Array.isArray(apiPayload?.cards) ? apiPayload.cards : [];
            const mergedCards = apiCards.length > 0 ? mergeSearchCards?.(dbCards, apiCards) : dbCards;
            cache?.set?.(cardsCacheKey, mergedCards, CONFIG.CACHE_TTL_MS);
            return mergedCards;
          }

          if (allowApiFallback) {
            const apiPayload = await fetchMergedCardsWithSetMeta?.(setId).catch(() => ({ cards: [], setMetaPatch: null }));
            const apiCards = Array.isArray(apiPayload?.cards) ? apiPayload.cards : [];
            if (apiCards.length > 0) {
              cache?.set?.(cardsCacheKey, apiCards, CONFIG.CACHE_TTL_MS);
            }
            return apiCards;
          }
          return [];
        }),
      cache?.has?.(dbCacheKey)
        ? cache?.get?.(dbCacheKey)
        : readSetCollectionMap?.(selected.setName).then((m) => { cache?.set?.(dbCacheKey, m, CONFIG.CACHE_TTL_MS); return m; })
    ]);

    if (!Array.isArray(cards) || cards.length === 0) {
      throw new Error('Keine Kartendaten in der Datenbank gefunden. Bitte Set importieren/aktualisieren oder API-Fallback aktivieren.');
    }

    state.cards = cards;
    state.dbMap = dbMap;
    state.pendingSearchSetImport = false;
    focusedCardIndex = -1;

    if (state.bulkMode) toggleBulkMode(injections, false);

    state.filter = 'all';
    dom.cardSort.value = 'number';
    state.sortOrder = 'number';
    document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
    document.querySelector('.filter-btn[data-filter="all"]')?.classList.add('active');

    renderCards(injections);
    await writeSetting?.('lastSetId', setId);
    markSetAsRecent?.(selected);
    setGlobalStatus?.(`${selected.setName}: ${cards.length} Karten.`);

    if (!forceRefresh) showToast?.(`${selected.setName} geladen`, 'success', 2000);
  } catch (err) {
    console.error('[loadCurrentSet]', err);
    if (isAuthError?.(err)) {
      showToast?.('Sitzung abgelaufen. Bitte erneut mit Google anmelden.', 'error', 6000);
      try { signOut?.(); } catch {}
      resetToLoggedOut?.();
      return;
    }
    showToast?.(`Fehler beim Laden: ${err.message}`, 'error');
    setGlobalStatus?.('Fehler beim Laden.');
    state.cards = [];
    state.dbMap = new Map();
    setEmptyState?.(true);
  } finally {
    setLoading?.(false);
  }
}

/**
 * Render all cards in the current set
 */
export function renderCards(injections = {}) {
  const { state, dom, normalizeCardNumber, applyFilter, updateStats, setEmptyState } = injections;

  dom.cards.innerHTML = '';
  if (!state.cards.length) {
    setEmptyState?.(true);
    return;
  }

  setEmptyState?.(false);
  const fragment = document.createDocumentFragment();
  state.cards.forEach((card, index) => {
    const key = normalizeCardNumber(card.number);
    const db = state.dbMap.get(key);
    fragment.appendChild(createCardElement(card, key, db, index, injections));
  });

  dom.cards.appendChild(fragment);
  applyFilter?.();
  updateStats?.();
  revealPendingSearchCardFocus(injections);
}

/**
 * Create a single card DOM element
 */
function createCardElement(card, key, db, index, injections = {}) {
  const {
    state,
    dom,
    normalizeCardNumber,
    attachImageFallback,
    buildCardmarketProductUrl
  } = injections;

  const dbEntry = db || {
    displayId: card.number,
    g: false,
    rh: false,
    gCell: null,
    rhCell: null
  };
  const isEditable = Boolean(state.currentSet?.setName);

  const article = document.createElement('article');
  article.className = 'card';
  article.dataset.cardId = key;
  article.dataset.cardIndex = index;
  article.setAttribute('role', 'listitem');
  article.setAttribute('tabindex', '-1');

  if (dbEntry?.rh) article.classList.add('reverse');
  else if (dbEntry?.g) article.classList.add('collected');

  // Image
  const imgWrap = document.createElement('div');
  imgWrap.className = 'card-img-wrap';
  imgWrap.addEventListener('click', (e) => {
    if (state.bulkMode) return;
    e.stopPropagation();
    openLightbox(injections, index);
  });

  const img = document.createElement('img');
  const cardImage = String(card.image || '').trim();
  if (cardImage) img.src = cardImage;
  else img.removeAttribute('src');
  img.alt = card.name || key;
  img.loading = 'lazy';
  attachImageFallback?.(img, card, state.currentSet?.setId || '');
  imgWrap.appendChild(img);

  // Bulk overlay
  const overlay = document.createElement('div');
  overlay.className = 'bulk-overlay';
  const checkMark = document.createElement('span');
  checkMark.className = 'bulk-check';
  checkMark.textContent = '✓';
  overlay.appendChild(checkMark);
  imgWrap.appendChild(overlay);

  const meta = document.createElement('div');
  meta.className = 'meta';

  const titleDiv = document.createElement('div');
  titleDiv.className = 'title';
  titleDiv.textContent = `${card.number} – ${card.name || 'Unbekannt'}`;

  const checksDiv = document.createElement('div');
  checksDiv.className = 'checks';
  checksDiv.append(
    makeCheckbox(injections, 'G', 'g', dbEntry?.g ?? false, !isEditable),
    makeCheckbox(injections, 'RH', 'rh', dbEntry?.rh ?? false, !isEditable || !dbEntry?.rhCell)
  );

  meta.append(titleDiv, checksDiv);

  if (card.cardmarketUrl) {
    const isFallbackCardmarket = isGeneratedCardmarketSearchUrl(card.cardmarketUrl);
    const cm = document.createElement('a');
    cm.href = card.cardmarketUrl;
    cm.target = '_blank';
    cm.rel = 'noopener noreferrer';
    cm.className = `card-cm-link${isFallbackCardmarket ? ' card-cm-link-fallback' : ''}`;
    cm.textContent = '🛒 CM';
    cm.title = isFallbackCardmarket ? 'Generierter Cardmarket-Suchlink' : 'Cardmarket-Produktseite';
    meta.appendChild(cm);
    hydrateCardmarketLink(injections, cm, card, { compact: true, preferReverseHolo: Boolean(dbEntry?.rh) });
  }

  article.append(imgWrap, meta);
  if (isEditable) attachCheckboxListeners(injections, article, dbEntry, key);

  article.addEventListener('click', (e) => {
    const target = e.target;
    if (target instanceof HTMLElement && target.closest('input, a, label')) return;

    if (!state.bulkMode) {
      openLightbox(injections, index);
      return;
    }

    toggleBulkSelect(injections, article, key);
    e.stopPropagation();
  });

  return article;
}

/**
 * Make a checkbox label+input
 */
function makeCheckbox(injections, labelText, type, checked, disabled) {
  const label = document.createElement('label');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.dataset.type = type;
  input.checked = checked;
  input.disabled = disabled;
  label.append(input, ` ${labelText}`);
  return label;
}

/**
 * Attach change listeners to card checkboxes (G/RH toggles)
 */
function attachCheckboxListeners(injections = {}, article, db, key) {
  const {
    state,
    dom,
    CONFIG,
    normalizeCardNumber,
    showToast,
    setLoading,
    setCardSaveState,
    updateCardState,
    updateStats,
    applyFilter,
    beginTrackedWrite,
    finishTrackedWrite,
    updateCellBoolean,
    ensureCollectionEntry,
    readSetCollectionMap,
    fetchMergedCardsWithSetMeta,
    cache,
    resolveCollectionToggleState,
    shouldAutoImportForCollectionToggle,
    getCollectionUiState,
    pushUndoEntry,
    updateUndoUi,
    broadcastRealtimeCardUpdate,
    ensureSetImportedFromApi
  } = injections;

  const gInput = article.querySelector('input[data-type="g"]');
  const rhInput = article.querySelector('input[data-type="rh"]');

  async function ensureDbEntry({ checked = false, source = 'set-view' } = {}) {
    const shouldAutoImport = shouldAutoImportForCollectionToggle?.({
      checked,
      pendingSearchSetImport: state.pendingSearchSetImport,
      currentSetImported: state.currentSet?.imported
    });

    if (shouldAutoImport) {
      const setToImport = state.currentSet;
      const setId = String(setToImport?.setId || '').trim();
      if (!setId) {
        throw new Error('Set-ID für den automatischen Import fehlt.');
      }

      setLoading?.(true, `Importiere ${setToImport.setName}…`);
      try {
        const importPayload = await fetchMergedCardsWithSetMeta?.(setId).catch(() => ({ cards: [], setMetaPatch: null }));
        const importCards = Array.isArray(importPayload?.cards) ? importPayload.cards : [];
        if (!importCards.length) {
          throw new Error('Keine Kartendaten für den automatischen Set-Import gefunden.');
        }

        const refreshedSet = await ensureSetImportedFromApi?.(setToImport, importCards, {
          setMetaPatch: importPayload?.setMetaPatch || null,
          showSuccessToast: true,
          successMessage: `${setToImport.setName} wurde automatisch importiert.`,
          source
        });

        state.currentSet = refreshedSet || { ...setToImport, imported: true };
        state.pendingSearchSetImport = false;
        state.dbMap = await readSetCollectionMap?.(state.currentSet.setName).catch(() => new Map());
        cache?.set?.(`db_${setId}`, state.dbMap, CONFIG.CACHE_TTL_MS);
        db = state.dbMap.get(key) || db;
      } finally {
        setLoading?.(false);
      }
    }

    if (db?.gCell && db?.rhCell) return db;
    const ensured = await ensureCollectionEntry?.(state.currentSet.setName, db?.displayId || key);
    db.g = Boolean(db?.g);
    db.rh = Boolean(db?.rh && db?.g);
    db.gCell = ensured.gCell;
    db.rhCell = ensured.rhCell;
    db.displayId = ensured.displayId || db.displayId || key;
    state.dbMap.set(key, db);
    return db;
  }

  gInput?.addEventListener('change', async () => {
    if (state.bulkMode) {
      gInput.checked = !gInput.checked;
      return;
    }
    const checked = gInput.checked;
    const prevState = { g: Boolean(db?.g), rh: Boolean(db?.rh) };
    setCardSaveState?.(article, 'saving');
    beginTrackedWrite?.(`Karte #${db?.displayId || key} speichern`);
    try {
      await ensureDbEntry({ checked, source: 'set-grid' });
      const nextState = resolveCollectionToggleState?.( db, { isG: true, checked });
      await updateCellBoolean?.(state.currentSet.setName, db.gCell.row, db.gCell.col, nextState.g);
      if (db?.rhCell && nextState.rh !== Boolean(db?.rh)) {
        await updateCellBoolean?.(state.currentSet.setName, db.rhCell.row, db.rhCell.col, nextState.rh);
      }
      db.g = nextState.g;
      db.rh = nextState.rh;
      updateCardState?.(injections, article, db);
      updateStats?.();
      applyFilter?.();
      state.summaryData = null;
      pushUndoEntry?.({
        setId: state.currentSet?.setId,
        setName: state.currentSet?.setName,
        label: 'Kartenstatus geändert',
        changes: [{ key, prev: prevState, next: { g: Boolean(db.g), rh: Boolean(db.rh) } }]
      });
      updateUndoUi?.();
      broadcastRealtimeCardUpdate?.(injections, key, db);
      setCardSaveState?.(article, 'saved');
      finishTrackedWrite?.(`Karte #${db?.displayId || key} speichern`, null);
    } catch (err) {
      showToast?.(`Speichern fehlgeschlagen: ${err.message}`, 'error');
      gInput.checked = !checked;
      setCardSaveState?.(article, 'error');
      finishTrackedWrite?.(`Karte #${db?.displayId || key} speichern`, err);
    }
  });

  rhInput?.addEventListener('change', async () => {
    if (state.bulkMode) {
      rhInput.checked = !rhInput.checked;
      return;
    }
    const checked = rhInput.checked;
    const prevState = { g: Boolean(db?.g), rh: Boolean(db?.rh) };
    setCardSaveState?.(article, 'saving');
    beginTrackedWrite?.(`Karte #${db?.displayId || key} RH speichern`);
    try {
      await ensureDbEntry({ checked, source: 'set-grid-rh' });
      if (!db?.rhCell) {
        rhInput.checked = false;
        return;
      }
      const nextState = resolveCollectionToggleState?.(db, { isG: false, checked });
      if (nextState.g !== Boolean(db?.g)) {
        await updateCellBoolean?.(state.currentSet.setName, db.gCell.row, db.gCell.col, nextState.g);
      }
      await updateCellBoolean?.(state.currentSet.setName, db.rhCell.row, db.rhCell.col, nextState.rh);
      db.g = nextState.g;
      db.rh = nextState.rh;
      updateCardState?.(injections, article, db);
      updateStats?.();
      applyFilter?.();
      state.summaryData = null;
      pushUndoEntry?.({
        setId: state.currentSet?.setId,
        setName: state.currentSet?.setName,
        label: 'RH-Status geändert',
        changes: [{ key, prev: prevState, next: { g: Boolean(db.g), rh: Boolean(db.rh) } }]
      });
      updateUndoUi?.();
      broadcastRealtimeCardUpdate?.(injections, key, db);
      setCardSaveState?.(article, 'saved');
      finishTrackedWrite?.(`Karte #${db?.displayId || key} RH speichern`, null);
    } catch (err) {
      showToast?.(`Speichern fehlgeschlagen: ${err.message}`, 'error');
      rhInput.checked = !checked;
      setCardSaveState?.(article, 'error');
      finishTrackedWrite?.(`Karte #${db?.displayId || key} RH speichern`, err);
    }
  });
}

/**
 * Update UI state of card (CSS + checkbox state)
 */
export function updateCardState(injections = {}, article, db) {
  const { state, dom, normalizeCardNumber, getCollectionUiState, hydrateCardmarketLink, openLightbox, renderLightbox } = injections;

  const gInput = article?.querySelector('input[data-type="g"]');
  const rhInput = article?.querySelector('input[data-type="rh"]');
  syncCollectionCheckboxUi(injections, gInput, rhInput, db);

  article.classList.toggle('reverse', Boolean(db?.rh));
  article.classList.toggle('collected', Boolean(db?.g) && !db?.rh);

  const cardmarketLink = article?.querySelector('.card-cm-link');
  const cardIndex = Number.parseInt(article?.dataset?.cardIndex || '-1', 10);
  const card = Number.isFinite(cardIndex) && cardIndex >= 0 ? state.cards[cardIndex] : null;

  if (card && cardmarketLink) {
    hydrateCardmarketLink?.(injections, cardmarketLink, card, { compact: true, preferReverseHolo: Boolean(db?.rh) });
  }

  if (dom.lightboxDialog?.open) {
    const idx = parseInt(article.dataset.cardIndex, 10);
    if (state.lightboxIndex === idx) renderLightbox?.(injections, idx);
  }
}

function syncCollectionCheckboxUi(injections = {}, gInput, rhInput, db) {
  const { state, getCollectionUiState } = injections;
  const uiState = getCollectionUiState?.(db, { isEditable: Boolean(state.currentSet?.setName) });
  if (gInput && uiState) {
    gInput.checked = uiState.gChecked;
    gInput.disabled = uiState.gDisabled;
  }
  if (rhInput && uiState) {
    rhInput.checked = uiState.rhChecked;
    rhInput.disabled = uiState.rhDisabled;
  }
}

function revealPendingSearchCardFocus(injections = {}) {
  const { state, dom } = injections;
  const targetKey = String(state.pendingSearchCardFocusKey || '').trim();
  if (!targetKey || !dom.cards) return;

  state.pendingSearchCardFocusKey = null;
  const safeKey = targetKey.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const article = dom.cards.querySelector(`[data-card-id="${safeKey}"]`);
  if (!article) return;

  window.requestAnimationFrame(() => {
    article.scrollIntoView({ block: 'center', behavior: 'smooth' });
    article.focus();
  });
}

/**
 * CARDMARKET PRICING
 */

function toFinitePrice(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function formatEuroPrice(value) {
  const numeric = toFinitePrice(value);
  return numeric == null ? '' : `${numeric.toFixed(2).replace('.', ',')} €`;
}

function getCardmarketPriceValue(prices = {}, ...keys) {
  for (const key of keys) {
    if (prices?.[key] == null) continue;
    const numeric = toFinitePrice(prices[key]);
    if (numeric != null) return numeric;
  }
  return null;
}

function getCardmarketPriceCacheKey(card = {}) {
  const setId = String(card?.setId || '').trim();
  const number = String(card?.number || '').trim();
  const name = String(card?.name || '').trim();
  if (setId || number || name) {
    return `${setId}::${number}::${name}`;
  }
  const normalizedUrl = String(card?.cardmarketUrl || '').trim();
  return normalizedUrl;
}

function getCardmarketPriceDetails(prices = {}, { reverseHolo = false } = {}) {
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

function buildCardmarketLinkPresentation(summary, { preferReverseHolo = false } = {}) {
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
    : formatCardmarketEntryLabel?.(entry);

  const reverseDetails = getCardmarketPriceDetails(prices, { reverseHolo: true });
  const normalDetails = getCardmarketPriceDetails(prices, { reverseHolo: false });
  const detailParts = [];
  if (normalDetails.length) detailParts.push(`Normal: ${normalDetails.join(' · ')}`);
  if (reverseDetails.length) detailParts.push(`Reverse Holo: ${reverseDetails.join(' · ')}`);

  const title = detailParts.length
    ? `Cardmarket (${activeMode}) · ${detailParts.join(' | ')}`
    : formatCardmarketEntryTitle?.(entry);

  return {
    label,
    title,
    url: summary.url || ''
  };
}

function renderLightboxCardmarketPrices(injections = {}, summary, { preferReverseHolo = false } = {}) {
  const { dom } = injections;
  if (!dom.lightboxPriceMode || !dom.lightboxPriceGrid) return;

  dom.lightboxPriceMode.textContent = preferReverseHolo ? 'Reverse Holo aktiv' : 'Normal aktiv';
  dom.lightboxPriceGrid.innerHTML = '';

  if (!summary) {
    const loading = document.createElement('p');
    loading.className = 'lightbox-price-loading';
    loading.textContent = 'Preise werden geladen…';
    dom.lightboxPriceGrid.appendChild(loading);
    return;
  }

  const prices = summary?.entry?.prices;
  if (!prices || typeof prices !== 'object') {
    const empty = document.createElement('p');
    empty.className = 'lightbox-price-empty';
    empty.textContent = 'Keine Preisdetails verfügbar.';
    dom.lightboxPriceGrid.appendChild(empty);
    return;
  }

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
    createPriceGroup('Reverse Holo', [
      ['Trend', getCardmarketPriceValue(prices, 'trendHolo')],
      ['Durchschnitt', getCardmarketPriceValue(prices, 'averageHolo', 'avgHolo')],
      ['Ø 1 Tag', getCardmarketPriceValue(prices, 'average1Holo', 'avg1Holo')],
      ['Ø 7 Tage', getCardmarketPriceValue(prices, 'average7Holo', 'avg7Holo')],
      ['Ø 30 Tage', getCardmarketPriceValue(prices, 'average30Holo', 'avg30Holo')],
      ['Low', getCardmarketPriceValue(prices, 'lowHolo')],
      ['Sell', getCardmarketPriceValue(prices, 'reverseHoloSell')]
    ])
  ].filter(Boolean);

  if (!groups.length) {
    const empty = document.createElement('p');
    empty.className = 'lightbox-price-empty';
    empty.textContent = 'Keine Preisdetails verfügbar.';
    dom.lightboxPriceGrid.appendChild(empty);
    return;
  }

  groups.forEach((group) => dom.lightboxPriceGrid.appendChild(group));
}

function applyCardmarketPriceSummary(linkEl, summary, { compact = false, preferReverseHolo = false } = {}) {
  if (!(linkEl instanceof HTMLElement) || !summary) return;
  const presentation = buildCardmarketLinkPresentation(summary, { preferReverseHolo });
  if (!presentation) return;

  if (summary.url) {
    // Beim Rendern den `?isReverseHolo=Y`-Suffix anhängen, wenn die Karte als
    // RH gesammelt ist. So landet der User direkt auf der richtigen
    // Cardmarket-Produktseite. Search-URLs bleiben unverändert (apply…
    // erkennt sie und passt nichts an).
    const finalUrl = applyReverseHoloQueryParam(summary.url, preferReverseHolo);
    linkEl.href = finalUrl;
    linkEl.dataset.cardmarketUrl = finalUrl;
    linkEl.classList.toggle('card-cm-link-fallback', isGeneratedCardmarketSearchUrl(finalUrl));
  }
  if (presentation.title) linkEl.title = presentation.title;
  if (presentation.label) {
    linkEl.textContent = compact ? `🛒 CM · ${presentation.label}` : `🛒 Cardmarket · ${presentation.label}`;
  }
}

async function loadCardmarketPriceSummary(injections = {}, card = {}) {
  const { state, resolveCardmarketEntryForCard, buildCardmarketProductUrl, getSetById } = injections;
  const cacheKey = getCardmarketPriceCacheKey(card);
  if (!cacheKey.trim()) return null;

  if (cardmarketPriceSummaryCache.has(cacheKey)) {
    return cardmarketPriceSummaryCache.get(cacheKey);
  }

  if (cardmarketPriceSummaryPending.has(cacheKey)) {
    return cardmarketPriceSummaryPending.get(cacheKey);
  }

  const sourceCards = Array.isArray(state?.cards) ? state.cards : [];
  const currentSetId = state?.currentSet?.setId || '';

  // Build a set resolver from getSetById(state) / state.currentSet.
  // The tracker index needs ptcgoCode + name to map a set → cardmarket expansionId.
  // If the caller didn't pass a resolver, the resolveCardmarketEntryForCard call
  // falls back to URL/name heuristics (existing behavior).
  const resolveSetById = typeof getSetById === 'function'
    ? (setId) => {
        const set = getSetById(setId);
        if (!set) return null;
        return {
          setId: set.setId || set.id || '',
          name: set.setName || set.name || '',
          ptcgoCode: set.ptcgoCode || set.code || '',
          series: set.series || ''
        };
      }
    : null;

  const pending = resolveCardmarketEntryForCard?.(card, { cards: sourceCards, resolveSetById, currentSetId })
    .then((entry) => {
      const normalizedUrl = String(card?.cardmarketUrl || '').trim();
      const directUrl = entry?.cardmarketProductId
        ? buildCardmarketProductUrl?.(entry.cardmarketProductId)
        : normalizedUrl;
      const summary = entry ? { entry, url: directUrl } : null;
      cardmarketPriceSummaryCache.set(cacheKey, summary);
      cardmarketPriceSummaryPending.delete(cacheKey);
      return summary;
    })
    .catch((error) => {
      cardmarketPriceSummaryPending.delete(cacheKey);
      throw error;
    });

  cardmarketPriceSummaryPending.set(cacheKey, pending);
  return pending;
}

export function hydrateCardmarketLink(injections = {}, linkEl, card, { compact = false, preferReverseHolo = false } = {}) {
  const cardmarketUrl = String(card?.cardmarketUrl || '').trim();
  if (!(linkEl instanceof HTMLElement) || !cardmarketUrl) {
    return;
  }

  const cacheKey = getCardmarketPriceCacheKey(card);
  linkEl.dataset.cardmarketUrl = cardmarketUrl;

  if (cardmarketPriceSummaryCache.has(cacheKey)) {
    applyCardmarketPriceSummary(linkEl, cardmarketPriceSummaryCache.get(cacheKey), { compact, preferReverseHolo });
    return;
  }

  loadCardmarketPriceSummary(injections, card)
    .then((summary) => {
      if (linkEl.dataset.cardmarketUrl !== cardmarketUrl) return;
      applyCardmarketPriceSummary(linkEl, summary, { compact, preferReverseHolo });
    })
    .catch((error) => {
      console.warn('[cardmarket] price lookup failed', error);
    });
}

/**
 * LIGHTBOX
 */

function syncLightboxModalState(injections = {}) {
  const { dom } = injections;
  const shouldLockScroll = Boolean(dom.lightboxDialog?.open || dom.lightboxImageDialog?.open);
  document.documentElement.classList.toggle('modal-scroll-locked', shouldLockScroll);
  document.body.classList.toggle('modal-scroll-locked', shouldLockScroll);
}

export function openLightbox(injections = {}, index) {
  const { dom, state, renderLightbox } = injections;

  if (!dom.lightboxDialog) return;

  state.lightboxIndex = index;
  renderLightbox?.(injections, index);

  if (dom.lightboxImageDialog?.open) {
    dom.lightboxImageDialog.close();
  }

  if (!dom.lightboxDialog.open) {
    dom.lightboxDialog.showModal();
  }

  dom.lightboxDialog.scrollTop = 0;
  dom.lightboxDialog.querySelector('.lightbox-meta')?.scrollTo({ top: 0, behavior: 'auto' });
  syncLightboxModalState(injections);
  dom.btnLightboxClose?.focus({ preventScroll: true });
}

function closeLightbox(injections = {}) {
  const { dom, state } = injections;

  if (dom.lightboxImageDialog?.open) {
    dom.lightboxImageDialog.close();
  }
  if (dom.lightboxDialog?.open) {
    dom.lightboxDialog.close();
  }

  syncLightboxModalState(injections);
  dom.cards.querySelector(`[data-card-index="${state.lightboxIndex}"]`)?.focus();
}

export function renderLightbox(injections = {}, index) {
  const {
    state,
    dom,
    normalizeCardNumber,
    attachImageFallback,
    hydrateCardmarketLink,
    getCollectionUiState
  } = injections;

  const card = state.cards[index];
  if (!card) return;

  const key = normalizeCardNumber(card.number);
  const db = state.dbMap.get(key) || { displayId: card.number, g: false, rh: false, gCell: null, rhCell: null };

  const listToText = (value) => Array.isArray(value) ? value.filter(Boolean).join(', ') : '';
  const rulesText = Array.isArray(card.rules) ? card.rules.filter(Boolean).join('\n') : '';

  const setFact = (node, value, { longText = false } = {}) => {
    if (!node) return;
    const text = sanitizeDisplayText(value, '—');
    node.textContent = text;
    node.classList.toggle('lightbox-fact-long', longText && text !== '—');
  };

  const lightboxCard = {
    ...card,
    image: card.imageLarge || card.image || '',
    imageCandidates: Array.isArray(card.imageLargeCandidates) && card.imageLargeCandidates.length
      ? card.imageLargeCandidates
      : (Array.isArray(card.imageCandidates) ? card.imageCandidates : [])
  };

  const lightboxImage = String(lightboxCard.image || '').trim();
  if (lightboxImage) dom.lightboxImg.src = lightboxImage;
  else dom.lightboxImg.removeAttribute('src');
  attachImageFallback?.(dom.lightboxImg, lightboxCard, state.currentSet?.setId || '');
  dom.lightboxImg.alt = card.name || key;
  dom.lightboxTitle.textContent = sanitizeDisplayText(card.name, 'Unbekannt');
  dom.lightboxSubtitle.textContent = `#${sanitizeDisplayText(card.number, '?')}`;
  dom.lightboxCounter.textContent = `${index + 1}\u202f/\u202f${state.cards.length}`;

  setFact(dom.lightboxRarity, card.rarity);
  const setName = card.setName || state.currentSet?.setName || '';
  const setId = card.setId || state.currentSet?.setId || '';
  setFact(dom.lightboxSet, setName && setId ? `${setName} (${setId})` : (setName || setId));
  setFact(dom.lightboxHp, card.hp);
  setFact(dom.lightboxTypes, listToText(card.types));
  setFact(dom.lightboxSupertype, card.supertype);
  setFact(dom.lightboxSubtypes, listToText(card.subtypes));
  setFact(dom.lightboxEvolvesFrom, card.evolvesFrom);
  setFact(dom.lightboxArtist, card.artist);
  setFact(dom.lightboxRegulationMark, card.regulationMark);
  setFact(dom.lightboxRules, rulesText, { longText: true });
  setFact(dom.lightboxFlavorText, card.flavorText, { longText: true });

  if (card.cardmarketUrl) {
    const preferReverseHolo = Boolean(db?.rh);
    const isFallbackCardmarket = isGeneratedCardmarketSearchUrl(card.cardmarketUrl);
    dom.lightboxCmLink.href = card.cardmarketUrl;
    dom.lightboxCmLink.textContent = '🛒 Cardmarket';
    dom.lightboxCmLink.title = isFallbackCardmarket ? 'Generierter Cardmarket-Suchlink' : 'Cardmarket-Produktseite';
    dom.lightboxCmLink.classList.toggle('lightbox-cm-link-fallback', isFallbackCardmarket);
    dom.lightboxCmLink.classList.remove('hidden');

    renderLightboxCardmarketPrices(injections, null, { preferReverseHolo });
    hydrateCardmarketLink?.(injections, dom.lightboxCmLink, card, { compact: false, preferReverseHolo });

    loadCardmarketPriceSummary(injections, card)
      .then((summary) => {
        const liveCard = state.cards[state.lightboxIndex];
        if (!liveCard || liveCard.number !== card.number) return;
        renderLightboxCardmarketPrices(injections, summary, { preferReverseHolo: Boolean((state.dbMap.get(key) || {}).rh) });
      })
      .catch(() => {
        renderLightboxCardmarketPrices(injections, { entry: null }, { preferReverseHolo: Boolean(db?.rh) });
      });
  } else {
    dom.lightboxCmLink.classList.add('hidden');
    dom.lightboxCmLink.classList.remove('lightbox-cm-link-fallback');
    renderLightboxCardmarketPrices(injections, { entry: null }, { preferReverseHolo: Boolean(db?.rh) });
  }

  const uiState = getCollectionUiState?.(db, { isEditable: Boolean(state.currentSet?.setName) });
  if (dom.lightboxGCheck && uiState) {
    dom.lightboxGCheck.checked = uiState.gChecked;
    dom.lightboxGCheck.disabled = uiState.gDisabled;
  }
  if (dom.lightboxRhCheck && uiState) {
    dom.lightboxRhCheck.checked = uiState.rhChecked;
    dom.lightboxRhCheck.disabled = uiState.rhDisabled;
  }

  dom.btnLightboxPrev.disabled = index === 0;
  dom.btnLightboxNext.disabled = index === state.cards.length - 1;
}

function initLightbox(injections = {}) {
  const {
    dom,
    state,
    normalizeCardNumber,
    openLightbox: openLBFn,
    closeLightbox: closeLBFn,
    renderLightbox: renderLBFn,
    showToast,
    setLoading,
    setCardSaveState,
    updateCardState,
    updateStats,
    applyFilter,
    beginTrackedWrite,
    finishTrackedWrite,
    updateCellBoolean,
    ensureCollectionEntry,
    readSetCollectionMap,
    fetchMergedCardsWithSetMeta,
    cache,
    CONFIG,
    resolveCollectionToggleState,
    pushUndoEntry,
    updateUndoUi,
    broadcastRealtimeCardUpdate,
    runSearch,
    ensureSetImportedFromApi
  } = injections;

  dom.btnLightboxClose?.addEventListener('click', () => closeLightbox(injections));

  dom.lightboxDialog?.addEventListener('click', (e) => {
    if (isPointerInsideElement(e, dom.btnLightboxClose)) {
      e.preventDefault();
      e.stopPropagation();
      closeLightbox(injections);
      return;
    }

    if (e.target === dom.lightboxDialog) closeLightbox(injections);
  });

  dom.lightboxDialog?.addEventListener('close', () => syncLightboxModalState(injections));

  dom.lightboxDialog?.addEventListener('cancel', (e) => {
    e.preventDefault();
    closeLightbox(injections);
  });

  const goPrevLightboxCard = () => {
    if (state.lightboxIndex > 0) {
      state.lightboxIndex--;
      renderLightbox?.(injections, state.lightboxIndex);
      return true;
    }
    return false;
  };

  const goNextLightboxCard = () => {
    if (state.lightboxIndex < state.cards.length - 1) {
      state.lightboxIndex++;
      renderLightbox?.(injections, state.lightboxIndex);
      return true;
    }
    return false;
  };

  dom.btnLightboxPrev?.addEventListener('click', goPrevLightboxCard);
  dom.btnLightboxNext?.addEventListener('click', goNextLightboxCard);

  dom.lightboxDialog?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeLightbox(injections);
    if (e.key === 'ArrowLeft') goPrevLightboxCard();
    if (e.key === 'ArrowRight') goNextLightboxCard();
    if (e.key === ' ') { e.preventDefault(); dom.lightboxGCheck?.click(); }
  });

  // Touch swipe handlers (simplified for brevity)
  const lightboxImgWrap = dom.lightboxDialog?.querySelector('.lightbox-img-wrap');
  if (lightboxImgWrap) {
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;

    lightboxImgWrap.addEventListener('touchstart', (e) => {
      if (!dom.lightboxDialog?.open || e.touches.length !== 1) return;
      const touch = e.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      touchStartTime = Date.now();
    }, { passive: true });

    lightboxImgWrap.addEventListener('touchend', (e) => {
      if (!dom.lightboxDialog?.open || !touchStartTime || e.changedTouches.length !== 1) return;
      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchStartX;
      const deltaY = touch.clientY - touchStartY;
      const elapsed = Date.now() - touchStartTime;

      touchStartTime = 0;

      const minDistance = 48;
      const maxVertical = 42;
      const maxDuration = 700;
      const isHorizontalSwipe = Math.abs(deltaX) >= minDistance
        && Math.abs(deltaY) <= maxVertical
        && elapsed <= maxDuration;

      const isSwipeDownToClose = deltaY >= 72
        && Math.abs(deltaX) <= 50
        && elapsed <= maxDuration;

      if (isSwipeDownToClose) {
        closeLightbox(injections);
        return;
      }

      if (!isHorizontalSwipe) return;

      if (deltaX > 0) goPrevLightboxCard();
      else if (deltaX < 0) goNextLightboxCard();
    }, { passive: true });
  }

  // Lightbox collection toggles
  async function lightboxToggle(isG, checked) {
    const card = state.cards[state.lightboxIndex];
    if (!card) return;

    const key = injections.normalizeCardNumber?.(card.number);
    const article = dom.cards.querySelector(`[data-card-index="${state.lightboxIndex}"]`);
    let db = state.dbMap.get(key) || { displayId: card.number, g: false, rh: false, gCell: null, rhCell: null };

    const prevState = { g: Boolean(db?.g), rh: Boolean(db?.rh) };
    const shouldEnsureImportedSet = checked && (Boolean(state.pendingSearchSetImport) || !Boolean(state.currentSet?.imported));

    if (shouldEnsureImportedSet) {
      const setToImport = state.currentSet;
      const setId = setToImport?.setId;
      if (!setId) return;

      setLoading?.(true, `Importiere ${setToImport.setName}…`);
      try {
        const importPayload = await fetchMergedCardsWithSetMeta?.(setId).catch(() => ({ cards: [], setMetaPatch: null }));
        const importCards = Array.isArray(importPayload?.cards) ? importPayload.cards : [];
        if (!importCards.length) {
          throw new Error('Keine Kartendaten für den automatischen Set-Import gefunden.');
        }

        const refreshedSet = await ensureSetImportedFromApi?.(setToImport, importCards, {
          setMetaPatch: importPayload?.setMetaPatch || null,
          showSuccessToast: true,
          successMessage: `${setToImport.setName} wurde automatisch importiert.`,
          source: 'lightbox'
        });

        state.currentSet = refreshedSet || { ...setToImport, imported: true };
        state.pendingSearchSetImport = false;
        state.dbMap = await readSetCollectionMap?.(state.currentSet.setName).catch(() => new Map());
        cache?.set?.(`db_${setId}`, state.dbMap, CONFIG.CACHE_TTL_MS);
        db = state.dbMap.get(key) || db;
      } catch (err) {
        showToast?.(`Automatischer Set-Import fehlgeschlagen: ${err.message || err}`, 'error', 4200);
        renderLightbox?.(injections, state.lightboxIndex);
        return;
      } finally {
        setLoading?.(false);
      }
    }

    if (!db?.gCell) {
      const ensured = await ensureCollectionEntry?.(state.currentSet.setName, card.number || db?.displayId || key);
      db.displayId = ensured.displayId || db.displayId || card.number || key;
      db.gCell = ensured.gCell;
      db.rhCell = ensured.rhCell;
      state.dbMap.set(key, db);
    }

    setCardSaveState?.(article, 'saving');
    beginTrackedWrite?.(`Lightbox #${db?.displayId || key}`);
    try {
      if (!isG && !db?.rhCell) {
        renderLightbox?.(injections, state.lightboxIndex);
        return;
      }

      const nextState = resolveCollectionToggleState?.(db, { isG, checked });
      if (nextState.g !== Boolean(db?.g)) {
        await updateCellBoolean?.(state.currentSet.setName, db.gCell.row, db.gCell.col, nextState.g);
      }
      if (db?.rhCell && nextState.rh !== Boolean(db?.rh)) {
        await updateCellBoolean?.(state.currentSet.setName, db.rhCell.row, db.rhCell.col, nextState.rh);
      }

      db.g = nextState.g;
      db.rh = nextState.rh;
      renderLightbox?.(injections, state.lightboxIndex);

      if (article) updateCardState?.(injections, article, db);

      updateStats?.();
      state.summaryData = null;

      pushUndoEntry?.({
        setId: state.currentSet?.setId,
        setName: state.currentSet?.setName,
        label: 'Lightbox-Änderung',
        changes: [{ key, prev: prevState, next: { g: Boolean(db.g), rh: Boolean(db.rh) } }]
      });
      updateUndoUi?.();
      broadcastRealtimeCardUpdate?.(injections, key, db);
      runSearch?.({ force: true });

      setCardSaveState?.(article, 'saved');
      finishTrackedWrite?.(`Lightbox #${db?.displayId || key}`, null);
    } catch (err) {
      showToast?.(`Fehler: ${err.message}`, 'error');
      renderLightbox?.(injections, state.lightboxIndex);
      setCardSaveState?.(article, 'error');
      finishTrackedWrite?.(`Lightbox #${db?.displayId || key}`, err);
    }
  }

  dom.lightboxGCheck?.addEventListener('change', () => lightboxToggle(true, dom.lightboxGCheck.checked));
  dom.lightboxRhCheck?.addEventListener('change', () => lightboxToggle(false, dom.lightboxRhCheck.checked));
}

/**
 * BULK EDIT
 */

function toggleBulkMode(injections = {}, on) {
  const { state, dom, updateBulkCount } = injections;

  state.bulkMode = on;
  state.bulkSelected.clear();
  dom.bulkToolbar?.classList.toggle('hidden', !on);
  dom.btnBulkEdit.textContent = on ? '✕ Abbrechen' : '☑ Mehrfach-Auswahl';
  dom.cards.classList.toggle('bulk-mode', on);
  updateBulkCount?.();

  if (!on) {
    dom.cards.querySelectorAll('.card.bulk-selected').forEach((a) => a.classList.remove('bulk-selected'));
  }
}

function toggleBulkSelect(injections = {}, article, key) {
  const { state, updateBulkCount } = injections;

  if (state.bulkSelected.has(key)) {
    state.bulkSelected.delete(key);
    article.classList.remove('bulk-selected');
  } else {
    state.bulkSelected.add(key);
    article.classList.add('bulk-selected');
  }

  updateBulkCount?.();
}

async function bulkUpdate(injections = {}, g, rh) {
  const {
    state,
    dom,
    showToast,
    setLoading,
    updateCardState,
    updateStats,
    applyFilter,
    beginTrackedWrite,
    finishTrackedWrite,
    updateCellBoolean,
    pushUndoEntry,
    updateUndoUi,
    broadcastRealtimeCardUpdate
  } = injections;

  if (!state.bulkSelected.size) {
    showToast?.('Keine Karten ausgewählt.', 'info');
    return;
  }

  beginTrackedWrite?.('Bulk-Update');
  setLoading?.(true, 'Massenaktion…');

  let updated = 0;
  let errors = 0;
  const undoChanges = [];

  try {
    for (const key of state.bulkSelected) {
      const db = state.dbMap.get(key);
      if (!db?.gCell) continue;

      const prevState = { g: Boolean(db?.g), rh: Boolean(db?.rh) };
      try {
        await updateCellBoolean?.(state.currentSet.setName, db.gCell.row, db.gCell.col, g);
        db.g = g;

        if (db.rhCell) {
          const newRh = g && rh;
          await updateCellBoolean?.(state.currentSet.setName, db.rhCell.row, db.rhCell.col, newRh);
          db.rh = newRh;
        }

        const article = dom.cards.querySelector(`[data-card-id="${key}"]`);
        if (article) updateCardState?.(injections, article, db);

        undoChanges.push({ key, prev: prevState, next: { g: Boolean(db.g), rh: Boolean(db.rh) } });
        broadcastRealtimeCardUpdate?.(injections, key, db);
        updated++;
      } catch (err) {
        console.warn('[bulkUpdate] error for key', key, err);
        errors++;
      }
    }
  } finally {
    setLoading?.(false);
  }

  updateStats?.();
  applyFilter?.();
  state.summaryData = null;
  toggleBulkMode(injections, false);

  if (undoChanges.length) {
    pushUndoEntry?.({
      setId: state.currentSet?.setId,
      setName: state.currentSet?.setName,
      label: 'Bulk-Änderung',
      changes: undoChanges
    });
    updateUndoUi?.();
  }

  finishTrackedWrite?.('Bulk-Update', errors > 0 ? new Error(`${errors} Fehler`) : null);

  const msg = errors > 0 ? `${updated} aktualisiert, ${errors} Fehler.` : `${updated} Karten aktualisiert.`;
  showToast?.(msg, errors > 0 ? 'error' : 'success', errors > 0 ? 5000 : 3000);
}

function initBulkEdit(injections = {}) {
  const { dom } = injections;

  dom.btnBulkEdit?.addEventListener('click', () => toggleBulkMode(injections, !injections.state.bulkMode));
  dom.btnBulkCancel?.addEventListener('click', () => toggleBulkMode(injections, false));
  dom.btnBulkMarkG?.addEventListener('click', () => bulkUpdate(injections, true, false));
  dom.btnBulkMarkRh?.addEventListener('click', () => bulkUpdate(injections, true, true));
  dom.btnBulkUnmark?.addEventListener('click', () => bulkUpdate(injections, false, false));
}

/**
 * KEYBOARD NAVIGATION
 */

function initKeyboardNav(injections = {}) {
  const { state, dom, normalizeCardNumber, openLightbox: openLBFn } = injections;

  document.addEventListener('keydown', (e) => {
    if (dom.viewSet?.classList.contains('hidden')) return;
    if (dom.lightboxDialog?.open) return;
    if (state.bulkMode) return;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;

    const articles = Array.from(dom.cards.querySelectorAll('.card:not(.hidden)'));
    if (!articles.length) return;

    const cols = Math.max(1, Math.floor(dom.cards.offsetWidth / 170));
    let newIndex = focusedCardIndex;

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      newIndex = Math.min((focusedCardIndex < 0 ? -1 : focusedCardIndex) + 1, articles.length - 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      newIndex = Math.max(focusedCardIndex - 1, 0);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      newIndex = Math.min(focusedCardIndex + cols, articles.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      newIndex = Math.max(focusedCardIndex - cols, 0);
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      articles[focusedCardIndex]?.querySelector('input[data-type="g"]:not(:disabled)')?.click();
      return;
    } else if (e.key === 'i' || e.key === 'I') {
      e.preventDefault();
      const idx = parseInt(articles[focusedCardIndex]?.dataset.cardIndex ?? '-1');
      if (idx >= 0) openLightbox?.(injections, idx);
      return;
    } else {
      return;
    }

    if (newIndex < 0) newIndex = 0;
    focusedCardIndex = newIndex;
    const target = articles[focusedCardIndex];
    if (target) {
      target.focus();
      target.scrollIntoView({ block: 'nearest' });
    }
  });

  dom.cards?.addEventListener('focus', (e) => {
    const article = e.target.closest('.card');
    if (article) {
      const articles = Array.from(dom.cards.querySelectorAll('.card:not(.hidden)'));
      focusedCardIndex = articles.indexOf(article);
    }
  }, true);
}

/**
 * EXPORT MISSING CARDS
 */

function getMissingCards(injections = {}) {
  const { state, normalizeCardNumber } = injections;
  return state.cards.filter((card) => !state.dbMap.get(normalizeCardNumber(card.number))?.g);
}

function exportMissingCards(injections = {}) {
  const { state, showToast, normalizeCardNumber } = injections;

  const missing = getMissingCards(injections);
  if (!missing.length) {
    showToast?.('Keine fehlenden Karten – Set vollständig!', 'success');
    return;
  }

  const setName = state.currentSet?.setName || 'Set';
  const rows = [
    'Nummer,Name,Set',
    ...missing.map((c) => `"${c.number}","${(c.name || '').replace(/"/g, '""')}","${setName}"`)
  ];
  const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), {
    href: url,
    download: `fehlende_${setName.replace(/\s+/g, '-')}.csv`
  });

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast?.(`${missing.length} fehlende Karten als CSV exportiert.`, 'success', 4000);
}
