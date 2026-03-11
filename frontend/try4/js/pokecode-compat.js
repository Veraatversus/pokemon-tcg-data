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
