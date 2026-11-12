// Final-Review Findings 2/3: v1-Backups und Legacy-Import loesen Kartenschluessel im Namensraum ihres
// QUELL-Sets auf (echte api/registry: me55c <- TCGDEX-30th-c, cel25c <- TCGDEX-cel25cc).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createCollectionKeyResolver } from '../js/data/v3-collection-keys.js';
import { buildCollectionMap } from '../js/data/collection-aliases.js';
import { hasEntryCells, stateCellUpdates, applyEntryState } from '../js/data/collection-writes.js';
import {
  pickSourceSetKey,
  resolveSourceCardKey,
  buildBackupRestoreSnapshot,
  planBackupRestore
} from '../js/features/collection/legacy-key-resolution.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const regDir = path.join(root, 'api/registry');
const SETS = JSON.parse(fs.readFileSync(path.join(regDir, 'sets.json'), 'utf8'));
const CARDS = Object.fromEntries(['me55c', 'cel25c'].map((id) => [id, JSON.parse(fs.readFileSync(path.join(regDir, 'cards', `${id}.json`), 'utf8'))]));
const resolver = createCollectionKeyResolver(SETS, new Map(Object.entries(CARDS)));
const T0 = '2026-01-01T00:00:00.000Z';

// Erwartung unabhaengig vom Resolver: TCGdex-localId (als Zahl) -> collectionKey.
function byLocalId(setId) {
  const out = new Map();
  for (const [key, card] of Object.entries(CARDS[setId])) {
    for (const ref of card.tcgdex || []) out.set(ref.localId.replace(/^([A-Z]*)0+(\d)/, '$1$2'), key);
  }
  return out;
}

// Restore wie applyCollectionBackup: Plan anwenden, Zell-Updates sammeln.
function restore(rows, canonicalSetId, backupSets, version) {
  const liveMap = buildCollectionMap(rows, { canonicalSetId, resolver }).map;
  const snap = buildBackupRestoreSnapshot(backupSets, { liveSetId: canonicalSetId, version, resolver });
  const plan = planBackupRestore(liveMap, {
    snapshot: snap.snapshot,
    protectedKeys: snap.protectedKeys,
    allowUncheck: snap.unresolved === 0,
    hasCells: hasEntryCells
  });
  const updates = [];
  for (const { entry, target } of plan) {
    updates.push(...stateCellUpdates(entry, target));
    applyEntryState(entry, target);
  }
  return { liveMap, snap, plan, updates };
}

test('v1-Backup TCGDEX-30th-c (Schluessel 1..30 = localIds) -> richtige me55c-Karten', () => {
  const expected = byLocalId('me55c');
  assert.equal(expected.size, 30);
  for (let n = 1; n <= 30; n += 1) {
    assert.deepEqual(resolveSourceCardKey(resolver, 'TCGDEX-30th-c', String(n)), { collectionKey: expected.get(String(n)) }, `localId ${n}`);
  }
  // Der rohe Schluessel "4" waere in me55c eine andere Karte (pokemontcg 4 = localId 001).
  assert.equal(expected.get('4'), '11g');
  assert.equal(expected.get('1'), '4');
});

test('Restore v1 TCGDEX-30th-c auf me55c: Haken landen auf der Karte der localId, Alias-Zeilen nicht falsch gesetzt', () => {
  const rows = [
    ['me55c', '4', false, false, T0],           // Karte "4" = localId 001, Zeile im pokemontcg-Namensraum
    ['TCGDEX-30th-c', '1', false, false, T0],   // dieselbe Karte als TCGdex-Alias-Zeile
    ['TCGDEX-30th-c', '4', false, false, T0],   // localId 004 = 11g
    ['me55c', '5', true, false, T0],            // nicht im Backup -> wird abgewaehlt (exakter Stand)
    ['TCGDEX-30th-c', '3', true, true, T0]      // localId 003 = 11_3, im Backup ohne rh
  ];
  const backup = [{ setId: 'TCGDEX-30th-c', cards: [
    { cardId: '1', g: true, rh: true },
    { cardId: '4', g: true, rh: false },
    { cardId: '3', g: true, rh: false }
  ] }];
  const { liveMap, snap, updates } = restore(rows, 'me55c', backup, 1);
  assert.equal(snap.unresolved, 0);
  assert.equal(snap.ambiguous, 0);
  assert.deepEqual([...snap.snapshot.keys()].sort(), ['11_3', '11g', '4']);

  const card4 = liveMap.get('4');
  assert.deepEqual([card4.g, card4.rh], [true, true]);
  assert.equal(card4.cells.length, 2, 'beide Zeilen der Karte (me55c/4 und TCGDEX-30th-c/1)');
  assert.ok(card4.cells.every((c) => c.g === true && c.rh === true));
  assert.deepEqual([liveMap.get('11g').g, liveMap.get('11g').rh], [true, false]);
  assert.deepEqual([liveMap.get('11_3').g, liveMap.get('11_3').rh], [true, false]);
  assert.deepEqual([liveMap.get('5').g, liveMap.get('5').rh], [false, false]);

  // Zeile 2 (me55c/4 = localId 001) darf nicht durch den rohen Backup-Schluessel "4" (= 11g) gesetzt werden:
  // jede geschriebene Zelle gehoert zur Karte ihrer Zeile.
  const rowOf = new Map();
  for (const [key, entry] of liveMap) for (const cell of entry.cells) rowOf.set(cell.gCell.row, key);
  for (const u of updates) assert.ok(rowOf.has(u.row), `Update auf bekannte Zeile ${u.row}`);
  const g11gRows = liveMap.get('11g').cells.map((c) => c.gCell.row);
  const card4Rows = card4.cells.map((c) => c.gCell.row);
  assert.equal(g11gRows.filter((r) => card4Rows.includes(r)).length, 0);
  assert.deepEqual(card4Rows.map((r) => rowOf.get(r)), ['4', '4']);
});

test('Restore v1 me55c: mehrdeutige Nummer 11 wird uebersprungen, Kandidaten bleiben unveraendert', () => {
  const rows = [
    ['me55c', '11_3', true, false, T0],
    ['me55c', '11g', false, false, T0],
    ['me55c', '18', false, false, T0]
  ];
  const backup = [{ setId: 'me55c', cards: [{ cardId: '11', g: false, rh: false }, { cardId: '18', g: true }] }];
  const { liveMap, snap } = restore(rows, 'me55c', backup, 1);
  assert.equal(snap.ambiguous, 1);
  assert.deepEqual([...snap.protectedKeys].sort(), ['11_3', '11g']);
  assert.equal(liveMap.get('11_3').g, true, 'nicht abgewaehlt');
  assert.equal(liveMap.get('11g').g, false, 'nicht gesetzt');
  assert.equal(liveMap.get('18').g, true);
});

test('Restore v1 cel25c (pokemontcg-Nummern) und TCGDEX-cel25cc (CC-localIds)', () => {
  const rows = [
    ['cel25c', '2', false, false, T0],
    ['TCGDEX-cel25cc', 'CC1', false, false, T0],
    ['cel25c', '4', false, false, T0],
    ['cel25c', '15_A1', true, false, T0],
    ['cel25c', '15_A2', false, false, T0]
  ];
  const backup = [
    { setId: 'cel25c', cards: [{ cardId: '4', g: true }, { cardId: '15', g: true }] },
    { setId: 'TCGDEX-cel25cc', cards: [{ cardId: 'CC1', g: true, rh: true }, { cardId: 'CC6', g: true }] }
  ];
  const { liveMap, snap } = restore(rows, 'cel25c', backup, 1);
  assert.equal(snap.ambiguous, 1, 'cel25c/15 mehrdeutig');
  assert.equal(snap.unresolved, 0);
  assert.equal(liveMap.get('2').cells.length, 2);
  assert.deepEqual([liveMap.get('2').g, liveMap.get('2').rh], [true, true], 'CC1 -> 2');
  assert.equal(liveMap.get('4').g, true);
  assert.equal(liveMap.get('15_A2').g, true, 'CC6 -> 15_A2 (eindeutig ueber localId)');
  assert.equal(liveMap.get('15_A1').g, true, 'Kandidat des mehrdeutigen Schluessels bleibt');
});

test('Restore v2 mit kanonischer Set-ID nutzt collectionKeys direkt; v2 unter Alias-ID: Schluessel bleiben collectionKeys', () => {
  const rows = [['me55c', '11g', false, false, T0], ['me55c', '4', false, false, T0]];
  const v2 = restore(rows, 'me55c', [{ setId: 'me55c', cards: [{ cardId: '11g', g: true }] }], 2);
  assert.equal(v2.liveMap.get('11g').g, true);
  assert.equal(v2.liveMap.get('4').g, false);
  const alias = restore(rows, 'me55c', [{ setId: 'TCGDEX-30th-c', cards: [{ cardId: '4', g: true }] }], 2);
  assert.equal(alias.liveMap.get('4').g, true);
  assert.equal(alias.liveMap.get('11g').g, false);
  // '1' ist unter v2 der collectionKey '1' (kein Treffer im Live-Set), nicht die TCGdex-localId von Karte 4
  const notLocalId = restore(rows, 'me55c', [{ setId: 'TCGDEX-30th-c', cards: [{ cardId: '1', g: true }] }], 2);
  assert.equal(notLocalId.liveMap.get('4').g, false);
  assert.equal(notLocalId.snap.unresolved, 0);
});

test('Restore: nicht aufloesbare Schluessel -> gezaehlt, nie roh geschrieben, und keine Haken entfernt', () => {
  const rows = [['me55c', '4', true, false, T0], ['me55c', '5', false, false, T0]];
  const { liveMap, snap } = restore(rows, 'me55c', [{ setId: 'me55c', cards: [{ cardId: '999', g: true }, { cardId: '5', g: true }] }], 1);
  assert.equal(snap.unresolved, 1);
  assert.ok(!snap.snapshot.has('999'));
  assert.equal(liveMap.get('4').g, true, 'kein Abwaehlen, solange ein Schluessel unklar ist');
  assert.equal(liveMap.get('5').g, true);
});

test('Legacy-Import: Quell-Namensraum (pickSourceSetKey) und Aufloesung ohne Rohschluessel', () => {
  assert.equal(pickSourceSetKey(resolver, { sourceSetId: 'TCGDEX-30th-c', liveSetId: 'me55c' }), 'TCGDEX-30th-c');
  assert.equal(pickSourceSetKey(resolver, { sourceSetId: '30th-c', liveSetId: 'me55c' }), 'TCGDEX-30th-c');
  assert.equal(pickSourceSetKey(resolver, { sourceSetId: '', liveSetId: 'me55c' }), 'me55c');
  assert.equal(pickSourceSetKey(resolver, { sourceSetId: 'me55c', liveSetId: 'me55c' }), 'me55c');
  assert.equal(pickSourceSetKey(resolver, { sourceSetId: 'cel25c', liveSetId: 'me55c' }), null, 'fremdes Set');

  const legacySheet = [{ sourceCardId: '004' }, { sourceCardId: '1' }, { sourceCardId: '31' }];
  const key = pickSourceSetKey(resolver, { sourceSetId: '30th-c', liveSetId: 'me55c' });
  const results = legacySheet.map((c) => resolveSourceCardKey(resolver, key, c.sourceCardId));
  assert.deepEqual(results, [{ collectionKey: '11g' }, { collectionKey: '4' }, { skip: 'unresolved' }]);

  // Ohne Set-ID (Blatt per Name): pokemontcg-Nummern des Live-Sets; mehrdeutig -> uebersprungen.
  const byName = pickSourceSetKey(resolver, { sourceSetId: '', liveSetId: 'me55c' });
  assert.deepEqual(resolveSourceCardKey(resolver, byName, '4'), { collectionKey: '4' });
  assert.deepEqual(resolveSourceCardKey(resolver, byName, '11'), { skip: 'ambiguous', collectionKeys: ['11_3', '11g'] });
  // Fremder Namensraum -> nichts aufloesbar (kein Schreiben ins kanonische Set)
  assert.deepEqual(resolveSourceCardKey(resolver, null, '4'), { skip: 'unresolved' });
});
