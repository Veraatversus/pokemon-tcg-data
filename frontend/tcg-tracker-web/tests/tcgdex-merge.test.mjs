import test from 'node:test';
import assert from 'node:assert/strict';

import { mergeTcgdexSetWithFallback, pickTcgdexCardList } from '../js/pokecode-compat.js';

// Reproduktion des Original-Bugs: preferredSet mit leerem cards-Array
// ueberschrieb das volle fallback.cards-Array via Spread.
test('mergeTcgdexSetWithFallback merged leere preferred.cards mit voller fallback.cards (BUG-FIX)', () => {
  const preferred = {
    id: 'B2',
    name: { de: 'Traumhafte Parade' },
    cards: [], // DE-Locale liefert leere Liste
    cardCount: { official: 155, total: 155 }
  };
  const fallback = {
    id: 'B2',
    name: { en: 'Fantastical Parade' },
    cards: [
      { id: 'B2-1', number: '1', name: { en: 'Card 1' } },
      { id: 'B2-2', number: '2', name: { en: 'Card 2' } }
    ],
    cardCount: { firstEd: 0, holo: 0, normal: 155, official: 155, reverse: 0, total: 155 }
  };

  const merged = mergeTcgdexSetWithFallback(preferred, fallback);

  assert.ok(merged, 'merge darf nicht null sein');
  assert.equal(merged.cards.length, 2, 'leeres preferred.cards muss fallback.cards NICHT ueberschreiben');
  assert.equal(merged.cards[0].id, 'B2-1');
  assert.equal(merged.cards[1].id, 'B2-2');
});

test('mergeTcgdexSetWithFallback bevorzugt preferred-Eintraege bei Konflikt (preferred gewinnt im Duplikat)', () => {
  const preferred = {
    id: 'B2',
    cards: [
      { id: 'B2-1', number: '1', name: { de: 'DE-Name 1' } }
    ]
  };
  const fallback = {
    id: 'B2',
    cards: [
      { id: 'B2-1', number: '1', name: { en: 'EN-Name 1' } },
      { id: 'B2-2', number: '2', name: { en: 'EN-Name 2' } }
    ]
  };

  const merged = mergeTcgdexSetWithFallback(preferred, fallback);

  assert.equal(merged.cards.length, 2, 'Karten-1 (id dedupe) + Karten-2');
  assert.equal(merged.cards[0].id, 'B2-1');
  assert.equal(merged.cards[0].name.de, 'DE-Name 1', 'preferred-Werte gewinnen bei Duplikat-IDs');
  assert.equal(merged.cards[1].id, 'B2-2');
});

test('mergeTcgdexSetWithFallback gibt null zurueck wenn beide Sets fehlen', () => {
  assert.equal(mergeTcgdexSetWithFallback(null, null), null);
  assert.equal(mergeTcgdexSetWithFallback(undefined, undefined), null);
});

test('mergeTcgdexSetWithFallback nutzt preferred wenn nur preferred vorhanden', () => {
  const merged = mergeTcgdexSetWithFallback({ id: 'X', cards: [{ id: 'X-1' }] }, null);
  assert.equal(merged.cards.length, 1);
  assert.equal(merged.cards[0].id, 'X-1');
});

test('mergeTcgdexSetWithFallback nutzt fallback wenn nur fallback vorhanden', () => {
  const merged = mergeTcgdexSetWithFallback(null, { id: 'X', cards: [{ id: 'X-1' }] });
  assert.equal(merged.cards.length, 1);
  assert.equal(merged.cards[0].id, 'X-1');
});

test('mergeTcgdexSetWithFallback deep-mergt cardCount (Object), nicht ueberschreiben', () => {
  const preferred = { id: 'B2', cardCount: { official: 155 } };
  const fallback = { id: 'B2', cardCount: { firstEd: 0, normal: 155, total: 155 } };

  const merged = mergeTcgdexSetWithFallback(preferred, fallback);
  assert.equal(merged.cardCount.official, 155, 'preferred-Wert uebernommen');
  assert.equal(merged.cardCount.firstEd, 0, 'fallback-Wert bleibt erhalten');
  assert.equal(merged.cardCount.normal, 155, 'fallback-Wert bleibt erhalten');
  assert.equal(merged.cardCount.total, 155, 'fallback-Wert bleibt erhalten');
});

test('mergeTcgdexSetWithFallback deep-mergt serie (Object mit id + name)', () => {
  const preferred = { id: 'B2', serie: { name: { de: 'Pocket' } } };
  const fallback = { id: 'B2', serie: { id: 'Pocket', name: { en: 'Pocket Series' } } };

  const merged = mergeTcgdexSetWithFallback(preferred, fallback);
  assert.equal(merged.serie.id, 'Pocket', 'fallback.serie.id');
  assert.equal(merged.serie.name.de, 'Pocket', 'preferred.serie.name.de');
  assert.equal(merged.serie.name.en, 'Pocket Series', 'fallback.serie.name.en');
});

test('mergeTcgdexSetWithFallback uebernimmt logo/symbol vom fallback wenn preferred leer', () => {
  const preferred = { id: 'X', logo: '', symbol: '' };
  const fallback = { id: 'X', logo: 'logo.png', symbol: 'sym.png' };

  const merged = mergeTcgdexSetWithFallback(preferred, fallback);
  assert.equal(merged.logo, 'logo.png');
  assert.equal(merged.symbol, 'sym.png');
});

test('mergeTcgdexSetWithFallback bevorzugt non-empty preferred bei logo/symbol', () => {
  const preferred = { id: 'X', logo: 'p.png', symbol: 'p-sym.png' };
  const fallback = { id: 'X', logo: 'f.png', symbol: 'f-sym.png' };

  const merged = mergeTcgdexSetWithFallback(preferred, fallback);
  assert.equal(merged.logo, 'p.png');
  assert.equal(merged.symbol, 'p-sym.png');
});

test('mergeTcgdexSetWithFallback dedupliziert cards ohne id ueber number-Fallback', () => {
  const preferred = {
    cards: [
      { number: '5', name: 'A' },
      { number: '10', name: 'B' }
    ]
  };
  const fallback = {
    cards: [
      { number: '5', name: 'A-dup' },
      { number: '7', name: 'C' }
    ]
  };

  const merged = mergeTcgdexSetWithFallback(preferred, fallback);
  // 5 (preferred, gewinnt), 10 (preferred), 7 (fallback neu)
  assert.equal(merged.cards.length, 3);
  const numbers = merged.cards.map(c => c.number);
  assert.deepEqual(numbers, ['5', '10', '7']);
  // '5' hat preferred-Name
  assert.equal(merged.cards[0].name, 'A');
});

test('mergeTcgdexSetWithFallback konkateniert auch boosters-Array', () => {
  const preferred = { boosters: [{ id: 'b1' }] };
  const fallback = { boosters: [{ id: 'b2' }, { id: 'b3' }] };

  const merged = mergeTcgdexSetWithFallback(preferred, fallback);
  assert.equal(merged.boosters.length, 3);
});

test('mergeTcgdexSetWithFallback realer TCGDex-DE-vs-EN-Bug-Repro (B2)', () => {
  // Reale Datenstruktur: DE-Locale liefert Metadaten + leere cards,
  // EN-Locale liefert Metadaten + 234 Karten.
  const deDetail = {
    id: 'B2',
    name: { de: 'Traumhafte Parade' },
    cards: [], // DE liefert leere cards (das war der Bug-Auslöser)
    cardCount: { official: 155, total: 155 },
    serie: { id: 'Pocket', name: { de: 'Pokémon-Sammelkartenspiel-Pocket' } },
    legal: { expanded: false, standard: false }
  };
  const enDetail = {
    id: 'B2',
    name: { en: 'Fantastical Parade' },
    cards: Array.from({ length: 234 }, (_, i) => ({ id: `B2-${i+1}`, number: `${i+1}` })),
    cardCount: { firstEd: 0, holo: 0, normal: 155, official: 155, reverse: 0, total: 155 },
    serie: { id: 'Pocket', name: { en: 'Pokémon TCG Pocket' } },
    legal: { expanded: false, standard: false }
  };
  const summary = { id: 'B2', name: { en: 'Fantastical Parade', de: 'Traumhafte Parade' } };

  // Code-Pfad: tcgdexDetailedSet = mergeTcgdexSetWithFallback(preferredDetail, tcgdexSummaryFallback)
  const merged = mergeTcgdexSetWithFallback(deDetail, summary);
  assert.equal(merged.cards.length, 0, 'preferred (DE) cards=[] + summary.cards undefined = []');

  // Aber: tcgdexEnglishDetailedSet = mergeTcgdexSetWithFallback(englishDetail, tcgdexSummaryFallback)
  // Und der Test, der den Bug enthaelt: cards=[] ueberschreibt das fallback-Array.
  // Mit dem Fix sollte cards.length 234 sein.
  const mergedWithEN = mergeTcgdexSetWithFallback(deDetail, enDetail);
  assert.equal(mergedWithEN.cards.length, 234, 'EN-Karten sollen nicht von DE-leeren-Array ueberschrieben werden');
  assert.equal(mergedWithEN.name.de, 'Traumhafte Parade', 'preferred.de-Name behalten');
  assert.equal(mergedWithEN.name.en, 'Fantastical Parade', 'fallback.en-Name gemerged');
});

// pickTcgdexCardList: expliziter Fallback von preferred auf english,
// weil mergeTcgdexSetWithFallback bei leerem preferred+leerem Fallback
// nicht helfen kann.
test('pickTcgdexCardList: bevorzugt preferred.cards wenn nicht leer (echte DE-Karten)', () => {
  const de = { id: 'B2', cards: [{ id: 'B2-1', name: { de: 'Karte 1' } }] };
  const en = { id: 'B2', cards: [{ id: 'B2-1', name: { en: 'Card 1' } }, { id: 'B2-2' }] };
  const cards = pickTcgdexCardList(de, en);
  assert.equal(cards.length, 1, 'nicht-leeres preferred wird genommen');
  assert.equal(cards[0].name.de, 'Karte 1');
});

test('pickTcgdexCardList: faellt auf english zurueck wenn preferred.cards leer (TCGDex-Bug-Fix)', () => {
  const de = { id: 'B2', name: { de: 'Traumhafte Parade' }, cards: [] };
  const en = { id: 'B2', cards: [{ id: 'B2-1' }, { id: 'B2-2' }, { id: 'B2-3' }] };
  const cards = pickTcgdexCardList(de, en);
  assert.equal(cards.length, 3, 'EN-Karten greifen wenn DE leer');
});

test('pickTcgdexCardList: leere Arrays wenn beide Sets keine Karten haben', () => {
  assert.deepEqual(pickTcgdexCardList({ cards: [] }, { cards: [] }), []);
  assert.deepEqual(pickTcgdexCardList(null, null), []);
  assert.deepEqual(pickTcgdexCardList(undefined, undefined), []);
});

test('pickTcgdexCardList: fehlendes cards-Feld wird wie leeres Array behandelt', () => {
  const de = { id: 'B2' };
  const en = { id: 'B2', cards: [{ id: 'X' }] };
  assert.equal(pickTcgdexCardList(de, en).length, 1);
  assert.deepEqual(pickTcgdexCardList({ id: 'X' }, { id: 'Y' }), []);
});

test('pickTcgdexCardList: nur preferred wenn english fehlt', () => {
  const de = { id: 'B2', cards: [{ id: 'B2-1' }] };
  assert.equal(pickTcgdexCardList(de, null).length, 1);
  assert.equal(pickTcgdexCardList(de, undefined).length, 1);
});
