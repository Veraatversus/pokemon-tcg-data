const FIRST_BLOCK_END_ID = 275051;
const SECOND_BLOCK_END_ID = 275072;
const SECOND_BLOCK_INSERT_AFTER_ID = 362901;

function indexByProductId(cards, productId) {
  return cards.findIndex((card) => Number(card?.cardmarketProductId || 0) === Number(productId));
}

function movePrefixToEnd(cards, inclusiveEndProductId) {
  const boundaryIndex = indexByProductId(cards, inclusiveEndProductId);
  if (boundaryIndex < 0) return null;

  const prefix = cards.slice(0, boundaryIndex + 1);
  const suffix = cards.slice(boundaryIndex + 1);
  return [...suffix, ...prefix];
}

function movePrefixBehindAnchor(cards, inclusiveEndProductId, anchorProductId) {
  const prefixBoundaryIndex = indexByProductId(cards, inclusiveEndProductId);
  if (prefixBoundaryIndex < 0) return null;

  const prefix = cards.slice(0, prefixBoundaryIndex + 1);
  const remaining = cards.slice(prefixBoundaryIndex + 1);

  const anchorIndexInRemaining = indexByProductId(remaining, anchorProductId);
  if (anchorIndexInRemaining < 0) return null;

  const head = remaining.slice(0, anchorIndexInRemaining + 1);
  const tail = remaining.slice(anchorIndexInRemaining + 1);
  return [...head, ...prefix, ...tail];
}

export function transformSet(payload, { logger = console } = {}) {
  if (!payload || !Array.isArray(payload.cards)) {
    return payload;
  }

  const stepOneCards = movePrefixToEnd(payload.cards, FIRST_BLOCK_END_ID);
  if (!stepOneCards) {
    logger.warn(`[cardmarket-custom-sets/1538] skipped: marker ${FIRST_BLOCK_END_ID} not found`);
    return payload;
  }

  const stepTwoCards = movePrefixBehindAnchor(stepOneCards, SECOND_BLOCK_END_ID, SECOND_BLOCK_INSERT_AFTER_ID);
  if (!stepTwoCards) {
    logger.warn(`[cardmarket-custom-sets/1538] skipped: marker ${SECOND_BLOCK_END_ID} or anchor ${SECOND_BLOCK_INSERT_AFTER_ID} not found`);
    return payload;
  }

  return {
    ...payload,
    cards: stepTwoCards,
  };
}
