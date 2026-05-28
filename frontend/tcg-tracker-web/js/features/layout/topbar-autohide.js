export function createTopbarAutoHideController({
  topbar,
  documentRef = document,
  windowRef = window,
} = {}) {
  const isEditableElement = (element) => {
    if (!element || typeof element !== 'object') return false;
    const tagName = String(element.tagName || '').toUpperCase();
    if (tagName === 'TEXTAREA') return true;
    if (tagName === 'INPUT') {
      const type = String(element.type || 'text').toLowerCase();
      return !['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'].includes(type);
    }
    return element.isContentEditable === true;
  };

  const isLikelyMobileViewport = () => {
    const coarsePointer = windowRef.matchMedia?.('(pointer: coarse)')?.matches;
    const maxWidth = windowRef.matchMedia?.('(max-width: 900px)')?.matches;
    return Boolean(coarsePointer || maxWidth);
  };

  function initAutoHideTopbar() {
    const topbarElement = topbar || documentRef.querySelector('.topbar');
    if (!topbarElement) return;

    const root = documentRef.documentElement;
    const body = documentRef.body;
    const hideClass = 'topbar-collapsed';
    const reducedMotion = windowRef.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    const scroller = documentRef.scrollingElement || documentRef.documentElement;
    const getScrollY = () => Math.max(
      windowRef.scrollY || 0,
      scroller?.scrollTop || 0,
      documentRef.documentElement?.scrollTop || 0,
      documentRef.body?.scrollTop || 0
    );

    let lastY = Math.max(getScrollY(), 0);
    let direction = 0;
    let accumulated = 0;
    let ticking = false;
    let visibilityLockedUntil = 0;
    let keyboardForceCollapsed = false;

    const getViewportHeight = () => {
      const vvHeight = Number(windowRef.visualViewport?.height);
      if (Number.isFinite(vvHeight) && vvHeight > 0) return vvHeight;
      const innerHeight = Number(windowRef.innerHeight);
      return Number.isFinite(innerHeight) && innerHeight > 0 ? innerHeight : 0;
    };

    let baselineViewportHeight = getViewportHeight();

    const syncTopbarHeight = () => {
      root.style.setProperty('--topbar-height', `${topbarElement.offsetHeight}px`);
    };

    const showTopbar = () => {
      body.classList.remove(hideClass);
      visibilityLockedUntil = Date.now() + 180;
    };

    const hideTopbar = () => {
      body.classList.add(hideClass);
      visibilityLockedUntil = Date.now() + 180;
    };

    const detectKeyboardOpen = () => {
      if (!isLikelyMobileViewport()) return false;
      const visualViewport = windowRef.visualViewport;
      if (!visualViewport) return false;

      const activeElement = documentRef.activeElement;
      const hasEditableFocus = isEditableElement(activeElement);
      if (!hasEditableFocus) return false;

      const viewportHeight = Number(visualViewport.height);
      if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) return false;

      const baseline = Math.max(baselineViewportHeight || 0, Number(windowRef.innerHeight) || 0, viewportHeight);
      const keyboardInset = baseline - viewportHeight;
      return keyboardInset > 120;
    };

    const syncKeyboardDrivenCollapse = () => {
      const isKeyboardOpen = detectKeyboardOpen();
      keyboardForceCollapsed = isKeyboardOpen;
      if (isKeyboardOpen) {
        hideTopbar();
      } else {
        showTopbar();
      }
    };

    const onScrollFrame = () => {
      ticking = false;
      const currentY = Math.max(getScrollY(), 0);
      const delta = currentY - lastY;
      const isNearTop = currentY < 88;
      const now = Date.now();

      if (keyboardForceCollapsed) {
        hideTopbar();
        lastY = currentY;
        return;
      }

      if (reducedMotion) {
        showTopbar();
        lastY = currentY;
        return;
      }

      if (isNearTop) {
        showTopbar();
        direction = 0;
        accumulated = 0;
        lastY = currentY;
        return;
      }

      if (Math.abs(delta) < 1) {
        lastY = currentY;
        return;
      }

      if (now < visibilityLockedUntil) {
        lastY = currentY;
        return;
      }

      const nextDirection = delta > 0 ? 1 : -1;
      if (nextDirection === direction) {
        accumulated += Math.abs(delta);
      } else {
        direction = nextDirection;
        accumulated = Math.abs(delta);
      }

      if (direction > 0 && accumulated > 36 && currentY > 120) {
        hideTopbar();
        accumulated = 0;
      } else if (direction < 0 && accumulated > 18) {
        showTopbar();
        accumulated = 0;
      }

      lastY = currentY;
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      windowRef.requestAnimationFrame(onScrollFrame);
    };

    const onKeyboardViewportChange = () => {
      const nextHeight = getViewportHeight();
      if (!keyboardForceCollapsed && nextHeight > 0) {
        baselineViewportHeight = Math.max(baselineViewportHeight, nextHeight);
      }
      syncKeyboardDrivenCollapse();
    };

    const onFocusIn = () => {
      syncKeyboardDrivenCollapse();
    };

    const onFocusOut = () => {
      windowRef.requestAnimationFrame(() => {
        syncKeyboardDrivenCollapse();
      });
    };

    syncTopbarHeight();
    showTopbar();
    windowRef.addEventListener('resize', syncTopbarHeight, { passive: true });
    windowRef.addEventListener('resize', onKeyboardViewportChange, { passive: true });
    windowRef.addEventListener('orientationchange', syncTopbarHeight, { passive: true });
    windowRef.addEventListener('orientationchange', onKeyboardViewportChange, { passive: true });
    windowRef.addEventListener('hashchange', showTopbar, { passive: true });
    windowRef.addEventListener('scroll', onScroll, { passive: true });
    windowRef.visualViewport?.addEventListener?.('resize', onKeyboardViewportChange, { passive: true });
    windowRef.visualViewport?.addEventListener?.('scroll', onKeyboardViewportChange, { passive: true });
    documentRef.addEventListener('focusin', onFocusIn, { passive: true });
    documentRef.addEventListener('focusout', onFocusOut, { passive: true });
  }

  return {
    initAutoHideTopbar,
  };
}