// Task B1: Sets aus api/v3 meta.json excludedSetIds/excludedSeries (TCG Pocket) bleiben in der App unsichtbar,
// auch wenn das Sheet noch db_sets-/Overview-/Sammlungszeilen dafuer hat. Das Sheet wird nicht veraendert.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  buildExcludedSetPredicate,
  filterExcludedSets,
  loadExcludedSetPredicate,
} from '../js/data/excluded-sets.js';

const META = { excludedSetIds: ['TCGDEX-A1', 'TCGDEX-P-A'], excludedSeries: ['tcgp'] };

test('buildExcludedSetPredicate: setId (ohne Gross-/Kleinschreibung), Alias-Zeilen und Serie', () => {
  const isExcluded = buildExcludedSetPredicate(META);
  assert.equal(isExcluded({ setId: 'TCGDEX-A1' }), true);
  assert.equal(isExcluded({ setId: 'tcgdex-p-a' }), true);
  assert.equal(isExcluded({ setId: 'X', mergedAliasIds: ['TCGDEX-A1'] }), true, 'Alias-Zeile eines ausgeschlossenen Sets');
  assert.equal(isExcluded({ setId: 'TCGDEX-A9', tcgdex_serie_id: 'TCGP' }), true, 'Serie tcgp');
  assert.equal(isExcluded({ setId: 'sv1', tcgdex_serie_id: 'sv' }), false);
  assert.equal(isExcluded({ setId: 'TCGDEX-mee' }), false);
  assert.equal(isExcluded(null), false);
});

test('buildExcludedSetPredicate: ohne Meta schliesst nichts aus', () => {
  const isExcluded = buildExcludedSetPredicate(null);
  assert.equal(isExcluded({ setId: 'TCGDEX-A1' }), false);
});

test('filterExcludedSets: neue Liste ohne ausgeschlossene Sets, Eingabe unveraendert', () => {
  const sets = [{ setId: 'sv1' }, { setId: 'TCGDEX-A1', imported: true }, { setId: 'base1' }];
  const out = filterExcludedSets(sets, buildExcludedSetPredicate(META));
  assert.deepEqual(out.map((s) => s.setId), ['sv1', 'base1']);
  assert.equal(sets.length, 3);
  assert.deepEqual(filterExcludedSets(undefined, () => true), []);
});

test('loadExcludedSetPredicate: Fehler/Zeitueberschreitung -> nichts ausschliessen (App bleibt nutzbar)', async () => {
  const ok = await loadExcludedSetPredicate({ loadMeta: async () => META });
  assert.equal(ok({ setId: 'TCGDEX-A1' }), true);
  const failing = await loadExcludedSetPredicate({ loadMeta: async () => { throw new Error('offline'); } });
  assert.equal(failing({ setId: 'TCGDEX-A1' }), false);
  const slow = await loadExcludedSetPredicate({ loadMeta: () => new Promise(() => {}), timeoutMs: 10 });
  assert.equal(slow({ setId: 'TCGDEX-A1' }), false);
});

test('echte api/v3/meta.json: alle 15 Pocket-Sets ausgeschlossen', () => {
  const meta = JSON.parse(readFileSync(fileURLToPath(new URL('../../../api/v3/meta.json', import.meta.url)), 'utf8'));
  const isExcluded = buildExcludedSetPredicate(meta);
  for (const id of ['TCGDEX-A1', 'TCGDEX-A1a', 'TCGDEX-A4a', 'TCGDEX-B2a', 'TCGDEX-P-A']) assert.equal(isExcluded({ setId: id }), true, id);
  assert.equal(meta.excludedSetIds.length, 15);
  assert.equal(isExcluded({ setId: 'sv1' }), false);
});

test('loadSets blendet ausgeschlossene Sets aus db_sets und Overview aus (Dashboard, Auswahl, Import, Suche, Statistik)', () => {
  const src = readFileSync(fileURLToPath(new URL('../js/app.js', import.meta.url)), 'utf8');
  const start = src.indexOf('async function loadSets()');
  const body = src.slice(start, src.indexOf('\nfunction getSetSeriesGroupInfo', start));
  assert.match(body, /loadExcludedSetPredicate\(\)/);
  assert.match(body, /importedSets = filterExcludedSets\(importedSets, isExcludedSet\)/);
  assert.match(body, /overviewSets = filterExcludedSets\(overviewSets, isExcludedSet\)/);
  // state.sets / state.allSets entstehen erst nach dem Filtern
  assert.ok(body.indexOf('state.allSets = Array.from(mergedMap.values())') > body.lastIndexOf('overviewSets = filterExcludedSets('));
});

test('Statistik/Dashboard-Summary ohne ausgeschlossene Sets (Summary-Zeilen tragen setId)', () => {
  const src = readFileSync(fileURLToPath(new URL('../js/app.js', import.meta.url)), 'utf8');
  assert.match(src, /async function readVisibleSummary\(\) \{\s*return filterExcludedSets\(await readSummarySheet\(\), state\.isExcludedSet\);/);
  assert.equal((src.match(/readSummarySheet\(\)/g) || []).length, 1, 'nur ueber readVisibleSummary gelesen');
  assert.match(src, /state\.isExcludedSet = isExcludedSet;/);
  const rows = [{ setId: 'TCGDEX-A1', setName: 'Unschlagbare Gene' }, { setId: 'sv1', setName: 'Karmesin & Purpur' }];
  assert.deepEqual(filterExcludedSets(rows, buildExcludedSetPredicate(META)).map((r) => r.setId), ['sv1']);
});
