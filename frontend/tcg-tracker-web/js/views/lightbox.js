// Lightbox: Kartendetail, Wischgesten, Vollbildansicht und Haken-Schalter.
import { isGeneratedCardmarketSearchUrl } from '../data/cardmarket-url-utils.js';
import { readSetCollectionMap } from '../data/sheets-db.js?v=20261114-clean-1';
import { collectionKeyOf, emptyCollectionEntry } from '../data/collection-writes.js';
import { fetchMergedCardsWithSetMeta } from '../data/pokemon-api.js?v=20261114-clean-1';
import { resolveCollectionToggleState } from '../core/collection-state.js?v=20261114-clean-1';
import * as cache from '../core/cache.js';
import { CONFIG } from '../core/config.js';
import { dom } from '../app/dom.js';
import { state } from '../app/state.js';
import { actions } from '../app/actions.js';
import {
  setLoading, showToast, setCardSaveState, beginTrackedWrite, finishTrackedWrite, pushUndoEntry, updateUndoUi,
  attachImageFallback
} from '../ui/helpers.js';
import { runSearch } from './search.js';
import {
  renderLightboxCardmarketPrices,
  loadCardmarketPriceSummary,
  hydrateCardmarketLink,
  syncCollectionCheckboxUi,
  reportCollectionWriteError,
  ensureWritableCollectionEntry,
  writeCollectionEntryState,
  updateCardState,
  updateStats,
  broadcastRealtimeCardUpdate
} from './set-cards.js';

// --------------------------------------------------------------------------
// LIGHTBOX
// --------------------------------------------------------------------------
function syncLightboxModalState() {
  const shouldLockScroll = Boolean(dom.lightboxDialog?.open || dom.lightboxImageDialog?.open);
  document.documentElement.classList.toggle('modal-scroll-locked', shouldLockScroll);
  document.body.classList.toggle('modal-scroll-locked', shouldLockScroll);
}

export function openLightbox(index) {
  if (!dom.lightboxDialog) return;
  state.lightboxIndex = index;
  renderLightbox(index);
  if (dom.lightboxImageDialog?.open) {
    dom.lightboxImageDialog.close();
  }
  if (!dom.lightboxDialog.open) {
    dom.lightboxDialog.showModal();
  }
  dom.lightboxDialog.scrollTop = 0;
  dom.lightboxDialog.querySelector('.lightbox-meta')?.scrollTo({ top: 0, behavior: 'auto' });
  syncLightboxModalState();
  dom.btnLightboxClose?.focus({ preventScroll: true });
}

function closeLightbox() {
  if (dom.lightboxImageDialog?.open) {
    dom.lightboxImageDialog.close();
  }
  if (dom.lightboxDialog?.open) {
    dom.lightboxDialog.close();
  }
  syncLightboxModalState();
  dom.cards.querySelector(`[data-card-index="${state.lightboxIndex}"]`)?.focus();
}

export function renderLightbox(index) {
  const card = state.cards[index];
  if (!card) return;
  const key = collectionKeyOf(card);
  const db  = state.dbMap.get(key) || emptyCollectionEntry(card, key);
  const listToText = (value) => Array.isArray(value) ? value.filter(Boolean).join(', ') : '';
  const rulesText = Array.isArray(card.rules) ? card.rules.filter(Boolean).join('\n') : '';
  const setFact = (node, value, { longText = false } = {}) => {
    if (!node) return;
    const text = String(value ?? '').trim() || '—';
    node.textContent = text;
    node.classList.toggle('lightbox-fact-long', longText && text !== '—');
  };

  attachImageFallback(dom.lightboxImg, card, { kind: 'cardLarge' });
  dom.lightboxImg.alt              = card.name  || key;
  dom.lightboxTitle.textContent    = card.name  || 'Unbekannt';
  dom.lightboxSubtitle.textContent = `#${card.number}`;
  dom.lightboxCounter.textContent  = `${index + 1}\u202f/\u202f${state.cards.length}`;
  const setName = card.setName || state.currentSet?.setName || '';
  const setId = card.setId || state.currentSet?.setId || '';
  setFact(dom.lightboxSet, setName && setId ? `${setName} (${setId})` : (setName || setId));
  setFact(dom.lightboxRarity, card.rarity);
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
    dom.lightboxCmLink.textContent = 'Cardmarket';
    dom.lightboxCmLink.title = isFallbackCardmarket ? 'Generierter Cardmarket-Suchlink' : 'Cardmarket-Produktseite';
    dom.lightboxCmLink.classList.toggle('lightbox-cm-link-fallback', isFallbackCardmarket);
    dom.lightboxCmLink.classList.remove('hidden');
    renderLightboxCardmarketPrices(null, { preferReverseHolo });
    hydrateCardmarketLink(dom.lightboxCmLink, card, { compact: false, preferReverseHolo });
    loadCardmarketPriceSummary(card)
      .then((summary) => {
        const liveCard = state.cards[state.lightboxIndex];
        if (!liveCard || liveCard.number !== card.number) return;
        renderLightboxCardmarketPrices(summary, { preferReverseHolo: Boolean((state.dbMap.get(key) || {}).rh) });
      })
      .catch(() => {
        renderLightboxCardmarketPrices({ entry: null }, { preferReverseHolo });
      });
  } else {
    dom.lightboxCmLink.classList.add('hidden');
    dom.lightboxCmLink.classList.remove('lightbox-cm-link-fallback');
    renderLightboxCardmarketPrices({ entry: null }, { preferReverseHolo: Boolean(db?.rh) });
  }
  syncCollectionCheckboxUi(dom.lightboxGCheck, dom.lightboxRhCheck, db, {
    isEditable: Boolean(state.currentSet?.setName)
  });
  dom.btnLightboxPrev.disabled  = index === 0;
  dom.btnLightboxNext.disabled  = index === state.cards.length - 1;
}

export function initLightbox() {
  dom.btnLightboxClose.addEventListener('click', closeLightbox);
  dom.lightboxDialog.addEventListener('click', (e) => { if (e.target === dom.lightboxDialog) closeLightbox(); });
  dom.lightboxDialog.addEventListener('close', syncLightboxModalState);
  dom.lightboxDialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    closeLightbox();
  });

  const goPrevLightboxCard = () => {
    if (state.lightboxIndex > 0) {
      state.lightboxIndex--;
      renderLightbox(state.lightboxIndex);
      return true;
    }
    return false;
  };

  const goNextLightboxCard = () => {
    if (state.lightboxIndex < state.cards.length - 1) {
      state.lightboxIndex++;
      renderLightbox(state.lightboxIndex);
      return true;
    }
    return false;
  };

  dom.btnLightboxPrev.addEventListener('click', goPrevLightboxCard);
  dom.btnLightboxNext.addEventListener('click', goNextLightboxCard);

  dom.lightboxDialog.addEventListener('keydown', (e) => {
    if (e.key === 'Escape')     closeLightbox();
    if (e.key === 'ArrowLeft')  goPrevLightboxCard();
    if (e.key === 'ArrowRight') goNextLightboxCard();
    if (e.key === ' ')          { e.preventDefault(); dom.lightboxGCheck.click(); }
  });

  const lightboxImgWrap = dom.lightboxDialog.querySelector('.lightbox-img-wrap');
  if (lightboxImgWrap) {
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;

    lightboxImgWrap.addEventListener('touchstart', (e) => {
      if (!dom.lightboxDialog.open || e.touches.length !== 1) return;
      const touch = e.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      touchStartTime = Date.now();
    }, { passive: true });

    lightboxImgWrap.addEventListener('touchend', (e) => {
      if (!dom.lightboxDialog.open || !touchStartTime || e.changedTouches.length !== 1) return;
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
        closeLightbox();
        return;
      }

      if (!isHorizontalSwipe) return;

      if (deltaX > 0) goPrevLightboxCard();
      else if (deltaX < 0) goNextLightboxCard();
    }, { passive: true });
  }

  if (dom.lightboxImg && dom.lightboxImageDialog && dom.lightboxImageFull && dom.lightboxImageStage && dom.btnLightboxImageClose) {
    let fsScale = 1;
    let fsTranslateX = 0;
    let fsTranslateY = 0;
    let fsStartX = 0;
    let fsStartY = 0;
    let fsStartTime = 0;
    let fsStartTranslateX = 0;
    let fsStartTranslateY = 0;
    let fsPinchStartDistance = 0;
    let fsPinchStartScale = 1;

    const resetFullscreenTransform = () => {
      fsScale = 1;
      fsTranslateX = 0;
      fsTranslateY = 0;
      dom.lightboxImageFull.style.transform = 'translate3d(0, 0, 0) scale(1)';
    };

    const applyFullscreenTransform = () => {
      dom.lightboxImageFull.style.transform = `translate3d(${fsTranslateX}px, ${fsTranslateY}px, 0) scale(${fsScale})`;
    };

    const syncFullscreenImage = (resetTransform = false) => {
      const card = state.cards[state.lightboxIndex];
      if (!card) return;
      // Bereits geladenes Lightbox-Bild zuerst (kein Platzhalter), dann die grosse Fallback-Kette.
      const loadedSrc = dom.lightboxImg?.classList.contains('img-fallback') ? '' : dom.lightboxImg?.currentSrc;
      attachImageFallback(dom.lightboxImageFull, card, { kind: 'cardLarge', preferred: loadedSrc || '' });
      dom.lightboxImageFull.alt = card.name || '';
      if (resetTransform) resetFullscreenTransform();
    };

    const openFullscreenImage = () => {
      syncFullscreenImage(true);
      dom.lightboxImageDialog.showModal();
      syncLightboxModalState();
    };

    const closeFullscreenImage = () => {
      if (!dom.lightboxImageDialog.open) return;
      dom.lightboxImageDialog.close();
      resetFullscreenTransform();
      syncLightboxModalState();
    };

    dom.lightboxImg.addEventListener('click', () => {
      if (!dom.lightboxDialog.open) return;
      openFullscreenImage();
    });

    dom.btnLightboxImageClose.addEventListener('click', closeFullscreenImage);
    dom.lightboxImageDialog.addEventListener('close', syncLightboxModalState);
    dom.lightboxImageDialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      closeFullscreenImage();
    });
    dom.lightboxImageDialog.addEventListener('click', (e) => {
      if (e.target === dom.lightboxImageDialog) closeFullscreenImage();
    });
    dom.lightboxImageDialog.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeFullscreenImage();
      if (e.key === 'ArrowLeft') {
        if (goPrevLightboxCard()) syncFullscreenImage(true);
      }
      if (e.key === 'ArrowRight') {
        if (goNextLightboxCard()) syncFullscreenImage(true);
      }
    });

    const distance = (touchA, touchB) => {
      const dx = touchA.clientX - touchB.clientX;
      const dy = touchA.clientY - touchB.clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    dom.lightboxImageStage.addEventListener('touchstart', (e) => {
      if (!dom.lightboxImageDialog.open) return;
      if (e.touches.length === 2) {
        fsPinchStartDistance = distance(e.touches[0], e.touches[1]);
        fsPinchStartScale = fsScale;
        fsStartTime = 0;
        return;
      }
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      fsStartX = touch.clientX;
      fsStartY = touch.clientY;
      fsStartTime = Date.now();
      fsStartTranslateX = fsTranslateX;
      fsStartTranslateY = fsTranslateY;
    }, { passive: true });

    dom.lightboxImageStage.addEventListener('touchmove', (e) => {
      if (!dom.lightboxImageDialog.open) return;
      if (e.touches.length === 2) {
        const currentDistance = distance(e.touches[0], e.touches[1]);
        if (!fsPinchStartDistance) {
          fsPinchStartDistance = currentDistance;
          fsPinchStartScale = fsScale;
          return;
        }
        const nextScale = fsPinchStartScale * (currentDistance / fsPinchStartDistance);
        fsScale = Math.max(1, Math.min(4, nextScale));
        if (fsScale === 1) {
          fsTranslateX = 0;
          fsTranslateY = 0;
        }
        applyFullscreenTransform();
        e.preventDefault();
        return;
      }

      if (e.touches.length !== 1 || fsScale <= 1) return;
      const touch = e.touches[0];
      fsTranslateX = fsStartTranslateX + (touch.clientX - fsStartX);
      fsTranslateY = fsStartTranslateY + (touch.clientY - fsStartY);
      applyFullscreenTransform();
      e.preventDefault();
    }, { passive: false });

    dom.lightboxImageStage.addEventListener('touchend', (e) => {
      if (!dom.lightboxImageDialog.open) return;

      if (e.touches.length === 0) {
        fsPinchStartDistance = 0;
      }

      if (!fsStartTime || e.changedTouches.length !== 1 || fsScale > 1) return;

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - fsStartX;
      const deltaY = touch.clientY - fsStartY;
      const elapsed = Date.now() - fsStartTime;
      fsStartTime = 0;

      const minHorizontal = 52;
      const maxVertical = 44;
      const isHorizontalSwipe = Math.abs(deltaX) >= minHorizontal
        && Math.abs(deltaY) <= maxVertical
        && elapsed <= 700;

      if (isHorizontalSwipe) {
        if (deltaX > 0) {
          if (goPrevLightboxCard()) syncFullscreenImage(true);
        } else {
          if (goNextLightboxCard()) syncFullscreenImage(true);
        }
        return;
      }

      const isSwipeDownClose = deltaY >= 78
        && Math.abs(deltaX) <= 52
        && elapsed <= 700;
      if (isSwipeDownClose) {
        closeFullscreenImage();
      }
    }, { passive: true });
  }

  async function lightboxToggle(isG, checked) {
    const card = state.cards[state.lightboxIndex];
    if (!card) return;
    const key = collectionKeyOf(card);
    const article = dom.cards.querySelector(`[data-card-index="${state.lightboxIndex}"]`);
    let db = state.dbMap.get(key) || emptyCollectionEntry(card, key);
    const prevState = { g: Boolean(db?.g), rh: Boolean(db?.rh) };
    const shouldEnsureImportedSet = checked && (Boolean(state.pendingSearchSetImport) || !Boolean(state.currentSet?.imported));
    if (shouldEnsureImportedSet) {
      const setToImport = state.currentSet;
      const setId = setToImport?.setId;
      if (!setId) return;
      setLoading(true, `Importiere ${setToImport.setName}`);
      try {
        const importPayload = await fetchMergedCardsWithSetMeta(setId).catch(() => ({ cards: [], setMetaPatch: null }));
        const importCards = Array.isArray(importPayload?.cards) ? importPayload.cards : [];
        if (!importCards.length) {
          throw new Error('Keine Kartendaten fuer den automatischen Set-Import gefunden.');
        }
        const refreshedSet = await actions.ensureSetImportedFromApi(setToImport, importCards, {
          setMetaPatch: importPayload?.setMetaPatch || null,
          showSuccessToast: true,
          successMessage: `${setToImport.setName} wurde automatisch importiert.`,
          source: 'lightbox'
        });
        state.currentSet = refreshedSet || { ...setToImport, imported: true };
        state.pendingSearchSetImport = false;
        state.dbMap = await readSetCollectionMap(state.currentSet.setName, { setId: state.currentSet.setId }).catch(() => new Map());
        cache.set(`db_${state.currentSet.setId}`, state.dbMap, CONFIG.CACHE_TTL_MS);
        db = state.dbMap.get(key) || db;
      } catch (err) {
        showToast(`Automatischer Set-Import fehlgeschlagen: ${err.message || err}`, 'error', 4200);
        renderLightbox(state.lightboxIndex);
        return;
      } finally {
        setLoading(false);
      }
    }
    setCardSaveState(article, 'saving');
    beginTrackedWrite(`Lightbox #${db?.displayId || key}`);
    try {
      await ensureWritableCollectionEntry(state.currentSet, db, key);
      state.dbMap.set(key, db);
      if (!isG && !db?.rhCell) {
        renderLightbox(state.lightboxIndex);
        setCardSaveState(article, 'idle');
        finishTrackedWrite(`Lightbox #${db?.displayId || key}`, null);
        return;
      }
      const nextState = resolveCollectionToggleState(db, { isG, checked });
      await writeCollectionEntryState(state.currentSet.setName, db, nextState);
      renderLightbox(state.lightboxIndex);
      if (article) updateCardState(article, db);
      updateStats();
      state.summaryData = null;
      pushUndoEntry({
        setId: state.currentSet?.setId,
        setName: state.currentSet?.setName,
        label: 'Lightbox-aenderung',
        changes: [{ key, prev: prevState, next: { g: Boolean(db.g), rh: Boolean(db.rh) } }]
      });
      updateUndoUi();
      broadcastRealtimeCardUpdate(key, db);
      runSearch({ force: true });
      setCardSaveState(article, 'saved');
      finishTrackedWrite(`Lightbox #${db?.displayId || key}`, null);
    } catch (err) {
      reportCollectionWriteError(err, 'Fehler');
      renderLightbox(state.lightboxIndex); // revert UI
      setCardSaveState(article, 'error');
      finishTrackedWrite(`Lightbox #${db?.displayId || key}`, err);
    }
  }

  dom.lightboxGCheck.addEventListener('change',  () => lightboxToggle(true,  dom.lightboxGCheck.checked));
  dom.lightboxRhCheck.addEventListener('change', () => lightboxToggle(false, dom.lightboxRhCheck.checked));
}
