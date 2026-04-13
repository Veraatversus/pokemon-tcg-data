import { normalizeCardNumber } from '../core/utils.js';
import { scopedStorageKey } from '../core/config.js';

const SETTINGS_STORAGE_KEY = scopedStorageKey('user-settings');
const RESOLVER_SOURCES = ['tcgdex', 'vera', 'legacy'];

const DEFAULT_RESOLVER_MATRIX = {
  set: {
    setName: ['tcgdex', 'vera', 'legacy'],
    series: ['tcgdex', 'vera', 'legacy'],
    releaseDate: ['tcgdex', 'vera', 'legacy'],
    totalCards: ['tcgdex', 'vera', 'legacy'],
    ptcgoCode: ['tcgdex', 'vera', 'legacy'],
    logoUrl: ['tcgdex', 'vera', 'legacy'],
    symbolUrl: ['tcgdex', 'vera', 'legacy'],
    legalities: ['tcgdex', 'vera', 'legacy']
  },
  card: {
    number: ['tcgdex', 'vera', 'legacy'],
    name: ['tcgdex', 'vera', 'legacy'],
    image: ['tcgdex', 'vera', 'legacy'],
    imageLarge: ['tcgdex', 'vera', 'legacy'],
    cardmarketUrl: ['tcgdex', 'vera', 'legacy'],
    rarity: ['tcgdex', 'vera', 'legacy'],
    hp: ['tcgdex', 'vera', 'legacy'],
    types: ['tcgdex', 'vera', 'legacy'],
    supertype: ['tcgdex', 'vera', 'legacy'],
    subtypes: ['tcgdex', 'vera', 'legacy'],
    evolvesFrom: ['tcgdex', 'vera', 'legacy'],
    artist: ['tcgdex', 'vera', 'legacy'],
    regulationMark: ['tcgdex', 'vera', 'legacy'],
    rules: ['tcgdex', 'vera', 'legacy'],
    flavorText: ['tcgdex', 'vera', 'legacy']
  }
};

let resolverMatrixCache = null;

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isValuePresent(value, { numeric = false } = {}) {
  if (value == null) return false;
  if (numeric) return Number(value) > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return String(value).trim() !== '';
}

function normalizePriority(priority, fallback) {
  if (!Array.isArray(priority) || priority.length === 0) return fallback;
  const normalized = [];
  priority.forEach((entry) => {
    const source = String(entry || '').trim().toLowerCase();
    if (RESOLVER_SOURCES.includes(source) && !normalized.includes(source)) {
      normalized.push(source);
    }
  });
  if (normalized.length === 0) return fallback;
  RESOLVER_SOURCES.forEach((source) => {
    if (!normalized.includes(source)) normalized.push(source);
  });
  return normalized;
}

function normalizeResolverMatrix(input) {
  const defaults = DEFAULT_RESOLVER_MATRIX;
  const normalized = deepClone(defaults);
  if (!input || typeof input !== 'object') return normalized;

  ['set', 'card'].forEach((scope) => {
    const scopeInput = input?.[scope];
    if (!scopeInput || typeof scopeInput !== 'object') return;
    Object.keys(defaults[scope]).forEach((field) => {
      normalized[scope][field] = normalizePriority(scopeInput[field], defaults[scope][field]);
    });
  });

  return normalized;
}

function getResolverMatrix() {
  if (resolverMatrixCache) return resolverMatrixCache;
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      resolverMatrixCache = deepClone(DEFAULT_RESOLVER_MATRIX);
      return resolverMatrixCache;
    }
    const parsed = JSON.parse(raw);
    resolverMatrixCache = normalizeResolverMatrix(parsed?.resolverMatrix || null);
    return resolverMatrixCache;
  } catch {
    resolverMatrixCache = deepClone(DEFAULT_RESOLVER_MATRIX);
    return resolverMatrixCache;
  }
}

function resolveFieldByPriority(priority, sourceValues, options = {}) {
  const fallback = options?.fallback;
  for (const source of priority) {
    const value = sourceValues?.[source];
    if (isValuePresent(value, options)) {
      return value;
    }
  }
  return fallback;
}

function normalizeTcgdexSetAssetUrl(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return '';
  if (/^https?:\/\/assets\.tcgdex\.net\/.+\/(logo|symbol)$/i.test(text)) {
    return `${text}.webp`;
  }
  return text;
}

function sanitizeMediaValue(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return '';
  if (/pokeball-fallback\.svg/i.test(text)) return '';
  return normalizeTcgdexSetAssetUrl(text);
}

function collectValuesByPriority(priority, sourceValues, options = {}) {
  const values = [];
  const seen = new Set();
  const pushIfPresent = (value) => {
    if (!isValuePresent(value, options)) return;
    const normalized = typeof value === 'string' ? value.trim() : value;
    const key = typeof normalized === 'string' ? normalized : JSON.stringify(normalized);
    if (seen.has(key)) return;
    seen.add(key);
    values.push(normalized);
  };

  for (const source of priority) {
    pushIfPresent(sourceValues?.[source]);
  }
  pushIfPresent(options?.fallback);
  return values;
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

export function resolveSeriesGroupInfo(setRecord = {}) {
  const displayLabel = [setRecord.series, setRecord.vera_series, setRecord.tcgdex_serie_name]
    .map((value) => String(value || '').trim())
    .find(Boolean) || 'Andere';

  const canonicalSeries = String(setRecord.tcgdex_serie_id || '').trim()
    || inferSeriesGroupKeyFromSetIds(setRecord)
    || inferSeriesGroupKeyFromNames(setRecord, displayLabel)
    || String(setRecord.tcgdex_serie_name || '').trim()
    || String(setRecord.vera_series || '').trim()
    || displayLabel;

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

function normalizeTcgdexAssetBase(imageValue) {
  if (typeof imageValue === 'string' && imageValue.trim()) {
    return imageValue.trim().replace(/\/(low|high)\.(png|jpe?g|webp)$/i, '');
  }
  if (imageValue && typeof imageValue === 'object') {
    if (typeof imageValue.base === 'string' && imageValue.base.trim()) {
      return imageValue.base.trim();
    }
    if (typeof imageValue.low === 'string' && imageValue.low.trim()) {
      return imageValue.low.trim().replace(/\/(low|high)\.(png|jpe?g|webp)$/i, '');
    }
    if (typeof imageValue.high === 'string' && imageValue.high.trim()) {
      return imageValue.high.trim().replace(/\/(low|high)\.(png|jpe?g|webp)$/i, '');
    }
  }
  return '';
}

function resolveTcgdexImage(tcgdexCard, quality = 'low', { setId = '', seriesId = '', language = 'en' } = {}) {
  const normalizedQuality = String(quality || '').toLowerCase() === 'high' ? 'high' : 'low';
  const base = normalizeTcgdexAssetBase(tcgdexCard?.image);
  if (base) {
    return `${base}/${normalizedQuality}.webp`;
  }

  const localId = normalizeCardNumber(tcgdexCard?.localId || tcgdexCard?.id || '');
  const normalizedSetId = String(setId || '').trim();
  const normalizedSeriesId = String(seriesId || '').trim();
  if (!normalizedSetId || !normalizedSeriesId || !localId) return '';
  return `https://assets.tcgdex.net/${language}/${encodeURIComponent(normalizedSeriesId)}/${encodeURIComponent(normalizedSetId)}/${encodeURIComponent(localId)}/${normalizedQuality}.webp`;
}

function buildCardmarketFallback({ cardName = '', setTag = '', setName = '', cardNumber = '' } = {}) {
  const searchString = [setTag && cardNumber ? `${setTag} ${cardNumber}` : '', cardName, setName]
    .filter(Boolean)
    .join(' ')
    .trim();
  if (!searchString) return '';
  return `https://www.cardmarket.com/de/Pokemon/Products/Search?searchString=${encodeURIComponent(searchString).replace(/%20/g, '+')}`;
}

function isGeneratedCardmarketSearchUrl(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized.includes('cardmarket.com') && normalized.includes('/products/search') && normalized.includes('searchstring=');
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

export function buildSetRecordFromSources({
  setId,
  primarySet = null,
  tcgdexSet = null,
  isTcgdexOnly = false,
  imported = false,
  updatedAt = null
} = {}) {
  const matchStatus = primarySet && tcgdexSet
    ? SET_MATCH_STATUS.MATCHED
    : (isTcgdexOnly ? SET_MATCH_STATUS.TCGDEX_ONLY : SET_MATCH_STATUS.PRIMARY_ONLY);
  const resolvedSetId = String(setId || primarySet?.id || (tcgdexSet?.id ? `TCGDEX-${tcgdexSet.id}` : '')).trim();
  return {
    setId: resolvedSetId,
    imported: Boolean(imported),
    updatedAt: updatedAt || new Date().toISOString(),
    matchStatus,
    isTcgdexOnly: Boolean(isTcgdexOnly),
    // vera-Felder
    vera_id: primarySet?.id || '',
    vera_name: primarySet?.name || '',
    vera_series: primarySet?.series || '',
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
  tcgdexSetId = '',
  tcgdexSeriesId = '',
  fallbackSetName = '',
  fallbackSetTag = '',
  fallbackImageSmall = '',
  fallbackImageLarge = '',
  updatedAt = null
} = {}) {
  const normalizedNumber = normalizeCardNumber(primaryCard?.number || tcgdexCard?.localId || tcgdexCard?.id || '');
  const matchStatus = primaryCard && tcgdexCard
    ? CARD_MATCH_STATUS.MATCHED
    : (tcgdexCard ? CARD_MATCH_STATUS.TCGDEX_ONLY : CARD_MATCH_STATUS.PRIMARY_ONLY);
  const rules = normalizeRules(primaryCard, tcgdexCard);
  const tcgdexImageSmall = resolveTcgdexImage(tcgdexCard, 'low', { setId: tcgdexSetId || setId, seriesId: tcgdexSeriesId });
  const tcgdexImageLarge = resolveTcgdexImage(tcgdexCard, 'high', { setId: tcgdexSetId || setId, seriesId: tcgdexSeriesId });
  const imageUrl = tcgdexImageSmall
    || primaryCard?.images?.small
    || fallbackImageSmall
    || (setId && normalizedNumber ? `https://images.pokemontcg.io/${encodeURIComponent(setId)}/${encodeURIComponent(normalizedNumber)}.png` : '');
  const imageLargeUrl = tcgdexImageLarge
    || primaryCard?.images?.large
    || fallbackImageLarge
    || imageUrl;
  const isOnlyTcgdex = Boolean(tcgdexCard && !primaryCard);
  const vera_name_val_pre = primaryCard?.name || (isOnlyTcgdex ? (tcgdexCard?.name || '') : '');
  const cardmarketUrl = resolveCardmarketUrl(primaryCard, tcgdexCard, {
    cardName: vera_name_val_pre || primaryCard?.name || tcgdexCard?.name || normalizedNumber,
    setTag: fallbackSetTag,
    setName: fallbackSetName,
    cardNumber: normalizedNumber
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
    vera_name: vera_name_val_pre || primaryCard?.name || '',
    vera_supertype: primaryCard?.supertype || '',
    vera_subtypes: normalizeStringList(primaryCard?.subtypes),
    vera_hp: primaryCard?.hp ? String(primaryCard.hp) : '',
    vera_types: normalizeStringList(primaryCard?.types),
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

export function resolveDisplaySet(setRecord = {}) {
  const matrix = getResolverMatrix().set;
  const setName = resolveFieldByPriority(matrix.setName, {
    tcgdex: setRecord.tcgdex_name,
    vera: setRecord.vera_name
  }, { fallback: setRecord.vera_name || setRecord.tcgdex_name || '' });

  const series = resolveFieldByPriority(matrix.series, {
    tcgdex: setRecord.tcgdex_serie_name,
    vera: setRecord.vera_series
  }, { fallback: setRecord.vera_series || setRecord.tcgdex_serie_name || '' });
  const seriesGroup = resolveSeriesGroupInfo({ ...setRecord, series });

  const releaseDate = resolveFieldByPriority(matrix.releaseDate, {
    tcgdex: setRecord.tcgdex_releaseDate,
    vera: setRecord.vera_releaseDate
  }, { fallback: setRecord.vera_releaseDate || setRecord.tcgdex_releaseDate || '' });

  const totalCards = resolveFieldByPriority(matrix.totalCards, {
    tcgdex: toNumber(setRecord.tcgdex_cardCount_official),
    vera: toNumber(setRecord.vera_total) || toNumber(setRecord.vera_printedTotal)
  }, { numeric: true, fallback: toNumber(setRecord.vera_total) || toNumber(setRecord.tcgdex_cardCount_official) });

  const ptcgoCode = resolveFieldByPriority(matrix.ptcgoCode, {
    tcgdex: setRecord.tcgdex_abbreviation_official,
    vera: setRecord.vera_ptcgoCode
  }, { fallback: setRecord.vera_ptcgoCode || setRecord.tcgdex_abbreviation_official || '' });

  const logoUrlCandidates = collectValuesByPriority(matrix.logoUrl, {
    tcgdex: sanitizeMediaValue(setRecord.tcgdex_logo),
    vera: sanitizeMediaValue(setRecord.vera_images_logo),
    legacy: sanitizeMediaValue(setRecord.logoUrl)
  }, {
    fallback: sanitizeMediaValue(setRecord.vera_images_logo)
      || sanitizeMediaValue(setRecord.tcgdex_logo)
      || sanitizeMediaValue(setRecord.logoUrl)
      || ''
  });
  const logoUrl = logoUrlCandidates[0] || '';

  const symbolUrlCandidates = collectValuesByPriority(matrix.symbolUrl, {
    tcgdex: sanitizeMediaValue(setRecord.tcgdex_symbol),
    vera: sanitizeMediaValue(setRecord.vera_images_symbol),
    legacy: sanitizeMediaValue(setRecord.symbolUrl)
  }, {
    fallback: sanitizeMediaValue(setRecord.vera_images_symbol)
      || sanitizeMediaValue(setRecord.tcgdex_symbol)
      || sanitizeMediaValue(setRecord.symbolUrl)
      || ''
  });
  const symbolUrl = symbolUrlCandidates[0] || '';

  const legalities = resolveFieldByPriority(matrix.legalities, {
    tcgdex: setRecord.tcgdex_legal,
    vera: setRecord.vera_legalities
  }, { fallback: setRecord.vera_legalities || setRecord.tcgdex_legal || null });

  return {
    ...setRecord,
    setName,
    series,
    seriesGroupKey: seriesGroup.key,
    seriesGroupLabel: seriesGroup.label,
    seriesCanonicalName: seriesGroup.canonicalName,
    releaseDate,
    totalCards,
    ptcgoCode,
    logoUrl,
    logoUrlCandidates,
    symbolUrl,
    symbolUrlCandidates,
    tcgdexId: setRecord.tcgdex_id || '',
    tcgdexName: setRecord.tcgdex_name || '',
    legalities,
    cardCountTotal: toNumber(setRecord.tcgdex_cardCount_total),
    cardCountHolo: toNumber(setRecord.tcgdex_cardCount_holo),
    cardCountReverse: toNumber(setRecord.tcgdex_cardCount_reverse),
    cardCountFirstEdition: toNumber(setRecord.tcgdex_cardCount_firstEdition),
    cardCountNormal: toNumber(setRecord.tcgdex_cardCount_normal)
  };
}

export function resolveDisplayCard(cardRecord = {}) {
  const matrix = getResolverMatrix().card;
  const rules = Array.isArray(cardRecord.vera_rules) && cardRecord.vera_rules.length
    ? cardRecord.vera_rules
    : normalizeRules(null, {
      description: cardRecord.tcgdex_description,
      effect: cardRecord.tcgdex_effect
    });

  const number = resolveFieldByPriority(matrix.number, {
    tcgdex: normalizeCardNumber(cardRecord.tcgdex_localId || ''),
    vera: normalizeCardNumber(cardRecord.vera_number || '')
  }, { fallback: cardRecord.vera_number || cardRecord.tcgdex_localId || '' });

  const name = resolveFieldByPriority(matrix.name, {
    tcgdex: cardRecord.tcgdex_name,
    vera: cardRecord.vera_name
  }, { fallback: cardRecord.vera_name || cardRecord.tcgdex_name || '' });

  const imageCandidates = collectValuesByPriority(matrix.image, {
    tcgdex: sanitizeMediaValue(cardRecord.tcgdex_image_small || cardRecord.tcgdex_image),
    vera: sanitizeMediaValue(cardRecord.vera_images_small),
    legacy: sanitizeMediaValue(cardRecord.image || cardRecord.imageUrl)
  }, {
    fallback: sanitizeMediaValue(cardRecord.vera_images_small)
      || sanitizeMediaValue(cardRecord.tcgdex_image_small || cardRecord.tcgdex_image)
      || sanitizeMediaValue(cardRecord.image)
      || sanitizeMediaValue(cardRecord.imageUrl)
      || ''
  });
  const image = imageCandidates[0] || '';

  const imageLargeCandidates = collectValuesByPriority(matrix.imageLarge, {
    tcgdex: sanitizeMediaValue(cardRecord.tcgdex_image_large),
    vera: sanitizeMediaValue(cardRecord.vera_images_large),
    legacy: sanitizeMediaValue(cardRecord.imageLarge || cardRecord.imageLargeUrl || cardRecord.image || cardRecord.imageUrl)
  }, {
    fallback: sanitizeMediaValue(cardRecord.vera_images_large)
      || sanitizeMediaValue(cardRecord.tcgdex_image_large)
      || sanitizeMediaValue(cardRecord.imageLarge)
      || sanitizeMediaValue(cardRecord.imageLargeUrl)
      || sanitizeMediaValue(cardRecord.vera_images_small)
      || sanitizeMediaValue(cardRecord.tcgdex_image_small || cardRecord.tcgdex_image)
      || sanitizeMediaValue(cardRecord.image)
      || sanitizeMediaValue(cardRecord.imageUrl)
      || ''
  });
  const imageLarge = imageLargeCandidates[0] || image || '';

  const cardmarketUrlCandidates = collectValuesByPriority(matrix.cardmarketUrl, {
    tcgdex: cardRecord.tcgdex_cardmarket_url,
    vera: cardRecord.vera_cardmarket_url,
    legacy: cardRecord.cardmarketUrl || cardRecord.cardmarket_url || cardRecord.cardmarket?.url || ''
  }, {
    fallback: cardRecord.cardmarketUrl || cardRecord.vera_cardmarket_url || cardRecord.tcgdex_cardmarket_url || ''
  });
  const cardmarketUrl = resolvePreferredCardmarketUrl(cardmarketUrlCandidates);

  const rarity = resolveFieldByPriority(matrix.rarity, {
    tcgdex: cardRecord.tcgdex_rarity,
    vera: cardRecord.vera_rarity
  }, { fallback: cardRecord.vera_rarity || cardRecord.tcgdex_rarity || '' });

  const hp = resolveFieldByPriority(matrix.hp, {
    tcgdex: cardRecord.tcgdex_hp,
    vera: cardRecord.vera_hp
  }, { fallback: cardRecord.vera_hp || cardRecord.tcgdex_hp || '' });

  const types = resolveFieldByPriority(matrix.types, {
    tcgdex: Array.isArray(cardRecord.tcgdex_types) ? cardRecord.tcgdex_types : [],
    vera: Array.isArray(cardRecord.vera_types) ? cardRecord.vera_types : []
  }, { fallback: cardRecord.vera_types || cardRecord.tcgdex_types || [] });

  const supertype = resolveFieldByPriority(matrix.supertype, {
    tcgdex: cardRecord.tcgdex_category,
    vera: cardRecord.vera_supertype
  }, { fallback: cardRecord.vera_supertype || cardRecord.tcgdex_category || '' });

  const subtypes = resolveFieldByPriority(matrix.subtypes, {
    tcgdex: [cardRecord.tcgdex_stage || cardRecord.tcgdex_suffix].filter(Boolean),
    vera: Array.isArray(cardRecord.vera_subtypes) ? cardRecord.vera_subtypes : []
  }, { fallback: cardRecord.vera_subtypes || [cardRecord.tcgdex_stage, cardRecord.tcgdex_suffix].filter(Boolean) || [] });

  const evolvesFrom = resolveFieldByPriority(matrix.evolvesFrom, {
    tcgdex: cardRecord.tcgdex_evolvesFrom,
    vera: cardRecord.vera_evolvesFrom
  }, { fallback: cardRecord.vera_evolvesFrom || cardRecord.tcgdex_evolvesFrom || '' });

  const artist = resolveFieldByPriority(matrix.artist, {
    tcgdex: cardRecord.tcgdex_illustrator,
    vera: cardRecord.vera_artist
  }, { fallback: cardRecord.vera_artist || cardRecord.tcgdex_illustrator || '' });

  const regulationMark = resolveFieldByPriority(matrix.regulationMark, {
    tcgdex: cardRecord.tcgdex_regulationMark,
    vera: cardRecord.vera_regulationMark
  }, { fallback: cardRecord.vera_regulationMark || cardRecord.tcgdex_regulationMark || '' });

  const resolvedRules = resolveFieldByPriority(matrix.rules, {
    tcgdex: normalizeRules(null, {
      description: cardRecord.tcgdex_description,
      effect: cardRecord.tcgdex_effect
    }),
    vera: Array.isArray(cardRecord.vera_rules) ? cardRecord.vera_rules : []
  }, { fallback: rules });

  const flavorText = resolveFieldByPriority(matrix.flavorText, {
    tcgdex: cardRecord.tcgdex_description,
    vera: cardRecord.vera_flavorText
  }, { fallback: cardRecord.vera_flavorText || cardRecord.tcgdex_description || '' });

  return {
    ...cardRecord,
    number,
    name,
    image,
    imageUrl: image,
    imageCandidates,
    imageLarge,
    imageLargeUrl: imageLarge,
    imageLargeCandidates,
    cardmarketUrl,
    rarity,
    hp,
    types,
    supertype,
    subtypes,
    evolvesFrom,
    artist,
    regulationMark,
    rules: resolvedRules,
    flavorText
  };
}