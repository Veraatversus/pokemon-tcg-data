/**
 * Sortiert Serien-Gruppen fuer "Serie / Datum": Sets je Gruppe neueste zuerst (Gleichstand: setId),
 * Gruppen nach ihrem neuesten Set (neueste zuerst). Fehlendes Datum (null) sortiert zuletzt.
 */
export function orderSeriesGroupsByDate(seriesMap, getTime) {
  const rank = (t) => (Number.isFinite(t) ? t : -Infinity);
  const newestFirst = (ta, tb) => (ta === tb ? 0 : ta === -Infinity ? 1 : tb === -Infinity ? -1 : tb - ta);
  const cmp = (a, b) => newestFirst(rank(getTime(a)), rank(getTime(b)))
    || String(a.setId ?? '').localeCompare(String(b.setId ?? ''));
  const groups = [...seriesMap.entries()].map(([key, g]) => {
    const sets = [...g.sets].sort(cmp);
    return [key, { ...g, sets }, sets.length ? rank(getTime(sets[0])) : -Infinity];
  });
  groups.sort((a, b) => newestFirst(a[2], b[2]));
  return new Map(groups.map(([key, g]) => [key, g]));
}

/**
 * Rendert alle Sets der Dashboard-Uebersicht auf einmal (kein Paging).
 * Bilder laden per loading="lazy" nach (siehe createDashSetCard).
 */
export function renderDashboardSetGrid({ container, sets, sortBy, buildSeriesMap, getReleaseTime, createCard, doc = document }) {
  container.innerHTML = '';

  if (sortBy === 'series-date') {
    const seriesMap = buildSeriesMap(sets);
    (getReleaseTime ? orderSeriesGroupsByDate(seriesMap, getReleaseTime) : seriesMap).forEach((groupInfo) => {
      const section = doc.createElement('section');
      section.className = 'dash-series-group';
      const h3 = doc.createElement('h3');
      h3.textContent = groupInfo.label;
      section.appendChild(h3);
      const grid = doc.createElement('div');
      grid.className = 'dash-sets-row';
      groupInfo.sets.forEach((set) => grid.appendChild(createCard(set)));
      section.appendChild(grid);
      container.appendChild(section);
    });
    return;
  }

  const grid = doc.createElement('div');
  grid.className = 'dash-sets-row';
  sets.forEach((set) => grid.appendChild(createCard(set)));
  container.appendChild(grid);
}
