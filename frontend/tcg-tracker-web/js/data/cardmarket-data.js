import { CONFIG } from '../core/config.js';
import { isLocalDevEnvironment } from '../core/dev-environment.js';
import {
  buildCardmarketImageUrl as sharedBuildCardmarketImageUrl,
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
} from './cardmarket-ui-helpers.js?v=20261112-api-v3';
import { resolveCardmarketProductId } from './cardmarket-url-utils.js';
import { fetchCardmarketBuildStamp, readCardmarketBuildStamp } from './cardmarket-build-stamp.js?v=20261112-api-v3';

const REMOTE_CARDMARKET_BASE = `${String(CONFIG?.APIS?.VERA_BASE || '').replace(/\/$/, '')}/cardmarket`;

let productIndexCachePromise = null;
let nameIndexCachePromise = null;
let trackerSetIndexCachePromise = null;
const setPayloadCachePromise = new Map(); // expansionId → Promise<payload>
const inferredExpansionCache = new Map();
const setAssignmentMapCache = new Map(); // expansionId → { sourceCards, map }

// Build-Stamp (cardmarket/meta.json generatedAt) der taeglich neu gebauten Daten. Er haengt als ?v=<stamp>
// an jeder Daten-URL: der Service Worker cached diese URLs cache-first, ein neuer Stamp ist eine neue URL
// und wird damit beim ersten Laden nach dem Build aus dem Netz geholt. Ohne gesetzten Stamp wird
// meta.json einmal je Seitenaufruf gelesen (offline: zuletzt gespeicherter Stamp).
let dataVersion = '';
let dataVersionPromise = null;

export function setCardmarketDataVersion(stamp) {
  dataVersion = String(stamp || '').trim();
  dataVersionPromise = null;
}

function getCardmarketDataVersion({ signal } = {}) {
  if (dataVersion) return Promise.resolve(dataVersion);
  if (!dataVersionPromise) {
    dataVersionPromise = fetchCardmarketBuildStamp({ signal })
      .then((stamp) => stamp || readCardmarketBuildStamp())
      .then((stamp) => {
        if (stamp && !dataVersion) dataVersion = stamp;
        return dataVersion || stamp || '';
      })
      .catch(() => { dataVersionPromise = null; return ''; });
  }
  return dataVersionPromise;
}

async function fetchJson(path, { signal } = {}) {
  const version = await getCardmarketDataVersion({ signal });
  const url = `${getCardmarketBaseUrl()}${path}${version ? `?v=${encodeURIComponent(version)}` : ''}`;
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

export function buildCardmarketImageUrl(payload = {}) {
  return sharedBuildCardmarketImageUrl({
    ...payload,
    proxyUrl: payload?.proxyUrl ?? getCardmarketImageProxyUrl()
  });
}

// Reads the Cardmarket image proxy URL from the user settings (localStorage).
// Returns empty string when:
//   - the user hasn't configured a proxy, or
//   - the runtime is NOT a local-dev environment (production always ignores
//     the setting so the direct S3 URL is used).
export function getCardmarketImageProxyUrl() {
  if (!isLocalDevEnvironment()) return '';
  try {
    const raw = localStorage.getItem('poke:release:user-settings');
    if (!raw) return '';
    const parsed = JSON.parse(raw);
    return String(parsed?.cardmarketImageProxyUrl || '').trim().replace(/\/$/, '');
  } catch {
    return '';
  }
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
  productIndexCachePromise = fetchJson('/index/products.json', { signal })
    .catch((err) => { productIndexCachePromise = null; throw err; });
  return productIndexCachePromise;
}

export function loadCardmarketNameIndex({ signal, forceRefresh = false } = {}) {
  if (!forceRefresh && nameIndexCachePromise) return nameIndexCachePromise;
  nameIndexCachePromise = fetchJson('/index/names.json', { signal })
    .catch(() => { nameIndexCachePromise = null; return {}; });
  return nameIndexCachePromise;
}

export function loadCardmarketTrackerSetIndex({ signal, forceRefresh = false } = {}) {
  if (!forceRefresh && trackerSetIndexCachePromise) return trackerSetIndexCachePromise;
  trackerSetIndexCachePromise = fetchJson('/index/tracker.json', { signal })
    .catch(() => { trackerSetIndexCachePromise = null; return { bySetId: {}, byPtcgoCode: {}, bySetName: {} }; });
  return trackerSetIndexCachePromise;
}

export function loadCardmarketSetPayload(expansionId, { signal, forceRefresh = false } = {}) {
  const normalizedExpansionId = String(expansionId || '').trim();
  if (!normalizedExpansionId) return Promise.resolve(null);

  if (!forceRefresh && setPayloadCachePromise.has(normalizedExpansionId)) {
    return setPayloadCachePromise.get(normalizedExpansionId);
  }

  const promise = fetchJson(`/sets/${encodeURIComponent(normalizedExpansionId)}.json`, { signal })
    .catch((err) => { setPayloadCachePromise.delete(normalizedExpansionId); throw err; });
  setPayloadCachePromise.set(normalizedExpansionId, promise);
  return promise;
}

export async function resolveCardmarketEntryByUrl(cardmarketUrl, { signal, forceRefresh = false } = {}) {
  return resolveCardmarketEntryByProductId(extractCardmarketProductId(cardmarketUrl), { signal, forceRefresh });
}

/**
 * Preis-Eintrag zu einer bekannten Produkt-ID. Guenstiger Weg zuerst: Set-ID -> Expansion
 * (tracker.json, wenige KB) -> Set-Payload; nur wenn das Produkt dort nicht liegt, die
 * Produkt->Expansion-Tabelle (products.json, mehrere MB).
 */
export async function resolveCardmarketEntryByProductId(productId, { setId = '', signal, forceRefresh = false } = {}) {
  const normalizedProductId = String(productId || '').trim();
  if (!normalizedProductId) return null;

  const trackerKey = String(setId || '').replace(/^TCGDEX-/i, '').trim().toLowerCase();
  if (trackerKey) {
    const trackerSetIndex = await loadCardmarketTrackerSetIndex({ signal, forceRefresh });
    const expansionId = String(trackerSetIndex?.bySetId?.[trackerKey] || '').trim();
    if (expansionId) {
      const setPayload = await loadCardmarketSetPayload(expansionId, { signal, forceRefresh }).catch((err) => {
        if (err?.name === 'AbortError') throw err;
        return null;
      });
      const entry = resolveCardmarketEntryFromSetPayload(setPayload, normalizedProductId);
      if (entry) return entry;
    }
  }

  const productIndex = await loadCardmarketProductIndex({ signal, forceRefresh });
  const productMeta = productIndex?.[normalizedProductId];
  if (!productMeta?.expansionId) return null;

  const setPayload = await loadCardmarketSetPayload(productMeta.expansionId, { signal, forceRefresh });
  return resolveCardmarketEntryFromSetPayload(setPayload, normalizedProductId);
}

// Reihenfolge (siehe resolveCardmarketProductId): v3-Produkt-ID -> Legacy-URL mit idProduct -> Matcher.
// Eine v3-ID ist massgeblich: fehlen dazu Preisdaten, gibt es keinen Preis statt eines Matcher-Treffers.
export async function resolveCardmarketEntryForCard(card = {}, { cards = [], resolveSetById = null, currentSetId = '', signal, forceRefresh = false } = {}) {
  const { productId, source } = resolveCardmarketProductId(card);
  if (productId) {
    const entry = await resolveCardmarketEntryByProductId(productId, {
      setId: String(card?.setId || currentSetId || '').trim(),
      signal,
      forceRefresh
    });
    if (entry || source === 'v3') return entry;
  }

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

export async function promoteCardmarketUrlsForCards(cards = [], { productIndex = null, setPayload = null, resolveSetById = null, currentSetId = '', setRecord = null, signal, forceRefresh = false } = {}) {
  const proxyUrl = getCardmarketImageProxyUrl();
  return sharedPromoteCardmarketUrlsForCards(cards, {
    productIndex,
    setPayload,
    resolveSetById,
    currentSetId,
    setRecord,
    proxyUrl,
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
  dataVersion = '';
  dataVersionPromise = null;
}
