async page => {
  const baseUrl = 'http://localhost:8080';
  const freshUrl = `${baseUrl}/?nocache=${Date.now()}`;
  const pause = (ms) => page.waitForTimeout(ms);
  const normalize = (value) => String(value || '').toLowerCase().trim();

  async function gotoSearch() {
    await page.goto(`${freshUrl}#search`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await pause(500);
  }

  async function gotoDashboard() {
    await page.goto(`${freshUrl}#dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await pause(500);
    await page.locator('[data-dashboard-view="all"]').click().catch(() => {});
    await pause(150);
  }

  async function ensureLoggedIn() {
    const authState = await page.locator('#btn-auth').getAttribute('data-state').catch(() => null);
    if (authState !== 'out') {
      throw new Error('Keine aktive Google-Login-Session auf localhost:8080 gefunden. Bitte zuerst im persistenten Chrome-Fenster anmelden und den Audit danach erneut starten.');
    }

    await page.waitForFunction(() => {
      const view = document.getElementById('view-search');
      const input = document.getElementById('search-input');
      return !!view && !view.classList.contains('hidden') && !!input;
    }, undefined, { timeout: 15000 });
  }

  async function setScope(value) {
    await page.locator('#search-scope-mode').selectOption(value);
    await pause(250);
  }

  async function setSetFilter(value = '') {
    await page.locator('#search-set-filter').selectOption(value);
    await pause(250);
  }

  async function waitForSearchSettled() {
    await page.waitForFunction(() => !document.querySelector('#search-results .loading-placeholder'), undefined, {
      timeout: 30000,
      polling: 200,
    });
    await pause(300);
  }

  async function collectSearchState() {
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

  function includesAny(haystacks, needles = []) {
    const lowerHaystacks = haystacks.map((entry) => normalize(entry)).filter(Boolean);
    return needles.some((needle) => {
      const lowerNeedle = normalize(needle);
      return lowerNeedle && lowerHaystacks.some((entry) => entry.includes(lowerNeedle));
    });
  }

  async function runSearchCase(name, query, options = {}) {
    const { scope = 'online', setFilter = '', minResults = 1, expectedTexts = [] } = options;

    await setScope(scope);
    await setSetFilter(setFilter);
    await page.locator('#search-input').fill(query);
    await pause(150);
    await page.locator('#search-input').press('Enter').catch(() => {});
    await waitForSearchSettled();

    const state = await collectSearchState();
    if (state.count < minResults) {
      throw new Error(`[${name}] Erwartet mindestens ${minResults} Ergebnisse für "${query}", erhalten: ${state.count}. ${state.emptyText || state.countText}`);
    }

    if (expectedTexts.length) {
      const haystacks = state.cards.flatMap((entry) => [entry.title, entry.set, entry.status]);
      if (!includesAny(haystacks, expectedTexts)) {
        throw new Error(`[${name}] Die Top-Ergebnisse für "${query}" enthalten keinen erwarteten Treffer. Erwartet eines von: ${expectedTexts.join(', ')} | Erhalten: ${JSON.stringify(state.cards)}`);
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

  async function runDashboardCase(name, query, expectedTexts = []) {
    await gotoDashboard();
    await page.locator('#dash-filter').fill(query);
    await pause(450);

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
    await pause(150);

    return {
      name,
      query,
      topNames: state.names,
      topSeries: state.series,
    };
  }

  await gotoSearch();
  await ensureLoggedIn();
  await page.evaluate(() => {
    window.SEARCH_HISTORY = [];
  });

  const report = [];

  await setScope('all');
  await setSetFilter('');
  await page.locator('#search-input').fill('b');
  await pause(300);
  const autocompleteState = await page.evaluate(() => {
    const list = document.getElementById('search-autocomplete');
    const items = Array.from(list?.querySelectorAll('.search-ac-item') || []).slice(0, 8).map((node) => ({
      label: node.querySelector('.ac-label')?.textContent?.trim() || '',
      meta: node.querySelector('.ac-meta')?.textContent?.trim() || '',
      badge: node.querySelector('.ac-badge')?.textContent?.trim() || '',
      type: Array.from(node.classList).find((entry) => entry.startsWith('search-ac-item--'))?.replace('search-ac-item--', '') || '',
    }));
    return {
      visible: !!list && !list.classList.contains('hidden'),
      items,
    };
  });

  if (!autocompleteState.visible || autocompleteState.items.length === 0) {
    throw new Error('Autocomplete liefert für einen Kurz-Query keine sichtbaren Vorschläge.');
  }
  const suggestionTexts = autocompleteState.items.flatMap((entry) => [entry.label, entry.meta, entry.badge]);
  if (!suggestionTexts.some((entry) => normalize(entry).includes('b'))) {
    throw new Error(`Autocomplete-Vorschläge passen nicht zum Kurz-Query: ${JSON.stringify(autocompleteState.items)}`);
  }

  await page.locator('#search-input').blur();
  await pause(120);
  const dropdownStillVisible = await page.evaluate(() => {
    const list = document.getElementById('search-autocomplete');
    return !!list && !list.classList.contains('hidden');
  });
  if (!dropdownStillVisible) {
    throw new Error('Autocomplete verschwindet zu schnell nach einem kurzen Blur.');
  }

  report.push({
    name: 'autocomplete_short_query',
    query: 'b',
    suggestions: autocompleteState.items,
  });

  report.push(await runSearchCase('english_name_online', 'Charizard', {
    scope: 'online',
    expectedTexts: ['charizard'],
  }));

  await page.locator('#search-input').fill('char');
  await pause(300);
  const cardAutocompleteState = await page.evaluate(() => {
    const list = document.getElementById('search-autocomplete');
    const items = Array.from(list?.querySelectorAll('.search-ac-item') || []).slice(0, 8).map((node) => ({
      label: node.querySelector('.ac-label')?.textContent?.trim() || '',
      meta: node.querySelector('.ac-meta')?.textContent?.trim() || '',
      badge: node.querySelector('.ac-badge')?.textContent?.trim() || '',
      type: Array.from(node.classList).find((entry) => entry.startsWith('search-ac-item--'))?.replace('search-ac-item--', '') || '',
    }));
    return { items };
  });
  const cardSuggestionIndex = cardAutocompleteState.items.findIndex((item) => item.type === 'card');
  if (cardSuggestionIndex < 0) {
    throw new Error(`Keine Karten-Vorschläge für "char" gefunden: ${JSON.stringify(cardAutocompleteState.items)}`);
  }
  const cardSuggestion = cardAutocompleteState.items[cardSuggestionIndex];
  await page.locator('#search-autocomplete .search-ac-item').nth(cardSuggestionIndex).dispatchEvent('mousedown');
  await pause(150);
  await waitForSearchSettled();
  const cardClickState = await collectSearchState();
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
    suggestions: cardAutocompleteState.items,
  });

  await page.locator('#search-input').fill('base');
  await pause(300);
  const setAutocompleteState = await page.evaluate(() => {
    const list = document.getElementById('search-autocomplete');
    const items = Array.from(list?.querySelectorAll('.search-ac-item') || []).slice(0, 8).map((node) => ({
      label: node.querySelector('.ac-label')?.textContent?.trim() || '',
      meta: node.querySelector('.ac-meta')?.textContent?.trim() || '',
      badge: node.querySelector('.ac-badge')?.textContent?.trim() || '',
      type: Array.from(node.classList).find((entry) => entry.startsWith('search-ac-item--'))?.replace('search-ac-item--', '') || '',
    }));
    return { items };
  });
  const setSuggestionIndex = setAutocompleteState.items.findIndex((item) => item.type === 'set');
  if (setSuggestionIndex < 0) {
    throw new Error(`Keine Set-Vorschläge für "base" gefunden: ${JSON.stringify(setAutocompleteState.items)}`);
  }
  const setSuggestion = setAutocompleteState.items[setSuggestionIndex];
  await page.locator('#search-autocomplete .search-ac-item').nth(setSuggestionIndex).dispatchEvent('mousedown');
  await pause(150);
  await waitForSearchSettled();
  const setClickState = await collectSearchState();
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
    suggestions: setAutocompleteState.items,
  });

  report.push(await runSearchCase('german_name_online', 'Glurak', {
    scope: 'online',
    expectedTexts: ['charizard', 'glurak'],
  }));

  report.push(await runDashboardCase('dashboard_ptcgo_code', 'SVI', ['Scarlet & Violet', 'Karmesin & Purpur']));
  report.push(await runDashboardCase('dashboard_loose_punctuation', 'scarlet violet', ['Scarlet & Violet', 'Karmesin & Purpur']));

  report.push(await runSearchCase('set_name_all_sets', 'Base Set', {
    scope: 'all',
    expectedTexts: ['base set'],
  }));

  report.push(await runSearchCase('structured_set_number', 'base1 4', {
    scope: 'online',
    expectedTexts: ['base set', 'charizard', '4 –'],
  }));

  report.push(await runSearchCase('mixed_name_number', 'charizard 4', {
    scope: 'online',
    expectedTexts: ['charizard', '4 –'],
  }));

  const importedSet = await page.evaluate(() => {
    const select = document.getElementById('search-set-filter');
    const options = Array.from(select?.options || []).map((option) => ({
      value: option.value,
      label: option.textContent?.trim() || '',
    }));
    return options.find((option) => option.value) || null;
  });

  if (importedSet) {
    report.push(await runSearchCase('imported_scope_with_filter', importedSet.label, {
      scope: 'imported',
      setFilter: importedSet.value,
      expectedTexts: [importedSet.label],
    }));
  }

  const onlineFilter = await page.evaluate(() => {
    const select = document.getElementById('search-set-filter');
    const options = Array.from(select?.options || []).map((option) => ({
      value: option.value,
      label: option.textContent?.trim() || '',
    }));
    return options.find((option) => option.value === 'base1') || options.find((option) => /base set/i.test(option.label)) || null;
  });

  if (onlineFilter) {
    report.push(await runSearchCase('set_filter_online', 'Charizard', {
      scope: 'online',
      setFilter: onlineFilter.value,
      expectedTexts: [onlineFilter.label, 'charizard'],
    }));
  }

  await page.evaluate((auditReport) => {
    window.__searchAuditReport = auditReport;

    const existing = document.getElementById('search-audit-report');
    if (existing) existing.remove();

    const panel = document.createElement('div');
    panel.id = 'search-audit-report';
    panel.style.cssText = [
      'position:fixed',
      'right:16px',
      'bottom:16px',
      'z-index:99999',
      'max-width:420px',
      'padding:12px 14px',
      'border-radius:12px',
      'background:rgba(15,23,42,0.96)',
      'color:#e5f7ff',
      'font:12px/1.45 sans-serif',
      'box-shadow:0 10px 30px rgba(0,0,0,0.35)',
      'border:1px solid rgba(56,189,248,0.45)',
      'white-space:pre-wrap'
    ].join(';');

    const lines = auditReport.map((entry) => {
      const label = entry.name || 'case';
      const count = entry.count ?? entry.resultCount ?? entry.suggestions?.length ?? 0;
      return `• ${label}: ${count}`;
    });

    panel.textContent = `✅ Search Audit bestanden\n${auditReport.length} Suchfälle erfolgreich geprüft\n\n${lines.join('\n')}`;
    document.body.appendChild(panel);
  }, report);

  console.log('✅ Search Audit abgeschlossen');
  console.log(JSON.stringify(report, null, 2));
  return report;
}