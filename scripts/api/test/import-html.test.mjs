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

// --- Fix-Runde 1 ---
const tmpRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'imp-'));
const writePage = (root, html = fixture) => { const f = path.join(root, 'page.html'); fs.writeFileSync(f, html); return f; };

test('runImport: kaputte bestehende custom-set-Datei bricht ab und bleibt unveraendert', () => {
  const root = tmpRoot();
  const dir = path.join(root, 'sources/cardmarket/custom-sets');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '1538.json'), '{ "expansionId": 1538, "cards": [');
  assert.throws(() => runImport({ files: [writePage(root)], root }), /1538\.json.*JSON/);
  assert.equal(fs.readFileSync(path.join(dir, '1538.json'), 'utf8'), '{ "expansionId": 1538, "cards": [');
});

test('runImport: kaputte api/v3-Eingabe wird gemeldet statt still uebergangen', () => {
  const root = tmpRoot();
  fs.mkdirSync(path.join(root, 'sources/cardmarket'), { recursive: true });
  fs.writeFileSync(path.join(root, 'sources/cardmarket/catalog.jsonl'), '');
  fs.mkdirSync(path.join(root, 'api/v3'), { recursive: true });
  fs.writeFileSync(path.join(root, 'api/v3/sets.json'), '[oops');
  assert.throws(() => runImport({ files: [writePage(root)], root, dryRun: true }), /sets\.json/);
});

test('parseCardmarketHtml: Statistik Bloecke/gelesen/uebersprungen', () => {
  const broken = fixture.replace('Pidgey (SK 009)', 'Pidgey ohne Nummer');
  const r = parseCardmarketHtml(broken);
  assert.deepEqual(r.stats, { blocks: 5, parsed: 4, skipped: 1 });
});

test('runImport: Seite ohne lesbare Karten -> klarer Fehler, nichts geschrieben', () => {
  const root = tmpRoot();
  const page = writePage(root, '<title>Skyridge Singles | Cardmarket</title><a href="/x?idExpansion=1538"></a><div>neues Markup</div>');
  assert.throws(() => runImport({ files: [page], root }), /0 Bloecke gefunden, 0 gelesen, 0 uebersprungen.*Markup/);
  assert.equal(fs.existsSync(path.join(root, 'sources/cardmarket/custom-sets')), false);
});

test('runImport: fehlende HTML-Datei -> klare Meldung', () => {
  assert.throws(() => runImport({ files: [path.join(tmpRoot(), 'nope.html')], root: tmpRoot() }), /HTML-Datei .*nope\.html nicht lesbar/);
});

test('mergeCustomSet: gleiche Nummer bei zwei Produkten wird gemeldet', () => {
  const existing = { expansionId: 1538, name: 'Skyridge', cards: [{ productId: 5, collectorNumber: '146' }, { productId: 6, collectorNumber: '9', lot: true }] };
  const { duplicateNumbers } = mergeCustomSet(existing, parseCardmarketHtml(fixture));
  assert.deepEqual(duplicateNumbers, [{ collectorNumber: '146', productIds: [5, 275500] }]);
});

test('mergeCustomSet: unbekannte Schluessel der bestehenden Datei bleiben', () => {
  const existing = { expansionId: 1538, name: 'Skyridge', note: 'handgepflegt', cards: [] };
  assert.equal(mergeCustomSet(existing, parseCardmarketHtml(fixture)).set.note, 'handgepflegt');
});

test('Versionsregel: V2+ immer mit Suffix; unvollstaendige Seite gibt sichtbaren Widerspruch statt stiller Aenderung', () => {
  // Seite mit nur dem V2-Produkt (V1 fehlt): altes Skript haette "146" vergeben.
  const onlyV2 = fixture.replace(/<div class="col-6">\s*<a href="[^"]*Charizard-SK146"[\s\S]*?<\/a>\s*<\/div>/, '');
  const parsed = parseCardmarketHtml(onlyV2);
  assert.equal(parsed.cards.find((c) => c.productId === 275501).collectorNumber, '146V2');
  const existing = { expansionId: 1538, name: 'Skyridge', cards: [{ productId: 275501, collectorNumber: '146' }] };
  const m = mergeCustomSet(existing, parsed);
  assert.deepEqual(m.conflicts, [{ productId: 275501, existing: '146', incoming: '146V2' }]);
  assert.equal(m.set.cards[0].collectorNumber, '146');
});
