import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseCardmarketHtml, parseCardmarketJson, versionOfSlug, numberOfLabel, BROWSER_SNIPPET, mergeCustomSet, previewImport, formatSummary, runImport } from '../cardmarket/import-html.mjs';

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

test('Versionsregel: Suffix nur bei gleicher Nummer; unvollstaendige Seite gibt sichtbaren Widerspruch statt stiller Aenderung', () => {
  // Seite mit nur dem V2-Produkt (V1 fehlt): V2 steht allein -> Basisnummer; das bestehende "146V2" bleibt, Widerspruch.
  const onlyV2 = fixture.replace(/<div class="col-6">\s*<a href="[^"]*Charizard-SK146"[\s\S]*?<\/a>\s*<\/div>/, '');
  const parsed = parseCardmarketHtml(onlyV2);
  assert.equal(parsed.cards.find((c) => c.productId === 275501).collectorNumber, '146');
  const existing = { expansionId: 1538, name: 'Skyridge', cards: [{ productId: 275501, collectorNumber: '146V2' }] };
  const m = mergeCustomSet(existing, parsed);
  assert.deepEqual(m.conflicts, [{ productId: 275501, existing: '146V2', incoming: '146' }]);
  assert.equal(m.set.cards[0].collectorNumber, '146V2');
});

// --- JSON-Eingabe (Browser-Konsole, --snippet) ---
const bwList = (cards, extra = {}) => ({ expansionId: 1611, name: 'BW Black Star Promos', ...extra, cards });
const bw = (productId, version, label) => ({ productId, version, label });

test('versionOfSlug / numberOfLabel: Links ohne Setcode und Ueberschriften', () => {
  assert.equal(versionOfSlug('Snivy-V2'), 2);
  assert.equal(versionOfSlug('Zoroark-V2-OS'), 2);
  assert.equal(versionOfSlug('Magneton-V2-SVP159'), 2);
  assert.equal(versionOfSlug('Reshiram-BWBW04'), 1);
  assert.equal(versionOfSlug('Mewtwo-V-SWSH123'), 1);
  assert.equal(numberOfLabel('Serpifeu (BW 01)'), '1');
  assert.equal(numberOfLabel('BW 01'), '1');
  assert.equal(numberOfLabel('Alakazam (SK H1)'), 'H1');
  assert.equal(numberOfLabel('Glurak (Flash) (BW 50a)'), '50a');
  assert.equal(numberOfLabel('Ohne Nummer'), null);
});

test('parseCardmarketJson: Victory Cup V1/V2/V3 mit eigenen Nummern behalten die Basisnummer, Snivy-V2 bekommt Suffix', () => {
  const r = parseCardmarketJson(bwList([
    bw(279925, 1, 'Serpifeu (BW 01)'), bw(547296, 2, 'Serpifeu (BW 01)'),
    bw(279952, 1, 'Siegerpokal (BW 29)'), bw(279947, 2, 'Siegerpokal (BW 30)'), bw(279943, 3, 'Siegerpokal (BW 31)'),
    bw(279936, 1, 'Victini (BW 32)'), bw(398039, 2, 'Victini (BW 32)'),
  ], { total: 7 }));
  assert.equal(r.expansionId, 1611);
  assert.equal(r.name, 'BW Black Star Promos');
  assert.deepEqual(r.cards.map((c) => [c.productId, c.collectorNumber]), [
    [279925, '1'], [547296, '1V2'], [279952, '29'], [279947, '30'], [279943, '31'], [279936, '32'], [398039, '32V2'],
  ]);
});

test('parseCardmarketJson: mehrere Seiten zusammen; fehlende Seite -> Abbruch', () => {
  const p1 = bwList([bw(1, 1, 'BW 01'), bw(2, 1, 'BW 02')], { total: 3, page: 1 });
  const p2 = bwList([bw(3, 2, 'BW 01')], { total: 3, page: 2 });
  assert.deepEqual(parseCardmarketJson(p1, p2).cards.map((c) => c.collectorNumber), ['1', '1V2', '2']);
  assert.throws(() => parseCardmarketJson(p1), /unvollstaendig: 2 von 3/);
  assert.throws(() => parseCardmarketJson(p1, { ...p2, expansionId: 9 }), /verschiedene Expansionen/);
  assert.throws(() => parseCardmarketJson({ cards: [] }), /Expansion/);
});

test('runImport: JSON-Seiten einer Expansion werden gemeinsam gelesen und geschrieben', () => {
  const root = tmpRoot();
  const f1 = path.join(root, '1611-1.json');
  const f2 = path.join(root, '1611-2.json');
  fs.writeFileSync(f1, JSON.stringify(bwList([bw(1, 1, 'BW 01'), bw(2, 1, 'BW 02')], { total: 3 })));
  fs.writeFileSync(f2, JSON.stringify(bwList([bw(3, 2, 'BW 01')], { total: 3 })));
  assert.throws(() => runImport({ files: [f1], root }), /unvollstaendig/);
  const r = runImport({ files: [f1, f2], root });
  assert.equal(r.merged[0].added.length, 3);
  const out = JSON.parse(fs.readFileSync(path.join(root, 'sources/cardmarket/custom-sets/1611.json'), 'utf8'));
  assert.deepEqual(out.cards.map((c) => [c.productId, c.collectorNumber]), [[1, '1'], [3, '1V2'], [2, '2']]);
  assert.equal(out.name, 'BW Black Star Promos');
});

test('BROWSER_SNIPPET ist gueltiges JavaScript und nutzt copy()', () => {
  assert.doesNotThrow(() => new Function('copy', 'document', 'location', BROWSER_SNIPPET));
  assert.match(BROWSER_SNIPPET, /^copy\(JSON\.stringify\(/);
});
