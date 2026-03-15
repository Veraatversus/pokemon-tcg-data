// ══════════════════════════════════════════════════════════════════════════
// CARD FILTERING & VALUE CALCULATION SYSTEM
// ══════════════════════════════════════════════════════════════════════════

const CARD_TYPES = {
  normal: { name: 'Normal', emoji: '⚪' },
  fire: { name: 'Feuer', emoji: '🔴' },
  water: { name: 'Wasser', emoji: '💙' },
  grass: { name: 'Pflanze', emoji: '🟢' },
  electric: { name: 'Elektro', emoji: '⚡' },
  psychic: { name: 'Psycho', emoji: '💜' },
  fighting: { name: 'Kampf', emoji: '👊' },
  poison: { name: 'Gift', emoji: '☠️' },
  ground: { name: 'Boden', emoji: '🟤' },
  flying: { name: 'Flug', emoji: '🕊️' },
  bug: { name: 'Käfer', emoji: '🐛' },
  rock: { name: 'Gestein', emoji: '🪨' },
  ghost: { name: 'Spuk', emoji: '👻' },
  ice: { name: 'Eis', emoji: '❄️' },
  dragon: { name: 'Drache', emoji: '🐉' },
  dark: { name: 'Finsternis', emoji: '⬛' },
  steel: { name: 'Stahl', emoji: '⚙️' },
  fairy: { name: 'Fee', emoji: '✨' }
};

const CARD_RARITY = {
  common: { name: 'Häufig', emoji: '⚪', value: 0.5 },
  uncommon: { name: 'Selten', emoji: '🟡', value: 2 },
  rare: { name: 'Sehr Selten', emoji: '🔴', value: 10 },
  holorare: { name: 'Hologramm Selten', emoji: '⭐', value: 25 },
  ex: { name: 'EX Karte', emoji: '💎', value: 30 },
  v: { name: 'V Karte', emoji: '✨', value: 15 },
  vmax: { name: 'VMAX Karte', emoji: '🔥', value: 40 },
  vstar: { name: 'VSTAR Karte', emoji: '⚡', value: 50 },
  gx: { name: 'GX Karte', emoji: '💥', value: 20 },
  holo: { name: 'Holografisch', emoji: '✨', value: 5 }
};

// ══════════════════════════════════════════════════════════════════════════
// RARITY DETECTION
// ══════════════════════════════════════════════════════════════════════════

export function detectCardRarity(card) {
  if (!card) return 'common';

  const name = (card.name || '').toLowerCase();
  const id = (card.id || '').toLowerCase();

  // Check for special patterns
  if (name.includes('vstar') || id.includes('vstar')) return 'vstar';
  if (name.includes('vmax') || id.includes('vmax')) return 'vmax';
  if (name.includes('v ') || id.includes('-v-')) return 'v';
  if (name.includes('ex ') || id.includes('-ex')) return 'ex';
  if (name.includes('gx ') || id.includes('-gx')) return 'gx';

  // Check for numeric patterns (e.g., "100/102" indicates special)
  const numberMatch = (card.number || '').match(/(\d+)\/(\d+)/);
  if (numberMatch) {
    const [, cardNum, totalCards] = numberMatch.map(Number);
    if (cardNum > totalCards - 5) return 'rare'; // Last 5 cards usually rare
  }

  return 'common';
}

// ══════════════════════════════════════════════════════════════════════════
// TYPE DETECTION
// ══════════════════════════════════════════════════════════════════════════

export function detectCardType(card) {
  if (!card) return 'normal';

  const typeStr = (card.type || card.cardType || '').toLowerCase();

  for (const [key, type] of Object.entries(CARD_TYPES)) {
    if (typeStr.includes(key) || typeStr.includes(type.name.toLowerCase())) {
      return key;
    }
  }

  return 'normal';
}

// ══════════════════════════════════════════════════════════════════════════
// COLLECTION VALUE CALCULATION
// ══════════════════════════════════════════════════════════════════════════

export function getCardEstimatedValue(card, isHolographic = false) {
  try {
    const rarity = detectCardRarity(card);
    const baseValue = CARD_RARITY[rarity]?.value || 1;
    const holoMultiplier = isHolographic ? 1.5 : 1;

    // Adjust for card age (older cards are more valuable)
    let ageMultiplier = 1;
    if (card.releaseDate) {
      const releaseDate = new Date(card.releaseDate);
      const age = (new Date() - releaseDate) / (1000 * 60 * 60 * 24 * 365);
      ageMultiplier = 1 + age * 0.05; // +5% per year
    }

    return baseValue * holoMultiplier * ageMultiplier;
  } catch (err) {
    console.warn('Failed to calculate card value:', err);
    return 1;
  }
}

export function calculateCollectionValue(collectionData, cards) {
  try {
    let totalValue = 0;
    let cardCount = 0;

    cards.forEach((card) => {
      const cardNum = normalizeCardNumber(card.number);
      const collectionCard = collectionData[cardNum];

      if (collectionCard) {
        const normalValue = getCardEstimatedValue(card, false);
        const holoValue = getCardEstimatedValue(card, true);

        if (typeof collectionCard === 'object') {
          if (collectionCard.g) totalValue += normalValue;
          if (collectionCard.rh) totalValue += holoValue;
          if (collectionCard.g || collectionCard.rh) cardCount++;
        } else if (collectionCard) {
          totalValue += normalValue;
          cardCount++;
        }
      }
    });

    return {
      totalValue: totalValue.toFixed(2),
      cardCount,
      averageValue: (totalValue / Math.max(1, cardCount)).toFixed(2)
    };
  } catch (err) {
    console.warn('Failed to calculate collection value:', err);
    return { totalValue: 0, cardCount: 0, averageValue: 0 };
  }
}

function normalizeCardNumber(number) {
  return String(number).toLowerCase().trim();
}

// ══════════════════════════════════════════════════════════════════════════
// FILTER OPERATIONS
// ══════════════════════════════════════════════════════════════════════════

export function applyCardFilters(cards, filters = {}) {
  try {
    return cards.filter((card) => {
      // Rarity filter
      if (filters.rarity && filters.rarity.length > 0) {
        const cardRarity = detectCardRarity(card);
        if (!filters.rarity.includes(cardRarity)) return false;
      }

      // Type filter
      if (filters.type && filters.type.length > 0) {
        const cardType = detectCardType(card);
        if (!filters.type.includes(cardType)) return false;
      }

      // Name filter
      if (filters.search) {
        const search = filters.search.toLowerCase();
        const matchesName = (card.name || '').toLowerCase().includes(search);
        const matchesNumber = (card.number || '').toLowerCase().includes(search);
        if (!matchesName && !matchesNumber) return false;
      }

      // Value filter (min/max)
      if (filters.minValue || filters.maxValue) {
        const value = parseFloat(getCardEstimatedValue(card, false));
        if (filters.minValue && value < filters.minValue) return false;
        if (filters.maxValue && value > filters.maxValue) return false;
      }

      return true;
    });
  } catch (err) {
    console.warn('Filter application failed:', err);
    return cards;
  }
}

export function getCardsByRarity(cards, rarity) {
  return cards.filter((c) => detectCardRarity(c) === rarity);
}

export function getCardsByType(cards, type) {
  return cards.filter((c) => detectCardType(c) === type);
}

export function getRareCards(cards) {
  return cards.filter((c) => {
    const rarity = detectCardRarity(c);
    return ['rare', 'holorare', 'ex', 'v', 'vmax', 'vstar', 'gx'].includes(rarity);
  });
}

// ══════════════════════════════════════════════════════════════════════════
// COLLECTION STATISTICS
// ══════════════════════════════════════════════════════════════════════════

export function getCollectionValueStats(collectionData, sets, cards) {
  try {
    const stats = {
      bySet: {},
      byRarity: {},
      byType: {},
      topCards: [],
      statistics: {
        totalValue: 0,
        averageCardValue: 0,
        mostValuableCard: null,
        rareCardCount: 0
      }
    };

    cards.forEach((card) => {
      const rarity = detectCardRarity(card);
      const type = detectCardType(card);
      const value = getCardEstimatedValue(card, false);

      // By rarity
      if (!stats.byRarity[rarity]) stats.byRarity[rarity] = { count: 0, value: 0 };
      stats.byRarity[rarity].count++;
      stats.byRarity[rarity].value += value;

      // By type
      if (!stats.byType[type]) stats.byType[type] = { count: 0, value: 0 };
      stats.byType[type].count++;
      stats.byType[type].value += value;

      // Track top cards
      stats.topCards.push({
        name: card.name,
        number: card.number,
        value: value.toFixed(2),
        rarity
      });

      // Rare cards
      if (['rare', 'holorare', 'ex', 'v', 'vmax', 'vstar', 'gx'].includes(rarity)) {
        stats.statistics.rareCardCount++;
      }

      stats.statistics.totalValue += value;
    });

    stats.topCards.sort((a, b) => parseFloat(b.value) - parseFloat(a.value));
    stats.topCards = stats.topCards.slice(0, 10);

    if (cards.length > 0) {
      stats.statistics.averageCardValue = (stats.statistics.totalValue / cards.length).toFixed(2);
    }
    if (stats.topCards.length > 0) {
      stats.statistics.mostValuableCard = stats.topCards[0];
    }

    return stats;
  } catch (err) {
    console.warn('Failed to get collection value stats:', err);
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════════════
// EXPORT FILTERS FOR UI
// ══════════════════════════════════════════════════════════════════════════

export function getAvailableRarities() {
  return Object.entries(CARD_RARITY).map(([key, value]) => ({
    id: key,
    name: value.name,
    emoji: value.emoji
  }));
}

export function getAvailableTypes() {
  return Object.entries(CARD_TYPES).map(([key, value]) => ({
    id: key,
    name: value.name,
    emoji: value.emoji
  }));
}
