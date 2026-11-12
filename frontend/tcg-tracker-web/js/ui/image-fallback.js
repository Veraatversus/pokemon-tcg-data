// Bild-Fallback-Kette fuer Set-Logos, Set-Symbole und Kartenbilder.
//
// imageCandidates(record, kind, language) liefert die URL-Kette:
//   de: DE (i18n.de.images / i18n_de.images / tcgdex_*) -> EN (images / vera_*) -> legacy (pokemontcg)
//   en: EN -> DE -> legacy
// Leere, ungueltige und doppelte Werte werden entfernt.
//
// Gerendert wird mit data-fallbacks (JSON-Liste der restlichen Kandidaten) und data-placeholder.
// Ein einziger delegierter error-Listener (Capture-Phase, auf document) rueckt die Kette vor und
// zeigt am Ende den bestehenden Platzhalter (Pokeball + .img-fallback, bei Kartenbildern zusaetzlich
// .card-img-wrap.missing-image). Funktioniert damit fuer DOM-Elemente und HTML-Strings.

export const IMAGE_PLACEHOLDER_SRC = './assets/pokeball-fallback.svg';
export const IMAGE_KINDS = ['setLogo', 'setSymbol', 'cardSmall', 'cardLarge'];

const LEGACY_IMAGE_HOST = 'https://images.pokemontcg.io';

// Wrapper, die beim endgueltigen Platzhalter zusaetzlich markiert werden.
const PLACEHOLDER_WRAPS = [
  ['.card-img-wrap', 'missing-image'],
  ['.stats-price-thumb', 'stats-price-thumb--missing']
];

const str = (v) => (typeof v === 'string' ? v.trim() : '');

function normalizeImageUrl(value) {
  const text = str(value);
  if (!text) return '';
  const lower = text.toLowerCase();
  if (['0', 'null', 'undefined', 'nan'].includes(lower)) return '';
  if (lower.includes('pokeball-fallback.svg')) return '';
  if (!/^https?:\/\//i.test(text) && !/^\.{0,2}\//.test(text)) return '';
  // TCGdex-Set-Assets ohne Endung (".../logo", ".../symbol") liefern nur mit .webp ein Bild.
  if (/^https?:\/\/assets\.tcgdex\.net\//i.test(text)
    && /\/(?:logo|symbol)(?:[?#].*)?$/i.test(text)
    && !/\.(?:webp|png|jpe?g|svg)(?:[?#]|$)/i.test(text)) {
    const match = text.match(/^([^?#]+)([?#].*)?$/);
    return match ? `${match[1]}.webp${match[2] || ''}` : text;
  }
  return text;
}

function pokemontcgId(record) {
  const id = str(record?.ids?.pokemontcg) || str(record?.vera_id);
  return id && !id.startsWith('TCGDEX-') ? id : '';
}

function legacySetUrl(record, file) {
  const id = pokemontcgId(record);
  return id ? `${LEGACY_IMAGE_HOST}/${encodeURIComponent(id)}/${file}` : '';
}

function legacyCardUrl(record, suffix) {
  const id = pokemontcgId(record);
  const cut = id.lastIndexOf('-');
  if (cut <= 0 || cut === id.length - 1) return '';
  return `${LEGACY_IMAGE_HOST}/${encodeURIComponent(id.slice(0, cut))}/${encodeURIComponent(id.slice(cut + 1))}${suffix}.png`;
}

// Je Bildart: [DE-Werte], [EN-Werte], [Legacy-Werte] in Prioritaetsreihenfolge.
function sourcesFor(record, kind) {
  const r = record || {};
  // DE-Bilder: v3-Objekt (i18n.de.images) oder Record-Passthrough (i18n_de.images).
  const de = (field) => [r.i18n?.de?.images?.[field], r.i18n_de?.images?.[field]];
  const en = r.images || {};
  switch (kind) {
    case 'setLogo':
      return {
        de: [...de('logo'), r.tcgdex_logo],
        en: [en.logo, r.vera_images_logo],
        legacy: [r.logoUrl, legacySetUrl(r, 'logo.png')]
      };
    case 'setSymbol':
      return {
        de: [...de('symbol'), r.tcgdex_symbol],
        en: [en.symbol, r.vera_images_symbol],
        legacy: [r.symbolUrl, legacySetUrl(r, 'symbol.png')]
      };
    case 'cardSmall':
      return {
        de: [...de('small'), r.tcgdex_image_small, r.tcgdex_image],
        en: [en.small, r.vera_images_small],
        legacy: [r.image, r.imageUrl, legacyCardUrl(r, '')]
      };
    case 'cardLarge':
      return {
        de: [...de('large'), r.tcgdex_image_large],
        en: [en.large, r.vera_images_large],
        legacy: [r.imageLarge, r.imageLargeUrl, legacyCardUrl(r, '_hires')]
      };
    default:
      return null;
  }
}

function dedupe(values) {
  const seen = new Set();
  const out = [];
  values.forEach((value) => {
    const url = normalizeImageUrl(value);
    if (!url || seen.has(url)) return;
    seen.add(url);
    out.push(url);
  });
  return out;
}

export function imageCandidates(record, kind, language = 'de') {
  if (!record || typeof record !== 'object') return [];
  const sources = sourcesFor(record, kind);
  if (!sources) return [];
  const lang = language === 'en' ? 'en' : 'de';
  const ordered = lang === 'en'
    ? [...sources.en, ...sources.de, ...sources.legacy]
    : [...sources.de, ...sources.en, ...sources.legacy];
  // Grosse Kartenbilder: kleine Bilder als letzte Reserve vor dem Platzhalter.
  if (kind === 'cardLarge') ordered.push(...imageCandidates(record, 'cardSmall', lang));
  return dedupe(ordered);
}

function escapeAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function readFallbacks(img) {
  try {
    const parsed = JSON.parse(img.getAttribute('data-fallbacks') || '[]');
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string' && v) : [];
  } catch {
    return [];
  }
}

function eachPlaceholderWrap(img, fn) {
  if (typeof img?.closest !== 'function') return;
  PLACEHOLDER_WRAPS.forEach(([selector, className]) => {
    const wrap = img.closest(selector);
    if (wrap) fn(wrap, className);
  });
}

function applyPlaceholder(img) {
  const placeholder = img.getAttribute('data-placeholder');
  img.removeAttribute('data-fallbacks');
  img.removeAttribute('data-placeholder');
  if (placeholder) {
    img.src = placeholder;
    img.classList.add('img-fallback');
    eachPlaceholderWrap(img, (wrap, className) => wrap.classList.add(className));
  } else {
    img.style.display = 'none';
  }
}

// Delegierter error-Handler: naechster Kandidat aus data-fallbacks, sonst Platzhalter.
export function handleImageFallbackError(event) {
  const img = event?.target;
  if (!img || String(img.tagName || '').toUpperCase() !== 'IMG') return;
  if (typeof img.hasAttribute !== 'function' || !img.hasAttribute('data-fallbacks')) return;
  const queue = readFallbacks(img);
  const current = str(img.getAttribute('src'));
  while (queue.length) {
    const next = queue.shift();
    if (next && next !== current) {
      img.setAttribute('data-fallbacks', JSON.stringify(queue));
      img.src = next;
      return;
    }
  }
  applyPlaceholder(img);
}

const installedDocuments = new WeakSet();

export function installImageFallback(doc = globalThis.document) {
  if (!doc || typeof doc.addEventListener !== 'function' || installedDocuments.has(doc)) return;
  installedDocuments.add(doc);
  doc.addEventListener('error', handleImageFallbackError, true);
}

// Attribut-String fuer HTML-Templates: src + data-fallbacks + data-placeholder.
export function fallbackImgAttrs(candidates = [], { placeholder = IMAGE_PLACEHOLDER_SRC } = {}) {
  installImageFallback();
  const [first = placeholder, ...rest] = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
  return `src="${escapeAttr(first)}" data-fallbacks="${escapeAttr(JSON.stringify(rest))}" data-placeholder="${escapeAttr(placeholder)}"`;
}

// Fuer bestehende <img>-Elemente (auch wiederverwendete, z. B. Lightbox/Set-Kopf).
export function bindImageFallback(img, candidates = [], { placeholder = IMAGE_PLACEHOLDER_SRC } = {}) {
  if (!img) return;
  installImageFallback(img.ownerDocument || globalThis.document);
  img.onerror = null;
  img.classList.remove('img-fallback');
  if (img.style) img.style.display = '';
  eachPlaceholderWrap(img, (wrap, className) => wrap.classList.remove(className));

  const list = (Array.isArray(candidates) ? candidates : []).map(str).filter(Boolean);
  const [first, ...rest] = list;
  img.setAttribute('data-fallbacks', JSON.stringify(rest));
  img.setAttribute('data-placeholder', placeholder || '');
  if (first) img.src = first;
  else applyPlaceholder(img);
}
