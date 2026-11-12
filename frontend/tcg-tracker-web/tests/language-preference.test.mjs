// Kartensprache (Task 8): DE (Standard) / EN steuert die Resolver-Reihenfolge nur fuer die Anzeige.
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k)
};

const { scopedStorageKey } = await import('../js/core/config.js');
const sc = await import('../js/data/schema-contract.js');
const KEY = scopedStorageKey('user-settings');

function setSettings(obj) {
  if (obj == null) store.delete(KEY); else store.set(KEY, JSON.stringify(obj));
  sc.resetResolverMatrixCache();
}

const card = {
  vera_name: 'Charizard', tcgdex_name: 'Glurak',
  vera_images_small: 'https://en/small.png', tcgdex_image_small: 'https://de/small.png',
  vera_images_large: 'https://en/large.png', tcgdex_image_large: 'https://de/large.png',
  vera_evolvesFrom: 'Charmeleon', tcgdex_evolvesFrom: 'Glutexo',
  vera_flavorText: 'Flies.', vera_rules: ['EN rule'],
  vera_artist: 'Mitsuhiro', vera_rarity: 'Rare',
  i18n_de: { flavorText: 'Fliegt.', rules: ['DE Regel'], attacks: [{ name: 'Feuersturm', text: 'DE' }] }
};

test('Standard (DE) = bisheriges Verhalten: tcgdex zuerst', () => {
  setSettings(null);
  assert.equal(sc.getCardLanguage(), 'de');
  const r = sc.resolveDisplayCard(card);
  assert.equal(r.name, 'Glurak');
  assert.equal(r.image, 'https://de/small.png');
  assert.equal(r.evolvesFrom, 'Glutexo');
  assert.deepEqual(sc.getResolverMatrix().card.name.slice(0, 2), ['tcgdex', 'vera']);
});

test('EN: vera zuerst fuer sprachabhaengige Felder', () => {
  setSettings({ cardLanguage: 'en' });
  const r = sc.resolveDisplayCard(card);
  assert.equal(r.name, 'Charizard');
  assert.equal(r.image, 'https://en/small.png');
  assert.equal(r.imageLarge, 'https://en/large.png');
  assert.equal(r.evolvesFrom, 'Charmeleon');
  assert.equal(r.flavorText, 'Flies.');
  assert.deepEqual(r.rules, ['EN rule']);
  const m = sc.getResolverMatrix();
  assert.equal(m.set.setName[0], 'vera');
  assert.equal(m.set.logoUrl[0], 'vera');
  // sprachneutral unveraendert
  assert.equal(m.card.rarity[0], 'tcgdex');
  assert.equal(m.card.artist[0], 'tcgdex');
});

test('EN: fehlender EN-Wert faellt auf DE zurueck', () => {
  setSettings({ cardLanguage: 'en' });
  const r = sc.resolveDisplayCard({ tcgdex_name: 'Glurak', tcgdex_image_small: 'https://de/small.png' });
  assert.equal(r.name, 'Glurak');
  assert.equal(r.image, 'https://de/small.png');
});

test('DE: fehlender DE-Wert faellt auf EN zurueck', () => {
  setSettings(null);
  const r = sc.resolveDisplayCard({ vera_name: 'Charizard', vera_images_small: 'https://en/small.png' });
  assert.equal(r.name, 'Charizard');
  assert.equal(r.image, 'https://en/small.png');
});

test('DE: flavorText/rules aus i18n_de, EN-Fallback', () => {
  setSettings(null);
  const r = sc.resolveDisplayCard(card);
  assert.equal(r.flavorText, 'Fliegt.');
  assert.deepEqual(r.rules, ['DE Regel']);
  const r2 = sc.resolveDisplayCard({ ...card, i18n_de: null });
  assert.equal(r2.flavorText, 'Flies.');
  assert.deepEqual(r2.rules, ['EN rule']);
});

test('Expert-Modus: gespeicherte Matrix hat Vorrang vor der Sprachwahl', () => {
  setSettings({
    cardLanguage: 'en', expertResolverMode: true,
    resolverMatrix: { card: { name: ['tcgdex', 'vera', 'legacy'] } }
  });
  assert.equal(sc.resolveDisplayCard(card).name, 'Glurak');
});

test('ungueltige Sprache -> de', () => {
  setSettings({ cardLanguage: 'fr' });
  assert.equal(sc.getCardLanguage(), 'de');
});

test('getPreferredCardTexts: DE bevorzugt i18n_de, EN bevorzugt vera_*, jeweils mit Fallback', () => {
  const rec = {
    vera_attacks: [{ name: 'Fire Spin' }], vera_abilities: [],
    i18n_de: { attacks: [{ name: 'Feuersturm' }], abilities: [{ name: 'Glut' }] }
  };
  const de = sc.getPreferredCardTexts(rec, 'de');
  assert.equal(de.attacks[0].name, 'Feuersturm');
  assert.equal(de.abilities[0].name, 'Glut');
  const en = sc.getPreferredCardTexts(rec, 'en');
  assert.equal(en.attacks[0].name, 'Fire Spin');
  assert.equal(en.abilities[0].name, 'Glut'); // EN leer -> DE
  assert.deepEqual(sc.getPreferredCardTexts({ vera_attacks: [{ name: 'X' }] }, 'de').attacks, [{ name: 'X' }]);
  assert.deepEqual(sc.getPreferredCardTexts({}, 'de'), { attacks: [], abilities: [], rules: [], flavorText: '' });
});
