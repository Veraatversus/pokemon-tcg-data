/**
 * Collection Statistics Module
 * Calculate and display collection statistics, progress, and analytics
 */

export class CollectionStats {
  constructor() {
    this.stats = {};
  }

  /**
   * Calculate statistics for a set
   * @param {Array} cards - Cards in the set
   * @param {string} setId - Set identifier
   * @returns {Object} Statistics object
   */
  calculateSetStats(cards, setId) {
    const total = cards.length;
    const collected = cards.filter(c => c.g === true).length;
    const reverseHolo = cards.filter(c => c.rh === true).length;
    const bothCollected = cards.filter(c => c.g && c.rh).length;
    const missing = cards.filter(c => c.g === false).length;
    const withCardmarket = cards.filter(c => c.cardmarketLink).length;

    const completionPercent = total > 0 ? (collected / total) * 100 : 0;
    const rhCompletionPercent = collected > 0 ? (bothCollected / collected) * 100 : 0;

    const stats = {
      setId,
      total,
      collected,
      reverseHolo,
      bothCollected,
      missing,
      withCardmarket,
      completionPercent: Math.round(completionPercent),
      rhCompletionPercent: Math.round(rhCompletionPercent),
      isComplete: completionPercent === 100,
      lastUpdated: new Date().getTime()
    };

    this.stats[setId] = stats;
    return stats;
  }

  /**
   * Calculate global statistics across all sets
   * @param {Object} allSetStats - Object with set IDs as keys and stat objects as values
   * @returns {Object} Global statistics
   */
  calculateGlobalStats(allSetStats) {
    let totalCards = 0;
    let totalCollected = 0;
    let totalReverseHolo = 0;
    let totalBothCollected = 0;
    let completedSets = 0;
    let inProgressSets = 0;
    let notStartedSets = 0;

    Object.values(allSetStats).forEach(setStats => {
      totalCards += setStats.total;
      totalCollected += setStats.collected;
      totalReverseHolo += setStats.reverseHolo;
      totalBothCollected += setStats.bothCollected;

      if (setStats.completionPercent === 100) {
        completedSets++;
      } else if (setStats.completionPercent > 0) {
        inProgressSets++;
      } else {
        notStartedSets++;
      }
    });

    const globalCompletionPercent = totalCards > 0 ? (totalCollected / totalCards) * 100 : 0;
    const avgCompletionPercent = Object.values(allSetStats).length > 0
      ? Object.values(allSetStats).reduce((sum, s) => sum + s.completionPercent, 0) / Object.values(allSetStats).length
      : 0;

    return {
      totalSets: Object.keys(allSetStats).length,
      totalCards,
      totalCollected,
      totalReverseHolo,
      totalBothCollected,
      missing: totalCards - totalCollected,
      completedSets,
      inProgressSets,
      notStartedSets,
      globalCompletionPercent: Math.round(globalCompletionPercent),
      avgCompletionPercent: Math.round(avgCompletionPercent),
      lastUpdated: new Date().getTime()
    };
  }

  /**
   * Get set statistics
   * @param {string} setId - Set identifier
   */
  getSetStats(setId) {
    return this.stats[setId] || null;
  }

  /**
   * Get all statistics
   */
  getAllStats() {
    return this.stats;
  }

  /**
   * Format statistics for display
   * @param {Object} stats - Statistics object
   * @returns {Object} Formatted statistics
   */
  formatForDisplay(stats) {
    return {
      total: `${stats.total} Karten`,
      collected: `${stats.collected}/${stats.total} (${stats.completionPercent}%)`,
      reverseHolo: `${stats.reverseHolo} RH-Karten`,
      missing: `${stats.missing} fehlend`,
      status: stats.isComplete ? '✅ Abgeschlossen' : `🔄 ${stats.completionPercent}% fertig`
    };
  }

  /**
   * Get progress bar data
   * @param {Object} stats - Statistics object
   * @returns {Object} Progress bar data
   */
  getProgressBar(stats) {
    return {
      filled: stats.completionPercent,
      remaining: 100 - stats.completionPercent,
      text: `${stats.collected}/${stats.total}`
    };
  }

  /**
   * Compare two sets by completion
   * @param {Object} stats1 - First set statistics
   * @param {Object} stats2 - Second set statistics
   * @returns {number} Comparison result (-1, 0, 1)
   */
  compareByCompletion(stats1, stats2) {
    return stats2.completionPercent - stats1.completionPercent;
  }

  /**
   * Get sets sorted by completion percentage
   * @param {Object} allSetStats - All set statistics
   * @param {string} direction - 'asc' or 'desc'
   */
  getSortedByCompletion(allSetStats, direction = 'desc') {
    const sorted = Object.entries(allSetStats).sort((a, b) => {
      const diff = b[1].completionPercent - a[1].completionPercent;
      return direction === 'asc' ? -diff : diff;
    });
    return sorted.map(([setId, stats]) => ({ setId, ...stats }));
  }

  /**
   * Get collection value estimate (requires cardmarket data)
   * @param {Object} allCardmarketData - Cardmarket prices by card ID
   * @param {Array} cards - Cards in collection
   * @returns {Object} Value data
   */
  calculateCollectionValue(allCardmarketData, cards) {
    let totalValue = 0;
    let collectedValue = 0;
    let missingValue = 0;
    let cardsWithPrice = 0;

    cards.forEach(card => {
      const price = allCardmarketData[card.id]?.price || 0;
      
      if (price > 0) {
        totalValue += price;
        cardsWithPrice++;

        if (card.g) {
          collectedValue += price;
        } else {
          missingValue += price;
        }
      }
    });

    return {
      totalValue: totalValue.toFixed(2),
      collectedValue: collectedValue.toFixed(2),
      missingValue: missingValue.toFixed(2),
      cardsWithPrice,
      averagePrice: cardsWithPrice > 0 ? (totalValue / cardsWithPrice).toFixed(2) : 0
    };
  }

  /**
   * Get rarity distribution
   * @param {Array} cards - Cards in collection
   * @returns {Object} Rarity distribution
   */
  getRarityDistribution(cards) {
    const distribution = {};

    cards.forEach(card => {
      const rarity = card.rarity || 'Unknown';
      if (!distribution[rarity]) {
        distribution[rarity] = { total: 0, collected: 0 };
      }
      distribution[rarity].total++;
      if (card.g) {
        distribution[rarity].collected++;
      }
    });

    return distribution;
  }

  /**
   * Get type distribution
   * @param {Array} cards - Cards in collection
   * @returns {Object} Type distribution
   */
  getTypeDistribution(cards) {
    const distribution = {};

    cards.forEach(card => {
      const types = card.types || [];
      types.forEach(type => {
        if (!distribution[type]) {
          distribution[type] = { total: 0, collected: 0 };
        }
        distribution[type].total++;
        if (card.g) {
          distribution[type].collected++;
        }
      });
    });

    return distribution;
  }

  /**
   * Export statistics as JSON
   */
  exportJSON() {
    return {
      stats: this.stats,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Import statistics from JSON
   */
  importJSON(data) {
    if (data.stats && typeof data.stats === 'object') {
      this.stats = data.stats;
      return true;
    }
    return false;
  }
}

/**
 * Global statistics instance
 */
let globalStats = null;

export function initializeStats() {
  globalStats = new CollectionStats();
  return globalStats;
}

export function getGlobalStats() {
  if (!globalStats) {
    globalStats = new CollectionStats();
  }
  return globalStats;
}
