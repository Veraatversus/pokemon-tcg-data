export function createDashSetCardView({
  set,
  summary,
  sanitizeSetAssetUrl,
  isFavorite,
  importSetFromOverview,
  navigateToSearchResultSet,
  deleteSetFromCollection,
  toggleFavorite,
  showToast,
  checkSetCompletion,
}) {
  const card = document.createElement('div');
  card.className = 'dash-set-card';
  card.classList.toggle('not-imported', !set.imported);
  const total = summary?.total ?? 0;
  const collected = summary?.collected ?? 0;
  const rh = summary?.rh ?? 0;
  const percent = total > 0 ? Math.round((collected / total) * 100) : 0;
  if (percent >= 100 && total > 0) card.classList.add('complete');
  else if (percent > 0) card.classList.add('in-progress');

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

  const safeLogoUrl = sanitizeSetAssetUrl(set.logoUrl, set.setId);
  const placeholderCode = String(set.ptcgoCode || set.setId || 'SET').toUpperCase();

  card.innerHTML = `
    <div class="dash-set-logo-wrap">
      ${safeLogoUrl
        ? `<img src="${safeLogoUrl}" alt="${set.setName}" class="dash-set-logo" loading="lazy" onerror="this.onerror=null;this.src='./assets/pokeball-fallback.svg';this.classList.add('img-fallback')"/>`
        : `<div class="dash-set-placeholder" role="img" aria-label="Kein Setlogo fur ${set.setName} verfugbar">
             <img src="./assets/pokeball-fallback.svg" alt="" class="dash-set-placeholder-icon" loading="lazy" />
             <span class="dash-set-placeholder-badge">Kein Setlogo</span>
             <span class="dash-set-placeholder-code">${placeholderCode}</span>
           </div>`}
    </div>
    <div class="dash-set-info">
      <p class="dash-set-name">${set.setName}</p>
      <p class="dash-set-series">${set.series || ''}</p>
      <div class="dash-progress-bar"><div class="dash-progress-fill" style="width:${set.imported ? percent : 0}%"></div></div>
      <p class="dash-progress-text">${set.imported ? `${collected}\u202f/\u202f${total || '?'} (${percent}%)` : `Noch nicht importiert (${set.totalCards || '?'} Karten)`}</p>
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
      await importSetFromOverview(set);
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
      await deleteSetFromCollection(set);
    });
  }

  const favoriteButton = card.querySelector('.dash-favorite-btn');
  if (favoriteButton) {
    favoriteButton.addEventListener('click', async (event) => {
      event.stopPropagation();
      const isFav = toggleFavorite(set.setId);
      favoriteButton.textContent = isFav ? '★' : '☆';
      showToast(isFav ? `${set.setName} zu Favoriten hinzugefugt` : `${set.setName} aus Favoriten entfernt`, 'success', 2000);
    });
  }

  card.addEventListener('click', () => {
    navigateToSearchResultSet(set);
  });

  if (set.imported) {
    checkSetCompletion(set.setId || set.setName, percent, card);
  }

  return card;
}

export function syncDashboardCardForSetView({
  setMeta,
  summary,
  dashboardGrid,
  checkSetCompletion,
}) {
  if (!setMeta?.setId) return;
  const card = dashboardGrid?.querySelector(`.dash-set-card[data-set-id="${setMeta.setId}"]`);
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

  checkSetCompletion(setMeta.setId || setMeta.setName, percent, card);
}

export function applyDashboardViewControls({ dom, state }) {
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

  return { activeDashboardView, density };
}

export function selectDashboardSetsView({
  allSets,
  filterText = '',
  seriesFilter = '',
  activeDashboardView = 'all',
  quickFilters = {},
  sortBy = 'series-date',
  summaryByName,
  scoreDashboardSetMatch,
  matchesDashboardSetFilter,
  getSetSeriesGroupInfo,
  toBoolean,
  isFavorite,
}) {
  let sets = Array.isArray(allSets) ? [...allSets] : [];
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

  if (seriesFilter) {
    sets = sets.filter((set) => getSetSeriesGroupInfo(set).key === seriesFilter);
  }

  if (activeDashboardView === 'imported') {
    sets = sets.filter((set) => toBoolean(set.imported));
  } else if (activeDashboardView === 'not-imported') {
    sets = sets.filter((set) => !set.imported);
  } else if (activeDashboardView === 'favorites') {
    sets = sets.filter((set) => isFavorite(set.setId));
  }

  const hasStatusQuickFilter = Boolean(quickFilters.completed || quickFilters.inProgress);
  if (hasStatusQuickFilter) {
    sets = sets.filter((set) => {
      if (!set.imported) return false;

      const summary = summaryByName.get(set.setName) || summaryByName.get(set.setId);
      const total = Number(summary?.total ?? set.totalCards ?? 0);
      const collected = Number(summary?.collected ?? 0);
      const isCompleted = total > 0 && collected >= total;
      const isInProgress = collected > 0 && !isCompleted;

      return (quickFilters.completed && isCompleted)
        || (quickFilters.inProgress && isInProgress);
    });
  }

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

  return sets;
}

export function renderDashboardSetsView({
  dom,
  state,
  sets,
  sortBy,
  summaryByName,
  buildSeriesMap,
  createDashSetCard,
  createDashboardVirtualFooter,
  DASHBOARD_VIRTUAL_THRESHOLD,
  DASHBOARD_VIRTUAL_PAGE_SIZE,
}) {
  if (!Array.isArray(sets) || !sets.length) {
    dom.dashboardGrid.innerHTML = '<p class="empty-state">Keine Sets gefunden.</p>';
    return false;
  }

  dom.dashboardGrid.innerHTML = '';

  const shouldVirtualize = sets.length > DASHBOARD_VIRTUAL_THRESHOLD;
  const visibleCount = shouldVirtualize
    ? Math.min(sets.length, Math.max(DASHBOARD_VIRTUAL_PAGE_SIZE, state.dashboardVirtualCount || DASHBOARD_VIRTUAL_PAGE_SIZE))
    : sets.length;
  const visibleSets = shouldVirtualize ? sets.slice(0, visibleCount) : sets;

  if (sortBy === 'series-date') {
    const seriesMap = buildSeriesMap(visibleSets);
    seriesMap.forEach((groupInfo) => {
      const section = document.createElement('section');
      section.className = 'dash-series-group';
      const h3 = document.createElement('h3');
      h3.textContent = groupInfo.label;
      section.appendChild(h3);
      const grid = document.createElement('div');
      grid.className = 'dash-sets-row';
      groupInfo.sets.forEach((set) => {
        const summary = summaryByName.get(set.setName) || summaryByName.get(set.setId);
        grid.appendChild(createDashSetCard(set, summary));
      });
      section.appendChild(grid);
      dom.dashboardGrid.appendChild(section);
    });
  } else {
    const grid = document.createElement('div');
    grid.className = 'dash-sets-row';
    visibleSets.forEach((set) => {
      const summary = summaryByName.get(set.setName) || summaryByName.get(set.setId);
      grid.appendChild(createDashSetCard(set, summary));
    });
    dom.dashboardGrid.appendChild(grid);
  }

  if (shouldVirtualize) {
    dom.dashboardGrid.appendChild(createDashboardVirtualFooter(sets.length, visibleSets.length));
  }

  return true;
}
