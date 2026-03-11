import { normalizeCardNumber, naturalSort } from './utils.js';

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
  if (tcgdexCard?.image) {
    return `${tcgdexCard.image}/low.jpg`;
  }
  const localId = normalizeCardNumber(tcgdexCard?.localId || tcgdexCard?.id || '');
  if (!tcgdexSetId || !localId) {
    return null;
  }
  return `https://assets.tcgdex.net/de/${encodeURIComponent(tcgdexSetId)}/${encodeURIComponent(localId)}/low.webp`;
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
    const cards = tcgdexDetailedSet?.cards || [];
    allCards = cards.map((card) => ({
      number: normalizeCardNumber(card.localId || card.id),
      name: card.name,
      image: resolveTcgdexImageUrl(tcgdexActualSetId, card),
      cardmarketUrl: card.links?.cardmarket || null,
      rarity: card.rarity || ''
    }));
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

  const tcgdexCardsMap = new Map();
  (tcgdexDetailedSet?.cards || []).forEach((card) => {
    tcgdexCardsMap.set(normalizeCardNumber(card.localId || card.id), card);
  });

  allCards = primaryCards.map((primaryCard) => {
    const number = normalizeCardNumber(primaryCard.number);
    const tcgdexCard = tcgdexCardsMap.get(number);

    const mergedCard = {
      number,
      name: tcgdexCard?.name || primaryCard.name,
      image: tcgdexCard
        ? resolveTcgdexImageUrl(matchingTcgdexSet?.id || tcgdexId, tcgdexCard)
        : (primaryCard.images?.small || `https://images.pokemontcg.io/${pokemontcgSetId}/${number}.png`),
      cardmarketUrl: tcgdexCard?.links?.cardmarket || primaryCard.cardmarket?.url || null,
      rarity: primaryCard.rarity || tcgdexCard?.rarity || ''
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
        number: normalizedTcgdexNumber,
        name: tcgdexCard.name,
        image: resolveTcgdexImageUrl(matchingTcgdexSet?.id || tcgdexId, tcgdexCard)
          || `https://images.pokemontcg.io/${pokemontcgSetId}/${normalizedTcgdexNumber}.png`,
        cardmarketUrl: tcgdexCardmarketUrl,
        rarity: tcgdexCard?.rarity || ''
      });
      if (tcgdexCardmarketUrl) {
        cardmarketData[normalizedTcgdexNumber] = { cardmarketUrl: tcgdexCardmarketUrl };
      }
    });
  }

  primaryCards.forEach((card) => {
    if (card.cardmarket?.url) {
      cardmarketData[normalizeCardNumber(card.number)] = { cardmarketUrl: card.cardmarket.url };
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
        ptcgoCode: model.ptcgoCode || tcgdexSet?.abbreviation?.official || ''
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
        ptcgoCode: tcgdexSet.abbreviation?.official || ''
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
