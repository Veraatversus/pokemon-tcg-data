import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildRegistry, assertFrozen, resolveCollectionKey, findAmbiguousKey, RegistryFrozenError,
  RegistryInvariantError, registryViolations, registryChanges,
} from '../registry/build-registry.mjs';
import { readRegistry, writeRegistry } from '../registry/registry-io.mjs';

// --- synthetische Quellen -------------------------------------------------------------
const pt = (setId, number, id = `${setId}-${number}`) => ({ id, number, name: `${setId} ${number}` });
const ptSet = (id, extra = {}) => ({ id, name: id, ...extra });
const td = (id, localIds) => ({ id, name: { en: id }, cards: localIds.map((localId) => ({ localId, name: { en: localId } })) });
const ref = (setId, localId) => ({ setId, localId });
const m = (card, refs) => ({ ptId: card.id, ptNumber: card.number, tcgdex: refs, method: 'number', suspicious: false });
const po = (card) => ({ ptId: card.id, ptNumber: card.number });
const result = ({ matched = [], primaryOnly = [], tcgdexOnly = [] }) => ({ matched, primaryOnly, tcgdexOnly, unresolvedAliases: [] });

function fixture() {
  const c = {
    s1: pt('swsh12pt5', '1'), s2: pt('swsh12pt5', '2'),
    gg1: pt('swsh12pt5gg', 'GG01'), gg2: pt('swsh12pt5gg', 'GG02'),
    cel: [1, 2, 3, 4].map((i) => pt('cel25c', '15', `cel25c-15_A${i}`)), cel2: pt('cel25c', '2', 'cel25c-2_A'),
    x: pt('me55c', '4'), y: pt('me55c', '58'),
    m106: pt('me55c', '106'), m106p: pt('me55c', '106', 'me55c-106p'), m106m: pt('me55c', '106', 'me55c-106m'),
    z60: pt('zsv10pt5', '60'), z80: pt('zsv10pt5', '60', 'zsv10pt5-80'),
    svp1: pt('svp', '1'), me5: pt('me5', '1'),
    ex1: pt('ex10', '1'), exA: pt('ex10', 'A'),
  };
  const ptSets = ['swsh12pt5', 'swsh12pt5gg', 'cel25c', 'me55c', 'zsv10pt5', 'svp', 'me5', 'ex10'].map((id) => ptSet(id));
  ptSets.push(ptSet('mep', { synthesized: true }));
  const mep1 = pt('mep', '1');
  const ptCardsBySet = new Map([
    ['swsh12pt5', [c.s1, c.s2]], ['swsh12pt5gg', [c.gg1, c.gg2]], ['cel25c', [...c.cel, c.cel2]],
    ['me55c', [c.x, c.y, c.m106, c.m106p, c.m106m]], ['zsv10pt5', [c.z60, c.z80]], ['svp', [c.svp1]],
    ['me5', [c.me5]], ['ex10', [c.ex1, c.exA]], ['mep', [mep1]],
  ]);
  const tcgdexSets = [
    td('swsh12.5', ['001', '002', 'GG01']), td('swsh12.5gg', ['GG01', 'GG02']),
    td('cel25cc', ['CC001', 'CC002', 'CC003', 'CC004', 'CC005']),
    td('30th-c', ['001', '002', '003', '004', '005', '014']),
    td('sv10.5b', ['060', '080']), td('svp', ['001', '166']), td('me05', ['001']),
    td('ex10', ['001']), td('exu', ['A']), td('A4', ['001', '002']), td('mep', ['001', '034']),
  ];
  const setPairs = [
    ['swsh12pt5', 'swsh12.5'], ['swsh12pt5gg', 'swsh12.5gg'], ['cel25c', 'cel25cc'], ['me55c', '30th-c'],
    ['zsv10pt5', 'sv10.5b'], ['svp', 'svp'], ['me5', 'me05'], ['ex10', 'ex10'], ['mep', 'mep'],
  ].map(([pokemontcgId, tcgdexId]) => ({ pokemontcgId, tcgdexId, method: 'mapping', overlap: 1 }));
  const cardResults = new Map([
    ['swsh12pt5', result({ matched: [m(c.s1, [ref('swsh12.5', '001')]), m(c.s2, [ref('swsh12.5', '002')])], tcgdexOnly: [ref('swsh12.5', 'GG01')] })],
    ['swsh12pt5gg', result({ matched: [m(c.gg1, [ref('swsh12.5gg', 'GG01')]), m(c.gg2, [ref('swsh12.5gg', 'GG02')])] })],
    ['cel25c', result({ matched: [...c.cel, c.cel2].map((card, i) => m(card, [ref('cel25cc', `CC00${i + 1}`)])) })],
    // X = pt 4 -> TCGdex 014, Y = pt 58 -> TCGdex 004 (me55c-Muster)
    ['me55c', result({ matched: [
      m(c.x, [ref('30th-c', '014')]), m(c.y, [ref('30th-c', '004')]),
      m(c.m106, [ref('30th-c', '001')]), m(c.m106p, [ref('30th-c', '002')]), m(c.m106m, [ref('30th-c', '003')]),
    ], tcgdexOnly: [ref('30th-c', '005')] })],
    ['zsv10pt5', result({ matched: [m(c.z60, [ref('sv10.5b', '060')])], primaryOnly: [po(c.z80)], tcgdexOnly: [ref('sv10.5b', '080')] })],
    ['svp', result({ matched: [m(c.svp1, [ref('svp', '001')])], tcgdexOnly: [ref('svp', '166')] })],
    ['me5', result({ matched: [m(c.me5, [ref('me05', '001')])] })],
    ['ex10', result({ matched: [m(c.ex1, [ref('ex10', '001')]), m(c.exA, [ref('exu', 'A')])] })],
    ['mep', result({ matched: [m(mep1, [ref('mep', '001')])], tcgdexOnly: [ref('mep', '034')] })],
  ]);
  return {
    ptSets, ptCardsBySet, tcgdexSets, setPairs, cardResults,
    subsetMerge: { merges: [{ main: 'swsh12pt5', subset: 'swsh12pt5gg', reason: 't' }] },
    canonicalKeyOverrides: { 'zsv10pt5-80': { key: '80', reason: 't' } },
    previous: null,
  };
}
const build = (over = {}) => buildRegistry({ ...fixture(), ...over });

// --- Sets -----------------------------------------------------------------------------
test('kanonische Set-IDs: pt-ID bei Paar, sonst TCGDEX-<id>; Aliase sortiert ohne eigene ID', () => {
  const r = build();
  assert.deepEqual(r.sets.me5, { pokemontcg: 'me5', tcgdex: 'me05', mergedSubsets: [], aliases: ['TCGDEX-me05'] });
  assert.deepEqual(r.sets.mep, { pokemontcg: 'mep', tcgdex: 'mep', mergedSubsets: [], aliases: ['TCGDEX-mep'] });
  assert.deepEqual(r.sets['TCGDEX-A4'], { pokemontcg: null, tcgdex: 'A4', mergedSubsets: [], aliases: [] });
  assert.deepEqual(Object.keys(r.cards['TCGDEX-A4']).sort(), ['1', '2']);
  assert.deepEqual(r.cards['TCGDEX-A4']['1'], {
    pokemontcg: null, tcgdex: [{ set: 'A4', localId: '001' }], keys: { pokemontcg: ['1'], tcgdex: ['1'] },
  });
});

test('Unterset-Merge: swsh12pt5gg/GG01 -> swsh12pt5/GG1, Alias-Sets, eine Karte mit TCGdex-Union-Gegenstueck', () => {
  const r = build();
  assert.equal(r.sets.swsh12pt5gg, undefined);
  assert.equal(r.cards.swsh12pt5gg, undefined);
  assert.deepEqual(r.sets.swsh12pt5, {
    pokemontcg: 'swsh12pt5', tcgdex: 'swsh12.5', mergedSubsets: ['swsh12pt5gg'],
    aliases: ['TCGDEX-swsh12.5', 'TCGDEX-swsh12.5gg', 'swsh12pt5gg'],
  });
  assert.deepEqual(Object.keys(r.cards.swsh12pt5).sort(), ['1', '2', 'GG1', 'GG2']);
  const gg1 = r.cards.swsh12pt5.GG1;
  assert.equal(gg1.pokemontcg, 'swsh12pt5gg-GG01');
  assert.deepEqual(gg1.tcgdex, [{ set: 'swsh12.5gg', localId: 'GG01' }, { set: 'swsh12.5', localId: 'GG01' }]);
  assert.deepEqual(gg1.keys, { pokemontcg: ['GG1'], tcgdex: ['GG1'] });
});

test('unverbundenes TCGdex-Set, dessen Karten alle schon referenziert sind (exu), wird Alias statt Doppelset', () => {
  const r = build();
  assert.equal(r.sets['TCGDEX-exu'], undefined);
  assert.deepEqual(r.sets.ex10.aliases, ['TCGDEX-ex10', 'TCGDEX-exu']);
  assert.deepEqual(resolveCollectionKey(r, 'TCGDEX-exu', 'A'), { setId: 'ex10', cardId: 'A' });
  assert.equal(resolveCollectionKey(r, 'TCGDEX-exu', '1'), null);
});

// --- Kartenschluessel -----------------------------------------------------------------
test('Kollision 15 x4 -> 15_A1..15_A4 mit ambiguousLegacyKey, Schluessel 15 nirgends in keys', () => {
  const r = build();
  const cel = r.cards.cel25c;
  assert.deepEqual(Object.keys(cel).sort(), ['15_A1', '15_A2', '15_A3', '15_A4', '2']);
  for (const i of [1, 2, 3, 4]) {
    assert.equal(cel[`15_A${i}`].ambiguousLegacyKey, '15');
    assert.equal(cel[`15_A${i}`].pokemontcg, `cel25c-15_A${i}`);
    assert.deepEqual(cel[`15_A${i}`].keys.pokemontcg, []);
    assert.deepEqual(cel[`15_A${i}`].keys.tcgdex, [`CC${i}`]);
  }
  assert.equal(cel['2'].ambiguousLegacyKey, undefined);
  assert.equal(resolveCollectionKey(r, 'cel25c', '15'), null);
  assert.deepEqual(findAmbiguousKey(r, 'cel25c', '15'), {
    setId: 'cel25c', legacyKey: '15', cardIds: ['15_A1', '15_A2', '15_A3', '15_A4'],
  });
  assert.deepEqual(resolveCollectionKey(r, 'cel25c', '15_A2'), { setId: 'cel25c', cardId: '15_A2' });
});

test('me55c-106/106p/106m -> 106_<localId>, 106p, 106m', () => {
  const r = build();
  const me = r.cards.me55c;
  assert.ok(me['106_1'] && me['106p'] && me['106m']);
  assert.equal(me['106_1'].pokemontcg, 'me55c-106');
  assert.equal(me['106p'].pokemontcg, 'me55c-106p');
  for (const k of ['106_1', '106p', '106m']) {
    assert.equal(me[k].ambiguousLegacyKey, '106');
    assert.deepEqual(me[k].keys.pokemontcg, []);
  }
  assert.equal(me['106'], undefined);
});

test('Override zsv10pt5-80 -> 80 (vereint mit TCGdex 080), zsv10pt5-60 bleibt 60 ohne ambiguousLegacyKey', () => {
  const r = build();
  const z = r.cards.zsv10pt5;
  assert.deepEqual(Object.keys(z).sort(), ['60', '80']);
  assert.deepEqual(z['80'], {
    pokemontcg: 'zsv10pt5-80', tcgdex: [{ set: 'sv10.5b', localId: '080' }], keys: { pokemontcg: [], tcgdex: ['80'] },
  });
  assert.deepEqual(z['60'], {
    pokemontcg: 'zsv10pt5-60', tcgdex: [{ set: 'sv10.5b', localId: '060' }], keys: { pokemontcg: ['60'], tcgdex: ['60'] },
  });
  assert.deepEqual(resolveCollectionKey(r, 'zsv10pt5', '80'), { setId: 'zsv10pt5', cardId: '80' });
  assert.deepEqual(resolveCollectionKey(r, 'zsv10pt5', '060'), { setId: 'zsv10pt5', cardId: '60' });
});

test('TCGdex-Union-Karte im gepaarten Set (svp/166) ueber pt-Set-Schluessel aufloesbar', () => {
  const r = build();
  assert.deepEqual(r.cards.svp['166'].keys, { pokemontcg: ['166'], tcgdex: ['166'] });
  assert.deepEqual(resolveCollectionKey(r, 'svp', '166'), { setId: 'svp', cardId: '166' });
  assert.deepEqual(resolveCollectionKey(r, 'TCGDEX-svp', '166'), { setId: 'svp', cardId: '166' });
  assert.deepEqual(resolveCollectionKey(r, 'mep', '34'), { setId: 'mep', cardId: '34' });
});

test('Variantengruppe (ecard2 50 -> 50a/50b): TCGdex-Varianten-Schluessel auch unter pt-Set-Schluessel', () => {
  const f = fixture();
  const c50 = pt('ecard2', '50');
  const c51 = pt('ecard2', '51');
  f.ptSets.push(ptSet('ecard2'));
  f.ptCardsBySet.set('ecard2', [c50, c51]);
  f.tcgdexSets.push(td('ecard2', ['50a', '50b', '51']));
  f.setPairs.push({ pokemontcgId: 'ecard2', tcgdexId: 'ecard2', method: 'exactId', overlap: 1 });
  f.cardResults.set('ecard2', result({ matched: [
    { ...m(c50, [ref('ecard2', '50a'), ref('ecard2', '50b')]), method: 'variantGroup' }, m(c51, [ref('ecard2', '51')]),
  ] }));
  const r = buildRegistry(f);
  assert.deepEqual(Object.keys(r.cards.ecard2).sort(), ['50', '51']);
  assert.deepEqual(r.cards.ecard2['50'].keys, { pokemontcg: ['50', '50a', '50b'], tcgdex: ['50a', '50b'] });
  assert.deepEqual(r.cards.ecard2['51'].keys, { pokemontcg: ['51'], tcgdex: ['51'] });
  for (const k of ['50', '50a', '50B']) assert.deepEqual(resolveCollectionKey(r, 'ecard2', k), { setId: 'ecard2', cardId: '50' });
});

// --- Aufloesung -----------------------------------------------------------------------
test('resolveCollectionKey: Set-Aliase case-insensitive, fuehrende Nullen', () => {
  const r = build();
  assert.deepEqual(resolveCollectionKey(r, 'TCGDEX-me05', '001'), { setId: 'me5', cardId: '1' });
  assert.deepEqual(resolveCollectionKey(r, 'tcgdex-ME05', '1'), { setId: 'me5', cardId: '1' });
  assert.deepEqual(resolveCollectionKey(r, ' me5 ', '1'), { setId: 'me5', cardId: '1' });
  assert.deepEqual(resolveCollectionKey(r, 'TCGDEX-mep', '1'), { setId: 'mep', cardId: '1' });
  assert.deepEqual(resolveCollectionKey(r, 'TCGDEX-A4', '002'), { setId: 'TCGDEX-A4', cardId: '2' });
  assert.equal(resolveCollectionKey(r, 'unbekannt', '1'), null);
  assert.equal(resolveCollectionKey(r, 'me5', '999'), null);
});

test('resolveCollectionKey: Unterset-Alias loest nur Karten des Untersets auf', () => {
  const r = build();
  assert.deepEqual(resolveCollectionKey(r, 'swsh12pt5gg', 'GG1'), { setId: 'swsh12pt5', cardId: 'GG1' });
  assert.deepEqual(resolveCollectionKey(r, 'swsh12pt5gg', 'GG01'), { setId: 'swsh12pt5', cardId: 'GG1' });
  assert.deepEqual(resolveCollectionKey(r, 'swsh12pt5', 'GG1'), { setId: 'swsh12pt5', cardId: 'GG1' });
  assert.deepEqual(resolveCollectionKey(r, 'TCGDEX-swsh12.5gg', 'GG02'), { setId: 'swsh12pt5', cardId: 'GG2' });
  assert.equal(resolveCollectionKey(r, 'swsh12pt5gg', '1'), null);
  assert.equal(resolveCollectionKey(r, 'TCGDEX-swsh12.5gg', '1'), null);
});

test('Namensraum nach Set-Schluessel: me55c/4 -> X, TCGDEX-30th-c/4 -> Y', () => {
  const r = build();
  assert.deepEqual(resolveCollectionKey(r, 'me55c', '4'), { setId: 'me55c', cardId: '4' });
  assert.equal(r.cards.me55c['4'].pokemontcg, 'me55c-4');
  const y = resolveCollectionKey(r, 'TCGDEX-30th-c', '4');
  assert.deepEqual(y, { setId: 'me55c', cardId: '58' });
  assert.equal(r.cards.me55c['58'].pokemontcg, 'me55c-58');
  assert.deepEqual(resolveCollectionKey(r, 'TCGDEX-30th-c', '014'), { setId: 'me55c', cardId: '4' });
  assert.equal(resolveCollectionKey(r, 'me55c', '14'), null);
  assert.deepEqual(resolveCollectionKey(r, 'TCGDEX-30th-c', '1'), { setId: 'me55c', cardId: '106_1' });
  assert.equal(resolveCollectionKey(r, 'me55c', '106'), null);
  assert.deepEqual(findAmbiguousKey(r, 'me55c', '106').cardIds, ['106_1', '106m', '106p']);
  assert.equal(findAmbiguousKey(r, 'TCGDEX-30th-c', '1'), null);
});

// --- Einfrieren -----------------------------------------------------------------------
test('previous mit abweichendem Schluessel bleibt erhalten, neue Eintraege werden ergaenzt', () => {
  const first = build();
  const previous = structuredClone(first);
  // Frueher anders vergeben: me5-1 lief unter "001"
  previous.cards.me5 = { '001': { ...previous.cards.me5['1'] } };
  delete previous.sets['TCGDEX-A4'];
  delete previous.cards['TCGDEX-A4'];
  const next = build({ previous });
  assert.deepEqual(Object.keys(next.cards.me5), ['001']);
  assert.deepEqual(next.cards.me5['001'], previous.cards.me5['001']);
  assert.ok(next.sets['TCGDEX-A4']);
  assert.doesNotThrow(() => assertFrozen(previous, next));
  assert.deepEqual(resolveCollectionKey(next, 'TCGDEX-me05', '1'), { setId: 'me5', cardId: '001' });
});

test('Build ohne pokemontcg-Daten mit previous reproduziert dieselben kanonischen IDs', () => {
  const full = build();
  const { tcgdexSets, subsetMerge, canonicalKeyOverrides } = fixture();
  const tdOnly = buildRegistry({
    ptSets: [], ptCardsBySet: new Map(), tcgdexSets, setPairs: [], cardResults: new Map(),
    subsetMerge, canonicalKeyOverrides, previous: structuredClone(full),
  });
  assert.deepEqual(tdOnly, full);
});

test('TCGdex aendert localId einer eingefrorenen Karte -> RegistryFrozenError statt stiller Umschluesselung', () => {
  const previous = build();
  const f = fixture();
  f.tcgdexSets = f.tcgdexSets.map((s) => (s.id === 'me05' ? td('me05', ['001a']) : s));
  f.cardResults.set('me5', result({ matched: [m(pt('me5', '1'), [ref('me05', '001a')])] }));
  assert.throws(() => buildRegistry({ ...f, previous }), (err) => {
    assert.ok(err instanceof RegistryFrozenError);
    assert.ok(err.changes.some((c) => c.includes('me5') && c.includes('001')));
    return true;
  });
});

test('assertFrozen wirft bei geaendertem und entferntem Eintrag, nicht bei neuem', () => {
  const prev = build();
  const added = structuredClone(prev);
  added.cards.me5['2'] = { pokemontcg: null, tcgdex: [], keys: { pokemontcg: ['2'], tcgdex: [] } };
  added.sets.neu = { pokemontcg: 'neu', tcgdex: null, mergedSubsets: [], aliases: [] };
  assert.doesNotThrow(() => assertFrozen(prev, added));

  const changed = structuredClone(prev);
  changed.cards.me5['1'].keys.tcgdex = ['01'];
  assert.throws(() => assertFrozen(prev, changed), (e) => e instanceof RegistryFrozenError && e.changes.length === 1);

  const removed = structuredClone(prev);
  delete removed.cards.svp['166'];
  delete removed.sets.me5;
  assert.throws(() => assertFrozen(prev, removed), (e) => e instanceof RegistryFrozenError && e.changes.length === 2);
});

// --- IO -------------------------------------------------------------------------------
test('writeRegistry deterministisch, readRegistry liest zurueck', () => {
  const r = build();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-'));
  try {
    const a = path.join(tmp, 'a');
    const b = path.join(tmp, 'b');
    assert.equal(readRegistry(a), null);
    writeRegistry(a, r);
    writeRegistry(b, structuredClone(r));
    writeRegistry(b, r);
    const list = (d) => fs.readdirSync(path.join(d, 'cards')).sort();
    assert.deepEqual(list(a), list(b));
    assert.ok(list(a).includes('TCGDEX-A4.json'));
    for (const f of ['sets.json', ...list(a).map((x) => `cards/${x}`)]) {
      const ta = fs.readFileSync(path.join(a, f), 'utf8');
      assert.equal(ta, fs.readFileSync(path.join(b, f), 'utf8'));
      assert.ok(ta.endsWith('}\n'));
    }
    assert.deepEqual(readRegistry(a), r);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// --- Fix-Runde 1: Einfrieren auf Schluesselebene, additive Aenderungen ------------------
function ecard2Fixture({ withC = false, with50a = false } = {}) {
  const f = fixture();
  const c50 = pt('ecard2', '50');
  const c50a = pt('ecard2', '50a');
  const localIds = ['50a', '50b', ...(withC ? ['50c'] : [])];
  f.ptSets.push(ptSet('ecard2'));
  f.ptCardsBySet.set('ecard2', with50a ? [c50, c50a] : [c50]);
  f.tcgdexSets.push(td('ecard2', localIds));
  f.setPairs.push({ pokemontcgId: 'ecard2', tcgdexId: 'ecard2', method: 'exactId', overlap: 1 });
  f.cardResults.set('ecard2', result({ matched: with50a
    ? [{ ...m(c50, [ref('ecard2', '50b')]), method: 'variantGroup' }, m(c50a, [ref('ecard2', '50a')])]
    : [{ ...m(c50, localIds.map((l) => ref('ecard2', l))), method: 'variantGroup' }] }));
  return f;
}

test('neue Karte stiehlt keinen eingefrorenen Schluessel (ecard2-50a nach eingefrorenem 50 mit 50a)', () => {
  const previous = buildRegistry(ecard2Fixture());
  assert.deepEqual(previous.cards.ecard2['50'].keys.pokemontcg, ['50', '50a', '50b']);
  const next = buildRegistry({ ...ecard2Fixture({ with50a: true }), previous: structuredClone(previous) });
  assert.doesNotThrow(() => assertFrozen(previous, next));
  assert.deepEqual(resolveCollectionKey(next, 'ecard2', '50a'), { setId: 'ecard2', cardId: '50' });
  const added = Object.entries(next.cards.ecard2).filter(([, c]) => c.pokemontcg === 'ecard2-50a');
  assert.equal(added.length, 1);
  const [[newId, newCard]] = added;
  assert.notEqual(newId, '50a');
  assert.ok(!newCard.keys.pokemontcg.includes('50a'));
  assert.deepEqual(resolveCollectionKey(next, 'ecard2', newId), { setId: 'ecard2', cardId: newId });
  assert.deepEqual(next.cards.ecard2['50'].tcgdex, previous.cards.ecard2['50'].tcgdex);
});

test('Variantengruppe waechst um 50c: Referenz und Schluessel kommen additiv zur eingefrorenen Karte', () => {
  const previous = buildRegistry(ecard2Fixture());
  const next = buildRegistry({ ...ecard2Fixture({ withC: true }), previous: structuredClone(previous) });
  assert.doesNotThrow(() => assertFrozen(previous, next));
  const c = next.cards.ecard2['50'];
  assert.deepEqual(c.tcgdex.map((r) => r.localId), ['50a', '50b', '50c']);
  assert.deepEqual(c.keys, { pokemontcg: ['50', '50a', '50b', '50c'], tcgdex: ['50a', '50b', '50c'] });
  assert.deepEqual(resolveCollectionKey(next, 'ecard2', '50c'), { setId: 'ecard2', cardId: '50' });
  assert.ok(registryChanges(previous, next).some((x) => x.includes('ecard2/50') && x.includes('50c')));
});

test('eingefrorenes TCGdex-zuerst-Set bekommt spaeter ein pt-Paar: Aliase und pokemontcg ergaenzt, alte Schluessel bleiben', () => {
  const f0 = fixture();
  f0.ptSets = f0.ptSets.filter((s) => s.id !== 'me5');
  f0.ptCardsBySet.delete('me5');
  f0.setPairs = f0.setPairs.filter((p) => p.pokemontcgId !== 'me5');
  f0.cardResults.delete('me5');
  const previous = buildRegistry(f0);
  assert.deepEqual(previous.sets['TCGDEX-me05'], { pokemontcg: null, tcgdex: 'me05', mergedSubsets: [], aliases: [] });
  const next = buildRegistry({ ...fixture(), previous: structuredClone(previous) });
  assert.doesNotThrow(() => assertFrozen(previous, next));
  assert.equal(next.sets.me5, undefined);
  assert.deepEqual(next.sets['TCGDEX-me05'], { pokemontcg: 'me5', tcgdex: 'me05', mergedSubsets: [], aliases: ['me5'] });
  assert.deepEqual(next.cards['TCGDEX-me05']['1'], {
    pokemontcg: 'me5-1', tcgdex: [{ set: 'me05', localId: '001' }], keys: { pokemontcg: ['1'], tcgdex: ['1'] },
  });
  assert.deepEqual(resolveCollectionKey(next, 'me5', '1'), { setId: 'TCGDEX-me05', cardId: '1' });
  assert.deepEqual(resolveCollectionKey(next, 'TCGDEX-me05', '001'), { setId: 'TCGDEX-me05', cardId: '1' });
  const changes = registryChanges(previous, next);
  assert.ok(changes.includes('Set TCGDEX-me05: pokemontcg me5'));
  assert.ok(changes.includes('Karte TCGDEX-me05/1: pokemontcg me5-1'));
});

test('neuer Unterset-Merge fuer eingefrorenes Hauptset: mergedSubsets/Aliase additiv, Union-Karte GG1 bekommt pt-Gegenstueck', () => {
  const f0 = fixture();
  f0.ptSets = f0.ptSets.filter((s) => s.id !== 'swsh12pt5gg');
  f0.ptCardsBySet.delete('swsh12pt5gg');
  f0.setPairs = f0.setPairs.filter((p) => p.pokemontcgId !== 'swsh12pt5gg');
  f0.cardResults.delete('swsh12pt5gg');
  f0.tcgdexSets = f0.tcgdexSets.filter((s) => s.id !== 'swsh12.5gg');
  f0.subsetMerge = { merges: [] };
  const previous = buildRegistry(f0);
  assert.deepEqual(previous.sets.swsh12pt5.mergedSubsets, []);
  assert.equal(previous.cards.swsh12pt5.GG1.pokemontcg, null);
  const next = buildRegistry({ ...fixture(), previous: structuredClone(previous) });
  assert.doesNotThrow(() => assertFrozen(previous, next));
  assert.deepEqual(next.sets.swsh12pt5, {
    pokemontcg: 'swsh12pt5', tcgdex: 'swsh12.5', mergedSubsets: ['swsh12pt5gg'],
    aliases: ['TCGDEX-swsh12.5', 'TCGDEX-swsh12.5gg', 'swsh12pt5gg'],
  });
  assert.equal(next.cards.swsh12pt5.GG1.pokemontcg, 'swsh12pt5gg-GG01');
  assert.deepEqual(next.cards.swsh12pt5.GG1.tcgdex.map((r) => `${r.set}/${r.localId}`).sort(), ['swsh12.5/GG01', 'swsh12.5gg/GG01']);
  assert.equal(next.cards.swsh12pt5.GG2.pokemontcg, 'swsh12pt5gg-GG02');
  assert.deepEqual(resolveCollectionKey(next, 'swsh12pt5gg', 'GG1'), { setId: 'swsh12pt5', cardId: 'GG1' });
  assert.deepEqual(resolveCollectionKey(next, 'swsh12pt5', 'GG1'), { setId: 'swsh12pt5', cardId: 'GG1' });
});

test('assertFrozen: entfernter Alias/Schluessel/Referenz und geaenderter Skalar werfen, null -> Wert nicht', () => {
  const prev = build();
  const cases = [
    (r) => { r.sets.swsh12pt5.aliases = r.sets.swsh12pt5.aliases.filter((a) => a !== 'swsh12pt5gg'); },
    (r) => { r.sets.swsh12pt5.mergedSubsets = []; },
    (r) => { r.cards.svp['166'].keys.pokemontcg = []; },
    (r) => { r.cards.zsv10pt5['80'].tcgdex = []; },
    (r) => { r.cards.me5['1'].pokemontcg = 'me5-x'; },
    (r) => { r.sets.me5.tcgdex = 'me5x'; },
    (r) => { r.cards.cel25c['15_A1'].ambiguousLegacyKey = '16'; },
  ];
  for (const mutate of cases) {
    const next = structuredClone(prev);
    mutate(next);
    assert.throws(() => assertFrozen(prev, next), (e) => e instanceof RegistryFrozenError && e.changes.length === 1, mutate.toString());
  }
  const before = structuredClone(prev);
  before.cards.svp['166'].pokemontcg = null;
  before.sets['TCGDEX-A4'].pokemontcg = null;
  const after = structuredClone(prev);
  after.cards.svp['166'].pokemontcg = 'svp-166';
  after.sets['TCGDEX-A4'].pokemontcg = 'a4';
  after.sets['TCGDEX-A4'].aliases = ['a4'];
  assert.doesNotThrow(() => assertFrozen(before, after));
});

test('Invariante: Schluessel bei zwei Karten eines Sets und Case-Kollision von Set-IDs werden erkannt', () => {
  const r = build();
  assert.deepEqual(registryViolations(r), []);
  const bad = structuredClone(r);
  bad.cards.me5['1'].keys.pokemontcg.push('58');
  bad.cards.me5['58'] = { pokemontcg: null, tcgdex: [], keys: { pokemontcg: [], tcgdex: [] } };
  assert.ok(registryViolations(bad).some((v) => v.includes('58')));
  assert.throws(() => assertFrozen(r, bad), RegistryInvariantError);
  const f = fixture();
  f.tcgdexSets.push(td('abc', ['1']), td('ABC', ['1']));
  assert.throws(() => buildRegistry(f), (e) => e instanceof RegistryInvariantError && e.violations.some((v) => v.includes('tcgdex-abc')));
});

test('keine Zahlen-Fusion ausserhalb von Unterset/Override: vom Matcher getrennte Karten bleiben getrennt', () => {
  const f = fixture();
  const extra = pt('svp', '166', 'svp-166x');
  f.ptCardsBySet.get('svp').push(extra);
  f.cardResults.get('svp').primaryOnly.push(po(extra));
  const r = buildRegistry(f);
  const svp = r.cards.svp;
  assert.equal(svp['166'], undefined);
  assert.equal(svp['166x'].pokemontcg, 'svp-166x');
  assert.equal(svp['166x'].ambiguousLegacyKey, '166');
  assert.deepEqual(svp['166_166'].tcgdex, [{ set: 'svp', localId: '166' }]);
  assert.equal(svp['166_166'].ambiguousLegacyKey, '166');
});

test('Kartenschluessel case-insensitiv in beiden Namensraeumen', () => {
  const r = build();
  assert.deepEqual(resolveCollectionKey(r, 'swsh12pt5', 'gg1'), { setId: 'swsh12pt5', cardId: 'GG1' });
  assert.deepEqual(resolveCollectionKey(r, 'TCGDEX-swsh12.5gg', 'gg01'), { setId: 'swsh12pt5', cardId: 'GG1' });
  assert.deepEqual(resolveCollectionKey(r, 'TCGDEX-cel25cc', 'cc003'), { setId: 'cel25c', cardId: '15_A3' });
});

test('readRegistry wirft, wenn eine Kartendatei eines Sets fehlt', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-'));
  try {
    writeRegistry(tmp, build());
    fs.rmSync(path.join(tmp, 'cards', 'me5.json'));
    assert.throws(() => readRegistry(tmp), /me5/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
