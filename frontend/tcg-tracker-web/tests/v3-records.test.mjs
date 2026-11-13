import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { toSetRecord, toCardRecord, primaryCardmarketProductId } from '../js/data/v3-records.js';
import {
  buildSetRecordFromSources,
  buildCardRecordFromSources,
  resolveDisplayCard,
  resolveDisplaySet,
  SET_DB_HEADERS,
  CARD_DB_HEADERS
} from '../js/data/schema-contract.js';

const API = fileURLToPath(new URL('../../../api/v3/', import.meta.url));
const readJson = (rel) => JSON.parse(readFileSync(API + rel, 'utf8'));
const SETS = readJson('sets.json');
const setById = (id) => SETS.find((s) => s.id === id);
const card = (file, id) => {
  const c = Object.values(readJson(`cards/${file}.json`)).find((x) => x.id === id);
  assert.ok(c, `card ${id} missing`);
  return c;
};

test('Record-Felder decken alle Sheets-Header und alle Felder der alten Builder ab', () => {
  const s = toSetRecord(setById('sv3pt5'));
  for (const h of SET_DB_HEADERS) assert.ok(h in s, `set header ${h}`);
  const oldSet = buildSetRecordFromSources({ setId: 'x' });
  for (const k of Object.keys(oldSet)) assert.ok(k in s, `old set field ${k}`);
  const c = toCardRecord(card('sv3pt5', 'sv3pt5-6'), setById('sv3pt5'));
  for (const h of CARD_DB_HEADERS) assert.ok(h in c, `card header ${h}`);
  const oldCard = buildCardRecordFromSources({ setId: 'x' });
  for (const k of Object.keys(oldCard)) assert.ok(k in c, `old card field ${k}`);
  assert.ok('collectionKey' in c && 'number' in c);
});

test('Set sv3pt5: matched, EN vera, DE tcgdex', () => {
  const r = toSetRecord(setById('sv3pt5'), { imported: true });
  assert.equal(r.setId, 'sv3pt5');
  assert.equal(r.imported, true);
  assert.equal(r.matchStatus, 'matched');
  assert.equal(r.isTcgdexOnly, false);
  assert.equal(r.vera_id, 'sv3pt5');
  assert.equal(r.vera_name, '151');
  assert.equal(r.vera_series, 'Scarlet & Violet');
  assert.equal(r.vera_printedTotal, 165);
  assert.equal(r.vera_total, 207);
  assert.equal(r.vera_ptcgoCode, 'MEW');
  assert.equal(r.vera_releaseDate, '2023/09/22');
  assert.match(r.vera_images_logo, /\/en\/sv\/sv03\.5\/logo\.webp$/);
  assert.match(r.vera_images_symbol, /symbol\.webp$/);
  assert.equal(r.tcgdex_id, 'sv03.5');
  assert.equal(r.tcgdex_name, '151');
  assert.match(r.tcgdex_logo, /\/de\/sv\/sv03\.5\/logo\.webp$/);
  assert.equal(r.tcgdex_symbol, '');
  assert.equal(r.tcgdex_serie_name, 'Karmesin & Purpur');
  assert.equal(r.tcgdex_cardCount_official, 165);
  assert.equal(r.tcgdex_cardCount_total, 207);
  assert.equal(r.tcgdex_legal, null);
  assert.ok(!Number.isNaN(Date.parse(r.updatedAt)));
});

test('Set TCGDEX-A1: tcgdex_only, kein vera_id', () => {
  const r = toSetRecord(setById('TCGDEX-A1'));
  assert.equal(r.matchStatus, 'tcgdex_only');
  assert.equal(r.isTcgdexOnly, true);
  assert.equal(r.vera_id, '');
  assert.equal(r.vera_name, 'Genetic Apex');
  assert.equal(r.tcgdex_id, 'A1');
  assert.equal(r.tcgdex_name, 'Unschlagbare Gene');
  assert.equal(r.tcgdex_logo, '');
  assert.equal(r.imported, false);
});

test('Set ohne tcgdex-ID: primary_only', () => {
  const r = toSetRecord({ id: 'zz', name: 'Z', ids: { pokemontcg: 'zz', tcgdex: null } }, {});
  assert.equal(r.matchStatus, 'primary_only');
  assert.equal(r.tcgdex_id, '');
  assert.equal(r.tcgdex_name, '');
});

test('Karte sv3pt5-6: matched, DE-Name Glurak-ex', () => {
  const r = toCardRecord(card('sv3pt5', 'sv3pt5-6'), setById('sv3pt5'));
  assert.equal(r.setId, 'sv3pt5');
  assert.equal(r.cardId, 'sv3pt5-6');
  assert.equal(r.collectionKey, '6');
  assert.equal(r.number, '6');
  assert.equal(r.matchStatus, 'matched');
  assert.equal(r.isPrimaryOnly, false);
  assert.equal(r.isTcgdexOnly, false);
  assert.equal(r.vera_id, 'sv3pt5-6');
  assert.equal(r.vera_name, 'Charizard ex');
  assert.equal(r.vera_number, '6');
  assert.equal(r.vera_hp, '330');
  assert.equal(r.vera_rarity, 'Double Rare');
  assert.equal(r.vera_regulationMark, 'G');
  assert.equal(r.vera_evolvesFrom, 'Charmeleon');
  assert.deepEqual(r.vera_types, ['Fire']);
  assert.deepEqual(r.vera_legalities, { expanded: 'Legal', unlimited: 'Legal' });
  assert.equal(r.vera_attacks.length, 2);
  assert.equal(r.vera_rules.length, 1);
  assert.equal(r.vera_images_small, 'https://assets.tcgdex.net/en/sv/sv03.5/006/low.webp');
  assert.equal(r.vera_cardmarket_url, 'https://www.cardmarket.com/de/Pokemon/Products?idProduct=733601');
  assert.equal(r.tcgdex_id, 'sv03.5-006');
  assert.equal(r.tcgdex_localId, '006');
  assert.equal(r.tcgdex_name, 'Glurak-ex');
  assert.equal(r.tcgdex_evolvesFrom, 'Glutexo');
  assert.equal(r.tcgdex_image_small, 'https://assets.tcgdex.net/de/sv/sv03.5/006/low.webp');
  assert.equal(r.tcgdex_image_large, 'https://assets.tcgdex.net/de/sv/sv03.5/006/high.webp');
  assert.equal(r.tcgdex_description, '');
  const d = resolveDisplayCard(r);
  assert.equal(d.name, 'Glurak-ex');
  assert.match(d.image, /\/de\//);
});

test('Karte svp-166: tcgdex_only', () => {
  const v3 = card('svp', 'svp-166');
  const r = toCardRecord(v3, setById('svp'));
  assert.equal(r.matchStatus, 'tcgdex_only');
  assert.equal(r.isTcgdexOnly, true);
  assert.equal(r.isPrimaryOnly, false);
  assert.equal(r.cardId, 'svp-166');
  assert.equal(r.vera_id, '');
  assert.equal(r.tcgdex_id, 'svp-166');
  assert.equal(r.tcgdex_localId, '166');
  assert.equal(r.vera_name, v3.name);
});

test('swsh12pt5 GG-Karte: Nummer GG01, localId GG01', () => {
  const v3 = card('swsh12pt5', 'swsh12pt5-GG1');
  const r = toCardRecord(v3, setById('swsh12pt5'));
  assert.equal(r.cardId, 'swsh12pt5-GG1');
  assert.equal(r.collectionKey, 'GG1');
  assert.equal(r.number, 'GG01');
  assert.equal(r.vera_number, 'GG01');
  assert.equal(r.tcgdex_localId, 'GG01');
  assert.equal(r.tcgdex_id, 'swsh12.5gg-GG01');
});

test('cel25c 15_A1: collectionKey 15_A1, number 15, localId CC003', () => {
  const r = toCardRecord(card('cel25c', 'cel25c-15_A1'), setById('cel25'));
  assert.equal(r.collectionKey, '15_A1');
  assert.equal(r.number, '15');
  assert.equal(r.tcgdex_localId, 'CC003');
  assert.equal(r.setId, 'cel25c');
});

test('localId: Teil nach letztem Bindestrich, URL-dekodiert', () => {
  const base = { id: 'x-1', cardId: '1', number: '1', name: 'N', ids: { tcgdex: 'a-b-%C3%A9%2F1' } };
  assert.equal(toCardRecord(base, { id: 'x' }).tcgdex_localId, 'é/1');
  assert.equal(toCardRecord({ ...base, ids: { tcgdex: 'abc' } }, { id: 'x' }).tcgdex_localId, 'abc');
  assert.equal(toCardRecord({ ...base, ids: { tcgdex: null } }, { id: 'x' }).tcgdex_localId, '');
});

test('TCGDEX-A1 Karte 1: Pocket', () => {
  const v3 = card('TCGDEX-A1', 'TCGDEX-A1-1');
  const r = toCardRecord(v3, setById('TCGDEX-A1'));
  assert.equal(r.setId, 'TCGDEX-A1');
  assert.equal(r.cardId, 'TCGDEX-A1-1');
  assert.equal(r.collectionKey, '1');
  assert.equal(r.number, '001');
  assert.equal(r.matchStatus, 'tcgdex_only');
  assert.equal(r.vera_name, 'Bulbasaur');
  assert.equal(r.tcgdex_localId, '001');
  assert.ok(r.tcgdex_name);
  assert.notEqual(r.tcgdex_name, r.vera_name);
});

test('Karte ohne Oberfeld-images, aber mit i18n.de.images', () => {
  let found = null;
  for (const f of readdirSync(API + 'cards')) {
    if (!f.startsWith('TCGDEX-tk')) continue;
    const c = Object.values(readJson('cards/' + f)).find((x) => !x.images && x.i18n?.de?.images);
    if (c) { found = c; break; }
  }
  assert.ok(found);
  const r = toCardRecord(found, { id: found.setId });
  assert.equal(r.vera_images_small, '');
  assert.equal(r.vera_images_large, '');
  assert.ok(r.tcgdex_image_small);
  assert.ok(r.tcgdex_image_large);
  const d = resolveDisplayCard(r);
  assert.equal(d.image, r.tcgdex_image_small);
});

test('Kein DE-Wert: tcgdex_* leer, kein EN-Fallback', () => {
  const r = toCardRecord({
    id: 's-1', cardId: '1', number: '1', name: 'EN', ids: { tcgdex: 's-001' },
    images: { small: 'e.png', large: 'E.png' }, evolvesFrom: 'Foo'
  }, { id: 's' });
  assert.equal(r.tcgdex_name, '');
  assert.equal(r.tcgdex_image_small, '');
  assert.equal(r.tcgdex_image_large, '');
  assert.equal(r.tcgdex_evolvesFrom, '');
  assert.equal(r.vera_images_small, 'e.png');
  assert.equal(resolveDisplayCard(r).name, 'EN');
});

test('resolveDisplaySet nutzt gemappten Satz', () => {
  const d = resolveDisplaySet(toSetRecord(setById('sv3pt5')));
  assert.equal(d.setName, "151");
  assert.equal(d.ptcgoCode, "MEW");
  assert.ok(d.logoUrl);
});

test('i18n_de: Passthrough auf Karten/Sets, kein Sheet-Header, ueber resolveDisplayCard sichtbar', () => {
  const v3 = card('sv3pt5', 'sv3pt5-6');
  const r = toCardRecord(v3, setById('sv3pt5'));
  assert.deepEqual(r.i18n_de, v3.i18n.de);
  assert.equal(r.i18n_de.attacks.length, 2);
  assert.equal(r.tcgdex_description, '');
  assert.deepEqual(resolveDisplayCard(r).i18n_de, v3.i18n.de);
  assert.ok(!CARD_DB_HEADERS.includes('i18n_de'));
  assert.ok(!SET_DB_HEADERS.includes('i18n_de'));
  assert.equal(toCardRecord({ id: 'a-1', cardId: '1', ids: {} }, { id: 'a' }).i18n_de, null);
  assert.deepEqual(toSetRecord(setById('sv3pt5')).i18n_de, setById('sv3pt5').i18n.de);
  assert.equal(toSetRecord({ id: 'q', ids: {} }).i18n_de, null);
});

test('setId: Karten-setId ist massgeblich, Mismatch wird nicht eingemischt', () => {
  const c = card('sv3pt5', 'sv3pt5-6');
  assert.equal(toCardRecord(c, setById('svp')).setId, 'sv3pt5');
  assert.equal(toCardRecord({ ...c, setId: undefined }, setById('svp')).setId, 'svp');
});

test('Set matchStatus: explizites v3-Feld hat Vorrang', () => {
  assert.equal(toSetRecord({ id: 'a', matchStatus: 'primary_only', ids: { pokemontcg: 'a', tcgdex: 'b' } }).matchStatus, 'primary_only');
});

test('localId: Set-Praefix wird abgeschnitten, Rest darf Bindestriche enthalten', () => {
  const c = { id: 'x-1', cardId: '1', number: '1', setId: 'x', ids: { tcgdex: 'my-set-A-1' } };
  assert.equal(toCardRecord(c, { id: 'x', ids: { tcgdex: 'my-set' } }).tcgdex_localId, 'A-1');
  assert.equal(toCardRecord(c, { id: 'x', ids: { tcgdex: 'other' } }).tcgdex_localId, '1');
  assert.equal(toCardRecord(c, { id: 'y', ids: { tcgdex: 'my-set' } }).tcgdex_localId, '1');
});

test('Primaere Produkt-ID: erste ungestempelte Variante, sonst erste Variante, sonst ids.cardmarket[0]', () => {
  const base = { id: 'x-1', cardId: '1', number: '1', setId: 'x' };
  const rec = (variants, ids) => toCardRecord({ ...base, variants, ids: { cardmarket: ids } }).cardmarketProductId;
  // gestempelte Variante vorn (Pre-Release/Set-Logo) -> erste ungestempelte
  assert.equal(rec([{ type: 'normal', stamp: ['pre-release'], cardmarketId: 7 }, { type: 'holo', cardmarketId: 8 }], [8, 7]), 8);
  // leeres stamp-Array zaehlt als ungestempelt
  assert.equal(rec([{ type: 'normal', stamp: ['set-logo'], cardmarketId: 7 }, { type: 'holo', stamp: [], cardmarketId: 9 }], [9]), 9);
  // nur gestempelte Varianten -> erste davon (z. B. me55-150 30th-anniversary)
  assert.equal(rec([{ type: 'holo', stamp: ['30th-anniversary'], cardmarketId: 5 }, { type: 'holo', stamp: ['staff'], cardmarketId: 6 }], [6]), 5);
  // ungestempelte Variante ohne ID wird uebersprungen
  assert.equal(rec([{ type: 'normal' }, { type: 'holo', stamp: ['staff'], cardmarketId: 4 }], [3]), 4);
  // reale Faelle (pre-release / set-logo vorn)
  const real = (setId, id) => toCardRecord(card(setId, id), setById(setId)).cardmarketProductId;
  assert.equal(real('sv3', 'sv3-72'), 725152);
  assert.equal(real('sv3', 'sv3-85'), 725165);
  assert.equal(real('swsh11', 'swsh11-76'), 670814);
  assert.equal(real('swsh12', 'swsh12-131'), 682178);
  assert.equal(real('me55', 'me55-150'), 907757);
  assert.equal(primaryCardmarketProductId({}), null);
});

test('Cardmarket-URL wie der API-Suchindex (cm): erste Variante mit cardmarketId, sonst ids.cardmarket[0], sonst leer', () => {
  const url = (id) => `https://www.cardmarket.com/de/Pokemon/Products?idProduct=${id}`;
  const base = { id: 'x-1', cardId: '1', number: '1', setId: 'x' };
  const both = toCardRecord({ ...base, variants: [{ type: 'normal', cardmarketId: 11 }, { type: 'holo', stamp: ['1st-edition'], cardmarketId: 12 }], ids: { cardmarket: [99] } });
  assert.equal(both.vera_cardmarket_url, url(11));
  assert.equal(both.cardmarketProductId, 11);
  // realer Fall: sv3pt5-1 ids.cardmarket [720365 (Set-Logo-Stempel, ohne Nummer), 733596 (#001), ...];
  // die normale Variante (und search-index cm) zeigt auf 733596.
  assert.equal(toCardRecord(card('sv3pt5', 'sv3pt5-1'), setById('sv3pt5')).cardmarketProductId, 733596);
  // korrigierte Karte: Varianten tragen die Korrektur, beide Regeln liefern dieselbe ID
  assert.equal(toCardRecord(card('me55', 'me55-150'), setById('me55')).cardmarketProductId, 907757);
  // Varianten-IDs bleiben erhalten (Stempel/Sondervarianten koennen eigene Produkte haben)
  assert.deepEqual(both.cardmarketVariants.map((v) => v.cardmarketId), [11, 12]);
  assert.deepEqual(both.cardmarketVariants[1].stamp, ['1st-edition']);
  assert.equal(toCardRecord({ ...base }).cardmarketProductId, null);
  assert.equal(toCardRecord({ ...base, variants: [{ type: 'normal' }, { type: 'reverse', cardmarketId: 22 }] }).vera_cardmarket_url, url(22));
  assert.equal(toCardRecord({ ...base, variants: [{ type: 'normal' }], ids: { cardmarket: [33, 44] } }).vera_cardmarket_url, url(33));
  assert.equal(toCardRecord({ ...base, ids: { cardmarket: 55 } }).vera_cardmarket_url, url(55));
  assert.equal(toCardRecord({ ...base, ids: { cardmarket: [] } }).vera_cardmarket_url, '');
  // realer Fall: base6-75 hat nur ids.cardmarket
  assert.equal(toCardRecord(card('base6', 'base6-75'), setById('base6')).vera_cardmarket_url, url(274840));
});

test('toSetRecord fills DE series and counts', () => {
  const r = toSetRecord(setById('me6'));
  assert.equal(r.tcgdex_serie_name, 'Mega-Entwicklung');
  assert.equal(r.tcgdex_name, 'Delta-Herrschaft');
  assert.equal(r.tcgdex_cardCount_official, 103);
  assert.equal(r.tcgdex_cardCount_total, 141);
});

test('toSetRecord: Fallback auf printedTotal/total und leere DE-Serie ohne i18n.de.series', () => {
  const r = toSetRecord({ id: 'x1', series: 'Foo', printedTotal: 50, total: 60, i18n: { de: { cardCount: { official: 0 } } } });
  assert.equal(r.tcgdex_serie_name, '');
  assert.equal(r.tcgdex_cardCount_official, 50);
  assert.equal(r.tcgdex_cardCount_total, 60);
  const r2 = toSetRecord({ id: 'x2', printedTotal: 7, total: 9 });
  assert.equal(r2.tcgdex_cardCount_official, 7);
  assert.equal(r2.tcgdex_cardCount_total, 9);
});
