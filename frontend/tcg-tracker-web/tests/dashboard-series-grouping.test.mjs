import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k)
};
const { toSetRecord } = await import('../js/data/v3-records.js');
const {
  resolveSetSeriesLabel,
  resolveSetTotalCards,
  applyDeSeriesFallback,
  resolveDisplaySet,
  resetResolverMatrixCache
} = await import('../js/data/schema-contract.js');

const SETS = JSON.parse(readFileSync(fileURLToPath(new URL('../../../api/v3/sets.json', import.meta.url)), 'utf8'));
const me6 = SETS.find((s) => s.id === 'me6');

test('resolveSetSeriesLabel prefers DE series in de, EN in en', () => {
  const rec = toSetRecord(me6);
  assert.equal(resolveSetSeriesLabel(rec, 'de'), 'Mega-Entwicklung');
  assert.equal(resolveSetSeriesLabel(rec, 'en'), 'Mega Evolution');
  // Fallbacks: leerer tcgdex-Name -> i18n_de.series -> Map -> vera_series
  const bare = { setId: 'me6', vera_series: 'Mega Evolution', tcgdex_serie_name: '' };
  assert.equal(resolveSetSeriesLabel(bare, 'de'), 'Mega Evolution');
  assert.equal(resolveSetSeriesLabel(bare, 'de', new Map([['me6', 'Mega-Entwicklung']])), 'Mega-Entwicklung');
  assert.equal(resolveSetSeriesLabel({ ...bare, i18n_de: { series: 'Mega-Entwicklung' } }, 'de'), 'Mega-Entwicklung');
  assert.equal(resolveSetSeriesLabel({ series: 'Only' }, 'en'), 'Only');
});

test('imported and not-imported sets of one series share one group', () => {
  resetResolverMatrixCache();
  const notImported = resolveDisplaySet(toSetRecord(me6));
  // Importierte Zeile aus altem Alias-Import: ohne DE-Serie (nur EN)
  const oldRow = { setId: 'me6', imported: true, vera_series: 'Mega Evolution', vera_name: 'Phantasmal Flames', tcgdex_serie_name: '' };
  const fixed = resolveDisplaySet(applyDeSeriesFallback(oldRow, new Map([['me6', 'Mega-Entwicklung']])));
  assert.equal(fixed.series, 'Mega-Entwicklung');
  assert.equal(fixed.seriesGroupKey, notImported.seriesGroupKey);
  assert.equal(fixed.seriesGroupLabel, notImported.seriesGroupLabel);
  // vorhandener Wert bleibt unberuehrt
  const keep = applyDeSeriesFallback({ ...oldRow, tcgdex_serie_name: 'X' }, new Map([['me6', 'Y']]));
  assert.equal(keep.tcgdex_serie_name, 'X');
});

test('Gesamtzahl: nicht importiert nutzt total (141), nicht printedTotal', () => {
  const d = resolveDisplaySet(toSetRecord(me6));
  assert.equal(resolveSetTotalCards(d), 141);
  assert.equal(resolveSetTotalCards({ totalCards: 5 }), 5);
});

test('resolveSeriesGroupInfo (Pfad von Dashboard und Import-Selector) nutzt die gemeinsame DE-Map', async () => {
  const { resolveSeriesGroupInfo, setDeSeriesBySetId } = await import('../js/data/schema-contract.js');
  resetResolverMatrixCache();
  const imported = { setId: 'me6', imported: true, vera_series: 'Mega Evolution', series: 'Mega Evolution', tcgdex_serie_name: '' };
  const notImported = resolveDisplaySet(toSetRecord(me6));
  try {
    setDeSeriesBySetId(new Map([['me6', 'Mega-Entwicklung']]));
    const a = resolveSeriesGroupInfo(imported);
    const b = resolveSeriesGroupInfo(notImported);
    assert.equal(a.label, 'Mega-Entwicklung');
    assert.equal(a.key, b.key);
    assert.equal(a.label, b.label);
    // Selector-Gruppierung: eine Gruppe fuer beide
    const groups = new Set([imported, notImported].map((s) => resolveSeriesGroupInfo(s).key));
    assert.equal(groups.size, 1);
    // resolveDisplaySet nutzt denselben Resolver
    assert.equal(resolveDisplaySet(imported).series, 'Mega-Entwicklung');
  } finally {
    setDeSeriesBySetId(null);
  }
});
