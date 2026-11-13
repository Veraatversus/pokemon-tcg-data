import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseCardmarketHtml, mergeCustomSet, previewImport, formatSummary, runImport } from '../cardmarket/import-html.mjs';

const fixture = fs.readFileSync(new URL('./fixtures/cardmarket-search-page.html', import.meta.url), 'utf8');

test('parseCardmarketHtml: Expansion, Name, Produkt-IDs und Nummern inkl. V2/Buchstabe/H/fuehrende Nullen', () => {
  const r = parseCardmarketHtml(fixture);
  assert.equal(r.expansionId, 1538);
  assert.equal(r.name, 'Skyridge');
  assert.deepEqual(r.cards.map((c) => [c.productId, c.collectorNumber]), [
    [275504, '9'], [275500, '146'], [275501, '146V2'], [275502, '224a'], [275503, 'H1'],
  ]);
});

test('parseCardmarketHtml: doppelte Produkte ueber Seiten hinweg nur einmal', () => {
  const r = parseCardmarketHtml(fixture, fixture);
  assert.equal(r.cards.length, 5);
});

test('parseCardmarketHtml: Seite ohne Expansion -> Fehler', () => {
  assert.throws(() => parseCardmarketHtml('<html></html>'), /Expansion/);
});

test('mergeCustomSet: bestehende Eintraege und lot bleiben, neue kommen dazu', () => {
  const existing = { expansionId: 1538, name: 'Skyridge', cards: [{ productId: 275500, collectorNumber: '146' }, { productId: 1, collectorNumber: '0', lot: true }] };
  const parsed = parseCardmarketHtml(fixture);
  const { set, added, unchanged, conflicts } = mergeCustomSet(existing, parsed);
  assert.deepEqual(set.cards.slice(0, 2), existing.cards);
  assert.deepEqual(added.map((c) => c.productId), [275504, 275501, 275502, 275503]);
  assert.equal(unchanged, 1);
  assert.deepEqual(conflicts, []);
  assert.deepEqual(set.cards.map((c) => c.productId), [275500, 1, 275504, 275501, 275502, 275503]);
  assert.deepEqual(Object.keys(set.cards[2]), ['productId', 'collectorNumber']);
});

test('mergeCustomSet: Widerspruch wird gemeldet, nicht ueberschrieben; --force ersetzt und behaelt lot', () => {
  const existing = { expansionId: 1538, name: 'Skyridge', cards: [{ productId: 275502, collectorNumber: '224', lot: true }] };
  const parsed = parseCardmarketHtml(fixture);
  const plain = mergeCustomSet(existing, parsed);
  assert.deepEqual(plain.conflicts, [{ productId: 275502, existing: '224', incoming: '224a' }]);
  assert.equal(plain.set.cards.find((c) => c.productId === 275502).collectorNumber, '224');
  const forced = mergeCustomSet(existing, parsed, { force: true });
  assert.deepEqual(forced.set.cards.find((c) => c.productId === 275502), { productId: 275502, collectorNumber: '224a', lot: true });
});

test('mergeCustomSet: ohne bestehende Datei', () => {
  const { set } = mergeCustomSet(null, parseCardmarketHtml(fixture));
  assert.equal(set.expansionId, 1538);
  assert.equal(set.name, 'Skyridge');
  assert.equal(set.cards.length, 5);
});

// --- Vorher/Nachher ---
const product = (id, name) => ({ id, name, expansionId: 1538, collectorNumber: null });
const products = [product(275500, 'Charizard'), product(275501, 'Charizard'), product(275501, 'Charizard'), product(275502, 'Magneton'), product(275504, 'Pidgey'), product(275505, 'Magneton')];
const card = (cardId, number, name, cardmarket = []) => ({
  id: `sky-${cardId}`, setId: 'sky', cardId, number, name, ids: { cardmarket, tcgplayer: [] },
});
const sets = [{ id: 'sky', ids: { cardmarket: 1538 } }, { id: 'other', ids: { cardmarket: 7 } }];
const published = new Map([['sky', [card('146', '146', 'Charizard'), card('146V2', '146V2', 'Charizard'), card('224a', '224a', 'Magneton'), card('9', '9', 'Pidgey')]]]);

test('previewImport: geschlossene Luecken, offene Luecken und Widersprueche', () => {
  const after = mergeCustomSet(null, parseCardmarketHtml(fixture)).set;
  const res = previewImport({ expansionId: 1538, sets, publishedCards: published, products, customSetsBefore: [], customSetAfter: after });
  assert.deepEqual(res.sets.map((s) => s.setId), ['sky']);
  const s = res.sets[0];
  assert.deepEqual(s.closed.map((c) => [c.cardKey, c.productId]).sort(), [['sky/146', 275500], ['sky/224a', 275502]]);
  assert.equal(s.before.missing, 3);
  assert.equal(s.after.missing, 1);
  assert.deepEqual(s.remaining.map((c) => c.cardKey), ['sky/146V2']); // V2-Produkt: Karte mit Zusatz-Nummer bekommt es nicht (Versionsregel)
  assert.deepEqual(s.conflicts, []);
  const text = formatSummary(res);
  assert.match(text, /sky/);
  assert.match(text, /geschlossen/i);
});

test('previewImport: Widerspruch zu bestehender Zuordnung wird aufgelistet', () => {
  const cards = new Map([['sky', [card('224a', '224a', 'Magneton', [275505])]]]);
  const after = { expansionId: 1538, name: 'Skyridge', cards: [{ productId: 275502, collectorNumber: '224a' }] };
  const res = previewImport({ expansionId: 1538, sets, publishedCards: cards, products, customSetsBefore: [], customSetAfter: after });
  assert.deepEqual(res.sets[0].conflicts.map((c) => [c.cardKey, c.before, c.after]), [['sky/224a', 275505, 275502]]);
});

test('runImport: schreibt custom-set, --dry-run schreibt nichts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'imp-'));
  const html = path.join(root, 'page.html');
  fs.writeFileSync(html, fixture);
  const dry = runImport({ files: [html], root, dryRun: true });
  assert.equal(fs.existsSync(path.join(root, 'sources/cardmarket/custom-sets/1538.json')), false);
  assert.equal(dry.merged[0].added.length, 5);
  const real = runImport({ files: [html], root });
  const out = JSON.parse(fs.readFileSync(path.join(root, 'sources/cardmarket/custom-sets/1538.json'), 'utf8'));
  assert.equal(out.cards.length, 5);
  assert.equal(real.merged[0].added.length, 5);
  const again = runImport({ files: [html], root });
  assert.equal(again.merged[0].added.length, 0);
  assert.equal(again.merged[0].unchanged, 5);
});
