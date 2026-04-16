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

function normalizeCardNumberForMatching(value = '') {
  let normalized = String(value || '').trim();
  if (!normalized) return '';

  const slashIndex = normalized.indexOf('/');
  if (slashIndex > 0) {
    normalized = normalized.slice(0, slashIndex).trim();
  }

  const match = normalized.match(/^([a-zA-Z._-]*?)(\d+)([a-zA-Z._-]*)$/);
  if (!match) return normalized.toLowerCase();

  const prefix = match[1].toLowerCase();
  const numericPart = String(parseInt(match[2], 10));
  const suffix = match[3].toLowerCase();
  return `${prefix}${numericPart}${suffix}`;
}

function extractCardMatchNumber(card = {}) {
  return normalizeCardNumberForMatching(
    card?.number
    || card?.vera_number
    || card?.tcgdex_localId
    || card?.localId
    || ''
  );
}

function compareCardMatchNumbers(left = '', right = '') {
  if (left && right) {
    return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
  }
  if (left) return -1;
  if (right) return 1;
  return 0;
}

function resolveDuplicateNameMatchIndex(card = {}, sourceCards = []) {
  if (!Array.isArray(sourceCards) || sourceCards.length < 2) return -1;

  const normalizedCardNames = Array.from(new Set(
    [card?.name, card?.vera_name, card?.tcgdex_name]
      .map((value) => normalizeMatcherText(value))
      .filter(Boolean)
  ));
  if (!normalizedCardNames.length) return -1;

  const matchingCards = sourceCards
    .map((sourceCard, originalIndex) => {
      const sourceNames = Array.from(new Set(
        [sourceCard?.name, sourceCard?.vera_name, sourceCard?.tcgdex_name]
          .map((value) => normalizeMatcherText(value))
          .filter(Boolean)
      ));
      const overlaps = sourceNames.some((name) => normalizedCardNames.includes(name));
      if (!overlaps) return null;

      return {
        sourceCard,
        originalIndex,
        cardNumber: extractCardMatchNumber(sourceCard),
      };
    })
    .filter(Boolean)
    .sort((left, right) => compareCardMatchNumbers(left.cardNumber, right.cardNumber) || left.originalIndex - right.originalIndex);

  if (matchingCards.length < 2) return -1;

  const sameObjectIndex = matchingCards.findIndex((entry) => entry.sourceCard === card);
  if (sameObjectIndex >= 0) return sameObjectIndex;

  const targetCardNumber = extractCardMatchNumber(card);
  if (!targetCardNumber) return -1;

  const sameNumberMatches = matchingCards.filter((entry) => entry.cardNumber === targetCardNumber);
  if (sameNumberMatches.length !== 1) return -1;

  return matchingCards.indexOf(sameNumberMatches[0]);
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

export function resolveCardmarketEntryForCardFromSetPayload(card = {}, setPayload = {}, { sourceCards = [] } = {}) {
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

  const duplicateMatchIndex = resolveDuplicateNameMatchIndex(card, sourceCards);
  if (duplicateMatchIndex >= 0) {
    return candidatePool[Math.min(duplicateMatchIndex, candidatePool.length - 1)] || scoredCandidates[0].entry;
  }

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
  if (!needsPromotion) return cards;

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

  return cards.map((card) => {
    const currentUrl = getCardmarketUrlFromCard(card);
    if (!isGeneratedCardmarketSearchUrl(currentUrl)) return card;

    const matchedEntry = resolveCardmarketEntryForCardFromSetPayload(card, resolvedSetPayload, { sourceCards: cards });
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
