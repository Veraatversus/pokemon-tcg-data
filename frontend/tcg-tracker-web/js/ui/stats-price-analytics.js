function toFinitePrice(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function pickFirstFinite(prices = {}, keys = []) {
  for (const key of keys) {
    const value = toFinitePrice(prices?.[key]);
    if (value != null) return value;
  }
  return null;
}

export function pickCardPriceFromSummary(summary = null, { preferReverseHolo = false } = {}) {
  const prices = summary?.entry?.prices || {};
  const reverseCandidates = ['trendHolo', 'averageHolo', 'avgHolo', 'lowHolo', 'reverseHoloSell'];
  const normalCandidates = ['trend', 'average', 'avg', 'low'];

  const reverse = pickFirstFinite(prices, reverseCandidates);
  const normal = pickFirstFinite(prices, normalCandidates);

  return preferReverseHolo ? (reverse ?? normal) : (normal ?? reverse);
}

export function computePriceAnalyticsFromSummaries(items = []) {
  const safeItems = Array.isArray(items) ? items : [];
  const setTotals = new Map();

  let collectedCards = 0;
  let pricedCollectedCards = 0;
  let totalValue = 0;
  let topCard = null;

  for (const item of safeItems) {
    if (!item?.isCollected) continue;
    collectedCards += 1;

    const value = toFinitePrice(item?.value);
    const setId = String(item?.setId || '').trim();
    const setName = String(item?.setName || '').trim() || 'Unbekanntes Set';

    if (!setTotals.has(setId || setName)) {
      setTotals.set(setId || setName, {
        setId,
        setName,
        value: 0,
        pricedCards: 0,
        collectedCards: 0,
      });
    }

    const setEntry = setTotals.get(setId || setName);
    setEntry.collectedCards += 1;

    if (value == null) continue;

    pricedCollectedCards += 1;
    totalValue += value;
    setEntry.value += value;
    setEntry.pricedCards += 1;

    if (!topCard || value > topCard.value) {
      topCard = {
        cardKey: String(item?.cardKey || '').trim(),
        cardName: String(item?.cardName || '').trim() || 'Unbekannte Karte',
        setId,
        setName,
        value,
      };
    }
  }

  const setBreakdown = Array.from(setTotals.values())
    .sort((a, b) => {
      const valueDiff = b.value - a.value;
      if (valueDiff !== 0) return valueDiff;
      return b.pricedCards - a.pricedCards;
    });

  const topSet = setBreakdown.length
    ? {
        setId: setBreakdown[0].setId,
        setName: setBreakdown[0].setName,
        value: setBreakdown[0].value,
        pricedCards: setBreakdown[0].pricedCards,
        collectedCards: setBreakdown[0].collectedCards,
      }
    : null;

  return {
    collectedCards,
    pricedCollectedCards,
    totalValue,
    avgCollectedCardValue: collectedCards > 0 ? totalValue / collectedCards : 0,
    topSet,
    topCard,
    setBreakdown,
  };
}
