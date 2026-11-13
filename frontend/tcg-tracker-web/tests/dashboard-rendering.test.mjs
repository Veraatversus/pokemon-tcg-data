import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { renderDashboardSetGrid } = await import('../js/views/dashboard-grid.js');

function fakeEl(tag) {
  return {
    tag, className: '', textContent: '', children: [], innerHTML: '',
    appendChild(c) { this.children.push(c); return c; }
  };
}
const doc = { createElement: fakeEl };

function makeSets(n) {
  return Array.from({ length: n }, (_, i) => ({ setId: `s${i}`, setName: `Set ${i}`, series: i % 2 ? 'A' : 'B' }));
}
function count(node, cls) {
  let n = node.className === cls ? 1 : 0;
  for (const c of node.children) n += count(c, cls);
  return n;
}
const buildSeriesMap = (sets) => {
  const m = new Map();
  sets.forEach((s) => {
    if (!m.has(s.series)) m.set(s.series, { label: s.series, sets: [] });
    m.get(s.series).sets.push(s);
  });
  return m;
};

for (const sortBy of ['name', 'series-date']) {
  test(`renders all sets without virtual paging (${sortBy})`, () => {
    const container = fakeEl('div');
    renderDashboardSetGrid({
      container, sets: makeSets(230), sortBy, doc, buildSeriesMap,
      createCard: () => fakeEl('card-stub')
    });
    const cards = (function walk(n) { return (n.tag === 'card-stub' ? 1 : 0) + n.children.reduce((a, c) => a + walk(c), 0); })(container);
    assert.equal(cards, 230);
    assert.equal(count(container, 'dashboard-virtual-footer'), 0);
    assert.equal(container.innerHTML.includes('data-action'), false);
  });
}

test('app.js has no dashboard virtual paging left', () => {
  const src = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /DASHBOARD_VIRTUAL|dashboardVirtualCount|resetDashboardVirtualization|data-action="more"/);
});
