import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMatchingReport, renderMatchingMarkdown } from '../report/matching-report.mjs';

const ptSets = [
  { id: 'a1', name: 'Alpha' }, { id: 'b1', name: 'Beta' }, { id: 'z9', name: 'Lonely' },
];
const tcgdexSets = [
  { id: 'A1', name: { en: 'Alpha EN' }, cards: [{ localId: '1' }, { localId: '2' }, { localId: '3' }] },
  { id: 'B1', name: { en: 'Beta EN' }, cards: [{ localId: '1' }, { localId: '2' }] },
  { id: 'U1', name: { en: 'Unpaired' }, cards: [{ localId: '1' }, { localId: 'X' }, { localId: 'Y' }] },
];
const ptCardsBySet = new Map([
  ['a1', [1, 2, 3, 4]], ['b1', [1, 2]], ['z9', [1, 2, 3]],
]);
const setResult = () => ({
  pairs: [
    { pokemontcgId: 'b1', tcgdexId: 'B1', method: 'mapping', overlap: 0.5 },
    { pokemontcgId: 'a1', tcgdexId: 'A1', method: 'cardCount', overlap: 0.75 },
  ],
  rejected: [{ pokemontcgId: 'q', tcgdexId: 'Q', method: 'name', reason: 'nope' }],
  unmatchedPokemontcg: ['z9'],
  unmatchedTcgdex: ['U1'],
});
const cardResults = () => new Map([
  ['a1', {
    matched: [
      { ptId: 'a1-1', ptNumber: '1', tcgdex: [{ setId: 'A1', localId: '1' }], method: 'number', suspicious: false },
      { ptId: 'a1-2', ptNumber: '2', tcgdex: [{ setId: 'A1', localId: '2' }], method: 'number', suspicious: true },
      // Alias in ein anderes Set
      { ptId: 'a1-3', ptNumber: '3', tcgdex: [{ setId: 'B1', localId: '2' }], method: 'mapping', suspicious: false },
    ],
    primaryOnly: [{ ptId: 'a1-4', ptNumber: '4' }],
    tcgdexOnly: [{ setId: 'A1', localId: '3' }],
  }],
  ['b1', {
    matched: [{ ptId: 'b1-1', ptNumber: '1', tcgdex: [{ setId: 'B1', localId: '1' }], method: 'number', suspicious: false }],
    primaryOnly: [{ ptId: 'b1-2', ptNumber: '2' }],
    tcgdexOnly: [{ setId: 'B1', localId: '2' }], // wurde global von a1-3 gematcht
  }],
]);
const build = (over = {}) => buildMatchingReport({
  setResult: setResult(), cardResults: cardResults(), sources: { s: 1 },
  ptSets, tcgdexSets, ptCardsBySet, generatedAt: '2026-01-01T00:00:00.000Z', ...over,
});

test('Summen und Quote', () => {
  const r = build();
  assert.equal(r.generatedAt, '2026-01-01T00:00:00.000Z');
  assert.deepEqual(r.sources, { s: 1 });
  const s = r.summary;
  assert.equal(s.ptSets, 3);
  assert.equal(s.tcgdexSets, 3);
  assert.equal(s.pairedSets, 2);
  assert.equal(s.ptCards, 9);
  assert.equal(s.matchedCards, 4);
  assert.equal(s.cardMatchRatio, 0.4444);
  assert.equal(s.suspicious, 1);
  assert.equal(s.primaryOnly, 2);
  assert.equal(s.tcgdexOnlyInPairedSets, 1); // B1/2 durch globalen Abgleich entfernt
  assert.deepEqual(s.unpairedTcgdexSets, { sets: 1, cards: 3 });
  assert.deepEqual(r.unmatchedPokemontcg, ['z9']);
  assert.deepEqual(r.unmatchedTcgdex, ['U1']);
  assert.equal(r.rejected.length, 1);
  assert.deepEqual(r.doubleAssigned, []);
});

test('Paar-Zeilen sortiert, lowOverlap, Zaehler', () => {
  const r = build();
  assert.deepEqual(r.sets.map((s) => s.pokemontcgId), ['a1', 'b1']);
  const a = r.sets[0];
  assert.equal(a.lowOverlap, true);
  assert.equal(a.pokemontcgName, 'Alpha');
  assert.equal(a.tcgdexName, 'Alpha EN');
  assert.equal(a.matched, 3);
  assert.equal(a.total, 4);
  assert.deepEqual(a.suspicious, ['2']);
  assert.deepEqual(a.primaryOnly, ['4']);
  assert.deepEqual(a.tcgdexOnly, ['3']);
  assert.equal(r.sets[1].lowOverlap, false); // mapping
  assert.deepEqual(r.sets[1].tcgdexOnly, []);
});

test('globale Aliase: unpaired-Karten abgezogen', () => {
  const cr = cardResults();
  cr.get('a1').matched.push({ ptId: 'a1-5', ptNumber: '5', tcgdex: [{ setId: 'U1', localId: 'X' }], method: 'mapping', suspicious: false });
  const r = build({ cardResults: cr });
  assert.deepEqual(r.summary.unpairedTcgdexSets, { sets: 1, cards: 2 });
});

test('doppelt zugeordnete TCGdex-Karte', () => {
  const cr = cardResults();
  cr.get('b1').matched.push({ ptId: 'b1-9', ptNumber: '9', tcgdex: [{ setId: 'B1', localId: '2' }], method: 'mapping', suspicious: false });
  const r = build({ cardResults: cr });
  assert.deepEqual(r.doubleAssigned, [{ setId: 'B1', localId: '2', ptIds: ['a1-3', 'b1-9'] }]);
  assert.match(renderMatchingMarkdown(r), /Doppelt zugeordnet/);
});

test('Markdown und Determinismus', () => {
  const r = build({ warnings: ['Warnung eins'] });
  const md = renderMatchingMarkdown(r);
  assert.equal(md, renderMatchingMarkdown(build({ warnings: ['Warnung eins'] })));
  assert.ok(md.includes('| a1 | Alpha | A1 | Alpha EN | cardCount | 0.75 | 3/4 | 1 | 1 |'));
  assert.ok(md.includes('| b1 | Beta | B1 | Beta EN | mapping | 0.50 | 1/2 | 0 | 1 |'));
  assert.match(md, /Nicht zugeordnet/);
  assert.match(md, /Paare mit geringer Nummern-Ueberdeckung \(Sichtpruefung\)/);
  assert.match(md, /Warnung eins/);
  assert.match(md, /Verdaechtig: 2/);
  assert.equal(JSON.stringify(build()), JSON.stringify(build()));
});

test('Kompaktform kuerzt nach 20', () => {
  const nums = Array.from({ length: 25 }, (_, i) => String(i + 1));
  const cr = new Map([['a1', {
    matched: [], primaryOnly: nums.map((n) => ({ ptId: `a1-${n}`, ptNumber: n })), tcgdexOnly: [],
  }]]);
  const sr = { pairs: [{ pokemontcgId: 'a1', tcgdexId: 'A1', method: 'name', overlap: 1 }], rejected: [], unmatchedPokemontcg: [], unmatchedTcgdex: [] };
  const md = renderMatchingMarkdown(buildMatchingReport({ setResult: sr, cardResults: cr, sources: {}, ptSets, tcgdexSets: [], ptCardsBySet: new Map([['a1', nums]]), generatedAt: 'x' }));
  assert.match(md, /…\(\+5\)/);
});

test('Warnungen: Windows- und POSIX-Pfade werden zum gleichen relativen Pfad', () => {
  const rel = 'sources/tcgdex/data/Platinum/Supreme Victors/AR1.ts';
  const keptRel = 'sources/tcgdex/data/Platinum/Arceus/AR1.ts';
  const win = { file: String.raw`E:\Proggn\Repo\sources\tcgdex\data\Platinum\Supreme Victors\AR1.ts`, message: `doppelte Karte AR1; behalten wird ${String.raw`E:\Proggn\Repo\sources\tcgdex\data\Platinum\Arceus\AR1.ts`}` };
  const posix = { file: '/home/ci/repo/sources/tcgdex/data/Platinum/Supreme Victors/AR1.ts', message: 'doppelte Karte AR1; behalten wird /home/ci/repo/sources/tcgdex/data/Platinum/Arceus/AR1.ts' };
  const expected = `${rel}: doppelte Karte AR1; behalten wird ${keptRel}`;
  const r = build({ warnings: [win, posix] });
  assert.deepEqual(r.warnings, [expected, expected]);
  const md = renderMatchingMarkdown(r);
  assert.ok(md.includes(`- ${expected}`));
  assert.ok(!/[A-Za-z]:\|\/home\//.test(JSON.stringify(r) + md));
});

test('Ausgabe byte-identisch bei identischen Eingaben inkl. generatedAt', () => {
  const a = build({ warnings: [{ file: 'a', message: 'b' }] });
  const b = build({ warnings: [{ file: 'a', message: 'b' }] });
  assert.equal(JSON.stringify(a, null, 2), JSON.stringify(b, null, 2));
  assert.equal(renderMatchingMarkdown(a), renderMatchingMarkdown(b));
});

test('doppelte Zuordnung innerhalb eines Paars', () => {
  const cr = cardResults();
  cr.get('a1').matched.push({ ptId: 'a1-7', ptNumber: '7', tcgdex: [{ setId: 'A1', localId: '1' }], method: 'mapping', suspicious: false });
  const r = build({ cardResults: cr });
  assert.deepEqual(r.doubleAssigned, [{ setId: 'A1', localId: '1', ptIds: ['a1-1', 'a1-7'] }]);
});
