// Bild-Fallback-Kette (Task 5): Kandidaten-Reihenfolge je Sprache und delegierter error-Handler.
import test from 'node:test';
import assert from 'node:assert/strict';

const {
  imageCandidates,
  bindImageFallback,
  handleImageFallbackError,
  fallbackImgAttrs,
  installImageFallback,
  IMAGE_PLACEHOLDER_SRC
} = await import('../js/ui/image-fallback.js');

const DE_LOGO = 'https://assets.tcgdex.net/de/swsh/swsh1/logo.webp';
const EN_LOGO = 'https://assets.tcgdex.net/en/swsh/swsh1/logo.webp';
const LEGACY_LOGO = 'https://images.pokemontcg.io/swsh1/logo.png';

const v3Set = {
  id: 'swsh1',
  ids: { pokemontcg: 'swsh1', tcgdex: 'swsh1' },
  images: { logo: EN_LOGO, symbol: 'https://images.pokemontcg.io/swsh1/symbol.png' },
  i18n: { de: { name: 'Schwert & Schild', images: { logo: DE_LOGO } } }
};

const v3Card = {
  id: 'swsh1-1',
  setId: 'swsh1',
  number: '1',
  ids: { pokemontcg: 'swsh1-1', tcgdex: 'swsh1-1' },
  images: {
    small: 'https://assets.tcgdex.net/en/swsh/swsh1/1/low.webp',
    large: 'https://assets.tcgdex.net/en/swsh/swsh1/1/high.webp'
  },
  i18n: { de: { images: {
    small: 'https://assets.tcgdex.net/de/swsh/swsh1/1/low.webp',
    large: 'https://assets.tcgdex.net/de/swsh/swsh1/1/high.webp'
  } } }
};

test('setLogo de: DE -> EN -> legacy pokemontcg', () => {
  assert.deepEqual(imageCandidates(v3Set, 'setLogo', 'de'), [DE_LOGO, EN_LOGO, LEGACY_LOGO]);
});

test('setLogo en: EN -> DE -> legacy pokemontcg', () => {
  assert.deepEqual(imageCandidates(v3Set, 'setLogo', 'en'), [EN_LOGO, DE_LOGO, LEGACY_LOGO]);
});

test('setSymbol: ohne DE-Symbol EN, legacy-Duplikat entfernt', () => {
  assert.deepEqual(imageCandidates(v3Set, 'setSymbol', 'de'), ['https://images.pokemontcg.io/swsh1/symbol.png']);
});

test('Sheet-Record (vera_*/tcgdex_*) und Legacy-Felder', () => {
  const record = {
    setId: 'base1',
    vera_id: 'base1',
    vera_images_logo: 'https://assets.tcgdex.net/en/base/base1/logo.webp',
    tcgdex_logo: 'https://assets.tcgdex.net/de/base/base1/logo',
    logoUrl: 'https://images.scrydex.com/pokemon/base1-logo/logo'
  };
  assert.deepEqual(imageCandidates(record, 'setLogo', 'de'), [
    'https://assets.tcgdex.net/de/base/base1/logo.webp',
    'https://assets.tcgdex.net/en/base/base1/logo.webp',
    'https://images.scrydex.com/pokemon/base1-logo/logo',
    'https://images.pokemontcg.io/base1/logo.png'
  ]);
});

test('TCGDEX-only-Set: kein abgeleiteter pokemontcg-Link', () => {
  const record = { setId: 'TCGDEX-2013bw', tcgdex_logo: DE_LOGO };
  assert.deepEqual(imageCandidates(record, 'setLogo', 'en'), [DE_LOGO]);
});

test('cardSmall de/en inkl. legacy pokemontcg', () => {
  assert.deepEqual(imageCandidates(v3Card, 'cardSmall', 'de'), [
    'https://assets.tcgdex.net/de/swsh/swsh1/1/low.webp',
    'https://assets.tcgdex.net/en/swsh/swsh1/1/low.webp',
    'https://images.pokemontcg.io/swsh1/1.png'
  ]);
  assert.deepEqual(imageCandidates(v3Card, 'cardSmall', 'en'), [
    'https://assets.tcgdex.net/en/swsh/swsh1/1/low.webp',
    'https://assets.tcgdex.net/de/swsh/swsh1/1/low.webp',
    'https://images.pokemontcg.io/swsh1/1.png'
  ]);
});

test('cardLarge: grosse Bilder zuerst, kleine Bilder als letzte Reserve', () => {
  assert.deepEqual(imageCandidates(v3Card, 'cardLarge', 'de'), [
    'https://assets.tcgdex.net/de/swsh/swsh1/1/high.webp',
    'https://assets.tcgdex.net/en/swsh/swsh1/1/high.webp',
    'https://images.pokemontcg.io/swsh1/1_hires.png',
    'https://assets.tcgdex.net/de/swsh/swsh1/1/low.webp',
    'https://assets.tcgdex.net/en/swsh/swsh1/1/low.webp',
    'https://images.pokemontcg.io/swsh1/1.png'
  ]);
});

test('Card-Record (vera_*/tcgdex_image_*/i18n_de) wird erkannt', () => {
  const record = {
    vera_id: 'base1-4',
    vera_images_small: 'https://images.pokemontcg.io/base1/4.png',
    tcgdex_image_small: 'https://assets.tcgdex.net/de/base/base1/4/low.webp',
    i18n_de: { images: { small: 'https://assets.tcgdex.net/de/base/base1/4/low.webp' } }
  };
  assert.deepEqual(imageCandidates(record, 'cardSmall', 'de'), [
    'https://assets.tcgdex.net/de/base/base1/4/low.webp',
    'https://images.pokemontcg.io/base1/4.png'
  ]);
});

test('Duplikate, Leerwerte und Muellwerte werden entfernt', () => {
  const record = {
    vera_images_logo: EN_LOGO,
    tcgdex_logo: '  ',
    logoUrl: 'null',
    i18n_de: { images: { logo: EN_LOGO } },
    images: { logo: './assets/pokeball-fallback.svg' }
  };
  assert.deepEqual(imageCandidates(record, 'setLogo', 'de'), [EN_LOGO]);
  assert.deepEqual(imageCandidates(null, 'setLogo', 'de'), []);
  assert.deepEqual(imageCandidates(v3Set, 'unknown', 'de'), []);
});

test('unbekannte Sprache faellt auf de zurueck', () => {
  assert.deepEqual(imageCandidates(v3Set, 'setLogo', 'fr'), [DE_LOGO, EN_LOGO, LEGACY_LOGO]);
});

// Minimales Fake-<img> (Attribute, classList, closest) fuer den delegierten Handler.
function fakeImg({ wrapClass = '' } = {}) {
  const attrs = new Map();
  const classes = new Set();
  const wrapClasses = new Set();
  const wrap = wrapClass ? { classList: setClassList(wrapClasses), dataset: {} } : null;
  function setClassList(set) {
    return {
      add: (c) => set.add(c),
      remove: (c) => set.delete(c),
      contains: (c) => set.has(c)
    };
  }
  const img = {
    tagName: 'IMG',
    style: {},
    onerror: 'old',
    get src() { return attrs.get('src') || ''; },
    set src(v) { attrs.set('src', String(v)); },
    getAttribute: (n) => (attrs.has(n) ? attrs.get(n) : null),
    setAttribute: (n, v) => attrs.set(n, String(v)),
    removeAttribute: (n) => attrs.delete(n),
    hasAttribute: (n) => attrs.has(n),
    classList: setClassList(classes),
    closest: (sel) => (wrap && sel.split(',').map((s) => s.trim()).includes(`.${wrapClass}`) ? wrap : null),
    ownerDocument: { addEventListener() {} }
  };
  return { img, classes, wrap, wrapClasses };
}

test('delegierter Handler: rueckt durch data-fallbacks vor, am Ende Platzhalter', () => {
  const { img, classes } = fakeImg();
  img.src = 'a.png';
  img.setAttribute('data-fallbacks', JSON.stringify(['b.png', 'c.png']));
  img.setAttribute('data-placeholder', IMAGE_PLACEHOLDER_SRC);

  handleImageFallbackError({ target: img });
  assert.equal(img.src, 'b.png');
  handleImageFallbackError({ target: img });
  assert.equal(img.src, 'c.png');
  assert.equal(classes.has('img-fallback'), false);
  handleImageFallbackError({ target: img });
  assert.equal(img.src, IMAGE_PLACEHOLDER_SRC);
  assert.equal(classes.has('img-fallback'), true);
  assert.equal(img.hasAttribute('data-fallbacks'), false);

  // Fehler des Platzhalters selbst: keine Schleife.
  handleImageFallbackError({ target: img });
  assert.equal(img.src, IMAGE_PLACEHOLDER_SRC);
});

test('delegierter Handler ignoriert Bilder ohne data-fallbacks', () => {
  const { img, classes } = fakeImg();
  img.src = 'x.png';
  handleImageFallbackError({ target: img });
  assert.equal(img.src, 'x.png');
  assert.equal(classes.has('img-fallback'), false);
  handleImageFallbackError({ target: null });
});

test('leerer Platzhalter blendet das Bild aus (Set-Symbol)', () => {
  const { img } = fakeImg();
  img.src = 'a.png';
  img.setAttribute('data-fallbacks', '[]');
  img.setAttribute('data-placeholder', '');
  handleImageFallbackError({ target: img });
  assert.equal(img.style.display, 'none');
});

test('Kartenbild: Platzhalter markiert .card-img-wrap als missing-image', () => {
  const { img, wrapClasses } = fakeImg({ wrapClass: 'card-img-wrap' });
  bindImageFallback(img, ['a.png'], { placeholder: IMAGE_PLACEHOLDER_SRC });
  assert.equal(img.src, 'a.png');
  assert.equal(img.onerror, null);
  handleImageFallbackError({ target: img });
  assert.equal(img.src, IMAGE_PLACEHOLDER_SRC);
  assert.equal(wrapClasses.has('missing-image'), true);

  // Wiederverwendung (Lightbox): neues Binden setzt den Fallback-Zustand zurueck.
  bindImageFallback(img, ['n.png', 'm.png']);
  assert.equal(img.src, 'n.png');
  assert.equal(wrapClasses.has('missing-image'), false);
});

test('bindImageFallback ohne Kandidaten zeigt sofort den Platzhalter', () => {
  const { img, classes } = fakeImg();
  bindImageFallback(img, [], { placeholder: IMAGE_PLACEHOLDER_SRC });
  assert.equal(img.src, IMAGE_PLACEHOLDER_SRC);
  assert.equal(classes.has('img-fallback'), true);
});

test('fallbackImgAttrs: src, data-fallbacks, data-placeholder escaped', () => {
  const attrs = fallbackImgAttrs(['a.png?x=1&y="2"', 'b.png']);
  assert.match(attrs, /src="a\.png\?x=1&amp;y=&quot;2&quot;"/);
  assert.match(attrs, /data-fallbacks="\[&quot;b\.png&quot;\]"/);
  assert.match(attrs, /data-placeholder="\.\/assets\/pokeball-fallback\.svg"/);
});

test('installImageFallback registriert genau einen Capture-Listener je Dokument', () => {
  const calls = [];
  const doc = { addEventListener: (type, fn, capture) => calls.push([type, capture]) };
  installImageFallback(doc);
  installImageFallback(doc);
  assert.deepEqual(calls, [['error', true]]);
});

test('fallbackImgAttrs ohne Kandidaten und ohne Platzhalter erzeugt kein src=""', () => {
  const attrs = fallbackImgAttrs([], { placeholder: '' });
  assert.doesNotMatch(attrs, /src=""/);
  assert.doesNotMatch(attrs, /(^|\s)src=/);
});
