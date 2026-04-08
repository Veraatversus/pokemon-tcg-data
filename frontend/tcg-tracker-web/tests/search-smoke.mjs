import {
  withBrowser,
  gotoReady,
  waitForSelectorStable,
  isLoggedIn,
  BASE_URL,
} from './smoke-utils.mjs';

const pause = (page, ms) => page.waitForTimeout(ms);
const normalize = (value) => String(value || '').toLowerCase().trim();

function includesAny(haystacks, needles = []) {
  const safeHaystacks = haystacks.map((entry) => normalize(entry)).filter(Boolean);
  return needles.some((needle) => {
    const safeNeedle = normalize(needle);
    return safeNeedle && safeHaystacks.some((entry) => entry.includes(safeNeedle));
  });
}

async function waitForSearchView(page) {
  await page.waitForFunction(() => {
    const view = document.getElementById('view-search');
    return !!view && !view.classList.contains('hidden');
  }, undefined, { timeout: 15000, polling: 200 });

  await waitForSelectorStable(page, '#search-input');
  await waitForSelectorStable(page, '#search-set-filter');
}

async function gotoDashboard(page) {
  await page.evaluate(() => {
    window.location.hash = '#dashboard';
  });
  await pause(page, 350);
  await waitForSelectorStable(page, '#dash-filter');
  await page.locator('[data-dashboard-view="all"]').click().catch(() => {});
  await pause(page, 150);
}

async function setScope(page, value) {
  await page.locator('#search-set-filter').selectOption(`scope:${value}`);
  await pause(page, 250);
}

async function setSetFilter(page, value = '') {
  if (!value) return;
  await page.locator('#search-set-filter').selectOption(value);
  await pause(page, 250);
}

async function waitForSearchSettled(page) {
  await page.waitForFunction(() => !document.querySelector('#search-results .loading-placeholder'), undefined, {
    timeout: 30000,
    polling: 200,
  });
  await pause(page, 300);
}

async function collectSearchState(page) {
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('#search-results .search-result-card')).slice(0, 8).map((node) => ({
      title: node.querySelector('.title')?.textContent?.trim() || '',
      set: node.querySelector('.search-set-tag')?.textContent?.trim() || '',
      status: node.querySelector('.search-status')?.textContent?.trim() || '',
    }));

    const suggestions = Array.from(document.querySelectorAll('#search-autocomplete .search-ac-item')).slice(0, 8).map((node) => ({
      label: node.querySelector('.ac-label')?.textContent?.trim() || '',
      meta: node.querySelector('.ac-meta')?.textContent?.trim() || '',
      badge: node.querySelector('.ac-badge')?.textContent?.trim() || '',
      type: Array.from(node.classList).find((entry) => entry.startsWith('search-ac-item--'))?.replace('search-ac-item--', '') || '',
    }));

    return {
      count: cards.length,
      cards,
      suggestions,
      countText: document.querySelector('#search-results .search-result-count')?.textContent?.trim() || '',
      badgeText: document.querySelector('#search-results .search-mode-badge')?.textContent?.trim() || '',
      emptyText: document.querySelector('#search-results .empty-state')?.textContent?.trim() || '',
      inputValue: document.querySelector('#search-input')?.value || '',
      setFilterValue: document.querySelector('#search-set-filter')?.value || '',
      scopeValue: document.querySelector('#search-scope-mode')?.value || '',
    };
  });
}

async function runSearchCase(page, name, query, options = {}) {
  const { scope = 'online', setFilter = '', minResults = 1, expectedTexts = [] } = options;

  await setScope(page, scope);
  await setSetFilter(page, setFilter);
  await page.locator('#search-input').fill(query);
  await pause(page, 150);
  await page.locator('#search-input').press('Enter').catch(() => {});
  await waitForSearchSettled(page);

  const state = await collectSearchState(page);
  if (state.count < minResults) {
    throw new Error(`[${name}] Erwartet mindestens ${minResults} Ergebnisse für "${query}", erhalten: ${state.count}. ${state.emptyText || state.countText}`);
  }

  if (expectedTexts.length) {
    const haystacks = state.cards.flatMap((entry) => [entry.title, entry.set, entry.status]);
    if (!includesAny(haystacks, expectedTexts)) {
      throw new Error(`[${name}] Top-Ergebnisse passen nicht zu "${query}". Erwartet eines von: ${expectedTexts.join(', ')} | Erhalten: ${JSON.stringify(state.cards)}`);
    }
  }

  return {
    name,
    query,
    scope,
    setFilter,
    count: state.count,
    countText: state.countText,
    badgeText: state.badgeText,
    topResults: state.cards,
  };
}

async function runProgressiveSearchCase(page, name, query, options = {}) {
  const { scope = 'online', setFilter = '' } = options;

  await setScope(page, scope);
  await setSetFilter(page, setFilter);
  await page.locator('#search-input').fill(query);
  await pause(page, 150);
  await page.locator('#search-input').press('Enter').catch(() => {});

  let progressiveSeen = false;
  try {
    await page.waitForFunction(() => {
      const cards = document.querySelectorAll('#search-results .search-result-card').length;
      const loading = Boolean(document.querySelector('#search-results .loading-placeholder'));
      return cards > 0 && loading;
    }, undefined, { timeout: 12000, polling: 150 });
    progressiveSeen = true;
  } catch {
    progressiveSeen = false;
  }

  const loadingSnapshots = [];
  if (progressiveSeen) {
    const loadingProbeStart = Date.now();
    while (Date.now() - loadingProbeStart < 1800) {
      const loadingState = await page.evaluate(() => ({
        loading: Boolean(document.querySelector('#search-results .loading-placeholder')),
        titles: Array.from(document.querySelectorAll('#search-results .search-result-card .title'))
          .slice(0, 5)
          .map((node) => node.textContent?.trim() || '')
          .filter(Boolean),
      }));

      if (loadingState.loading && loadingState.titles.length) {
        loadingSnapshots.push(loadingState.titles);
      }
      if (!loadingState.loading && loadingSnapshots.length) {
        break;
      }
      await pause(page, 180);
    }
  }

  await waitForSearchSettled(page);
  const finalState = await collectSearchState(page);
  const reorderEvents = loadingSnapshots.reduce((count, titles, index) => {
    if (index === 0) return count;
    const previousTitles = loadingSnapshots[index - 1] || [];
    const comparableLength = Math.min(previousTitles.length, titles.length);
    const prefixChanged = previousTitles
      .slice(0, comparableLength)
      .some((title, titleIndex) => titles[titleIndex] !== title);
    return prefixChanged ? count + 1 : count;
  }, 0);

  if (!progressiveSeen) {
    throw new Error(`[${name}] Während der laufenden Suche wurden keine Treffer parallel zum Ladehinweis angezeigt. Finaler Zustand: ${JSON.stringify(finalState)}`);
  }

  if (reorderEvents > 1) {
    throw new Error(`[${name}] Die Reihenfolge der sichtbaren Treffer hat sich während der laufenden Suche zu oft verändert (${reorderEvents}x): ${JSON.stringify(loadingSnapshots)}`);
  }

  if (finalState.count < 1) {
    throw new Error(`[${name}] Die progressive Suche lieferte am Ende keine Treffer für "${query}".`);
  }

  return {
    name,
    query,
    scope,
    setFilter,
    count: finalState.count,
    countText: finalState.countText,
    badgeText: finalState.badgeText,
    progressiveSeen,
    reorderEvents,
    topResults: finalState.cards,
  };
}

async function runDashboardCase(page, name, query, expectedTexts = []) {
  await gotoDashboard(page);
  await page.locator('#dash-filter').fill(query);
  await pause(page, 450);

  const state = await page.evaluate(() => ({
    names: Array.from(document.querySelectorAll('.dash-set-name')).slice(0, 12).map((node) => node.textContent?.trim() || ''),
    series: Array.from(document.querySelectorAll('.dash-set-series')).slice(0, 12).map((node) => node.textContent?.trim() || ''),
    emptyText: document.querySelector('#dashboard-grid .empty-state')?.textContent?.trim() || '',
  }));

  const haystacks = [...state.names, ...state.series];
  if (!haystacks.length) {
    throw new Error(`[${name}] Keine Dashboard-Sets sichtbar für "${query}". ${state.emptyText}`);
  }
  if (expectedTexts.length && !includesAny(haystacks, expectedTexts)) {
    throw new Error(`[${name}] Dashboard-Suche passt nicht zu "${query}". Erwartet eines von: ${expectedTexts.join(', ')} | Erhalten: ${JSON.stringify(state)}`);
  }

  await page.locator('#dash-filter').fill('');
  await pause(page, 150);

  return {
    name,
    query,
    topNames: state.names,
    topSeries: state.series,
  };
}

async function runGoToSetCase(page, name, query) {
  await page.evaluate(() => {
    window.location.hash = '#search';
  });
  await pause(page, 350);
  await waitForSearchView(page);

  await setScope(page, 'online');
  await setSetFilter(page, '');
  await page.locator('#search-input').fill(query);
  await pause(page, 150);
  await page.locator('#search-input').press('Enter').catch(() => {});
  await waitForSearchSettled(page);

  const candidate = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('#search-results .search-result-card'));
    const index = cards.findIndex((node) => (node.querySelector('.search-status')?.textContent || '').includes('API'));
    if (index < 0) return null;
    const node = cards[index];
    return {
      index,
      title: node.querySelector('.title')?.textContent?.trim() || '',
      set: node.querySelector('.search-set-tag')?.textContent?.trim() || '',
    };
  });

  if (!candidate) {
    throw new Error(`[${name}] Kein API-Suchergebnis mit "Zum Set" gefunden.`);
  }

  await page.locator('#search-results .search-result-card').nth(candidate.index).locator('.search-actions button').click();
  await pause(page, 900);

  const state = await page.evaluate((candidateTitle) => {
    const matchingCard = Array.from(document.querySelectorAll('#cards .card')).find((node) => {
      const title = node.querySelector('.title')?.textContent?.trim() || '';
      return title === candidateTitle;
    });
    const rect = matchingCard?.getBoundingClientRect?.();
    return {
      hash: window.location.hash,
      selectorValue: document.getElementById('set-selector')?.value || '',
      cardCount: document.querySelectorAll('#cards .card').length,
      statusText: document.getElementById('status')?.textContent?.trim() || '',
      navText: document.getElementById('nav-set-link')?.textContent?.trim() || '',
      setViewVisible: !document.getElementById('view-set')?.classList.contains('hidden'),
      targetCardFound: Boolean(matchingCard),
      targetCardVisible: Boolean(rect && rect.bottom > 0 && rect.top < window.innerHeight),
    };
  }, candidate.title);

  if (!state.setViewVisible || !state.hash.startsWith('#set/')) {
    throw new Error(`[${name}] Set-Ansicht wurde nach "Zum Set" nicht geöffnet: ${JSON.stringify(state)}`);
  }
  if (!state.selectorValue || state.cardCount < 1) {
    throw new Error(`[${name}] API-Treffer „${candidate.title}“ aus „${candidate.set}“ lädt das Ziel-Set nicht korrekt: ${JSON.stringify(state)}`);
  }
  if (!state.targetCardFound || !state.targetCardVisible) {
    throw new Error(`[${name}] Die gefundene Karte „${candidate.title}“ wird nach "Zum Set" nicht direkt sichtbar gemacht: ${JSON.stringify(state)}`);
  }

  await page.evaluate(() => {
    window.location.hash = '#search';
  });
  await pause(page, 350);
  await waitForSearchView(page);
  await setScope(page, 'imported');
  await setSetFilter(page, state.selectorValue);
  await page.locator('#search-input').fill(query);
  await pause(page, 150);
  await page.locator('#search-input').press('Enter').catch(() => {});
  await waitForSearchSettled(page);

  const importedSearchState = await collectSearchState(page);
  const importedHasApiBadge = importedSearchState.cards.some((entry) => /api/i.test(entry.status || ''));

  if (importedSearchState.count < 1 || importedHasApiBadge || importedSearchState.setFilterValue !== state.selectorValue) {
    throw new Error(`[${name}] Das API-Set wurde nach dem Öffnen nicht korrekt in die importierte Suche übernommen: ${JSON.stringify({ candidate, state, importedSearchState })}`);
  }

  await gotoDashboard(page);
  await page.locator('#dash-filter').fill(candidate.set);
  await pause(page, 450);

  const dashboardState = await page.evaluate((candidateSet) => {
    const cards = Array.from(document.querySelectorAll('.dash-set-card'));
    const match = cards.find((node) => {
      const title = node.querySelector('.dash-set-name')?.textContent?.trim() || '';
      return title === candidateSet;
    });
    return {
      found: Boolean(match),
      progressText: match?.querySelector('.dash-progress-text')?.textContent?.trim() || '',
      hasImportButton: Boolean(match?.querySelector('.dash-import-btn')),
      hasDeleteButton: Boolean(match?.querySelector('.dash-delete-btn')),
    };
  }, candidate.set);

  if (!dashboardState.found || dashboardState.hasImportButton || /nicht importiert/i.test(dashboardState.progressText)) {
    throw new Error(`[${name}] Dashboard/Statistik zeigt das API-Set nach dem Suchtreffer noch nicht als importiert an: ${JSON.stringify({ candidate, dashboardState })}`);
  }

  return {
    name,
    query,
    candidate,
    state,
    importedSearchState,
    dashboardState,
  };
}

async function run() {
  await withBrowser(async (page) => {
    await gotoReady(page, `${BASE_URL}?nocache=${Date.now()}#search`);

    const loggedIn = await isLoggedIn(page);
    if (!loggedIn) {
      throw new Error('Keine aktive Login-Session gefunden. Bitte zuerst `npm run pw:open:persistent` nutzen und auf localhost:8080 anmelden.');
    }

    await waitForSearchView(page);
    await page.evaluate(() => {
      window.SEARCH_HISTORY = [];
    });

    const report = [];

    await setScope(page, 'all');
    await setSetFilter(page, '');
    await page.locator('#search-input').fill('b');
    await pause(page, 300);

    const autocompleteState = await collectSearchState(page);
    if (!autocompleteState.suggestions.length) {
      throw new Error('Autocomplete liefert für einen Kurz-Query keine Vorschläge.');
    }
    const suggestionTexts = autocompleteState.suggestions.flatMap((entry) => [entry.label, entry.meta, entry.badge]);
    if (!suggestionTexts.some((entry) => normalize(entry).includes('b'))) {
      throw new Error(`Autocomplete-Vorschläge passen nicht zum Kurz-Query: ${JSON.stringify(autocompleteState.suggestions)}`);
    }

    await page.locator('#search-input').blur();
    await pause(page, 120);
    const dropdownStillVisible = await page.evaluate(() => {
      const node = document.getElementById('search-autocomplete');
      return !!node && !node.classList.contains('hidden');
    });
    if (!dropdownStillVisible) {
      throw new Error('Autocomplete verschwindet zu schnell nach einem kurzen Blur.');
    }

    await page.locator('#search-input').press('Enter').catch(() => {});
    await pause(page, 150);
    const autocompleteAfterSubmit = await page.evaluate(() => {
      const node = document.getElementById('search-autocomplete');
      return {
        hidden: !node || node.classList.contains('hidden'),
        activeElementId: document.activeElement?.id || '',
      };
    });
    if (!autocompleteAfterSubmit.hidden) {
      throw new Error(`Autocomplete bleibt nach Enter sichtbar: ${JSON.stringify(autocompleteAfterSubmit)}`);
    }

    report.push({
      name: 'autocomplete_short_query',
      query: 'b',
      suggestions: autocompleteState.suggestions,
      afterSubmit: autocompleteAfterSubmit,
    });

    report.push(await runProgressiveSearchCase(page, 'progressive_online_results', 'Charizard', {
      scope: 'online',
    }));

    report.push(await runSearchCase(page, 'english_name_online', 'Charizard', {
      scope: 'online',
      expectedTexts: ['charizard'],
    }));

    await page.locator('#search-input').fill('char');
    await pause(page, 300);
    const cardAutocompleteState = await collectSearchState(page);
    const cardSuggestionIndex = cardAutocompleteState.suggestions.findIndex((item) => item.type === 'card');
    if (cardSuggestionIndex < 0) {
      throw new Error(`Keine Karten-Vorschläge für "char" gefunden: ${JSON.stringify(cardAutocompleteState.suggestions)}`);
    }
    const cardSuggestion = cardAutocompleteState.suggestions[cardSuggestionIndex];
    await page.locator('#search-autocomplete .search-ac-item').nth(cardSuggestionIndex).dispatchEvent('mousedown');
    await pause(page, 150);
    await waitForSearchSettled(page);
    const cardClickState = await collectSearchState(page);
    if (cardClickState.count < 1) {
      throw new Error(`Karten-Vorschlag "${cardSuggestion.label}" lieferte keine Ergebnisse.`);
    }
    const cardNeedles = [cardSuggestion.label, cardSuggestion.meta, cardSuggestion.badge].filter(Boolean);
    const cardHaystacks = cardClickState.cards.flatMap((entry) => [entry.title, entry.set, entry.status]);
    if (!includesAny(cardHaystacks, cardNeedles)) {
      throw new Error(`Karten-Vorschlag "${cardSuggestion.label}" liefert nicht die erwarteten Treffer: ${JSON.stringify(cardClickState.cards)}`);
    }

    report.push({
      name: 'autocomplete_card_click',
      query: 'char',
      selectedValue: cardClickState.inputValue,
      resultCount: cardClickState.count,
      topResults: cardClickState.cards,
      suggestions: cardAutocompleteState.suggestions,
    });

    await page.locator('#search-input').fill('base');
    await pause(page, 300);
    const setAutocompleteState = await collectSearchState(page);
    const setSuggestionIndex = setAutocompleteState.suggestions.findIndex((item) => item.type === 'set');
    if (setSuggestionIndex < 0) {
      throw new Error(`Keine Set-Vorschläge für "base" gefunden: ${JSON.stringify(setAutocompleteState.suggestions)}`);
    }
    const setSuggestion = setAutocompleteState.suggestions[setSuggestionIndex];
    await page.locator('#search-autocomplete .search-ac-item').nth(setSuggestionIndex).dispatchEvent('mousedown');
    await pause(page, 150);
    await waitForSearchSettled(page);
    const setClickState = await collectSearchState(page);
    if (setClickState.count < 1) {
      throw new Error(`Set-Vorschlag "${setSuggestion.label}" lieferte keine Ergebnisse.`);
    }
    const setNeedles = [setSuggestion.label, setSuggestion.meta, setSuggestion.badge].filter(Boolean);
    const setHaystacks = setClickState.cards.flatMap((entry) => [entry.title, entry.set, entry.status]);
    if (!includesAny(setHaystacks, setNeedles)) {
      throw new Error(`Set-Vorschlag "${setSuggestion.label}" liefert nicht die erwarteten Treffer: ${JSON.stringify(setClickState.cards)}`);
    }

    report.push({
      name: 'autocomplete_set_click',
      query: 'base',
      selectedValue: setClickState.inputValue,
      setFilterValue: setClickState.setFilterValue,
      resultCount: setClickState.count,
      topResults: setClickState.cards,
      suggestions: setAutocompleteState.suggestions,
    });

    report.push(await runSearchCase(page, 'german_name_online', 'Glurak', {
      scope: 'online',
      expectedTexts: ['charizard', 'glurak'],
    }));

    report.push(await runDashboardCase(page, 'dashboard_ptcgo_code', 'SVI', ['Scarlet & Violet', 'Karmesin & Purpur']));
    report.push(await runDashboardCase(page, 'dashboard_loose_punctuation', 'scarlet violet', ['Scarlet & Violet', 'Karmesin & Purpur']));
    report.push(await runGoToSetCase(page, 'api_result_go_to_set', 'Charizard'));

    report.push(await runSearchCase(page, 'set_name_all_sets', 'Base Set', {
      scope: 'all',
      expectedTexts: ['base set'],
    }));

    report.push(await runSearchCase(page, 'structured_set_number', 'base1 4', {
      scope: 'online',
      expectedTexts: ['base set', 'charizard', '4 –'],
    }));

    report.push(await runSearchCase(page, 'mixed_name_number', 'charizard 4', {
      scope: 'online',
      expectedTexts: ['charizard', '4 –'],
    }));

    await setScope(page, 'imported');
    const firstImported = await page.evaluate(() => {
      const option = Array.from(document.querySelectorAll('#search-set-filter option')).find((node) => node.value);
      return option ? { value: option.value, label: option.textContent?.trim() || '' } : null;
    });

    if (firstImported?.value && firstImported?.label) {
      report.push(await runSearchCase(page, 'imported_scope_with_filter', firstImported.label, {
        scope: 'imported',
        setFilter: firstImported.value,
        expectedTexts: [firstImported.label],
      }));
    }


    console.log('✅ Search Smoke OK');
    console.log(JSON.stringify(report, null, 2));
  });
}

run().catch((err) => {
  console.error('❌ Search Smoke fehlgeschlagen:', err);
  process.exitCode = 1;
});