import { CONFIG } from '../core/config.js';
import {
  buildCardmarketProductUrl as sharedBuildCardmarketProductUrl,
  extractCardmarketProductId as sharedExtractCardmarketProductId,
  formatCardmarketEntryLabel as sharedFormatCardmarketEntryLabel,
  formatCardmarketEntryTitle as sharedFormatCardmarketEntryTitle,
  getCardmarketBaseUrl as sharedGetCardmarketBaseUrl,
  inferCardmarketExpansionIdFromCards as sharedInferCardmarketExpansionIdFromCards,
  promoteCardmarketUrlsForCards as sharedPromoteCardmarketUrlsForCards,
  resolveCardmarketEntryForCardFromSetPayload as sharedResolveCardmarketEntryForCardFromSetPayload,
  resolveCardmarketEntryFromSetPayload as sharedResolveCardmarketEntryFromSetPayload,
} from '../../../../scripts/cardmarket/lib/cardmarket-ui-helpers.mjs';

const REMOTE_CARDMARKET_BASE = `${String(CONFIG?.APIS?.VERA_BASE || '').replace(/\/$/, '')}/cardmarket`;

let productIndexCache = null;
let nameIndexCache = null;
let trackerSetIndexCache = null;
const setPayloadCache = new Map();
const inferredExpansionCache = new Map();

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

function isGeneratedCardmarketSearchUrl(url = '') {
  const value = String(url || '').trim().toLowerCase();
  return value.includes('cardmarket.com') && value.includes('/products/search') && value.includes('searchstring=');
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

export function resolveCardmarketEntryForCardFromSetPayload(card = {}, setPayload = {}) {
  return sharedResolveCardmarketEntryForCardFromSetPayload(card, setPayload);
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

export async function loadCardmarketProductIndex({ signal, forceRefresh = false } = {}) {
  if (!forceRefresh && productIndexCache) return productIndexCache;
  const baseUrl = getCardmarketBaseUrl();
  productIndexCache = await fetchJson(`${baseUrl}/index/products.json`, { signal });
  return productIndexCache;
}

export async function loadCardmarketNameIndex({ signal, forceRefresh = false } = {}) {
  if (!forceRefresh && nameIndexCache) return nameIndexCache;
  const baseUrl = getCardmarketBaseUrl();
  try {
    nameIndexCache = await fetchJson(`${baseUrl}/index/names.json`, { signal });
  } catch {
    nameIndexCache = {};
  }
  return nameIndexCache;
}

export async function loadCardmarketTrackerSetIndex({ signal, forceRefresh = false } = {}) {
  if (!forceRefresh && trackerSetIndexCache) return trackerSetIndexCache;
  const baseUrl = getCardmarketBaseUrl();
  try {
    trackerSetIndexCache = await fetchJson(`${baseUrl}/index/tracker.json`, { signal });
  } catch {
    trackerSetIndexCache = { bySetId: {}, byPtcgoCode: {} };
  }
  return trackerSetIndexCache;
}

export async function loadCardmarketSetPayload(expansionId, { signal, forceRefresh = false } = {}) {
  const normalizedExpansionId = String(expansionId || '').trim();
  if (!normalizedExpansionId) return null;

  if (!forceRefresh && setPayloadCache.has(normalizedExpansionId)) {
    return setPayloadCache.get(normalizedExpansionId);
  }

  const baseUrl = getCardmarketBaseUrl();
  const payload = await fetchJson(`${baseUrl}/sets/${encodeURIComponent(normalizedExpansionId)}.json`, { signal });
  setPayloadCache.set(normalizedExpansionId, payload);
  return payload;
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

export async function resolveCardmarketEntryForCard(card = {}, { cards = [], signal, forceRefresh = false } = {}) {
  const directUrl = getCardmarketUrlFromCard(card);
  if (directUrl) {
    const directEntry = await resolveCardmarketEntryByUrl(directUrl, { signal, forceRefresh });
    if (directEntry) return directEntry;
  }

  const setId = String(card?.setId || '').trim();
  let expansionId = !forceRefresh && setId ? inferredExpansionCache.get(setId) : '';

  if (!expansionId) {
    const [productIndex, nameIndex, trackerSetIndex] = await Promise.all([
      loadCardmarketProductIndex({ signal, forceRefresh }),
      loadCardmarketNameIndex({ signal, forceRefresh }),
      loadCardmarketTrackerSetIndex({ signal, forceRefresh })
    ]);
    expansionId = inferCardmarketExpansionIdFromCards(cards, productIndex, { nameIndex, trackerSetIndex });
    if (setId && expansionId) {
      inferredExpansionCache.set(setId, expansionId);
    }
  }

  if (!expansionId) return null;

  const setPayload = await loadCardmarketSetPayload(expansionId, { signal, forceRefresh });
  return resolveCardmarketEntryForCardFromSetPayload(card, setPayload);
}

export async function promoteCardmarketUrlsForCards(cards = [], { productIndex = null, setPayload = null, signal, forceRefresh = false } = {}) {
  return sharedPromoteCardmarketUrlsForCards(cards, {
    productIndex,
    setPayload,
    signal,
    forceRefresh,
    loadProductIndex: productIndex ? null : ({ signal, forceRefresh } = {}) => loadCardmarketProductIndex({ signal, forceRefresh }),
    loadNameIndex: ({ signal, forceRefresh } = {}) => loadCardmarketNameIndex({ signal, forceRefresh }),
    loadTrackerSetIndex: ({ signal, forceRefresh } = {}) => loadCardmarketTrackerSetIndex({ signal, forceRefresh }),
    loadSetPayload: (expansionId, { signal, forceRefresh } = {}) => loadCardmarketSetPayload(expansionId, { signal, forceRefresh }),
  });
}
