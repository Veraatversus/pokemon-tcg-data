// Task 7: Migration mehrdeutiger Altschluessel (Spec §5.3). Reine Plan-/Apply-Logik mit Stub-Deps,
// Eintraege kommen aus der echten buildCollectionMap (synthetische Registry wie in collection-aliases.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCollectionMap } from '../js/data/collection-aliases.js';
import { createCollectionKeyResolver } from '../js/data/v3-collection-keys.js';
import {
  planAmbiguousMigration,
  applyAmbiguousMigration,
  toggleChoice
} from '../js/features/collection/ambiguous-key-migration.js';

const mk = (id, td, extra = {}) => ({ keys: { pokemontcg: [], tcgdex: [td] }, pokemontcg: id, tcgdex: [{ localId: td, set: 'cel25cc' }], ...extra });
const SETS = { cel25c: { aliases: ['TCGDEX-cel25cc'], mergedSubsets: [], pokemontcg: 'cel25c', tcgdex: 'cel25cc' } };
const CARDS = new Map([['cel25c', {
  1: { keys: { pokemontcg: ['1'], tcgdex: ['1'] }, pokemontcg: 'cel25c-1', tcgdex: [{ localId: '1', set: 'cel25cc' }] },
  '15_A1': mk('cel25c-15_A1', '15A1', { ambiguousLegacyKey: '15' }),
  '15_A2': mk('cel25c-15_A2', '15A2', { ambiguousLegacyKey: '15' })
}]]);
const resolver = createCollectionKeyResolver(SETS, CARDS);
const NOW = '2026-11-12T00:00:00.000Z';
const cardList = [{ collectionKey: '15_A1', name: 'Pikachu', images: { small: 'a.png' } }, { collectionKey: '15_A2', name: 'Pikachu' }];

const mapFor = (rows) => buildCollectionMap(rows, { canonicalSetId: 'cel25c', resolver }).map;
const ambiguousOf = (map) => [...map.values()].filter((e) => e.ambiguous);

test('Altzeile ohne Haken -> stille Zeilen fuer alle Kandidaten, Altzeile bleibt', () => {
  const map = mapFor([['cel25c', '15', false, false, 'x']]);
  const plan = planAmbiguousMigration(ambiguousOf(map), { setId: 'cel25c', now: NOW, cards: cardList });
  assert.deepEqual(plan.silent, [
    ['cel25c', '15_A1', false, false, NOW],
    ['cel25c', '15_A2', false, false, NOW]
  ]);
  assert.deepEqual(plan.needsDialog, []);
});

test('stille Kandidaten mit eigener Zeile werden nicht doppelt angelegt', () => {
  const map = mapFor([['cel25c', '15', false, false, 'x'], ['cel25c', '15_A1', true, false, 'x']]);
  const plan = planAmbiguousMigration(ambiguousOf(map), { setId: 'cel25c', now: NOW });
  assert.deepEqual(plan.silent, [['cel25c', '15_A2', false, false, NOW]]);
});

test('Altzeile mit Haken -> Dialog-Eintrag mit Kandidaten und Kartendaten', () => {
  const map = mapFor([['cel25c', '15', true, true, 'x']]);
  const plan = planAmbiguousMigration(ambiguousOf(map), { setId: 'cel25c', now: NOW, cards: cardList });
  assert.deepEqual(plan.silent, []);
  assert.equal(plan.needsDialog.length, 1);
  const item = plan.needsDialog[0];
  assert.equal(item.legacyKey, '15');
  assert.deepEqual({ g: item.row.g, rh: item.row.rh }, { g: true, rh: true });
  assert.deepEqual(item.candidates.map((c) => c.collectionKey), ['15_A1', '15_A2']);
  assert.equal(item.candidates[0].card.images.small, 'a.png');
});

function makeDeps(initialRows) {
  const rows = initialRows.map((r) => [...r]);
  const calls = [];
  return {
    rows,
    calls,
    createSnapshot: async (name, data) => { calls.push('snapshot'); rows.snapshot = { name, data }; },
    appendRows: async (r) => { calls.push('append'); r.forEach((x) => rows.push([...x])); },
    updateCells: async (updates) => {
      calls.push('update');
      updates.forEach(({ row, col, value }) => { rows[row - 2][col - 1] = value; });
    },
    readMap: async () => mapFor(rows)
  };
}
const planOf = (deps, cards = cardList) => planAmbiguousMigration(ambiguousOf(mapFor(deps.rows)), { setId: 'cel25c', now: NOW, cards });

test('apply: gewaehlte Karten bekommen Haken, Altzeile false (nicht geloescht), Snapshot zuerst', async () => {
  const deps = makeDeps([['cel25c', '15', true, true, 'x']]);
  const plan = planOf(deps);
  const result = await applyAmbiguousMigration(plan, new Map([['15', new Set(['15_A2'])]]), deps);
  assert.equal(deps.calls[0], 'snapshot');
  assert.equal(deps.rows.length, 2);
  assert.deepEqual(deps.rows[0].slice(0, 4), ['cel25c', '15', false, false]);
  assert.deepEqual(deps.rows[1], ['cel25c', '15_A2', true, true, NOW]);
  assert.deepEqual(result, { created: 1, updated: 0, cleared: 1, migrated: ['15'] });
  assert.ok(deps.rows.snapshot.name.includes('cel25c'));
});

test('apply: bestehende eigene Zeile wird aktualisiert statt dupliziert', async () => {
  const deps = makeDeps([['cel25c', '15', true, false, 'x'], ['cel25c', '15_A1', false, false, 'x']]);
  const result = await applyAmbiguousMigration(planOf(deps), new Map([['15', new Set(['15_A1'])]]), deps);
  assert.equal(deps.rows.length, 2);
  assert.deepEqual(deps.rows[1].slice(0, 4), ['cel25c', '15_A1', true, false]);
  assert.deepEqual(deps.rows[0].slice(0, 4), ['cel25c', '15', false, false]);
  assert.equal(result.updated, 1);
});

test('apply ist idempotent (zweiter Lauf mit altem Plan legt nichts doppelt an)', async () => {
  const deps = makeDeps([['cel25c', '15', true, false, 'x']]);
  const plan = planOf(deps);
  const choices = new Map([['15', new Set(['15_A1', '15_A2'])]]);
  await applyAmbiguousMigration(plan, choices, deps);
  const after = JSON.stringify(deps.rows);
  await applyAmbiguousMigration(plan, choices, deps);
  assert.equal(deps.rows.length, 3);
  assert.equal(deps.rows.filter((r) => r[1] === '15_A1').length, 1);
  assert.equal(JSON.stringify(deps.rows.map((r) => r.slice(0, 4))), JSON.stringify(JSON.parse(after).map((r) => r.slice(0, 4))));
});

test('apply stille Migration: Zeilen false angelegt, zweimal ausfuehren ohne Duplikate', async () => {
  const deps = makeDeps([['cel25c', '15', false, false, 'x']]);
  const plan = planOf(deps);
  await applyAmbiguousMigration(plan, new Map(), deps);
  await applyAmbiguousMigration(plan, new Map(), deps);
  assert.deepEqual(deps.rows.map((r) => r[1]), ['15', '15_A1', '15_A2']);
});

test('Spaeter / leere Auswahl: nichts wird geschrieben, kein Snapshot', async () => {
  const deps = makeDeps([['cel25c', '15', true, true, 'x']]);
  const before = JSON.stringify(deps.rows);
  const result = await applyAmbiguousMigration(planOf(deps), new Map([['15', new Set()]]), deps);
  assert.deepEqual(deps.calls, []);
  assert.equal(JSON.stringify(deps.rows), before);
  assert.equal(result.cleared, 0);
});

test('toggleChoice verwaltet die Mehrfachauswahl', () => {
  const choices = new Map();
  toggleChoice(choices, '15', '15_A1', true);
  toggleChoice(choices, '15', '15_A2', true);
  toggleChoice(choices, '15', '15_A1', false);
  assert.deepEqual([...choices.get('15')], ['15_A2']);
});

// ── Fix round 1 ───────────────────────────────────────────────────────────────
import { restoreAmbiguousMigration } from '../js/features/collection/ambiguous-key-migration.js';

test('Snapshot enthaelt alles fuer die Wiederherstellung; restore bringt exakt den Vorzustand zurueck', async () => {
  const deps = makeDeps([
    ['cel25c', '15', true, true, 'x'],
    ['cel25c', '15_A1', true, false, 'x'] // eigene Zeile wird aktualisiert (rh false -> true)
  ]);
  const before = deps.rows.map((r) => r.slice(0, 4));
  let snap = null;
  deps.createSnapshot = async (name, data) => { snap = data; };
  await applyAmbiguousMigration(planOf(deps), new Map([['15', new Set(['15_A1', '15_A2'])]]), deps);
  assert.ok(snap);
  const m = snap.migrations[0];
  assert.equal(snap.setId, 'cel25c');
  assert.deepEqual(m.legacyRows, [{ row: 2, g: true, rh: true }]);
  assert.deepEqual(m.chosen.sort(), ['15_A1', '15_A2']);
  assert.deepEqual(m.updatedRows, [{ collectionKey: '15_A1', row: 3, g: true, rh: false }]);
  assert.deepEqual(m.created, [{ setId: 'cel25c', collectionKey: '15_A2' }]);
  assert.equal(deps.rows[0][2], false);
  await restoreAmbiguousMigration(snap, deps);
  assert.equal(deps.rows.length, 3, 'nichts geloescht');
  assert.deepEqual(deps.rows.slice(0, 2).map((r) => r.slice(0, 4)), before);
  assert.deepEqual(deps.rows[2].slice(0, 4), ['cel25c', '15_A2', false, false]);
});

test('veralteter Plan: zweiter apply aendert nichts (Altzeile nicht mehr gesetzt)', async () => {
  const deps = makeDeps([['cel25c', '15', true, false, 'x']]);
  const plan = planOf(deps);
  await applyAmbiguousMigration(plan, new Map([['15', new Set(['15_A1'])]]), deps);
  // Nutzer setzt A1 zwischenzeitlich zurueck; stale Plan darf nicht erneut Haken setzen.
  deps.rows[1][2] = false;
  const snapshot = JSON.stringify(deps.rows);
  deps.calls.length = 0;
  const result = await applyAmbiguousMigration(plan, new Map([['15', new Set(['15_A1', '15_A2'])]]), deps);
  assert.equal(JSON.stringify(deps.rows), snapshot);
  assert.deepEqual(deps.calls, []);
  assert.deepEqual(result.migrated, []);
});

test('Teilfehler: append ok, update schlaegt fehl -> Wiederholung vollendet ohne Duplikate', async () => {
  const deps = makeDeps([['cel25c', '15', true, false, 'x']]);
  const plan = planOf(deps);
  const choices = new Map([['15', new Set(['15_A1', '15_A2'])]]);
  const realUpdate = deps.updateCells;
  deps.updateCells = async () => { throw new Error('quota'); };
  await assert.rejects(applyAmbiguousMigration(plan, choices, deps), /quota/);
  assert.equal(deps.rows[0][2], true, 'Altzeile bleibt gesetzt, solange nicht alles geschrieben ist');
  deps.updateCells = realUpdate;
  await applyAmbiguousMigration(plan, choices, deps);
  assert.deepEqual(deps.rows.map((r) => r[1]), ['15', '15_A1', '15_A2']);
  assert.deepEqual(deps.rows.map((r) => r[2]), [false, true, true]);
});

test('Altzeile nur mit rh (ohne g) gilt als nicht gesetzt -> still, kein Dialog', () => {
  const map = mapFor([['cel25c', '15', false, true, 'x']]);
  const plan = planAmbiguousMigration(ambiguousOf(map), { setId: 'cel25c', now: NOW });
  assert.equal(plan.needsDialog.length, 0);
  assert.equal(plan.silent.length, 2);
});

test('rein stille Migration legt keinen Snapshot an', async () => {
  const deps = makeDeps([['cel25c', '15', false, false, 'x']]);
  await applyAmbiguousMigration(planOf(deps), new Map(), deps);
  assert.ok(!deps.calls.includes('snapshot'));
  assert.deepEqual(deps.rows.map((r) => r[1]), ['15', '15_A1', '15_A2']);
});
