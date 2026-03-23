import { normalizeCardNumber, naturalSort } from './utils.js';
import {
  MATCH_STATUS,
  MATCH_CONFIDENCE,
  SOURCE,
  createMatchResult
} from './schema-contract.js';

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

export function findMatchingTcgdexSet(pokemontcgIoSet, allTcgdexSets, customMappings = {}) {
  if (!pokemontcgIoSet || !allTcgdexSets) {
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

  const normalizedPokeName = pokemontcgIoSet.name ? normalizeString(pokemontcgIoSet.name) : '';
  if (normalizedPokeName) {
    const exactByName = tcgdexSetsByNameMap.get(normalizedPokeName);
    if (exactByName) {
      return exactByName;
    }

    for (const currentTcgdexSet of allTcgdexSets) {
      const currentTcgdexNormalizedName = currentTcgdexSet?.name ? normalizeString(currentTcgdexSet.name) : '';
      const currentTcgdexEnNormalizedName = currentTcgdexSet?.en?.name ? normalizeString(currentTcgdexSet.en.name) : '';

      if (
        (currentTcgdexNormalizedName && normalizedPokeName.includes(currentTcgdexNormalizedName))
        || (currentTcgdexNormalizedName && currentTcgdexNormalizedName.includes(normalizedPokeName))
        || (currentTcgdexEnNormalizedName && normalizedPokeName.includes(currentTcgdexEnNormalizedName))
        || (currentTcgdexEnNormalizedName && currentTcgdexEnNormalizedName.includes(normalizedPokeName))
      ) {
        return currentTcgdexSet;
      }
    }
  }

  return null;
}

export function resolveTcgdexImageUrl(tcgdexSetId, tcgdexCard) {
  const imageValue = tcgdexCard?.image;
  if (typeof imageValue === 'string' && imageValue.trim()) {
    const trimmed = imageValue.trim();
    if (/\.(png|jpe?g|webp)$/i.test(trimmed)) {
      return trimmed;
    }
    return `${trimmed}/low.jpg`;
  }
  if (imageValue && typeof imageValue === 'object') {
    if (imageValue.low) return imageValue.low;
    if (imageValue.high) return imageValue.high;
    if (imageValue.base) return `${imageValue.base}/low.jpg`;
  }
  const localId = normalizeCardNumber(tcgdexCard?.localId || tcgdexCard?.id || '');
  if (!tcgdexSetId || !localId) {
    return null;
  }
  return `https://assets.tcgdex.net/de/${encodeURIComponent(tcgdexSetId)}/${encodeURIComponent(localId)}/low.webp`;
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

function mapTcgdexCardToMerged(tcgdexSetId, tcgdexCard, fallbackImage = null, fallbackSetName = '', fallbackSetTag = '') {
  const number = normalizeCardNumber(tcgdexCard?.localId || tcgdexCard?.id);
  const description = tcgdexCard?.description || '';
  const resolvedCardmarketUrl = resolveCardmarketUrl({
    tcgdexUrl: tcgdexCard?.links?.cardmarket || null,
    cardName: tcgdexCard?.name || number,
    setTag: fallbackSetTag,
    setName: fallbackSetName,
    cardNumber: number
  });
  const card = {
    number,
    name: tcgdexCard?.name || number,
    nameDe: tcgdexCard?.name || '',
    nameEn: tcgdexCard?.en?.name || '',
    image: resolveTcgdexImageUrl(tcgdexSetId, tcgdexCard) || fallbackImage || '',
    imageDe: resolveTcgdexImageUrl(tcgdexSetId, tcgdexCard) || fallbackImage || '',
    imageEn: fallbackImage || '',
    cardmarketUrl: resolvedCardmarketUrl,
    rarity: tcgdexCard?.rarity || '',
    hp: tcgdexCard?.hp ? String(tcgdexCard.hp) : '',
    types: Array.isArray(tcgdexCard?.types) ? tcgdexCard.types : [],
    supertype: tcgdexCard?.category || '',
    subtypes: tcgdexCard?.stage ? [tcgdexCard.stage] : (tcgdexCard?.suffix ? [tcgdexCard.suffix] : []),
    evolvesFrom: tcgdexCard?.evolveFrom || '',
    artist: Array.isArray(tcgdexCard?.illustrator) ? tcgdexCard.illustrator.join(', ') : (tcgdexCard?.illustrator || ''),
    matchStatus: MATCH_STATUS.TCGDEX_ONLY,
    matchReason: 'Card exists only in TCGdex source for this set',
    matchConfidence: MATCH_CONFIDENCE[MATCH_STATUS.TCGDEX_ONLY],
    sources: {
      vera: null,
      tcgdex: tcgdexCard
    }
  };

  if (description) {
    card.rules = [description];
    card.flavorText = description;
  }

  return card;
}

function mergeLocalizedTcgdexCardVariants(deCard = null, enCard = null) {
  if (!deCard && !enCard) return null;
  const base = { ...(enCard || {}), ...(deCard || {}) };
  const deName = deCard?.name || '';
  const enName = enCard?.name || deCard?.en?.name || '';
  return {
    ...base,
    name: deName || enName || base.name || '',
    en: {
      ...(base.en || {}),
      name: enName || deName || base.name || ''
    }
  };
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
    const response = await fetchJson(url);
    const cards = Array.isArray(response) ? response : [];
    if (!cards.length) {
      throw new Error(`Keine Karten von Vera für Set "${setName}" gefunden.`);
    }
    return cards.sort((a, b) => naturalSort(a.number || '', b.number || ''));
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
    tcgdexDetailedSet = await fetchJson(`${apis.tcgdexBase}/sets/${encodeURIComponent(tcgdexActualSetId)}`);
    const tcgdexEnBase = String(apis.tcgdexBase || '').replace(/\/de\/?$/i, '/en');
    const tcgdexEnDetailedSet = await fetchJson(`${tcgdexEnBase}/sets/${encodeURIComponent(tcgdexActualSetId)}`).catch(() => null);
    const officialSetTag = resolveOfficialSetTag({
      tcgdexSet: tcgdexDetailedSet || tcgdexEnDetailedSet,
      fallbackSetId: tcgdexActualSetId
    });

    const deCards = Array.isArray(tcgdexDetailedSet?.cards) ? tcgdexDetailedSet.cards : [];
    const enCards = Array.isArray(tcgdexEnDetailedSet?.cards) ? tcgdexEnDetailedSet.cards : [];
    const cardIds = new Set([
      ...deCards.map((card) => normalizeCardNumber(card?.localId || card?.id)),
      ...enCards.map((card) => normalizeCardNumber(card?.localId || card?.id))
    ].filter(Boolean));

    const deCardsMap = new Map(deCards.map((card) => [normalizeCardNumber(card?.localId || card?.id), card]));
    const enCardsMap = new Map(enCards.map((card) => [normalizeCardNumber(card?.localId || card?.id), card]));

    allCards = Array.from(cardIds).map((cardId) => {
      const mergedTcgdexCard = mergeLocalizedTcgdexCardVariants(
        deCardsMap.get(cardId) || null,
        enCardsMap.get(cardId) || null
      );
      return mapTcgdexCardToMerged(
        tcgdexActualSetId,
        mergedTcgdexCard,
        null,
        tcgdexDetailedSet?.name || tcgdexEnDetailedSet?.name || setName || '',
        officialSetTag
      );
    });

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
  tcgdexDetailedSet = await fetchJson(`${apis.tcgdexBase}/sets/${encodeURIComponent(tcgdexId)}`).catch(() => null);
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
    const generatedTcgdexImage = tcgdexCard
      ? resolveTcgdexImageUrl(matchingTcgdexSet?.id || tcgdexId, tcgdexCard)
      : null;
    const resolvedCardmarketUrl = resolveCardmarketUrl({
      tcgdexUrl: tcgdexCard?.links?.cardmarket || null,
      primaryUrl: primaryCard.cardmarket?.url || null,
      cardName: tcgdexCard?.name || primaryCard.name || number,
      setTag: officialSetTag,
      setName: primaryDetailedSet?.name || matchingTcgdexSet?.name || setName || '',
      cardNumber: number
    });

    const mergedCard = {
      number,
      name: tcgdexCard?.name || primaryCard.name,
      nameDe: tcgdexCard?.name || primaryCard.name || '',
      nameEn: primaryCard.name || tcgdexCard?.en?.name || tcgdexCard?.name || '',
      image: generatedTcgdexImage
        || primaryCard.images?.small
        || `https://images.pokemontcg.io/${pokemontcgSetId}/${number}.png`,
      imageDe: generatedTcgdexImage
        || primaryCard.images?.small
        || `https://images.pokemontcg.io/${pokemontcgSetId}/${number}.png`,
      imageEn: primaryCard.images?.small
        || generatedTcgdexImage
        || `https://images.pokemontcg.io/${pokemontcgSetId}/${number}.png`,
      cardmarketUrl: resolvedCardmarketUrl,
      rarity: primaryCard.rarity || tcgdexCard?.rarity || '',
      hp: primaryCard.hp ? String(primaryCard.hp) : (tcgdexCard?.hp ? String(tcgdexCard.hp) : ''),
      types: Array.isArray(primaryCard.types) && primaryCard.types.length
        ? primaryCard.types
        : (Array.isArray(tcgdexCard?.types) ? tcgdexCard.types : []),
      supertype: primaryCard.supertype || tcgdexCard?.category || '',
      subtypes: Array.isArray(primaryCard.subtypes) && primaryCard.subtypes.length
        ? primaryCard.subtypes
        : (tcgdexCard?.stage ? [tcgdexCard.stage] : (tcgdexCard?.suffix ? [tcgdexCard.suffix] : [])),
      evolvesFrom: primaryCard.evolvesFrom || tcgdexCard?.evolveFrom || '',
      artist: primaryCard.artist || (Array.isArray(tcgdexCard?.illustrator) ? tcgdexCard.illustrator.join(', ') : (tcgdexCard?.illustrator || '')),
      regulationMark: primaryCard.regulationMark || '',
      matchStatus: tcgdexCard ? MATCH_STATUS.NORMALIZED_ID : MATCH_STATUS.CUSTOM_MAP,
      matchReason: tcgdexCard
        ? 'Card matched Vera↔TCGdex by normalized localId/number'
        : 'Card only present in Vera payload for matched set',
      matchConfidence: tcgdexCard
        ? MATCH_CONFIDENCE[MATCH_STATUS.NORMALIZED_ID]
        : MATCH_CONFIDENCE[MATCH_STATUS.CUSTOM_MAP],
      sources: {
        vera: primaryCard,
        tcgdex: tcgdexCard || null
      }
    };

    if (tcgdexCard?.description) {
      mergedCard.rules = [tcgdexCard.description];
      mergedCard.flavorText = tcgdexCard.description;
    }

    return mergedCard;
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
          primaryDetailedSet?.name || matchingTcgdexSet?.name || setName || '',
          officialSetTag
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
      mapped.push({
        ...model,
        setName: tcgdexSet?.name || model.setName,
        series: tcgdexSet?.serie?.name || model.series,
        releaseDate: tcgdexSet?.releaseDate || model.releaseDate || '',
        totalCards: toNumber(tcgdexSet?.cardCount?.official) || model.totalCards,
        ptcgoCode: model.ptcgoCode || tcgdexSet?.abbreviation?.official || '',
        tcgdexId: tcgdexSet?.id || '',
        tcgdexName: tcgdexSet?.name || tcgdexSet?.en?.name || '',
        legalities: primarySet?.legalities || tcgdexSet?.legal || null,
        cardCountTotal: toNumber(tcgdexSet?.cardCount?.total),
        cardCountHolo: toNumber(tcgdexSet?.cardCount?.holo),
        cardCountReverse: toNumber(tcgdexSet?.cardCount?.reverse),
        cardCountFirstEdition: toNumber(tcgdexSet?.cardCount?.firstEdition),
        cardCountNormal: toNumber(tcgdexSet?.cardCount?.normal)
      });
      return;
    }

    if (isOnlyTcgdex && tcgdexSet) {
      mapped.push({
        setId: `TCGDEX-${tcgdexSet.id}`,
        setName: tcgdexSet.name || tcgdexSet.en?.name || tcgdexSet.id,
        logoUrl: tcgdexSet.logo || '',
        symbolUrl: tcgdexSet.symbol || '',
        series: tcgdexSet.serie?.name || '',
        releaseDate: tcgdexSet.releaseDate || '',
        totalCards: toNumber(tcgdexSet?.cardCount?.official) || toNumber(tcgdexSet?.cardCount?.total),
        ptcgoCode: tcgdexSet.abbreviation?.official || '',
        tcgdexId: tcgdexSet.id || '',
        tcgdexName: tcgdexSet.name || tcgdexSet.en?.name || '',
        legalities: tcgdexSet.legal || null,
        cardCountTotal: toNumber(tcgdexSet?.cardCount?.total),
        cardCountHolo: toNumber(tcgdexSet?.cardCount?.holo),
        cardCountReverse: toNumber(tcgdexSet?.cardCount?.reverse),
        cardCountFirstEdition: toNumber(tcgdexSet?.cardCount?.firstEdition),
        cardCountNormal: toNumber(tcgdexSet?.cardCount?.normal)
      });
    }
  });

  const unique = new Map();
  mapped.forEach((set) => {
    if (!set?.setId) return;
    unique.set(set.setId, set);
  });
  return Array.from(unique.values());
}

// ────────────────────────────────────────────────────────────────
// PHASE 1: Strukturiertes Matching mit Match-Status
// ────────────────────────────────────────────────────────────────

/**
 * Erweiterte Matching-Logik: matched Vera-Set gegen TCGdex-Sets mit
 * strukturiertem Result (status, reason, confidence, sources).
 * 
 * Matching-Schritte (in Reihenfolge):
 * 1. Direkte ID-Übereinstimmung (veraSet.id === tcgdexSet.id)
 * 2. CUSTOM_SET_ID_MAPPINGS
 * 3. Normalisierte ID-Form (z.B. "swsh4.5" → "swsh45")
 * 4. Name-Heuristik (codebasiert)
 * 5. Keine Übereinstimmung → null
 * 
 * @param {object} veraSet - Vera-Set aus JSON
 * @param {array} allTcgdexSets - alle TCGdex-Sets
 * @param {object} customMappings - CUSTOM_SET_ID_MAPPINGS
 * @returns {object|null} {matchStatus, matchReason, matchConfidence, sources} oder null wenn keine Übereinstimmung
 */
export function findMatchingTcgdexSetWithStatus(veraSet, allTcgdexSets, customMappings = {}) {
  if (!veraSet || !allTcgdexSets) {
    return null;
  }

  // Schritt 1: Direkte ID-Übereinstimmung
  const directMatch = allTcgdexSets.find(
    (ts) => String(ts?.id || '').toLowerCase() === String(veraSet.id || '').toLowerCase()
  );
  if (directMatch) {
    return createMatchResult(
      MATCH_STATUS.DIRECT_ID,
      `Direct ID match: Vera.id="${veraSet.id}" === TCGdex.id="${directMatch.id}"`,
      veraSet,
      directMatch
    );
  }

  // Schritt 2: CUSTOM_SET_ID_MAPPINGS
  const veraIdLower = String(veraSet.id || '').toLowerCase();
  const customMappedTcgdexId = customMappings[veraIdLower];
  if (customMappedTcgdexId) {
    const customMatch = allTcgdexSets.find(
      (ts) => String(ts?.id || '').toLowerCase() === String(customMappedTcgdexId || '').toLowerCase()
    );
    if (customMatch) {
      return createMatchResult(
        MATCH_STATUS.CUSTOM_MAP,
        `Custom mapping: Vera.id="${veraSet.id}" mapped to TCGdex.id="${customMatch.id}"`,
        veraSet,
        customMatch
      );
    }

    // Fallback: normalized custom-mapped ID
    const normalizedCustomMappedId = normalizeSetId(customMappedTcgdexId);
    const normalizedCustomMatch = allTcgdexSets.find(
      (ts) => normalizeSetId(ts?.id || '') === normalizedCustomMappedId
    );
    if (normalizedCustomMatch) {
      return createMatchResult(
        MATCH_STATUS.NORMALIZED_ID,
        `Custom mapping (normalized): Vera.id="${veraSet.id}" (via mapping) matched TCGdex.id="${normalizedCustomMatch.id}" (normalized)`,
        veraSet,
        normalizedCustomMatch
      );
    }
  }

  // Schritt 3: Normalisierte ID-Form
  const normalizedVeraId = normalizeSetId(veraSet.id);
  if (normalizedVeraId) {
    const normalizedMatch = allTcgdexSets.find(
      (ts) => normalizeSetId(ts?.id || '') === normalizedVeraId
    );
    if (normalizedMatch) {
      return createMatchResult(
        MATCH_STATUS.NORMALIZED_ID,
        `Normalized ID match: Vera.id="${veraSet.id}" (normalized) === TCGdex.id="${normalizedMatch.id}" (normalized)`,
        veraSet,
        normalizedMatch
      );
    }
  }

  // Schritt 4: Name-Heuristik (basierend auf Original)
  const existingMatch = findMatchingTcgdexSet(veraSet, allTcgdexSets, customMappings);
  if (existingMatch) {
    return createMatchResult(
      MATCH_STATUS.NAME_HEURISTIC,
      `Name-based heuristic: Vera.name="${veraSet.name}" matched TCGdex.id="${existingMatch.id}" (name="${existingMatch.name}")`,
      veraSet,
      existingMatch
    );
  }

  // Schritt 5: Keine Übereinstimmung
  return null;
}

/**
 * Detektion und Deduplication von Vera-Sets mit doppelten IDs.
 * 
 * Beispiel: me2pt5 kommt 2x vor mit unterschiedlichen updatedAt-Timestamps.
 * Regel: Neuestem updatedAt gewinnt, älteste werden als Duplikat markiert.
 * 
 * @param {array} veraSets - alle Vera-Sets
 * @returns {object} {deduplicated: array, duplicates: array}
 *   deduplicated: bereinigte Liste (Duplikate entfernt)
 *   duplicates: array von {winnerId, winnerUpdatedAt, losers: [{id, updatedAt}, ...]}
 */
export function deduplicateVeraSets(veraSets) {
  if (!Array.isArray(veraSets)) {
    return { deduplicated: [], duplicates: [] };
  }

  const byId = new Map();
  const duplicates = [];

  veraSets.forEach((set) => {
    const id = String(set?.id || '').trim();
    if (!id) return;

    if (!byId.has(id)) {
      byId.set(id, []);
    }
    byId.get(id).push(set);
  });

  // Sammle deduplizierte und markiere Duplikate
  const deduplicated = [];
  for (const [id, setsWithId] of byId.entries()) {
    if (setsWithId.length === 1) {
      // Kein Duplikat
      deduplicated.push(setsWithId[0]);
    } else {
      // Mehrere Sets mit derselben ID → updatedAt vergleichen
      const sorted = setsWithId.sort((a, b) => {
        const dateA = new Date(a?.updatedAt || 0);
        const dateB = new Date(b?.updatedAt || 0);
        return dateB - dateA; // neustes zuerst
      });

      const winner = sorted[0];
      const losers = sorted.slice(1).map((s) => ({
        id: s.id,
        updatedAt: s.updatedAt,
        printedTotal: s.printedTotal,
        imageSymbol: s.images?.symbol
      }));

      deduplicated.push(winner);
      duplicates.push({
        winnerSetId: winner.id,
        winnerUpdatedAt: winner.updatedAt,
        winnerPrintedTotal: winner.printedTotal,
        losers
      });

      // Log für Debugging
      console.warn(
        `[deduplicateVeraSets] Detected ${setsWithId.length} duplicates for Set.id="${id}". ` +
        `Keeping winner (updatedAt="${winner.updatedAt}", printedTotal=${winner.printedTotal}), ` +
        `discarding ${losers.length} older variant(s).`
      );
    }
  }

  return { deduplicated, duplicates };
}

/**
 * Kombiniert Vera-Sets und TCGdex-Sets mit vollständigen Match-Status-Metadaten.
 * 
 * @param {array} veraSets - deduplizierte Vera-Sets
 * @param {array} tcgdexSets - alle TCGdex-Sets
 * @param {object} customMappings - CUSTOM_SET_ID_MAPPINGS
 * @returns {object} {
 *   matched: [{setId, matchStatus, matchReason, matchConfidence, sources}, ...],
 *   tcgdexOnly: [{setId (TCGDEX-*), matchStatus, sources}, ...],
 *   matchStatistics: {direct_id, custom_map, normalized_id, name_heuristic, tcgdex_only, total}
 * }
 */
export function combineVeraAndTcgdexSetsWithStatus(veraSets, tcgdexSets, customMappings = {}) {
  if (!Array.isArray(veraSets)) veraSets = [];
  if (!Array.isArray(tcgdexSets)) tcgdexSets = [];

  const matched = [];
  const tcgdexOnlySet = new Set();
  const matchStatistics = {
    [MATCH_STATUS.DIRECT_ID]: 0,
    [MATCH_STATUS.CUSTOM_MAP]: 0,
    [MATCH_STATUS.NORMALIZED_ID]: 0,
    [MATCH_STATUS.NAME_HEURISTIC]: 0,
    [MATCH_STATUS.TCGDEX_ONLY]: 0,
    total: 0
  };

  // Matche alle Vera-Sets
  veraSets.forEach((veraSet) => {
    const matchResult = findMatchingTcgdexSetWithStatus(veraSet, tcgdexSets, customMappings);
    matched.push({
      setId: veraSet.id,
      matchStatus: matchResult?.matchStatus || null,
      matchReason: matchResult?.matchReason || null,
      matchConfidence: matchResult?.matchConfidence || 0,
      sources: {
        vera: veraSet,
        tcgdex: matchResult?.sources?.tcgdex || null
      }
    });

    if (matchResult) {
      matchStatistics[matchResult.matchStatus]++;
      // Markiere TCGdex-Set als "matched" damit wir TCGdex-only später erkennen
      if (matchResult.sources?.tcgdex?.id) {
        tcgdexOnlySet.add(String(matchResult.sources.tcgdex.id).toLowerCase());
      }
    }
    matchStatistics.total++;
  });

  // Finde TCGdex-only Sets
  const tcgdexOnly = [];
  tcgdexSets.forEach((tcgdexSet) => {
    const tcgdexIdLower = String(tcgdexSet?.id || '').toLowerCase();
    if (!tcgdexOnlySet.has(tcgdexIdLower)) {
      tcgdexOnly.push({
        setId: `TCGDEX-${tcgdexSet.id}`,
        matchStatus: MATCH_STATUS.TCGDEX_ONLY,
        matchReason: `TCGdex-only Set (no Vera match found for TCGdex.id="${tcgdexSet.id}")`,
        matchConfidence: MATCH_CONFIDENCE[MATCH_STATUS.TCGDEX_ONLY],
        sources: {
          vera: null,
          tcgdex: tcgdexSet
        }
      });
      matchStatistics[MATCH_STATUS.TCGDEX_ONLY]++;
      matchStatistics.total++;
    }
  });

  return {
    matched,
    tcgdexOnly,
    matchStatistics
  };
}
