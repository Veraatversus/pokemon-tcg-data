export function createSearchAutocompleteController({
  dom,
  state,
  featureInitFlags,
  normalizeSearchText,
  collectSearchStrings,
  cardNumberMatchesQuery,
  normalizeCardNumber,
  loadSearchHistory,
  addSearchHistory,
  getSetsForSearchMode,
  getSearchScopeMode,
  runSearch,
  dismissAutocomplete,
  shouldDismissKeyboard,
  documentRef = document,
  windowRef = window,
} = {}) {
  function initSearchAutocomplete() {
    if (featureInitFlags.autocomplete) return;
    featureInitFlags.autocomplete = true;

    const input = documentRef.getElementById('search-input');
    const list = documentRef.getElementById('search-autocomplete');
    if (!input || !list) return;

    let selectedIndex = -1;
    let activeItems = [];
    let hideTimer = null;

    const escapeHtml = (value) => String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    const clearHideTimer = () => {
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
    };

    const hideList = () => {
      clearHideTimer();
      list.classList.add('hidden');
    };

    const scheduleHide = () => {
      clearHideTimer();
      hideTimer = setTimeout(() => {
        list.classList.add('hidden');
      }, 220);
    };

    const pushCandidate = (map, candidate, score = 0) => {
      if (!candidate?.key || !candidate?.label) return;
      const existing = map.get(candidate.key);
      if (!existing || score > existing.score) {
        map.set(candidate.key, { ...candidate, score });
      }
    };

    const buildCandidates = (query) => {
      const normalizedQuery = normalizeSearchText(query).trim();
      const entries = new Map();
      const history = Array.isArray(windowRef.SEARCH_HISTORY) ? windowRef.SEARCH_HISTORY : loadSearchHistory();

      const addHistoryEntries = () => {
        history
          .filter((item) => !normalizedQuery || normalizeSearchText(item).includes(normalizedQuery))
          .slice(0, normalizedQuery ? 4 : 6)
          .forEach((item, index) => {
            pushCandidate(entries, {
              key: `history:${normalizeSearchText(item)}`,
              label: item,
              value: item,
              badge: 'Zuletzt',
              meta: 'Vorherige Suche',
              type: 'history'
            }, 120 - index);
          });
      };

      addHistoryEntries();

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

        pushCandidate(entries, {
          key: `set:${set?.setId || labelNorm}`,
          label,
          value: label,
          badge: set?.ptcgoCode || set?.setId || 'Set',
          meta: set?.series || set?.tcgdex_serie_name || 'Set',
          type: 'set',
          setId: set?.setId || ''
        }, score);
      });

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
          altNames.length ? `Alias: ${altNames.join(' · ')}` : ''
        ].filter(Boolean);

        pushCandidate(entries, {
          key: `card:${uniqueKey}`,
          label,
          value: label,
          badge: card?.number || card?.tcgdex_localId || 'Karte',
          meta: metaParts.join(' · '),
          type: 'card',
          setId: set?.setId || ''
        }, score);
      });

      return [...entries.values()]
        .sort((left, right) => {
          if (right.score !== left.score) return right.score - left.score;
          return String(left.label || '').localeCompare(String(right.label || ''), 'de', { sensitivity: 'base' });
        })
        .slice(0, 10);
    };

    const renderList = (items) => {
      activeItems = items;
      selectedIndex = -1;
      if (!items.length) {
        list.classList.add('hidden');
        list.innerHTML = '';
        return;
      }

      list.innerHTML = items.map((item, index) => `
        <li class="search-ac-item search-ac-item--${escapeHtml(item.type)}" role="option" data-idx="${index}">
          <span class="ac-main">
            <span class="ac-label">${escapeHtml(item.label)}</span>
            ${item.meta ? `<small class="ac-meta">${escapeHtml(item.meta)}</small>` : ''}
          </span>
          <span class="ac-badge">${escapeHtml(item.badge || '')}</span>
        </li>
      `).join('');
      list.classList.remove('hidden');
    };

    const applySelection = (item) => {
      if (!item) return;
      clearHideTimer();
      if (item.setId && dom.searchSetFilter) {
        const hasOption = [...dom.searchSetFilter.options].some((option) => option.value === item.setId);
        if (hasOption) dom.searchSetFilter.value = item.setId;
      }
      input.value = item.value || item.label || '';
      list.classList.add('hidden');
      windowRef.SEARCH_HISTORY = addSearchHistory(input.value);
      runSearch({ force: true });
      input.focus();
    };

    input.addEventListener('focus', () => {
      clearHideTimer();
      renderList(buildCandidates(input.value));
    });

    input.addEventListener('input', () => {
      clearHideTimer();
      renderList(buildCandidates(input.value));
    });

    input.addEventListener('blur', scheduleHide);
    list.addEventListener('pointerenter', clearHideTimer);
    list.addEventListener('pointerleave', () => {
      if (documentRef.activeElement !== input) scheduleHide();
    });

    input.addEventListener('keydown', (event) => {
      if (list.classList.contains('hidden') && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        renderList(buildCandidates(input.value));
      }

      const items = [...list.querySelectorAll('.search-ac-item')];
      if (!items.length || list.classList.contains('hidden')) {
        if (event.key === 'Escape') hideList();
        if (event.key === 'Enter') dismissAutocomplete({ blurInput: shouldDismissKeyboard() });
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, 0);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        if (selectedIndex >= 0) {
          applySelection(activeItems[selectedIndex]);
        } else {
          dismissAutocomplete({ blurInput: shouldDismissKeyboard() });
        }
        return;
      } else if (event.key === 'Escape') {
        hideList();
        return;
      } else {
        return;
      }

      items.forEach((item, index) => item.classList.toggle('keyboard-focus', index === selectedIndex));
    });

    list.addEventListener('mousedown', (event) => {
      const item = event.target.closest('.search-ac-item');
      if (!item) return;
      event.preventDefault();
      const index = Number(item.dataset.idx || '-1');
      applySelection(activeItems[index]);
    });

    documentRef.addEventListener('pointerdown', (event) => {
      if (!input.contains(event.target) && !list.contains(event.target)) {
        scheduleHide();
      } else {
        clearHideTimer();
      }
    });
  }

  return {
    initSearchAutocomplete,
  };
}