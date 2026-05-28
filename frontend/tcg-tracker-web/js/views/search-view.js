export function shouldDismissMobileSearchKeyboard() {
  try {
    return Boolean(
      window.matchMedia?.('(pointer: coarse)')?.matches
      || /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent || '')
    );
  } catch {
    return false;
  }
}

export function dismissSearchAutocomplete({ dom, blurInput = false } = {}) {
  const list = document.getElementById('search-autocomplete');
  if (list) {
    list.classList.add('hidden');
  }

  if (blurInput && dom?.searchInput && typeof dom.searchInput.blur === 'function') {
    window.requestAnimationFrame(() => dom.searchInput?.blur());
  }
}

export function initSearchView({
  dom,
  runSearch,
  getSearchScopeMode,
  renderSearchSetFilterOptions,
  state,
  dismissAutocomplete,
  shouldDismissKeyboard,
  searchInputDebounceMs,
  searchScopeImported
}) {
  let debounce;

  dom.searchInput.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => runSearch(), searchInputDebounceMs);
  });

  dom.searchSetFilter.addEventListener('change', () => {
    if (dom.searchScopeMode) {
      dom.searchScopeMode.value = getSearchScopeMode();
    }
    state.searchCache.clear();
    runSearch({ force: true });
  });

  dom.searchScopeMode?.addEventListener('change', () => {
    const selectedMode = String(dom.searchScopeMode?.value || searchScopeImported);
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
      dismissAutocomplete({ blurInput: shouldDismissKeyboard() });
      runSearch({ force: true });
    }
  });
}