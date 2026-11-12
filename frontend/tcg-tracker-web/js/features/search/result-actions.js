import { isGeneratedCardmarketSearchUrl } from '../../data/cardmarket-url-utils.js';
import { collectionKeyOf, emptyCollectionEntry, writeEntryStateWith, ensureEntryWith, isAmbiguousLegacyKeyError, describeAmbiguousLegacyKey } from '../../data/collection-writes.js';
import { describeCardDataFailure } from '../../core/card-enrichment.js';

export function createSearchResultActionsController({
  state,
  dom,
  cache,
  config,
  attachImageFallback,
  makeCheckbox,
  hydrateCardmarketLink,
  showToast,
  syncCollectionCheckboxUi,
  setCardSaveState,
  beginTrackedWrite,
  ensureCollectionEntry,
  resolveCollectionToggleState,
  updateCellBoolean,
  updateCellBooleansBatch,
  pushUndoEntry,
  updateUndoUi,
  finishTrackedWrite,
  ensureSetSelectorOption,
  getSetById,
  loadCurrentSet,
  showView,
  navigate,
  getSearchScopeMode,
  shouldFetchApiCardsForSearchSet,
  readDbCardsForSet,
  fetchMergedCardsWithSetMeta,
  mergeSearchCards,
  readSetCollectionMap,
  normalizeCardNumber,
  syncRefreshControls,
  needsApiCardEnrichment,
  searchScopeOnline,
  openSetLightbox,
} = {}) {
  function createSearchResultCard(card, key, db, set, apiOnly = false) {
    const article = document.createElement('article');
    article.className = 'card search-result-card';
    if (db?.rh) article.classList.add('reverse');
    else if (db?.g) article.classList.add('collected');

    const imgWrap = document.createElement('div');
    imgWrap.className = 'card-img-wrap';
    const img = document.createElement('img');
    const cardImage = String(card.image || '').trim();
    if (cardImage) img.src = cardImage;
    else img.removeAttribute('src');
    img.alt = card.name || key;
    img.loading = 'lazy';
    attachImageFallback(img, card, set?.setId || '');
    imgWrap.appendChild(img);

    const meta = document.createElement('div');
    meta.className = 'meta';
    const setTag = document.createElement('span');
    setTag.className = 'search-set-tag';
    setTag.textContent = set.setName;
    const cardLabel = `${card.number} – ${card.name || '?'}`;
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = cardLabel;
    title.title = cardLabel;

    const isEditable = Boolean(set?.setName && set?.imported);
    const checksDiv = document.createElement('div');
    checksDiv.className = 'checks search-checks-bar';
    checksDiv.append(
      makeCheckbox('G', 'g', db?.g ?? false, !isEditable),
      makeCheckbox('RH', 'rh', db?.rh ?? false, !isEditable || !db?.rhCell)
    );

    const goToSetButton = document.createElement('button');
    goToSetButton.type = 'button';
    goToSetButton.className = 'btn-goto-set';
    goToSetButton.textContent = '↗';
    goToSetButton.title = `${set.setName} öffnen`;
    checksDiv.appendChild(goToSetButton);
    meta.append(setTag, title, checksDiv);

    if (card.cardmarketUrl) {
      const isFallbackCardmarket = isGeneratedCardmarketSearchUrl(card.cardmarketUrl);
      const cardmarketLink = document.createElement('a');
      cardmarketLink.href = card.cardmarketUrl;
      cardmarketLink.target = '_blank';
      cardmarketLink.rel = 'noopener noreferrer';
      cardmarketLink.className = `card-cm-link${isFallbackCardmarket ? ' card-cm-link-fallback' : ''}`;
      cardmarketLink.textContent = '🛒 CM';
      cardmarketLink.title = isFallbackCardmarket ? 'Generierter Cardmarket-Suchlink' : 'Cardmarket-Produktseite';
      meta.appendChild(cardmarketLink);
      hydrateCardmarketLink(cardmarketLink, card, { compact: true, preferReverseHolo: Boolean(db?.rh) });
    }

    article.append(imgWrap, meta);

    article.addEventListener('click', async (event) => {
      if (event.target instanceof HTMLElement && event.target.closest('input, a, label, button')) return;
      try {
        await openSearchResultLightbox(card, set, { apiOnly });
      } catch (error) {
        showToast(`Karte konnte nicht geöffnet werden: ${error.message}`, 'error');
      }
    });

    goToSetButton.addEventListener('click', (event) => {
      event.stopPropagation();
      navigateToSearchResultSet(set, card);
    });

    if (isEditable) {
      attachSearchResultCheckboxListeners(article, db, key, set, card);
    }

    return article;
  }

  function attachSearchResultCheckboxListeners(article, dbEntry, key, set, card) {
    const gInput = article.querySelector('input[data-type="g"]');
    const rhInput = article.querySelector('input[data-type="rh"]');
    const db = dbEntry || emptyCollectionEntry(card, key);
    const writers = { updateCellBooleansBatch: updateCellBooleansBatch, updateCellBoolean };

    async function ensureDbEntry() {
      return ensureEntryWith(ensureCollectionEntry, set, db, key);
    }

    function updateSearchCardState() {
      syncCollectionCheckboxUi(gInput, rhInput, db, { isEditable: true });
      article.classList.toggle('reverse', Boolean(db?.rh));
      article.classList.toggle('collected', Boolean(db?.g) && !db?.rh);
      const cardmarketLink = article.querySelector('.card-cm-link');
      if (cardmarketLink) {
        hydrateCardmarketLink(cardmarketLink, card, { compact: true, preferReverseHolo: Boolean(db?.rh) });
      }
    }

    gInput.addEventListener('change', async () => {
      if (state.bulkMode) {
        gInput.checked = !gInput.checked;
        return;
      }
      const checked = gInput.checked;
      const prevState = { g: Boolean(db?.g), rh: Boolean(db?.rh) };
      setCardSaveState(article, 'saving');
      beginTrackedWrite(`Karte #${db?.displayId || key} speichern`);
      try {
        await ensureDbEntry();
        const nextState = resolveCollectionToggleState(db, { isG: true, checked });
        await writeEntryStateWith(writers, set.setName, db, nextState);
        updateSearchCardState();
        pushUndoEntry({
          setId: set?.setId,
          setName: set?.setName,
          label: 'Kartenstatus geändert',
          changes: [{ key, prev: prevState, next: { g: Boolean(db.g), rh: Boolean(db.rh) } }]
        });
        updateUndoUi();
        setCardSaveState(article, 'saved');
        finishTrackedWrite(`Karte #${db?.displayId || key} speichern`, null);
      } catch (error) {
        if (isAmbiguousLegacyKeyError(error)) showToast(describeAmbiguousLegacyKey(error), 'info', 8000); else showToast(`Speichern fehlgeschlagen: ${error.message}`, 'error');
        gInput.checked = !checked;
        setCardSaveState(article, 'error');
        finishTrackedWrite(`Karte #${db?.displayId || key} speichern`, error);
      }
    });

    rhInput.addEventListener('change', async () => {
      if (state.bulkMode) {
        rhInput.checked = !rhInput.checked;
        return;
      }
      const checked = rhInput.checked;
      const prevState = { g: Boolean(db?.g), rh: Boolean(db?.rh) };
      setCardSaveState(article, 'saving');
      beginTrackedWrite(`Karte #${db?.displayId || key} RH speichern`);
      try {
        await ensureDbEntry();
        if (!db?.rhCell) {
          rhInput.checked = false;
          return;
        }
        const nextState = resolveCollectionToggleState(db, { isG: false, checked });
        await writeEntryStateWith(writers, set.setName, db, nextState);
        updateSearchCardState();
        pushUndoEntry({
          setId: set?.setId,
          setName: set?.setName,
          label: 'RH-Status geändert',
          changes: [{ key, prev: prevState, next: { g: Boolean(db.g), rh: Boolean(db.rh) } }]
        });
        updateUndoUi();
        setCardSaveState(article, 'saved');
        finishTrackedWrite(`Karte #${db?.displayId || key} RH speichern`, null);
      } catch (error) {
        if (isAmbiguousLegacyKeyError(error)) showToast(describeAmbiguousLegacyKey(error), 'info', 8000); else showToast(`Speichern fehlgeschlagen: ${error.message}`, 'error');
        rhInput.checked = !checked;
        setCardSaveState(article, 'error');
        finishTrackedWrite(`Karte #${db?.displayId || key} RH speichern`, error);
      }
    });
  }

  function navigateToSearchResultSet(set, card = null) {
    if (!set?.setId) return;
    const resolvedSet = getSetById(set.setId) || set;
    state.pendingSearchSetImport = Boolean(!resolvedSet?.imported);
    state.pendingSearchCardFocusKey = card ? (collectionKeyOf(card) || null) : null;
    ensureSetSelectorOption(resolvedSet);
    dom.selector.value = resolvedSet.setId;

    const targetHash = `#set/${resolvedSet.setId}`;
    if (window.location.hash === targetHash) {
      showView('set');
      loadCurrentSet(false);
      return;
    }

    navigate(`set/${resolvedSet.setId}`);
  }

  async function openSearchResultLightbox(card, set, { apiOnly = false } = {}) {
    if (!set?.setId || !card) return;

    const cardsCacheKey = `db_cards_${set.setId}`;
    const dbCacheKey = `db_${set.setId}`;
    const searchScopeMode = getSearchScopeMode();
    const searchCacheKey = `${set.setId}::${searchScopeMode}`;

    const [cards, dbMap] = await Promise.all([
      state.searchCache.has(searchCacheKey)
        ? state.searchCache.get(searchCacheKey)
        // api/v3 ist massgeblich; db_cards nur Offline-Fallback.
        : fetchMergedCardsWithSetMeta(set.setId).then((payload) => {
          const apiCards = Array.isArray(payload?.cards) ? payload.cards : [];
          if (apiCards.length > 0) cache.set(`cards_${set.setId}`, apiCards, config.CACHE_TTL_MS);
          state.searchCache.set(searchCacheKey, apiCards);
          return apiCards;
        }, async (v3Error) => {
          if (v3Error?.name === 'AbortError') throw v3Error;
          const dbCards = await readDbCardsForSet(set.setId).catch(() => []);
          if (Array.isArray(dbCards) && dbCards.length > 0) {
            cache.set(cardsCacheKey, dbCards, config.CACHE_TTL_MS);
            state.searchCache.set(searchCacheKey, dbCards);
            return dbCards;
          }
          throw new Error(describeCardDataFailure(v3Error));
        }),
      cache.has(dbCacheKey)
        ? cache.get(dbCacheKey)
        : readSetCollectionMap(set.setName, { setId: set.setId }).then((loadedDbMap) => {
          const safeDbMap = loadedDbMap instanceof Map ? loadedDbMap : new Map();
          cache.set(dbCacheKey, safeDbMap, config.CACHE_TTL_MS);
          return safeDbMap;
        }).catch(() => {
          const emptyDbMap = new Map();
          cache.set(dbCacheKey, emptyDbMap, config.CACHE_TTL_MS);
          return emptyDbMap;
        })
    ]);

    if (!Array.isArray(cards) || cards.length === 0) {
      showToast('Keine Kartendaten für dieses Set gefunden.', 'info', 4500);
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

    openSetLightbox(targetIndex);
  }

  return {
    createSearchResultCard,
    attachSearchResultCheckboxListeners,
    navigateToSearchResultSet,
    openSearchResultLightbox,
  };
}
