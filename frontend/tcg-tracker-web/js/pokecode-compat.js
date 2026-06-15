import { normalizeCardNumber, naturalSort } from './core/utils.js';
import { isGeneratedCardmarketSearchUrl } from './data/cardmarket-url-utils.js';
import { buildCardRecordFromSources, buildSetRecordFromSources } from './data/schema-contract.js?v=20260613-tcgdex-merge-fix-v2';

export function normalizeString(str) {
  if (str === null || typeof str === 'undefined') {
    return '';
  }
  return String(str).toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function normalizeSetId(setId) {
  if (!setId) return '';
  let normalized = String(setId).toLowerCase().trim();
  normalized = normalized.replace(/(\d+)\.(\d+)/g, (_match, p1, p2) => `${parseInt(p1, 10)}pt${parseInt(p2, 10)}`);
  normalized = normalized.replace(/\s+/g, '-');
  normalized = normalized.replace(/[^a-z0-9-]/g, '');
  normalized = normalized.replace(/([a-z-]+)(\d+)/g, (_match, p1, p2) => p1 + parseInt(p2, 10));
  return normalized;
}

export function buildSetIdAliasCandidates(setId, customMappings = {}) {
  if (!setId) return [];

  const raw = String(setId).trim();
  const unprefixed = raw.replace(/^TCGDEX-/i, '');
  const candidates = new Set([raw, unprefixed]);
  const baseKeys = [raw.toLowerCase(), unprefixed.toLowerCase()];

  baseKeys.forEach((key) => {
    const mapped = customMappings[key];
    if (mapped) candidates.add(mapped);
  });

  const normalizedBase = normalizeSetId(unprefixed);
  for (const [pokeId, tcgdexId] of Object.entries(customMappings || {})) {
    if (
      String(tcgdexId).toLowerCase() === unprefixed.toLowerCase()
      || normalizeSetId(tcgdexId) === normalizedBase
    ) {
      candidates.add(pokeId);
    }
  }

  return Array.from(candidates).filter(Boolean);
}

function isStandaloneTrainerGallerySet(set) {
  const setName = String(set?.name || '').trim();
  const normalizedSetId = normalizeSetId(set?.id || '');
  return Boolean(setName)
    && /trainer gallery$/i.test(setName)
    && /tg$/i.test(normalizedSetId);
}

function tokenizeSetName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function isSafePartialSetNameMatch(leftName, rightName) {
  const leftTokens = tokenizeSetName(leftName);
  const rightTokens = tokenizeSetName(rightName);

  if (!leftTokens.length || !rightTokens.length) return false;
  if (leftTokens.join('') === rightTokens.join('')) return true;

  const shorter = leftTokens.length <= rightTokens.length ? leftTokens : rightTokens;
  const longer = shorter === leftTokens ? rightTokens : leftTokens;

  if (shorter.length < 3) return false;

  const matchesAtStart = shorter.every((token, index) => token === longer[index]);
  const offset = longer.length - shorter.length;
  const matchesAtEnd = shorter.every((token, index) => token === longer[offset + index]);

  return matchesAtStart || matchesAtEnd;
}

export function findMatchingTcgdexSet(pokemontcgIoSet, allTcgdexSets, customMappings = {}) {
  if (!pokemontcgIoSet || !allTcgdexSets) {
    return null;
  }

  if (isStandaloneTrainerGallerySet(pokemontcgIoSet)) {
    return null;
  }

  const tcgdexSetsByNameMap = new Map();
  const tcgdexSetsMapById = new Map();
  const tcgdexSetsMapByNormalizedId = new Map();

  allTcgdexSets.forEach((set) => {
    if (set?.name) {
      tcgdexSetsByNameMap.set(normalizeString(set.name), set);
    }
    if (set?.en?.name) {
      tcgdexSetsByNameMap.set(normalizeString(set.en.name), set);
    }
    if (set?.id) {
      tcgdexSetsMapById.set(String(set.id).toLowerCase(), set);
      tcgdexSetsMapByNormalizedId.set(normalizeSetId(set.id), set);
    }
  });

  const setIdLower = String(pokemontcgIoSet.id || '').toLowerCase();

  const customMappedTcgdexId = customMappings[setIdLower];
  if (customMappedTcgdexId) {
    if (tcgdexSetsMapById.has(String(customMappedTcgdexId).toLowerCase())) {
      return tcgdexSetsMapById.get(String(customMappedTcgdexId).toLowerCase());
    }
    const normalizedCustomMappedTcgdexId = normalizeSetId(customMappedTcgdexId);
    if (tcgdexSetsMapByNormalizedId.has(normalizedCustomMappedTcgdexId)) {
      return tcgdexSetsMapByNormalizedId.get(normalizedCustomMappedTcgdexId);
    }
  }

  if (tcgdexSetsMapById.has(setIdLower)) {
    return tcgdexSetsMapById.get(setIdLower);
  }

  const normalizedPokemontcgId = normalizeSetId(pokemontcgIoSet.id);
  if (normalizedPokemontcgId && tcgdexSetsMapByNormalizedId.has(normalizedPokemontcgId)) {
    return tcgdexSetsMapByNormalizedId.get(normalizedPokemontcgId);
  }

  const normalizedPokeCode = String(pokemontcgIoSet.ptcgoCode || '').trim().toLowerCase();
  const normalizedPokeName = pokemontcgIoSet.name ? normalizeString(pokemontcgIoSet.name) : '';
  if (normalizedPokeName) {
    const exactByName = tcgdexSetsByNameMap.get(normalizedPokeName);
    if (exactByName) {
      return exactByName;
    }

    for (const currentTcgdexSet of allTcgdexSets) {
      const currentTcgdexOfficialCode = String(currentTcgdexSet?.abbreviation?.official || '').trim().toLowerCase();
      const hasCodeConflict = normalizedPokeCode && currentTcgdexOfficialCode && normalizedPokeCode !== currentTcgdexOfficialCode;
      if (hasCodeConflict) continue;

      if (
        isSafePartialSetNameMatch(pokemontcgIoSet.name, currentTcgdexSet?.name)
        || isSafePartialSetNameMatch(pokemontcgIoSet.name, currentTcgdexSet?.en?.name)
      ) {
        return currentTcgdexSet;
      }
    }
  }

  return null;
}

export function resolveTcgdexImageUrl(tcgdexSetId, tcgdexCard, options = {}) {
  const config = typeof options === 'string'
    ? { quality: options }
    : (options || {});
  const quality = String(config.quality || 'low').toLowerCase() === 'high' ? 'high' : 'low';
  const language = String(config.language || 'en').trim() || 'en';
  const seriesId = String(config.seriesId || tcgdexCard?.set?.serie?.id || tcgdexCard?.serie?.id || '').trim();

  const imageValue = tcgdexCard?.image;
  const rewriteTcgdexImageQuality = (url) => {
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
  };

  if (typeof imageValue === 'string' && imageValue.trim()) {
    return rewriteTcgdexImageQuality(imageValue);
  }
  if (imageValue && typeof imageValue === 'object') {
    if (typeof imageValue[quality] === 'string' && imageValue[quality].trim()) return imageValue[quality].trim();
    if (typeof imageValue.base === 'string' && imageValue.base.trim()) return `${imageValue.base.trim()}/${quality}.webp`;
    if (typeof imageValue.low === 'string' && imageValue.low.trim()) {
      return rewriteTcgdexImageQuality(imageValue.low);
    }
    if (typeof imageValue.high === 'string' && imageValue.high.trim()) {
      return rewriteTcgdexImageQuality(imageValue.high);
    }
  }
  const localId = normalizeCardNumber(tcgdexCard?.localId || tcgdexCard?.id || '');
  if (!tcgdexSetId || !localId || !seriesId) {
    return null;
  }
  return `https://assets.tcgdex.net/${encodeURIComponent(language)}/${encodeURIComponent(seriesId)}/${encodeURIComponent(tcgdexSetId)}/${encodeURIComponent(localId)}/${quality}.webp`;
}

function hasTcgdexSetById(tcgdexSets, setId) {
  const target = String(setId || '').trim().toLowerCase();
  if (!target || !Array.isArray(tcgdexSets)) return false;
  return tcgdexSets.some((set) => String(set?.id || '').trim().toLowerCase() === target);
}

function findTcgdexSetById(tcgdexSets, setId) {
  const target = String(setId || '').trim().toLowerCase();
  if (!target || !Array.isArray(tcgdexSets)) return null;
  return tcgdexSets.find((set) => String(set?.id || '').trim().toLowerCase() === target) || null;
}

/**
 * Waehlt die Karten-Liste, die fuer den TCGDex-Import benutzt wird.
 *
 * TCGDex liefert je nach Locale und Set-Status teils:
 * - Vollstaendige Karten-Liste (EN, populierte Sets)
 * - Leeres `cards: []`-Array (DE, Metadaten-only)
 * - Gar kein cards-Feld
 *
 * Da mergeTcgdexSetWithFallback nur ein leeres preferred.cards NICHT
 * durch fallback.cards ersetzen kann, wenn das fallback selbst keine
 * Karten fuehrt, brauchen wir hier eine explizite Fallback-Logik:
 * bevorzugt preferred.cards (sofern nicht leer), sonst english.cards.
 */
export function pickTcgdexCardList(preferredSet, englishSet) {
  const preferredCards = Array.isArray(preferredSet?.cards) ? preferredSet.cards : null;
  if (preferredCards && preferredCards.length > 0) return preferredCards;
  const englishCards = Array.isArray(englishSet?.cards) ? englishSet.cards : [];
  return englishCards;
}

/**
 * Identifier-Felder, anhand derer Karten/Booster-Items dedupliziert werden,
 * wenn preferred und fallback beide Arrays mit Items liefern. TCGDex
 * verwendet je nach Locale teils nur die Set-Metadaten, teils vollstaendige
 * Karten-Listen, und Merge via Spread wuerde sonst eine vollstaendige
 * fallback-Liste durch eine leere preferred-Liste ersetzen.
 */
const TCGDEX_MERGE_DEDUPE_KEYS = new Set(['cards', 'boosters']);

function pickTcgdexItemDedupeKey(item) {
  if (!item || typeof item !== 'object') return null;
  return String(item.id || item.localId || item.number || '').trim().toLowerCase() || null;
}

function mergeTcgdexArray(preferredList, fallbackList) {
  const result = [];
  const seen = new Set();
  const pushAll = (list) => {
    if (!Array.isArray(list)) return;
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const key = pickTcgdexItemDedupeKey(item);
      if (key) {
        if (seen.has(key)) continue;
        seen.add(key);
      }
      result.push(item);
    }
  };
  // preferred zuerst, damit dessen Eintraege im Konfliktfall gewinnen
  pushAll(preferredList);
  pushAll(fallbackList);
  return result;
}

function mergeTcgdexObjectDeep(preferred, fallback) {
  if (!preferred || typeof preferred !== 'object') return fallback;
  if (!fallback || typeof fallback !== 'object') return preferred;
  const out = { ...fallback, ...preferred };
  for (const key of Object.keys(out)) {
    const p = preferred[key];
    const f = fallback[key];
    if (Array.isArray(p) || Array.isArray(f)) {
      if (TCGDEX_MERGE_DEDUPE_KEYS.has(key)) {
        out[key] = mergeTcgdexArray(p, f);
      } else {
        // unbekannte Array-Felder: preferred wins, fallback nur wenn preferred leer
        out[key] = Array.isArray(p) && p.length ? p : (Array.isArray(f) ? f : []);
      }
    } else if (p && typeof p === 'object' && f && typeof f === 'object') {
      out[key] = mergeTcgdexObjectDeep(p, f);
    }
  }
  return out;
}

export function mergeTcgdexSetWithFallback(preferredSet, fallbackSet = null) {
  if (!preferredSet && !fallbackSet) return null;

  const preferred = preferredSet && typeof preferredSet === 'object' ? preferredSet : {};
  const fallback = fallbackSet && typeof fallbackSet === 'object' ? fallbackSet : {};

  const merged = mergeTcgdexObjectDeep(preferred, fallback);

  // Primitive Strings (logo, symbol) sollen vom fallback uebernommen
  // werden, wenn preferred leer ist (sonst wuerden kaputte Symbole
  // im UI landen).
  if (!String(merged.logo || '').trim()) {
    merged.logo = String(fallback?.logo || fallback?.images?.logo || '').trim();
  }
  if (!String(merged.symbol || '').trim()) {
    merged.symbol = String(fallback?.symbol || fallback?.images?.symbol || '').trim();
  }

  return merged;
}

function normalizeTcgdexSetIdCollection(value) {
  if (value instanceof Set) {
    return new Set(Array.from(value, (entry) => String(entry || '').trim().toLowerCase()).filter(Boolean));
  }
  if (Array.isArray(value)) {
    return new Set(value.map((entry) => String(entry || '').trim().toLowerCase()).filter(Boolean));
  }
  return null;
}

export function resolvePreferredTcgdexSetBases(tcgdexSetId, apis = {}) {
  const normalizedSetId = String(tcgdexSetId || '').trim().toLowerCase();
  if (!normalizedSetId) return [];

  const deBase = String(apis?.tcgdexBase || '').trim();
  const enBase = String(apis?.tcgdexFallbackBase || '').trim();
  const deSetIds = normalizeTcgdexSetIdCollection(apis?.tcgdexDeSetIds);
  const enSetIds = normalizeTcgdexSetIdCollection(apis?.tcgdexEnSetIds);

  const hasDeKnowledge = deSetIds instanceof Set;
  const hasEnKnowledge = enSetIds instanceof Set;
  const existsInDe = hasDeKnowledge ? deSetIds.has(normalizedSetId) : false;
  const existsInEn = hasEnKnowledge ? enSetIds.has(normalizedSetId) : false;

  const orderedBases = [];
  if (existsInDe && deBase) orderedBases.push(deBase);
  if (existsInEn && enBase) orderedBases.push(enBase);

  if (orderedBases.length) {
    return orderedBases.filter((value, index, array) => array.indexOf(value) === index);
  }

  if (hasDeKnowledge || hasEnKnowledge) {
    if (!hasEnKnowledge && enBase) return [enBase];
    if (!hasDeKnowledge && deBase) return [deBase];
    return [];
  }

  return [deBase, enBase]
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index);
}

async function fetchTcgdexSetDetail(base, tcgdexSetId, fetchJson) {
  return fetchJson(`${base}/sets/${encodeURIComponent(tcgdexSetId)}`);
}

async function fetchTcgdexSetDetailsWithLocaleInfo(tcgdexSetId, apis = {}, fetchJson) {
  const normalizedSetId = String(tcgdexSetId || '').trim();
  if (!normalizedSetId || typeof fetchJson !== 'function') {
    return { preferredDetail: null, englishDetail: null };
  }

  const bases = resolvePreferredTcgdexSetBases(normalizedSetId, apis);
  if (!bases.length) {
    return { preferredDetail: null, englishDetail: null };
  }

  let preferredDetail = null;
  let preferredBase = '';

  for (const base of bases) {
    try {
      const detail = await fetchTcgdexSetDetail(base, normalizedSetId, fetchJson);
      if (detail?.id) {
        preferredDetail = detail;
        preferredBase = base;
        break;
      }
    } catch (_error) {
      // try next locale fallback only when the locale is actually plausible
    }
  }

  const englishBase = String(apis?.tcgdexFallbackBase || '').trim();
  let englishDetail = null;
  if (englishBase) {
    if (preferredBase === englishBase && preferredDetail?.id) {
      englishDetail = preferredDetail;
    } else {
      try {
        const detail = await fetchTcgdexSetDetail(englishBase, normalizedSetId, fetchJson);
        if (detail?.id) englishDetail = detail;
      } catch (_error) {
        // English fallback is optional enrichment only
      }
    }
  }

  return { preferredDetail, englishDetail };
}

function resolveOfficialSetTag({ setTag = '', tcgdexSet = null, primarySet = null, fallbackSetId = '' } = {}) {
  const candidates = [
    setTag,
    tcgdexSet?.abbreviation?.official,
    primarySet?.ptcgoCode,
    primarySet?.code,
    fallbackSetId
  ];

  for (const candidate of candidates) {
    const normalized = String(candidate || '').trim();
    if (normalized) return normalized;
  }
  return '';
}

function encodeCardmarketSearchString(value) {
  return encodeURIComponent(String(value || '').trim()).replace(/%20/g, '+');
}

function buildCardmarketSearchUrl({ setTag = '', cardNumber = '' } = {}) {
  const normalizedTag = String(setTag || '').trim();
  const normalizedNumber = String(cardNumber || '').trim();

  if (!normalizedTag || !normalizedNumber) return null;

  const searchString = `${normalizedTag} ${normalizedNumber}`;
  return `https://www.cardmarket.com/de/Pokemon/Products/Search?searchMode=v2&searchString=${encodeCardmarketSearchString(searchString)}`;
}

function resolvePreferredCardmarketUrl(candidates = []) {
  const normalized = candidates
    .map((value) => String(value || '').trim())
    .filter((value) => /^https?:\/\//i.test(value));

  if (!normalized.length) return '';
  const direct = normalized.find((value) => !isGeneratedCardmarketSearchUrl(value));
  return direct || normalized[0] || '';
}

function resolveCardmarketUrl({ tcgdexUrl = null, primaryUrl = null, cardName = '', setTag = '', setName = '', cardNumber = '' } = {}) {
  const direct = resolvePreferredCardmarketUrl([primaryUrl, tcgdexUrl]);

  if (direct) return direct;
  return buildCardmarketSearchUrl({ setTag, cardNumber });
}

function buildTcgdexCardsMap(cards = []) {
  const map = new Map();
  (Array.isArray(cards) ? cards : []).forEach((card) => {
    map.set(normalizeCardNumber(card?.localId || card?.id), card);
  });
  return map;
}

function mapTcgdexCardToMerged(tcgdexSetId, tcgdexCard, fallbackImageSmall = null, fallbackImageLarge = null, fallbackSetName = '', fallbackSetTag = '', tcgdexSeriesId = '', tcgdexFallbackCard = null) {
  return buildCardRecordFromSources({
    setId: tcgdexSetId,
    tcgdexSetId,
    tcgdexSeriesId,
    tcgdexCard,
    tcgdexFallbackCard,
    fallbackImageSmall: resolveTcgdexImageUrl(tcgdexSetId, tcgdexCard, { quality: 'low', seriesId: tcgdexSeriesId }) || fallbackImageSmall || '',
    fallbackImageLarge: resolveTcgdexImageUrl(tcgdexSetId, tcgdexCard, { quality: 'high', seriesId: tcgdexSeriesId }) || fallbackImageLarge || fallbackImageSmall || '',
    fallbackSetName,
    fallbackSetTag
  });
}

export async function fetchAllPrimaryCardsForSet({
  setId,
  setName,
  useVeraApi,
  veraBaseUrl,
  veraLanguage,
  pokemontcgBaseUrl,
  fetchJson
}) {
  if (useVeraApi) {
    const url = `${veraBaseUrl}/cards/${veraLanguage}/${encodeURIComponent(setId)}.json`;
    try {
      const response = await fetchJson(url);
      const cards = Array.isArray(response) ? response : [];
      if (cards.length) {
        return cards.sort((a, b) => naturalSort(a.number || '', b.number || ''));
      }
      // Vera-Setdatei existiert, aber leer -> fallback auf pokemontcg.io
      console.warn(`[fetchAllPrimaryCardsForSet] Vera lieferte 0 Karten für ${setId}, fallback auf pokemontcg.io`);
    } catch (err) {
      // 404/Fetch-Fehler bei Vera dürfen Suche/Import nicht abbrechen.
      console.warn(`[fetchAllPrimaryCardsForSet] Vera request failed for ${setId}, fallback auf pokemontcg.io`, err);
    }
  }

  let page = 1;
  const pageSize = 250;
  const allCards = [];
  while (true) {
    const url = `${pokemontcgBaseUrl}/cards?q=set.id:${encodeURIComponent(setId)}&page=${page}&pageSize=${pageSize}`;
    const response = await fetchJson(url);
    const cards = response?.data || [];
    if (!cards.length) break;
    allCards.push(...cards);
    page += 1;
  }

  if (!allCards.length) {
    throw new Error(`Keine Karten von pokemontcg.io für Set "${setName}" gefunden.`);
  }

  return allCards.sort((a, b) => naturalSort(a.number || '', b.number || ''));
}

export async function loadCardsForSetCompat({
  setId,
  setName,
  useVeraApi,
  primarySet,
  tcgdexSets,
  customMappings,
  apis,
  fetchJson
}) {
  let allCards = [];
  const cardmarketData = {};
  let tcgdexDetailedSet = null;
  let tcgdexEnglishDetailedSet = null;
  const primaryDetailedSet = primarySet || null;

  const isTcgdexOnlySet = String(setId || '').startsWith('TCGDEX-');
  if (isTcgdexOnlySet) {
    const tcgdexActualSetId = String(setId).substring('TCGDEX-'.length);
    if (!hasTcgdexSetById(tcgdexSets, tcgdexActualSetId)) {
      throw new Error(`TCGDex-Set nicht verfügbar: ${tcgdexActualSetId}`);
    }
    const tcgdexSummaryFallback = findTcgdexSetById(tcgdexSets, tcgdexActualSetId);
    const { preferredDetail, englishDetail } = await fetchTcgdexSetDetailsWithLocaleInfo(tcgdexActualSetId, apis, fetchJson);
    tcgdexDetailedSet = mergeTcgdexSetWithFallback(preferredDetail, tcgdexSummaryFallback);
    tcgdexEnglishDetailedSet = mergeTcgdexSetWithFallback(englishDetail, tcgdexSummaryFallback);
    if (!tcgdexDetailedSet) {
      throw new Error(`TCGDex-Set nicht verfügbar: ${tcgdexActualSetId}`);
    }
    const officialSetTag = resolveOfficialSetTag({
      tcgdexSet: tcgdexDetailedSet,
      fallbackSetId: tcgdexActualSetId
    });
    // TCGDex-DE liefert fuer viele Sets nur die Metadaten + leeres
    // `cards: []`-Array. Wenn preferredDetail keine Karten enthaelt,
    // fallen wir auf das englische Detail zurueck (das die vollstaendige
    // Karten-Liste hat). mergeTcgdexSetWithFallback kann das nicht
    // abfangen, weil der Summary-Fallback selbst keine Karten fuehrt.
    const cards = pickTcgdexCardList(tcgdexDetailedSet, tcgdexEnglishDetailedSet);
    const englishCardsMap = buildTcgdexCardsMap(tcgdexEnglishDetailedSet?.cards || []);
    allCards = cards.map((card) => {
      const normalizedCardNumber = normalizeCardNumber(card?.localId || card?.id);
      return mapTcgdexCardToMerged(
        tcgdexActualSetId,
        card,
        null,
        null,
        tcgdexEnglishDetailedSet?.name || tcgdexDetailedSet?.name || setName || '',
        officialSetTag,
        tcgdexDetailedSet?.serie?.id || tcgdexEnglishDetailedSet?.serie?.id || '',
        englishCardsMap.get(normalizedCardNumber) || null
      );
    });
    allCards.sort((a, b) => naturalSort(a.number || '', b.number || ''));
    return { allCards, cardmarketData, tcgdexDetailedSet, tcgdexEnglishDetailedSet, primaryDetailedSet, matchingTcgdexSet: null };
  }

  const pokemontcgSetId = setId;
  const primaryCards = await fetchAllPrimaryCardsForSet({
    setId: pokemontcgSetId,
    setName,
    useVeraApi,
    veraBaseUrl: apis.veraBase,
    veraLanguage: apis.veraLanguage,
    pokemontcgBaseUrl: apis.pokemontcgBase,
    fetchJson
  });

  const matchingTcgdexSet = findMatchingTcgdexSet(
    {
      id: pokemontcgSetId,
      name: primaryDetailedSet?.name || setName || '',
      ptcgoCode: primaryDetailedSet?.ptcgoCode || primaryDetailedSet?.code || ''
    },
    tcgdexSets || [],
    customMappings || {}
  );

  const tcgdexId = matchingTcgdexSet?.id || customMappings?.[String(pokemontcgSetId).toLowerCase()] || pokemontcgSetId;
  const tcgdexSummaryFallback = matchingTcgdexSet || findTcgdexSetById(tcgdexSets, tcgdexId);
  if (tcgdexId) {
    const { preferredDetail, englishDetail } = await fetchTcgdexSetDetailsWithLocaleInfo(tcgdexId, apis, fetchJson);
    tcgdexDetailedSet = mergeTcgdexSetWithFallback(preferredDetail, tcgdexSummaryFallback);
    tcgdexEnglishDetailedSet = mergeTcgdexSetWithFallback(englishDetail, tcgdexSummaryFallback);
  } else {
    tcgdexDetailedSet = tcgdexSummaryFallback || null;
    tcgdexEnglishDetailedSet = tcgdexSummaryFallback || null;
  }
  const officialSetTag = resolveOfficialSetTag({
    tcgdexSet: tcgdexDetailedSet || matchingTcgdexSet,
    primarySet: primaryDetailedSet,
    fallbackSetId: pokemontcgSetId
  });

  const tcgdexCardsMap = buildTcgdexCardsMap(tcgdexDetailedSet?.cards || []);
  const tcgdexEnglishCardsMap = buildTcgdexCardsMap(tcgdexEnglishDetailedSet?.cards || []);

  allCards = primaryCards.map((primaryCard) => {
    const number = normalizeCardNumber(primaryCard.number);
    const tcgdexCard = tcgdexCardsMap.get(number);
    const generatedTcgdexImageSmall = tcgdexCard
      ? resolveTcgdexImageUrl(matchingTcgdexSet?.id || tcgdexId, tcgdexCard, {
          quality: 'low',
          seriesId: tcgdexDetailedSet?.serie?.id || matchingTcgdexSet?.serie?.id || ''
        })
      : null;
    const generatedTcgdexImageLarge = tcgdexCard
      ? resolveTcgdexImageUrl(matchingTcgdexSet?.id || tcgdexId, tcgdexCard, {
          quality: 'high',
          seriesId: tcgdexDetailedSet?.serie?.id || matchingTcgdexSet?.serie?.id || ''
        })
      : null;
    const resolvedCardmarketUrl = resolveCardmarketUrl({
      tcgdexUrl: tcgdexCard?.links?.cardmarket || null,
      primaryUrl: primaryCard.cardmarket?.url || null,
      cardName: tcgdexCard?.name || primaryCard.name || number,
      setTag: officialSetTag,
      setName: primaryDetailedSet?.name || matchingTcgdexSet?.name || setName || '',
      cardNumber: number
    });

    return buildCardRecordFromSources({
      setId: pokemontcgSetId,
      primaryCard,
      tcgdexCard,
      tcgdexFallbackCard: tcgdexEnglishCardsMap.get(number) || null,
      tcgdexSetId: matchingTcgdexSet?.id || tcgdexId,
      tcgdexSeriesId: tcgdexDetailedSet?.serie?.id || matchingTcgdexSet?.serie?.id || '',
      fallbackImageSmall: generatedTcgdexImageSmall
        || primaryCard.images?.small
        || `https://images.pokemontcg.io/${pokemontcgSetId}/${number}.png`,
      fallbackImageLarge: generatedTcgdexImageLarge
        || primaryCard.images?.large
        || primaryCard.images?.small
        || `https://images.pokemontcg.io/${pokemontcgSetId}/${number}.png`,
      fallbackSetName: primaryDetailedSet?.name || matchingTcgdexSet?.name || setName || '',
      fallbackSetTag: officialSetTag
    });
  });

  if (tcgdexDetailedSet?.cards) {
    const existingCardNumbers = new Set(primaryCards.map((card) => normalizeCardNumber(card.number)));
    tcgdexDetailedSet.cards.forEach((tcgdexCard) => {
      const normalizedTcgdexNumber = normalizeCardNumber(tcgdexCard.localId || tcgdexCard.id);
      if (existingCardNumbers.has(normalizedTcgdexNumber)) return;
      const tcgdexCardmarketUrl = tcgdexCard.links?.cardmarket || null;
      allCards.push({
        ...mapTcgdexCardToMerged(
          matchingTcgdexSet?.id || tcgdexId,
          tcgdexCard,
          `https://images.pokemontcg.io/${pokemontcgSetId}/${normalizedTcgdexNumber}.png`,
          `https://images.pokemontcg.io/${pokemontcgSetId}/${normalizedTcgdexNumber}.png`,
          primaryDetailedSet?.name || tcgdexEnglishDetailedSet?.name || matchingTcgdexSet?.name || setName || '',
          officialSetTag,
          tcgdexDetailedSet?.serie?.id || tcgdexEnglishDetailedSet?.serie?.id || matchingTcgdexSet?.serie?.id || '',
          tcgdexEnglishCardsMap.get(normalizedTcgdexNumber) || null
        )
      });
      const resolvedTcgdexCardmarketUrl = resolveCardmarketUrl({
        tcgdexUrl: tcgdexCardmarketUrl,
        cardName: tcgdexCard?.name || normalizedTcgdexNumber,
        setTag: officialSetTag,
        setName: primaryDetailedSet?.name || matchingTcgdexSet?.name || setName || '',
        cardNumber: normalizedTcgdexNumber
      });
      if (resolvedTcgdexCardmarketUrl) {
        cardmarketData[normalizedTcgdexNumber] = { cardmarketUrl: resolvedTcgdexCardmarketUrl };
      }
    });
  }

  primaryCards.forEach((card) => {
    const normalizedNumber = normalizeCardNumber(card.number);
    const resolvedCardmarketUrl = resolveCardmarketUrl({
      primaryUrl: card.cardmarket?.url || null,
      cardName: card?.name || normalizedNumber,
      setTag: officialSetTag,
      setName: primaryDetailedSet?.name || matchingTcgdexSet?.name || setName || '',
      cardNumber: normalizedNumber
    });
    if (resolvedCardmarketUrl) {
      cardmarketData[normalizedNumber] = { cardmarketUrl: resolvedCardmarketUrl };
    }
  });

  allCards.sort((a, b) => naturalSort(a.number || '', b.number || ''));
  return { allCards, cardmarketData, tcgdexDetailedSet, tcgdexEnglishDetailedSet, primaryDetailedSet, matchingTcgdexSet: matchingTcgdexSet || null };
}

export function combineSetsForOverviewCompat({
  primarySets,
  tcgdexSets,
  tcgdexResolvedSets = tcgdexSets,
  customMappings,
  mapPrimarySetToOverviewModel,
  toNumber
}) {
  const combinedSetsMap = new Map();
  const resolvedTcgdexById = new Map(
    (tcgdexResolvedSets || [])
      .map((set) => [String(set?.id || '').trim().toLowerCase(), set])
      .filter(([id]) => Boolean(id))
  );

  (primarySets || []).forEach((primarySet) => {
    const tcgdexMatch = findMatchingTcgdexSet(primarySet, tcgdexSets || [], customMappings || {});
    const resolvedTcgdexMatch = tcgdexMatch
      ? mergeTcgdexSetWithFallback(
          resolvedTcgdexById.get(String(tcgdexMatch.id || '').trim().toLowerCase()) || tcgdexMatch,
          tcgdexMatch
        )
      : null;

    combinedSetsMap.set(primarySet.id, {
      primaryData: primarySet,
      tcgdexData: resolvedTcgdexMatch,
      isOnlyTcgdex: false
    });
  });

  (tcgdexResolvedSets || tcgdexSets || []).forEach((tcgdexSet) => {
    const enrichedTcgdexSet = mergeTcgdexSetWithFallback(tcgdexSet, findTcgdexSetById(tcgdexSets, tcgdexSet?.id));
    let foundInCombined = false;
    for (const [, mergedData] of combinedSetsMap.entries()) {
      if (mergedData.primaryData && mergedData.tcgdexData && mergedData.tcgdexData.id === enrichedTcgdexSet?.id) {
        foundInCombined = true;
        break;
      }
    }
    if (!foundInCombined && enrichedTcgdexSet) {
      combinedSetsMap.set(`TCGDEX-${enrichedTcgdexSet.id}`, {
        primaryData: null,
        tcgdexData: enrichedTcgdexSet,
        isOnlyTcgdex: true
      });
    }
  });

  const allSetsForOverview = Array.from(combinedSetsMap.values());
  allSetsForOverview.sort((a, b) => {
    if (a.primaryData && !b.primaryData) return -1;
    if (!a.primaryData && b.primaryData) return 1;
    if (a.primaryData && b.primaryData) {
      const dateA = new Date(a.primaryData.releaseDate || 0);
      const dateB = new Date(b.primaryData.releaseDate || 0);
      return dateB - dateA;
    }
    const dateA = new Date(a.tcgdexData?.releaseDate || 0);
    const dateB = new Date(b.tcgdexData?.releaseDate || 0);
    return dateB - dateA;
  });

  const mapped = [];
  allSetsForOverview.forEach((setEntry) => {
    const primarySet = setEntry.primaryData;
    const tcgdexSet = setEntry.tcgdexData;
    const isOnlyTcgdex = setEntry.isOnlyTcgdex;

    if (primarySet) {
      const model = mapPrimarySetToOverviewModel(primarySet);
      if (!model) return;
      mapped.push(buildSetRecordFromSources({
        setId: model.setId,
        primarySet,
        tcgdexSet,
        tcgdexFallbackSet: tcgdexSet ? findTcgdexSetById(tcgdexSets, tcgdexSet?.id) : null,
        isTcgdexOnly: false
      }));
      return;
    }

    if (isOnlyTcgdex && tcgdexSet) {
      mapped.push(buildSetRecordFromSources({
        setId: `TCGDEX-${tcgdexSet.id}`,
        primarySet: null,
        tcgdexSet,
        tcgdexFallbackSet: findTcgdexSetById(tcgdexSets, tcgdexSet?.id),
        isTcgdexOnly: true
      }));
    }
  });

  const unique = new Map();
  mapped.forEach((set) => {
    if (!set?.setId) return;
    unique.set(set.setId, set);
  });
  return Array.from(unique.values());
}
