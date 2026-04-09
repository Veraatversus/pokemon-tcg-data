import { CONFIG } from '../core/config.js';

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
  const normalizedOrigin = String(origin || '').trim().replace(/\/$/, '');
  if (isLocalOrigin(normalizedOrigin)) {
    return `${normalizedOrigin}/cardmarket`;
  }
  return REMOTE_CARDMARKET_BASE;
}

export function extractCardmarketProductId(url = '') {
  const text = String(url || '').trim();
  if (!text) return '';

  const queryMatch = text.match(/[?&]idProduct=(\d+)/i);
  if (queryMatch) return queryMatch[1];

  const pathMatch = text.match(/\/(\d+)(?:[/?#]|$)/);
  return pathMatch ? pathMatch[1] : '';
}

function getCardmarketUrlFromCard(card = {}) {
  return String(card?.cardmarketUrl || card?.vera_cardmarket_url || card?.tcgdex_cardmarket_url || '').trim();
}

function isGeneratedCardmarketSearchUrl(url = '') {
  const value = String(url || '').trim().toLowerCase();
  return value.includes('cardmarket.com') && value.includes('/products/search') && value.includes('searchstring=');
}

export function buildCardmarketProductUrl(productId, { language = 'de' } = {}) {
  const normalizedProductId = String(productId || '').trim();
  if (!/^\d+$/.test(normalizedProductId)) return '';
  const normalizedLanguage = String(language || 'de').trim().toLowerCase() || 'de';
  return `https://www.cardmarket.com/${encodeURIComponent(normalizedLanguage)}/Pokemon/Products?idProduct=${normalizedProductId}`;
}

export function resolveCardmarketEntryFromSetPayload(setPayload = {}, productId = '') {
  const normalizedProductId = String(productId || '').trim();
  if (!normalizedProductId) return null;

  const cards = Array.isArray(setPayload?.cards) ? setPayload.cards : [];
  return cards.find((entry) => String(entry?.cardmarketProductId || '').trim() === normalizedProductId) || null;
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
  if (!Array.isArray(cards) || !cards.length) {
    return '';
  }

  const counts = new Map();
  cards.forEach((card) => {
    const productId = extractCardmarketProductId(getCardmarketUrlFromCard(card));
    if (!productId) return;

    const expansionId = String(productIndex?.[productId]?.expansionId || '').trim();
    if (!expansionId) return;

    counts.set(expansionId, (counts.get(expansionId) || 0) + 1);
  });

  const highestDirectCount = counts.size ? Math.max(...counts.values()) : 0;

  if (trackerSetIndex && typeof trackerSetIndex === 'object' && highestDirectCount < 2) {
    const setIds = Array.from(new Set(cards.map((card) => String(card?.setId || '').trim().toLowerCase()).filter(Boolean)));
    setIds.forEach((setId) => {
      const expansionId = String(trackerSetIndex?.bySetId?.[setId] || '').trim();
      if (!expansionId) return;
      counts.set(expansionId, (counts.get(expansionId) || 0) + Math.max(cards.length, 3));
    });

    extractPotentialPtcgoCodes(cards).forEach((code) => {
      const expansionId = String(trackerSetIndex?.byPtcgoCode?.[code] || '').trim();
      if (!expansionId) return;
      counts.set(expansionId, (counts.get(expansionId) || 0) + 2);
    });
  }

  const highestCount = counts.size ? Math.max(...counts.values()) : 0;
  if ((!counts.size || highestCount < 2) && nameIndex && typeof nameIndex === 'object') {
    cards.forEach((card) => {
      const normalizedNames = [card?.name, card?.vera_name, card?.tcgdex_name]
        .map((value) => normalizeMatcherText(value))
        .filter(Boolean);

      normalizedNames.forEach((name) => {
        const expansionIds = Array.isArray(nameIndex?.[name]) ? nameIndex[name] : [];
        expansionIds.forEach((expansionId) => {
          const normalizedExpansionId = String(expansionId || '').trim();
          if (!normalizedExpansionId) return;
          counts.set(normalizedExpansionId, (counts.get(normalizedExpansionId) || 0) + 1);
        });
      });
    });
  }

  let resolvedExpansionId = '';
  let resolvedCount = 0;
  counts.forEach((count, expansionId) => {
    if (count > resolvedCount) {
      resolvedExpansionId = expansionId;
      resolvedCount = count;
    }
  });

  return resolvedExpansionId;
}

export function resolveCardmarketEntryForCardFromSetPayload(card = {}, setPayload = {}) {
  const normalizedCardNames = Array.from(new Set(
    [card?.name, card?.vera_name, card?.tcgdex_name]
      .map((value) => normalizeMatcherText(value))
      .filter(Boolean)
  ));
  if (!normalizedCardNames.length) return null;

  const cards = Array.isArray(setPayload?.cards) ? setPayload.cards : [];
  if (!cards.length) return null;

  const exactNameMatches = cards.filter((entry) => {
    const normalizedEntryName = normalizeMatcherText(extractEntryBaseName(entry?.name || ''));
    return normalizedEntryName && normalizedCardNames.includes(normalizedEntryName);
  });
  const candidatePool = exactNameMatches.length
    ? exactNameMatches
    : cards.filter((entry) => {
        const normalizedEntryName = normalizeMatcherText(extractEntryBaseName(entry?.name || ''));
        return normalizedEntryName && normalizedCardNames.some((normalizedCardName) => (
          normalizedEntryName.includes(normalizedCardName) || normalizedCardName.includes(normalizedEntryName)
        ));
      });

  if (!candidatePool.length) return null;
  if (candidatePool.length === 1) return candidatePool[0];

  const cardHintTokens = extractCardHintTokens(card);
  const scoredCandidates = candidatePool
    .map((entry, index) => {
      const entryHintTokens = extractEntryHintTokens(entry?.name || '');
      const overlapCount = cardHintTokens.filter((token) => entryHintTokens.includes(token)).length;
      return {
        entry,
        index,
        score: overlapCount,
      };
    })
    .sort((left, right) => right.score - left.score || left.index - right.index);

  if (!scoredCandidates.length) return null;
  if (scoredCandidates[0].score > 0) return scoredCandidates[0].entry;
  return scoredCandidates[0].entry;
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
  const prices = entry?.prices || {};
  return formatEuroPrice(
    prices.trend
      ?? prices.avg
      ?? prices.avg1
      ?? prices.avg7
      ?? prices.avg30
      ?? prices.suggested
      ?? prices.low
  );
}

export function formatCardmarketEntryTitle(entry = {}) {
  const prices = entry?.prices || {};
  const parts = [];

  const trend = formatEuroPrice(prices.trend);
  const avg = formatEuroPrice(prices.avg ?? prices.avg30 ?? prices.avg7 ?? prices.avg1);
  const low = formatEuroPrice(prices.low);

  if (trend) parts.push(`Trend ${trend}`);
  if (avg) parts.push(`AVG ${avg}`);
  if (low) parts.push(`Low ${low}`);

  return parts.length ? `Cardmarket: ${parts.join(' · ')}` : 'Cardmarket-Produktseite';
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
  if (!Array.isArray(cards) || !cards.length) return Array.isArray(cards) ? cards : [];

  const needsPromotion = cards.some((card) => isGeneratedCardmarketSearchUrl(getCardmarketUrlFromCard(card)));
  if (!needsPromotion) return cards;

  let resolvedSetPayload = setPayload;
  if (!resolvedSetPayload) {
    const [resolvedProductIndex, resolvedNameIndex, resolvedTrackerSetIndex] = await Promise.all([
      productIndex ? Promise.resolve(productIndex) : loadCardmarketProductIndex({ signal, forceRefresh }),
      loadCardmarketNameIndex({ signal, forceRefresh }),
      loadCardmarketTrackerSetIndex({ signal, forceRefresh })
    ]);
    const expansionId = inferCardmarketExpansionIdFromCards(cards, resolvedProductIndex, {
      nameIndex: resolvedNameIndex,
      trackerSetIndex: resolvedTrackerSetIndex,
    });
    if (!expansionId) return cards;
    resolvedSetPayload = await loadCardmarketSetPayload(expansionId, { signal, forceRefresh });
  }

  if (!resolvedSetPayload) return cards;

  return cards.map((card) => {
    const currentUrl = getCardmarketUrlFromCard(card);
    if (!isGeneratedCardmarketSearchUrl(currentUrl)) return card;

    const matchedEntry = resolveCardmarketEntryForCardFromSetPayload(card, resolvedSetPayload);
    const directUrl = buildCardmarketProductUrl(matchedEntry?.cardmarketProductId);
    if (!directUrl) return card;

    return {
      ...card,
      cardmarketUrl: directUrl,
      vera_cardmarket_url: directUrl,
      tcgdex_cardmarket_url: directUrl,
      cardmarketProductId: Number(matchedEntry?.cardmarketProductId || 0) || null,
      cardmarketResolvedName: String(matchedEntry?.name || '').trim(),
    };
  });
}
