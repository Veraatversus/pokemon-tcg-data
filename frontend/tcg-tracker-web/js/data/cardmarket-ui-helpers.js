const DEFAULT_REMOTE_CARDMARKET_BASE = 'https://veraatversus.github.io/pokemon-tcg-data/cardmarket';

export function isLocalOrigin(origin = '') {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(?::\d+)?$/i.test(String(origin || '').trim());
}

export function getCardmarketBaseUrl({ origin = globalThis?.location?.origin, remoteBase = DEFAULT_REMOTE_CARDMARKET_BASE } = {}) {
  const normalizedOrigin = String(origin || '').trim().replace(/\/$/, '');
  if (isLocalOrigin(normalizedOrigin)) {
    return `${normalizedOrigin}/cardmarket`;
  }
  return String(remoteBase || DEFAULT_REMOTE_CARDMARKET_BASE).trim().replace(/\/$/, '');
}

export function extractCardmarketProductId(url = '') {
  const text = String(url || '').trim();
  if (!text) return '';

  const queryMatch = text.match(/[?&]idProduct=(\d+)/i);
  if (queryMatch) return queryMatch[1];

  const pathMatch = text.match(/\/(\d+)(?:[/?#]|$)/);
  return pathMatch ? pathMatch[1] : '';
}

export function getCardmarketUrlFromCard(card = {}) {
  return String(card?.cardmarketUrl || card?.vera_cardmarket_url || card?.tcgdex_cardmarket_url || '').trim();
}

export function isGeneratedCardmarketSearchUrl(url = '') {
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

function extractPreferredCardNames(card = {}) {
  return Array.from(new Set(
    [card?.vera_name, card?.tcgdex_name, card?.name]
      .map((value) => normalizeMatcherText(value))
      .filter(Boolean)
  ));
}

function entryMatchesAnyCardName(entry = {}, normalizedCardNames = []) {
  if (!Array.isArray(normalizedCardNames) || !normalizedCardNames.length) return false;

  const normalizedEntryName = normalizeMatcherText(extractEntryBaseName(entry?.name || ''));
  if (!normalizedEntryName) return false;

  if (normalizedCardNames.includes(normalizedEntryName)) return true;

  return normalizedCardNames.some((normalizedCardName) => (
    normalizedEntryName.includes(normalizedCardName) || normalizedCardName.includes(normalizedEntryName)
  ));
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

function extractPotentialSetNameKeys(cards = []) {
  const names = new Set();

  cards.forEach((card) => {
    [card?.setName, card?.set_name, card?.vera_set_name, card?.tcgdex_set_name]
      .map((value) => normalizeMatcherText(value))
      .filter(Boolean)
      .forEach((value) => names.add(value));
  });

  return Array.from(names);
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
    const matchedSetNameExpansionIds = Array.from(new Set(
      extractPotentialSetNameKeys(cards)
        .map((setNameKey) => String(trackerSetIndex?.bySetName?.[setNameKey] || '').trim())
        .filter(Boolean)
    ));

    if (matchedSetNameExpansionIds.length === 1) {
      const expansionId = matchedSetNameExpansionIds[0];
      counts.set(expansionId, (counts.get(expansionId) || 0) + Math.max(cards.length, 5));
    }

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

export function resolveCardmarketEntryForCardFromSetPayload(card = {}, setPayload = {}, { sourceCards = [] } = {}) {
  const normalizedCardNames = extractPreferredCardNames(card);
  if (!normalizedCardNames.length) return null;

  const cards = Array.isArray(setPayload?.cards) ? setPayload.cards : [];
  if (!cards.length) return null;

  const candidatePool = cards.filter((entry) => entryMatchesAnyCardName(entry, normalizedCardNames));
  if (!candidatePool.length) return null;

  if (!Array.isArray(sourceCards) || sourceCards.length < 2) {
    return candidatePool[0];
  }

  const matchingSourceCards = sourceCards.filter((sourceCard) => {
    const sourceNames = extractPreferredCardNames(sourceCard);
    return sourceNames.some((name) => normalizedCardNames.includes(name));
  });
  if (!matchingSourceCards.length) return candidatePool[0];

  const sourceOccurrenceIndex = Math.max(0, matchingSourceCards.findIndex((sourceCard) => sourceCard === card));
  return candidatePool[Math.min(sourceOccurrenceIndex, candidatePool.length - 1)] || candidatePool[0];
}

function normalizeNonEmptyMetacardId(value) {
  if (value == null) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  const numeric = Number(normalized);
  if (Number.isFinite(numeric)) {
    if (numeric <= 0) return null;
    return String(numeric);
  }
  return normalized;
}

export function buildSetCardAssignmentMap(sourceCards = [], setPayload = {}) {
  const payloadCards = Array.isArray(setPayload?.cards) ? setPayload.cards : [];
  if (!payloadCards.length || !Array.isArray(sourceCards) || !sourceCards.length) {
    return new Map();
  }

  const availableEntries = [...payloadCards];
  const result = new Map();

  for (const card of sourceCards) {
    const normalizedCardNames = extractPreferredCardNames(card);
    if (!normalizedCardNames.length) continue;
    const matchIndex = availableEntries.findIndex((entry) => entryMatchesAnyCardName(entry, normalizedCardNames));
    if (matchIndex < 0) continue;

    const [assigned] = availableEntries.splice(matchIndex, 1);
    if (!assigned) continue;
    result.set(card, assigned);

    const sourceMetacardId = normalizeNonEmptyMetacardId(
      card?.metacardId
      ?? card?.metaCardId
      ?? card?.cardmarketMetacardId
    );
    if (!sourceMetacardId) continue;

    for (let i = availableEntries.length - 1; i >= 0; i--) {
      const entryMetacardId = normalizeNonEmptyMetacardId(availableEntries[i]?.metacardId);
      if (entryMetacardId && entryMetacardId === sourceMetacardId) {
        availableEntries.splice(i, 1);
      }
    }
  }

  return result;
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

export async function promoteCardmarketUrlsForCards(cards = [], {
  productIndex = null,
  setPayload = null,
  nameIndex = null,
  trackerSetIndex = null,
  loadProductIndex = null,
  loadNameIndex = null,
  loadTrackerSetIndex = null,
  loadSetPayload = null,
  signal,
  forceRefresh = false,
} = {}) {
  if (!Array.isArray(cards) || !cards.length) return Array.isArray(cards) ? cards : [];

  const needsPromotion = cards.some((card) => isGeneratedCardmarketSearchUrl(getCardmarketUrlFromCard(card)));
  const hasDuplicateSourceNames = (() => {
    const counts = new Map();
    cards.forEach((card) => {
      const preferred = extractPreferredCardNames(card)[0] || '';
      if (!preferred) return;
      counts.set(preferred, (counts.get(preferred) || 0) + 1);
    });
    return Array.from(counts.values()).some((count) => count > 1);
  })();
  if (!needsPromotion && !hasDuplicateSourceNames) return cards;

  let resolvedProductIndex = productIndex;
  let resolvedNameIndex = nameIndex;
  let resolvedTrackerSetIndex = trackerSetIndex;
  let resolvedSetPayload = setPayload;

  if (!resolvedSetPayload) {
    if (!resolvedProductIndex && typeof loadProductIndex === 'function') {
      resolvedProductIndex = await loadProductIndex({ signal, forceRefresh });
    }
    if (!resolvedNameIndex && typeof loadNameIndex === 'function') {
      resolvedNameIndex = await loadNameIndex({ signal, forceRefresh });
    }
    if (!resolvedTrackerSetIndex && typeof loadTrackerSetIndex === 'function') {
      resolvedTrackerSetIndex = await loadTrackerSetIndex({ signal, forceRefresh });
    }

    const expansionId = inferCardmarketExpansionIdFromCards(cards, resolvedProductIndex || {}, {
      nameIndex: resolvedNameIndex,
      trackerSetIndex: resolvedTrackerSetIndex,
    });
    if (!expansionId || typeof loadSetPayload !== 'function') return cards;
    resolvedSetPayload = await loadSetPayload(expansionId, { signal, forceRefresh });
  }

  if (!resolvedSetPayload) return cards;

  const assignmentMap = buildSetCardAssignmentMap(cards, resolvedSetPayload);

  return cards.map((card) => {
    const currentUrl = getCardmarketUrlFromCard(card);
    const isSearchFallback = isGeneratedCardmarketSearchUrl(currentUrl);
    const shouldReconcileDirectUrl = !isSearchFallback && hasDuplicateSourceNames;
    if (!isSearchFallback && !shouldReconcileDirectUrl) return card;

    const matchedEntry = assignmentMap.get(card) || null;
    const directUrl = buildCardmarketProductUrl(matchedEntry?.cardmarketProductId);
    if (!directUrl) return card;

    const currentProductId = extractCardmarketProductId(currentUrl);
    const matchedProductId = String(matchedEntry?.cardmarketProductId || '').trim();
    if (currentProductId && matchedProductId && currentProductId === matchedProductId) {
      return card;
    }

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
