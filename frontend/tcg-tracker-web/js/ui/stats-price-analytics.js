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

function quantile(sortedValues = [], q = 0.5) {
  if (!Array.isArray(sortedValues) || sortedValues.length === 0) return 0;
  const clampedQ = Math.min(1, Math.max(0, Number(q) || 0));
  const index = (sortedValues.length - 1) * clampedQ;
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  if (lo === hi) return sortedValues[lo] || 0;
  const loValue = sortedValues[lo] || 0;
  const hiValue = sortedValues[hi] || 0;
  return loValue + ((hiValue - loValue) * (index - lo));
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
  const pricedItems = [];
  const distribution = { under1: 0, from1to5: 0, from5to20: 0, over20: 0 };

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

    if (value < 1) distribution.under1 += 1;
    else if (value < 5) distribution.from1to5 += 1;
    else if (value < 20) distribution.from5to20 += 1;
    else distribution.over20 += 1;

    pricedItems.push({
      cardKey: String(item?.cardKey || '').trim(),
      cardName: String(item?.cardName || '').trim() || 'Unbekannte Karte',
      setId,
      setName,
      value,
    });
  }

  const topCards = pricedItems
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const sortedValues = pricedItems
    .map((item) => toFinitePrice(item?.value))
    .filter((value) => value != null)
    .sort((a, b) => a - b);

  const minValue = sortedValues[0] || 0;
  const maxValue = sortedValues[sortedValues.length - 1] || 0;
  const q1Value = quantile(sortedValues, 0.25);
  const q3Value = quantile(sortedValues, 0.75);
  const iqrValue = Math.max(0, q3Value - q1Value);
  const medianValue = quantile(sortedValues, 0.5);
  const p90Value = quantile(sortedValues, 0.9);
  const absoluteDeviations = sortedValues
    .map((value) => Math.abs(value - medianValue))
    .sort((a, b) => a - b);
  const madValue = quantile(absoluteDeviations, 0.5);
  const topFiveValue = topCards
    .slice(0, 5)
    .reduce((sum, card) => sum + (toFinitePrice(card?.value) || 0), 0);
  const lowerFence = q1Value - (1.5 * iqrValue);
  const upperFence = q3Value + (1.5 * iqrValue);
  const outlierCount = sortedValues.filter((value) => value < lowerFence || value > upperFence).length;

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

  const pricedSets = setBreakdown.filter((entry) => Number(entry?.pricedCards || 0) > 0).length;
  const totalCollectedSets = setBreakdown.filter((entry) => Number(entry?.collectedCards || 0) > 0).length;
  const topFiveValueShare = totalValue > 0 ? (topFiveValue / totalValue) * 100 : 0;
  const priceSpreadRatio = minValue > 0 ? (maxValue / minValue) : 0;
  const setHhi = totalValue > 0
    ? setBreakdown.reduce((sum, entry) => {
      const setShare = Number(entry?.value || 0) / totalValue;
      return sum + (setShare * setShare);
    }, 0)
    : 0;

  return {
    collectedCards,
    pricedCollectedCards,
    totalValue,
    avgCollectedCardValue: pricedCollectedCards > 0 ? totalValue / pricedCollectedCards : 0,
    priceCoverage: collectedCards > 0 ? (pricedCollectedCards / collectedCards) * 100 : 0,
    topSet,
    topCard: topCards[0] || null,
    topCards,
    setBreakdown,
    distribution,
    details: {
      medianValue,
      q1Value,
      q3Value,
      iqrValue,
      p90Value,
      madValue,
      minValue,
      maxValue,
      outlierCount,
      priceSpreadRatio,
      topFiveValue,
      topFiveValueShare,
      pricedSets,
      totalCollectedSets,
      setHhi,
      pricedSetCoverage: totalCollectedSets > 0 ? (pricedSets / totalCollectedSets) * 100 : 0,
    },
  };
}
