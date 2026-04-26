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

function extractPreferredCardNames(card = {}) {
  return Array.from(new Set(
    [card?.vera_name, card?.tcgdex_name, card?.name]
      .map((value) => normalizeMatcherText(value))
      .filter(Boolean)
  ));
}

function extractPreferredSetNames(card = {}) {
  return Array.from(new Set(
    [card?.vera_set_name, card?.tcgdex_set_name, card?.setName, card?.set_name]
      .map((value) => normalizeMatcherText(value))
      .filter(Boolean)
  ));
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
  const rawId = String(card?.id || '').trim();
  const idSuffix = rawId.includes('-') ? rawId.split('-').pop() : rawId;

  return normalizeCardNumberForMatching(
    card?.number
    || card?.vera_number
    || card?.tcgdex_localId
    || card?.localId
    || idSuffix
    || ''
  );
}

function extractEntryMatchNumber(entry = {}) {
  return normalizeCardNumberForMatching(
    entry?.collectorNumber
    || entry?.number
    || entry?.localId
    || entry?.productNumber
    || entry?.variantNumber
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

function isLikelyHoloCard(card = {}) {
  const normalizedNumber = extractCardMatchNumber(card);
  if (/^h\d+/i.test(normalizedNumber)) return true;

  const normalizedRarity = normalizeMatcherText(
    card?.rarity
    || card?.vera_rarity
    || card?.tcgdex_rarity
    || ''
  );
  return normalizedRarity.includes('holo');
}

function pickEntryPrice(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function getPrimaryNormalPrice(entry = {}) {
  const prices = entry?.prices || {};
  return (
    pickEntryPrice(prices.trend)
    ?? pickEntryPrice(prices.avg)
    ?? pickEntryPrice(prices.avg30)
    ?? pickEntryPrice(prices.avg7)
    ?? pickEntryPrice(prices.avg1)
    ?? pickEntryPrice(prices.low)
  );
}

function getPrimaryReversePrice(entry = {}) {
  const prices = entry?.prices || {};
  return (
    pickEntryPrice(prices.trendHolo)
    ?? pickEntryPrice(prices.avgHolo)
    ?? pickEntryPrice(prices.avg30Holo)
    ?? pickEntryPrice(prices.avg7Holo)
    ?? pickEntryPrice(prices.avg1Holo)
    ?? pickEntryPrice(prices.lowHolo)
    ?? pickEntryPrice(prices.reverseHoloSell)
  );
}

function resolvePriceProfileDuplicateMatch(card = {}, candidatePool = []) {
  if (!Array.isArray(candidatePool) || candidatePool.length < 2) return null;

  const metacardIds = Array.from(new Set(
    candidatePool
      .map((entry) => String(entry?.metacardId || '').trim())
      .filter(Boolean)
  ));
  if (metacardIds.length !== 1) return null;

  const profiledCandidates = candidatePool
    .map((entry) => {
      const normalPrice = getPrimaryNormalPrice(entry);
      const reversePrice = getPrimaryReversePrice(entry);
      if (normalPrice == null || reversePrice == null) return null;
      return {
        entry,
        normalPrice,
        reversePrice,
        delta: normalPrice - reversePrice,
      };
    })
    .filter(Boolean);

  if (profiledCandidates.length !== candidatePool.length) return null;
  const hasPositiveDelta = profiledCandidates.some((candidate) => candidate.delta > 0);
  const hasNegativeDelta = profiledCandidates.some((candidate) => candidate.delta < 0);
  if (hasPositiveDelta && hasNegativeDelta) {
    profiledCandidates.sort((left, right) => left.delta - right.delta);
    return isLikelyHoloCard(card)
      ? profiledCandidates[profiledCandidates.length - 1]?.entry || null
      : profiledCandidates[0]?.entry || null;
  }

  const hasDistinctNormalPrices = new Set(
    profiledCandidates.map((candidate) => String(candidate.normalPrice))
  ).size > 1;
  if (!hasDistinctNormalPrices) return null;

  profiledCandidates.sort((left, right) => {
    if (left.normalPrice !== right.normalPrice) return left.normalPrice - right.normalPrice;
    return left.delta - right.delta;
  });

  return isLikelyHoloCard(card)
    ? profiledCandidates[profiledCandidates.length - 1]?.entry || null
    : profiledCandidates[0]?.entry || null;
}

function resolveDuplicateNameMatchIndex(card = {}, sourceCards = [], candidatePool = []) {
  if (!Array.isArray(sourceCards) || sourceCards.length < 2) return -1;

  const normalizedCardNames = extractPreferredCardNames(card);
  if (!normalizedCardNames.length) return -1;

  const normalizedCandidateNames = Array.from(new Set(
    (Array.isArray(candidatePool) ? candidatePool : [])
      .map((entry) => normalizeMatcherText(extractEntryBaseName(entry?.name || '')))
      .filter(Boolean)
  ));

  const matchingCards = sourceCards
    .map((sourceCard, originalIndex) => {
      const sourceNames = extractPreferredCardNames(sourceCard);
      const overlaps = sourceNames.some((name) => normalizedCardNames.includes(name))
        || (
          normalizedCandidateNames.length > 0
          && sourceNames.some((sourceName) => normalizedCandidateNames.some((candidateName) => (
            sourceName.includes(candidateName) || candidateName.includes(sourceName)
          )))
        );
      if (!overlaps) return null;

      return {
        sourceCard,
        originalIndex,
        cardNumber: extractCardMatchNumber(sourceCard),
      };
    })
    .filter(Boolean);

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

function extractPotentialSetNameKeys(cards = []) {
  const names = new Set();

  cards.forEach((card) => {
    extractPreferredSetNames(card).forEach((value) => names.add(value));
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
    const setIdMatchedExpansionIds = [];
    const setIds = Array.from(new Set(cards.map((card) => String(card?.setId || '').trim().toLowerCase()).filter(Boolean)));
    setIds.forEach((setId) => {
      const expansionId = String(trackerSetIndex?.bySetId?.[setId] || '').trim();
      if (!expansionId) return;
      setIdMatchedExpansionIds.push(expansionId);
      counts.set(expansionId, (counts.get(expansionId) || 0) + Math.max(cards.length, 3));
    });

    const ptcgoMatchedExpansionIds = [];
    extractPotentialPtcgoCodes(cards).forEach((code) => {
      const expansionId = String(trackerSetIndex?.byPtcgoCode?.[code] || '').trim();
      if (!expansionId) return;
      ptcgoMatchedExpansionIds.push(expansionId);
      counts.set(expansionId, (counts.get(expansionId) || 0) + 2);
    });

    const hasIdOrCodeMatch = setIdMatchedExpansionIds.length > 0 || ptcgoMatchedExpansionIds.length > 0;
    if (!hasIdOrCodeMatch) {
      const matchedSetNameExpansionIds = Array.from(new Set(
        extractPotentialSetNameKeys(cards)
          .map((setNameKey) => String(trackerSetIndex?.bySetName?.[setNameKey] || '').trim())
          .filter(Boolean)
      ));

      if (matchedSetNameExpansionIds.length === 1) {
        const expansionId = matchedSetNameExpansionIds[0];
        counts.set(expansionId, (counts.get(expansionId) || 0) + Math.max(cards.length, 5));
      }
    }
  }

  const highestCount = counts.size ? Math.max(...counts.values()) : 0;
  if ((!counts.size || highestCount < 2) && nameIndex && typeof nameIndex === 'object') {
    cards.forEach((card) => {
      const normalizedNames = extractPreferredCardNames(card);

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

  let effectiveCandidatePool = candidatePool;
  if (Array.isArray(sourceCards) && sourceCards.length > 1) {
    const normalizedCandidateNames = Array.from(new Set(
      candidatePool
        .map((entry) => normalizeMatcherText(extractEntryBaseName(entry?.name || '')))
        .filter(Boolean)
    ));

    const matchingVariantCount = sourceCards
      .filter((sourceCard) => {
        const sourceNames = extractPreferredCardNames(sourceCard);
        return sourceNames.some((name) => normalizedCardNames.includes(name))
          || (
            normalizedCandidateNames.length > 0
            && sourceNames.some((sourceName) => normalizedCandidateNames.some((candidateName) => (
              sourceName.includes(candidateName) || candidateName.includes(sourceName)
            )))
          );
      })
      .length;

    if (matchingVariantCount >= 2) {
      const byMetacard = new Map();
      candidatePool.forEach((entry) => {
        const key = String(entry?.metacardId || '').trim();
        if (!key) return;
        const group = byMetacard.get(key) || [];
        group.push(entry);
        byMetacard.set(key, group);
      });

      const matchingGroups = Array.from(byMetacard.values()).filter(
        (group) => group.length === matchingVariantCount
      );
      if (matchingGroups.length === 1) {
        effectiveCandidatePool = matchingGroups[0];
      }
    }
  }

  if (effectiveCandidatePool.length === 1) return effectiveCandidatePool[0];

  const targetCardNumber = extractCardMatchNumber(card);
  if (targetCardNumber) {
    const exactNumberMatches = effectiveCandidatePool.filter((entry) => extractEntryMatchNumber(entry) === targetCardNumber);
    if (exactNumberMatches.length === 1) return exactNumberMatches[0];
  }

  const cardHintTokens = extractCardHintTokens(card);
  const scoredCandidates = effectiveCandidatePool
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
  
  const topScore = scoredCandidates[0]?.score ?? -1;
  const topScoringCandidates = scoredCandidates.filter((c) => c.score === topScore);
  
  // If there's only one candidate with the top score and score > 0, return it
  if (topScoringCandidates.length === 1 && topScore > 0) {
    return topScoringCandidates[0].entry;
  }
  
  // If multiple candidates tie (or score is 0), use duplicate resolver
  if (topScoringCandidates.length > 1 || topScore === 0) {
    const byPriceProfile = resolvePriceProfileDuplicateMatch(card, effectiveCandidatePool);
    if (byPriceProfile) {
      return byPriceProfile;
    }

    const duplicateMatchIndex = resolveDuplicateNameMatchIndex(card, sourceCards, effectiveCandidatePool);
    if (duplicateMatchIndex >= 0) {
      return effectiveCandidatePool[Math.min(duplicateMatchIndex, effectiveCandidatePool.length - 1)] || scoredCandidates[0].entry;
    }
  }

  return scoredCandidates[0].entry;
}

export function buildSetCardAssignmentMap(sourceCards = [], setPayload = {}) {
  const payloadCards = Array.isArray(setPayload?.cards) ? setPayload.cards : [];
  if (!payloadCards.length || !Array.isArray(sourceCards) || !sourceCards.length) {
    return new Map();
  }

  const usedProductIds = new Set();
  const preferredMetacardByName = new Map();
  const result = new Map(); // card object reference → cardmarket entry

  for (const card of sourceCards) {
    const normalizedCardNames = extractPreferredCardNames(card);
    if (!normalizedCardNames.length) continue;
    const primaryName = normalizedCardNames[0] || '';

    let preferredMetacardId = primaryName ? String(preferredMetacardByName.get(primaryName) || '').trim() : '';
    if (!preferredMetacardId && primaryName) {
      const matchingVariantCount = sourceCards.filter((sourceCard) => {
        const sourceNames = extractPreferredCardNames(sourceCard);
        return sourceNames.includes(primaryName);
      }).length;

      if (matchingVariantCount >= 2) {
        const nameCandidates = payloadCards.filter((entry) => {
          const entryBaseName = normalizeMatcherText(extractEntryBaseName(entry?.name || ''));
          return entryBaseName && (entryBaseName === primaryName || entryBaseName.includes(primaryName) || primaryName.includes(entryBaseName));
        });

        const byMetacard = new Map();
        nameCandidates.forEach((entry) => {
          const key = String(entry?.metacardId || '').trim();
          if (!key) return;
          const group = byMetacard.get(key) || [];
          group.push(entry);
          byMetacard.set(key, group);
        });

        const matchingGroups = Array.from(byMetacard.entries()).filter(([, group]) => group.length === matchingVariantCount);
        if (matchingGroups.length === 1) {
          preferredMetacardId = matchingGroups[0][0];
          preferredMetacardByName.set(primaryName, preferredMetacardId);
        }
      }
    }

    // Exact name match first, excluding already-assigned products
    let candidates = payloadCards.filter((entry) => {
      if (usedProductIds.has(entry?.cardmarketProductId)) return false;
      if (preferredMetacardId && String(entry?.metacardId || '').trim() !== preferredMetacardId) return false;
      const entryBaseName = normalizeMatcherText(extractEntryBaseName(entry?.name || ''));
      return entryBaseName && normalizedCardNames.includes(entryBaseName);
    });

    // Substring fallback
    if (!candidates.length) {
      candidates = payloadCards.filter((entry) => {
        if (usedProductIds.has(entry?.cardmarketProductId)) return false;
        if (preferredMetacardId && String(entry?.metacardId || '').trim() !== preferredMetacardId) return false;
        const entryBaseName = normalizeMatcherText(extractEntryBaseName(entry?.name || ''));
        return entryBaseName && normalizedCardNames.some((n) =>
          entryBaseName.includes(n) || n.includes(entryBaseName)
        );
      });
    }

    if (!candidates.length) continue;

    // Reuse the full resolver so hints, collector numbers, and price profiles stay consistent.
    let assigned = resolveCardmarketEntryForCardFromSetPayload(
      card,
      { ...setPayload, cards: candidates },
      { sourceCards }
    ) || candidates[0];

    if (assigned?.cardmarketProductId) {
      result.set(card, assigned);
      usedProductIds.add(assigned.cardmarketProductId);
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

  return cards.map((card) => {
    const currentUrl = getCardmarketUrlFromCard(card);
    const isSearchFallback = isGeneratedCardmarketSearchUrl(currentUrl);
    const shouldReconcileDirectUrl = !isSearchFallback && hasDuplicateSourceNames;
    if (!isSearchFallback && !shouldReconcileDirectUrl) return card;

    const matchedEntry = resolveCardmarketEntryForCardFromSetPayload(card, resolvedSetPayload, { sourceCards: cards });
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
