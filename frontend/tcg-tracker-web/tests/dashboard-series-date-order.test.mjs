import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k)
};
const { orderSeriesGroupsByDate } = await import('../js/views/dashboard-grid.js');
const { resolveSetReleaseTime, setV3SetMeta } = await import('../js/data/schema-contract.js');
const { fetchV3SetMeta } = await import('../js/data/pokemon-api.js');

const time = (s) => resolveSetReleaseTime(s);
const group = (key, ...sets) => ({ key, label: key, sets });
const ids = (g) => g.sets.map((s) => s.setId);

test('Sets einer Serie: neuestes zuerst', () => {
  setV3SetMeta(new Map());
  const out = orderSeriesGroupsByDate(new Map([['a', group('a',
    { setId: 'x1', releaseDate: '2020/01/01' }, { setId: 'x3', releaseDate: '2022/01/01' }, { setId: 'x2', releaseDate: '2021/01/01' })]]), time);
  assert.deepEqual(ids([...out.values()][0]), ['x3', 'x2', 'x1']);
});

test('Serien: Serie mit neuestem Set zuerst', () => {
  setV3SetMeta(new Map());
  const out = orderSeriesGroupsByDate(new Map([
    ['old', group('old', { setId: 'o1', releaseDate: '2019/01/01' })],
    ['new', group('new', { setId: 'n1', releaseDate: '2018/01/01' }, { setId: 'n2', releaseDate: '2024/01/01' })]
  ]), time);
  assert.deepEqual([...out.keys()], ['new', 'old']);
});

test('fehlendes Datum: zuletzt; gleiches Datum: nach setId', () => {
  setV3SetMeta(new Map());
  const out = orderSeriesGroupsByDate(new Map([['a', group('a',
    { setId: 'z0' }, { setId: 'b', releaseDate: '2020/01/01' }, { setId: 'a', releaseDate: '2020/01/01' }, { setId: 'c', releaseDate: '2021/01/01' })]]), time);
  assert.deepEqual(ids([...out.values()][0]), ['c', 'a', 'b', 'z0']);
});

test('Serie ohne jedes Datum: zuletzt', () => {
  setV3SetMeta(new Map());
  const out = orderSeriesGroupsByDate(new Map([
    ['none', group('none', { setId: 'q' })],
    ['dated', group('dated', { setId: 'd', releaseDate: '2000/01/01' })]
  ]), time);
  assert.deepEqual([...out.keys()], ['dated', 'none']);
});

test('v3-Datum gewinnt vor veraltetem Sheet-Datum; Sheet-Datum als Rueckfall', () => {
  setV3SetMeta(new Map([['k', { releaseDate: '2025/05/05' }]]));
  assert.equal(time({ setId: 'k', vera_releaseDate: '2001-01-01' }), Date.parse('2025-05-05'));
  assert.equal(time({ setId: 'u', vera_releaseDate: '2001-01-01' }), Date.parse('2001-01-01'));
  assert.equal(time({ setId: 'u', tcgdex_releaseDate: '2002-02-02' }), Date.parse('2002-02-02'));
  assert.equal(time({ setId: 'u' }), null);
  setV3SetMeta(new Map());
});

test('fetchV3SetMeta liefert releaseDate', async () => {
  const m = await fetchV3SetMeta({ loadSets: async () => [{ id: 's', series: 'S', releaseDate: '2023/03/03' }] });
  assert.equal(m.get('s').releaseDate, '2023/03/03');
});

test('fetchV3SetMeta nimmt auch Sets nur mit releaseDate auf', async () => {
  const m = await fetchV3SetMeta({ loadSets: async () => [{ id: 'r', releaseDate: '2021/01/02' }] });
  assert.equal(m.get('r')?.releaseDate, '2021/01/02');
  setV3SetMeta(m);
  assert.equal(resolveSetReleaseTime({ setId: 'r' }), Date.parse('2021-01-02'));
  setV3SetMeta(new Map());
});
