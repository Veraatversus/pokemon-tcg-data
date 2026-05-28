export function updateSetStats({ state, dom, normalizeCardNumber, syncDashboardCardForSet }) {
  const total = state.cards.length;
  let collected = 0;
  let rh = 0;

  state.cards.forEach((card) => {
    const db = state.dbMap.get(normalizeCardNumber(card.number));
    if (db?.g) collected++;
    if (db?.rh) rh++;
  });

  const missing = total - collected;
  const percent = total > 0 ? Math.round((collected / total) * 100) : 0;
  dom.statTotal.textContent = total;
  dom.statCollected.textContent = collected;
  dom.statRh.textContent = rh;
  dom.statMissing.textContent = missing;
  dom.progressFill.style.width = `${percent}%`;
  dom.progressFill.closest('.progress-bar').setAttribute('aria-valuenow', percent);
  dom.progressText.innerHTML = `${collected}\u202f/\u202f${total} (${percent}\u00a0%)`;
  dom.statsSection.classList.remove('hidden');
  dom.filterSection.classList.remove('hidden');
  dom.sortSection.classList.remove('hidden');

  if (state.currentSet?.setName) {
    const summaryRow = {
      setName: state.currentSet.setName,
      total,
      collected,
      rh,
      percent
    };
    state.summaryOverrides.set(state.currentSet.setName, summaryRow);
    if (state.currentSet?.setId) {
      state.summaryOverrides.set(state.currentSet.setId, summaryRow);
    }
    if (Array.isArray(state.summaryData)) {
      const rowIndex = state.summaryData.findIndex((row) => row?.setName === state.currentSet.setName);
      if (rowIndex >= 0) {
        state.summaryData[rowIndex] = { ...state.summaryData[rowIndex], ...summaryRow };
      } else {
        state.summaryData.push(summaryRow);
      }
    }
    syncDashboardCardForSet(state.currentSet, summaryRow);
  }
}

export function applySetFilter({ state, dom }) {
  dom.cards.querySelectorAll('.card').forEach((article) => {
    const db = state.dbMap.get(article.dataset.cardId);
    let visible = true;
    if (state.filter === 'missing') visible = !db?.g;
    if (state.filter === 'missing-rh') {
      const isMissingCard = !db?.g;
      const isMissingReverse = Boolean(db?.g && db?.rhCell && !db?.rh);
      visible = isMissingCard || isMissingReverse;
    }
    if (state.filter === 'collected') visible = Boolean(db?.g);
    article.classList.toggle('hidden', !visible);
  });
}

export function applySetSortOrder({ state, dom, normalizeCardNumber }) {
  const articles = Array.from(dom.cards.querySelectorAll('.card'));
  const sortBy = state.sortOrder;
  articles.sort((a, b) => {
    const ka = a.dataset.cardId;
    const kb = b.dataset.cardId;
    const cardA = state.cards.find((c) => normalizeCardNumber(c.number) === ka);
    const cardB = state.cards.find((c) => normalizeCardNumber(c.number) === kb);
    if (sortBy === 'name') return (cardA?.name || '').localeCompare(cardB?.name || '');
    if (sortBy === 'status') {
      const ra = state.dbMap.get(ka)?.rh ? 2 : state.dbMap.get(ka)?.g ? 1 : 0;
      const rb = state.dbMap.get(kb)?.rh ? 2 : state.dbMap.get(kb)?.g ? 1 : 0;
      return rb - ra;
    }
    return String(cardA?.number || ka).localeCompare(String(cardB?.number || kb), undefined, { numeric: true, sensitivity: 'base' });
  });
  articles.forEach((a) => dom.cards.appendChild(a));
}

export function initSetFilterButtons({ documentRef, state, applyFilter }) {
  documentRef.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      documentRef.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.filter = btn.dataset.filter;
      applyFilter();
    });
  });
}

export function initSetSortControl({ dom, state, applySortOrder }) {
  dom.cardSort.addEventListener('change', () => {
    state.sortOrder = dom.cardSort.value;
    applySortOrder();
  });
}

export function syncLightboxModalStateView({ dom }) {
  const shouldLockScroll = Boolean(dom?.lightboxDialog?.open || dom?.lightboxImageDialog?.open);
  document.documentElement.classList.toggle('modal-scroll-locked', shouldLockScroll);
  document.body.classList.toggle('modal-scroll-locked', shouldLockScroll);
}

export function openLightboxDialogView({ dom, state, index, renderLightbox, syncLightboxModalState }) {
  if (!dom?.lightboxDialog) return;
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

export function closeLightboxDialogView({ dom, state, syncLightboxModalState }) {
  if (dom?.lightboxImageDialog?.open) {
    dom.lightboxImageDialog.close();
  }
  if (dom?.lightboxDialog?.open) {
    dom.lightboxDialog.close();
  }
  syncLightboxModalState();
  dom?.cards?.querySelector(`[data-card-index="${state?.lightboxIndex}"]`)?.focus();
}

export function initLightboxFullscreenView({
  dom,
  state,
  attachImageFallback,
  syncLightboxModalState,
  goPrevLightboxCard,
  goNextLightboxCard,
}) {
  if (!(dom?.lightboxImg && dom?.lightboxImageDialog && dom?.lightboxImageFull && dom?.lightboxImageStage && dom?.btnLightboxImageClose)) {
    return;
  }

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
    const fullscreenCard = {
      ...card,
      image: card.imageLarge || dom.lightboxImg?.currentSrc || card.image || '',
      imageCandidates: Array.isArray(card.imageLargeCandidates) && card.imageLargeCandidates.length
        ? card.imageLargeCandidates
        : (Array.isArray(card.imageCandidates) ? card.imageCandidates : [])
    };
    const fullscreenImage = String(fullscreenCard.image || '').trim();
    if (fullscreenImage) dom.lightboxImageFull.src = fullscreenImage;
    else dom.lightboxImageFull.removeAttribute('src');
    attachImageFallback(dom.lightboxImageFull, fullscreenCard, state.currentSet?.setId || '');
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

export function renderSetCardsView({
  state,
  dom,
  setEmptyState,
  normalizeCardNumber,
  createCardElementView,
  applyFilter,
  updateStats,
  revealPendingSearchCardFocus,
}) {
  dom.cards.innerHTML = '';
  if (!state.cards.length) { setEmptyState(true); return; }
  setEmptyState(false);
  const fragment = document.createDocumentFragment();
  state.cards.forEach((card, index) => {
    const key = normalizeCardNumber(card.number);
    fragment.appendChild(createCardElementView({
      card,
      key,
      db: state.dbMap.get(key),
      index,
      state,
    }));
  });
  dom.cards.appendChild(fragment);
  applyFilter();
  updateStats();
  revealPendingSearchCardFocus();
}

export function revealPendingSearchCardFocusView({ state, dom }) {
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