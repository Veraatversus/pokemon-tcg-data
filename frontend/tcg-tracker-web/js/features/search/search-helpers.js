const SEARCH_NOISE_TOKENS = new Set([
  'karte', 'karten', 'kartennummer', 'kartennr', 'nummer', 'nr', 'no', 'num',
  'pokemon', 'pokemontcg', 'tcg', 'set', 'im', 'in', 'von', 'die', 'der', 'das'
]);

export function createSearchHelpers({ normalizeCardNumber, isGeneratedCardmarketSearchUrl } = {}) {
  function normalizeSearchText(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function sanitizeSearchToken(token) {
    return normalizeSearchText(token).replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
  }

  function extractMeaningfulNameTokens(tokens = []) {
    return tokens
      .map((token) => sanitizeSearchToken(token))
      .filter((token) => token && token.length >= 2)
      .filter((token) => !SEARCH_NOISE_TOKENS.has(token));
  }

  function normalizeCardNumberForSearch(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    const withoutTotal = raw.split('/')[0];
    return normalizeCardNumber(withoutTotal).toLowerCase();
  }

  function parseStructuredSearchQuery(rawQuery, availableSets = []) {
    const trimmedQuery = String(rawQuery || '').trim();
    if (!trimmedQuery) return null;

    const normalizedQuery = trimmedQuery.replace(/^\(+|\)+$/g, '').trim();
    if (!normalizedQuery) return null;

    const parts = normalizedQuery.split(/\s+/).filter(Boolean);
    if (!parts.length) return null;

    const requestedCode = parts[0].toLowerCase();
    const matchingSet = availableSets.find((set) =>
      (set?.ptcgoCode && String(set.ptcgoCode).toLowerCase() === requestedCode) ||
      String(set?.setId || '').toLowerCase() === requestedCode
    );
    if (!matchingSet) return null;

    const remaining = parts.slice(1);
    let cardNumber = '';
    const nameTokens = [];
    for (const part of remaining) {
      const token = sanitizeSearchToken(part);
      if (!token) continue;
      if (!cardNumber && /^[a-z._-]*\d+[a-z._-]*$/.test(token)) {
        cardNumber = normalizeCardNumberForSearch(token);
      } else {
        nameTokens.push(token);
      }
    }
    const meaningfulNameTokens = extractMeaningfulNameTokens(nameTokens);
    return {
      set: matchingSet,
      setId: String(matchingSet.setId),
      cardNumber,
      namePart: meaningfulNameTokens.length ? meaningfulNameTokens : null,
    };
  }

  function parseMixedQuery(rawQuery) {
    const normalized = normalizeSearchText(rawQuery).trim();
    if (!normalized) return null;

    const parts = normalized
      .split(/\s+/)
      .map((part) => sanitizeSearchToken(part))
      .filter(Boolean);
    if (parts.length < 2) return null;

    const hasSetLikeMarker = parts.some((token) => token === 'set' || token === 'series' || token === 'serie');
    if (hasSetLikeMarker) return null;

    const numberTokens = parts.filter((part) => /^[a-z._-]*\d+[a-z._-]*$/.test(part));
    const nameTokensRaw = parts.filter((part) => !/^[a-z._-]*\d+[a-z._-]*$/.test(part));
    const nameTokens = extractMeaningfulNameTokens(nameTokensRaw);

    if (!nameTokens.length || !numberTokens.length) return null;

    return {
      cardNumber: normalizeCardNumberForSearch(numberTokens[0]),
      nameTokens,
    };
  }

  function cardNumberMatchesQuery(cardNumber, queryNumber) {
    const normalizedCard = normalizeCardNumberForSearch(cardNumber);
    const normalizedQuery = normalizeCardNumberForSearch(queryNumber);
    if (!normalizedCard || !normalizedQuery) return false;
    if (normalizedCard === normalizedQuery) return true;

    const cardDigits = (normalizedCard.match(/\d+/) || [''])[0];
    const queryDigits = (normalizedQuery.match(/\d+/) || [''])[0];
    return Boolean(queryDigits && cardDigits === queryDigits);
  }

  function collectSearchStrings(values = []) {
    const seen = new Set();
    const result = [];

    const visit = (value) => {
      if (value == null) return;
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (typeof value === 'object') {
        Object.values(value).forEach(visit);
        return;
      }

      const raw = String(value || '').trim();
      if (!raw || /^https?:\/\//i.test(raw)) return;
      const normalized = normalizeSearchText(raw).replace(/\s+/g, ' ').trim();
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      result.push(normalized);
    };

    values.forEach(visit);
    return result;
  }

  function matchesTokensInValues(tokens = [], values = []) {
    if (!tokens.length) return false;
    return tokens.every((token) => values.some((value) => value.includes(token)));
  }

  function buildSetSearchContext(set = null) {
    const nameValues = collectSearchStrings([
      set?.setName,
      set?.vera_name,
      set?.tcgdex_name,
    ]);

    const seriesValues = collectSearchStrings([
      set?.series,
      set?.vera_series,
      set?.tcgdex_serie_name,
      set?.tcgdex_serie_id,
    ]);

    const codeValues = collectSearchStrings([
      set?.setId,
      set?.ptcgoCode,
      set?.vera_ptcgoCode,
      set?.tcgdex_abbreviation_official,
    ]);

    return {
      nameValues,
      seriesValues,
      codeValues,
      fullText: [...nameValues, ...seriesValues, ...codeValues].join(' '),
    };
  }

  function buildCardSearchContext(card, set = null) {
    const nameValues = collectSearchStrings([
      card?.name,
      card?.vera_name,
      card?.tcgdex_name,
    ]);

    const setValues = collectSearchStrings([
      set?.setName,
      set?.vera_name,
      set?.tcgdex_name,
      set?.series,
      set?.vera_series,
      set?.tcgdex_serie_name,
      set?.ptcgoCode,
      set?.vera_ptcgoCode,
      set?.tcgdex_abbreviation_official,
      set?.setId,
    ]);

    const taxonomyValues = collectSearchStrings([
      card?.rarity,
      card?.hp,
      card?.types,
      card?.vera_types,
      card?.supertype,
      card?.subtypes,
      card?.evolvesFrom,
      card?.vera_evolvesFrom,
      card?.artist,
      card?.regulationMark,
      card?.flavorText,
      card?.vera_flavorText,
      card?.rules,
      card?.abilities,
      card?.attacks,
      card?.weaknesses,
      card?.resistances,
    ]);

    const numberValues = collectSearchStrings([
      card?.number,
      card?.vera_number,
      card?.tcgdex_localId,
    ]);

    return {
      nameValues,
      setValues,
      taxonomyValues,
      numberValues,
      fullText: [...nameValues, ...setValues, ...taxonomyValues, ...numberValues].join(' '),
    };
  }

  function computeSearchScore(card, normalizedQuery, structuredQuery, mixedQuery, set = null) {
    const context = buildCardSearchContext(card, set);
    const numberRaw = String(card.number || '').toLowerCase();
    const normalizedCardNumber = normalizeCardNumberForSearch(card.number);

    if (structuredQuery) {
      const numberMatch = !structuredQuery.cardNumber || cardNumberMatchesQuery(card.number, structuredQuery.cardNumber);
      const nameMatch = !structuredQuery.namePart || matchesTokensInValues(structuredQuery.namePart, context.nameValues.length ? context.nameValues : [context.fullText]);
      if (!numberMatch || !nameMatch) return -1;

      let score = 1000;
      if (structuredQuery.cardNumber) score += 250;
      if (structuredQuery.namePart?.length) {
        score += structuredQuery.namePart.length * 45;
        score += 90;
      }
      return score;
    }

    if (mixedQuery) {
      const numberMatch = cardNumberMatchesQuery(card.number, mixedQuery.cardNumber);
      const nameMatch = matchesTokensInValues(mixedQuery.nameTokens, context.nameValues.length ? context.nameValues : [context.fullText]);
      if (!numberMatch || !nameMatch) return -1;

      return 900 + (mixedQuery.nameTokens.length * 45) + 220;
    }

    const normalizedFreeQuery = normalizeSearchText(normalizedQuery).trim();
    const queryTokens = normalizedFreeQuery
      .split(/\s+/)
      .map((token) => sanitizeSearchToken(token))
      .filter(Boolean);
    const meaningfulTokens = extractMeaningfulNameTokens(queryTokens);

    if (!queryTokens.length) return -1;

    const exactNameMatch = context.nameValues.some((value) => value === normalizedFreeQuery);
    const nameStartsWith = context.nameValues.some((value) => value.startsWith(normalizedFreeQuery));
    const nameContains = context.nameValues.some((value) => value.includes(normalizedFreeQuery));
    const setExactMatch = context.setValues.some((value) => value === normalizedFreeQuery);
    const setContains = context.setValues.some((value) => value.includes(normalizedFreeQuery));
    const taxonomyContains = context.taxonomyValues.some((value) => value.includes(normalizedFreeQuery));
    const numberContains = context.numberValues.some((value) => value.includes(normalizedFreeQuery))
      || normalizedCardNumber.includes(normalizedFreeQuery)
      || numberRaw.includes(normalizedFreeQuery)
      || cardNumberMatchesQuery(card.number, normalizedFreeQuery);

    const numberLikeTokens = queryTokens.filter((token) => /^[a-z._-]*\d+[a-z._-]*$/.test(token));
    const nameLikeTokens = meaningfulTokens;
    const nameTokenMatch = nameLikeTokens.length ? matchesTokensInValues(nameLikeTokens, context.nameValues.length ? context.nameValues : [context.fullText]) : false;
    const setTokenMatch = nameLikeTokens.length ? matchesTokensInValues(nameLikeTokens, context.setValues) : false;
    const taxonomyTokenMatch = nameLikeTokens.length ? matchesTokensInValues(nameLikeTokens, context.taxonomyValues) : false;
    const numberTokenMatch = numberLikeTokens.length ? numberLikeTokens.every((token) => cardNumberMatchesQuery(card.number, token)) : false;
    const fullTokenMatch = queryTokens.every((token) => context.fullText.includes(token) || cardNumberMatchesQuery(card.number, token));

    const isMatch = exactNameMatch
      || nameStartsWith
      || nameContains
      || setExactMatch
      || setContains
      || taxonomyContains
      || numberContains
      || nameTokenMatch
      || setTokenMatch
      || taxonomyTokenMatch
      || numberTokenMatch
      || fullTokenMatch;

    if (!isMatch) return -1;

    let score = 0;
    if (exactNameMatch) score += 420;
    else if (nameStartsWith) score += 320;
    else if (nameContains) score += 220;

    if (numberContains) score += 190;
    if (setExactMatch) score += 240;
    else if (setContains) score += 140;
    if (taxonomyContains || taxonomyTokenMatch) score += 60;
    if (nameTokenMatch) score += 110;
    if (setTokenMatch) score += 95;
    if (numberTokenMatch) score += 135;
    if (fullTokenMatch && queryTokens.length > 1) score += 120;
    if (nameTokenMatch && numberTokenMatch) score += 180;

    return score;
  }

  function mergeSearchCards(dbCards = [], apiCards = []) {
    const byNumber = new Map();
    (Array.isArray(dbCards) ? dbCards : []).forEach((entry) => {
      const cardNumberKey = normalizeCardNumber(entry?.number || '');
      if (!cardNumberKey) return;
      byNumber.set(cardNumberKey, { ...entry, __searchApiOnly: false });
    });
    (Array.isArray(apiCards) ? apiCards : []).forEach((entry) => {
      const cardNumberKey = normalizeCardNumber(entry?.number || '');
      if (!cardNumberKey) return;
      const existing = byNumber.get(cardNumberKey);
      if (existing) {
        byNumber.set(cardNumberKey, { ...existing, ...entry, __searchApiOnly: false });
      } else {
        byNumber.set(cardNumberKey, { ...entry, __searchApiOnly: true });
      }
    });
    return Array.from(byNumber.values());
  }

  function hasRichCardDetails(card = {}) {
    return Boolean(
      String(card?.rarity || '').trim()
      || String(card?.hp || '').trim()
      || (Array.isArray(card?.types) && card.types.length)
      || String(card?.supertype || '').trim()
      || String(card?.artist || '').trim()
      || (Array.isArray(card?.rules) && card.rules.length)
      || String(card?.flavorText || '').trim()
    );
  }

  function needsApiCardEnrichment(cards = []) {
    const sample = (Array.isArray(cards) ? cards : []).filter(Boolean).slice(0, 12);
    if (!sample.length) return false;

    const richCount = sample.filter((card) => hasRichCardDetails(card)).length;
    const needsCardmarketUpgrade = sample.some((card) => {
      const cardmarketUrl = String(card?.cardmarketUrl || card?.vera_cardmarket_url || card?.tcgdex_cardmarket_url || '').trim();
      return !cardmarketUrl || isGeneratedCardmarketSearchUrl(cardmarketUrl);
    });

    return richCount < Math.max(1, Math.ceil(sample.length * 0.4)) || needsCardmarketUpgrade;
  }

  function sortSearchResults(results = []) {
    return results.sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      const setCompare = String(left.set?.setName || '').localeCompare(String(right.set?.setName || ''), 'de', { sensitivity: 'base' });
      if (setCompare !== 0) return setCompare;
      return String(left.card?.number || '').localeCompare(String(right.card?.number || ''), undefined, { numeric: true, sensitivity: 'base' });
    });
  }

  function getSearchResultKey(card = {}, set = null) {
    const setId = String(set?.setId || '').trim();
    const cardNumber = normalizeCardNumber(card?.number || '');
    const fallbackName = normalizeSearchText(card?.name || '');
    return `${setId}::${cardNumber || fallbackName || 'card'}`;
  }

  function getSearchResultsInOrder(resultsMap, orderedKeys = []) {
    if (!(resultsMap instanceof Map)) return [];
    if (!Array.isArray(orderedKeys) || !orderedKeys.length) {
      return Array.from(resultsMap.values());
    }

    const orderedResults = [];
    const seenKeys = new Set();

    orderedKeys.forEach((key) => {
      if (!resultsMap.has(key)) return;
      orderedResults.push(resultsMap.get(key));
      seenKeys.add(key);
    });

    resultsMap.forEach((value, key) => {
      if (!seenKeys.has(key)) {
        orderedResults.push(value);
      }
    });

    return orderedResults;
  }

  return {
    normalizeSearchText,
    cardNumberMatchesQuery,
    collectSearchStrings,
    matchesTokensInValues,
    parseStructuredSearchQuery,
    parseMixedQuery,
    buildSetSearchContext,
    buildCardSearchContext,
    computeSearchScore,
    mergeSearchCards,
    needsApiCardEnrichment,
    sortSearchResults,
    getSearchResultKey,
    getSearchResultsInOrder,
  };
}
