import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchCards } from '../match/match-cards.mjs';

const pt = (number, name = `N${number}`, id = `x-${number}`) => ({ id, number, name });
const td = (localId, name = `N${localId}`) => ({ localId, name: { en: name } });
const set = (id, cards) => ({ id, cards });
const run = (ptCards, tcgdexSet, cardMap, others = []) => {
  const tcgdexSetsById = new Map([tcgdexSet, ...others].filter(Boolean).map((s) => [s.id, s]));
  return matchCards({ ptCards, tcgdexSet, tcgdexSetsById, cardMap });
};

test('Nummer mit Nullen/Praefix/Gross-Klein', () => {
  const r = run(
    [pt('6', 'A'), pt('H1', 'B'), pt('TG01', 'C'), pt('SV1', 'D')],
    set('s', [td('006', 'A'), td('H01', 'B'), td('tg01', 'C'), td('SV001', 'D')]),
  );
  assert.equal(r.matched.length, 4);
  assert.ok(r.matched.every((m) => m.method === 'number' && !m.suspicious));
  assert.deepEqual(r.matched.map((m) => m.tcgdex[0].localId), ['006', 'H01', 'tg01', 'SV001']);
  assert.deepEqual(r.matched[0].tcgdex[0], { setId: 's', localId: '006' });
  assert.equal(r.primaryOnly.length, 0);
  assert.equal(r.tcgdexOnly.length, 0);
});

test('Variantengruppe', () => {
  const r = run([pt('50', 'Foo')], set('s', [td('50a', 'Foo'), td('50b', 'Foo')]));
  assert.equal(r.matched.length, 1);
  assert.equal(r.matched[0].method, 'variantGroup');
  assert.deepEqual(r.matched[0].tcgdex.map((t) => t.localId), ['50a', '50b']);
  assert.equal(r.matched[0].suspicious, false);
});

test('exakter Treffer hat Vorrang vor Variantengruppe, pt-only 101a wird nicht verschluckt', () => {
  const r = run(
    [pt('50'), pt('101'), pt('101a')],
    set('s', [td('50'), td('50a'), td('101')]),
  );
  assert.deepEqual(r.matched.map((m) => [m.ptNumber, m.method]), [['50', 'number'], ['101', 'number']]);
  assert.deepEqual(r.primaryOnly, [{ ptId: 'x-101a', ptNumber: '101a' }]);
  assert.deepEqual(r.tcgdexOnly, [{ setId: 's', localId: '50a' }]);
});

test('set-uebergreifendes Alias', () => {
  const r = run(
    [pt('A', 'Unown'), pt('B', 'Unown')],
    set('ex10', [td('1', 'Other')]),
    { aliases: { A: { set: 'exu', localId: 'A' }, B: { set: 'exu', localId: 'B' } } },
    [set('exu', [td('A', 'Unown'), td('B', 'Unown')])],
  );
  assert.equal(r.matched.length, 2);
  assert.deepEqual(r.matched[0].tcgdex, [{ setId: 'exu', localId: 'A' }]);
  assert.equal(r.matched[0].method, 'mapping');
  assert.deepEqual(r.tcgdexOnly, [{ setId: 'ex10', localId: '1' }]);
});

test('Alias ohne set nutzt das gepaarte Set', () => {
  const r = run([pt('9', 'Foo')], set('s', [td('X9', 'Foo')]), { aliases: { 9: { localId: 'X9' } } });
  assert.equal(r.matched[0].method, 'mapping');
  assert.equal(r.matched[0].tcgdex[0].localId, 'X9');
});

test('doppelte pt-Nummern bleiben einzeln (cel25c)', () => {
  const names = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot'];
  const ptCards = [
    pt('15', 'Delta', 'cel25c-15_A1'), pt('15', 'Alpha', 'cel25c-15_A2'),
    pt('15', 'Charlie', 'cel25c-15_A3'), pt('15', 'Bravo', 'cel25c-15_A4'),
    pt('20', 'Foxtrot', 'cel25c-20'),
  ];
  const tdCards = names.map((n, i) => td(`CC${String(i + 1).padStart(3, '0')}`, n));
  const r = run(ptCards, set('cel25cc', tdCards), { byNamePosition: true });
  assert.equal(r.matched.filter((m) => m.ptNumber === '15').length, 4);
  assert.equal(new Set(r.matched.map((m) => m.tcgdex[0].localId)).size, r.matched.length);
  assert.ok(r.matched.every((m) => m.method === 'namePosition' && !m.suspicious));
  assert.equal(r.matched[0].tcgdex[0].localId, 'CC004');
  assert.deepEqual(r.tcgdexOnly.map((t) => t.localId), ['CC005']);
});

test('byNamePosition faellt auf Position zurueck (suspicious)', () => {
  const r = run([pt('1', 'Zed')], set('s', [td('CC001', 'Quux')]), { byNamePosition: true });
  assert.equal(r.matched[0].method, 'namePosition');
  assert.equal(r.matched[0].suspicious, true);
});

test('Namensabweichung -> suspicious', () => {
  const r = run([pt('1', 'Pikachu'), pt('2', 'Raichu')], set('s', [td('1', 'Pikachu'), td('2', 'Mewtwo')]));
  assert.deepEqual(r.matched.map((m) => m.suspicious), [false, true]);
});

test('fehlende/leere Namen sind nie aehnlich', () => {
  const r = run(
    [pt('1', ''), pt('2', 'Foo'), pt('3', undefined)],
    set('s', [td('1', 'Bar'), { localId: '2', name: {} }, { localId: '3' }]),
  );
  assert.deepEqual(r.matched.map((m) => m.suspicious), [true, true, true]);
});

test('fehlender Name wird bei byNamePosition nie als Namenstreffer gewertet', () => {
  const r = run([pt('1', '')], set('s', [td('CC001', ''), td('CC002', 'Foo')]), { byNamePosition: true });
  assert.equal(r.matched[0].tcgdex[0].localId, 'CC001'); // Position, nicht Name
  assert.equal(r.matched[0].suspicious, true);
});

test('pokemontcg-only (101a) und TCGdex-only bleiben getrennt gelistet', () => {
  const r = run([pt('1'), pt('101a')], set('s', [td('1'), td('99'), td('2')]));
  assert.deepEqual(r.primaryOnly, [{ ptId: 'x-101a', ptNumber: '101a' }]);
  assert.deepEqual(r.tcgdexOnly, [{ setId: 's', localId: '2' }, { setId: 's', localId: '99' }]);
});

test('tcgdexSet null -> alles primaryOnly', () => {
  const r = run([pt('1'), pt('2')], null);
  assert.deepEqual(r.matched, []);
  assert.equal(r.primaryOnly.length, 2);
  assert.deepEqual(r.tcgdexOnly, []);
});

test('jede TCGdex-Karte hoechstens einmal', () => {
  const r = run([pt('1'), pt('01')], set('s', [td('1')]));
  assert.equal(r.matched.length, 1);
  assert.equal(r.primaryOnly.length, 1);
});

test('unaufgeloeste Aliase werden gemeldet', () => {
  const r = run(
    [pt('1', 'A'), pt('2', 'B'), pt('3', 'C')],
    set('s', [td('1', 'A'), td('2', 'B'), td('9', 'Z')]),
    { aliases: {
      2: { localId: '77' }, // Karte fehlt
      3: { set: 'nix', localId: '1' }, // Set fehlt
    } },
  );
  assert.deepEqual(r.unresolvedAliases, [
    { ptNumber: '2', target: { setId: 's', localId: '77' }, reason: 'Ziel-Karte nicht gefunden' },
    { ptNumber: '3', target: { setId: 'nix', localId: '1' }, reason: 'Ziel-Set nicht gefunden' },
  ]);
});

test('Alias auf bereits vergebene Karte ist unaufgeloest', () => {
  const r = run(
    [pt('1', 'A'), pt('2', 'B')],
    set('s', [td('1', 'A'), td('2', 'B')]),
    { aliases: { 1: { localId: '1' }, 2: { localId: '1' } } },
  );
  assert.deepEqual(r.unresolvedAliases, [
    { ptNumber: '2', target: { setId: 's', localId: '1' }, reason: 'Ziel-Karte bereits vergeben' },
  ]);
  assert.deepEqual(run([pt('1')], set('s', [td('1')])).unresolvedAliases, []);
});
