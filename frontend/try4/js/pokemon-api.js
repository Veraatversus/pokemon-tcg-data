import { CONFIG } from './config.js';
import { normalizeCardNumber, naturalSort } from './utils.js';

// ── Interne Hilfsfunktionen ──────────────────────────────────────

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`API Fehler ${response.status}: ${url}`);
  return response.json();
}

function normalizeString(str) {
  if (str === null || typeof str === 'undefined') return '';
  return String(str).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Vera-API: lädt Karten aus dem GitHub-Pages-Repository.
 * Gibt null zurück wenn das Set dort nicht vorhanden ist.
 */
async function fetchVeraCards(setId) {
  try {
    const url = `${CONFIG.APIS.VERA_BASE}/cards/${CONFIG.VERA_API_LANGUAGE}/${encodeURIComponent(setId)}.json`;
    return await fetchJson(url);
  } catch {
    return null;
  }
}

/** Pokemontcg.io: lädt alle Karten eines Sets (paginiert). */
async function fetchPokemontcgCards(setId) {
  let page = 1;
  const pageSize = 250;
  const all = [];
  while (true) {
    const url = `${CONFIG.APIS.POKEMONTCG}/cards?q=set.id:${encodeURIComponent(setId)}&page=${page}&pageSize=${pageSize}`;
    const data = await fetchJson(url);
    const cards = data?.data || [];
    if (!cards.length) break;
    all.push(...cards);
    page += 1;
  }
  return all;
}

/** TCGDex DE: lädt Set-Daten mit allen Karten. Gibt null bei 404/Netzwerkfehler. */
async function fetchTcgdexSet(tcgdexId) {
  try {
    return await fetchJson(`${CONFIG.APIS.TCGDEX_DE}/sets/${encodeURIComponent(tcgdexId)}`);
  } catch {
    return null;
  }
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

function normalizeSetId(setId) {
  if (!setId) return '';
  let normalized = String(setId).toLowerCase().trim();
  normalized = normalized.replace(/(\d+)\.(\d+)/g, (_match, p1, p2) => `${parseInt(p1, 10)}pt${parseInt(p2, 10)}`);
  normalized = normalized.replace(/\s+/g, '-');
  normalized = normalized.replace(/[^a-z0-9-]/g, '');
  normalized = normalized.replace(/([a-z-]+)(\d+)/g, (_match, prefix, numberPart) => `${prefix}${parseInt(numberPart, 10)}`);
  return normalized;
}

/**
 * Gibt die TCGDex-ID zu einer pokemontcg.io-ID zurück.
 * Fällt auf die originale ID zurück wenn kein Mapping existiert.
 */
function toTcgdexId(pokemontcgId) {
  return CONFIG.CUSTOM_SET_ID_MAPPINGS?.[pokemontcgId] ?? pokemontcgId;
}

function findMatchingTcgdexSet(primarySet, allTcgdexSets) {
  if (!primarySet || !Array.isArray(allTcgdexSets)) return null;

  const byAbbreviation = new Map();
  const byName = new Map();
  const byId = new Map();
  const byNormalizedId = new Map();

  allTcgdexSets.forEach((set) => {
    if (set?.abbreviation?.official) byAbbreviation.set(String(set.abbreviation.official).toLowerCase(), set);
    if (set?.name) byName.set(normalizeString(set.name), set);
    if (set?.en?.name) byName.set(normalizeString(set.en.name), set);
    if (set?.id) {
      byId.set(String(set.id).toLowerCase(), set);
      byNormalizedId.set(normalizeSetId(set.id), set);
    }
  });

  const primarySetId = String(primarySet.id || '').toLowerCase();
  const customMappedTcgdexId = CONFIG.CUSTOM_SET_ID_MAPPINGS?.[primarySetId];
  if (customMappedTcgdexId) {
    const direct = byId.get(String(customMappedTcgdexId).toLowerCase());
    if (direct) return direct;
    const normalizedCustom = byNormalizedId.get(normalizeSetId(customMappedTcgdexId));
    if (normalizedCustom) return normalizedCustom;
  }

  const direct = byId.get(primarySetId);
  if (direct) return direct;

  const normalizedPrimaryId = normalizeSetId(primarySet.id);
  if (normalizedPrimaryId && byNormalizedId.has(normalizedPrimaryId)) {
    return byNormalizedId.get(normalizedPrimaryId);
  }

  if (primarySet.ptcgoCode) {
    const byCode = byAbbreviation.get(String(primarySet.ptcgoCode).toLowerCase());
    if (byCode) return byCode;
  }

  const normalizedPrimaryName = primarySet.name ? normalizeString(primarySet.name) : '';
  if (normalizedPrimaryName) {
    const exact = byName.get(normalizedPrimaryName);
    if (exact) return exact;

    for (const set of allTcgdexSets) {
      const deName = set?.name ? normalizeString(set.name) : '';
      const enName = set?.en?.name ? normalizeString(set.en.name) : '';
      if (
        (deName && normalizedPrimaryName.includes(deName)) ||
        (deName && deName.includes(normalizedPrimaryName)) ||
        (enName && normalizedPrimaryName.includes(enName)) ||
        (enName && enName.includes(normalizedPrimaryName))
      ) {
        return set;
      }
    }
  }

  return null;
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

/**
 * Gibt die beste Bild-URL für eine TCGDex-Karte zurück.
 * Priorität: TCGDex .image → Pokemontcg.io CDN-URL
 */
function tcgdexImageOrFallback(pokemontcgSetId, tcgdexCard) {
  if (tcgdexCard?.image) return `${tcgdexCard.image}/low.jpg`;
  const cardNo = normalizeCardNumber(tcgdexCard?.localId || tcgdexCard?.id || '');
  if (!cardNo) return null;
  return `https://images.pokemontcg.io/${pokemontcgSetId}/${cardNo}.png`;
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
  // ─ TCGDex-Only-Set ───────────────────────────────────────────
  if (setId.startsWith('TCGDEX-')) {
    const tcgdexId = setId.slice('TCGDEX-'.length);
    const tcgdexSet = await fetchTcgdexSet(tcgdexId);
    if (!tcgdexSet?.cards) return [];

    return naturalSort(
      tcgdexSet.cards.map((card) => ({
        number: normalizeCardNumber(card.localId || card.id),
        name: card.name,
        image: tcgdexImageOrFallback(tcgdexId, card),
        cardmarketUrl: card.links?.cardmarket || null
      })),
      'number'
    );
  }

  // ─ Regulares Set: Vera-API oder pokemontcg.io + TCGDex-Merge ───
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

  const primarySetLike = {
    id: setId,
    name: primarySet?.name || '',
    ptcgoCode: primarySet?.ptcgoCode || primarySet?.code || ''
  };

  let matchingTcgdexSet = findMatchingTcgdexSet(primarySetLike, tcgdexSets);
  if (!matchingTcgdexSet) {
    const mappedTcgdexId = toTcgdexId(setId);
    matchingTcgdexSet = tcgdexSets.find((set) => String(set?.id || '').toLowerCase() === String(mappedTcgdexId).toLowerCase()) || null;
  }
  const matchingTcgdexId = matchingTcgdexSet?.id || toTcgdexId(setId);

  // Beide Quellen parallel laden
  const [veraCards, ptcgCards, tcgdexSet] = await Promise.all([
    CONFIG.USE_VERA_API ? fetchVeraCards(setId) : Promise.resolve(null),
    CONFIG.USE_VERA_API ? Promise.resolve(null) : fetchPokemontcgCards(setId),
    fetchTcgdexSet(matchingTcgdexId)
  ]);

  // Falls Vera-API erfolgreich war, keine pokemontcg.io-Anfrage nötig
  // Falls nicht, pokemontcg.io-Fallback (lazy-load)
  let sourcePtcgCards;
  if (veraCards && Array.isArray(veraCards)) {
    sourcePtcgCards = veraCards;
  } else {
    // Vera-API fehlgeschlagen oder deaktiviert: pokemontcg.io
    sourcePtcgCards = ptcgCards ?? (await fetchPokemontcgCards(setId));
  }

  // TCGDex-Map nach normalisierter localId aufbauen
  const tcgdexMap = new Map();
  (tcgdexSet?.cards || []).forEach((card) => {
    tcgdexMap.set(normalizeCardNumber(card.localId || card.id), card);
  });

  // Merge: pokemontcg.io/Vera ⊕ TCGDex
  const merged = sourcePtcgCards.map((card) => {
    const number = normalizeCardNumber(card.number);
    const tcgdexCard = tcgdexMap.get(number);
    // Cardmarket-URL: tcgdex > ptcg > generiert
    const cardmarketUrl =
      tcgdexCard?.links?.cardmarket ||
      card.cardmarket?.url ||
      null;
    return {
      number,
      name: tcgdexCard?.name || card.name,
      image: tcgdexCard
        ? tcgdexImageOrFallback(matchingTcgdexId, tcgdexCard)
        : (card.images?.small || `https://images.pokemontcg.io/${setId}/${number}.png`),
      cardmarketUrl
    };
  });

  // TCGDex-only Karten als Union anhängen (z.B. neue DE-exklusive Promo-Karten)
  const existing = new Set(merged.map((c) => c.number));
  (tcgdexSet?.cards || []).forEach((tcgdexCard) => {
    const number = normalizeCardNumber(tcgdexCard.localId || tcgdexCard.id);
    if (existing.has(number)) return;
    merged.push({
      number,
      name: tcgdexCard.name,
      image: tcgdexImageOrFallback(matchingTcgdexId, tcgdexCard),
      cardmarketUrl: tcgdexCard.links?.cardmarket || null
    });
  });

  return naturalSort(merged, 'number');
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
  const matchedTcgdexIds = new Set();
  const combined = [];

  (primarySets || []).forEach((primarySet) => {
    const tcgdexMatch = findMatchingTcgdexSet(primarySet, tcgdexSets);
    if (tcgdexMatch?.id) matchedTcgdexIds.add(tcgdexMatch.id);
    const model = mapSetToOverviewModel(primarySet);
    if (!model) return;
    combined.push({
      ...model,
      setName: tcgdexMatch?.name || model.setName,
      releaseDate: model.releaseDate || tcgdexMatch?.releaseDate || '',
      ptcgoCode: model.ptcgoCode || tcgdexMatch?.abbreviation?.official || ''
    });
  });

  (tcgdexSets || []).forEach((tcgdexSet) => {
    if (!tcgdexSet?.id || matchedTcgdexIds.has(tcgdexSet.id)) return;
    combined.push({
      setId: `TCGDEX-${tcgdexSet.id}`,
      setName: tcgdexSet.name || tcgdexSet.en?.name || tcgdexSet.id,
      logoUrl: '',
      symbolUrl: '',
      series: tcgdexSet.serie?.name || '',
      releaseDate: tcgdexSet.releaseDate || '',
      totalCards: toNumber(tcgdexSet?.cardCount?.official) || toNumber(tcgdexSet?.cardCount?.total),
      ptcgoCode: tcgdexSet.abbreviation?.official || ''
    });
  });

  const unique = new Map();
  combined.forEach((set) => {
    if (!set?.setId) return;
    unique.set(set.setId, set);
  });

  return Array.from(unique.values()).sort((a, b) => {
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
