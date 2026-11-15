// Stoebermodus ohne Login: Sets aus api/v3, Sammlung leer; Schalter aus -> keine API-Zugriffe.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBrowseSets, startBrowseMode, stopBrowseMode } from '../js/app/browse-mode.js';
import { state } from '../js/app/state.js';

const apiSets = [{ setId: 'sv2', setName: 'B' }, { setId: 'TCGDEX-A1', setName: 'Pocket' }, { setId: 'sv1', setName: 'A', imported: true }];
const isExcluded = (s) => s.setId === 'TCGDEX-A1';

test('buildBrowseSets filtert ausgeschlossene Sets, setzt imported:false, behaelt die Reihenfolge', () => {
  assert.deepEqual(buildBrowseSets(apiSets, isExcluded), [
    { setId: 'sv2', setName: 'B', imported: false },
    { setId: 'sv1', setName: 'A', imported: false },
  ]);
  assert.deepEqual(buildBrowseSets(null, isExcluded), []);
});

test('Schalter aus: false, keine API-Zugriffe, kein Stoebermodus', async () => {
  let loaded = 0;
  let entered = 0;
  const ok = await startBrowseMode({
    loadFlags: async () => ({ browseWithoutLogin: false }),
    loadSets: async () => { loaded++; return apiSets; },
    loadPredicate: async () => { loaded++; return isExcluded; },
    onEnter: () => { entered++; },
  });
  assert.equal(ok, false);
  assert.equal(loaded, 0);
  assert.equal(entered, 0);
  assert.equal(state.browseMode, false);
});

test('Schalter an: Stoebermodus mit API-Sets, leerer Sammlung und leerer Summary', async () => {
  let entered = 0;
  const ok = await startBrowseMode({
    loadFlags: async () => ({ browseWithoutLogin: true }),
    loadSets: async () => apiSets,
    loadPredicate: async () => isExcluded,
    onEnter: () => { entered++; },
  });
  assert.equal(ok, true);
  assert.equal(entered, 1);
  assert.equal(state.browseMode, true);
  assert.equal(state.loggedIn, false);
  assert.deepEqual(state.sets, []);
  assert.deepEqual(state.allSets.map((s) => s.setId), ['sv2', 'sv1']);
  assert.deepEqual(state.summaryData, []);
  assert.equal(state.dbMap.size, 0);
});

test('Sets nicht ladbar: false, kein halber Stoebermodus', async () => {
  stopBrowseMode();
  const ok = await startBrowseMode({
    loadFlags: async () => ({ browseWithoutLogin: true }),
    loadSets: async () => { throw new Error('offline'); },
    loadPredicate: async () => isExcluded,
    onEnter: () => {},
  });
  assert.equal(ok, false);
  assert.equal(state.browseMode, false);
});

test('stopBrowseMode beendet den Stoebermodus', () => {
  state.browseMode = true;
  stopBrowseMode();
  assert.equal(state.browseMode, false);
});
