// Task 6: reine Hilfen fuer die Sammlungs-Aufrufer (collectionKey, alle Zeilen schreiben, mehrdeutige
// Altzeilen), Overview-Zuordnung von Alias-Sets, Datencheck-Vergleich und needsApiCardEnrichment.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  collectionKeyOf,
  emptyCollectionEntry,
  hasEntryCells,
  stateCellUpdates,
  applyEntryState,
  adoptEnsuredEntry,
  pendingAmbiguityError,
  isAmbiguousLegacyKeyError,
  describeAmbiguousLegacyKey,
  compareSetCollection
} from '../js/data/collection-writes.js';
import { mergeAliasOverviewSets } from '../js/data/set-aliases.js';
import { createCollectionKeyResolver } from '../js/data/v3-collection-keys.js';
import { needsApiCardEnrichment } from '../js/core/card-enrichment.js';

const cell = (rowNo, g = false, rh = false) => ({
  setKey: 'x', cardKey: 'x', rowNo, g, rh, rhRaw: rh,
  gCell: { row: rowNo, col: 3 }, rhCell: { row: rowNo, col: 4 }
});
const entry = (key, cells) => ({
  collectionKey: key, displayId: key, g: cells.some((c) => c.g), rh: false, cells,
  gCell: cells[0]?.gCell || null, rhCell: cells[0]?.rhCell || null
});
const sortUpdates = (list) => [...list].sort((a, b) => a.row - b.row || a.col - b.col);

test('collectionKeyOf: collectionKey vor Nummer, Nummer nur als Fallback', () => {
  assert.equal(collectionKeyOf({ collectionKey: '15_A1', number: '15' }), '15_A1');
  assert.equal(collectionKeyOf({ collectionKey: 'GG1', number: 'GG01' }), 'GG1');
  // zsv10pt5-80: v3-Nummer '60' (Datenmacke), Schluessel bleibt eindeutig
  assert.equal(collectionKeyOf({ collectionKey: '80', number: '60' }), '80');
  assert.equal(collectionKeyOf({ number: '007' }), '7');
  assert.equal(collectionKeyOf(null), '');
});

test('stateCellUpdates schreibt alle Zeilen einer Karte (GG1 unter swsh12pt5 und swsh12pt5gg)', () => {
  const gg = entry('GG1', [cell(5, true), cell(9, false)]);
  assert.deepEqual(sortUpdates(stateCellUpdates(gg, { g: true, rh: false })), [
    { row: 5, col: 3, value: true }, { row: 5, col: 4, value: false },
    { row: 9, col: 3, value: true }, { row: 9, col: 4, value: false }
  ]);
  // Abwaehlen: beide Zeilen g=false und rh=false (bleibt nicht an der zweiten Zeile haengen)
  assert.deepEqual(sortUpdates(stateCellUpdates(gg, { g: false, rh: true })), [
    { row: 5, col: 3, value: false }, { row: 5, col: 4, value: false },
    { row: 9, col: 3, value: false }, { row: 9, col: 4, value: false }
  ]);
  // rh => g
  assert.deepEqual(sortUpdates(stateCellUpdates(gg, { g: true, rh: true })).map((u) => u.value), [true, true, true, true]);
  // Altform nur mit gCell/rhCell
  assert.deepEqual(sortUpdates(stateCellUpdates({ gCell: { row: 2, col: 3 }, rhCell: { row: 2, col: 4 } }, { g: true, rh: true })), [
    { row: 2, col: 3, value: true }, { row: 2, col: 4, value: true }
  ]);
  assert.deepEqual(stateCellUpdates(emptyCollectionEntry({ collectionKey: '1', number: '1' }), { g: true }), []);
});

test('applyEntryState / adoptEnsuredEntry / hasEntryCells', () => {
  const gg = entry('GG1', [cell(5, true), cell(9, false)]);
  applyEntryState(gg, { g: true, rh: true });
  assert.equal(gg.g, true);
  assert.equal(gg.rh, true);
  assert.deepEqual(gg.cells.map((c) => [c.g, c.rh]), [[true, true], [true, true]]);
  applyEntryState(gg, { g: false, rh: true });
  assert.deepEqual([gg.g, gg.rh], [false, false]);

  const db = emptyCollectionEntry({ collectionKey: '1', number: '001' });
  assert.equal(hasEntryCells(db), false);
  adoptEnsuredEntry(db, entry('1', [cell(7, true)]));
  assert.equal(hasEntryCells(db), true);
  assert.equal(db.g, true);
  assert.deepEqual(db.gCell, { row: 7, col: 3 });
  assert.equal(db.cells.length, 1);
});

test('pendingAmbiguityError: nur bei gesetztem Altstatus und ohne eigene Zeile', () => {
  const amb = { legacyKey: '15', collectionKeys: ['15_A1', '15_A2'], g: true, rh: false, cells: [cell(4, true)] };
  const candidate = { ...emptyCollectionEntry({ collectionKey: '15_A1' }), ambiguous: amb };
  const err = pendingAmbiguityError(candidate, { setId: 'cel25c' });
  assert.ok(isAmbiguousLegacyKeyError(err));
  assert.equal(err.legacyKey, '15');
  assert.deepEqual(err.collectionKeys, ['15_A1', '15_A2']);
  assert.match(describeAmbiguousLegacyKey(err), /„15“ in cel25c gilt für mehrere Karten \(15_A1, 15_A2\).*nichts geschrieben/);

  assert.equal(pendingAmbiguityError({ ...candidate, ambiguous: { ...amb, g: false } }), null);
  assert.equal(pendingAmbiguityError({ ...entry('15_A1', [cell(8)]), ambiguous: amb }), null);
  assert.equal(pendingAmbiguityError(emptyCollectionEntry({ collectionKey: '1' })), null);
  assert.equal(isAmbiguousLegacyKeyError(new Error('x')), false);
});

// ── Overview-Zuordnung ───────────────────────────────────────────────────────
const REG_SETS = {
  me5: { aliases: ['TCGDEX-me05'], mergedSubsets: [], pokemontcg: 'me5', tcgdex: 'me05' },
  swsh12pt5: {
    aliases: ['TCGDEX-swsh12.5', 'TCGDEX-swsh12.5gg', 'swsh12pt5gg'],
    mergedSubsets: ['swsh12pt5gg'],
    pokemontcg: 'swsh12pt5',
    tcgdex: 'swsh12.5'
  },
  base1: { aliases: [], mergedSubsets: [], pokemontcg: 'base1', tcgdex: 'base1' }
};
const resolver = createCollectionKeyResolver(REG_SETS, new Map());

test('Overview: swsh12pt5gg imported -> swsh12pt5 imported, swsh12pt5gg nicht gelistet', () => {
  const merged = mergeAliasOverviewSets([
    { setId: 'swsh12pt5', setName: 'Crown Zenith', imported: false },
    { setId: 'swsh12pt5gg', setName: 'Crown Zenith Galarian Gallery', imported: true },
    { setId: 'base1', setName: 'Base', imported: false }
  ], resolver);
  assert.deepEqual(merged.map((s) => s.setId), ['swsh12pt5', 'base1']);
  const crz = merged.find((s) => s.setId === 'swsh12pt5');
  assert.equal(crz.imported, true);
  assert.equal(crz.setName, 'Crown Zenith');
  assert.deepEqual(crz.mergedAliasIds, ['swsh12pt5gg']);
  assert.deepEqual(crz.aliases.sort(), ['TCGDEX-swsh12.5', 'TCGDEX-swsh12.5gg', 'swsh12pt5gg'].sort());
  assert.deepEqual(merged.find((s) => s.setId === 'base1').aliases, ['TCGDEX-base1']);
});

test('Overview: Alias ohne kanonische Zeile wird unter der kanonischen ID gefuehrt; ODER bleibt ODER', () => {
  const merged = mergeAliasOverviewSets([
    { setId: 'TCGDEX-me05', setName: 'Mega Evolution 5', imported: true },
    { setId: 'swsh12pt5', setName: 'Crown Zenith', imported: true },
    { setId: 'swsh12pt5gg', setName: 'CRZ GG', imported: false },
    { setId: 'unknown-set', setName: 'Unbekannt', imported: true }
  ], resolver);
  assert.deepEqual(merged.map((s) => [s.setId, s.imported]), [
    ['swsh12pt5', true],
    ['unknown-set', true],
    ['me5', true]
  ]);
  assert.deepEqual(merged.find((s) => s.setId === 'me5').aliases, ['TCGDEX-me05']);
  assert.deepEqual(merged.find((s) => s.setId === 'unknown-set').aliases, []);
});

test('Overview: ohne Resolver unveraendert (Registry offline)', () => {
  const input = [{ setId: 'swsh12pt5gg', setName: 'GG', imported: true }];
  const merged = mergeAliasOverviewSets(input, null);
  assert.deepEqual(merged, input);
  assert.notEqual(merged[0], input[0]);
});

// ── Datencheck ────────────────────────────────────────────────────────────────
test('Datencheck: Hauptset mit zusammengefuehrtem Unterset ist keine Abweichung', () => {
  const apiCards = [{ collectionKey: '1', number: '1' }, { collectionKey: '2', number: '2' }, { collectionKey: 'GG1', number: 'GG01' }];
  // GG1 nur unter dem Alias swsh12pt5gg (zwei Zellen), 1 und 2 unter swsh12pt5.
  const map = new Map([
    ['1', entry('1', [cell(2)])],
    ['2', entry('2', [cell(3)])],
    ['GG1', entry('GG1', [cell(10), cell(11)])]
  ]);
  const result = compareSetCollection(apiCards, map);
  assert.equal(result.mismatch, false);
  assert.equal(result.apiCount, 3);
  assert.equal(result.sheetCount, 3);
});

test('Datencheck: fehlende Zeile ist Abweichung, Waisen und mehrdeutige Altzeilen nicht', () => {
  const amb = { legacyKey: '15', collectionKeys: ['15_A1', '15_A2'], g: true, rh: false, cells: [cell(4, true)] };
  const map = new Map([
    ['1', entry('1', [cell(2)])],
    ['15_A1', { ...emptyCollectionEntry({ collectionKey: '15_A1' }), ambiguous: amb }],
    ['15_A2', { ...emptyCollectionEntry({ collectionKey: '15_A2' }), ambiguous: amb }],
    ['999', { ...entry('999', [cell(20)]), orphan: true }]
  ]);
  const ok = compareSetCollection([{ collectionKey: '1' }, { collectionKey: '15_A1' }, { collectionKey: '15_A2' }], map);
  assert.equal(ok.mismatch, false);
  assert.equal(ok.orphanCount, 1);
  assert.equal(ok.ambiguousCovered, 2);

  const missing = compareSetCollection([{ collectionKey: '1' }, { collectionKey: '3' }], map);
  assert.equal(missing.mismatch, true);
  assert.deepEqual(missing.missingKeys, ['3']);

  const extra = compareSetCollection([{ collectionKey: '15_A1' }, { collectionKey: '15_A2' }], map);
  assert.deepEqual(extra.extraKeys, ['1']);
  assert.equal(extra.mismatch, true);
});

// ── needsApiCardEnrichment ────────────────────────────────────────────────────
const rich = (url) => ({ rarity: 'Rare', hp: '60', cardmarketUrl: url });

test('needsApiCardEnrichment: v3-Produkt-URLs (?idProduct=) und leere URLs loesen kein Nachladen aus', () => {
  const v3Cards = Array.from({ length: 12 }, (_, i) => rich(i % 3 ? `https://www.cardmarket.com/en/Pokemon/Products?idProduct=${700000 + i}` : ''));
  assert.equal(needsApiCardEnrichment(v3Cards), false);
});

test('needsApiCardEnrichment: alte Suchlinks oder duenne Altzeilen loesen Nachladen aus', () => {
  const search = 'https://www.cardmarket.com/de/Pokemon/Products/Search?searchString=Pikachu';
  assert.equal(needsApiCardEnrichment([rich(search), rich('')]), true);
  assert.equal(needsApiCardEnrichment([{ name: 'A' }, { name: 'B' }, rich('')]), true);
  assert.equal(needsApiCardEnrichment([]), false);
});
