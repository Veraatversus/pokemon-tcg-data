import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchSets } from '../match/match-sets.mjs';

const cards = (n) => Array.from({ length: n }, (_, i) => ({ id: `x-${i + 1}`, number: String(i + 1), name: `C${i + 1}` }));
const ptSet = (id, name, date, extra = {}) => ({ id, name, series: 'S', printedTotal: 10, total: 10, ptcgoCode: '', releaseDate: date, ...extra });
const tdSet = (id, nameEn, date, n = 10, extra = {}) => ({
  id, serieId: 's', serieName: { en: 'S', de: 'S' }, name: { en: nameEn, de: nameEn },
  abbreviationOfficial: null, cardCountOfficial: n, releaseDate: date, cardmarketId: null, tcgplayerId: null,
  cards: Array.from({ length: n }, (_, i) => ({ localId: String(i + 1), name: { en: `C${i + 1}` } })), ...extra,
});
const run = (ptSets, tcgdexSets, setMap = { pairs: [] }, counts = {}) => {
  const ptCardsBySet = new Map(ptSets.map((s) => [s.id, cards(counts[s.id] ?? 10)]));
  return matchSets({ ptSets, tcgdexSets, ptCardsBySet, setMap });
};

test('Reihenfolge der Methoden und Plausibilitaet', () => {
  const r = run(
    [
      ptSet('sv3pt5', 'A', '2023/09/22'),
      ptSet('swsh45sv', 'Shiny Vault', '2021/02/19'),
      ptSet('swsh45', 'Shining Fates', '2021/02/19'),
      ptSet('xy1', 'XY', '2014/02/05', { ptcgoCode: 'PHF' }),
      ptSet('foo1', 'Same Name', '2020/01/01'),
    ],
    [
      tdSet('sv03.5', 'Other', '2023-09-22'),
      tdSet('swsh4.5sv', 'SV', '2021-02-19'),
      tdSet('swsh4.5', 'SF', '2021-02-19'),
      tdSet('zzz', 'Phantom', '2014-02-10', 10, { abbreviationOfficial: 'phf' }),
      tdSet('bar', 'Same Name', '2020-02-20'),
    ],
  );
  const m = Object.fromEntries(r.pairs.map((p) => [p.pokemontcgId, p]));
  assert.equal(m.sv3pt5.tcgdexId, 'sv03.5');
  assert.equal(m.sv3pt5.method, 'normalizedId');
  assert.equal(m.swsh45sv.tcgdexId, 'swsh4.5sv');
  assert.equal(m.swsh45.tcgdexId, 'swsh4.5');
  assert.equal(m.xy1.method, 'codeAndDate');
  assert.equal(m.xy1.tcgdexId, 'zzz');
  assert.equal(m.xy1.overlap, 1);
  assert.equal(m.foo1, undefined);
  assert.ok(r.unmatchedPokemontcg.includes('foo1'));
  assert.ok(r.unmatchedTcgdex.includes('bar'));
});

test('nameAndDate innerhalb 31 Tagen', () => {
  const r = run([ptSet('a1', 'Hello World!', '2020/01/01')], [tdSet('b1', 'hello world', '2020-01-25')]);
  assert.equal(r.pairs[0].method, 'nameAndDate');
});

test('1:1 - zweiter Anspruch auf dasselbe TCGdex-Set landet in rejected', () => {
  const r = run(
    [ptSet('swsh45', 'A', '2021/02/19'), ptSet('swsh45sv', 'B', '2021/02/19')],
    [tdSet('swsh4.5', 'A', '2021-02-19')],
    { pairs: [{ pokemontcg: 'swsh45sv', tcgdex: 'swsh4.5', reason: 'x' }] },
  );
  assert.equal(r.pairs.length, 1);
  assert.equal(r.pairs[0].pokemontcgId, 'swsh45sv');
  assert.equal(r.pairs[0].method, 'mapping');
  assert.equal(r.rejected.length, 1);
  assert.equal(r.rejected[0].pokemontcgId, 'swsh45');
  assert.equal(r.rejected[0].tcgdexId, 'swsh4.5');
  assert.match(r.rejected[0].reason, /1:1/);
});

test('mapping schlaegt alles und braucht keine Plausibilitaet', () => {
  const r = run(
    [ptSet('mcd11', 'McD 2011', '2011/06/17')],
    [tdSet('2011bw', 'Whatever', '2011-06-17', 3)],
    { pairs: [{ pokemontcg: 'mcd11', tcgdex: '2011bw', reason: 'manual' }] },
  );
  assert.deepEqual(r.pairs.map((p) => [p.pokemontcgId, p.tcgdexId, p.method]), [['mcd11', '2011bw', 'mapping']]);
});

test('mapping auf unbekanntes TCGdex-Set -> rejected', () => {
  const r = run([ptSet('a', 'A', '2020/01/01')], [], { pairs: [{ pokemontcg: 'a', tcgdex: 'nope', reason: 'x' }] });
  assert.equal(r.pairs.length, 0);
  assert.equal(r.rejected.length, 1);
  assert.deepEqual(r.unmatchedPokemontcg, ['a']);
});

test('Plausibilitaet: overlap < 0.9 und Kartenzahl-Abweichung > 10 % -> rejected', () => {
  const td = tdSet('xy1', 'A', '2020-01-01', 20);
  td.cards = td.cards.map((c, i) => ({ ...c, localId: `z${i}` }));
  const r = run([ptSet('xy1', 'A', '2020/01/01')], [td]);
  assert.equal(r.pairs.length, 0);
  assert.equal(r.rejected[0].method, 'exactId');
  assert.deepEqual(r.unmatchedPokemontcg, ['xy1']);
  assert.deepEqual(r.unmatchedTcgdex, ['xy1']);
});

test('Plausibilitaet: Kartenzahl-Abweichung <= 10 % genuegt trotz overlap 0', () => {
  const td = tdSet('xy1', 'A', '2020-01-01', 10);
  td.cards = td.cards.map((c, i) => ({ ...c, localId: `z${i}` }));
  const r = run([ptSet('xy1', 'A', '2020/01/01')], [td]);
  assert.equal(r.pairs.length, 1);
  assert.equal(r.pairs[0].overlap, 0);
});

test('Gleichstand der Methode: hoeherer overlap gewinnt', () => {
  const a = tdSet('sv3.5', 'A', '2023-01-01', 10);
  const b = tdSet('sv35', 'B', '2023-01-01', 10);
  b.cards = b.cards.map((c, i) => (i < 5 ? { ...c, localId: `z${i}` } : c));
  const r = run([ptSet('sv35', 'A', '2023/01/01')], [a, b]);
  assert.equal(r.pairs[0].tcgdexId, 'sv35'); // exactId schlaegt normalizedId
  const r2 = run([ptSet('cel25', 'A', '2021/01/01')], [tdSet('cel25', 'A', '2021-01-01')]);
  assert.equal(r2.pairs[0].method, 'exactId');
});
