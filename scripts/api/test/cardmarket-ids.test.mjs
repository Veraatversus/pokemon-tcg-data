import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCmNumber, commonNumberPrefix, normalizeCmName, fillCardmarketIds, primaryCardmarketId, cardmarketSearchUrl } from '../merge/cardmarket-ids.mjs';

const single = (cardmarketProductId, name, collectorNumber) => ({
  cardmarketProductId, name, collectorNumber, categoryId: 51, categoryName: 'Pokémon Single',
});
const card = (cardId, number, name, cardmarket = []) => ({
  id: `s1-${cardId}`, setId: 's1', cardId, number, name, ids: { pokemontcg: null, tcgdex: null, cardmarket, tcgplayer: [] },
});
// Ein Set s1 mit Cardmarket-Expansion 100; expansions: expansionId -> Produktliste.
const run = (cards, products, extra = {}) => {
  const cardsBySet = new Map([['s1', cards]]);
  const report = fillCardmarketIds({
    sets: [{ id: 's1', ids: { cardmarket: 100 } }],
    cardsBySet,
    loadExpansion: (id) => (id === 100 ? { expansionId: 100, cards: products } : null),
    ...extra,
  });
  return { cards: cardsBySet.get('s1'), report };
};

test('normalizeCmNumber: fuehrende Nullen weg, Gross/Klein egal, Praefixe bleiben', () => {
  assert.equal(normalizeCmNumber('001'), '1');
  assert.equal(normalizeCmNumber('1'), '1');
  assert.equal(normalizeCmNumber('TG01'), 'tg1');
  assert.equal(normalizeCmNumber('tg1'), 'tg1');
  assert.equal(normalizeCmNumber('SV001'), 'sv1');
  assert.equal(normalizeCmNumber('XY35'), 'xy35');
  assert.equal(normalizeCmNumber('24a'), '24a');
  assert.equal(normalizeCmNumber('000'), '0');
  assert.equal(normalizeCmNumber(null), null);
  assert.equal(normalizeCmNumber(''), null);
});

test('normalizeCmName: Klammerzusatz, Diakritika, Satzzeichen, Lv.-Angabe', () => {
  assert.equal(normalizeCmName('Pineco [Guard Press]'), normalizeCmName('Pineco'));
  assert.equal(normalizeCmName('Moltres EX [Destructive Flame | Power Flame]'), normalizeCmName('Moltres-EX'));
  assert.equal(normalizeCmName('EXP. ALL'), normalizeCmName('EXP.ALL'));
  assert.equal(normalizeCmName('Pokémon Communication'), normalizeCmName('Pokemon Communication'));
  assert.equal(normalizeCmName("Professor's Research - Professor Magnolia"), normalizeCmName("Professor's Research (Professor Magnolia)"));
  assert.equal(normalizeCmName('Gengar Lv.44 [Curse | Shadow Skip]'), normalizeCmName('Gengar'));
  assert.equal(normalizeCmName('Mudkip Gold Star [Whirlpool | Spring Back]'), normalizeCmName('Mudkip ★'));
  assert.notEqual(normalizeCmName('Arceus LV.X [Multitype | Meteor Blast]'), normalizeCmName('Arceus'));
  assert.equal(normalizeCmName('Arceus LV.X [Multitype | Meteor Blast]'), normalizeCmName('Arceus LV.X'));
});

test('fills cardmarket id by number+name', () => {
  const { cards, report } = run(
    [card('1', '1', 'Pineco'), card('2', '2', 'Heracross')],
    [single(702298, 'Pineco [Guard Press]', '001'), single(702299, 'Heracross [Horn Attack]', '002'), single(9, 'Pineco [Other]', null)],
  );
  assert.deepEqual(cards[0].ids.cardmarket, [702298]);
  assert.equal(cards[0].ids.cardmarketSource, 'matched');
  assert.deepEqual(cards[1].ids.cardmarket, [702299]);
  assert.deepEqual(report.totals, { cards: 2, tcgdex: 0, matched: 2, missing: 0, ambiguous: 0, override: 0, customSet: 0, stabilityKept: 0 });
  assert.deepEqual(report.bySet.s1, { expansionId: 100, cards: 2, tcgdex: 0, matched: 2, missing: 0, ambiguous: 0, coverage: { cards: 2, withId: 2, bySource: { matched: 2 } }, searchUrl: cardmarketSearchUrl(100) });
});

test('no id when two products match', () => {
  const { cards, report } = run(
    [card('5', '5', 'Scyther')],
    [single(1, 'Scyther [Slash]', '5'), single(2, 'Scyther [Agility]', '005')],
  );
  assert.deepEqual(cards[0].ids.cardmarket, []);
  assert.equal(cards[0].ids.cardmarketSource, undefined);
  assert.equal(report.totals.ambiguous, 1);
  assert.equal(report.totals.missing, 1);
  assert.deepEqual(report.bySet.s1.ambiguousCards, ['5']);
});

test('never overwrites tcgdex id', () => {
  const { cards, report } = run(
    [card('1', '1', 'Pineco', [555])],
    [single(702298, 'Pineco [Guard Press]', '001')],
  );
  assert.deepEqual(cards[0].ids.cardmarket, [555]);
  assert.equal(cards[0].ids.cardmarketSource, undefined);
  assert.deepEqual(report.totals, { cards: 1, tcgdex: 1, matched: 0, missing: 0, ambiguous: 0, override: 0, customSet: 0, stabilityKept: 0 });
});

test('bracket suffix ignored in name check', () => {
  const { cards } = run(
    [card('81', '81', 'Nidoran ♀'), card('14', '14', 'Moltres-EX')],
    [single(1, 'Nidoran [F] [Find a Friend | Gnaw]', '081'), single(2, 'Moltres EX [Destructive Flame | Power Flame]', '14')],
  );
  assert.deepEqual(cards[0].ids.cardmarket, [1]);
  assert.deepEqual(cards[1].ids.cardmarket, [2]);
});

test('Nummer passt, Name nicht -> leer', () => {
  const { cards, report } = run([card('3', '3', 'Mewtwo')], [single(1, 'Electabuzz [Light Screen]', '3')]);
  assert.deepEqual(cards[0].ids.cardmarket, []);
  assert.equal(report.totals.missing, 1);
  assert.equal(report.totals.ambiguous, 0);
  assert.deepEqual(report.bySet.s1.missingCards, ['3']);
});

test('nur Name bei collectorNumber null: genau ein Produkt dieses Namens in der Expansion', () => {
  const { cards } = run(
    [card('DP01', 'DP01', 'Turtwig'), card('DP02', 'DP02', 'Chimchar')],
    [single(10, 'Turtwig Lv.10 [Tackle | Razor Leaf]', null), single(11, 'Chimchar [Scratch]', null), single(12, 'Chimchar [Ember]', '7')],
  );
  assert.deepEqual(cards[0].ids.cardmarket, [10]);
  // Chimchar gibt es zweimal in der Expansion -> kein Raten
  assert.deepEqual(cards[1].ids.cardmarket, []);
});

test('nur Name: einziges Produkt mit Nummer zaehlt nicht, nur collectorNumber null', () => {
  const { cards } = run([card('SV1', 'SV1', 'Scyther')], [single(1, 'Scyther [Slash]', '5')]);
  assert.deepEqual(cards[0].ids.cardmarket, []);
});

test('Produkt, das eine TCGdex-ID schon belegt, wird nicht noch einmal vergeben', () => {
  const { cards } = run(
    [card('19', '19', 'Sandshrew', [7]), card('19a', '19a', 'Sandshrew')],
    [single(7, 'Sandshrew [Ice Ball]', null)],
  );
  assert.deepEqual(cards[1].ids.cardmarket, []);
});

test('zwei Karten wuerden dasselbe Produkt bekommen -> beide leer, mehrdeutig', () => {
  const { cards, report } = run(
    [card('A', 'A1', 'Ditto'), card('B', 'B1', 'Ditto')],
    [single(3, 'Ditto [Transform]', null)],
  );
  assert.deepEqual(cards[0].ids.cardmarket, []);
  assert.deepEqual(cards[1].ids.cardmarket, []);
  assert.equal(report.totals.ambiguous, 2);
});

test('nur Pokémon-Singles zaehlen', () => {
  const { cards } = run(
    [card('1', '1', 'Pineco')],
    [{ ...single(1, 'Pineco', '1'), categoryId: 52, categoryName: 'Pokémon Booster' }],
  );
  assert.deepEqual(cards[0].ids.cardmarket, []);
});

test('Set ohne Cardmarket-Expansion oder ohne Expansionsdatei -> leer, gezaehlt', () => {
  const cardsBySet = new Map([['s1', [card('1', '1', 'Pineco')]], ['s2', [{ ...card('1', '1', 'Pineco'), id: 's2-1', setId: 's2' }]]]);
  const report = fillCardmarketIds({
    sets: [{ id: 's1', ids: { cardmarket: null } }, { id: 's2', ids: { cardmarket: 404 } }],
    cardsBySet,
    loadExpansion: () => null,
  });
  // ohne Expansion fehlt alles; keine Kartenliste (z. B. Pocket-Sets)
  assert.deepEqual(report.bySet.s1, { expansionId: null, cards: 1, tcgdex: 0, matched: 0, missing: 1, ambiguous: 0, coverage: { cards: 1, withId: 0, bySource: {} }, searchUrl: null });
  assert.equal(report.bySet.s2.expansionId, 404);
  assert.equal(report.bySet.s2.expansionFileMissing, true);
});

test('Unterset-Karte: eigene Expansion des Untersets, sonst die des Haupt-Sets; fehlt sie dort, leer und gemeldet', () => {
  const own = card('TG01', 'TG01', 'Pikachu');
  const inMain = card('TG02', 'TG02', 'Raichu');
  const absent = card('TG03', 'TG03', 'Pichu');
  const cardsBySet = new Map([['s1', [own, inMain, absent]]]);
  const report = fillCardmarketIds({
    sets: [{ id: 's1', ids: { cardmarket: 100 } }],
    cardsBySet,
    // Unterset-Karten: Cardmarket-Expansion des TCGdex-Untersets (null = Unterset ohne eigene Id)
    subsetExpansion: new Map([['s1-TG01', 200], ['s1-TG02', null], ['s1-TG03', null]]),
    loadExpansion: (id) => ({
      100: { cards: [single(1, 'Raichu', 'TG02')] },
      200: { cards: [single(2, 'Pikachu [Thunder]', 'TG01')] },
    })[id] ?? null,
  });
  assert.deepEqual(own.ids.cardmarket, [2]);
  assert.deepEqual(inMain.ids.cardmarket, [1]);
  assert.deepEqual(absent.ids.cardmarket, []);
  assert.deepEqual(report.bySet.s1.subsetMissing, ['TG03']);
  assert.equal(report.totals.matched, 2);
});

// Geteilte TCGdex-IDs (base2-1 / base2-17 teilen 273798; Cardmarket: #1 -> 273798, #17 -> 273814)
const shared = () => [
  { ...card('1', '1', 'Clefable', [273798]), variants: [{ type: 'holo', cardmarketId: 273798 }] },
  { ...card('17', '17', 'Clefable', [273798]), variants: [{ type: 'normal', cardmarketId: 273798 }] },
];
const base2Products = [single(273798, 'Clefable [Metronome | Minimize]', '1'), single(273814, 'Clefable [Metronome | Minimize]', '17')];

test('corrects shared tcgdex id by strict number match', () => {
  const { cards, report } = run(shared(), base2Products);
  assert.deepEqual(cards[0].ids.cardmarket, [273798]); // bestaetigt, unveraendert
  assert.equal(cards[0].ids.cardmarketSource, undefined);
  assert.deepEqual(cards[0].variants, [{ type: 'holo', cardmarketId: 273798 }]);
  assert.deepEqual(cards[1].ids.cardmarket, [273814]);
  assert.equal(cards[1].ids.cardmarketSource, 'corrected');
  assert.deepEqual(cards[1].ids.cardmarketTcgdex, [273798]);
  assert.deepEqual(cards[1].variants, [{ type: 'normal', cardmarketId: 273814 }]); // geteilte Varianten-ID ersetzt
  assert.deepEqual(report.duplicateTcgdexIds, { 273798: ['s1-1', 's1-17'] });
  assert.deepEqual(report.duplicates, { ids: 1, cards: 2, corrected: 1, kept: 1 });
  assert.equal(report.bySet.s1.corrected, 1);
});

test('keeps shared id when no strict match', () => {
  // #17 nur ohne Nummer bei Cardmarket -> kein strenger Treffer, nie nur per Name
  const { cards, report } = run(shared(), [single(273798, 'Clefable [Metronome]', '1'), single(273814, 'Clefable [Metronome]', null)]);
  assert.deepEqual(cards[1].ids.cardmarket, [273798]);
  assert.equal(cards[1].ids.cardmarketSource, undefined);
  assert.deepEqual(cards[1].variants, [{ type: 'normal', cardmarketId: 273798 }]);
  assert.deepEqual(report.duplicates, { ids: 1, cards: 2, corrected: 0, kept: 2 });
  // strenger Treffer ist schon von einer anderen TCGdex-Karte belegt -> bleibt
  const other = { ...card('99', '99', 'Pikachu', [273814]) };
  const r2 = run([...shared(), other], base2Products);
  assert.deepEqual(r2.cards[1].ids.cardmarket, [273798]);
  // zwei Karten mit demselben strengen Treffer -> keine korrigiert
  const three = [...shared(), { ...card('17b', '17', 'Clefable', [273798]) }];
  const r3 = run(three, base2Products);
  assert.deepEqual(r3.cards[1].ids.cardmarket, [273798]);
  assert.deepEqual(r3.cards[2].ids.cardmarket, [273798]);
});

test('never touches non-duplicated tcgdex id', () => {
  // TCGdex-ID passt nicht zur Nummer, ist aber nicht geteilt -> bleibt
  const { cards, report } = run([card('17', '17', 'Clefable', [273798])], base2Products);
  assert.deepEqual(cards[0].ids.cardmarket, [273798]);
  assert.equal(cards[0].ids.cardmarketSource, undefined);
  assert.deepEqual(report.duplicateTcgdexIds, {});
  assert.deepEqual(report.duplicates, { ids: 0, cards: 0, corrected: 0, kept: 0 });
});

test('nur Name: mehrere gleichnamige Produkte, eines ohne Nummer -> mehrdeutig gezaehlt', () => {
  const { cards, report } = run([card('DP02', 'DP02', 'Chimchar')], [single(11, 'Chimchar [Scratch]', null), single(12, 'Chimchar [Ember]', '7')]);
  assert.deepEqual(cards[0].ids.cardmarket, []);
  assert.equal(report.totals.ambiguous, 1);
});

test('geteilte ID neben der richtigen: ids.cardmarket auf den strengen Treffer eingeengt', () => {
  // base2-17 real: ids [273798, 273814], erste Variante traegt die geteilte 273798
  const cards = [
    { ...card('1', '1', 'Clefable', [273798]) },
    { ...card('17', '17', 'Clefable', [273798, 273814]), variants: [{ type: 'normal', cardmarketId: 273798 }, { type: 'holo', cardmarketId: 273814 }] },
  ];
  const { cards: out, report } = run(cards, base2Products);
  assert.deepEqual(out[1].ids.cardmarket, [273814]);
  assert.equal(out[1].ids.cardmarketSource, 'corrected');
  assert.deepEqual(out[1].ids.cardmarketTcgdex, [273798, 273814]);
  assert.deepEqual(out[1].variants, [{ type: 'normal', cardmarketId: 273814 }, { type: 'holo', cardmarketId: 273814 }]);
  assert.deepEqual(report.duplicates, { ids: 1, cards: 2, corrected: 1, kept: 1 });
});

test('correction keeps unshared tcgdex ids', () => {
  // ex4-73 Maxie real: 275850 geteilt (normal/reverse), 871873 nur diese Karte (gestempelte Variante)
  const cards = [
    { ...card('73', '73', "Team Magma's Rhydon", [275850]) },
    {
      ...card('74', '74', 'Maxie', [275850, 871873]),
      variants: [
        { type: 'normal', cardmarketId: 275850 },
        { type: 'reverse', cardmarketId: 275850 },
        { type: 'normal', stamp: ['tsuguyoshi-yamato'], cardmarketId: 871873 },
      ],
    },
  ];
  const products = [single(275850, "Team Magma's Rhydon [Rock Slide]", '73'), single(276050, 'Maxie', '74')];
  const { cards: out, report } = run(cards, products);
  assert.deepEqual(out[1].ids.cardmarket, [276050, 871873]); // Treffer zuerst, eigene ID bleibt
  assert.equal(out[1].ids.cardmarketSource, 'corrected');
  assert.deepEqual(out[1].ids.cardmarketTcgdex, [275850, 871873]);
  assert.deepEqual(out[1].variants, [
    { type: 'normal', cardmarketId: 276050 },
    { type: 'reverse', cardmarketId: 276050 },
    { type: 'normal', stamp: ['tsuguyoshi-yamato'], cardmarketId: 871873 },
  ]);
  assert.deepEqual(out[0].ids.cardmarket, [275850]);
  assert.deepEqual(report.duplicates, { ids: 1, cards: 2, corrected: 1, kept: 1 });
});

test('jede Variante mit geteilter ID bekommt den Treffer, auch gestempelte (mcd21-Form)', () => {
  const cards = [
    { ...card('1', '1', 'Clefable', [273798]) },
    { ...card('17', '17', 'Clefable', [273798]), variants: [{ type: 'normal', stamp: ['x'], cardmarketId: 273798 }] },
  ];
  const { cards: out } = run(cards, base2Products);
  assert.deepEqual(out[1].ids.cardmarket, [273814]);
  assert.deepEqual(out[1].variants, [{ type: 'normal', stamp: ['x'], cardmarketId: 273814 }]);
});

// --- Cardmarket-IDs gegen die Expansion des Sets pruefen ---
// Expansionen: 100 = Set-Expansion, 200 = fremde Expansion, 300 = Unterset-Expansion.
const runExp = (cards, expansions, { sets = [{ id: 's1', ids: { cardmarket: 100 } }], subsetExpansion } = {}) => {
  const cardsBySet = new Map([['s1', cards]]);
  const productExp = new Map();
  for (const [e, products] of Object.entries(expansions)) for (const p of products) productExp.set(p.cardmarketProductId, Number(e));
  const report = fillCardmarketIds({
    sets,
    cardsBySet,
    subsetExpansion,
    knownExpansions: new Set(Object.keys(expansions).map(Number)),
    productExpansion: (id) => productExp.get(id) ?? null,
    loadExpansion: (id) => (expansions[id] ? { expansionId: id, cards: expansions[id] } : null),
  });
  return { cards: cardsBySet.get('s1'), report, sets };
};

test('replaces id from foreign expansion by strict match', () => {
  // ex4-74-Form: TCGdex-ID zeigt in eine fremde Expansion auf ein anders benanntes Produkt
  const cards = [{
    ...card('74', '74', 'Strength Charm', [275851, 871873]),
    variants: [{ type: 'normal', cardmarketId: 275851 }, { type: 'normal', stamp: ['x'], cardmarketId: 871873 }],
  }];
  const { cards: out, report } = runExp(cards, {
    100: [single(276051, 'Strength Charm', '74')],
    200: [single(275851, 'Team Magma Ball', '74'), single(871873, 'Strength Charm', null)],
  });
  assert.deepEqual(out[0].ids.cardmarket, [276051, 871873]); // fremde, gleichnamige ID (Stempel) bleibt
  assert.equal(out[0].ids.cardmarketSource, 'corrected-expansion');
  assert.deepEqual(out[0].ids.cardmarketTcgdex, [275851, 871873]);
  assert.deepEqual(out[0].variants, [{ type: 'normal', cardmarketId: 276051 }, { type: 'normal', stamp: ['x'], cardmarketId: 871873 }]);
  assert.deepEqual(report.expansionMismatch.cards, [{ cardKey: 's1-74', oldId: 275851, oldExpansion: 200, newId: 276051, reason: 'corrected-expansion' }]);
  assert.equal(report.expansionMismatch.totals.corrected, 1);
  assert.equal(report.expansionMismatch.totals.foreignNameOk, 1);
});

test('replaces foreign id by name-only match when the set expansion has no numbers (ex4 Team Aqua)', () => {
  const { cards: out } = runExp([card('1', '1', "Team Aqua's Cacturne", [275778])], {
    100: [single(275978, "Team Aqua's Cacturne [Poison Payback]", null)],
    200: [single(275778, 'Armaldo [Primal Veil | Blade Arms]', '1')],
  });
  assert.deepEqual(out[0].ids.cardmarket, [275978]);
  assert.equal(out[0].ids.cardmarketSource, 'corrected-expansion');
});

test('drops id with foreign expansion and mismatching name', () => {
  const cards = [{ ...card('2', '2', "Team Aqua's Crawdaunt", [275779]), variants: [{ type: 'normal', cardmarketId: 275779 }] }];
  const { cards: out, report } = runExp(cards, {
    // zwei gleichnamige Produkte ohne Nummer -> mehrdeutig, kein Ersatz
    100: [single(275979, "Team Aqua's Crawdaunt", null), single(275991, "Team Aqua's Crawdaunt", null)],
    200: [single(275779, 'Cacturne [Poison Payback | Feint Attack]', '2')],
  });
  assert.deepEqual(out[0].ids.cardmarket, []);
  assert.deepEqual(out[0].ids.cardmarketTcgdex, [275779]);
  assert.deepEqual(out[0].variants, [{ type: 'normal' }]);
  assert.deepEqual(report.expansionMismatch.cards, [{ cardKey: 's1-2', oldId: 275779, oldExpansion: 200, newId: null, reason: 'dropped-mismatch' }]);
  assert.equal(report.expansionMismatch.totals.dropped, 1);
});

test('keeps mismatching id in the set expansion without unique match and reports it', () => {
  const { cards: out, report } = runExp([card('46', '46', "Erika's Gloom", [274152])], {
    100: [single(274152, 'Erika', '3')],
  });
  assert.deepEqual(out[0].ids.cardmarket, [274152]);
  assert.equal(out[0].ids.cardmarketSource, undefined);
  assert.deepEqual(report.expansionMismatch.cards, [{ cardKey: 's1-46', oldId: 274152, oldExpansion: 100, newId: null, reason: 'kept-mismatch' }]);
});

test('lenient name check: Basic-Energie, Untertitel, Kurz-Tags, {X}', () => {
  const cards = [
    card('17', '017', 'Grass Energy', [1]),
    card('122', '122', "Professor's Research", [2]),
    card('8', '8', 'Lucario GL', [3]),
    card('86', '86', 'Growing {G} Energy', [4]),
  ];
  const { cards: out, report } = runExp(cards, {
    100: [],
    200: [
      single(1, 'Basic Grass Energy', null), single(2, "Professor's Research - Professor Oak", null),
      single(3, 'Lucario [GL] Lv.32 [Boundary Aura]', null), single(4, 'Growing [G] Energy', null),
    ],
  });
  assert.deepEqual(out.map((c) => c.ids.cardmarket), [[1], [2], [3], [4]]);
  assert.deepEqual(report.expansionMismatch.cards, []);
  assert.equal(report.expansionMismatch.totals.foreignNameOk, 4);
});

test('keeps subset card in its own expansion', () => {
  const { cards: out, report } = runExp([card('TG05', 'TG05', 'Pikachu', [7])], {
    100: [single(8, 'Pikachu', '5')],
    300: [single(7, 'Pikachu [Thunder]', 'TG05')],
  }, { subsetExpansion: new Map([['s1-TG05', 300]]) });
  assert.deepEqual(out[0].ids.cardmarket, [7]);
  assert.equal(out[0].ids.cardmarketSource, undefined);
  assert.deepEqual(report.expansionMismatch.cards, []);
  assert.equal(report.expansionMismatch.totals.foreignNameOk, 0);
});

test('set without valid expansion: mismatching ids are only reported', () => {
  const { cards: out, report } = runExp([card('1', '1', 'Bulbizarre', [5])], { 200: [single(5, 'Bulbasaur', '1')] }, { sets: [{ id: 's1', ids: { cardmarket: null } }] });
  assert.deepEqual(out[0].ids.cardmarket, [5]);
  assert.deepEqual(report.expansionMismatch.cards, [{ cardKey: 's1-1', oldId: 5, oldExpansion: 200, newId: null, reason: 'no-set-expansion' }]);
});

test('derives set expansion when majority agrees', () => {
  // tk1a-Form: ids.cardmarket ist eine Produkt-ID, die Karten zeigen alle auf Expansion 1626
  const sets = [{ id: 's1', ids: { cardmarket: 275771 } }];
  const cards = [card('1', '1', 'Bagon', [275777]), card('2', '2', 'Combusken', [275770]), card('10', '10', 'Fire Energy', [275771]), card('11', '11', 'Latias')];
  const { cards: out, report } = runExp(cards, {
    1626: [single(275777, 'Bagon', null), single(275770, 'Combusken', null), single(275771, 'Fire Energy', null), single(275772, 'Latias [Mist Ball]', null)],
  }, { sets });
  assert.equal(sets[0].ids.cardmarket, 1626);
  assert.equal(sets[0].ids.cardmarketSetSource, 'derived');
  assert.equal(sets[0].ids.cardmarketTcgdexSet, 275771);
  assert.deepEqual(report.expansionMismatch.sets, [{ setId: 's1', oldId: 275771, newId: 1626, reason: 'derived', evidence: '3/3', evidenceSource: 'tcgdex' }]);
  assert.equal(report.bySet.s1.expansionId, 1626);
  assert.deepEqual(out[3].ids.cardmarket, [275772]); // Luecke aus der abgeleiteten Expansion gefuellt
});

test('keeps set expansion when evidence is weak', () => {
  const sets = [{ id: 's1', ids: { cardmarket: 999 } }];
  const cards = [card('1', '1', 'Bagon', [1]), card('2', '2', 'Combusken', [2]), card('3', '3', 'Torchic', [3])];
  const { report } = runExp(cards, {
    1626: [single(1, 'Bagon', null), single(2, 'Combusken', null)],
    1627: [single(3, 'Torchic', null)],
  }, { sets });
  assert.equal(sets[0].ids.cardmarket, 999); // 2/3 < 80 % -> nicht erfunden
  assert.equal(sets[0].ids.cardmarketSetSource, undefined);
  assert.deepEqual(report.expansionMismatch.sets, [{ setId: 's1', oldId: 999, newId: null, reason: 'invalid-kept', evidence: '2/3', evidenceSource: 'tcgdex' }]);
});

test('swapped ids in the same expansion: both replaced by number+name', () => {
  // xyp-Form: XY20 Greninja-EX zeigt auf "Greninja", XY162 Greninja auf "Greninja EX #XY20"
  const { cards: out } = runExp([card('XY20', 'XY20', 'Greninja-EX', [10]), card('XY162', 'XY162', 'Greninja', [11])], {
    100: [single(11, 'Greninja EX [Sharpshooting]', 'XY20'), single(12, 'Greninja [Mist]', 'XY162')],
    200: [single(10, 'Greninja [Mist Concealment]', null)],
  });
  assert.deepEqual(out[0].ids.cardmarket, [11]);
  assert.deepEqual(out[1].ids.cardmarket, [12]);
});

test('attack names disambiguate same-name products without numbers', () => {
  const withAttacks = (c, attacks, abilities) => ({ ...c, attacks: attacks.map((name) => ({ name })), ...(abilities ? { abilities: abilities.map((name) => ({ name })) } : {}) });
  // ex4-Form: zwei "Team Aqua's Crawdaunt" ohne Nummer, fremde Expansion-ID wird ersetzt
  const ex4 = runExp([
    withAttacks(card('2', '2', "Team Aqua's Crawdaunt", [275779]), ['Deep Impact', 'Aqua Reverse']),
    withAttacks(card('14', '14', "Team Aqua's Crawdaunt", [275791]), ['Poison Reaction', 'Double Claw']),
  ], {
    100: [single(275979, "Team Aqua's Crawdaunt [Aqua Reverse | Deep Impact]", null), single(275991, "Team Aqua's Crawdaunt [Poison Reaction | Double Claw]", null)],
    200: [single(275779, 'Cacturne [Poison Payback | Feint Attack]', '2'), single(275791, 'Zangoose [Poison Resistance]', '14')],
  });
  assert.deepEqual(ex4.cards[0].ids.cardmarket, [275979]); // Reihenfolge egal
  assert.equal(ex4.cards[0].ids.cardmarketSource, 'corrected-expansion');
  assert.deepEqual(ex4.cards[1].ids.cardmarket, [275991]);
  // me55-Form beim Fuellen: viele "Pikachu" ohne Nummer; Faehigkeit zaehlt mit; Zahlen-Tokens fallen weg
  const products = [
    single(907655, 'Pikachu [Store Up]', null), single(907638, 'Pikachu [Gnaw]', null),
    single(907635, 'Pikachu [Lonely Gaze | Pika Ball]', null), single(907630, 'Pikachu [Thunder Shock | 30]', null),
    single(907661, 'Pikachu ex [Zip-Zap Frenzy | Thunder]', null), single(907757, 'Pikachu ex [Zip-Zap Frenzy | Thunder]', null),
  ];
  const { cards: out, report } = run([
    withAttacks(card('48', '48', 'Pikachu'), ['Store Up']),
    withAttacks(card('28', '28', 'Pikachu'), ['Pika Ball'], ['Lonely Gaze']),
    withAttacks(card('23', '23', 'Pikachu'), ['Thunder Shock']),
    withAttacks(card('54', '54', 'Pikachu ex'), ['Zip-Zap Frenzy', 'Thunder']), // zwei gleiche Produkte -> mehrdeutig
    withAttacks(card('99', '99', 'Pikachu'), ['Quick Attack']), // kein gleiches Produkt -> mehrdeutig
    card('98', '98', 'Pikachu'), // ohne Angriffe keine Unterscheidung
  ], products);
  assert.deepEqual(out.map((c) => c.ids.cardmarket), [[907655], [907635], [907630], [], [], []]);
  assert.equal(out[0].ids.cardmarketSource, 'matched');
  assert.equal(report.totals.ambiguous, 3);
});

test('attack names in the shared-id correction', () => {
  const withAttacks = (c, attacks) => ({ ...c, attacks: attacks.map((name) => ({ name })) });
  const cards = [
    withAttacks(card('1', '1', 'Pikachu', [5]), ['Gnaw']),
    withAttacks(card('2', '2', 'Pikachu', [5]), ['Store Up']),
  ];
  const { cards: out } = run(cards, [single(5, 'Pikachu [Gnaw]', null), single(6, 'Pikachu [Store Up]', null)]);
  assert.deepEqual(out[1].ids.cardmarket, [6]);
  assert.equal(out[1].ids.cardmarketSource, 'corrected');
  assert.deepEqual(out[0].ids.cardmarket, [5]);
});

test('primary id prefers unstamped variant', () => {
  const v = (cardmarket, variants) => ({ ids: { cardmarket }, variants });
  assert.equal(primaryCardmarketId(v([1], [{ type: 'normal', stamp: ['pre-release'], cardmarketId: 727119 }, { type: 'normal', cardmarketId: 725152 }])), 725152);
  assert.equal(primaryCardmarketId(v([1], [{ type: 'normal', stamp: [], cardmarketId: 5 }, { type: 'holo', cardmarketId: 6 }])), 5);
  assert.equal(primaryCardmarketId(v([1], [{ type: 'normal', stamp: ['x'], cardmarketId: 7 }, { type: 'holo' }])), 7);
  assert.equal(primaryCardmarketId(v([9, 8], [{ type: 'normal' }])), 9);
  assert.equal(primaryCardmarketId({ ids: { cardmarket: [] } }), undefined);
});

// --- Namensregeln, Reihenfolge-Heuristik, Overrides ---
const withAttacks12 = (c, attacks) => ({ ...c, attacks: attacks.map((name) => ({ name })) });

test('oversized product never matched', () => {
  // V-UNION: einziges Produkt dieses Namens ist [Oversized] -> leer
  const only = run([card('SWSH139', 'SWSH139', 'Pikachu V-UNION')], [single(576911, 'Pikachu V-UNION [Oversized]', null)]);
  assert.deepEqual(only.cards[0].ids.cardmarket, []);
  assert.equal(only.report.rules.oversizeExcluded, 1);
  assert.deepEqual(only.report.oversizeExcludedProducts, [{ productId: 576911, name: 'Pikachu V-UNION [Oversized]', expansionId: 100 }]);
  // daneben das normale Produkt -> das normale, Gross/Klein egal
  const both = run([card('SWSH139', 'SWSH139', 'Pikachu V-UNION')], [single(1, 'Pikachu V-UNION [OVERSIZED]', null), single(2, 'Pikachu V-UNION', null)]);
  assert.deepEqual(both.cards[0].ids.cardmarket, [2]);
  // auch bei Nummerntreffer nie das Oversize-Produkt
  const num = run([card('5', '5', 'Zacian V-UNION')], [single(3, 'Zacian V-UNION [Oversized]', '5')]);
  assert.deepEqual(num.cards[0].ids.cardmarket, []);
  // "Jumbo" im Angriffsnamen ist kein Oversize-Marker
  const jumbo = run([card('7', '7', 'Wailord')], [single(4, 'Wailord [Jumbo-Sized | Special Wave]', '7')]);
  assert.deepEqual(jumbo.cards[0].ids.cardmarket, [4]);
  assert.equal(jumbo.report.rules.oversizeExcluded, 0);
});

test('energy symbol matches Bubbly Water Energy', () => {
  const { cards, report } = run(
    [card('132', '132', 'Bubbly Water Energy'), card('133', '133', 'Growing Grass Energy'), card('134', '134', 'Nitro Fire Energy'), card('81', '81', 'Nidoran ♀')],
    [single(918974, 'Bubbly [W] Energy', null), single(918976, 'Growing [G] Energy', null), single(918977, 'Nitro [R] Energy', null), single(5, 'Nidoran [F] [Find a Friend | Gnaw]', null)],
  );
  assert.deepEqual(cards.map((c) => c.ids.cardmarket), [[918974], [918976], [918977], [5]]);
  assert.deepEqual(cards.map((c) => c.ids.cardmarketSource), ['energySymbol', 'energySymbol', 'energySymbol', 'matched']);
  assert.equal(report.rules.energySymbol, 3);
  // [F] vor der Angriffsklammer ist kein Energie-Symbol (Nidoran ♀), wird also nicht zu "Fighting"
  const nido = run([card('82', '82', 'Nidoran Fighting')], [single(6, 'Nidoran [F] [Find a Friend | Gnaw]', null)]);
  assert.deepEqual(nido.cards[0].ids.cardmarket, []);
  // zwei Produkte mit demselben Energie-Namen -> mehrdeutig
  const two = run([card('132', '132', 'Bubbly Water Energy')], [single(7, 'Bubbly [W] Energy', null), single(8, 'Bubbly [W] Energy', null)]);
  assert.deepEqual(two.cards[0].ids.cardmarket, []);
  assert.equal(two.report.totals.ambiguous, 1);
});

test('left right halves by number', () => {
  // Left hat hier die hoehere Produkt-ID: entscheidend ist das Suffix, nicht die ID
  const { cards, report } = run(
    [card('98', '98', 'Legendary Trench'), card('99', '99', 'Legendary Trench')],
    [single(20, 'Legendary Trench [Right]', null), single(21, 'Legendary Trench [Left]', null)],
  );
  assert.deepEqual(cards.map((c) => c.ids.cardmarket), [[21], [20]]);
  assert.deepEqual(cards.map((c) => c.ids.cardmarketSource), ['leftRight', 'leftRight']);
  assert.equal(report.rules.leftRight, 2);
  assert.equal(report.totals.missing, 0);
  // nicht aufeinanderfolgende Nummern -> nichts
  const gap = run([card('98', '98', 'Legendary Trench'), card('100', '100', 'Legendary Trench')], [single(21, 'Legendary Trench [Left]', null), single(20, 'Legendary Trench [Right]', null)]);
  assert.deepEqual(gap.cards.map((c) => c.ids.cardmarket), [[], []]);
  // Produkte mit collectorNumber -> Regel greift nicht
  const numbered = run([card('98', '98', 'Legendary Trench'), card('99', '99', 'Legendary Trench')], [single(21, 'Legendary Trench [Left]', '98'), single(20, 'Legendary Trench [Right]', '199')]);
  assert.deepEqual(numbered.cards[1].ids.cardmarket, []);
  // zweimal [Left] -> nichts
  const twoLeft = run([card('98', '98', 'Legendary Trench'), card('99', '99', 'Legendary Trench')], [single(21, 'Legendary Trench [Left]', null), single(20, 'Legendary Trench [Left]', null)]);
  assert.deepEqual(twoLeft.cards.map((c) => c.ids.cardmarket), [[], []]);
});

test('order heuristic only with equal counts', () => {
  const lantern = () => [card('90', '90', 'Adventure Lantern'), card('126', '126', 'Adventure Lantern')];
  // positiv: 2 Karten <-> 2 Produkte, aufsteigende Nummer <-> aufsteigende Produkt-ID (nicht Listenreihenfolge)
  const ok = run([card('90', '90', 'Adventuring Lantern'), card('126', '126', 'Adventuring Lantern')], [single(918965, 'Adventuring Lantern', null), single(918918, 'Adventuring Lantern', null)]);
  assert.deepEqual(ok.cards.map((c) => c.ids.cardmarket), [[918918], [918965]]);
  assert.deepEqual(ok.cards.map((c) => c.ids.cardmarketSource), ['ordered', 'ordered']);
  assert.equal(ok.report.rules.ordered, 2);
  // negativ: 2 Karten <-> 3 Produkte (z. B. ein unmarkiertes Oversize-Produkt) -> nichts, gemeldet
  const three = run(lantern(), [single(1, 'Adventure Lantern', null), single(2, 'Adventure Lantern', null), single(3, 'Adventure Lantern', null)]);
  assert.deepEqual(three.cards.map((c) => c.ids.cardmarket), [[], []]);
  assert.equal(three.report.rules.ordered, 0);
  assert.equal(three.report.totals.ambiguous, 2);
  // [Oversized] zaehlt nicht mit: 2 <-> 2 + 1 Oversize -> zugeordnet
  const over = run(lantern(), [single(1, 'Adventure Lantern', null), single(2, 'Adventure Lantern', null), single(3, 'Adventure Lantern [Oversized]', null)]);
  assert.deepEqual(over.cards.map((c) => c.ids.cardmarket), [[1], [2]]);
  // Produkte mit collectorNumber -> nie per Reihenfolge
  const numbered = run(lantern(), [single(1, 'Adventure Lantern', '90a'), single(2, 'Adventure Lantern', '126a')]);
  assert.deepEqual(numbered.cards.map((c) => c.ids.cardmarket), [[], []]);
  // eine dritte gleichnamige Karte hat schon eine TCGdex-ID -> Gruppe nicht vollstaendig offen -> nichts
  const claimed = run([...lantern(), card('200', '200', 'Adventure Lantern', [3])], [single(1, 'Adventure Lantern', null), single(2, 'Adventure Lantern', null), single(3, 'Adventure Lantern', null)]);
  assert.deepEqual(claimed.cards.slice(0, 2).map((c) => c.ids.cardmarket), [[], []]);
  // unterschiedliche Produktnamen (Angriffe) -> nie per Reihenfolge
  const attacks = run([withAttacks12(card('1', '1', 'Pikachu'), ['Gnaw']), withAttacks12(card('2', '2', 'Pikachu'), ['Gnaw'])], [single(1, 'Pikachu [Gnaw]', null), single(2, 'Pikachu [Thunder]', null)]);
  assert.deepEqual(attacks.cards.map((c) => c.ids.cardmarket), [[], []]);
  // gleiche Produktnamen, aber Angriffe der Karten passen nicht -> nichts
  const wrongAttacks = run([withAttacks12(card('1', '1', 'Pikachu'), ['Gnaw']), withAttacks12(card('2', '2', 'Pikachu'), ['Thunder'])], [single(1, 'Pikachu [Gnaw]', null), single(2, 'Pikachu [Gnaw]', null)]);
  assert.deepEqual(wrongAttacks.cards.map((c) => c.ids.cardmarket), [[], []]);
});

test('version suffix in collector number stays significant (5241 custom set)', () => {
  const { cards, report } = run(
    [card('4', '4', 'Charmander'), card('5', '5', 'Charmeleon')],
    [single(10, 'Charmander', '4'), single(11, 'Charmander', '4V2'), single(12, 'Charmeleon', '5V2'), single(13, 'Pikachu', '224a')],
  );
  assert.deepEqual(cards[0].ids.cardmarket, [10]);
  assert.deepEqual(cards[1].ids.cardmarket, []); // 5V2 ist nicht 5
  assert.equal(normalizeCmNumber('4V2') === normalizeCmNumber('4'), false);
  assert.equal(normalizeCmNumber('224a') === normalizeCmNumber('224'), false);
  assert.equal(normalizeCmNumber('H1') === normalizeCmNumber('1'), false);
  assert.equal(report.rules.versionSuffixSkipped, 3); // 4V2, 5V2, 224a bleiben ohne Karte
});

// Overrides: Produkt-Existenz ueber productExpansion (Cardmarket-Katalog)
const runOv = (cards, products, overrides) => run(cards, products, {
  overrides, productExpansion: (id) => (products.some((p) => p.cardmarketProductId === id) || id === 918932 ? 100 : null),
});

test('override wins and validates', () => {
  const cards = [
    { ...card('94', '94', 'Legendary Pyroduct', [5]), variants: [{ type: 'normal', cardmarketId: 5 }, { type: 'reverse', stamp: ['x'], cardmarketId: 6 }] },
    card('101', '101', 'Tasty Rice Ball'),
    card('7', '7', 'Pineco'),
  ];
  const products = [single(5, 'Legendary Pyroduct', null), single(918923, 'Legendary Lava Tube [Left]', null), single(70, 'Pineco', '7')];
  const { cards: out, report } = runOv(cards, products, {
    _comment: 'test', 's1/94': 918923, 's1/101': 918932, 's1/7': 4040404, 's1/999': 70, 'xx/1': 70,
  });
  assert.deepEqual(out[0].ids.cardmarket, [918923]); // gewinnt auch gegen die TCGdex-ID
  assert.equal(out[0].ids.cardmarketSource, 'override');
  assert.deepEqual(out[0].ids.cardmarketTcgdex, [5]);
  assert.deepEqual(out[0].variants, [{ type: 'normal' }, { type: 'reverse', stamp: ['x'] }]);
  assert.equal(primaryCardmarketId(out[0]), 918923);
  assert.deepEqual(out[1].ids.cardmarket, [918932]);
  assert.equal(out[1].ids.cardmarketTcgdex, undefined);
  // unbekanntes Produkt -> ignoriert, normale Regeln
  assert.deepEqual(out[2].ids.cardmarket, [70]);
  assert.equal(out[2].ids.cardmarketSource, 'matched');
  assert.equal(report.rules.override, 2);
  assert.equal(report.totals.override, 2);
  assert.equal(report.bySet.s1.override, 2);
  assert.deepEqual(report.overrides.warnings, [
    's1/7: Produkt 4040404 nicht im Cardmarket-Katalog, ignoriert',
    's1/999: Karte nicht gefunden, ignoriert',
    'xx/1: Karte nicht gefunden, ignoriert',
  ]);
  // ohne Produktindex keine Pruefung moeglich -> Zahl-Overrides ignoriert
  const noIndex = run([card('101', '101', 'Tasty Rice Ball')], [], { overrides: { 's1/101': 918932 } });
  assert.deepEqual(noIndex.cards[0].ids.cardmarket, []);
  assert.equal(noIndex.report.overrides.warnings.length, 1);
});

test('override product is not handed out again by the rules', () => {
  const { cards: out } = runOv([card('1', '1', 'Pineco'), card('2', '2', 'Heracross')], [single(70, 'Pineco', '1')], { 's1/2': 70 });
  assert.deepEqual(out[0].ids.cardmarket, []);
  assert.deepEqual(out[1].ids.cardmarket, [70]);
});

test('null override removes id', () => {
  const cards = [{ ...card('3', '3', 'Mewtwo', [5]), variants: [{ type: 'normal', cardmarketId: 5 }] }, card('4', '4', 'Mew')];
  const { cards: out, report } = runOv(cards, [single(5, 'Mewtwo', '3'), single(6, 'Mew', '4')], { 's1/3': null, 's1/4': null });
  assert.deepEqual(out[0].ids.cardmarket, []);
  assert.equal(out[0].ids.cardmarketSource, 'override');
  assert.deepEqual(out[0].ids.cardmarketTcgdex, [5]);
  assert.deepEqual(out[0].variants, [{ type: 'normal' }]);
  assert.equal(primaryCardmarketId(out[0]), undefined);
  assert.deepEqual(out[1].ids.cardmarket, []); // auch keine Lueckenregel
  assert.equal(report.overrides.removed, 2);
  assert.equal(report.stillMissing.length, 0); // bewusst leer, keine Arbeitsliste
});

test('stillMissing worklist with candidates', () => {
  const de = (c, name) => ({ ...c, i18n: { de: { name } } });
  const { report } = run(
    [de(card('94', '94', 'Legendary Pyroduct'), 'Legendäre Lavaröhre'), card('1', '1', 'Pineco')],
    [single(918923, 'Legendary Lava Tube [Left]', null), single(918924, 'Legendary Lava Tube [Right]', null), single(70, 'Pineco', '1'), single(80, 'Heracross', '2')],
  );
  assert.deepEqual(report.stillMissing, [{
    cardKey: 's1/94', name: 'Legendary Pyroduct', deName: 'Legendäre Lavaröhre', set: 's1', expansionId: 100,
    // Left/Right teilen den normalisierten Namen -> Hinweis auf mehrere gleichnamige Produkte ohne Nummer
    candidates: [
      { productId: 918923, name: 'Legendary Lava Tube [Left]', hint: 'same-name-unnumbered' },
      { productId: 918924, name: 'Legendary Lava Tube [Right]', hint: 'same-name-unnumbered' },
    ],
  }]);
  assert.deepEqual(report.stillMissingByExpansion, [{ expansionId: 100, count: 1, sets: ['s1'] }]);
});

// --- Haertung nach Review ---
test('ordered rule checks product id offsets against neighbours', () => {
  // xy10-Form: Nachbarkarten mit bekannter ID, Offset (Produkt-ID - Nummer) passt -> zugeordnet
  const xy = run(
    [card('25', '25', 'Abra', [289851]), card('26', '26', 'M Alakazam-EX'), card('117', '117', 'Kadabra', [289937]), card('118', '118', 'M Alakazam-EX')],
    [single(289851, 'Abra', null), single(289852, 'MAlakazam EX [Zen Force]', null), single(289937, 'Kadabra', null), single(289938, 'MAlakazam EX [Zen Force]', null)],
  );
  assert.deepEqual(xy.cards.map((c) => c.ids.cardmarket), [[289851], [289852], [289937], [289938]]);
  assert.equal(xy.cards[1].ids.cardmarketSource, 'ordered');
  assert.equal(xy.report.rules.orderedRejected, 0);
  // bwp-Form: zweites Produkt ist ein spaeterer Nachdruck (547296), Offset passt nicht zum Nachbarn -> abgelehnt
  const bwp = run(
    [card('1', '1', 'Snivy'), card('2', '2', 'Snivy'), card('3', '3', 'Tepig', [279927])],
    [single(279925, 'Snivy [Slam]', null), single(547296, 'Snivy [Slam]', null), single(279927, 'Tepig [Ember]', null)],
  );
  assert.deepEqual(bwp.cards.slice(0, 2).map((c) => c.ids.cardmarket), [[], []]);
  assert.equal(bwp.report.rules.ordered, 0);
  assert.equal(bwp.report.rules.orderedRejected, 1);
  assert.deepEqual(bwp.report.orderedRejected, [{ expansionId: 100, name: 'Snivy', cards: ['s1/1', 's1/2'], products: [279925, 547296] }]);
  // ohne Nachbarn: Produkt-IDs zu weit auseinander (> 50) -> abgelehnt
  const lonely = run([card('1', '1', 'Snivy'), card('2', '2', 'Snivy')], [single(279925, 'Snivy [Slam]', null), single(547296, 'Snivy [Slam]', null)]);
  assert.deepEqual(lonely.cards.map((c) => c.ids.cardmarket), [[], []]);
  assert.equal(lonely.report.rules.orderedRejected, 1);
  // nummerierte Produkte zaehlen als Nachbarn
  const numbered = run(
    [card('5', '5', 'Lantern'), card('9', '9', 'Lantern')],
    [single(1004, 'Pineco', '4'), single(1005, 'Lantern', null), single(1009, 'Lantern', null), single(1010, 'Heracross', '10')],
  );
  assert.deepEqual(numbered.cards.map((c) => c.ids.cardmarket), [[1005], [1009]]);
  const off = run(
    [card('5', '5', 'Lantern'), card('9', '9', 'Lantern')],
    [single(1004, 'Pineco', '4'), single(1005, 'Lantern', null), single(1030, 'Lantern', null), single(1010, 'Heracross', '10')],
  );
  assert.deepEqual(off.cards.map((c) => c.ids.cardmarket), [[], []]);
});

test('primary id skips jumbo variants unless only jumbo exists', () => {
  const v = (cardmarket, variants) => ({ ids: { cardmarket }, variants });
  // swshp-SWSH139-Form, Jumbo zuerst
  assert.equal(primaryCardmarketId(v([576911, 576738], [{ type: 'holo', size: 'jumbo', cardmarketId: 576911 }, { type: 'holo', cardmarketId: 576738 }])), 576738);
  // gestempelte Normalgroesse vor ungestempeltem Jumbo
  assert.equal(primaryCardmarketId(v([1], [{ type: 'holo', size: 'jumbo', cardmarketId: 9 }, { type: 'normal', stamp: ['x'], cardmarketId: 8 }])), 8);
  // nur Jumbo (mep-Museum, svp-500): bleibt
  assert.equal(primaryCardmarketId(v([865392], [{ type: 'normal', size: 'jumbo', cardmarketId: 865392 }])), 865392);
  // ungestempelter Jumbo vor gestempeltem Jumbo
  assert.equal(primaryCardmarketId(v([1], [{ size: 'jumbo', stamp: ['x'], cardmarketId: 3 }, { size: 'jumbo', cardmarketId: 4 }])), 4);
});

test('override warnings for suspicious products', () => {
  const products100 = [single(70, 'Pineco', '1'), single(71, 'Heracross', '2')];
  const products200 = [single(80, 'Pikachu V-UNION [Oversized]', null), { ...single(81, 'Booster', null), categoryId: 52, categoryName: 'Pokémon Booster' }];
  const cardsBySet = new Map([['s1', [card('1', '1', 'Pineco'), card('2', '2', 'Heracross', [71]), card('3', '3', 'Pikachu V-UNION'), card('4', '4', 'Booster')]]]);
  const report = fillCardmarketIds({
    sets: [{ id: 's1', ids: { cardmarket: 100 } }],
    cardsBySet,
    productExpansion: (id) => (id >= 80 ? 200 : 100),
    knownExpansions: new Set([100, 200]),
    loadExpansion: (id) => ({ 100: { cards: products100 }, 200: { cards: products200 } })[id] ?? null,
    overrides: { 's1/1': 71, 's1/3': 80, 's1/4': 81, 's1/2': 71 },
  });
  const out = cardsBySet.get('s1');
  // Warnungen, aber uebernommen
  assert.deepEqual(out.map((c) => c.ids.cardmarket), [[71], [71], [80], [81]]);
  assert.deepEqual(report.overrides.warnings, [
    's1/1: Produkt 71 steht mehrfach in den Overrides (s1/1, s1/2) (Warnung, uebernommen)',
    's1/1: Produkt 71 gehoert per TCGdex schon zu s1-2 (Warnung, uebernommen)',
    's1/2: Produkt 71 steht mehrfach in den Overrides (s1/1, s1/2) (Warnung, uebernommen)',
    's1/3: Produkt 80 liegt in Expansion 200, nicht in der des Sets (100) (Warnung, uebernommen)',
    's1/3: Produkt 80 ist ein [Oversized]-Produkt (Warnung, uebernommen)',
    's1/4: Produkt 81 liegt in Expansion 200, nicht in der des Sets (100) (Warnung, uebernommen)',
    's1/4: Produkt 81 ist kein Pokémon-Single (Kategorie 52) (Warnung, uebernommen)',
  ]);
});

test('stillMissing candidates carry oversize/special hints', () => {
  const { report } = run(
    [card('BW1', 'BW1', 'Snivy')],
    [
      single(279920, 'Oshawott', '1'), single(279921, 'Tepig', '2'), single(279922, 'Pansage', '3'), single(279923, 'Pansear', '4'),
      single(279924, 'Panpour', '5'), single(279925, 'Snivy [Slam]', null), single(547296, 'Snivy [Slam]', null),
    ],
  );
  assert.deepEqual(report.stillMissing[0].candidates, [
    { productId: 279925, name: 'Snivy [Slam]', hint: 'same-name-unnumbered' },
    { productId: 547296, name: 'Snivy [Slam]', hint: 'same-name-unnumbered, id-outlier' },
    // BW1 ohne Praefix = "1": Produkt #1 ist als Nummerntreffer Kandidat
    { productId: 279920, name: 'Oshawott' },
  ]);
});

// --- Task A2: custom-sets, Set-Expansion, Stabilitaet ---------------------------------------------
// Nummern auf Cardmarket-Seite kommen nur aus custom-sets (der Feed liefert keine); der Katalog-Loader
// markiert solche Produkte mit customSet: true. Die nummerierten Fixtures oben modellieren diese Expansionen.
const csp = (id, name, collectorNumber) => ({ ...single(id, name, collectorNumber), customSet: true });
// Katalog-Lauf: productExpansion/knownExpansions wie im Build (Produkt-Existenz = Katalog).
const runCat = (cards, expansions, extra = {}) => {
  const { sets = [{ id: 's1', ids: { cardmarket: 100 } }], ...rest } = extra;
  const cardsBySet = new Map([['s1', cards]]);
  const productExp = new Map();
  for (const [e, products] of Object.entries(expansions)) for (const p of products) productExp.set(p.cardmarketProductId, Number(e));
  const report = fillCardmarketIds({
    sets,
    cardsBySet,
    knownExpansions: new Set(Object.keys(expansions).map(Number)),
    productExpansion: (id) => productExp.get(id) ?? null,
    loadExpansion: (id) => (expansions[id] ? { expansionId: id, cards: expansions[id] } : null),
    ...rest,
  });
  return { cards: cardsBySet.get('s1'), report, sets };
};

test('custom-set suffix never matches base card', () => {
  // Nur 4V2 bekannt -> Karte 4 bekommt nichts (auch nicht per Name); 224a ist nie 224, H1 nie 1
  const only = runCat([card('4', '4', 'Pikachu'), card('224', '224', 'Mew'), card('1', '1', 'Ampharos')], {
    100: [csp(11, 'Pikachu [Scrappy Spark]', '4V2'), csp(12, 'Mew [Lot]', '224a'), csp(13, 'Ampharos', 'H1')],
  });
  assert.deepEqual(only.cards.map((c) => c.ids.cardmarket), [[], [], []]);
  // Basisnummer vorhanden -> die normale Karte bekommt genau diese, nie die Variante
  const both = runCat([card('4', '4', 'Pikachu'), card('H1', 'H1', 'Ampharos')], {
    100: [csp(11, 'Pikachu [Scrappy Spark]', '4V2'), csp(10, 'Pikachu [Scrappy Spark]', '4'), csp(13, 'Ampharos', 'H1')],
  });
  assert.deepEqual(both.cards[0].ids.cardmarket, [10]);
  assert.equal(both.cards[0].ids.cardmarketSource, 'custom-set');
  assert.deepEqual(both.cards[1].ids.cardmarket, [13]);
  assert.equal(both.report.totals.customSet, 2);
  // zwei Produkte mit derselben Basisnummer (1536 #1) -> custom-set entscheidet nicht
  const dup = runCat([card('1', '1', 'Alakazam', [20])], { 100: [csp(20, 'Alakazam', '1'), csp(21, 'Alakazam', '1')] });
  assert.deepEqual(dup.cards[0].ids.cardmarket, [20]);
  assert.equal(dup.cards[0].ids.cardmarketSource, undefined);
  assert.deepEqual(dup.report.customSets.ambiguous, ['s1/1']);
});

test('Promo-Sets: einheitliches Praefix ("BW01") passt zur custom-set-Nummer ohne Setcode ("1"); gemischte Sets bleiben exakt', () => {
  assert.equal(commonNumberPrefix([{ number: 'BW01' }, { number: 'BW101' }]), 'bw');
  assert.equal(commonNumberPrefix([{ number: '1' }, { number: 'H1' }]), null);
  assert.equal(commonNumberPrefix([{ number: 'TG01' }, { number: '001' }]), null);
  const promo = [card('BW29', 'BW29', 'Victory Cup'), card('BW30', 'BW30', 'Victory Cup'), card('BW1', 'BW01', 'Snivy')];
  const { cards: out } = runCat(promo, {
    100: [csp(52, 'Victory Cup', '29'), csp(47, 'Victory Cup', '30'), csp(25, 'Snivy', '1'), csp(296, 'Snivy', '1V2')],
  });
  assert.deepEqual(out.map((c) => [c.cardId, c.ids.cardmarket, c.ids.cardmarketSource]), [
    ['BW29', [52], 'custom-set'], ['BW30', [47], 'custom-set'], ['BW1', [25], 'custom-set'],
  ]);
  // Skyridge-Form: "H1" darf nicht auf Produkt "1" fallen
  const mixed = [card('1', '1', 'Alakazam'), card('H1', 'H1', 'Alakazam')];
  const { cards: m } = runCat(mixed, { 100: [csp(1, 'Alakazam', '1'), csp(2, 'Alakazam', 'H1')] });
  assert.deepEqual(m.map((c) => c.ids.cardmarket), [[1], [2]]);
});

test('custom-set beats tcgdex id', () => {
  // ecard2-Form: TCGdex vertauscht Karte 1 und H1 (gleicher Name)
  const cards = [
    { ...card('1', '1', 'Ampharos', [20]), variants: [{ type: 'normal', cardmarketId: 20 }, { type: 'reverse', cardmarketId: 20 }] },
    { ...card('H1', 'H1', 'Ampharos', [10]), variants: [{ type: 'holo', cardmarketId: 10 }] },
    // svp-101-Form: beide IDs sind Drucke derselben Nummer (101, 101V2) -> Varianten bleiben, Basis vorn
    { ...card('101', '101', 'Pikachu', [31, 30]), variants: [{ type: 'normal', stamp: ['a'], cardmarketId: 31 }, { type: 'normal', stamp: ['b'], cardmarketId: 30 }] },
  ];
  const { cards: out, report } = runCat(cards, {
    100: [csp(10, 'Ampharos [Thundershock]', '1'), csp(20, 'Ampharos [Thundershock]', 'H1'), csp(30, 'Pikachu', '101'), csp(31, 'Pikachu', '101V2')],
  });
  assert.deepEqual(out[0].ids.cardmarket, [10]);
  assert.equal(out[0].ids.cardmarketSource, 'custom-set');
  assert.deepEqual(out[0].ids.cardmarketTcgdex, [20]);
  assert.deepEqual(out[0].variants.map((v) => v.cardmarketId), [10, 10]);
  assert.equal(primaryCardmarketId(out[0]), 10);
  assert.deepEqual(out[1].ids.cardmarket, [20]);
  assert.equal(primaryCardmarketId(out[1]), 20);
  assert.deepEqual(out[2].ids.cardmarket, [30, 31]);
  assert.deepEqual(out[2].variants.map((v) => v.cardmarketId), [31, 30]);
  assert.deepEqual(report.duplicateTcgdexIds, {}); // custom-set-Karten sind fuer die TCGdex-Stufe gesperrt
  assert.equal(report.totals.customSet, 3);
  assert.equal(report.totals.tcgdex, 0);
  // Override gewinnt vor custom-set
  const ov = runCat([card('1', '1', 'Ampharos', [20])], { 100: [csp(10, 'Ampharos', '1'), csp(20, 'Ampharos', 'H1')] }, { overrides: { 's1/1': 20 } });
  assert.deepEqual(ov.cards[0].ids.cardmarket, [20]);
  assert.equal(ov.cards[0].ids.cardmarketSource, 'override');
});

test('stability keeps yesterday\'s rule id', () => {
  // gestern eindeutig per Name, heute gibt es ein zweites gleichnamiges Produkt -> mehrdeutig
  const previous = new Map([['s1/5', { ids: [1], source: 'matched' }]]);
  const products = { 100: [single(1, 'Scyther [Slash]', null), single(2, 'Scyther [Agility]', null)] };
  const { cards, report } = runCat([card('5', '5', 'Scyther')], products, { previous });
  assert.deepEqual(cards[0].ids.cardmarket, [1]);
  assert.equal(cards[0].ids.cardmarketSource, 'matched');
  assert.equal(report.totals.stabilityKept, 1);
  assert.equal(report.totals.missing, 0);
  assert.equal(report.totals.ambiguous, 0);
  assert.deepEqual(report.stillMissing, []);
  assert.deepEqual(report.stabilityKept, [{ cardKey: 's1/5', productId: 1, source: 'matched', todayId: null, todaySource: null }]);
  // gestern korrigierte geteilte TCGdex-ID: heute fehlt der Nummernbeleg -> die Korrektur bleibt
  const prevCorr = new Map([['s1/17', { ids: [273814], source: 'corrected', variants: [{ type: 'normal', cardmarketId: 273814 }] }]]);
  const r2 = runCat(shared(), { 100: [single(273798, 'Clefable [Metronome | Minimize]', null), single(273814, 'Clefable [Metronome | Minimize]', null)] }, { previous: prevCorr });
  assert.deepEqual(r2.cards[1].ids.cardmarket, [273814]);
  assert.equal(r2.cards[1].ids.cardmarketSource, 'corrected');
  assert.deepEqual(r2.cards[1].variants, [{ type: 'normal', cardmarketId: 273814 }]);
  assert.equal(primaryCardmarketId(r2.cards[1]), 273814);
  assert.deepEqual(r2.cards[0].ids.cardmarket, [273798]);
  // TCGdex aendert die eigene ID -> TCGdex gilt (keine Regel-ID von gestern)
  const r3 = runCat([card('7', '7', 'Pineco', [41])], { 100: [single(40, 'Pineco', null), single(41, 'Pineco [Other]', null)] }, { previous: new Map([['s1/7', { ids: [40], source: 'tcgdex' }]]) });
  assert.deepEqual(r3.cards[0].ids.cardmarket, [41]);
  // custom-set (Stufe 2) entscheidet anders -> custom-set gilt
  const r4 = runCat([card('9', '9', 'Mew')], { 100: [csp(50, 'Mew', '9'), single(51, 'Mew', null)] }, { previous: new Map([['s1/9', { ids: [51], source: 'matched' }]]) });
  assert.deepEqual(r4.cards[0].ids.cardmarket, [50]);
  assert.equal(r4.cards[0].ids.cardmarketSource, 'custom-set');
});


test('stability keeps yesterday’s custom-set id when the custom-set no longer decides', () => {
  // gestern custom-set #4 -> 10; heute ein zweites Produkt mit #4 (z. B. neuer HTML-Import) -> custom-set mehrdeutig
  const previous = new Map([['s1/4', { ids: [10], source: 'custom-set' }]]);
  const { cards, report } = runCat([card('4', '4', 'Pikachu')], { 100: [csp(10, 'Pikachu', '4'), csp(12, 'Pikachu', '4')] }, { previous });
  assert.deepEqual(report.customSets.ambiguous, ['s1/4']);
  assert.deepEqual(cards[0].ids.cardmarket, [10]);
  assert.equal(cards[0].ids.cardmarketSource, 'custom-set');
  assert.equal(report.totals.stabilityKept, 1);
  assert.deepEqual(report.stabilityKept.map((k) => [k.cardKey, k.productId, k.source]), [['s1/4', 10, 'custom-set']]);
  // custom-set entscheidet heute anders -> custom-set gilt (Karte gesperrt)
  const other = runCat([card('4', '4', 'Pikachu')], { 100: [csp(11, 'Pikachu', '4'), single(10, 'Pikachu', null)] }, { previous });
  assert.deepEqual(other.cards[0].ids.cardmarket, [11]);
  assert.equal(other.report.totals.stabilityKept, 0);
  // Produkt verschwunden -> faellt weg
  const gone = runCat([card('4', '4', 'Pikachu')], { 100: [csp(11, 'Pikachu', '4V2')] }, { previous });
  assert.deepEqual(gone.cards[0].ids.cardmarket, []);
  assert.deepEqual(gone.report.stabilityDropped, [{ cardKey: 's1/4', productId: 10, source: 'custom-set', reason: 'product-gone' }]);
});

test('stability drops id whose product vanished', () => {
  const previous = new Map([['s1/5', { ids: [3], source: 'matched' }]]);
  const products = { 100: [single(1, 'Scyther [Slash]', null), single(2, 'Scyther [Agility]', null)] };
  const { cards, report } = runCat([card('5', '5', 'Scyther')], products, { previous });
  assert.deepEqual(cards[0].ids.cardmarket, []);
  assert.equal(report.totals.stabilityKept, 0);
  assert.equal(report.totals.missing, 1);
  assert.deepEqual(report.stabilityDropped, [{ cardKey: 's1/5', productId: 3, source: 'matched', reason: 'product-gone' }]);
  // Override (Stufe 1) von gestern ist kein Stabilitaetsfall
  const ov = runCat([card('5', '5', 'Scyther')], products, { previous: new Map([['s1/5', { ids: [1], source: 'override' }]]) });
  assert.deepEqual(ov.cards[0].ids.cardmarket, []);
});

test('stability does not restore a tcgdex id that todays expansion check dropped', () => {
  const previous = new Map([['s1/2', { ids: [275779], source: 'tcgdex', variants: [{ type: 'normal', cardmarketId: 275779 }] }]]);
  const { cards, report } = runCat([{ ...card('2', '2', "Team Aqua's Crawdaunt", [275779]), variants: [{ type: 'normal', cardmarketId: 275779 }] }], {
    100: [single(275979, "Team Aqua's Crawdaunt", null), single(275991, "Team Aqua's Crawdaunt", null)],
    200: [single(275779, 'Cacturne [Poison Payback | Feint Attack]', '2')],
  }, { previous });
  assert.deepEqual(cards[0].ids.cardmarket, []);
  assert.deepEqual(cards[0].variants, [{ type: 'normal' }]);
  assert.equal(report.totals.stabilityKept, 0);
  assert.deepEqual(report.stabilityKept, []);
});

test('stability checks every previous id for shared tcgdex ids', () => {
  // gestern [10, 20] per TCGdex; heute liefert TCGdex nichts mehr, 20 gehoert aber zwei anderen Karten
  const previous = new Map([['s1/1', { ids: [10, 20], source: 'tcgdex' }]]);
  const { cards, report } = runCat([card('1', '1', 'Mew'), card('2', '2', 'Zed', [20]), card('3', '3', 'Zed', [20])], {
    100: [single(10, 'Other', null), single(20, 'Zed', null)],
  }, { previous });
  assert.deepEqual(cards[0].ids.cardmarket, []);
  assert.deepEqual(report.stabilityDropped, [{ cardKey: 's1/1', productId: 20, source: 'tcgdex', reason: 'shared-tcgdex-id' }]);
  assert.equal(report.totals.stabilityKept, 0);
});

test('expansion by majority', () => {
  // TCGdex liefert keine Set-Expansion (ids.cardmarket null), 4 von 5 Karten-IDs liegen in Expansion 200
  const sets = [{ id: 's1', ids: { cardmarket: null } }];
  const cards = [
    card('1', '1', 'Bagon', [1]), card('2', '2', 'Combusken', [2]), card('3', '3', 'Torchic', [3]), card('4', '4', 'Mudkip', [4]),
    card('5', '5', 'Treecko', [9]), card('6', '6', 'Latias'),
  ];
  const { cards: out, report } = runCat(cards, {
    200: [single(1, 'Bagon', null), single(2, 'Combusken', null), single(3, 'Torchic', null), single(4, 'Mudkip', null), single(6, 'Latias [Mist Ball]', null)],
    300: [single(9, 'Treecko', null)],
  }, { sets });
  assert.equal(sets[0].ids.cardmarket, 200);
  assert.equal(sets[0].ids.cardmarketSetSource, 'derived');
  assert.equal(report.bySet.s1.expansionId, 200);
  assert.deepEqual(out[5].ids.cardmarket, [6]);
  assert.deepEqual(report.setsWithoutExpansion, []);
  // Zuordnungsdatei "<setId>": expansionId gewinnt vor TCGdex und Mehrheit
  const sets2 = [{ id: 's1', ids: { cardmarket: 300 } }];
  const r2 = runCat([card('6', '6', 'Latias')], { 200: [single(6, 'Latias', null)], 300: [] }, { sets: sets2, overrides: { s1: 200 } });
  assert.equal(sets2[0].ids.cardmarket, 200);
  assert.equal(sets2[0].ids.cardmarketSetSource, 'override');
  assert.deepEqual(r2.cards[0].ids.cardmarket, [6]);
  assert.deepEqual(r2.report.overrides.warnings, []);
  // pt-Set ohne TCGdex-IDs: Mehrheit aus den zuletzt veroeffentlichten IDs (previous)
  const sets3 = [{ id: 's1', ids: { cardmarket: null } }];
  const previous = new Map([['s1/1', { ids: [1], source: 'matched' }], ['s1/2', { ids: [2], source: 'matched' }]]);
  const r3 = runCat([card('1', '1', 'Bagon'), card('2', '2', 'Combusken'), card('6', '6', 'Latias')], {
    200: [single(1, 'Bagon', null), single(2, 'Combusken', null), single(6, 'Latias', null)],
  }, { sets: sets3, previous });
  assert.equal(sets3[0].ids.cardmarket, 200);
  assert.deepEqual(r3.cards.map((c) => c.ids.cardmarket), [[1], [2], [6]]);
});

test('no expansion → no ids and flagged', () => {
  // keine Set-Expansion, Karten-IDs uneinig (1/2 < 80 %) -> keine Regel-IDs, Set gemeldet
  const sets = [{ id: 's1', ids: { cardmarket: null } }, { id: 's2', ids: { cardmarket: 200 } }];
  const cardsBySet = new Map([
    ['s1', [card('1', '1', 'Bagon', [1]), card('2', '2', 'Torchic', [9]), card('3', '3', 'Latias')]],
    ['s2', [{ ...card('1', '1', 'Mudkip'), id: 's2-1', setId: 's2' }]],
  ]);
  const productExp = new Map([[1, 200], [6, 200], [7, 200], [9, 300]]);
  const report = fillCardmarketIds({
    sets,
    cardsBySet,
    knownExpansions: new Set([200, 300]),
    productExpansion: (id) => productExp.get(id) ?? null,
    loadExpansion: (id) => ({ 200: { cards: [single(1, 'Bagon', null), single(6, 'Latias', null), single(7, 'Mudkip', null)] }, 300: { cards: [single(9, 'Torchic', null)] } })[id] ?? null,
  });
  const [bagon, torchic, latias] = cardsBySet.get('s1');
  assert.equal(sets[0].ids.cardmarket, null);
  assert.deepEqual(latias.ids.cardmarket, []); // nicht aus irgendeiner Expansion geraten
  assert.deepEqual(bagon.ids.cardmarket, [1]); // TCGdex-IDs bleiben
  assert.deepEqual(torchic.ids.cardmarket, [9]);
  assert.deepEqual(report.setsWithoutExpansion, [{ setId: 's1', tcgdexExpansion: null, evidence: '1/2', evidenceSource: 'tcgdex', cards: 3 }]);
  // anderes Set unberuehrt
  assert.deepEqual(cardsBySet.get('s2')[0].ids.cardmarket, [7]);
});

// --- Fix-Runde 1 ------------------------------------------------------------------------------------
test('stability never restores a shared tcgdex id over today’s correction', () => {
  // dp7-58-Form: Drifloon #58 und SH1 teilen TCGdex-ID 297 (= SH1-Produkt); heute korrigieren die Angriffe #58
  const atk = (c, ...names) => ({ ...c, attacks: names.map((name) => ({ name })) });
  const cards = [atk(card('58', '58', 'Drifloon', [297]), 'Constrict', 'Linear Attack'), atk(card('SH1', 'SH1', 'Drifloon', [297]), 'Unburden', 'Tackle')];
  const previous = new Map([['s1/58', { ids: [297], source: 'tcgdex' }]]);
  const { cards: out, report } = runCat(cards, {
    100: [single(297, 'Drifloon Lv.16 [Unburden | Tackle]', null), single(356, 'Drifloon Lv.15 [Constrict | Linear Attack]', null)],
  }, { previous });
  assert.deepEqual(out[0].ids.cardmarket, [356]);
  assert.equal(out[0].ids.cardmarketSource, 'corrected');
  assert.deepEqual(report.stabilityKept, []);
  // heute ohne jede ID, gestrige TCGdex-ID ist heute geteilt -> nicht zurueck
  const r2 = runCat([card('58', '58', 'Drifloon', [297]), card('SH1', 'SH1', 'Drifloon', [297])], {
    100: [single(297, 'Drifloon Lv.16 [Unburden | Tackle]', null)],
  }, { previous: new Map([['s1/58', { ids: [297], source: 'tcgdex' }]]) });
  assert.deepEqual(r2.report.stabilityKept, []);
});

test('custom-set: stamped variant never holds the base product when a normal print exists', () => {
  // svp-190-Form: TCGdex normal -> 190V2, worlds-Stempel -> 190 (Basis)
  const c = { ...card('190', '190', 'Pikachu', [80, 84]), variants: [{ type: 'normal', cardmarketId: 84 }, { type: 'normal', stamp: ['worlds-2024'], cardmarketId: 80 }] };
  const { cards: out } = runCat([c], { 100: [csp(80, 'Pikachu', '190'), csp(84, 'Pikachu', '190V2')] });
  assert.deepEqual(out[0].variants, [{ type: 'normal', cardmarketId: 80 }, { type: 'normal', stamp: ['worlds-2024'] }]);
  assert.equal(primaryCardmarketId(out[0]), 80);
  assert.deepEqual(out[0].ids.cardmarket, [80, 84]);
  // nur gestempelte Drucke (svp-101-Form): kein normaler Druck, dem das Basisprodukt gehoerte -> bleibt
  const s = { ...card('101', '101', 'Pikachu', [31, 30]), variants: [{ type: 'normal', stamp: ['a'], cardmarketId: 31 }, { type: 'normal', stamp: ['b'], cardmarketId: 30 }] };
  const r2 = runCat([s], { 100: [csp(30, 'Pikachu', '101'), csp(31, 'Pikachu', '101V2')] });
  assert.deepEqual(r2.cards[0].variants.map((v) => v.cardmarketId), [31, 30]);
});

test('custom-set contradiction drops tcgdex id even when custom-set leaves the card ambiguous', () => {
  // ecard1-47-Form: zwei Produkte "47" (keine Entscheidung), TCGdex-ID 12 ist laut custom-set #12
  const cards = [
    { ...card('47', '47', 'Feraligatr', [12]), variants: [{ type: 'normal', cardmarketId: 12 }] },
    card('12', '12', 'Feraligatr', [12]),
  ];
  const previous = new Map([['s1/47', { ids: [12], source: 'tcgdex' }]]);
  const { cards: out, report } = runCat(cards, {
    100: [csp(12, 'Feraligatr', '12'), csp(470, 'Feraligatr', '47'), csp(471, 'Feraligatr', '47')],
  }, { previous });
  assert.deepEqual(out[0].ids.cardmarket, []);
  assert.deepEqual(out[0].ids.cardmarketTcgdex, [12]);
  assert.deepEqual(out[0].variants, [{ type: 'normal' }]);
  assert.deepEqual(out[1].ids.cardmarket, [12]);
  assert.deepEqual(report.customSets.ambiguous, ['s1/47']);
  assert.deepEqual(report.customSets.dropped, [{ cardKey: 's1/47', productId: 12, number: '12' }]);
  assert.deepEqual(report.stabilityKept, []); // Stufe 2 hat entschieden
  assert.deepEqual(report.stabilityDropped, [{ cardKey: 's1/47', productId: 12, source: 'tcgdex', reason: 'custom-set' }]);
  assert.deepEqual(report.duplicateTcgdexIds, {});
  // Nummer der Karte steht nicht im custom-set (svp-500 vs. Lot-Nummer 224e) -> custom-set sagt nichts, ID bleibt
  const lot = runCat([card('500', '500', 'Terapagos & Friends', [9])], { 100: [csp(9, 'Terapagos & Friends', '224e'), csp(8, 'Mew', '224')] });
  assert.deepEqual(lot.cards[0].ids.cardmarket, [9]);
  assert.deepEqual(lot.report.customSets.dropped, []);
});

test('name-only rules need unique evidence (SIR/alt-art without numbers)', () => {
  const atk = (c, ...names) => ({ ...c, attacks: names.map((name) => ({ name })) });
  const pair = () => [atk(card('25', '25', 'Pikachu ex'), 'Thunder'), atk(card('230', '230', 'Pikachu ex'), 'Thunder')];
  // a) mehr gleichnamige Produkte als Karten -> nichts
  const a = runCat(pair(), { 100: [single(1000, 'Pikachu ex [Thunder]', null), single(1300, 'Pikachu ex [Thunder]', null), single(1301, 'Pikachu ex [Thunder]', null)] });
  assert.deepEqual(a.cards.map((c) => c.ids.cardmarket), [[], []]);
  assert.equal(a.report.totals.ambiguous, 2);
  // b) gleiche Anzahl, keine Nachbarn, IDs weit auseinander (Sonderdruck spaeter angelegt) -> abgelehnt
  const b = runCat(pair(), { 100: [single(1000, 'Pikachu ex [Thunder]', null), single(1300, 'Pikachu ex [Thunder]', null)] });
  assert.deepEqual(b.cards.map((c) => c.ids.cardmarket), [[], []]);
  assert.equal(b.report.orderedRejected.length, 1);
  // c) gleiche Anzahl, IDs nah, aber Nachbar-Offset passt nicht zur SIR-Nummer -> abgelehnt
  const c = runCat([...pair(), card('24', '24', 'Raichu', [999])], {
    100: [single(1000, 'Pikachu ex [Thunder]', null), single(1010, 'Pikachu ex [Thunder]', null), single(999, 'Raichu', null)],
  });
  assert.deepEqual(c.cards.slice(0, 2).map((x) => x.ids.cardmarket), [[], []]);
  assert.equal(c.report.orderedRejected.length, 1);
  // d) eindeutige Angriffsnamen sind Evidenz -> zugeordnet
  const d = runCat([atk(card('25', '25', 'Pikachu ex'), 'Thunder'), atk(card('230', '230', 'Pikachu ex'), 'Thunderbolt')], {
    100: [single(1000, 'Pikachu ex [Thunder]', null), single(1300, 'Pikachu ex [Thunderbolt]', null)],
  });
  assert.deepEqual(d.cards.map((x) => x.ids.cardmarket), [[1000], [1300]]);
});

test('Report je Set: coverage {cards, withId, bySource} und searchUrl', () => {
  const { report } = run(
    [card('1', '1', 'Pineco'), card('2', '2', 'Heracross'), card('3', '3', 'Unbekannt')],
    [single(11, 'Pineco', '1'), single(12, 'Heracross', '2')],
  );
  const row = report.bySet.s1;
  assert.equal(row.expansionId, 100);
  assert.equal(row.coverage.cards, 3);
  assert.equal(row.coverage.withId, 2);
  assert.equal(row.coverage.bySource.matched, 2);
  assert.equal(row.searchUrl, 'https://www.cardmarket.com/en/Pokemon/Products/Search?searchMode=v2&idCategory=51&idExpansion=100&sortBy=collectorsnumber_asc&perSite=100&site=1');
});

test('Report je Set: ohne Expansion keine searchUrl', () => {
  const cardsBySet = new Map([['s2', [card('1', '1', 'X')]]]);
  const report = fillCardmarketIds({ sets: [{ id: 's2', ids: {} }], cardsBySet, loadExpansion: () => null });
  assert.equal(report.bySet.s2.searchUrl, null);
  assert.equal(report.bySet.s2.coverage.withId, 0);
});

test('Override mit Produkt nicht im Katalog: strukturierte problems neben der Textwarnung', () => {
  const { report } = run([card('1', '1', 'Pineco')], [single(11, 'Pineco', '1')], {
    overrides: { 's1/1': 999 }, productExpansion: () => null, knownExpansions: new Set([100]),
  });
  assert.deepEqual(report.overrides.problems, [{ kind: 'missing-product', key: 's1/1', productId: 999 }]);
  assert.ok(report.overrides.warnings.some((w) => w.includes('nicht im Cardmarket-Katalog')));
});

test('Override mit Expansion nicht im Katalog: problems missing-expansion', () => {
  const { report } = run([card('1', '1', 'Pineco')], [single(11, 'Pineco', '1')], {
    overrides: { s1: 555 }, knownExpansions: new Set([100]),
  });
  assert.deepEqual(report.overrides.problems, [{ kind: 'missing-expansion', key: 's1', expansionId: 555 }]);
});
