import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCmNumber, normalizeCmName, fillCardmarketIds } from '../merge/cardmarket-ids.mjs';

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
