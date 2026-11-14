import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeCard, mergeRarity } from '../merge/merge-card.mjs';
import { mergeSet } from '../merge/merge-set.mjs';

const legals = {
  standard: { includes: { series: [], sets: [], regulationMark: ['H'] }, excludes: { sets: [], cards: [] } },
  expanded: { includes: { series: ['sv', 'swsh'], sets: [], regulationMark: [] }, excludes: { sets: [], cards: [] } },
};
const sourceCommits = { pokemontcg: 'aaaaaaaa', tcgdex: 'bbbbbbbb' };

const sv035 = { id: 'sv03.5', serieId: 'sv', serieName: { en: 'Scarlet & Violet', de: 'Karmesin & Purpur' }, name: { en: '151', de: '151' }, abbreviationOfficial: 'MEW', cardCountOfficial: 165, releaseDate: '2023-09-22', cardmarketId: 5402, tcgplayerId: 23237 };
const assetsIndex = {
  en: { sv: { 'sv03.5': { '006': 'h1', logo: 'l' } }, swsh: { swsh9: { TG01: 'h' } }, tcgp: { A1: { '001': 'h', logo: 'l' } } },
  de: { sv: { 'sv03.5': { '006': 'h2', logo: 'l' } }, tcgp: { A1: { logo: 'l' } } },
  univ: { sv: { 'sv03.5': { symbol: 's' } } },
};

const charizardTd = {
  localId: '006', set: sv035, dexId: [6], name: { en: 'Charizard ex', de: 'Glurak-ex' }, rarity: 'Double rare', category: 'Pokemon', hp: 330, types: ['Fire'],
  evolveFrom: { en: 'Charmeleon', de: 'Glutexo' }, stage: 'Stage2', suffix: 'ex', illustrator: 'PLANETA Mochizuki', regulationMark: 'G', retreat: 2,
  attacks: [{ cost: ['Fire'], name: { en: 'Brave Wing', de: 'Tapfere Flügel' }, effect: { en: 'TD text', de: 'DE Text' }, damage: '60+' }],
  weaknesses: [{ type: 'Water', value: '×2' }],
  variants: [{ type: 'holo', thirdParty: { cardmarket: 733601, tcgplayer: 502558, cardtrader: 1 } }],
};
const charizardPt = {
  id: 'sv3pt5-6', name: 'Charizard ex', supertype: 'Pokémon', subtypes: ['Stage 2', 'ex'], hp: '330', types: ['Fire'], evolvesFrom: 'Charmeleon',
  rules: ['ex rule'], attacks: [{ name: 'Brave Wing', cost: ['Fire'], convertedEnergyCost: 1, damage: '60+', text: 'PT text' }],
  weaknesses: [{ type: 'Water', value: '×2' }], retreatCost: ['Colorless', 'Colorless'], convertedRetreatCost: 2, number: '6',
  artist: 'PLANETA Mochizuki', rarity: 'Double Rare', nationalPokedexNumbers: [6], regulationMark: 'G',
  legalities: { unlimited: 'Legal', standard: 'Legal', expanded: 'Legal' },
  images: { small: 'https://images.pokemontcg.io/sv3pt5/6.png', large: 'https://images.pokemontcg.io/sv3pt5/6_hires.png' },
};

test('mergeCard: gematchte Karte (EN aus pt, DE aus TCGdex, Legalitaeten aus TCGdex, Varianten)', () => {
  const c = mergeCard({
    canonicalSetId: 'sv3pt5', canonicalCardId: '6',
    registryCard: { pokemontcg: 'sv3pt5-6', tcgdex: [{ set: 'sv03.5', localId: '006' }], keys: { pokemontcg: ['6'], tcgdex: ['6'] } },
    ptCard: charizardPt, tcgdexCards: [charizardTd], tcgdexSet: sv035, tables: { rarity: {}, subtypes: {}, supertype: {}, rules: {} },
    legals, assetsIndex, sourceCommits,
  });
  assert.equal(c.id, 'sv3pt5-6');
  assert.equal(c.setId, 'sv3pt5');
  assert.equal(c.cardId, '6');
  assert.equal(c.matchStatus, 'matched');
  assert.equal(c.number, '6');
  assert.equal(c.name, 'Charizard ex');
  assert.deepEqual(c.subtypes, ['Stage 2', 'ex']);
  assert.equal(c.attacks[0].text, 'PT text');
  assert.deepEqual(c.rules, ['ex rule']);
  assert.equal(c.rarity, 'Double Rare');
  assert.deepEqual(c.legalities, { unlimited: 'Legal', expanded: 'Legal' }); // nicht pt-Snapshot
  assert.deepEqual(c.images, { small: 'https://assets.tcgdex.net/en/sv/sv03.5/006/low.webp', large: 'https://assets.tcgdex.net/en/sv/sv03.5/006/high.webp' });
  assert.equal(c.i18n.de.name, 'Glurak-ex');
  assert.equal(c.i18n.de.evolvesFrom, 'Glutexo');
  assert.deepEqual(c.i18n.de.attacks, [{ name: 'Tapfere Flügel', text: 'DE Text' }]);
  assert.equal(c.i18n.de.images.small, 'https://assets.tcgdex.net/de/sv/sv03.5/006/low.webp');
  assert.deepEqual(c.variants, [{ type: 'holo', cardmarketId: 733601, tcgplayerId: 502558 }]);
  assert.deepEqual(c.ids, { pokemontcg: 'sv3pt5-6', tcgdex: 'sv03.5-006', cardmarket: [733601], tcgplayer: [502558] });
  assert.deepEqual(c.sources, { pokemontcg: 'aaaaaaaa', tcgdex: 'bbbbbbbb' });
});

const tables = {
  rarity: { 'Double rare': 'Double Rare', 'Illustration rare': 'Rare Holo' },
  subtypes: { 'Basic|ex||': ['Basic', 'ex'] },
  supertype: { Pokemon: 'Pokémon' },
  rules: { 'ex|Basic|Double rare': ['ex rule'] },
};

test('mergeCard: TCGdex-only-Karte nutzt gelernte Tabellen, keine pt-Felder', () => {
  const td = { localId: '166', set: { id: 'svp', serieId: 'sv' }, name: { en: 'Mew ex', de: 'Mew-ex' }, category: 'Pokemon', stage: 'Basic', suffix: 'ex', rarity: 'Double rare', hp: 180, types: ['Psychic'], retreat: 1, regulationMark: 'H', illustrator: 'X', variants: [{ type: 'holo' }] };
  const c = mergeCard({
    canonicalSetId: 'svp', canonicalCardId: '166',
    registryCard: { pokemontcg: null, tcgdex: [{ set: 'svp', localId: '166' }], keys: { pokemontcg: ['166'], tcgdex: ['166'] } },
    ptCard: null, tcgdexCards: [td], tcgdexSet: td.set, tables, legals, assetsIndex: {}, sourceCommits,
  });
  assert.equal(c.matchStatus, 'tcgdex_only');
  assert.equal(c.supertype, 'Pokémon');
  assert.deepEqual(c.subtypes, ['Basic', 'ex']);
  assert.deepEqual(c.rules, ['ex rule']);
  assert.equal(c.rarity, 'Double Rare');
  assert.equal(c.hp, '180');
  assert.deepEqual(c.retreatCost, ['Colorless']);
  assert.equal(c.convertedRetreatCost, 1);
  assert.equal(c.artist, 'X');
  assert.deepEqual(c.legalities, { unlimited: 'Legal', standard: 'Legal', expanded: 'Legal' });
  assert.equal(c.images, undefined);
  assert.deepEqual(c.sources, { tcgdex: 'bbbbbbbb' });
  assert.equal(c.ids.pokemontcg, null);
  assert.deepEqual(c.variants, [{ type: 'holo' }]);
});

test('mergeRarity: nur Schreibvarianten aus der Tabelle, sonst TCGdex-Wert', () => {
  assert.equal(mergeRarity('Double rare', tables), 'Double Rare');
  assert.equal(mergeRarity('Illustration rare', tables), 'Illustration rare'); // Tabelle sagt 'Rare Holo': kein Schreibvariant
  assert.equal(mergeRarity('One Diamond', tables), 'One Diamond');
  assert.equal(mergeRarity('DoubleRare', { rarity: { DoubleRare: 'Double Rare' } }), 'Double Rare');
  assert.equal(mergeRarity('Double Rare', { rarity: { 'Double Rare': 'DoubleRare' } }), 'Double Rare'); // Leerzeichen-Schreibung bevorzugt
  assert.equal(mergeRarity(undefined, tables), undefined);
});

test('mergeCard: Unterset-Karte im Hauptset (Bilder/Legalitaeten aus Unterset-TCGdex-Set)', () => {
  const swsh9tg = { id: 'swsh9tg', serieId: 'swsh' };
  const td = { localId: 'TG01', set: swsh9tg, name: { en: 'Flareon' }, category: 'Pokemon', stage: 'Basic', rarity: 'Rare Holo', regulationMark: 'F' };
  const pt = { id: 'swsh9tg-TG01', name: 'Flareon', supertype: 'Pokémon', subtypes: ['Basic'], number: 'TG01', rarity: 'Trainer Gallery Rare Holo', images: { small: 's', large: 'l' } };
  const assets = { en: { swsh: { swsh9tg: { TG01: 'h' } } } };
  const c = mergeCard({
    canonicalSetId: 'swsh9', canonicalCardId: 'TG1',
    registryCard: { pokemontcg: 'swsh9tg-TG01', tcgdex: [{ set: 'swsh9tg', localId: 'TG01' }], keys: { pokemontcg: ['TG1'], tcgdex: ['TG1'] } },
    ptCard: pt, tcgdexCards: [td], tcgdexSet: { id: 'swsh9', serieId: 'swsh' }, tables, legals, assetsIndex: assets, sourceCommits,
  });
  assert.equal(c.id, 'swsh9-TG1');
  assert.equal(c.setId, 'swsh9');
  assert.equal(c.cardId, 'TG1');
  assert.equal(c.number, 'TG01');
  assert.equal(c.ids.pokemontcg, 'swsh9tg-TG01');
  assert.equal(c.ids.tcgdex, 'swsh9tg-TG01');
  assert.equal(c.images.small, 'https://assets.tcgdex.net/en/swsh/swsh9tg/TG01/low.webp');
  assert.deepEqual(c.legalities, { unlimited: 'Legal', expanded: 'Legal' });
});

test('mergeCard: pt-Karte ohne TCGdex nutzt Legacy-Bild, Legalitaeten ueber TCGdex-Set', () => {
  const c = mergeCard({
    canonicalSetId: 'sv3pt5', canonicalCardId: '999',
    registryCard: { pokemontcg: 'sv3pt5-999', tcgdex: [], keys: { pokemontcg: ['999'], tcgdex: [] } },
    ptCard: { ...charizardPt, id: 'sv3pt5-999', number: '999' }, tcgdexCards: [], tcgdexSet: sv035, tables, legals, assetsIndex, sourceCommits,
  });
  assert.equal(c.matchStatus, 'primary_only');
  assert.equal(c.images.small, 'https://images.pokemontcg.io/sv3pt5/6.png');
  assert.deepEqual(c.legalities, { unlimited: 'Legal', expanded: 'Legal' });
  assert.deepEqual(c.sources, { pokemontcg: 'aaaaaaaa' });
  assert.equal(c.ids.tcgdex, null);
});

test('mergeCard: prozentkodierte localId (%3F) -> Nummer "?", Bild je nach Index-Schreibweise', () => {
  const exu = { id: 'exu', serieId: 'ex' };
  const td = { localId: '%3F', set: exu, name: { en: 'Unown' }, category: 'Pokemon', stage: 'Basic' };
  const args = (assets) => ({
    canonicalSetId: 'TCGDEX-exu', canonicalCardId: '%3F',
    registryCard: { pokemontcg: null, tcgdex: [{ set: 'exu', localId: '%3F' }], keys: { pokemontcg: ['%3F'], tcgdex: ['%3F'] } },
    ptCard: null, tcgdexCards: [td], tcgdexSet: exu, tables, legals, assetsIndex: assets, sourceCommits,
  });
  const decoded = mergeCard(args({ en: { ex: { exu: { '?': 'h' } } } }));
  assert.equal(decoded.number, '?');
  assert.equal(decoded.cardId, '%3F');
  assert.equal(decoded.images.small, 'https://assets.tcgdex.net/en/ex/exu/%3F/low.webp');
  const raw = mergeCard(args({ en: { ex: { exu: { '%3F': 'h' } } } }));
  assert.equal(raw.images.small, 'https://assets.tcgdex.net/en/ex/exu/%3F/low.webp');
  assert.equal(mergeCard(args({})).images, undefined);
});

test('mergeCard: Trainer ohne pt -> Effekt als Regeltext, DE-Regeltext', () => {
  const td = { localId: '10', set: sv035, name: { en: 'Potion', de: 'Trank' }, category: 'Trainer', trainerType: 'Item', effect: { en: 'Heal 30.', de: 'Heile 30.' } };
  const c = mergeCard({
    canonicalSetId: 'TCGDEX-x', canonicalCardId: '10',
    registryCard: { pokemontcg: null, tcgdex: [{ set: 'sv03.5', localId: '10' }], keys: { pokemontcg: ['10'], tcgdex: ['10'] } },
    ptCard: null, tcgdexCards: [td], tcgdexSet: sv035, tables, legals, assetsIndex: {}, sourceCommits,
  });
  assert.equal(c.supertype, 'Trainer');
  assert.deepEqual(c.subtypes, ['Item']);
  assert.deepEqual(c.rules, ['Heal 30.']);
  assert.deepEqual(c.i18n.de.rules, ['Heile 30.']);
});


test('mergeSet: pt-Set mit TCGdex-Gegenstueck', () => {
  const s = mergeSet({
    canonicalSetId: 'sv3pt5', registrySet: { pokemontcg: 'sv3pt5', tcgdex: 'sv03.5', mergedSubsets: [], aliases: ['TCGDEX-sv03.5'] },
    ptSet: { id: 'sv3pt5', name: '151', series: 'Scarlet & Violet', printedTotal: 165, total: 207, ptcgoCode: 'MEW', releaseDate: '2023/09/22', images: { symbol: 'pt-s', logo: 'pt-l' } },
    tcgdexSet: sv035, cardCount: 207, assetsIndex,
  });
  assert.equal(s.id, 'sv3pt5');
  assert.equal(s.name, '151');
  assert.equal(s.series, 'Scarlet & Violet');
  assert.equal(s.printedTotal, 165);
  assert.equal(s.total, 207);
  assert.equal(s.releaseDate, '2023/09/22');
  assert.equal(s.ptcgoCode, 'MEW');
  assert.deepEqual(s.images, { logo: 'https://assets.tcgdex.net/en/sv/sv03.5/logo.webp', symbol: 'https://assets.tcgdex.net/en/sv/sv03.5/symbol.webp' });
  assert.equal(s.i18n.de.name, '151');
  assert.equal(s.i18n.de.images.logo, 'https://assets.tcgdex.net/de/sv/sv03.5/logo.webp');
  assert.deepEqual(s.ids, { pokemontcg: 'sv3pt5', tcgdex: 'sv03.5', cardmarket: 5402, tcgplayer: 23237 });
  assert.deepEqual(s.aliases, ['TCGDEX-sv03.5']);
});

test('merge-set adds DE series and cardCount', () => {
  const me6 = { id: 'me06', serieId: 'me', serieName: { en: 'Mega Evolution', de: 'Mega-Entwicklung' }, name: { en: 'X', de: 'X' }, cardCountOfficial: 103, cardCountTotal: 141, releaseDate: '2026-01-01', cardmarketId: null, tcgplayerId: null };
  const s = mergeSet({ canonicalSetId: 'me6', registrySet: { pokemontcg: null, tcgdex: 'me06', aliases: [] }, ptSet: null, tcgdexSet: me6, cardCount: 141, assetsIndex });
  assert.equal(s.series, 'Mega Evolution');
  assert.equal(s.i18n.de.series, 'Mega-Entwicklung');
  assert.deepEqual(s.i18n.de.cardCount, { official: 103, total: 141 });
  const partial = mergeSet({ canonicalSetId: 'me6', registrySet: { tcgdex: 'me06', aliases: [] }, tcgdexSet: { ...me6, cardCountTotal: null, serieName: { en: 'Mega Evolution' } }, cardCount: 141, assetsIndex });
  assert.deepEqual(partial.i18n.de.cardCount, { official: 103 });
  assert.equal(partial.i18n.de.series, undefined);
});

test('mergeSet: verifiziert fehlende TCGdex-Assets -> pt-Fallback oben, kein DE-Logo', () => {
  const miss = { status: 'missing', checkedAt: '2026-11-12T00:00:00.000Z' };
  const A = 'https://assets.tcgdex.net';
  const assetsVerified = Object.fromEntries([
    `${A}/en/sv/sv03.5/symbol.webp`, `${A}/en/sv/sv03.5/symbol.png`, `${A}/de/sv/sv03.5/logo.webp`, `${A}/de/sv/sv03.5/logo.png`,
  ].map((u) => [u, miss]));
  const s = mergeSet({
    canonicalSetId: 'sv3pt5', registrySet: { pokemontcg: 'sv3pt5', tcgdex: 'sv03.5', mergedSubsets: [], aliases: [] },
    ptSet: { id: 'sv3pt5', name: '151', images: { symbol: 'pt-s', logo: 'pt-l' } },
    tcgdexSet: sv035, cardCount: 207, assetsIndex, assetsVerified,
  });
  assert.deepEqual(s.images, { logo: `${A}/en/sv/sv03.5/logo.webp`, symbol: 'pt-s' });
  assert.deepEqual(s.i18n.de, { name: '151', series: 'Karmesin & Purpur', cardCount: { official: 165 } });
});

test('mergeSet: pt-Set ohne TCGdex -> Legacy-Bilder, keine Cardmarket-Expansion (kein Tracker mehr)', () => {
  const s = mergeSet({
    canonicalSetId: 'base1', registrySet: { pokemontcg: 'base1', tcgdex: null, mergedSubsets: [], aliases: [] },
    ptSet: { id: 'base1', name: 'Base', series: 'Base', printedTotal: 102, total: 102, ptcgoCode: 'BS', releaseDate: '1999/01/09', images: { symbol: 'pt-s', logo: 'pt-l' } },
    tcgdexSet: null, cardCount: 102, assetsIndex,
  });
  assert.deepEqual(s.images, { logo: 'pt-l', symbol: 'pt-s' });
  assert.deepEqual(s.ids, { pokemontcg: 'base1', tcgdex: null, cardmarket: null, tcgplayer: null }); // Expansion bestimmt fillCardmarketIds
  assert.equal(s.i18n, undefined);
});

test('mergeSet: TCGDEX-Set und Pocket-Set', () => {
  const svp = { id: 'P-A', serieId: 'tcgp', serieName: { en: 'Pokémon TCG Pocket' }, name: { en: 'Promo-A', de: 'Promo-A' }, abbreviationOfficial: 'P-A', cardCountOfficial: 100, releaseDate: '2024-10-30', cardmarketId: null, tcgplayerId: null };
  const s = mergeSet({
    canonicalSetId: 'TCGDEX-P-A', registrySet: { pokemontcg: null, tcgdex: 'P-A', mergedSubsets: [], aliases: [] },
    ptSet: null, tcgdexSet: svp, cardCount: 7, assetsIndex,
  });
  assert.equal(s.id, 'TCGDEX-P-A');
  assert.equal(s.name, 'Promo-A');
  assert.equal(s.series, 'Pokémon TCG Pocket');
  assert.equal(s.printedTotal, 100);
  assert.equal(s.total, 7);
  assert.equal(s.releaseDate, '2024/10/30');
  assert.equal(s.ptcgoCode, 'P-A');
  assert.deepEqual(s.ids, { pokemontcg: null, tcgdex: 'P-A', cardmarket: null, tcgplayer: null });
  const a1 = mergeSet({
    canonicalSetId: 'TCGDEX-A1', registrySet: { pokemontcg: null, tcgdex: 'A1', mergedSubsets: [], aliases: [] },
    ptSet: null, tcgdexSet: { ...svp, id: 'A1', name: { en: 'Genetic Apex', de: 'Unschlagbare Gene' }, cardmarketId: 7 }, cardCount: 286, assetsIndex,
  });
  assert.deepEqual(a1.images, { logo: 'https://assets.tcgdex.net/en/tcgp/A1/logo.webp' });
  assert.deepEqual(a1.i18n.de, { name: 'Unschlagbare Gene', cardCount: { official: 100 }, images: { logo: 'https://assets.tcgdex.net/de/tcgp/A1/logo.webp' } });
  assert.equal(a1.ids.cardmarket, 7);
});

test('mergeSet: Set nur mit nicht-englischem Namen -> erster vorhandener Name', () => {
  const fr = { id: '2013bw', serieId: 'mc', serieName: { en: "McDonald's Collection" }, name: { fr: "Collection McDonald's 2013" }, cardCountOfficial: 12, releaseDate: '2013-01-01', cardmarketId: null, tcgplayerId: null };
  const s = mergeSet({ canonicalSetId: 'TCGDEX-2013bw', registrySet: { pokemontcg: null, tcgdex: '2013bw', mergedSubsets: [], aliases: [] }, ptSet: null, tcgdexSet: fr, cardCount: 12, assetsIndex: {} });
  assert.equal(s.name, "Collection McDonald's 2013");
  assert.equal(s.images, undefined);
});

test('mergeCard: Bilder oben strikt EN -> pt-Legacy; DE nur in i18n.de.images', () => {
  const base = {
    canonicalSetId: 'sv3pt5', canonicalCardId: '6',
    registryCard: { pokemontcg: 'sv3pt5-6', tcgdex: [{ set: 'sv03.5', localId: '006' }], keys: { pokemontcg: ['6'], tcgdex: ['6'] } },
    ptCard: charizardPt, tcgdexCards: [charizardTd], tcgdexSet: sv035, tables, legals, sourceCommits,
  };
  const deOnly = { de: { sv: { 'sv03.5': { '006': 'h' } } } };
  const c = mergeCard({ ...base, assetsIndex: deOnly });
  assert.equal(c.images.small, 'https://images.pokemontcg.io/sv3pt5/6.png'); // kein DE-Fallback oben, Legacy vor DE
  assert.equal(c.i18n.de.images.small, 'https://assets.tcgdex.net/de/sv/sv03.5/006/low.webp');
  const enAndDe = mergeCard({ ...base, assetsIndex: { ...deOnly, en: { sv: { 'sv03.5': { '006': 'h' } } } } });
  assert.equal(enAndDe.images.small, 'https://assets.tcgdex.net/en/sv/sv03.5/006/low.webp');
  assert.equal(mergeCard({ ...base, assetsIndex: {} }).images.small, 'https://images.pokemontcg.io/sv3pt5/6.png');
  const tdOnly = mergeCard({ ...base, ptCard: null, registryCard: { ...base.registryCard, pokemontcg: null }, assetsIndex: deOnly });
  assert.equal('images' in tdOnly, false); // nur DE-Bild: oben kein images
  assert.equal(tdOnly.i18n.de.images.small, 'https://assets.tcgdex.net/de/sv/sv03.5/006/low.webp');
  const none = mergeCard({ ...base, ptCard: null, registryCard: { ...base.registryCard, pokemontcg: null }, assetsIndex: {} });
  assert.equal('images' in none, false);
  assert.equal(none.i18n.de.images, undefined); // DE-Bilder nur echte DE-Assets
});

const meTd = {
  localId: '001', set: { id: 'me02.5', serieId: 'me' }, dexId: [43], name: { en: "Erika's Oddish", de: 'Erikas Myrapla' }, category: 'Pokemon', stage: 'Basic',
  hp: 60, types: ['Grass'], rarity: 'Common', retreat: 1, regulationMark: 'J', illustrator: 'Ill',
  attacks: [{ cost: ['Grass'], name: { en: 'Reckless Charge' }, effect: { en: 'This Pokémon also does 10 damage to itself.' }, damage: 30 }],
  weaknesses: [{ type: 'Fire', value: '×2' }],
  variants: [{ type: 'normal', thirdParty: { cardmarket: 1 } }, { type: 'reverse' }],
};
const mePt = {
  id: 'me2pt5-1', supertype: 'Pokémon', subtypes: ['Basic Stage', 'Trainer-Owned'], types: ['Grass'], hp: 60, name: "Erika's Oddish", rarity: 'Common',
  attacks: [{ name: 'Reckless Charge', text: 'x', cost: 'G', damage: '30', convertedEnergyCost: 1 }], abilities: [], resistances: [],
  weaknesses: [{ type: 'Fire', value: '×2' }], number: '1', regulationMark: 'J', retreatCost: ['Colorless'], convertedRetreatCost: 1,
  nationalPokedexNumbers: [], images: { small: 'https://images.pokedata.ovh/en/me2-5/1.webp', large: 'https://images.pokedata.ovh/en/me2-5/1_hires.webp' },
};
const meArgs = (ptCard, tdCards = [meTd]) => ({
  canonicalSetId: 'me2pt5', canonicalCardId: '1',
  registryCard: { pokemontcg: 'me2pt5-1', tcgdex: tdCards.map((c) => ({ set: c.set.id, localId: c.localId })), keys: { pokemontcg: ['1'], tcgdex: ['1'] } },
  ptCard, tcgdexCards: tdCards, tcgdexSet: meTd.set, tables, legals, assetsIndex: {}, sourceCommits,
});

test('mergeCard: Julien-Format-pt-Karte -> Spielfelder aus TCGdex, pokemontcg-kompatible Formen', () => {
  const c = mergeCard(meArgs(mePt));
  assert.equal(c.matchStatus, 'matched');
  assert.equal(c.hp, '60');
  assert.deepEqual(c.subtypes, ['Basic']);
  assert.deepEqual(c.attacks, [{ name: 'Reckless Charge', cost: ['Grass'], convertedEnergyCost: 1, damage: '30', text: 'This Pokémon also does 10 damage to itself.' }]);
  assert.equal('abilities' in c, false);
  assert.equal('resistances' in c, false);
  assert.deepEqual(c.retreatCost, ['Colorless']);
  assert.equal(c.name, "Erika's Oddish");
  assert.equal(c.number, '1');
  assert.equal(c.artist, 'Ill'); // pt ohne artist -> TCGdex
  assert.deepEqual(c.nationalPokedexNumbers, [43]); // pt leer -> TCGdex
  assert.equal(c.images.small, 'https://images.pokedata.ovh/en/me2-5/1.webp');
});

test('mergeCard: generische Normalisierung pt-Werte; normale pt-Karte unveraendert', () => {
  const pt = { ...charizardPt, abilities: [{ name: 'A', text: 't' }], resistances: [], hp: '330' };
  const c = mergeCard({
    canonicalSetId: 'sv3pt5', canonicalCardId: '6',
    registryCard: { pokemontcg: 'sv3pt5-6', tcgdex: [], keys: { pokemontcg: ['6'], tcgdex: [] } },
    ptCard: pt, tcgdexCards: [], tcgdexSet: sv035, tables, legals, assetsIndex: {}, sourceCommits,
  });
  assert.deepEqual(c.abilities, [{ name: 'A', text: 't', type: 'Ability' }]);
  assert.equal('resistances' in c, false);
  for (const k of ['subtypes', 'attacks', 'rules', 'retreatCost', 'weaknesses', 'types', 'hp', 'supertype', 'evolvesFrom', 'convertedRetreatCost']) {
    assert.deepEqual(c[k], charizardPt[k], k);
  }
  const primaryJulien = mergeCard({ ...meArgs(mePt, []), tcgdexSet: null });
  assert.equal(primaryJulien.hp, '60');
  assert.equal('abilities' in primaryJulien, false);
});

test('mergeCard: Varianten ueber mehrere TCGdex-Refs dedupliziert; rarity "None" entfaellt', () => {
  const second = { ...meTd, localId: '001a', variants: [{ type: 'normal', thirdParty: { cardmarket: 1 } }, { type: 'holo' }] };
  const c = mergeCard(meArgs(mePt, [meTd, second]));
  assert.deepEqual(c.variants, [{ type: 'normal', cardmarketId: 1 }, { type: 'reverse' }, { type: 'holo' }]);
  const none = mergeCard({ ...meArgs(null, [{ ...meTd, rarity: 'None' }]), registryCard: { pokemontcg: null, tcgdex: [{ set: 'me02.5', localId: '001' }], keys: { pokemontcg: ['1'], tcgdex: ['1'] } } });
  assert.equal('rarity' in none, false);
  assert.equal(mergeRarity('None', tables), undefined);
});

// Unterset-Karten (Galarian Gallery u. a.): TCGdex liefert die Assets unter dem Eltern-Set-Pfad.
import { resolveImages } from '../merge/images.mjs';

test('resolveImages: Unterset-Karte loest Bild unter dem Eltern-Set-Pfad auf', () => {
  const index = { de: { swsh: { 'swsh12.5': { GG01: 'h' } } } };
  const r = resolveImages(index, { lang: 'de', serieId: 'swsh', setId: 'swsh12.5gg', localId: 'GG01', parentSetId: 'swsh12.5' });
  assert.deepEqual(r, { small: 'https://assets.tcgdex.net/de/swsh/swsh12.5/GG01/low.webp', large: 'https://assets.tcgdex.net/de/swsh/swsh12.5/GG01/high.webp' });
});

test('resolveImages: eigener Set-Pfad gewinnt vor dem Eltern-Set', () => {
  const index = { de: { swsh: { 'swsh12.5gg': { GG01: 'a' }, 'swsh12.5': { GG01: 'b' } } } };
  const r = resolveImages(index, { lang: 'de', serieId: 'swsh', setId: 'swsh12.5gg', localId: 'GG01', parentSetId: 'swsh12.5' });
  assert.equal(r.small, 'https://assets.tcgdex.net/de/swsh/swsh12.5gg/GG01/low.webp');
});

test('resolveImages: kein Bild, wenn weder Set noch Eltern-Set es haben', () => {
  const index = { de: { swsh: { 'swsh12.5': { GG02: 'b' } } } };
  assert.equal(resolveImages(index, { lang: 'de', serieId: 'swsh', setId: 'swsh12.5gg', localId: 'GG01', parentSetId: 'swsh12.5' }), null);
});

test('mergeCard: Unterset-Karte erhaelt i18n.de.images aus dem Eltern-Set-Pfad, oben nur EN', () => {
  const sub = { id: 'swsh12.5gg', serieId: 'swsh' };
  const td = { localId: 'GG01', set: sub, name: { en: 'Hisuian', de: 'Hisui' }, category: 'Pokemon', stage: 'Basic', rarity: 'Rare Holo', regulationMark: 'F' };
  const assets = { de: { swsh: { 'swsh12.5': { GG01: 'h' } } } };
  const c = mergeCard({
    canonicalSetId: 'swsh12pt5', canonicalCardId: 'GG1',
    registryCard: { pokemontcg: null, tcgdex: [{ set: 'swsh12.5gg', localId: 'GG01' }], keys: { pokemontcg: [], tcgdex: ['GG1'] } },
    ptCard: null, tcgdexCards: [td], tcgdexSet: { id: 'swsh12.5', serieId: 'swsh' }, tables, legals, assetsIndex: assets, sourceCommits,
  });
  assert.equal(c.i18n.de.images.small, 'https://assets.tcgdex.net/de/swsh/swsh12.5/GG01/low.webp');
  assert.equal(c.images, undefined);
});
