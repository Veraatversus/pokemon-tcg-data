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
  collectExcludedSetNames,
  filterVisibleSummaryRows,
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
  assert.match(src, /async function readVisibleSummary\(\) \{\s*return filterVisibleSummaryRows\(await readSummarySheet\(\), state\.isExcludedSet, state\.excludedSetNames\);/);
  assert.match(src, /state\.summaryData = await readVisibleSummary\(\)/);
  assert.match(src, /state\.isExcludedSet = isExcludedSet;/);
  const rows = [{ setId: 'TCGDEX-A1', setName: 'Unschlagbare Gene' }, { setId: 'sv1', setName: 'Karmesin & Purpur' }];
  assert.deepEqual(filterExcludedSets(rows, buildExcludedSetPredicate(META)).map((r) => r.setId), ['sv1']);
});

test('Legacy-Summary ohne setId: Zeilen ausgeschlossener Sets ueber den Setnamen (ungefilterte Sheet-Zeilen)', () => {
  const isExcluded = buildExcludedSetPredicate(META);
  const sheetSets = [
    { setId: 'TCGDEX-A1', setName: 'Unschlagbare Gene' },
    { setId: 'sv1', setName: 'Karmesin & Purpur' },
  ];
  const names = collectExcludedSetNames(sheetSets, isExcluded);
  assert.deepEqual([...names], ['unschlagbare gene']);
  const rows = [
    { setName: 'Unschlagbare Gene', total: 1 },
    { setName: 'Karmesin & Purpur', total: 2 },
    { setId: 'TCGDEX-A1', setName: 'Anderer Name' },
  ];
  assert.deepEqual(filterVisibleSummaryRows(rows, isExcluded, names).map((r) => r.setName), ['Karmesin & Purpur']);
  assert.deepEqual(filterVisibleSummaryRows(undefined, isExcluded, names), []);
  assert.equal(filterVisibleSummaryRows(rows, isExcluded).length, 2, 'ohne Namensliste nur setId');
});

test('Backup, Restore und Overview-Sync nutzen die ungefilterte Liste importierter Sets (Sheet-Daten vollstaendig)', () => {
  const src = readFileSync(fileURLToPath(new URL('../js/app.js', import.meta.url)), 'utf8');
  const loadSetsBody = src.slice(src.indexOf('async function loadSets()'), src.indexOf('\nfunction getSetSeriesGroupInfo'));
  // ungefiltert gemerkt, bevor gefiltert wird
  assert.ok(loadSetsBody.indexOf('state.importedSetsAll = importedSets;') >= 0);
  assert.ok(loadSetsBody.indexOf('state.importedSetsAll = importedSets;') < loadSetsBody.indexOf('importedSets = filterExcludedSets(importedSets, isExcludedSet)'));
  assert.match(loadSetsBody, /state\.excludedSetNames = collectExcludedSetNames\(\[\.\.\.importedSets, \.\.\.overviewSets\], isExcludedSet\);/);

  const backupStart = src.indexOf('async function exportCollectionBackup()');
  const backupRest = src.slice(backupStart);
  const backup = backupRest.slice(0, backupRest.search(/\r?\n\}\r?\n/));
  assert.ok(backup.length > 100, 'exportCollectionBackup gefunden');
  assert.match(backup, /buildCollectionBackupSets\(allImportedSets\(\),/);
  assert.doesNotMatch(backup, /state\.sets/);
  assert.match(src, /const liveSet = findSetByIdOrAlias\(allImportedSets\(\), backupSet\?\.setId\);/);
  assert.equal((src.match(/new Set\(state\.sets\.map\(\(set\) => set\.setId\)\)/g) || []).length, 0, 'Overview-Sync mit allen importierten Sets');
  // CSV-Export der Sammlungsuebersicht vollstaendig (ungefiltert aus dem Sheet)
  const csv = src.slice(src.indexOf('async function exportCollectionSummaryCsv()'), src.indexOf('async function exportCollectionSummaryCsv()') + 400);
  assert.match(csv, /await readSummarySheet\(\)/);
  // Import fuegt neue Sets auch in die ungefilterte Liste ein
  assert.match(src, /mergeIntoList\(state\.importedSetsAll, \{ addIfMissing: true \}\);/);
});

test('Zuletzt-geoeffnet-Chips ohne ausgeschlossene Sets', () => {
  const src = readFileSync(fileURLToPath(new URL('../js/app.js', import.meta.url)), 'utf8');
  const body = src.slice(src.indexOf('function renderRecentSets()'), src.indexOf('function renderRecentSets()') + 600);
  assert.match(body, /\.filter\(\(entry\) => !state\.isExcludedSet\(entry\)\)/);
});
