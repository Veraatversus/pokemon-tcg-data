import { CONFIG } from './config.js';
import { naturalSort } from './utils.js';
import {
  loadCardsForSetCompat,
  combineSetsForOverviewCompat
} from './pokecode-compat.js';

// ── Interne Hilfsfunktionen ──────────────────────────────────────

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`API Fehler ${response.status}: ${url}`);
  return response.json();
}

let tcgdexSetsCache = null;
let veraSetsCache = null;

async function fetchTcgdexSets() {
  if (tcgdexSetsCache) return tcgdexSetsCache;
  try {
    const sets = await fetchJson(`${CONFIG.APIS.TCGDEX_DE}/sets`);
    tcgdexSetsCache = Array.isArray(sets) ? sets : [];
  } catch {
    tcgdexSetsCache = [];
  }
  return tcgdexSetsCache;
}

async function fetchPokemontcgSet(setId) {
  try {
    const data = await fetchJson(`${CONFIG.APIS.POKEMONTCG}/sets/${encodeURIComponent(setId)}`);
    return data?.data || null;
  } catch {
    return null;
  }
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

async function fetchVeraSets() {
  if (veraSetsCache) return veraSetsCache;
  const url = `${CONFIG.APIS.VERA_BASE}/sets/${CONFIG.VERA_API_LANGUAGE}.json`;
  const data = await fetchJson(url);
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
export async function fetchMergedCards(setId) {
  const tcgdexSets = await fetchTcgdexSets();
  let primarySet = null;
  if (CONFIG.USE_VERA_API) {
    const veraSets = await fetchVeraSets();
    primarySet = veraSets.find((set) => String(set?.id || '').toLowerCase() === String(setId).toLowerCase()) || null;
    if (!primarySet) {
      primarySet = await fetchPokemontcgSet(setId);
    }
  } else {
    primarySet = await fetchPokemontcgSet(setId);
  }

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
    fetchJson
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
  const combined = combineSetsForOverviewCompat({
    primarySets,
    tcgdexSets,
    customMappings: CONFIG.CUSTOM_SET_ID_MAPPINGS,
    mapPrimarySetToOverviewModel: mapSetToOverviewModel,
    toNumber
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
