import { normalizeCardNumber } from '../core/utils.js';
import { scopedStorageKey } from '../core/config.js';
import { isGeneratedCardmarketSearchUrl, resolveCardmarketLink } from './cardmarket-url-utils.js';

const SETTINGS_STORAGE_KEY = scopedStorageKey('user-settings');
const CARD_LANGUAGES = ['de', 'en'];

function normalizeCardLanguage(value) {
  const lang = String(value || '').trim().toLowerCase();
  return CARD_LANGUAGES.includes(lang) ? lang : 'de';
}

function readStoredSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) || {}) : {};
  } catch {
    return {};
  }
}

// Kartensprache fuer die Anzeige (Standard 'de'); wird pro Browser in den user-settings gehalten.
export function getCardLanguage() {
  return normalizeCardLanguage(readStoredSettings().cardLanguage);
}

function isValuePresent(value, { numeric = false } = {}) {
  if (value == null) return false;
  if (numeric) return Number(value) > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return String(value).trim() !== '';
}

function normalizeTcgdexSetAssetUrl(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return '';
  return text;
}

function sanitizeMediaValue(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return '';
  if (/pokeball-fallback\.svg/i.test(text)) return '';
  return normalizeTcgdexSetAssetUrl(text);
}

// Rohe Legacy-Bild-URLs bleiben auf aufgeloesten Records unter legacy* erhalten; image-fallback.js nutzt
// sie als Legacy-Slot. Ist legacy* schon gesetzt (erneutes Aufloesen), gilt es statt des inzwischen
// aufgeloesten Anzeige-Felds.
const LEGACY_MEDIA_KEYS = {
  legacyLogoUrl: ['logoUrl'],
  legacySymbolUrl: ['symbolUrl'],
  legacyImage: ['image', 'imageUrl'],
  legacyImageLarge: ['imageLarge', 'imageLargeUrl']
};

function legacyMedia(record, legacyKey) {
  if (Object.prototype.hasOwnProperty.call(record, legacyKey)) return sanitizeMediaValue(record[legacyKey]);
  return LEGACY_MEDIA_KEYS[legacyKey].map((key) => sanitizeMediaValue(record[key])).find(Boolean) || '';
}

const list = (value) => (Array.isArray(value) ? value : []);

function tcgdexRules(record) {
  const deRules = list(record.i18n_de?.rules);
  return deRules.length
    ? deRules
    : normalizeRules(null, { description: record.tcgdex_description, effect: record.tcgdex_effect });
}

// Feldquellen: de = tcgdex_* / i18n_de (DE), en = vera_* (v3/EN), legacy = alte Sheet-Spalten.
// lang: true = sprachabhaengig (gewaehlte Sprache -> andere Sprache -> legacy),
// sonst sprachneutral (vera_* -> tcgdex_* -> legacy). empty = Wert, wenn keine Quelle etwas liefert.
const FIELD_SOURCES = {
  set: {
    setName: { lang: true, empty: '', de: (r) => r.tcgdex_name || sharedV3SetMeta?.get?.(String(r.setId ?? '').trim())?.deName, en: (r) => r.vera_name, legacy: (r) => r.setName },
    releaseDate: { empty: '', de: (r) => r.tcgdex_releaseDate, en: (r) => r.vera_releaseDate, legacy: (r) => r.releaseDate },
    // Aufgedruckte Kartenzahl (official / printedTotal); die Gesamtzahl liefert resolveSetTotalCards.
    totalCards: {
      numeric: true,
      empty: 0,
      de: (r) => toNumber(r.tcgdex_cardCount_official),
      en: (r) => toNumber(r.vera_printedTotal) || toNumber(r.vera_total),
      legacy: (r) => toNumber(r.totalCards)
    },
    ptcgoCode: { empty: '', de: (r) => r.tcgdex_abbreviation_official, en: (r) => r.vera_ptcgoCode, legacy: (r) => r.ptcgoCode },
    logoUrl: {
      lang: true,
      empty: '',
      de: (r) => sanitizeMediaValue(r.tcgdex_logo),
      en: (r) => sanitizeMediaValue(r.vera_images_logo),
      legacy: (r) => legacyMedia(r, 'legacyLogoUrl')
    },
    symbolUrl: {
      empty: '',
      de: (r) => sanitizeMediaValue(r.tcgdex_symbol),
      en: (r) => sanitizeMediaValue(r.vera_images_symbol),
      legacy: (r) => legacyMedia(r, 'legacySymbolUrl')
    },
    legalities: { empty: null, de: (r) => r.tcgdex_legal, en: (r) => r.vera_legalities, legacy: (r) => r.legalities }
  },
  card: {
    number: {
      empty: '',
      de: (r) => normalizeCardNumber(r.tcgdex_localId || ''),
      en: (r) => normalizeCardNumber(r.vera_number || ''),
      legacy: (r) => r.number
    },
    name: { lang: true, empty: '', de: (r) => r.tcgdex_name, en: (r) => r.vera_name, legacy: (r) => r.name },
    image: {
      lang: true,
      empty: '',
      de: (r) => sanitizeMediaValue(r.tcgdex_image_small || r.tcgdex_image),
      en: (r) => sanitizeMediaValue(r.vera_images_small),
      legacy: (r) => legacyMedia(r, 'legacyImage')
    },
    imageLarge: {
      lang: true,
      empty: '',
      de: (r) => sanitizeMediaValue(r.tcgdex_image_large),
      en: (r) => sanitizeMediaValue(r.vera_images_large),
      legacy: (r) => legacyMedia(r, 'legacyImageLarge')
    },
    rarity: { empty: '', de: (r) => r.tcgdex_rarity, en: (r) => r.vera_rarity, legacy: (r) => r.rarity },
    hp: { empty: '', de: (r) => r.tcgdex_hp, en: (r) => r.vera_hp, legacy: (r) => r.hp },
    types: { empty: [], de: (r) => list(r.tcgdex_types), en: (r) => list(r.vera_types), legacy: (r) => list(r.types) },
    supertype: { empty: '', de: (r) => r.tcgdex_category, en: (r) => r.vera_supertype, legacy: (r) => r.supertype },
    subtypes: {
      empty: [],
      de: (r) => [r.tcgdex_stage || r.tcgdex_suffix].filter(Boolean),
      en: (r) => list(r.vera_subtypes),
      legacy: (r) => list(r.subtypes)
    },
    evolvesFrom: { lang: true, empty: '', de: (r) => r.tcgdex_evolvesFrom, en: (r) => r.vera_evolvesFrom, legacy: (r) => r.evolvesFrom },
    artist: { empty: '', de: (r) => r.tcgdex_illustrator, en: (r) => r.vera_artist, legacy: (r) => r.artist },
    regulationMark: { empty: '', de: (r) => r.tcgdex_regulationMark, en: (r) => r.vera_regulationMark, legacy: (r) => r.regulationMark },
    rules: { lang: true, empty: [], de: tcgdexRules, en: (r) => list(r.vera_rules), legacy: (r) => list(r.rules) },
    flavorText: {
      lang: true,
      empty: '',
      de: (r) => r.tcgdex_description || r.i18n_de?.flavorText,
      en: (r) => r.vera_flavorText,
      legacy: (r) => r.flavorText
    },
    attacks: { lang: true, empty: [], de: (r) => list(r.i18n_de?.attacks), en: (r) => list(r.vera_attacks), legacy: (r) => list(r.attacks) },
    abilities: { lang: true, empty: [], de: (r) => list(r.i18n_de?.abilities), en: (r) => list(r.vera_abilities), legacy: (r) => list(r.abilities) }
  }
};

/**
 * Anzeige-Wert eines Felds nach Kartensprache (ersetzt die fruehere Resolver-Matrix).
 * Sprachabhaengige Felder (set: setName, logoUrl; card: name, image, imageLarge, evolvesFrom, rules,
 * flavorText, attacks, abilities): gewaehlte Sprache -> andere Sprache -> legacy.
 * Alle anderen Felder: vera_* (v3/EN) -> tcgdex_* -> legacy. Unbekannte Felder: undefined.
 * Bild-Fallback-Ketten fuer die Anzeige liefert weiterhin imageCandidates (ui/image-fallback.js).
 */
export function resolveFieldValue(record, scope, field, language = getCardLanguage()) {
  const spec = FIELD_SOURCES[scope]?.[field];
  if (!spec) return undefined;
  const source = record && typeof record === 'object' ? record : {};
  const order = spec.lang && normalizeCardLanguage(language) === 'de'
    ? [spec.de, spec.en, spec.legacy]
    : [spec.en, spec.de, spec.legacy];
  for (const read of order) {
    const value = read(source);
    if (isValuePresent(value, spec)) return typeof value === 'string' ? value.trim() : value;
  }
  return Array.isArray(spec.empty) ? [] : spec.empty;
}

// Bevorzugte Karten-Texte je Sprache (gleiche Regel wie resolveFieldValue).
export function getPreferredCardTexts(cardRecord = {}, language = 'de') {
  const pick = (field) => resolveFieldValue(cardRecord, 'card', field, language);
  return {
    attacks: pick('attacks'),
    abilities: pick('abilities'),
    rules: pick('rules'),
    flavorText: pick('flavorText')
  };
}

export const SET_MATCH_STATUS = {
  MATCHED: 'matched',
  PRIMARY_ONLY: 'primary_only',
  TCGDEX_ONLY: 'tcgdex_only'
};

export const CARD_MATCH_STATUS = {
  MATCHED: 'matched',
  PRIMARY_ONLY: 'primary_only',
  TCGDEX_ONLY: 'tcgdex_only'
};

export const SET_DB_HEADERS = [
  'setId', 'imported', 'updatedAt', 'matchStatus', 'isTcgdexOnly',
  // ID-Paar
  'vera_id', 'tcgdex_id',
  // Name-Paar
  'vera_name', 'tcgdex_name',
  // Serien-Gruppe
  'vera_series', 'tcgdex_serie_name', 'tcgdex_serie_id',
  // Gedruckte Kartenzahl
  'vera_printedTotal', 'tcgdex_cardCount_official',
  // Gesamtkartenzahl
  'vera_total', 'tcgdex_cardCount_total',
  // Weitere Kartenzahlen
  'tcgdex_cardCount_holo', 'tcgdex_cardCount_reverse', 'tcgdex_cardCount_firstEdition', 'tcgdex_cardCount_normal',
  // Code-Paar
  'vera_ptcgoCode', 'tcgdex_abbreviation_official',
  // Datum-Paar
  'vera_releaseDate', 'tcgdex_releaseDate',
  // Legalitäten-Paar
  'vera_legalities', 'tcgdex_legal',
  // Logo-Paar
  'vera_images_logo', 'tcgdex_logo',
  // Symbol-Paar
  'vera_images_symbol', 'tcgdex_symbol'
];

export const CARD_DB_HEADERS = [
  'setId', 'cardId', 'updatedAt', 'matchStatus', 'isPrimaryOnly', 'isTcgdexOnly',
  // ID-Paar
  'vera_id', 'tcgdex_id',
  // Nummer-Paar
  'vera_number', 'tcgdex_localId',
  // Name-Paar
  'vera_name', 'tcgdex_name',
  // Bild-Gruppen
  'vera_images_small', 'tcgdex_image_small',
  'vera_images_large', 'tcgdex_image_large',
  // Cardmarket (über Fallback auf Vera-Feld konsolidiert)
  'vera_cardmarket_url',
  // Vera-exklusive Kartendaten (tcgdex /sets/{id}.cards liefert nur id/localId/name/image)
  'vera_rarity', 'vera_hp', 'vera_types', 'vera_supertype', 'vera_subtypes',
  'vera_evolvesFrom', 'vera_artist', 'vera_regulationMark', 'vera_flavorText',
  'vera_nationalPokedexNumbers', 'vera_convertedRetreatCost', 'vera_retreatCost',
  'vera_legalities',
  // Fähigkeiten / Angriffe / Schwächen / Resistenzen
  'vera_abilities', 'vera_attacks', 'vera_weaknesses', 'vera_resistances',
  // Regeln
  'vera_rules'
];

function normalizeSeriesGroupKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const SERIES_GROUP_KEY_ALIASES = new Map([
  ['sword shield', 'swsh'],
  ['schwert schild', 'swsh'],
  ['scarlet violet', 'sv'],
  ['karmesin purpur', 'sv'],
  ['sun moon', 'sm'],
  ['sonne mond', 'sm'],
  ['black white', 'bw'],
  ['schwarz weiss', 'bw'],
  ['diamond pearl', 'dp'],
  ['diamant perl', 'dp'],
  ['heartgold soulsilver', 'hgss'],
  ['mega evolution', 'me'],
  ['mega entwicklung', 'me'],
  ['pokemon pocket', 'pocket'],
  ['pokemon sammelkartenspiel pocket', 'pocket']
]);

function inferSeriesGroupKeyFromSetIds(setRecord = {}) {
  const candidates = [setRecord.tcgdex_serie_id, setRecord.tcgdex_id, setRecord.vera_id, setRecord.setId]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);

  for (const candidate of candidates) {
    if (/^(swsh)/.test(candidate)) return 'swsh';
    if (/^(sv|rsv|zsv|hsp)/.test(candidate)) return 'sv';
    if (/^(sm)/.test(candidate)) return 'sm';
    if (/^(bw)/.test(candidate)) return 'bw';
    if (/^(xy)/.test(candidate)) return 'xy';
    if (/^(dp)/.test(candidate)) return 'dp';
    if (/^(hgss|hs)/.test(candidate)) return 'hgss';
    if (/^(ecard)/.test(candidate)) return 'ecard';
    if (/^(ex)/.test(candidate)) return 'ex';
    if (/^(neo)/.test(candidate)) return 'neo';
    if (/^(gym)/.test(candidate)) return 'gym';
    if (/^(base)/.test(candidate)) return 'base';
    if (/^(pop)/.test(candidate)) return 'pop';
  }

  return '';
}

function inferSeriesGroupKeyFromNames(setRecord = {}, displayLabel = '') {
  const nameCandidates = [setRecord.tcgdex_serie_name, setRecord.vera_series, displayLabel]
    .map((value) => normalizeSeriesGroupKey(value))
    .filter(Boolean);

  for (const candidate of nameCandidates) {
    if (SERIES_GROUP_KEY_ALIASES.has(candidate)) {
      return SERIES_GROUP_KEY_ALIASES.get(candidate);
    }
  }

  return '';
}

export function resolveSeriesGroupInfo(rawSetRecord = {}) {
  const setRecord = applyDeSeriesFallback(rawSetRecord, sharedDeSeriesBySetId);
  const displayLabel = resolveSetSeriesLabel(setRecord)
    || [setRecord.series, setRecord.vera_series, setRecord.tcgdex_serie_name]
      .map((value) => String(value || '').trim())
      .find(Boolean)
    || 'Andere';

  // Schluessel aus dem aufgeloesten Label statt aus tcgdex_serie_id: Zeilen derselben Serie liefern sonst je
  // nach gefuellter Serien-ID verschiedene Schluessel und erscheinen als doppelte Gruppe.
  const canonicalSeries = inferSeriesGroupKeyFromNames(setRecord, displayLabel)
    || (normalizeSeriesGroupKey(displayLabel) ? displayLabel : '')
    || String(setRecord.tcgdex_serie_id || '').trim()
    || inferSeriesGroupKeyFromSetIds(setRecord);

  return {
    key: normalizeSeriesGroupKey(canonicalSeries) || 'andere',
    label: displayLabel,
    canonicalName: String(setRecord.tcgdex_serie_name || '').trim() || displayLabel
  };
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeStringList(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function normalizeRules(primaryCard, tcgdexCard) {
  if (Array.isArray(primaryCard?.rules) && primaryCard.rules.length) return primaryCard.rules;
  if (Array.isArray(primaryCard?.abilities) && primaryCard.abilities.length) {
    return primaryCard.abilities
      .map((ability) => [ability?.type, ability?.name, ability?.text].filter(Boolean).join(': '))
      .filter(Boolean);
  }
  if (tcgdexCard?.description) return [String(tcgdexCard.description)];
  if (tcgdexCard?.effect) {
    if (typeof tcgdexCard.effect === 'string') return [tcgdexCard.effect];
    if (typeof tcgdexCard.effect === 'object') {
      return Object.values(tcgdexCard.effect).filter(Boolean).map((value) => String(value));
    }
  }
  return [];
}

function rewriteTcgdexImageQuality(url, quality) {
  const text = String(url || '').trim();
  if (!text) return '';
  const withExplicitExt = text.match(/\/(low|high)\.(png|jpe?g|webp)$/i);
  if (withExplicitExt) {
    const ext = String(withExplicitExt[2] || 'webp').toLowerCase();
    return text.replace(/\/(low|high)\.(png|jpe?g|webp)$/i, `/${quality}.${ext}`);
  }
  if (/\/(low|high)$/i.test(text)) {
    return text.replace(/\/(low|high)$/i, `/${quality}`);
  }
  return `${text}/${quality}.webp`;
}

function resolveTcgdexImage(tcgdexCard, quality = 'low', { setId = '', seriesId = '', language = 'en' } = {}) {
  const normalizedQuality = String(quality || '').toLowerCase() === 'high' ? 'high' : 'low';
  const imageValue = tcgdexCard?.image;
  if (typeof imageValue === 'string' && imageValue.trim()) {
    return rewriteTcgdexImageQuality(imageValue, normalizedQuality);
  }
  if (imageValue && typeof imageValue === 'object') {
    if (typeof imageValue[normalizedQuality] === 'string' && imageValue[normalizedQuality].trim()) {
      return imageValue[normalizedQuality].trim();
    }
    if (typeof imageValue.base === 'string' && imageValue.base.trim()) {
      return `${imageValue.base.trim()}/${normalizedQuality}.webp`;
    }
    if (typeof imageValue.low === 'string' && imageValue.low.trim()) {
      return rewriteTcgdexImageQuality(imageValue.low, normalizedQuality);
    }
    if (typeof imageValue.high === 'string' && imageValue.high.trim()) {
      return rewriteTcgdexImageQuality(imageValue.high, normalizedQuality);
    }
  }

  const localId = normalizeCardNumber(tcgdexCard?.localId || tcgdexCard?.id || '');
  const normalizedSetId = String(setId || '').trim();
  const normalizedSeriesId = String(seriesId || '').trim();
  if (!normalizedSetId || !normalizedSeriesId || !localId) return '';
  return `https://assets.tcgdex.net/${language}/${encodeURIComponent(normalizedSeriesId)}/${encodeURIComponent(normalizedSetId)}/${encodeURIComponent(localId)}/${normalizedQuality}.webp`;
}

function buildCardmarketFallback({ setTag = '', cardNumber = '' } = {}) {
  const normalizedSetTag = String(setTag || '').trim();
  const normalizedCardNumber = String(cardNumber || '').trim();
  if (!normalizedSetTag || !normalizedCardNumber) return '';

  const searchString = `${normalizedSetTag} ${normalizedCardNumber}`;
  return `https://www.cardmarket.com/de/Pokemon/Products/Search?searchMode=v2&searchString=${encodeURIComponent(searchString).replace(/%20/g, '+')}`;
}

function resolvePreferredCardmarketUrl(candidates = []) {
  const normalized = candidates
    .map((value) => String(value || '').trim())
    .filter((value) => /^https?:\/\//i.test(value));

  if (!normalized.length) return '';
  const direct = normalized.find((value) => !isGeneratedCardmarketSearchUrl(value));
  return direct || normalized[0] || '';
}

function resolveCardmarketUrl(primaryCard, tcgdexCard, fallbackMeta = {}) {
  const direct = resolvePreferredCardmarketUrl([
    primaryCard?.cardmarketUrl,
    primaryCard?.vera_cardmarket_url,
    primaryCard?.cardmarket?.url,
    tcgdexCard?.links?.cardmarket,
    primaryCard?.tcgdex_cardmarket_url
  ]);
  if (direct) return direct;
  return buildCardmarketFallback(fallbackMeta);
}

function resolveTcgdexSetFallbackValues(tcgdexSet = null, tcgdexFallbackSet = null) {
  const fallbackSet = tcgdexFallbackSet && typeof tcgdexFallbackSet === 'object' ? tcgdexFallbackSet : {};
  const currentSet = tcgdexSet && typeof tcgdexSet === 'object' ? tcgdexSet : {};

  return {
    name: String(fallbackSet?.name || currentSet?.en?.name || currentSet?.name || '').trim(),
    series: String(fallbackSet?.serie?.name || currentSet?.en?.serie?.name || currentSet?.serie?.name || '').trim(),
  };
}

function resolveTcgdexCardFallbackValues(tcgdexCard = null, tcgdexFallbackCard = null) {
  const fallbackCard = tcgdexFallbackCard && typeof tcgdexFallbackCard === 'object' ? tcgdexFallbackCard : {};
  const currentCard = tcgdexCard && typeof tcgdexCard === 'object' ? tcgdexCard : {};
  const sourceCard = Object.keys(fallbackCard).length ? fallbackCard : currentCard;

  return {
    name: String(sourceCard?.name || currentCard?.name || '').trim(),
  };
}

export function buildSetRecordFromSources({
  setId,
  primarySet = null,
  tcgdexSet = null,
  tcgdexFallbackSet = null,
  isTcgdexOnly = false,
  imported = false,
  updatedAt = null
} = {}) {
  const matchStatus = primarySet && tcgdexSet
    ? SET_MATCH_STATUS.MATCHED
    : (isTcgdexOnly ? SET_MATCH_STATUS.TCGDEX_ONLY : SET_MATCH_STATUS.PRIMARY_ONLY);
  const resolvedSetId = String(setId || primarySet?.id || (tcgdexSet?.id ? `TCGDEX-${tcgdexSet.id}` : '')).trim();
  const fallbackSetValues = !primarySet
    ? resolveTcgdexSetFallbackValues(tcgdexSet, tcgdexFallbackSet)
    : null;

  return {
    setId: resolvedSetId,
    imported: Boolean(imported),
    updatedAt: updatedAt || new Date().toISOString(),
    matchStatus,
    isTcgdexOnly: Boolean(isTcgdexOnly),
    // vera-Felder
    vera_id: primarySet?.id || '',
    vera_name: primarySet?.name || fallbackSetValues?.name || '',
    vera_series: primarySet?.series || fallbackSetValues?.series || '',
    vera_printedTotal: toNumber(primarySet?.printedTotal),
    vera_total: toNumber(primarySet?.total),
    vera_ptcgoCode: primarySet?.ptcgoCode || primarySet?.code || '',
    vera_releaseDate: primarySet?.releaseDate || '',
    vera_legalities: primarySet?.legalities || null,
    vera_images_symbol: primarySet?.images?.symbol || primarySet?.symbol || '',
    vera_images_logo: primarySet?.images?.logo || primarySet?.logo || '',
    // tcgdex-Felder
    tcgdex_id: tcgdexSet?.id || '',
    tcgdex_name: tcgdexSet?.name || '',
    tcgdex_serie_id: tcgdexSet?.serie?.id || '',
    tcgdex_serie_name: tcgdexSet?.serie?.name || '',
    tcgdex_abbreviation_official: tcgdexSet?.abbreviation?.official || '',
    tcgdex_releaseDate: tcgdexSet?.releaseDate || '',
    tcgdex_legal: tcgdexSet?.legal || null,
    tcgdex_logo: normalizeTcgdexSetAssetUrl(tcgdexSet?.logo || ''),
    tcgdex_symbol: normalizeTcgdexSetAssetUrl(tcgdexSet?.symbol || ''),
    tcgdex_cardCount_official: toNumber(tcgdexSet?.cardCount?.official),
    tcgdex_cardCount_total: toNumber(tcgdexSet?.cardCount?.total),
    tcgdex_cardCount_holo: toNumber(tcgdexSet?.cardCount?.holo),
    tcgdex_cardCount_reverse: toNumber(tcgdexSet?.cardCount?.reverse),
    tcgdex_cardCount_firstEdition: toNumber(tcgdexSet?.cardCount?.firstEd),
    tcgdex_cardCount_normal: toNumber(tcgdexSet?.cardCount?.normal)
  };
}

export function buildCardRecordFromSources({
  setId,
  primaryCard = null,
  tcgdexCard = null,
  tcgdexFallbackCard = null,
  tcgdexSetId = '',
  tcgdexSeriesId = '',
  fallbackSetName = '',
  fallbackSetTag = '',
  fallbackImageSmall = '',
  fallbackImageLarge = '',
  updatedAt = null
} = {}) {
  const sourceCardNumber = String(primaryCard?.number || tcgdexCard?.localId || tcgdexCard?.id || '').trim();
  const normalizedNumber = normalizeCardNumber(primaryCard?.number || tcgdexCard?.localId || tcgdexCard?.id || '');
  const matchStatus = primaryCard && tcgdexCard
    ? CARD_MATCH_STATUS.MATCHED
    : (tcgdexCard ? CARD_MATCH_STATUS.TCGDEX_ONLY : CARD_MATCH_STATUS.PRIMARY_ONLY);
  const rules = normalizeRules(primaryCard, tcgdexCard);
  const tcgdexImageSmall = resolveTcgdexImage(tcgdexCard, 'low', { setId: tcgdexSetId || setId, seriesId: tcgdexSeriesId });
  const tcgdexImageLarge = resolveTcgdexImage(tcgdexCard, 'high', { setId: tcgdexSetId || setId, seriesId: tcgdexSeriesId });
  const fallbackCardValues = !primaryCard
    ? resolveTcgdexCardFallbackValues(tcgdexCard, tcgdexFallbackCard)
    : null;
  const imageUrl = tcgdexImageSmall
    || primaryCard?.images?.small
    || fallbackImageSmall
    || (setId && normalizedNumber ? `https://images.pokemontcg.io/${encodeURIComponent(setId)}/${encodeURIComponent(normalizedNumber)}.png` : '');
  const imageLargeUrl = tcgdexImageLarge
    || primaryCard?.images?.large
    || fallbackImageLarge
    || imageUrl;
  const cardmarketUrl = resolveCardmarketUrl(primaryCard, tcgdexFallbackCard || tcgdexCard, {
    cardName: tcgdexFallbackCard?.name || tcgdexCard?.name || primaryCard?.name || normalizedNumber,
    setTag: fallbackSetTag,
    setName: fallbackSetName,
    cardNumber: sourceCardNumber
  });

  return {
    setId: String(setId || '').trim(),
    cardId: primaryCard?.id || tcgdexCard?.id || normalizedNumber,
    updatedAt: updatedAt || new Date().toISOString(),
    matchStatus,
    isPrimaryOnly: Boolean(primaryCard && !tcgdexCard),
    isTcgdexOnly: Boolean(tcgdexCard && !primaryCard),
    // vera-Felder
    vera_id: primaryCard?.id || '',
    vera_name: primaryCard?.name || fallbackCardValues?.name || '',
    vera_supertype: primaryCard?.supertype || '',
    vera_subtypes: Array.isArray(primaryCard?.subtypes) ? primaryCard.subtypes : [],
    vera_hp: primaryCard?.hp ? String(primaryCard.hp) : '',
    vera_types: Array.isArray(primaryCard?.types) ? primaryCard.types : [],
    vera_evolvesFrom: primaryCard?.evolvesFrom || '',
    vera_abilities: Array.isArray(primaryCard?.abilities) ? primaryCard.abilities : [],
    vera_attacks: Array.isArray(primaryCard?.attacks) ? primaryCard.attacks : [],
    vera_weaknesses: Array.isArray(primaryCard?.weaknesses) ? primaryCard.weaknesses : [],
    vera_resistances: Array.isArray(primaryCard?.resistances) ? primaryCard.resistances : [],
    vera_retreatCost: normalizeStringList(primaryCard?.retreatCost),
    vera_convertedRetreatCost: toNumber(primaryCard?.convertedRetreatCost),
    vera_number: primaryCard?.number || '',
    vera_artist: primaryCard?.artist || '',
    vera_rarity: primaryCard?.rarity || '',
    vera_flavorText: primaryCard?.flavorText || '',
    vera_nationalPokedexNumbers: Array.isArray(primaryCard?.nationalPokedexNumbers) ? primaryCard.nationalPokedexNumbers : [],
    vera_legalities: primaryCard?.legalities || null,
    vera_regulationMark: primaryCard?.regulationMark || '',
    vera_rules: Array.isArray(primaryCard?.rules) ? primaryCard.rules : [],
    vera_images_small: primaryCard?.images?.small || '',
    vera_images_large: primaryCard?.images?.large || '',
    vera_cardmarket_url: cardmarketUrl || '',
    // tcgdex-Felder
    tcgdex_id: tcgdexCard?.id || '',
    tcgdex_name: tcgdexCard?.name || '',
    tcgdex_localId: tcgdexCard?.localId || '',
    tcgdex_image_small: tcgdexImageSmall || fallbackImageSmall || '',
    tcgdex_image_large: tcgdexImageLarge || fallbackImageLarge || imageLargeUrl || '',
    tcgdex_cardmarket_url: String(tcgdexCard?.links?.cardmarket || cardmarketUrl || '').trim(),
    tcgdex_rarity: tcgdexCard?.rarity || '',
    tcgdex_hp: tcgdexCard?.hp != null && tcgdexCard?.hp !== '' ? String(tcgdexCard.hp) : '',
    tcgdex_types: normalizeStringList(tcgdexCard?.types),
    tcgdex_category: tcgdexCard?.category || '',
    tcgdex_stage: tcgdexCard?.stage || '',
    tcgdex_suffix: tcgdexCard?.suffix || '',
    tcgdex_evolvesFrom: tcgdexCard?.evolveFrom || tcgdexCard?.evolvesFrom || '',
    tcgdex_illustrator: tcgdexCard?.illustrator || '',
    tcgdex_regulationMark: tcgdexCard?.regulationMark || '',
    tcgdex_description: typeof tcgdexCard?.description === 'string'
      ? tcgdexCard.description
      : (tcgdexCard?.description?.en || Object.values(tcgdexCard?.description || {}).find(Boolean) || ''),
    tcgdex_effect: tcgdexCard?.effect || null
  };
}

// Serien-Label eines Sets je Sprache. DE: tcgdex_serie_name -> i18n_de.series -> deSeriesBySetId
// (Map setId -> i18n.de.series aus api/v3) -> vera_series; EN: vera_series -> series.
let sharedDeSeriesBySetId = null;
// Gemeinsame v3-Set-Meta (setId -> { deName, deSeries }); eine Quelle fuer DE-Setnamen und DE-Serien.
let sharedV3SetMeta = null;
export function setV3SetMeta(meta) {
  sharedV3SetMeta = meta instanceof Map ? meta : null;
  sharedDeSeriesBySetId = null;
  if (sharedV3SetMeta) {
    sharedDeSeriesBySetId = new Map();
    for (const [id, m] of sharedV3SetMeta) if (m?.deSeries) sharedDeSeriesBySetId.set(id, m.deSeries);
  }
}
// Gemeinsame v3-Map (setId -> DE-Serie); einmal gesetzt, nutzen alle Gruppen-/Label-Pfade sie.
export function setDeSeriesBySetId(map) {
  sharedDeSeriesBySetId = map instanceof Map ? map : null;
}

export function resolveSetSeriesLabel(set = {}, language = getCardLanguage(), deSeriesBySetId = sharedDeSeriesBySetId) {
  const text = (v) => String(v ?? '').trim();
  const fromMap = deSeriesBySetId?.get?.(text(set?.setId)) || '';
  const candidates = normalizeCardLanguage(language) === 'en'
    ? [set?.vera_series, set?.series, set?.i18n_de?.series, fromMap, set?.tcgdex_serie_name]
    : [set?.tcgdex_serie_name, set?.i18n_de?.series, fromMap, set?.vera_series, set?.series];
  return candidates.map(text).find(Boolean) || '';
}

// Ergaenzt eine leere tcgdex_serie_name aus der v3-Map (setId -> DE-Serie); bestehende Werte bleiben.
export function applyDeSeriesFallback(set = {}, deSeriesBySetId = null) {
  if (String(set?.tcgdex_serie_name || '').trim()) return set;
  const de = String(deSeriesBySetId?.get?.(String(set?.setId ?? '').trim()) || '').trim();
  return de ? { ...set, tcgdex_serie_name: de } : set;
}

// Gesamtzahl der Karten eines Sets (inkl. Secret Rares): vera_total, dann DE total, dann totalCards.
export function resolveSetTotalCards(set = {}) {
  return toNumber(set?.vera_total) || toNumber(set?.tcgdex_cardCount_total) || toNumber(set?.totalCards);
}

export function resolveDisplaySet(setRecord = {}) {
  const record = setRecord || {};
  const language = getCardLanguage();
  const field = (name) => resolveFieldValue(record, 'set', name, language);

  const series = resolveSetSeriesLabel(record, language);
  const seriesGroup = resolveSeriesGroupInfo({ ...record, series });

  return {
    ...record,
    setName: field('setName'),
    series,
    seriesGroupKey: seriesGroup.key,
    seriesGroupLabel: seriesGroup.label,
    seriesCanonicalName: seriesGroup.canonicalName,
    releaseDate: field('releaseDate'),
    totalCards: field('totalCards'),
    ptcgoCode: field('ptcgoCode'),
    logoUrl: field('logoUrl'),
    symbolUrl: field('symbolUrl'),
    legacyLogoUrl: legacyMedia(record, 'legacyLogoUrl'),
    legacySymbolUrl: legacyMedia(record, 'legacySymbolUrl'),
    tcgdexId: record.tcgdex_id || '',
    tcgdexName: record.tcgdex_name || '',
    legalities: field('legalities'),
    cardCountTotal: toNumber(record.tcgdex_cardCount_total),
    cardCountHolo: toNumber(record.tcgdex_cardCount_holo),
    cardCountReverse: toNumber(record.tcgdex_cardCount_reverse),
    cardCountFirstEdition: toNumber(record.tcgdex_cardCount_firstEdition),
    cardCountNormal: toNumber(record.tcgdex_cardCount_normal)
  };
}

export function resolveDisplayCard(cardRecord = {}) {
  const record = cardRecord || {};
  const language = getCardLanguage();
  const field = (name) => resolveFieldValue(record, 'card', name, language);

  const image = field('image');
  const imageLarge = field('imageLarge') || image;
  // Produkt-ID (v3 > Legacy-URL) -> Produkt-URL in der Kartensprache; ohne ID die generierte Such-URL.
  const cardmarketUrl = resolveCardmarketLink(record, { language });

  return {
    ...record,
    number: field('number'),
    name: field('name'),
    image,
    imageUrl: image,
    imageLarge,
    imageLargeUrl: imageLarge,
    legacyImage: legacyMedia(record, 'legacyImage'),
    legacyImageLarge: legacyMedia(record, 'legacyImageLarge'),
    cardmarketUrl,
    rarity: field('rarity'),
    hp: field('hp'),
    types: field('types'),
    supertype: field('supertype'),
    subtypes: field('subtypes'),
    evolvesFrom: field('evolvesFrom'),
    artist: field('artist'),
    regulationMark: field('regulationMark'),
    rules: field('rules'),
    flavorText: field('flavorText'),
    attacks: field('attacks'),
    abilities: field('abilities')
  };
}
