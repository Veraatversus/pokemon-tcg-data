import { CONFIG } from '../core/config.js';
import { naturalSort } from '../core/utils.js';
import {
  loadCardsForSetCompat,
  combineSetsForOverviewCompat,
  fetchAllPrimaryCardsForSet
} from '../pokecode-compat.js?v=20260403d';
import { buildSetRecordFromSources, resolveDisplayCard, resolveDisplaySet } from './schema-contract.js?v=20260504d';

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
let tcgdexSetsDetailedCache = null;
let veraSetsCache = null;

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

/**
 * Lädt alle TCGDex-Sets als vollständige Detailobjekte (inkl. serie, abbreviation,
 * releaseDate, legal, logo). Nutzt Batches von 15 gleichzeitigen Requests um die API
 * nicht zu überlasten. Ergebnis wird für die Session gecacht.
 */
async function fetchTcgdexSetsDetailed({ signal } = {}) {
  if (tcgdexSetsDetailedCache) return tcgdexSetsDetailedCache;
  const summaryList = await fetchTcgdexSets({ signal });
  if (!summaryList.length) {
    tcgdexSetsDetailedCache = [];
    return tcgdexSetsDetailedCache;
  }
  const BATCH_SIZE = 15;
  const detailed = [];
  for (let i = 0; i < summaryList.length; i += BATCH_SIZE) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const batch = summaryList.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((set) =>
        fetchJson(`${CONFIG.APIS.TCGDEX_DE}/sets/${encodeURIComponent(set.id)}`, { signal })
          .catch(() => set)
      )
    );
    results.forEach((result, idx) => {
      detailed.push(result.status === 'fulfilled' ? result.value : batch[idx]);
    });
    if (i + BATCH_SIZE < summaryList.length) {
      await new Promise((r) => setTimeout(r, 30));
    }
  }
  tcgdexSetsDetailedCache = detailed;
  return tcgdexSetsDetailedCache;
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
  const payload = await fetchMergedCardsWithSetMeta(setId, { signal });
  return payload.cards;
}

/**
 * Lädt gemergte Kartendaten plus Set-Metadaten-Patch aus den tatsächlich genutzten Endpunkten.
 * Wichtig: tcgdex-Kartendaten kommen hier aus /sets/{id}.cards (nicht /cards).
 */
export async function fetchMergedCardsWithSetMeta(setId, { signal } = {}) {
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

  const { allCards, tcgdexDetailedSet, matchingTcgdexSet } = await loadCardsForSetCompat({
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

  const cards = naturalSort((allCards || []).map((card) => resolveDisplayCard(card)), 'number');

  // Set-Meta-Patch aus den beim Kartenabruf vorhandenen Setdaten zusammenbauen,
  // damit Overview/DB keine leeren tcgdex-Felder behalten.
  const tcgdexSet = tcgdexDetailedSet || matchingTcgdexSet || null;
  const setMetaPatch = resolveDisplaySet(buildSetRecordFromSources({
    setId,
    primarySet,
    tcgdexSet,
    isTcgdexOnly,
    imported: false
  }));

  return { cards, setMetaPatch };
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

  const tcgdexSets = await fetchTcgdexSetsDetailed();
  const combined = combineSetsForOverviewCompat({
    primarySets,
    tcgdexSets,
    customMappings: CONFIG.CUSTOM_SET_ID_MAPPINGS,
    mapPrimarySetToOverviewModel: mapSetToOverviewModel,
    toNumber
  });

  return combined.map((set) => resolveDisplaySet(set)).sort((a, b) => {
    const aIsTcgdexOnly = String(a.setId).startsWith('TCGDEX-');
    const bIsTcgdexOnly = String(b.setId).startsWith('TCGDEX-');
    if (!aIsTcgdexOnly && bIsTcgdexOnly) return -1;
    if (aIsTcgdexOnly && !bIsTcgdexOnly) return 1;
    const dateA = new Date(a.releaseDate || 0).getTime();
    const dateB = new Date(b.releaseDate || 0).getTime();
    if (dateA !== dateB) return dateB - dateA;
    return String(a.setName || '').localeCompare(String(b.setName || ''), undefined, { numeric: true, sensitivity: 'base' });
  });
}

export async function runPokecodeParityCheck({ setIds = [], maxSets = 10 } = {}) {
  const tcgdexSets = await fetchTcgdexSets();
  let primarySets = [];
  if (CONFIG.USE_VERA_API) {
    primarySets = await fetchVeraSets().catch(async () => fetchPokemontcgSets());
  } else {
    primarySets = await fetchPokemontcgSets();
  }

  const overviewAdapter = await fetchAllAvailableSets();
  const overviewCompat = combineSetsForOverviewCompat({
    primarySets,
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

    const normalizeCards = (cards) => (cards || []).map((card) => {
      const resolved = resolveDisplayCard(card);
      return {
      number: String(card?.number || ''),
      name: String(resolved?.name || ''),
      image: String(resolved?.image || ''),
      cardmarketUrl: String(resolved?.cardmarketUrl || ''),
      rarity: String(resolved?.rarity || ''),
      rules: Array.isArray(resolved?.rules) ? resolved.rules : [],
      flavorText: String(resolved?.flavorText || '')
      };
    }).sort((a, b) => String(a.number).localeCompare(String(b.number), undefined, { numeric: true, sensitivity: 'base' }));

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
