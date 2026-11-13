/**
 * Rendert alle Sets der Dashboard-Uebersicht auf einmal (kein Paging).
 * Bilder laden per loading="lazy" nach (siehe createDashSetCard).
 */
export function renderDashboardSetGrid({ container, sets, sortBy, buildSeriesMap, createCard, doc = document }) {
  container.innerHTML = '';

  if (sortBy === 'series-date') {
    buildSeriesMap(sets).forEach((groupInfo) => {
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
