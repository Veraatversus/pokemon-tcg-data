import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCardmarketIssue } from '../report/cardmarket-issue.mjs';

const URL = (id) => `https://www.cardmarket.com/en/Pokemon/Products/Search?searchMode=v2&idCategory=51&idExpansion=${id}&sortBy=collectorsnumber_asc&perSite=100&site=1`;
const row = (cards, withId, expansionId = 7) => ({ expansionId, cards, missing: cards - withId, coverage: { cards, withId, bySource: {} }, searchUrl: expansionId ? URL(expansionId) : null });
const clean = () => ({
  report: {
    bySet: { old: row(100, 50), fresh: row(100, 95) },
    setsWithoutExpansion: [],
    customSets: { missingProducts: [] },
    overrides: { warnings: [], problems: [] },
  },
  meta: { consecutiveFailures: 0 },
  previousSetIds: ['old'],
});

test('sauber -> kein Issue (auch alte Sets mit niedriger Abdeckung)', () => {
  const r = evaluateCardmarketIssue(clean());
  assert.equal(r.open, false);
  assert.equal(r.title, 'Cardmarket-Zuordnung prüfen');
});

test('neues Set unter 80 % Abdeckung -> Issue mit Such-URL', () => {
  const input = clean();
  input.report.bySet.fresh = row(100, 79);
  const r = evaluateCardmarketIssue(input);
  assert.equal(r.open, true);
  assert.match(r.body, /fresh/);
  assert.match(r.body, /79 %/);
  assert.ok(r.body.includes(URL(7)));
});

test('neues Set ab 80 % Abdeckung -> kein Issue; Set ohne Karten zaehlt nicht', () => {
  const input = clean();
  input.report.bySet.fresh = row(100, 80);
  input.report.bySet.empty = row(0, 0);
  assert.equal(evaluateCardmarketIssue(input).open, false);
});

test('ohne previousSetIds (unbekannt) wird die Neu-Regel nicht angewandt', () => {
  const input = clean();
  input.previousSetIds = null;
  input.report.bySet.fresh = row(100, 10);
  assert.equal(evaluateCardmarketIssue(input).open, false);
});

test('ausgeschlossene Sets werden nie gemeldet', () => {
  const input = clean();
  input.report.bySet.pocket = row(100, 0);
  input.report.setsWithoutExpansion = [{ setId: 'pocket', cards: 100, evidence: '0/0', evidenceSource: null }];
  input.excludedSetIds = ['pocket'];
  assert.equal(evaluateCardmarketIssue(input).open, false);
});

test('neues Set ohne Expansion (mit Karten) -> Issue; bekanntes oder leeres Set nicht', () => {
  const input = clean();
  input.report.setsWithoutExpansion = [
    { setId: 'old', cards: 12, evidence: '0/12', evidenceSource: 'tcgdex' },
    { setId: 'leer', cards: 0, evidence: '0/0', evidenceSource: null },
  ];
  assert.equal(evaluateCardmarketIssue(input).open, false);
  input.report.setsWithoutExpansion.push({ setId: 'fresh', cards: 5, evidence: '0/5', evidenceSource: 'tcgdex' });
  const r = evaluateCardmarketIssue(input);
  assert.equal(r.open, true);
  assert.match(r.body, /Ohne Cardmarket-Erweiterung/);
  assert.match(r.body, /fresh/);
});

test('custom-set-Eintrag mit Produkt nicht im Katalog -> Issue', () => {
  const input = clean();
  input.report.customSets.missingProducts = [{ expansionId: 5241, productId: 99, collectorNumber: '12' }];
  const r = evaluateCardmarketIssue(input);
  assert.equal(r.open, true);
  assert.match(r.body, /5241/);
  assert.match(r.body, /99/);
});

test('Zuordnungsdatei-Eintrag mit Produkt/Erweiterung nicht im Katalog -> Issue; sonstige Warnungen nicht', () => {
  const input = clean();
  input.report.overrides = { warnings: ['s1/3: Karte nicht gefunden, ignoriert', 's1/9: Produkt 5 nicht im Cardmarket-Katalog, ignoriert'], problems: [] };
  assert.equal(evaluateCardmarketIssue(input).open, false); // Textwarnungen allein loesen nichts aus
  input.report.overrides.problems = [{ kind: 'missing-product', key: 's1/4', productId: 555 }];
  let r = evaluateCardmarketIssue(input);
  assert.equal(r.open, true);
  assert.match(r.body, /s1\/4: Produkt 555/);
  input.report.overrides.problems = [{ kind: 'missing-expansion', key: 's1', expansionId: 77 }];
  r = evaluateCardmarketIssue(input);
  assert.equal(r.open, true);
  assert.match(r.body, /s1: Erweiterung 77/);
});

const NOW = new Date('2026-11-13T12:00:00Z');

test('junges Set (Erscheinungsdatum <= 60 Tage) bleibt auch ohne "neu" im Issue; aelteres faellt heraus', () => {
  const input = { ...clean(), now: NOW, sets: [{ id: 'old', releaseDate: '1999/01/09' }, { id: 'fresh', releaseDate: '2026/09/20' }] };
  input.previousSetIds = ['old', 'fresh']; // fresh ist laengst veroeffentlicht
  input.report.bySet.fresh = row(100, 10);
  assert.equal(evaluateCardmarketIssue(input).open, true);
  input.sets[1].releaseDate = '2026/09/10'; // 64 Tage
  assert.equal(evaluateCardmarketIssue(input).open, false);
  input.sets[1].releaseDate = '2026/09/14'; // 60 Tage
  assert.equal(evaluateCardmarketIssue(input).open, true);
});

test('junges Set ohne Erweiterung bleibt im Issue', () => {
  const input = { ...clean(), now: NOW, sets: [{ id: 'fresh', releaseDate: '2026/11/01' }] };
  input.previousSetIds = ['old', 'fresh'];
  input.report.setsWithoutExpansion = [{ setId: 'fresh', cards: 5, evidence: '0/5', evidenceSource: 'tcgdex' }];
  assert.equal(evaluateCardmarketIssue(input).open, true);
});

test('leere vorherige sets.json = unbekannt: kein "neu"-Signal, Datumsregel gilt weiter', () => {
  const input = { ...clean(), now: NOW, sets: [{ id: 'old', releaseDate: '1999/01/09' }, { id: 'fresh', releaseDate: '2020/01/01' }] };
  input.previousSetIds = [];
  input.report.bySet.fresh = row(100, 10);
  assert.equal(evaluateCardmarketIssue(input).open, false);
  input.sets[1].releaseDate = '2026/11/10';
  assert.equal(evaluateCardmarketIssue(input).open, true);
});

test('3 Ausfaelle in Folge -> Issue, 2 nicht', () => {
  const input = clean();
  input.meta = { consecutiveFailures: 2 };
  assert.equal(evaluateCardmarketIssue(input).open, false);
  input.meta = { consecutiveFailures: 3, lastSuccess: '2026-11-10T00:00:00Z' };
  const r = evaluateCardmarketIssue(input);
  assert.equal(r.open, true);
  assert.match(r.body, /3 /);
  assert.match(r.body, /2026-11-10/);
});

test('mehrere Ausloeser stehen alle im Body', () => {
  const input = clean();
  input.report.bySet.fresh = row(10, 1);
  input.meta = { consecutiveFailures: 4 };
  const r = evaluateCardmarketIssue(input);
  assert.match(r.body, /fresh/);
  assert.match(r.body, /4 /);
});
