import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCmNumber, normalizeCmName, fillCardmarketIds, primaryCardmarketId } from '../merge/cardmarket-ids.mjs';

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
  assert.deepEqual(report.totals, { cards: 2, tcgdex: 0, matched: 2, missing: 0, ambiguous: 0 });
  assert.deepEqual(report.bySet.s1, { expansionId: 100, cards: 2, tcgdex: 0, matched: 2, missing: 0, ambiguous: 0 });
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
  assert.deepEqual(report.totals, { cards: 1, tcgdex: 1, matched: 0, missing: 0, ambiguous: 0 });
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
  assert.deepEqual(report.bySet.s1, { expansionId: null, cards: 1, tcgdex: 0, matched: 0, missing: 1, ambiguous: 0 });
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
  assert.deepEqual(report.expansionMismatch.sets, [{ setId: 's1', oldId: 275771, newId: 1626, reason: 'derived', evidence: '3/3' }]);
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
  assert.deepEqual(report.expansionMismatch.sets, [{ setId: 's1', oldId: 999, newId: null, reason: 'invalid-kept', evidence: '2/3' }]);
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
