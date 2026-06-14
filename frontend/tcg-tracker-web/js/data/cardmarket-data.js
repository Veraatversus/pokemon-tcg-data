import { CONFIG } from '../core/config.js';
import {
  buildCardmarketProductUrl as sharedBuildCardmarketProductUrl,
  buildSetCardAssignmentMap as sharedBuildSetCardAssignmentMap,
  extractCardmarketProductId as sharedExtractCardmarketProductId,
  formatCardmarketEntryLabel as sharedFormatCardmarketEntryLabel,
  formatCardmarketEntryTitle as sharedFormatCardmarketEntryTitle,
  getCardmarketBaseUrl as sharedGetCardmarketBaseUrl,
  inferCardmarketExpansionIdFromCards as sharedInferCardmarketExpansionIdFromCards,
  isGeneratedCardmarketSearchUrl,
  promoteCardmarketUrlsForCards as sharedPromoteCardmarketUrlsForCards,
  resolveCardmarketEntryForCardFromSetPayload as sharedResolveCardmarketEntryForCardFromSetPayload,
  resolveCardmarketEntryFromSetPayload as sharedResolveCardmarketEntryFromSetPayload,
} from './cardmarket-ui-helpers.js?v=20260613-tcgdex-merge-fix-v2';

const REMOTE_CARDMARKET_BASE = `${String(CONFIG?.APIS?.VERA_BASE || '').replace(/\/$/, '')}/cardmarket`;

let productIndexCachePromise = null;
let nameIndexCachePromise = null;
let trackerSetIndexCachePromise = null;
const setPayloadCachePromise = new Map(); // expansionId → Promise<payload>
const inferredExpansionCache = new Map();
const setAssignmentMapCache = new Map(); // expansionId → { sourceCards, map }

async function fetchJson(url, { signal } = {}) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Cardmarket data error ${response.status}: ${url}`);
  return response.json();
}

function isLocalOrigin(origin = '') {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(?::\d+)?$/i.test(String(origin || '').trim());
}

export function getCardmarketBaseUrl({ origin = globalThis?.location?.origin } = {}) {
  return sharedGetCardmarketBaseUrl({ origin, remoteBase: REMOTE_CARDMARKET_BASE });
}

export function extractCardmarketProductId(url = '') {
  return sharedExtractCardmarketProductId(url);
}

function getCardmarketUrlFromCard(card = {}) {
  return String(card?.cardmarketUrl || card?.vera_cardmarket_url || card?.tcgdex_cardmarket_url || '').trim();
}

export function buildCardmarketProductUrl(productId, { language = 'de' } = {}) {
  return sharedBuildCardmarketProductUrl(productId, { language });
}

export function resolveCardmarketEntryFromSetPayload(setPayload = {}, productId = '') {
  return sharedResolveCardmarketEntryFromSetPayload(setPayload, productId);
}

function normalizeMatcherText(value = '') {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function extractEntryBaseName(value = '') {
  return String(value || '').split('[')[0].trim();
}

function extractEntryHintTokens(value = '') {
  const bracketMatch = String(value || '').match(/\[([^\]]+)\]/);
  if (!bracketMatch?.[1]) return [];

  return bracketMatch[1]
    .split('|')
    .map((token) => normalizeMatcherText(token))
    .filter(Boolean);
}

function extractCardHintTokens(card = {}) {
  const tokens = new Set();
  const pushToken = (value) => {
    const normalized = normalizeMatcherText(value);
    if (normalized) tokens.add(normalized);
  };

  (Array.isArray(card?.vera_abilities) ? card.vera_abilities : []).forEach((ability) => {
    pushToken(ability?.name || '');
  });

  (Array.isArray(card?.vera_attacks) ? card.vera_attacks : []).forEach((attack) => {
    pushToken(attack?.name || '');
  });

  return Array.from(tokens);
}

function extractPreferredCardNames(card = {}) {
  return Array.from(new Set(
    [card?.vera_name, card?.tcgdex_name, card?.name]
      .map((value) => normalizeMatcherText(value))
      .filter(Boolean)
  ));
}

function hasDuplicateNameContext(card = {}, sourceCards = []) {
  if (!Array.isArray(sourceCards) || sourceCards.length < 2) return false;

  const targetNames = extractPreferredCardNames(card);
  if (!targetNames.length) return false;

  let matchCount = 0;
  for (const sourceCard of sourceCards) {
    const sourceNames = extractPreferredCardNames(sourceCard);
    if (sourceNames.some((name) => targetNames.includes(name))) {
      matchCount += 1;
      if (matchCount > 1) return true;
    }
  }

  return false;
}

function normalizeCodeKey(value = '') {
  return normalizeMatcherText(value).replace(/\s+/g, '');
}

function extractPotentialPtcgoCodes(cards = []) {
  const codes = new Set();

  cards.forEach((card) => {
    const url = getCardmarketUrlFromCard(card);
    const match = String(url || '').match(/searchString=([^&#]+)/i);
    if (!match?.[1]) return;

    try {
      const decoded = decodeURIComponent(match[1]).replace(/\+/g, ' ');
      const firstToken = String(decoded).trim().split(/\s+/)[0] || '';
      const normalized = normalizeCodeKey(firstToken);
      if (normalized) codes.add(normalized);
    } catch {
      // ignore malformed search urls
    }
  });

  return Array.from(codes);
}

export function inferCardmarketExpansionIdFromCards(cards = [], productIndex = {}, { nameIndex = null, trackerSetIndex = null } = {}) {
  return sharedInferCardmarketExpansionIdFromCards(cards, productIndex, { nameIndex, trackerSetIndex });
}

export function resolveCardmarketEntryForCardFromSetPayload(card = {}, setPayload = {}, { sourceCards = [] } = {}) {
  return sharedResolveCardmarketEntryForCardFromSetPayload(card, setPayload, { sourceCards });
}

function toFinitePrice(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function formatEuroPrice(value) {
  const numeric = toFinitePrice(value);
  return numeric == null ? '' : `${numeric.toFixed(2).replace('.', ',')} €`;
}

export function formatCardmarketEntryLabel(entry = {}) {
  return sharedFormatCardmarketEntryLabel(entry);
}

export function formatCardmarketEntryTitle(entry = {}) {
  return sharedFormatCardmarketEntryTitle(entry);
}

export function loadCardmarketProductIndex({ signal, forceRefresh = false } = {}) {
  if (!forceRefresh && productIndexCachePromise) return productIndexCachePromise;
  const baseUrl = getCardmarketBaseUrl();
  productIndexCachePromise = fetchJson(`${baseUrl}/index/products.json`, { signal })
    .catch((err) => { productIndexCachePromise = null; throw err; });
  return productIndexCachePromise;
}

export function loadCardmarketNameIndex({ signal, forceRefresh = false } = {}) {
  if (!forceRefresh && nameIndexCachePromise) return nameIndexCachePromise;
  const baseUrl = getCardmarketBaseUrl();
  nameIndexCachePromise = fetchJson(`${baseUrl}/index/names.json`, { signal })
    .catch(() => { nameIndexCachePromise = null; return {}; });
  return nameIndexCachePromise;
}

export function loadCardmarketTrackerSetIndex({ signal, forceRefresh = false } = {}) {
  if (!forceRefresh && trackerSetIndexCachePromise) return trackerSetIndexCachePromise;
  const baseUrl = getCardmarketBaseUrl();
  trackerSetIndexCachePromise = fetchJson(`${baseUrl}/index/tracker.json`, { signal })
    .catch(() => { trackerSetIndexCachePromise = null; return { bySetId: {}, byPtcgoCode: {}, bySetName: {} }; });
  return trackerSetIndexCachePromise;
}

export function loadCardmarketSetPayload(expansionId, { signal, forceRefresh = false } = {}) {
  const normalizedExpansionId = String(expansionId || '').trim();
  if (!normalizedExpansionId) return Promise.resolve(null);

  if (!forceRefresh && setPayloadCachePromise.has(normalizedExpansionId)) {
    return setPayloadCachePromise.get(normalizedExpansionId);
  }

  const baseUrl = getCardmarketBaseUrl();
  const promise = fetchJson(`${baseUrl}/sets/${encodeURIComponent(normalizedExpansionId)}.json`, { signal })
    .catch((err) => { setPayloadCachePromise.delete(normalizedExpansionId); throw err; });
  setPayloadCachePromise.set(normalizedExpansionId, promise);
  return promise;
}

export async function resolveCardmarketEntryByUrl(cardmarketUrl, { signal, forceRefresh = false } = {}) {
  const productId = extractCardmarketProductId(cardmarketUrl);
  if (!productId) return null;

  const productIndex = await loadCardmarketProductIndex({ signal, forceRefresh });
  const productMeta = productIndex?.[productId];
  if (!productMeta?.expansionId) return null;

  const setPayload = await loadCardmarketSetPayload(productMeta.expansionId, { signal, forceRefresh });
  return resolveCardmarketEntryFromSetPayload(setPayload, productId);
}

export async function resolveCardmarketEntryForCard(card = {}, { cards = [], resolveSetById = null, currentSetId = '', signal, forceRefresh = false } = {}) {
  const directUrl = getCardmarketUrlFromCard(card);

  const setId = String(card?.setId || '').trim();
  const cacheLookupSetId = String(currentSetId || setId || '').trim();
  let expansionId = !forceRefresh && cacheLookupSetId ? inferredExpansionCache.get(cacheLookupSetId) : '';

  if (!expansionId) {
    const [productIndex, nameIndex, trackerSetIndex] = await Promise.all([
      loadCardmarketProductIndex({ signal, forceRefresh }),
      loadCardmarketNameIndex({ signal, forceRefresh }),
      loadCardmarketTrackerSetIndex({ signal, forceRefresh })
    ]);
    expansionId = inferCardmarketExpansionIdFromCards(cards, productIndex, {
      nameIndex,
      trackerSetIndex,
      resolveSetById,
      currentSetId
    });
    if (cacheLookupSetId && expansionId) {
      inferredExpansionCache.set(cacheLookupSetId, expansionId);
    }
  }

  if (!expansionId) {
    return directUrl ? resolveCardmarketEntryByUrl(directUrl, { signal, forceRefresh }) : null;
  }

  const setPayload = await loadCardmarketSetPayload(expansionId, { signal, forceRefresh });

  // Build or reuse the set-level assignment map (blacklisting already-assigned products per set)
  const cached = !forceRefresh && setAssignmentMapCache.get(expansionId);
  let assignmentMap;
  if (cached && cached.sourceCards === cards) {
    assignmentMap = cached.map;
  } else {
    assignmentMap = sharedBuildSetCardAssignmentMap(cards, setPayload);
    setAssignmentMapCache.set(expansionId, { sourceCards: cards, map: assignmentMap });
  }

  const matchedEntry = assignmentMap.get(card) ?? null;
  if (matchedEntry) return matchedEntry;

  return directUrl ? resolveCardmarketEntryByUrl(directUrl, { signal, forceRefresh }) : null;
}

export async function promoteCardmarketUrlsForCards(cards = [], { productIndex = null, setPayload = null, resolveSetById = null, currentSetId = '', signal, forceRefresh = false } = {}) {
  return sharedPromoteCardmarketUrlsForCards(cards, {
    productIndex,
    setPayload,
    resolveSetById,
    currentSetId,
    signal,
    forceRefresh,
    loadProductIndex: productIndex ? null : ({ signal, forceRefresh } = {}) => loadCardmarketProductIndex({ signal, forceRefresh }),
    loadNameIndex: ({ signal, forceRefresh } = {}) => loadCardmarketNameIndex({ signal, forceRefresh }),
    loadTrackerSetIndex: ({ signal, forceRefresh } = {}) => loadCardmarketTrackerSetIndex({ signal, forceRefresh }),
    loadSetPayload: (expansionId, { signal, forceRefresh } = {}) => loadCardmarketSetPayload(expansionId, { signal, forceRefresh }),
  });
}

/**
 * Leert alle In-Memory-Caches dieses Moduls.
 *
 * Wird nach einem Versionswechsel der täglich neu erzeugten
 * Cardmarket-Artefakte aufgerufen, damit Preise, Expansion-IDs und
 * Set-Payloads neu vom Server geladen werden. Die TTL-Caches in
 * `core/cache.js` sind davon nicht betroffen – sie laufen ohnehin
 * nach `CACHE_TTL_MS` ab.
 */
export function resetCardmarketDataCaches() {
  productIndexCachePromise = null;
  nameIndexCachePromise = null;
  trackerSetIndexCachePromise = null;
  setPayloadCachePromise.clear();
  inferredExpansionCache.clear();
  setAssignmentMapCache.clear();
}
