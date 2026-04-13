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
    legalities: ['tcgdex', 'vera', 'legacy'],
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
    flavorText: ['tcgdex', 'vera', 'legacy'],
  },
};

const COMBINED_SEARCH_SCOPE_PREFIX = 'scope:';
const COMBINED_SEARCH_SET_PREFIX = 'set:';
const COMBINED_SEARCH_SCOPE_VALUES = new Set(['imported', 'all', 'online']);

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
  ['pokemon sammelkartenspiel pocket', 'pocket'],
]);

const SET_MATCH_STATUS = {
  MATCHED: 'matched',
  PRIMARY_ONLY: 'primary_only',
  TCGDEX_ONLY: 'tcgdex_only',
};

const CARD_MATCH_STATUS = {
  MATCHED: 'matched',
  PRIMARY_ONLY: 'primary_only',
  TCGDEX_ONLY: 'tcgdex_only',
};

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

function resolveFieldByPriority(priority, sourceValues, options = {}) {
  const fallback = options?.fallback;
  for (const source of priority || []) {
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

  for (const source of priority || []) {
    pushIfPresent(sourceValues?.[source]);
  }
  pushIfPresent(options?.fallback);
  return values;
}

function getResolverMatrix() {
  return deepClone(DEFAULT_RESOLVER_MATRIX);
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeStringList(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

export function normalizeCardNumber(cardNumber) {
  if (cardNumber === null || cardNumber === undefined) return '';
  let normalized = String(cardNumber).trim();
  if (!normalized) return '';

  const slashIndex = normalized.indexOf('/');
  if (slashIndex > 0) {
    normalized = normalized.slice(0, slashIndex).trim();
  }

  const match = normalized.match(/^([a-zA-Z._-]*?)(\d+)([a-zA-Z._-]*)$/);
  if (!match) return normalized;
  const prefix = match[1];
  const numericPart = parseInt(match[2], 10).toString();
  const suffix = match[3];
  return `${prefix}${numericPart}${suffix}`;
}

export function naturalSort(arr, key) {
  const getValue = typeof key === 'function' ? key : (item) => item[key] ?? '';
  return [...arr].sort((a, b) =>
    String(getValue(a)).localeCompare(String(getValue(b)), undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  );
}

export function toBoolean(value) {
  if (value === true) return true;
  if (value === false) return false;
  const str = String(value).trim().toLowerCase();
  return str === 'true' || str === '1';
}

export function createSpreadsheetSwitchStatePatch(currentState = {}) {
  return {
    summaryData: null,
    summaryOverrides: new Map(),
    currentSet: null,
    dbMap: new Map(),
    cards: [],
    filter: 'all',
    sortOrder: 'number',
    bulkMode: false,
    bulkSelected: new Set(),
    batchSelection: new Set(),
    manageSetsSelection: new Set(),
    undoStack: [],
    auditEntries: [],
    searchCache: new Map(),
    searchRunId: Number(currentState?.searchRunId || 0) + 1,
    searchAbortController: null,
    pendingSearchSetImport: false,
    pendingSearchCardFocusKey: null,
  };
}

export function resolveCombinedSearchSelection(value, fallbackMode = 'imported') {
  const raw = String(value || '').trim();
  if (!raw) {
    return { mode: fallbackMode, setId: '' };
  }

  if (raw.startsWith(COMBINED_SEARCH_SCOPE_PREFIX)) {
    const mode = raw.slice(COMBINED_SEARCH_SCOPE_PREFIX.length).trim().toLowerCase();
    if (COMBINED_SEARCH_SCOPE_VALUES.has(mode)) {
      return { mode, setId: '' };
    }
  }

  if (raw.startsWith(COMBINED_SEARCH_SET_PREFIX)) {
    const [, modePart = '', ...setIdParts] = raw.split(':');
    const mode = modePart.trim().toLowerCase();
    const setId = setIdParts.join(':').trim();
    if (setId && COMBINED_SEARCH_SCOPE_VALUES.has(mode)) {
      return { mode, setId };
    }
  }

  return { mode: 'imported', setId: raw };
}

export function buildCombinedSearchDropdownOptions(sets = []) {
  const groups = [
    {
      label: 'Suchbereich',
      options: [
        { value: 'scope:imported', label: 'Importierte Sets' },
        { value: 'scope:all', label: 'Alle Sets' },
        { value: 'scope:online', label: 'Online-Suche' },
      ],
    },
  ];

  const safeSets = (Array.isArray(sets) ? sets : []).filter((set) => set?.setId);
  const importedOptions = safeSets
    .filter((set) => toBoolean(set.imported))
    .map((set) => ({
      value: String(set.setId),
      label: String(set.setName || set.setId),
      mode: 'imported',
      imported: true,
    }));

  const notImportedOptions = naturalSort(
    safeSets.filter((set) => !toBoolean(set.imported)),
    (set) => String(set.setName || set.setId)
  ).map((set) => ({
    value: `${COMBINED_SEARCH_SET_PREFIX}all:${String(set.setId)}`,
    label: String(set.setName || set.setId),
    mode: 'all',
    imported: false,
  }));

  if (importedOptions.length) {
    groups.push({ label: 'Importierte Sets', options: importedOptions });
  }

  if (notImportedOptions.length) {
    groups.push({ label: 'Weitere Sets (noch nicht importiert)', options: notImportedOptions });
  }

  return groups;
}

export function shouldFetchApiCardsForSearchSet(mode, set = {}, hasDbCards = false) {
  if (mode === 'online') return true;

  const imported = toBoolean(set?.imported);
  if (mode === 'all') {
    return !imported || !hasDbCards;
  }

  if (mode === 'imported') {
    return imported && !hasDbCards;
  }

  return false;
}

export function getCollectionUiState(db = {}, { isEditable = true } = {}) {
  return {
    gChecked: Boolean(db?.g),
    rhChecked: Boolean(db?.rh),
    gDisabled: !isEditable,
    rhDisabled: !isEditable || !Boolean(db?.rhCell),
  };
}

export function resolveCollectionToggleState(db = {}, { isG = false, checked = false } = {}) {
  const currentG = Boolean(db?.g);
  const currentRh = Boolean(db?.rh);

  if (isG) {
    return {
      g: Boolean(checked),
      rh: checked ? currentRh : false,
    };
  }

  return {
    g: checked ? true : currentG,
    rh: Boolean(checked),
  };
}

export function normalizeString(str) {
  if (str === null || typeof str === 'undefined') return '';
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

function isStandaloneTrainerGallerySet(set) {
  const setName = String(set?.name || '').trim();
  const normalizedSetId = normalizeSetId(set?.id || '');
  return Boolean(setName) && /trainer gallery$/i.test(setName) && /tg$/i.test(normalizedSetId);
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

function findTcgdexSetById(tcgdexSets, setId) {
  const target = String(setId || '').trim().toLowerCase();
  if (!target || !Array.isArray(tcgdexSets)) return null;
  return tcgdexSets.find((set) => String(set?.id || '').trim().toLowerCase() === target) || null;
}

function mergeTcgdexSetWithFallback(preferredSet, fallbackSet = null) {
  if (!preferredSet && !fallbackSet) return null;

  const preferred = preferredSet && typeof preferredSet === 'object' ? preferredSet : {};
  const fallback = fallbackSet && typeof fallbackSet === 'object' ? fallbackSet : {};
  const merged = {
    ...fallback,
    ...preferred,
    serie: {
      ...(fallback?.serie && typeof fallback.serie === 'object' ? fallback.serie : {}),
      ...(preferred?.serie && typeof preferred.serie === 'object' ? preferred.serie : {}),
    },
    abbreviation: {
      ...(fallback?.abbreviation && typeof fallback.abbreviation === 'object' ? fallback.abbreviation : {}),
      ...(preferred?.abbreviation && typeof preferred.abbreviation === 'object' ? preferred.abbreviation : {}),
    },
  };

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

function normalizeSeriesGroupKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

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
    canonicalName: String(setRecord.tcgdex_serie_name || '').trim() || displayLabel,
  };
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
    primaryCard?.tcgdex_cardmarket_url,
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
  updatedAt = null,
} = {}) {
  const matchStatus = primarySet && tcgdexSet
    ? SET_MATCH_STATUS.MATCHED
    : (isTcgdexOnly ? SET_MATCH_STATUS.TCGDEX_ONLY : SET_MATCH_STATUS.PRIMARY_ONLY);
  const resolvedSetId = String(setId || primarySet?.id || (tcgdexSet?.id ? `TCGDEX-${tcgdexSet.id}` : '')).trim();
  // Prepare fallback values: if this is a TCGDex-only record, fill empty vera_* fields
  const tcgdexLogo = normalizeTcgdexSetAssetUrl(tcgdexSet?.logo || '');
  const tcgdexSymbol = normalizeTcgdexSetAssetUrl(tcgdexSet?.symbol || '');

  const vera_name_val = primarySet?.name || (isTcgdexOnly ? (tcgdexSet?.name || '') : '');
  const vera_series_val = primarySet?.series || (isTcgdexOnly ? (tcgdexSet?.serie?.name || '') : '');
  const vera_printedTotal_val = toNumber(primarySet?.printedTotal);
  const vera_total_val = toNumber(primarySet?.total) || (isTcgdexOnly ? toNumber(tcgdexSet?.cardCount?.total) : 0);
  const vera_ptcgoCode_val = primarySet?.ptcgoCode || primarySet?.code || (isTcgdexOnly ? (tcgdexSet?.abbreviation?.official || '') : '');
  const vera_releaseDate_val = primarySet?.releaseDate || (isTcgdexOnly ? (tcgdexSet?.releaseDate || '') : '');
  const vera_legalities_val = primarySet?.legalities || (isTcgdexOnly ? (tcgdexSet?.legal || null) : null);
  const vera_images_symbol_val = primarySet?.images?.symbol || primarySet?.symbol || (isTcgdexOnly ? tcgdexSymbol : '');
  const vera_images_logo_val = primarySet?.images?.logo || primarySet?.logo || (isTcgdexOnly ? tcgdexLogo : '');

  return {
    setId: resolvedSetId,
    imported: Boolean(imported),
    updatedAt: updatedAt || new Date().toISOString(),
    matchStatus,
    isTcgdexOnly: Boolean(isTcgdexOnly),
    vera_id: primarySet?.id || '',
    vera_name: vera_name_val,
    vera_series: vera_series_val,
    vera_printedTotal: vera_printedTotal_val,
    vera_total: vera_total_val,
    vera_ptcgoCode: vera_ptcgoCode_val,
    vera_releaseDate: vera_releaseDate_val,
    vera_legalities: vera_legalities_val,
    vera_images_symbol: vera_images_symbol_val,
    vera_images_logo: vera_images_logo_val,
    tcgdex_id: tcgdexSet?.id || '',
    tcgdex_name: tcgdexSet?.name || '',
    tcgdex_serie_id: tcgdexSet?.serie?.id || '',
    tcgdex_serie_name: tcgdexSet?.serie?.name || '',
    tcgdex_abbreviation_official: tcgdexSet?.abbreviation?.official || '',
    tcgdex_releaseDate: tcgdexSet?.releaseDate || '',
    tcgdex_legal: tcgdexSet?.legal || null,
    tcgdex_logo: tcgdexLogo,
    tcgdex_symbol: tcgdexSymbol,
    tcgdex_cardCount_official: toNumber(tcgdexSet?.cardCount?.official),
    tcgdex_cardCount_total: toNumber(tcgdexSet?.cardCount?.total),
    tcgdex_cardCount_holo: toNumber(tcgdexSet?.cardCount?.holo),
    tcgdex_cardCount_reverse: toNumber(tcgdexSet?.cardCount?.reverse),
    tcgdex_cardCount_firstEdition: toNumber(tcgdexSet?.cardCount?.firstEd),
    tcgdex_cardCount_normal: toNumber(tcgdexSet?.cardCount?.normal),
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
  updatedAt = null,
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
  const cardmarketUrl = resolveCardmarketUrl(primaryCard, tcgdexCard, {
    cardName: tcgdexCard?.name || primaryCard?.name || normalizedNumber,
    setTag: fallbackSetTag,
    setName: fallbackSetName,
    cardNumber: normalizedNumber,
  });
  const isOnlyTcgdex = Boolean(tcgdexCard && !primaryCard);
  const vera_name_val = primaryCard?.name || (isOnlyTcgdex ? (tcgdexCard?.name || '') : '');
  const vera_supertype_val = primaryCard?.supertype || '';
  const vera_hp_val = primaryCard?.hp ? String(primaryCard.hp) : (isOnlyTcgdex && tcgdexCard?.hp != null && tcgdexCard?.hp !== '' ? String(tcgdexCard.hp) : '');
  const primarySubtypes = normalizeStringList(primaryCard?.subtypes);
  const tcgdexTypes = normalizeStringList(tcgdexCard?.types);
  const vera_subtypes_val = primarySubtypes.length ? primarySubtypes : (isOnlyTcgdex ? tcgdexTypes : []);
  const primaryTypes = normalizeStringList(primaryCard?.types);
  const vera_types_val = primaryTypes.length ? primaryTypes : (isOnlyTcgdex ? tcgdexTypes : []);
  const vera_evolvesFrom_val = primaryCard?.evolvesFrom || (isOnlyTcgdex ? (tcgdexCard?.evolvesFrom || tcgdexCard?.evolveFrom || '') : '');
  const vera_abilities_val = Array.isArray(primaryCard?.abilities) && primaryCard.abilities.length ? primaryCard.abilities : (isOnlyTcgdex ? (Array.isArray(tcgdexCard?.abilities) ? tcgdexCard.abilities : []) : []);
  const vera_attacks_val = Array.isArray(primaryCard?.attacks) && primaryCard.attacks.length ? primaryCard.attacks : [];
  const vera_weaknesses_val = Array.isArray(primaryCard?.weaknesses) && primaryCard.weaknesses.length ? primaryCard.weaknesses : [];
  const vera_resistances_val = Array.isArray(primaryCard?.resistances) && primaryCard.resistances.length ? primaryCard.resistances : [];
  const vera_retreatCost_val = normalizeStringList(primaryCard?.retreatCost).length ? normalizeStringList(primaryCard?.retreatCost) : [];
  const vera_convertedRetreatCost_val = toNumber(primaryCard?.convertedRetreatCost);
  const vera_number_val = primaryCard?.number || (isOnlyTcgdex ? (tcgdexCard?.localId || tcgdexCard?.id || '') : '');
  const vera_artist_val = primaryCard?.artist || (isOnlyTcgdex ? (tcgdexCard?.illustrator || '') : '');
  const vera_rarity_val = primaryCard?.rarity || (isOnlyTcgdex ? (tcgdexCard?.rarity || '') : '');
  const vera_flavorText_val = primaryCard?.flavorText || (isOnlyTcgdex ? (typeof tcgdexCard?.description === 'string' ? tcgdexCard.description : (tcgdexCard?.description?.en || Object.values(tcgdexCard?.description || {}).find(Boolean) || '')) : '');
  const vera_nationalPokedexNumbers_val = Array.isArray(primaryCard?.nationalPokedexNumbers) ? primaryCard.nationalPokedexNumbers : [];
  const vera_legalities_val = primaryCard?.legalities || (isOnlyTcgdex ? (tcgdexCard?.legalities || null) : null);
  const vera_regulationMark_val = primaryCard?.regulationMark || (isOnlyTcgdex ? (tcgdexCard?.regulationMark || '') : '');
  const vera_rules_val = Array.isArray(primaryCard?.rules) ? primaryCard.rules : [];
  const vera_images_small_val = primaryCard?.images?.small || (isOnlyTcgdex ? (tcgdexImageSmall || fallbackImageSmall || '') : '');
  const vera_images_large_val = primaryCard?.images?.large || (isOnlyTcgdex ? (tcgdexImageLarge || fallbackImageLarge || imageLargeUrl || '') : '');
  const vera_cardmarket_url_val = cardmarketUrl || '';

  return {
    setId: String(setId || '').trim(),
    cardId: primaryCard?.id || tcgdexCard?.id || normalizedNumber,
    updatedAt: updatedAt || new Date().toISOString(),
    matchStatus,
    isPrimaryOnly: Boolean(primaryCard && !tcgdexCard),
    isTcgdexOnly: Boolean(tcgdexCard && !primaryCard),
    vera_id: primaryCard?.id || '',
    vera_name: vera_name_val,
    vera_supertype: vera_supertype_val,
    vera_subtypes: vera_subtypes_val,
    vera_hp: vera_hp_val,
    vera_types: vera_types_val,
    vera_evolvesFrom: vera_evolvesFrom_val,
    vera_abilities: vera_abilities_val,
    vera_attacks: vera_attacks_val,
    vera_weaknesses: vera_weaknesses_val,
    vera_resistances: vera_resistances_val,
    vera_retreatCost: vera_retreatCost_val,
    vera_convertedRetreatCost: vera_convertedRetreatCost_val,
    vera_number: vera_number_val,
    vera_artist: vera_artist_val,
    vera_rarity: vera_rarity_val,
    vera_flavorText: vera_flavorText_val,
    vera_nationalPokedexNumbers: vera_nationalPokedexNumbers_val,
    vera_legalities: vera_legalities_val,
    vera_regulationMark: vera_regulationMark_val,
    vera_rules: vera_rules_val,
    vera_images_small: vera_images_small_val,
    vera_images_large: vera_images_large_val,
    vera_cardmarket_url: vera_cardmarket_url_val,
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
    tcgdex_effect: tcgdexCard?.effect || null,
  };

  // (old return removed) - values are returned above with tcgdex fallbacks applied
}

export function resolveDisplaySet(setRecord = {}) {
  const matrix = getResolverMatrix().set;
  const setName = resolveFieldByPriority(matrix.setName, {
    tcgdex: setRecord.tcgdex_name,
    vera: setRecord.vera_name,
  }, { fallback: setRecord.vera_name || setRecord.tcgdex_name || '' });

  const series = resolveFieldByPriority(matrix.series, {
    tcgdex: setRecord.tcgdex_serie_name,
    vera: setRecord.vera_series,
  }, { fallback: setRecord.vera_series || setRecord.tcgdex_serie_name || '' });
  const seriesGroup = resolveSeriesGroupInfo({ ...setRecord, series });

  const releaseDate = resolveFieldByPriority(matrix.releaseDate, {
    tcgdex: setRecord.tcgdex_releaseDate,
    vera: setRecord.vera_releaseDate,
  }, { fallback: setRecord.vera_releaseDate || setRecord.tcgdex_releaseDate || '' });

  const totalCards = resolveFieldByPriority(matrix.totalCards, {
    tcgdex: toNumber(setRecord.tcgdex_cardCount_official),
    vera: toNumber(setRecord.vera_total) || toNumber(setRecord.vera_printedTotal),
  }, { numeric: true, fallback: toNumber(setRecord.vera_total) || toNumber(setRecord.tcgdex_cardCount_official) });

  const ptcgoCode = resolveFieldByPriority(matrix.ptcgoCode, {
    tcgdex: setRecord.tcgdex_abbreviation_official,
    vera: setRecord.vera_ptcgoCode,
  }, { fallback: setRecord.vera_ptcgoCode || setRecord.tcgdex_abbreviation_official || '' });

  const logoUrlCandidates = collectValuesByPriority(matrix.logoUrl, {
    tcgdex: sanitizeMediaValue(setRecord.tcgdex_logo),
    vera: sanitizeMediaValue(setRecord.vera_images_logo),
    legacy: sanitizeMediaValue(setRecord.logoUrl),
  }, {
    fallback: sanitizeMediaValue(setRecord.vera_images_logo)
      || sanitizeMediaValue(setRecord.tcgdex_logo)
      || sanitizeMediaValue(setRecord.logoUrl)
      || '',
  });
  const logoUrl = logoUrlCandidates[0] || '';

  const symbolUrlCandidates = collectValuesByPriority(matrix.symbolUrl, {
    tcgdex: sanitizeMediaValue(setRecord.tcgdex_symbol),
    vera: sanitizeMediaValue(setRecord.vera_images_symbol),
    legacy: sanitizeMediaValue(setRecord.symbolUrl),
  }, {
    fallback: sanitizeMediaValue(setRecord.vera_images_symbol)
      || sanitizeMediaValue(setRecord.tcgdex_symbol)
      || sanitizeMediaValue(setRecord.symbolUrl)
      || '',
  });
  const symbolUrl = symbolUrlCandidates[0] || '';

  const legalities = resolveFieldByPriority(matrix.legalities, {
    tcgdex: setRecord.tcgdex_legal,
    vera: setRecord.vera_legalities,
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
    cardCountNormal: toNumber(setRecord.tcgdex_cardCount_normal),
  };
}

export function resolveDisplayCard(cardRecord = {}) {
  const matrix = getResolverMatrix().card;
  const rules = Array.isArray(cardRecord.vera_rules) && cardRecord.vera_rules.length
    ? cardRecord.vera_rules
    : normalizeRules(null, {
      description: cardRecord.tcgdex_description,
      effect: cardRecord.tcgdex_effect,
    });

  const number = resolveFieldByPriority(matrix.number, {
    tcgdex: normalizeCardNumber(cardRecord.tcgdex_localId || ''),
    vera: normalizeCardNumber(cardRecord.vera_number || ''),
  }, { fallback: cardRecord.vera_number || cardRecord.tcgdex_localId || '' });

  const name = resolveFieldByPriority(matrix.name, {
    tcgdex: cardRecord.tcgdex_name,
    vera: cardRecord.vera_name,
  }, { fallback: cardRecord.vera_name || cardRecord.tcgdex_name || '' });

  const imageCandidates = collectValuesByPriority(matrix.image, {
    tcgdex: sanitizeMediaValue(cardRecord.tcgdex_image_small || cardRecord.tcgdex_image),
    vera: sanitizeMediaValue(cardRecord.vera_images_small),
    legacy: sanitizeMediaValue(cardRecord.image || cardRecord.imageUrl),
  }, {
    fallback: sanitizeMediaValue(cardRecord.vera_images_small)
      || sanitizeMediaValue(cardRecord.tcgdex_image_small || cardRecord.tcgdex_image)
      || sanitizeMediaValue(cardRecord.image)
      || sanitizeMediaValue(cardRecord.imageUrl)
      || '',
  });
  const image = imageCandidates[0] || '';

  const imageLargeCandidates = collectValuesByPriority(matrix.imageLarge, {
    tcgdex: sanitizeMediaValue(cardRecord.tcgdex_image_large),
    vera: sanitizeMediaValue(cardRecord.vera_images_large),
    legacy: sanitizeMediaValue(cardRecord.imageLarge || cardRecord.imageLargeUrl || cardRecord.image || cardRecord.imageUrl),
  }, {
    fallback: sanitizeMediaValue(cardRecord.vera_images_large)
      || sanitizeMediaValue(cardRecord.tcgdex_image_large)
      || sanitizeMediaValue(cardRecord.imageLarge)
      || sanitizeMediaValue(cardRecord.imageLargeUrl)
      || sanitizeMediaValue(cardRecord.vera_images_small)
      || sanitizeMediaValue(cardRecord.tcgdex_image_small || cardRecord.tcgdex_image)
      || sanitizeMediaValue(cardRecord.image)
      || sanitizeMediaValue(cardRecord.imageUrl)
      || '',
  });
  const imageLarge = imageLargeCandidates[0] || image || '';

  const cardmarketUrlCandidates = collectValuesByPriority(matrix.cardmarketUrl, {
    tcgdex: cardRecord.tcgdex_cardmarket_url,
    vera: cardRecord.vera_cardmarket_url,
    legacy: cardRecord.cardmarketUrl || cardRecord.cardmarket_url || cardRecord.cardmarket?.url || '',
  }, {
    fallback: cardRecord.cardmarketUrl || cardRecord.vera_cardmarket_url || cardRecord.tcgdex_cardmarket_url || '',
  });
  const cardmarketUrl = resolvePreferredCardmarketUrl(cardmarketUrlCandidates);

  const rarity = resolveFieldByPriority(matrix.rarity, {
    tcgdex: cardRecord.tcgdex_rarity,
    vera: cardRecord.vera_rarity,
  }, { fallback: cardRecord.vera_rarity || cardRecord.tcgdex_rarity || '' });

  const hp = resolveFieldByPriority(matrix.hp, {
    tcgdex: cardRecord.tcgdex_hp,
    vera: cardRecord.vera_hp,
  }, { fallback: cardRecord.vera_hp || cardRecord.tcgdex_hp || '' });

  const types = resolveFieldByPriority(matrix.types, {
    tcgdex: Array.isArray(cardRecord.tcgdex_types) ? cardRecord.tcgdex_types : [],
    vera: Array.isArray(cardRecord.vera_types) ? cardRecord.vera_types : [],
  }, { fallback: cardRecord.vera_types || cardRecord.tcgdex_types || [] });

  const supertype = resolveFieldByPriority(matrix.supertype, {
    tcgdex: cardRecord.tcgdex_category,
    vera: cardRecord.vera_supertype,
  }, { fallback: cardRecord.vera_supertype || cardRecord.tcgdex_category || '' });

  const subtypes = resolveFieldByPriority(matrix.subtypes, {
    tcgdex: [cardRecord.tcgdex_stage || cardRecord.tcgdex_suffix].filter(Boolean),
    vera: Array.isArray(cardRecord.vera_subtypes) ? cardRecord.vera_subtypes : [],
  }, { fallback: cardRecord.vera_subtypes || [cardRecord.tcgdex_stage, cardRecord.tcgdex_suffix].filter(Boolean) || [] });

  const evolvesFrom = resolveFieldByPriority(matrix.evolvesFrom, {
    tcgdex: cardRecord.tcgdex_evolvesFrom,
    vera: cardRecord.vera_evolvesFrom,
  }, { fallback: cardRecord.vera_evolvesFrom || cardRecord.tcgdex_evolvesFrom || '' });

  const artist = resolveFieldByPriority(matrix.artist, {
    tcgdex: cardRecord.tcgdex_illustrator,
    vera: cardRecord.vera_artist,
  }, { fallback: cardRecord.vera_artist || cardRecord.tcgdex_illustrator || '' });

  const regulationMark = resolveFieldByPriority(matrix.regulationMark, {
    tcgdex: cardRecord.tcgdex_regulationMark,
    vera: cardRecord.vera_regulationMark,
  }, { fallback: cardRecord.vera_regulationMark || cardRecord.tcgdex_regulationMark || '' });

  const resolvedRules = resolveFieldByPriority(matrix.rules, {
    tcgdex: normalizeRules(null, {
      description: cardRecord.tcgdex_description,
      effect: cardRecord.tcgdex_effect,
    }),
    vera: Array.isArray(cardRecord.vera_rules) ? cardRecord.vera_rules : [],
  }, { fallback: rules });

  const flavorText = resolveFieldByPriority(matrix.flavorText, {
    tcgdex: cardRecord.tcgdex_description,
    vera: cardRecord.vera_flavorText,
  }, { fallback: cardRecord.vera_flavorText || cardRecord.tcgdex_description || '' });

  return {
    ...cardRecord,
    number,
    name,
    image,
    imageUrl: image,
    imageLarge,
    imageLargeUrl: imageLarge,
    cardmarketUrl,
    rarity,
    hp,
    types,
    supertype,
    subtypes,
    evolvesFrom,
    artist,
    regulationMark,
    rules: Array.isArray(resolvedRules) ? resolvedRules : [],
    flavorText,
  };
}

export function getStatsSeriesLabel(seriesKey = '', group = {}) {
  const label = String(group?.label || group?.canonicalName || '').trim();
  if (label) return label;
  const fallback = String(seriesKey || '').trim();
  return fallback || 'Andere';
}

export function filterSetsBySeriesKey(sets = [], seriesKey = '') {
  const normalizedKey = String(seriesKey || '').trim().toLowerCase();
  if (!normalizedKey) return [];

  return (sets || []).filter((set) => {
    const info = resolveSeriesGroupInfo(set || {});
    return String(info?.key || '').trim().toLowerCase() === normalizedKey;
  });
}

export function combineSetsForOverviewCompat({
  primarySets,
  tcgdexSets,
  tcgdexResolvedSets = tcgdexSets,
  customMappings,
  mapPrimarySetToOverviewModel,
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
      isOnlyTcgdex: false,
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
        isOnlyTcgdex: true,
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
        isTcgdexOnly: false,
      }));
      return;
    }

    if (isOnlyTcgdex && tcgdexSet) {
      mapped.push(buildSetRecordFromSources({
        setId: `TCGDEX-${tcgdexSet.id}`,
        primarySet: null,
        tcgdexSet,
        isTcgdexOnly: true,
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
