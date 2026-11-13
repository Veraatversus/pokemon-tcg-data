// Feldaufloesung nach Kartensprache (Task 8b): ersetzt die Resolver-Matrix.
// Sprachabhaengige Felder: gewaehlte Sprache -> andere Sprache -> legacy.
// Alle anderen Felder: vera_* (v3/EN) -> tcgdex_* -> legacy.
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
const { imageCandidates } = await import('../js/ui/image-fallback.js');
const KEY = scopedStorageKey('user-settings');

function setSettings(obj) {
  if (obj == null) store.delete(KEY); else store.set(KEY, JSON.stringify(obj));
}

const card = {
  vera_name: 'Charizard', tcgdex_name: 'Glurak',
  vera_images_small: 'https://en/small.png', tcgdex_image_small: 'https://de/small.png',
  vera_images_large: 'https://en/large.png', tcgdex_image_large: 'https://de/large.png',
  vera_evolvesFrom: 'Charmeleon', tcgdex_evolvesFrom: 'Glutexo',
  vera_flavorText: 'Flies.', vera_rules: ['EN rule'],
  vera_attacks: [{ name: 'Fire Spin' }], vera_abilities: [{ name: 'Blaze' }],
  vera_artist: 'Mitsuhiro', vera_rarity: 'Rare', tcgdex_rarity: 'Selten',
  i18n_de: {
    flavorText: 'Fliegt.', rules: ['DE Regel'],
    attacks: [{ name: 'Feuersturm' }], abilities: [{ name: 'Gluthitze' }]
  }
};

test('resolveFieldValue: DE bevorzugt tcgdex_name, EN bevorzugt vera_name', () => {
  assert.equal(sc.resolveFieldValue(card, 'card', 'name', 'de'), 'Glurak');
  assert.equal(sc.resolveFieldValue(card, 'card', 'name', 'en'), 'Charizard');
});

test('resolveFieldValue: sprachabhaengige Felder fallen auf die andere Sprache, dann legacy zurueck', () => {
  assert.equal(sc.resolveFieldValue({ vera_name: 'Charizard' }, 'card', 'name', 'de'), 'Charizard');
  assert.equal(sc.resolveFieldValue({ tcgdex_name: 'Glurak' }, 'card', 'name', 'en'), 'Glurak');
  assert.equal(sc.resolveFieldValue({ name: 'Alt' }, 'card', 'name', 'de'), 'Alt');
  assert.equal(sc.resolveFieldValue({ name: 'Alt' }, 'card', 'name', 'en'), 'Alt');
  assert.equal(sc.resolveFieldValue({}, 'card', 'name', 'de'), '');
  assert.equal(sc.resolveFieldValue({ tcgdex_name: 'Schwert', vera_name: 'Sword' }, 'set', 'setName', 'de'), 'Schwert');
  assert.equal(sc.resolveFieldValue({ tcgdex_name: 'Schwert', vera_name: 'Sword' }, 'set', 'setName', 'en'), 'Sword');
});

test('resolveFieldValue: Texte (attacks/abilities/rules/flavorText) je Sprache', () => {
  assert.deepEqual(sc.resolveFieldValue(card, 'card', 'attacks', 'de'), [{ name: 'Feuersturm' }]);
  assert.deepEqual(sc.resolveFieldValue(card, 'card', 'attacks', 'en'), [{ name: 'Fire Spin' }]);
  assert.deepEqual(sc.resolveFieldValue(card, 'card', 'abilities', 'de'), [{ name: 'Gluthitze' }]);
  assert.deepEqual(sc.resolveFieldValue(card, 'card', 'rules', 'de'), ['DE Regel']);
  assert.deepEqual(sc.resolveFieldValue(card, 'card', 'rules', 'en'), ['EN rule']);
  assert.equal(sc.resolveFieldValue(card, 'card', 'flavorText', 'de'), 'Fliegt.');
  assert.equal(sc.resolveFieldValue(card, 'card', 'flavorText', 'en'), 'Flies.');
  assert.deepEqual(sc.resolveFieldValue({ i18n_de: { attacks: [{ name: 'X' }] } }, 'card', 'attacks', 'en'), [{ name: 'X' }]);
  assert.deepEqual(sc.resolveFieldValue({}, 'card', 'attacks', 'en'), []);
});

test('resolveFieldValue: sprachneutrales Feld (rarity) ist in beiden Sprachen gleich: vera -> tcgdex -> legacy', () => {
  assert.equal(sc.resolveFieldValue(card, 'card', 'rarity', 'de'), 'Rare');
  assert.equal(sc.resolveFieldValue(card, 'card', 'rarity', 'en'), 'Rare');
  assert.equal(sc.resolveFieldValue({ tcgdex_rarity: 'Selten' }, 'card', 'rarity', 'de'), 'Selten');
  assert.equal(sc.resolveFieldValue({ rarity: 'Alt' }, 'card', 'rarity', 'en'), 'Alt');
  assert.equal(sc.resolveFieldValue({ vera_ptcgoCode: 'SSH', tcgdex_abbreviation_official: 'X' }, 'set', 'ptcgoCode', 'de'), 'SSH');
});

test('resolveFieldValue: unbekanntes Feld liefert undefined, Sprache Standard = getCardLanguage()', () => {
  assert.equal(sc.resolveFieldValue(card, 'card', 'unknownField', 'de'), undefined);
  setSettings({ cardLanguage: 'en' });
  assert.equal(sc.resolveFieldValue(card, 'card', 'name'), 'Charizard');
  setSettings(null);
  assert.equal(sc.resolveFieldValue(card, 'card', 'name'), 'Glurak');
});

test('resolveDisplayCard folgt der Kartensprache', () => {
  setSettings(null);
  const de = sc.resolveDisplayCard(card);
  assert.equal(de.name, 'Glurak');
  assert.equal(de.image, 'https://de/small.png');
  assert.equal(de.imageLarge, 'https://de/large.png');
  assert.equal(de.evolvesFrom, 'Glutexo');
  assert.equal(de.flavorText, 'Fliegt.');
  assert.deepEqual(de.rules, ['DE Regel']);
  assert.deepEqual(de.attacks, [{ name: 'Feuersturm' }]);
  assert.equal(de.rarity, 'Rare');
  setSettings({ cardLanguage: 'en' });
  const en = sc.resolveDisplayCard(card);
  assert.equal(en.name, 'Charizard');
  assert.equal(en.image, 'https://en/small.png');
  assert.equal(en.imageLarge, 'https://en/large.png');
  assert.equal(en.evolvesFrom, 'Charmeleon');
  assert.equal(en.flavorText, 'Flies.');
  assert.deepEqual(en.rules, ['EN rule']);
  assert.deepEqual(en.abilities, [{ name: 'Blaze' }]);
  assert.equal(en.rarity, 'Rare');
  setSettings(null);
});

test('resolveDisplaySet folgt der Kartensprache', () => {
  const set = { tcgdex_name: 'Schwert & Schild', vera_name: 'Sword & Shield', tcgdex_logo: 'https://de/logo.png', vera_images_logo: 'https://en/logo.png' };
  setSettings(null);
  assert.equal(sc.resolveDisplaySet(set).setName, 'Schwert & Schild');
  assert.equal(sc.resolveDisplaySet(set).logoUrl, 'https://de/logo.png');
  setSettings({ cardLanguage: 'en' });
  assert.equal(sc.resolveDisplaySet(set).setName, 'Sword & Shield');
  assert.equal(sc.resolveDisplaySet(set).logoUrl, 'https://en/logo.png');
  setSettings(null);
});

test('gespeicherte resolverMatrix / expertResolverMode haben keine Wirkung', () => {
  setSettings({
    cardLanguage: 'en', expertResolverMode: true,
    resolverMatrix: { card: { name: ['tcgdex', 'vera', 'legacy'], rarity: ['tcgdex', 'vera', 'legacy'] } }
  });
  const r = sc.resolveDisplayCard(card);
  assert.equal(r.name, 'Charizard');
  assert.equal(r.rarity, 'Rare');
  setSettings({ cardLanguage: 'de', resolverMatrix: 'kaputt', expertResolverMode: 'ja' });
  assert.equal(sc.resolveDisplayCard(card).name, 'Glurak');
  setSettings(null);
});

test('Matrix-API ist entfernt', () => {
  assert.equal(sc.getResolverMatrix, undefined);
  assert.equal(sc.resetResolverMatrixCache, undefined);
});

test('ungueltige Sprache -> de', () => {
  setSettings({ cardLanguage: 'fr' });
  assert.equal(sc.getCardLanguage(), 'de');
  setSettings(null);
});

test('aufgeloeste Records behalten die rohen Legacy-Bild-URLs fuer imageCandidates', () => {
  const legacySet = { setId: 'x', logoUrl: 'https://legacy/logo.png', symbolUrl: 'https://legacy/symbol.png', tcgdex_logo: 'https://de/logo.png', vera_images_logo: 'https://en/logo.png' };
  const resolvedSet = sc.resolveDisplaySet(legacySet);
  assert.equal(resolvedSet.logoUrl, 'https://de/logo.png');
  assert.deepEqual(imageCandidates(resolvedSet, 'setLogo', 'en'), ['https://en/logo.png', 'https://de/logo.png', 'https://legacy/logo.png']);
  // erneutes Aufloesen verliert die Legacy-URL nicht
  assert.deepEqual(imageCandidates(sc.resolveDisplaySet(resolvedSet), 'setLogo', 'de'), ['https://de/logo.png', 'https://en/logo.png', 'https://legacy/logo.png']);

  const legacyCard = { image: 'https://legacy/small.png', imageLarge: 'https://legacy/large.png', vera_images_small: 'https://en/small.png', vera_images_large: 'https://en/large.png' };
  const resolvedCard = sc.resolveDisplayCard(legacyCard);
  assert.equal(resolvedCard.image, 'https://en/small.png');
  assert.deepEqual(imageCandidates(sc.resolveDisplayCard(resolvedCard), 'cardSmall', 'de'), ['https://en/small.png', 'https://legacy/small.png']);
  assert.equal(imageCandidates(resolvedCard, 'cardLarge', 'de')[1], 'https://legacy/large.png');
  // nur Legacy vorhanden: Legacy wird angezeigt
  assert.equal(sc.resolveDisplayCard({ image: 'https://legacy/small.png' }).image, 'https://legacy/small.png');
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

test('Einstellungen: loadSettings ignoriert gespeicherte resolverMatrix/expertResolverMode', async () => {
  const { loadSettings, saveSettings } = await import('../js/enhanced-features.js');
  setSettings({ cardLanguage: 'en', expertResolverMode: true, resolverMatrix: { card: {} } });
  const loaded = loadSettings();
  assert.equal(loaded.cardLanguage, 'en');
  assert.equal('expertResolverMode' in loaded, false);
  assert.equal('resolverMatrix' in loaded, false);
  saveSettings({ ...loaded, resolverMatrix: { set: {} }, expertResolverMode: true });
  const raw = JSON.parse(store.get(KEY));
  assert.equal('resolverMatrix' in raw, false);
  assert.equal('expertResolverMode' in raw, false);
  setSettings(null);
});

function fakeElement() {
  const el = {
    style: {}, className: '', innerHTML: '', dataset: {},
    addEventListener() {},
    querySelector() { return fakeElement(); },
    querySelectorAll() { return []; }
  };
  return el;
}

test('Einstellungs-Panel rendert ohne Matrix-Editor und ohne Expert-Schalter', async () => {
  globalThis.document = { createElement: () => fakeElement() };
  globalThis.window = globalThis.window || { addEventListener() {}, dispatchEvent() {}, confirm: () => false };
  const { createSettingsPanel } = await import('../js/ui/components.js');
  const panel = createSettingsPanel({ cardLanguage: 'en', expertResolverMode: true, resolverMatrix: { card: { name: ['vera'] } } }, () => {});
  const html = panel.innerHTML;
  assert.match(html, /data-key="cardLanguage"/);
  assert.match(html, /data-key="cardmarketBasePriceType"/);
  assert.doesNotMatch(html, /data-resolver-scope|data-resolver-field|expertResolverMode|resolver-defaults|Resolver-Matrix/i);
});
