import { CONFIG } from '../core/config.js';
import { naturalSort } from '../core/utils.js';
import {
  loadCardsForSetCompat,
  combineSetsForOverviewCompat,
  fetchAllPrimaryCardsForSet,
  deduplicateVeraSets,
  combineVeraAndTcgdexSetsWithStatus
} from '../pokecode-compat.js';

// ── Interne Hilfsfunktionen ──────────────────────────────────────

function isAbortError(err) {
  return err?.name === 'AbortError';
}

async function fetchJson(url, { signal } = {}) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`API Fehler ${response.status}: ${url}`);
  return response.json();
}

let tcgdexSetsCache = null;
let veraSetsCache = null;
let lastSetMergeDiagnostics = null;

async function fetchTcgdexSets({ signal } = {}) {
  if (tcgdexSetsCache) return tcgdexSetsCache;
  try {
    const sets = await fetchJson(`${CONFIG.APIS.TCGDEX_DE}/sets`, { signal });
    tcgdexSetsCache = Array.isArray(sets) ? sets : [];
  } catch (err) {
    if (isAbortError(err)) throw err;
    tcgdexSetsCache = [];
  }
  return tcgdexSetsCache;
}

async function fetchPokemontcgSet(setId, { signal } = {}) {
  try {
    const data = await fetchJson(`${CONFIG.APIS.POKEMONTCG}/sets/${encodeURIComponent(setId)}`, { signal });
    return data?.data || null;
  } catch (err) {
    if (isAbortError(err)) throw err;
    return null;
  }
}

function resolveApiSetIds(setId) {
  const raw = String(setId || '').trim();
  const isTcgdexOnly = raw.startsWith('TCGDEX-');
  const tcgdexSetId = isTcgdexOnly ? raw.substring('TCGDEX-'.length) : raw;

  let primarySetId = null;
  if (!isTcgdexOnly) {
    primarySetId = raw;
  } else if (tcgdexSetId) {
    const lowerTcgdex = tcgdexSetId.toLowerCase();
    for (const [pokeId, mappedTcgdexId] of Object.entries(CONFIG.CUSTOM_SET_ID_MAPPINGS || {})) {
      if (String(mappedTcgdexId || '').toLowerCase() === lowerTcgdex) {
        primarySetId = String(pokeId || '').trim() || null;
        break;
      }
    }
  }

  return {
    rawSetId: raw,
    tcgdexSetId,
    primarySetId,
    isTcgdexOnly
  };
}

async function resolvePrimarySetForId(setId, primarySets = null) {
  if (String(setId).startsWith('TCGDEX-')) return null;
  if (Array.isArray(primarySets)) {
    const hit = primarySets.find((set) => String(set?.id || '').toLowerCase() === String(setId).toLowerCase());
    if (hit) return hit;
  }
  if (CONFIG.USE_VERA_API) {
    const veraSets = await fetchVeraSets().catch(() => []);
    const hit = veraSets.find((set) => String(set?.id || '').toLowerCase() === String(setId).toLowerCase());
    if (hit) return hit;
  }
  return fetchPokemontcgSet(setId);
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapSetToOverviewModel(set) {
  const id = String(set?.id || '').trim();
  if (!id) return null;
  const totalCards =
    toNumber(set?.total) ||
    toNumber(set?.printedTotal) ||
    toNumber(set?.cardCount?.total) ||
    toNumber(set?.cardCount?.official);

  return {
    setId: id,
    setName: set?.name || id,
    logoUrl: set?.images?.logo || set?.logo || '',
    symbolUrl: set?.images?.symbol || set?.symbol || '',
    series: set?.series || '',
    releaseDate: set?.releaseDate || set?.release_date || '',
    totalCards,
    ptcgoCode: set?.ptcgoCode || set?.code || ''
  };
}

async function fetchVeraSets({ signal } = {}) {
  if (veraSetsCache) return veraSetsCache;
  const url = `${CONFIG.APIS.VERA_BASE}/sets/${CONFIG.VERA_API_LANGUAGE}.json`;
  const data = await fetchJson(url, { signal });
  veraSetsCache = Array.isArray(data) ? data : [];
  return veraSetsCache;
}

async function fetchPokemontcgSets() {
  let page = 1;
  const pageSize = 250;
  const all = [];
  while (true) {
    const url = `${CONFIG.APIS.POKEMONTCG}/sets?page=${page}&pageSize=${pageSize}&orderBy=releaseDate`;
    const response = await fetchJson(url);
    const sets = response?.data || [];
    if (!sets.length) break;
    all.push(...sets);
    page += 1;
  }
  return all;
}

// ── Öffentliche API ────────────────────────────────────────────────

/**
 * Lädt und merged alle Kartendaten für ein Set.
 *
 * Für normale Sets (ID hat kein "TCGDEX-"-Präfix):
 *   1. Vera-API (schnell, gecachtes GitHub-Pages-JSON) oder pokemontcg.io als Fallback
 *   2. TCGDex DE für deutsche Namen und HD-Bilder
 *   3. TCGDex-only Karten werden als Union anhängt (neue DE-Karten die ptcg nicht hat)
 *
 * Für TCGDex-only Sets (ID beginnt mit "TCGDEX-"):
 *   Nur TCGDex, kein pokemontcg.io
 *
 * @param {string} setId  pokemontcg.io-Set-ID oder "TCGDEX-{tcgdexId}"
 * @returns {Promise<Array<{number, name, image, cardmarketUrl}>>}
 */
export async function fetchMergedCards(setId, { signal } = {}) {
  const tcgdexSets = await fetchTcgdexSets({ signal });
  const { primarySetId, isTcgdexOnly } = resolveApiSetIds(setId);
  let primarySet = null;
  if (!isTcgdexOnly && primarySetId) {
    if (CONFIG.USE_VERA_API) {
      const veraSets = await fetchVeraSets({ signal });
      primarySet = veraSets.find((set) => String(set?.id || '').toLowerCase() === String(primarySetId).toLowerCase()) || null;
      if (!primarySet) {
        primarySet = await fetchPokemontcgSet(primarySetId, { signal });
      }
    } else {
      primarySet = await fetchPokemontcgSet(primarySetId, { signal });
    }
  }

  const fetchJsonWithSignal = (url) => fetchJson(url, { signal });

  const { allCards } = await loadCardsForSetCompat({
    setId,
    setName: primarySet?.name || setId,
    useVeraApi: CONFIG.USE_VERA_API,
    primarySet,
    tcgdexSets,
    customMappings: CONFIG.CUSTOM_SET_ID_MAPPINGS,
    apis: {
      veraBase: CONFIG.APIS.VERA_BASE,
      veraLanguage: CONFIG.VERA_API_LANGUAGE,
      pokemontcgBase: CONFIG.APIS.POKEMONTCG,
      tcgdexBase: CONFIG.APIS.TCGDEX_DE
    },
    fetchJson: fetchJsonWithSignal
  });

  return naturalSort(allCards || [], 'number');
}

/**
 * Lädt alle verfügbaren Sets für das Dashboard-Overview.
 * Priorität: Vera-API, Fallback: pokemontcg.io.
 * @returns {Promise<Array<{setId, setName, logoUrl, symbolUrl, series, releaseDate, totalCards, ptcgoCode}>>}
 */
export async function fetchAllAvailableSets() {
  let primarySets = [];
  if (CONFIG.USE_VERA_API) {
    try {
      primarySets = await fetchVeraSets();
    } catch (err) {
      console.warn('[fetchAllAvailableSets] Vera sets failed, fallback to pokemontcg.io', err);
      primarySets = await fetchPokemontcgSets();
    }
  } else {
    primarySets = await fetchPokemontcgSets();
  }

  const tcgdexSets = await fetchTcgdexSets();
  const { deduplicated: dedupedPrimarySets, duplicates } = deduplicateVeraSets(primarySets);

  if (duplicates.length > 0) {
    console.warn(`[fetchAllAvailableSets] Vera duplicate set IDs detected: ${duplicates.length}`);
  }

  const combinedWithStatus = combineVeraAndTcgdexSetsWithStatus(
    dedupedPrimarySets,
    tcgdexSets,
    CONFIG.CUSTOM_SET_ID_MAPPINGS
  );

  lastSetMergeDiagnostics = {
    createdAt: new Date().toISOString(),
    duplicateSetIdsDetected: duplicates.length,
    duplicateDetails: duplicates,
    matchStatistics: combinedWithStatus.matchStatistics,
    warningThresholds: {
      unmatchedTcgdexOnlyWarnAt: 20,
      nameHeuristicWarnAt: 10
    }
  };

  if ((combinedWithStatus.matchStatistics?.unmatched_tcgdex_only || 0) >= 20) {
    console.warn('[fetchAllAvailableSets] High unmatched TCGdex-only count:', combinedWithStatus.matchStatistics.unmatched_tcgdex_only);
  }
  if ((combinedWithStatus.matchStatistics?.name_heuristic || 0) >= 10) {
    console.warn('[fetchAllAvailableSets] High heuristic-match count:', combinedWithStatus.matchStatistics.name_heuristic);
  }

  const combined = [];

  combinedWithStatus.matched.forEach((entry) => {
    const primarySet = entry?.sources?.vera;
    const tcgdexSet = entry?.sources?.tcgdex;
    if (!primarySet) return;

    const model = mapSetToOverviewModel(primarySet);
    if (!model) return;

    combined.push({
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
      cardCountNormal: toNumber(tcgdexSet?.cardCount?.normal),
      matchStatus: entry.matchStatus || null,
      matchReason: entry.matchReason || null,
      matchConfidence: entry.matchConfidence || 0,
      sources: {
        vera: primarySet,
        tcgdex: tcgdexSet || null
      }
    });
  });

  combinedWithStatus.tcgdexOnly.forEach((entry) => {
    const tcgdexSet = entry?.sources?.tcgdex;
    if (!tcgdexSet) return;

    combined.push({
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
      cardCountNormal: toNumber(tcgdexSet?.cardCount?.normal),
      matchStatus: entry.matchStatus,
      matchReason: entry.matchReason,
      matchConfidence: entry.matchConfidence,
      sources: {
        vera: null,
        tcgdex: tcgdexSet
      }
    });
  });

  return combined.sort((a, b) => {
    const aIsTcgdexOnly = String(a.setId).startsWith('TCGDEX-');
    const bIsTcgdexOnly = String(b.setId).startsWith('TCGDEX-');
    if (!aIsTcgdexOnly && bIsTcgdexOnly) return -1;
    if (aIsTcgdexOnly && !bIsTcgdexOnly) return 1;
    const dateA = new Date(a.releaseDate || 0).getTime();
    const dateB = new Date(b.releaseDate || 0).getTime();
    if (dateA !== dateB) return dateB - dateA;
    return naturalSort(a.setName || '', b.setName || '');
  });
}

export function getLastSetMergeDiagnostics() {
  return lastSetMergeDiagnostics;
}

export async function runPokecodeParityCheck({ setIds = [], maxSets = 10 } = {}) {
  const tcgdexSets = await fetchTcgdexSets();
  let primarySets = [];
  if (CONFIG.USE_VERA_API) {
    primarySets = await fetchVeraSets().catch(async () => fetchPokemontcgSets());
  } else {
    primarySets = await fetchPokemontcgSets();
  }

  const { deduplicated: dedupedPrimarySets } = deduplicateVeraSets(primarySets);

  const overviewAdapter = await fetchAllAvailableSets();
  const overviewCompat = combineSetsForOverviewCompat({
    primarySets: dedupedPrimarySets,
    tcgdexSets,
    customMappings: CONFIG.CUSTOM_SET_ID_MAPPINGS,
    mapPrimarySetToOverviewModel: mapSetToOverviewModel,
    toNumber
  }).sort((a, b) => {
    const aIsTcgdexOnly = String(a.setId).startsWith('TCGDEX-');
    const bIsTcgdexOnly = String(b.setId).startsWith('TCGDEX-');
    if (!aIsTcgdexOnly && bIsTcgdexOnly) return -1;
    if (aIsTcgdexOnly && !bIsTcgdexOnly) return 1;
    const dateA = new Date(a.releaseDate || 0).getTime();
    const dateB = new Date(b.releaseDate || 0).getTime();
    if (dateA !== dateB) return dateB - dateA;
    return naturalSort(a.setName || '', b.setName || '');
  });

  const normalizeOverview = (set) => ({
    setId: String(set?.setId || ''),
    setName: String(set?.setName || ''),
    series: String(set?.series || ''),
    releaseDate: String(set?.releaseDate || ''),
    totalCards: Number(set?.totalCards) || 0,
    ptcgoCode: String(set?.ptcgoCode || ''),
    logoUrl: String(set?.logoUrl || ''),
    symbolUrl: String(set?.symbolUrl || '')
  });

  const adapterMap = new Map(overviewAdapter.map((set) => [String(set.setId), normalizeOverview(set)]));
  const compatMap = new Map(overviewCompat.map((set) => [String(set.setId), normalizeOverview(set)]));
  const allOverviewIds = new Set([...adapterMap.keys(), ...compatMap.keys()]);
  const overviewMismatches = [];
  allOverviewIds.forEach((id) => {
    const left = adapterMap.get(id);
    const right = compatMap.get(id);
    if (!left || !right || JSON.stringify(left) !== JSON.stringify(right)) {
      overviewMismatches.push({ setId: id, adapter: left || null, compat: right || null });
    }
  });

  const defaultIds = overviewAdapter.map((set) => set.setId).filter((id) => !String(id).startsWith('TCGDEX-')).slice(0, maxSets);
  const checkedSetIds = (Array.isArray(setIds) && setIds.length ? setIds : defaultIds).slice(0, maxSets);

  const cardMismatches = [];
  const tcgdexOnlyUnionSummary = [];
  for (const setId of checkedSetIds) {
    const primarySet = await resolvePrimarySetForId(setId, primarySets);
    const adapterCards = await fetchMergedCards(setId);
    const compat = await loadCardsForSetCompat({
      setId,
      setName: primarySet?.name || setId,
      useVeraApi: CONFIG.USE_VERA_API,
      primarySet,
      tcgdexSets,
      customMappings: CONFIG.CUSTOM_SET_ID_MAPPINGS,
      apis: {
        veraBase: CONFIG.APIS.VERA_BASE,
        veraLanguage: CONFIG.VERA_API_LANGUAGE,
        pokemontcgBase: CONFIG.APIS.POKEMONTCG,
        tcgdexBase: CONFIG.APIS.TCGDEX_DE
      },
      fetchJson
    });

    const normalizeCards = (cards) => (cards || []).map((card) => ({
      number: String(card?.number || ''),
      name: String(card?.name || ''),
      image: String(card?.image || ''),
      cardmarketUrl: String(card?.cardmarketUrl || ''),
      rarity: String(card?.rarity || ''),
      rules: Array.isArray(card?.rules) ? card.rules : [],
      flavorText: String(card?.flavorText || '')
    })).sort((a, b) => naturalSort(a.number, b.number));

    const left = normalizeCards(adapterCards);
    const right = normalizeCards(compat.allCards);
    if (JSON.stringify(left) !== JSON.stringify(right)) {
      cardMismatches.push({
        setId,
        adapterCount: left.length,
        compatCount: right.length
      });
    }

    const isTcgdexOnlySet = String(setId).startsWith('TCGDEX-');
    if (!isTcgdexOnlySet && primarySet) {
      let primaryCards = [];
      try {
        primaryCards = await fetchAllPrimaryCardsForSet({
          setId,
          setName: primarySet?.name || setId,
          useVeraApi: CONFIG.USE_VERA_API,
          veraBaseUrl: CONFIG.APIS.VERA_BASE,
          veraLanguage: CONFIG.VERA_API_LANGUAGE,
          pokemontcgBaseUrl: CONFIG.APIS.POKEMONTCG,
          fetchJson
        });
      } catch {
        primaryCards = [];
      }

      const primaryNumbers = new Set((primaryCards || []).map((card) => String(card?.number || '').trim()));
      const compatExtras = (compat.allCards || []).filter((card) => !primaryNumbers.has(String(card?.number || '').trim()));
      tcgdexOnlyUnionSummary.push({
        setId,
        primaryCount: primaryCards.length,
        compatCount: (compat.allCards || []).length,
        tcgdexOnlyExtraCount: compatExtras.length,
        tcgdexOnlyExtraNumbers: compatExtras.map((card) => String(card?.number || ''))
      });
    }
  }

  return {
    createdAt: new Date().toISOString(),
    checkedSetCount: checkedSetIds.length,
    checkedSetIds,
    overviewChecked: overviewAdapter.length,
    overviewMismatches,
    cardMismatches,
    tcgdexOnlyUnionSummary,
    ok: overviewMismatches.length === 0 && cardMismatches.length === 0
  };
}
