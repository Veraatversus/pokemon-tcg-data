import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { learnTables } from '../merge/learn-tables.mjs';
import { deriveLegalities, loadLegals } from '../merge/legalities.mjs';
import { resolveImages, resolveSetImages } from '../merge/images.mjs';

const pair = (td, pt) => ({ tcgdexCard: td, ptCard: pt });
const rep = (n, f) => Array.from({ length: n }, (_, i) => f(i));

test('learnTables: Mehrheit, Schwelle 3, sortierte Ausgabe', () => {
  const pairs = [
    ...rep(3, () => pair({ rarity: 'Double rare', category: 'Pokemon', stage: 'Basic', suffix: 'ex' }, { rarity: 'Double Rare', supertype: 'Pokémon', subtypes: ['Basic', 'ex'], rules: ['r'] })),
    ...rep(2, () => pair({ rarity: 'Double rare', category: 'Pokemon', stage: 'Basic', suffix: 'ex' }, { rarity: 'Rare Holy', supertype: 'Pokémon', subtypes: ['Basic', 'ex'], rules: ['r'] })),
    ...rep(2, () => pair({ rarity: 'Rare', category: 'Trainer', trainerType: 'Item' }, { rarity: 'Rare', supertype: 'Trainer', subtypes: ['Item'], rules: [] })),
    pair({ rarity: 'Common', category: 'Energy' }, { rarity: 'Common', supertype: 'Energy', subtypes: ['Basic'], rules: [] }),
  ];
  const t = learnTables(pairs);
  assert.deepEqual(t.rarity, {}); // 3/5 = 60 % < 80 %
  assert.deepEqual(t.supertype, { Pokemon: 'Pokémon' });
  assert.deepEqual(t.subtypes, { 'Basic|ex||': ['Basic', 'ex'] });
  assert.deepEqual(t.rules, { 'ex|Basic|Double rare': ['r'] }); // rules einheitlich
});

test('learnTables: Gleichstand ohne Eintrag, Schluessel sortiert', () => {
  const mk = (r) => rep(3, () => pair({ rarity: 'Z' }, { rarity: r }));
  assert.deepEqual(learnTables([...mk('B'), ...mk('A')]).rarity, {}); // Gleichstand = unter 80 %
  const t = learnTables([...rep(3, () => pair({ rarity: 'b' }, { rarity: 'x' })), ...rep(3, () => pair({ rarity: 'a' }, { rarity: 'y' }))]);
  assert.deepEqual(Object.keys(t.rarity), ['a', 'b']);
});

test('learnTables: genau 80 % gelernt, knapp darunter nicht; leere Schluessel uebersprungen', () => {
  const mk = (n, r) => rep(n, () => pair({ rarity: 'K', category: 'Pokemon' }, { rarity: r, supertype: 'S', subtypes: ['x'], rules: [] }));
  assert.deepEqual(learnTables([...mk(4, 'A'), ...mk(1, 'B')]).rarity, { K: 'A' }); // 4/5
  assert.deepEqual(learnTables([...mk(7, 'A'), ...mk(2, 'B')]).rarity, {}); // 7/9 < 80 %
  const t = learnTables(rep(5, () => pair({}, { subtypes: ['x'], rules: [] })));
  assert.deepEqual(t.subtypes, {});
  assert.deepEqual(t.rules, {});
});

const legals = {
  standard: { includes: { series: [], sets: [], regulationMark: ['H', 'I'] }, excludes: { sets: [], cards: [] } },
  expanded: { includes: { series: ['swsh', 'sv'], sets: [], regulationMark: ['F', 'G', 'H', 'I'] }, excludes: { sets: ['x1'], cards: ['swsh2-22'] } },
};
test('deriveLegalities', () => {
  assert.deepEqual(deriveLegalities({ tcgdexSetId: 'sv1', serieId: 'sv', localId: '1', regulationMark: 'H' }, legals), { unlimited: 'Legal', standard: 'Legal', expanded: 'Legal' });
  assert.deepEqual(deriveLegalities({ tcgdexSetId: 'swsh1', serieId: 'swsh', localId: '1', regulationMark: 'D' }, legals), { unlimited: 'Legal', expanded: 'Legal' });
  assert.deepEqual(deriveLegalities({ tcgdexSetId: 'swsh2', serieId: 'swsh', localId: '22', regulationMark: 'D' }, legals), { unlimited: 'Legal' });
  assert.deepEqual(deriveLegalities({ tcgdexSetId: 'x1', serieId: 'swsh', localId: '1', regulationMark: 'H' }, legals), { unlimited: 'Legal', standard: 'Legal' });
  assert.deepEqual(deriveLegalities({ tcgdexSetId: 'base1', serieId: 'base', localId: '1' }, legals), { unlimited: 'Legal' });
});

test('deriveLegalities: Set-Ids punkt-tolerant (sm3.5 vs sm35)', () => {
  const l = { standard: { includes: { series: [], sets: [], regulationMark: [] }, excludes: { sets: [], cards: [] } },
    expanded: { includes: { series: ['sm'], sets: [], regulationMark: [] }, excludes: { sets: ['sm10.5'], cards: ['sm35-45'] } } };
  assert.deepEqual(deriveLegalities({ tcgdexSetId: 'sm3.5', serieId: 'sm', localId: '45' }, l), { unlimited: 'Legal' });
  assert.deepEqual(deriveLegalities({ tcgdexSetId: 'sm3.5', serieId: 'sm', localId: '46' }, l), { unlimited: 'Legal', expanded: 'Legal' });
  assert.deepEqual(deriveLegalities({ tcgdexSetId: 'sm105', serieId: 'sm', localId: '1' }, l), { unlimited: 'Legal' });
});

test('loadLegals liest die echte legals.ts', () => {
  const f = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'sources', 'tcgdex', 'meta', 'legals.ts');
  const l = loadLegals(f);
  assert.ok(Array.isArray(l.standard.includes.regulationMark));
  assert.ok(Array.isArray(l.expanded.excludes.cards));
});

const idx = { en: { sv: { sv1: { 1: 'h', logo: 'l' } } }, de: { sv: { sv1: {} } }, univ: { sv: { sv1: { symbol: 's' } } } };
test('resolveImages / resolveSetImages', () => {
  assert.deepEqual(resolveImages(idx, { lang: 'en', serieId: 'sv', setId: 'sv1', localId: '1' }), {
    small: 'https://assets.tcgdex.net/en/sv/sv1/1/low.webp', large: 'https://assets.tcgdex.net/en/sv/sv1/1/high.webp',
  });
  assert.equal(resolveImages(idx, { lang: 'en', serieId: 'sv', setId: 'sv1', localId: '2' }), null);
  assert.equal(resolveImages(idx, { lang: 'de', serieId: 'sv', setId: 'sv1', localId: '1' }), null);
  assert.deepEqual(resolveSetImages(idx, { lang: 'en', serieId: 'sv', setId: 'sv1' }), {
    logo: 'https://assets.tcgdex.net/en/sv/sv1/logo.webp', symbol: 'https://assets.tcgdex.net/univ/sv/sv1/symbol.webp',
  });
  assert.deepEqual(resolveSetImages(idx, { lang: 'de', serieId: 'sv', setId: 'sv1' }), { symbol: 'https://assets.tcgdex.net/univ/sv/sv1/symbol.webp' });
});
