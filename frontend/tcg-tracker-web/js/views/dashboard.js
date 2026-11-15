// Dashboard-Ansicht: Sets laden, Serien-Uebersicht, Set-Karten und Set-Suchfilter.
// Funktionen anderer Ansichten, die noch in app.js liegen, werden ueber actions.<name>() aufgerufen.
import { listImportedSets, listSetsOverviewData, readSummarySheet, readSettings, syncOverviewWithApiSets, recoverImportedIdsFromOverview, prefetchSetsOverviewRows } from '../data/sheets-db.js?v=20261115-clean-2';
import { findSetByIdOrAlias } from '../data/set-aliases.js';
import { normalizeSearchText, collectSearchStrings, matchesTokensInValues } from '../features/search/query-utils.js';
import { fetchAllAvailableSets, fetchV3SetMeta } from '../data/pokemon-api.js?v=20261115-clean-2';
import { resolveSeriesGroupInfo, resolveDisplaySet, applyDeSeriesFallback, resolveSetTotalCards, resolveSetReleaseTime, setV3SetMeta } from '../data/schema-contract.js?v=20261115-clean-2';
import { fallbackImgAttrs } from '../ui/image-fallback.js';
import { renderDashboardSetGrid } from '../views/dashboard-grid.js';
import { collectExcludedSetNames, filterExcludedSets, filterVisibleSummaryRows, loadExcludedSetPredicate } from '../data/excluded-sets.js?v=20261115-clean-2';
import { toBoolean } from '../core/utils.js';
import { toggleFavorite, isFavorite } from '../enhanced-features.js?v=20261115-clean-2';
import { dom } from '../app/dom.js';
import { state } from '../app/state.js';
import { navigate, handleRouteChange } from '../app/router.js';
import { setGlobalStatus, setLoading, showToast, setAssetCandidates, syncRefreshControls } from '../ui/helpers.js';
import { actions } from '../app/actions.js';
import { renderSearchSetFilterOptions, navigateToSearchResultSet } from './search.js';

/** Summary-Zeilen (Dashboard-Fortschritt, Statistik, CSV) ohne ausgeschlossene Sets (state.isExcludedSet). */
export async function readVisibleSummary() {
  return filterVisibleSummaryRows(await readSummarySheet(), state.isExcludedSet, state.excludedSetNames);
}

/** Alle importierten Sets inkl. ausgeschlossener (Backup/Restore/Overview-Sync), sonst state.sets. */
export function allImportedSets() {
  return Array.isArray(state.importedSetsAll) && state.importedSetsAll.length ? state.importedSetsAll : (state.sets || []);
}

export async function loadSets() {
  setLoading(true, 'Lade Sets\u2026');
  try {
    // DE-Serien-Map (api/v3, mit Zeitlimit) parallel zum Sheets-Read von db_sets laden; registriert wird sie
    // vor jeder Gruppierung: Dashboard, Import-Selector und Suche teilen sich dieselbe Map.
    const [v3SetMeta, isExcludedSet] = await Promise.all([
      fetchV3SetMeta(),
      loadExcludedSetPredicate(),
      prefetchSetsOverviewRows().catch(() => {})
    ]);
    setV3SetMeta(v3SetMeta);
    const deSeriesBySetId = new Map([...v3SetMeta].filter(([, m]) => m.deSeries).map(([id, m]) => [id, m.deSeries]));
    let [importedSets, initialOverviewSets] = await Promise.all([
      listImportedSets(),
      listSetsOverviewData().catch(() => [])
    ]);

    if (!Array.isArray(importedSets)) throw new Error('Ungueltiges Sets-Format');
    state.sets = importedSets;

    let overviewSets = Array.isArray(initialOverviewSets) ? initialOverviewSets : [];
    if (overviewSets.length === 0) {
      const apiSets = await fetchAllAvailableSets();
      const importedIds = new Set(importedSets.map((set) => set.setId));
      await syncOverviewWithApiSets(apiSets, importedIds);
      overviewSets = await listSetsOverviewData().catch(() => []);
    }

    // Legacy-Migration: importierte Sets aus dem Uebersichtssheet wiederherstellen,
    // falls db_sets zuvor normalisiert wurde und alle Import-Flags verloren gingen.
    if (importedSets.length === 0 && overviewSets.length > 0) {
      try {
        const legacyIds = await recoverImportedIdsFromOverview();
        if (legacyIds.size > 0) {
          const apiSets = await fetchAllAvailableSets();
          await syncOverviewWithApiSets(apiSets, legacyIds);
          overviewSets = await listSetsOverviewData().catch(() => []);
          importedSets = overviewSets.filter((set) => toBoolean(set.imported));
          state.sets = importedSets;
        }
      } catch (err) {
        console.warn('[loadSets] Migration fehlgeschlagen:', err);
      }
    }

    // Von api/v3 ausgeschlossene Sets (meta.json excludedSetIds/excludedSeries, z. B. TCG Pocket) nur in der
    // Anzeige ausblenden: state.sets/state.allSets speisen Dashboard, Set-/Import-Auswahl, Suche und Statistik.
    // Die Sheet-Zeilen bleiben unveraendert.
    state.isExcludedSet = isExcludedSet;
    state.importedSetsAll = importedSets;
    state.excludedSetNames = collectExcludedSetNames([...importedSets, ...overviewSets], isExcludedSet);
    importedSets = filterExcludedSets(importedSets, isExcludedSet);
    overviewSets = filterExcludedSets(overviewSets, isExcludedSet);
    state.sets = importedSets;

    const importedById = new Map(importedSets.map((set) => [set.setId, set]));
    const mergedMap = new Map();

    (overviewSets || []).forEach((set) => {
      if (!mergedMap.has(set.setId)) {
        mergedMap.set(set.setId, { ...set, imported: toBoolean(set.imported) });
      }
    });

    importedSets.forEach((set) => {
      const current = mergedMap.get(set.setId) || {};
      mergedMap.set(set.setId, {
        ...current,
        ...set,
        // ptcgoCode nicht mit einem leeren Sheets-Wert ueberschreiben
        ptcgoCode: set.ptcgoCode || current.ptcgoCode || '',
        imported: true
      });
    });

    // Zeilen ohne DE-Serie (z. B. aus altem Alias-Import) bekommen sie aus api/v3, damit Serien-Gruppen
    // importierter und nicht importierter Sets identisch sind.
    state.allSets = Array.from(mergedMap.values()).map((set) => {
      // immer neu aufloesen: DE-Setname und DE-Serie aus der v3-Meta gelten auch fuer bereits aufgeloeste Zeilen
      return resolveDisplaySet(applyDeSeriesFallback(set, deSeriesBySetId));
    });
    actions.renderRecentSets();
    renderSetSelectorOptions();

    dom.selector.disabled = false;
    dom.load.disabled     = false;
    syncRefreshControls();

    dom.dashSeriesFilter.innerHTML = '<option value="">Alle Serien</option>';
    buildSeriesMap(state.allSets).forEach((groupInfo) => {
      const opt = document.createElement('option');
      opt.value = groupInfo.key;
      opt.textContent = groupInfo.label;
      dom.dashSeriesFilter.appendChild(opt);
    });

    renderSearchSetFilterOptions();

    const settings = await readSettings();
    if (settings.lastSetId) dom.selector.value = settings.lastSetId;

    setGlobalStatus(`${state.sets.length} von ${state.allSets.length} Sets geladen.`);
    dom.mainNav.classList.remove('hidden');

    if (!window.location.hash || window.location.hash === '#') {
      navigate('dashboard');
    } else {
      handleRouteChange();
    }
  } catch (err) {
    console.error('[loadSets]', err);
    showToast(`Fehler beim Laden der Sets: ${err.message}`, 'error');
    setGlobalStatus('Sets konnten nicht geladen werden.');
    state.sets = [];
    state.allSets = [];
    actions.renderRecentSets();
  } finally {
    setLoading(false);
  }
}

export function getSetSeriesGroupInfo(set) {
  return resolveSeriesGroupInfo(set || {});
}

export function buildSeriesMap(sets) {
  const map = new Map();
  (sets || []).forEach((set) => {
    const info = getSetSeriesGroupInfo(set);
    const existing = map.get(info.key);
    if (!existing) {
      map.set(info.key, {
        key: info.key,
        label: info.label || 'Andere',
        canonicalName: info.canonicalName || info.label || 'Andere',
        sets: [set],
        labelVotes: new Map([[info.label || 'Andere', 1]])
      });
      return;
    }

    existing.sets.push(set);
    const label = info.label || 'Andere';
    const nextVotes = (existing.labelVotes.get(label) || 0) + 1;
    existing.labelVotes.set(label, nextVotes);
    const currentVotes = existing.labelVotes.get(existing.label) || 0;
    if (nextVotes > currentVotes) {
      existing.label = label;
    }
  });
  return map;
}

export async function renderDashboard() {
  dom.dashboardGrid.innerHTML = '<p class="loading-placeholder">Lade \u00dcbersicht\u2026</p>';
  try {
    const activeDashboardView = state.dashboardView || 'all';
    const density = state.dashboardDensity || 'comfortable';
    dom.viewDashboard?.classList.toggle('compact-dashboard', density === 'compact');
    dom.viewDashboard?.classList.toggle('logos-dashboard', density === 'logos');
    document.querySelectorAll('.dashboard-view-tab').forEach((button) => {
      const isActive = button.dataset.dashboardView === activeDashboardView;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-selected', String(isActive));
    });
    if (dom.btnDashboardCompact) {
      const densityLabel = density === 'comfortable' ? 'Komfort' : density === 'compact' ? 'Kompakt' : 'Nur Logos';
      dom.btnDashboardCompact.classList.toggle('active', density !== 'comfortable');
      dom.btnDashboardCompact.setAttribute('aria-pressed', String(density !== 'comfortable'));
      dom.btnDashboardCompact.textContent = densityLabel;
      dom.btnDashboardCompact.title = `Ansichtsdichte: ${densityLabel} (klicken zum Wechseln)`;
    }

    if (!state.summaryData) {
      state.summaryData = await readVisibleSummary().catch(() => []);
    }
    const summaryByName = new Map();
    (state.summaryData || []).forEach((row) => summaryByName.set(row.setName, row));
    state.summaryOverrides.forEach((row, key) => {
      summaryByName.set(key, row);
    });

    let sets = [...state.allSets];
    const filterText = dom.dashFilter.value.trim();
    const dashboardSearchScores = new Map();
    const getDashboardSearchKey = (set) => String(set?.setId || set?.setName || '');
    const compareDashboardSearchScore = (left, right) => {
      if (!filterText) return 0;
      const leftScore = dashboardSearchScores.get(getDashboardSearchKey(left)) || 0;
      const rightScore = dashboardSearchScores.get(getDashboardSearchKey(right)) || 0;
      return rightScore - leftScore;
    };

    if (filterText) {
      sets = sets.filter((set) => {
        const score = scoreDashboardSetMatch(set, filterText);
        if (score < 0) return false;
        dashboardSearchScores.set(getDashboardSearchKey(set), score);
        return matchesDashboardSetFilter(set, filterText);
      });

      sets.sort((left, right) => compareDashboardSearchScore(left, right));
    }

    const seriesFilter = dom.dashSeriesFilter.value;
    if (seriesFilter) sets = sets.filter((set) => getSetSeriesGroupInfo(set).key === seriesFilter);

    if (activeDashboardView === 'imported') {
      sets = sets.filter((set) => toBoolean(set.imported));
    } else if (activeDashboardView === 'not-imported') {
      sets = sets.filter((set) => !set.imported);
    } else if (activeDashboardView === 'favorites') {
      sets = sets.filter((set) => isFavorite(set.setId));
    }

    const quickFilters = state.quickFilters || {};
    const hasStatusQuickFilter = Boolean(quickFilters.completed || quickFilters.inProgress);

    if (hasStatusQuickFilter) {
      sets = sets.filter((set) => {
        if (!set.imported) {
          return false;
        }

        const summary = summaryByName.get(set.setName) || summaryByName.get(set.setId);
        const total = Number(summary?.total ?? set.totalCards ?? 0);
        const collected = Number(summary?.collected ?? 0);
        const isCompleted = total > 0 && collected >= total;
        const isInProgress = collected > 0 && !isCompleted;

        return (quickFilters.completed && isCompleted)
          || (quickFilters.inProgress && isInProgress);
      });
    }

    const sortBy = dom.dashSort.value;
    if (sortBy === 'name') {
      sets.sort((a, b) => {
        const scoreDiff = compareDashboardSearchScore(a, b);
        if (scoreDiff !== 0) return scoreDiff;
        return a.setName.localeCompare(b.setName);
      });
    } else if (sortBy === 'completion') {
      sets.sort((a, b) => {
        const scoreDiff = compareDashboardSearchScore(a, b);
        if (scoreDiff !== 0) return scoreDiff;
        const sa = summaryByName.get(a.setName) || summaryByName.get(a.setId);
        const sb = summaryByName.get(b.setName) || summaryByName.get(b.setId);
        const pa = sa && sa.total > 0 ? sa.collected / sa.total : 0;
        const pb = sb && sb.total > 0 ? sb.collected / sb.total : 0;
        return pb - pa;
      });
    }

    if (!sets.length) {
      dom.dashboardGrid.innerHTML = '<p class="empty-state">Keine Sets gefunden.</p>';
      return;
    }

    renderDashboardSetGrid({
      container: dom.dashboardGrid,
      sets,
      sortBy,
      buildSeriesMap,
      getReleaseTime: resolveSetReleaseTime,
      createCard: (set) => createDashSetCard(set, summaryByName.get(set.setName) || summaryByName.get(set.setId))
    });

  } catch (err) {
    console.error('[renderDashboard]', err);
    dom.dashboardGrid.innerHTML = `<p class="empty-state">\u2715 Fehler beim Laden der \u00dcbersicht</p>`;
    showToast(`Dashboard: ${err.message}`, 'error');
  }
}

function createDashSetCard(set, summary) {
  const card = document.createElement('div');
  card.className = 'dash-set-card';
  card.classList.toggle('not-imported', !set.imported);
  const total     = summary?.total     ?? 0;
  const collected = summary?.collected ?? 0;
  const rh        = summary?.rh        ?? 0;
  const percent   = total > 0 ? Math.round((collected / total) * 100) : 0;
  if (percent >= 100 && total > 0) card.classList.add('complete');
  else if (percent > 0)            card.classList.add('in-progress');

  card.dataset.setId = set.setId || '';
  card.dataset.hoverData = JSON.stringify({
    name: set.setName || set.setId || '',
    series: set.series || '',
    collected,
    total: total || set.totalCards || 0,
    rh,
    percent,
    imported: Boolean(set.imported)
  });

  const logoCandidates = setAssetCandidates(set, 'setLogo');
  const placeholderCode = String(set.ptcgoCode || set.setId || 'SET').toUpperCase();

  card.innerHTML = `
    <div class="dash-set-logo-wrap">
      ${logoCandidates.length
        ? `<img ${fallbackImgAttrs(logoCandidates)} alt="${set.setName}" class="dash-set-logo" loading="lazy"/>`
        : `<div class="dash-set-placeholder" role="img" aria-label="Kein Setlogo für ${set.setName} verfügbar">
             <img src="./assets/pokeball-fallback.svg" alt="" class="dash-set-placeholder-icon" loading="lazy" />
             <span class="dash-set-placeholder-badge">Kein Setlogo</span>
             <span class="dash-set-placeholder-code">${placeholderCode}</span>
           </div>`}
    </div>
    <div class="dash-set-info">
      <p class="dash-set-name">${set.setName}</p>
      <p class="dash-set-series">${set.series || ''}</p>
      <div class="dash-progress-bar"><div class="dash-progress-fill" style="width:${set.imported ? percent : 0}%"></div></div>
      <p class="dash-progress-text">${set.imported ? `${collected}\u202f/\u202f${total || '?'} (${percent}%)` : `Noch nicht importiert (${resolveSetTotalCards(set) || '?'} Karten)`}</p>
      ${rh > 0 ? `<p class="dash-rh-text">RH: ${rh}</p>` : ''}
      <div class="dash-card-actions">
        ${set.imported 
         ? `<button class="btn-secondary dash-view-btn" type="button" title="Ansehen">👁️</button>
           <button class="btn-secondary dash-favorite-btn" type="button" title="Favorit">${isFavorite(set.setId) ? '★' : '☆'}</button>
           <button class="btn-secondary dash-delete-btn" type="button" title="Löschen">🗑️</button>`
         : `<button class="btn-primary dash-import-btn" type="button">➕ Importieren</button>`}
      </div>
    </div>`;

  const importButton = card.querySelector('.dash-import-btn');
  if (importButton) {
    importButton.addEventListener('click', async (event) => {
      event.stopPropagation();
      await actions.importSetFromOverview(set);
    });
  }

  const viewButton = card.querySelector('.dash-view-btn');
  if (viewButton) {
    viewButton.addEventListener('click', (event) => {
      event.stopPropagation();
      navigateToSearchResultSet(set);
    });
  }

  const deleteButton = card.querySelector('.dash-delete-btn');
  if (deleteButton) {
    deleteButton.addEventListener('click', async (event) => {
      event.stopPropagation();
      await actions.deleteSetFromCollection(set);
    });
  }

  const favoriteButton = card.querySelector('.dash-favorite-btn');
  if (favoriteButton) {
    favoriteButton.addEventListener('click', async (event) => {
      event.stopPropagation();
      const isFav = toggleFavorite(set.setId);
      favoriteButton.textContent = isFav ? '★' : '☆';
      showToast(isFav ? `${set.setName} zu Favoriten hinzugefuegt` : `${set.setName} aus Favoriten entfernt`, 'success', 2000);
    });
  }

  card.addEventListener('click', () => {
    navigateToSearchResultSet(set);
  });

  if (set.imported) {
    actions.checkSetCompletion(set.setId || set.setName, percent, card);
  }

  return card;
}

export function syncDashboardCardForSet(setMeta, summary) {
  if (!setMeta?.setId) return;
  const card = dom.dashboardGrid?.querySelector(`.dash-set-card[data-set-id="${setMeta.setId}"]`);
  if (!card) return;

  const total = Number(summary?.total ?? setMeta?.totalCards ?? 0);
  const collected = Number(summary?.collected ?? 0);
  const rh = Number(summary?.rh ?? 0);
  const percent = total > 0 ? Math.round((collected / total) * 100) : 0;

  card.classList.toggle('complete', percent >= 100 && total > 0);
  card.classList.toggle('in-progress', percent > 0 && percent < 100);

  const fill = card.querySelector('.dash-progress-fill');
  if (fill) fill.style.width = `${percent}%`;

  const text = card.querySelector('.dash-progress-text');
  if (text) text.textContent = `${collected}\u202f/\u202f${total || '?'} (${percent}%)`;

  let rhText = card.querySelector('.dash-rh-text');
  if (rh > 0 && !rhText) {
    rhText = document.createElement('p');
    rhText.className = 'dash-rh-text';
    const info = card.querySelector('.dash-set-info');
    info?.insertBefore(rhText, info.querySelector('.dash-card-actions'));
  }
  if (rhText) {
    if (rh > 0) rhText.textContent = `RH: ${rh}`;
    else rhText.remove();
  }

  card.dataset.hoverData = JSON.stringify({
    name: setMeta.setName || setMeta.setId || '',
    series: setMeta.series || '',
    collected,
    total,
    rh,
    percent,
    imported: true
  });

  actions.checkSetCompletion(setMeta.setId || setMeta.setName, percent, card);
}

export function getSetById(setId) {
  return state.allSets.find((set) => set.setId === setId) || state.sets.find((set) => set.setId === setId)
    // Alte IDs (Alias-Sets wie swsh12pt5gg, TCGDEX-me05) auf das kanonische Set abbilden.
    || findSetByIdOrAlias(state.allSets, setId) || findSetByIdOrAlias(state.sets, setId) || null;
}

export function ensureSetSelectorOption(set) {
  if (!dom.selector || !set?.setId) return;

  const existingOption = Array.from(dom.selector.options || []).find((option) => option.value === set.setId);
  if (existingOption) {
    if (set?.setName) existingOption.textContent = set.setName;
    existingOption.dataset.imported = String(toBoolean(set.imported));
    return;
  }

  const isImported = toBoolean(set.imported);
  const groupInfo = getSetSeriesGroupInfo(set);
  const groupLabel = isImported ? (groupInfo.label || 'Weitere Sets') : 'Weitere Sets (noch nicht importiert)';
  const groupKey = isImported ? (groupInfo.key || 'weitere-sets') : 'not-imported';
  let group = Array.from(dom.selector.querySelectorAll('optgroup')).find((entry) => (entry.dataset.seriesKey || '') === groupKey);
  if (!group) {
    group = document.createElement('optgroup');
    group.label = groupLabel;
    group.dataset.seriesKey = groupKey;
    dom.selector.appendChild(group);
  }

  const option = document.createElement('option');
  option.value = set.setId;
  option.textContent = set.setName || set.setId;
  option.dataset.imported = String(isImported);
  if (!isImported) {
    option.classList.add('option-not-imported');
    option.dataset.source = 'search-api';
  }
  group.appendChild(option);
}

export function renderSetSelectorOptions(preferredValue = '') {
  if (!dom.selector) return;

  const desiredValue = String(preferredValue || dom.selector.value || '').trim();
  const importedSets = Array.isArray(state.sets) ? state.sets.filter((set) => set?.setId) : [];
  const knownSets = Array.isArray(state.allSets) && state.allSets.length
    ? state.allSets.filter((set) => set?.setId)
    : importedSets;
  const notImportedSets = [...knownSets]
    .filter((set) => !toBoolean(set.imported))
    .sort((a, b) => String(a.setName || a.setId).localeCompare(String(b.setName || b.setId), undefined, {
      numeric: true,
      sensitivity: 'base'
    }));

  dom.selector.innerHTML = '<option value="">Bitte wählen...</option>';

  const seriesMap = buildSeriesMap(importedSets);
  seriesMap.forEach((groupInfo) => {
    const group = document.createElement('optgroup');
    group.label = groupInfo.label;
    group.dataset.seriesKey = groupInfo.key;
    groupInfo.sets.forEach((set) => {
      const opt = document.createElement('option');
      opt.value = set.setId;
      opt.textContent = set.setName;
      opt.dataset.imported = 'true';
      group.appendChild(opt);
    });
    dom.selector.appendChild(group);
  });

  if (notImportedSets.length) {
    const extraGroup = document.createElement('optgroup');
    extraGroup.label = 'Weitere Sets (noch nicht importiert)';
    extraGroup.dataset.seriesKey = 'not-imported';

    notImportedSets.forEach((set) => {
      const opt = document.createElement('option');
      opt.value = set.setId;
      opt.textContent = set.setName || set.setId;
      opt.dataset.imported = 'false';
      opt.classList.add('option-not-imported');
      extraGroup.appendChild(opt);
    });

    dom.selector.appendChild(extraGroup);
  }

  if (desiredValue && Array.from(dom.selector.options).some((option) => option.value === desiredValue)) {
    dom.selector.value = desiredValue;
  }
}

function buildSetSearchContext(set = null) {
  const nameValues = collectSearchStrings([
    set?.setName,
    set?.vera_name,
    set?.tcgdex_name
  ]);

  const seriesValues = collectSearchStrings([
    set?.series,
    set?.vera_series,
    set?.tcgdex_serie_name,
    set?.tcgdex_serie_id
  ]);

  const codeValues = collectSearchStrings([
    set?.setId,
    set?.ptcgoCode,
    set?.vera_ptcgoCode,
    set?.tcgdex_abbreviation_official
  ]);

  return {
    nameValues,
    seriesValues,
    codeValues,
    fullText: [...nameValues, ...seriesValues, ...codeValues].join(' ')
  };
}

function scoreDashboardSetMatch(set, rawQuery = '') {
  const normalizedQuery = normalizeSearchText(rawQuery).replace(/\s+/g, ' ').trim();
  if (!normalizedQuery) return 0;

  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const context = buildSetSearchContext(set);
  const weightedGroups = [
    { values: context.codeValues, exact: 280, prefix: 240, includes: 180 },
    { values: context.nameValues, exact: 230, prefix: 180, includes: 125 },
    { values: context.seriesValues, exact: 120, prefix: 90, includes: 70 }
  ];

  let bestScore = -1;

  weightedGroups.forEach(({ values, exact, prefix, includes }) => {
    values.forEach((value) => {
      if (!value) return;
      if (value === normalizedQuery) bestScore = Math.max(bestScore, exact);
      else if (value.startsWith(normalizedQuery)) bestScore = Math.max(bestScore, prefix);
      else if (value.includes(normalizedQuery)) bestScore = Math.max(bestScore, includes);
    });
  });

  if (tokens.length && matchesTokensInValues(tokens, context.codeValues)) {
    bestScore = Math.max(bestScore, 160 + (tokens.length * 12));
  }
  if (tokens.length && matchesTokensInValues(tokens, context.nameValues)) {
    bestScore = Math.max(bestScore, 135 + (tokens.length * 11));
  }
  if (tokens.length && matchesTokensInValues(tokens, context.seriesValues)) {
    bestScore = Math.max(bestScore, 85 + (tokens.length * 8));
  } else if (tokens.length && tokens.every((token) => context.fullText.includes(token))) {
    bestScore = Math.max(bestScore, 50 + (tokens.length * 8));
  }

  return bestScore;
}

function matchesDashboardSetFilter(set, rawQuery = '') {
  return scoreDashboardSetMatch(set, rawQuery) >= 0;
}
