import { isGeneratedCardmarketSearchUrl } from '../../data/cardmarket-url-utils.js';

export function hasRichCardDetails(card = {}) {
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

export function needsApiCardEnrichment(cards = []) {
  const sample = (Array.isArray(cards) ? cards : []).filter(Boolean).slice(0, 12);
  if (!sample.length) return false;

  const richCount = sample.filter((card) => hasRichCardDetails(card)).length;
  const needsCardmarketUpgrade = sample.some((card) => {
    const cardmarketUrl = String(card?.cardmarketUrl || card?.vera_cardmarket_url || card?.tcgdex_cardmarket_url || '').trim();
    return !cardmarketUrl || isGeneratedCardmarketSearchUrl(cardmarketUrl);
  });

  return richCount < Math.max(1, Math.ceil(sample.length * 0.4)) || needsCardmarketUpgrade;
}

export function sortSearchResults(results = []) {
  return results.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    const setCompare = String(left.set?.setName || '').localeCompare(String(right.set?.setName || ''), 'de', { sensitivity: 'base' });
    if (setCompare !== 0) return setCompare;
    return String(left.card?.number || '').localeCompare(String(right.card?.number || ''), undefined, { numeric: true, sensitivity: 'base' });
  });
}

export function getSearchResultKey(card = {}, set = null, normalizeSearchText, normalizeCardNumber) {
  const setId = String(set?.setId || '').trim();
  const cardNumber = normalizeCardNumber(card?.number || '');
  const fallbackName = normalizeSearchText(card?.name || '');
  return `${setId}::${cardNumber || fallbackName || 'card'}`;
}

export function getSearchResultsInOrder(resultsMap, orderedKeys = []) {
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
