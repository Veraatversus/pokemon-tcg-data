import { normalizeCardNumber, naturalSort } from './utils.js';
import { buildCardRecordFromSources, buildSetRecordFromSources } from './data/schema-contract.js?v=20260504d';

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

  const tcgdexSetsMapByAbbreviation = new Map();
  const tcgdexSetsByNameMap = new Map();
  const tcgdexSetsMapById = new Map();
  const tcgdexSetsMapByNormalizedId = new Map();

  allTcgdexSets.forEach((set) => {
    if (set?.abbreviation?.official) {
      tcgdexSetsMapByAbbreviation.set(String(set.abbreviation.official).toLowerCase(), set);
    }
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

  if (pokemontcgIoSet.ptcgoCode) {
    const matchedByCode = tcgdexSetsMapByAbbreviation.get(String(pokemontcgIoSet.ptcgoCode).toLowerCase());
    if (matchedByCode) {
      return matchedByCode;
    }
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
  if (typeof imageValue === 'string' && imageValue.trim()) {
    const trimmed = imageValue.trim().replace(/\/(low|high)\.(png|jpe?g|webp)$/i, '');
    return `${trimmed}/${quality}.webp`;
  }
  if (imageValue && typeof imageValue === 'object') {
    if (typeof imageValue[quality] === 'string' && imageValue[quality].trim()) return imageValue[quality].trim();
    if (typeof imageValue.base === 'string' && imageValue.base.trim()) return `${imageValue.base.trim()}/${quality}.webp`;
    if (typeof imageValue.low === 'string' && imageValue.low.trim()) {
      return imageValue.low.trim().replace(/\/(low|high)\.(png|jpe?g|webp)$/i, `/${quality}.webp`);
    }
    if (typeof imageValue.high === 'string' && imageValue.high.trim()) {
      return imageValue.high.trim().replace(/\/(low|high)\.(png|jpe?g|webp)$/i, `/${quality}.webp`);
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

async function fetchTcgdexSetDetailsWithFallback(tcgdexSetId, apis = {}, fetchJson) {
  const normalizedSetId = String(tcgdexSetId || '').trim();
  if (!normalizedSetId || typeof fetchJson !== 'function') return null;

  const bases = [apis?.tcgdexBase, apis?.tcgdexFallbackBase]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index);

  for (const base of bases) {
    try {
      const detail = await fetchJson(`${base}/sets/${encodeURIComponent(normalizedSetId)}`);
      if (detail?.id) return detail;
    } catch (_error) {
      // try next locale fallback
    }
  }

  return null;
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

function buildCardmarketSearchUrl({ cardName = '', setTag = '', setName = '', cardNumber = '' } = {}) {
  const normalizedTag = String(setTag || '').trim();
  const normalizedNumber = String(cardNumber || '').trim();
  const normalizedName = String(cardName || '').trim();
  const normalizedSetName = String(setName || '').trim();

  if (normalizedTag && normalizedNumber) {
    const searchString = `${normalizedTag} ${normalizedNumber}`;
    return `https://www.cardmarket.com/de/Pokemon/Products/Search?searchMode=v2&searchString=${encodeCardmarketSearchString(searchString)}`;
  }

  const searchString = [normalizedName, normalizedSetName, normalizedNumber]
    .filter(Boolean)
    .join(' ');

  if (!searchString) return null;
  return `https://www.cardmarket.com/de/Pokemon/Products/Search?searchString=${encodeCardmarketSearchString(searchString)}`;
}

function resolveCardmarketUrl({ tcgdexUrl = null, primaryUrl = null, cardName = '', setTag = '', setName = '', cardNumber = '' } = {}) {
  const direct = [tcgdexUrl, primaryUrl]
    .map((value) => String(value || '').trim())
    .find((value) => /^https?:\/\//i.test(value));

  if (direct) return direct;
  return buildCardmarketSearchUrl({ cardName, setTag, setName, cardNumber });
}

function mapTcgdexCardToMerged(tcgdexSetId, tcgdexCard, fallbackImageSmall = null, fallbackImageLarge = null, fallbackSetName = '', fallbackSetTag = '', tcgdexSeriesId = '') {
  return buildCardRecordFromSources({
    setId: tcgdexSetId,
    tcgdexSetId,
    tcgdexSeriesId,
    tcgdexCard,
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
  const primaryDetailedSet = primarySet || null;

  const isTcgdexOnlySet = String(setId || '').startsWith('TCGDEX-');
  if (isTcgdexOnlySet) {
    const tcgdexActualSetId = String(setId).substring('TCGDEX-'.length);
    if (!hasTcgdexSetById(tcgdexSets, tcgdexActualSetId)) {
      throw new Error(`TCGDex-Set nicht verfügbar: ${tcgdexActualSetId}`);
    }
    tcgdexDetailedSet = await fetchTcgdexSetDetailsWithFallback(tcgdexActualSetId, apis, fetchJson);
    if (!tcgdexDetailedSet) {
      throw new Error(`TCGDex-Set nicht verfügbar: ${tcgdexActualSetId}`);
    }
    const officialSetTag = resolveOfficialSetTag({
      tcgdexSet: tcgdexDetailedSet,
      fallbackSetId: tcgdexActualSetId
    });
    const cards = tcgdexDetailedSet?.cards || [];
    allCards = cards.map((card) => mapTcgdexCardToMerged(tcgdexActualSetId, card, null, tcgdexDetailedSet?.name || setName || '', officialSetTag));
    allCards.sort((a, b) => naturalSort(a.number || '', b.number || ''));
    return { allCards, cardmarketData, tcgdexDetailedSet, primaryDetailedSet, matchingTcgdexSet: null };
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
  tcgdexDetailedSet = tcgdexId
    ? await fetchTcgdexSetDetailsWithFallback(tcgdexId, apis, fetchJson)
    : null;
  const officialSetTag = resolveOfficialSetTag({
    tcgdexSet: tcgdexDetailedSet || matchingTcgdexSet,
    primarySet: primaryDetailedSet,
    fallbackSetId: pokemontcgSetId
  });

  const tcgdexCardsMap = new Map();
  (tcgdexDetailedSet?.cards || []).forEach((card) => {
    tcgdexCardsMap.set(normalizeCardNumber(card.localId || card.id), card);
  });

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
          primaryDetailedSet?.name || matchingTcgdexSet?.name || setName || '',
          officialSetTag,
          tcgdexDetailedSet?.serie?.id || matchingTcgdexSet?.serie?.id || ''
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
  return { allCards, cardmarketData, tcgdexDetailedSet, primaryDetailedSet, matchingTcgdexSet: matchingTcgdexSet || null };
}

export function combineSetsForOverviewCompat({
  primarySets,
  tcgdexSets,
  customMappings,
  mapPrimarySetToOverviewModel,
  toNumber
}) {
  const combinedSetsMap = new Map();

  (primarySets || []).forEach((primarySet) => {
    const tcgdexMatch = findMatchingTcgdexSet(primarySet, tcgdexSets || [], customMappings || {});
    combinedSetsMap.set(primarySet.id, {
      primaryData: primarySet,
      tcgdexData: tcgdexMatch,
      isOnlyTcgdex: false
    });
  });

  (tcgdexSets || []).forEach((tcgdexSet) => {
    let foundInCombined = false;
    for (const [, mergedData] of combinedSetsMap.entries()) {
      if (mergedData.primaryData && mergedData.tcgdexData && mergedData.tcgdexData.id === tcgdexSet.id) {
        foundInCombined = true;
        break;
      }
    }
    if (!foundInCombined) {
      combinedSetsMap.set(`TCGDEX-${tcgdexSet.id}`, {
        primaryData: null,
        tcgdexData: tcgdexSet,
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
        isTcgdexOnly: false
      }));
      return;
    }

    if (isOnlyTcgdex && tcgdexSet) {
      mapped.push(buildSetRecordFromSources({
        setId: `TCGDEX-${tcgdexSet.id}`,
        primarySet: null,
        tcgdexSet,
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
