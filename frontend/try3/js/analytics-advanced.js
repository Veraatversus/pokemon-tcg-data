/**
 * Analytics Advanced Module
 * Provides detailed collection analytics and visualizations
 */

class AnalyticsAdvanced {
  constructor() {
    this.history = this.loadHistory();
  }

  /**
   * Load collection history from localStorage
   */
  loadHistory() {
    try {
      const stored = localStorage.getItem('collection_history');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Failed to load history:', e);
    }
    return [];
  }

  /**
   * Save collection history
   */
  saveHistory() {
    try {
      localStorage.setItem('collection_history', JSON.stringify(this.history));
    } catch (e) {
      console.error('Failed to save history:', e);
    }
  }

  /**
   * Record current collection state
   */
  recordSnapshot(sets, stats) {
    const snapshot = {
      timestamp: Date.now(),
      date: new Date().toISOString(),
      totalCards: stats.totalCards || 0,
      collectedCards: stats.collectedCards || 0,
      reverseHoloCards: stats.reverseHoloCards || 0,
      completionPercent: stats.completionPercent || 0,
      setCount: sets.length,
      sets: sets.map(set => ({
        id: set.id,
        name: set.name,
        collected: set.cards.filter(c => c.collected || c.reverseHolo).length,
        total: set.cards.length,
        completion: set.getProgress().percentage
      }))
    };

    this.history.push(snapshot);

    // Keep only last 90 days
    const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
    this.history = this.history.filter(s => s.timestamp > ninetyDaysAgo);

    this.saveHistory();
    return snapshot;
  }

  /**
   * Get collection progress over time
   */
  getProgressOverTime(days = 30) {
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    return this.history
      .filter(s => s.timestamp > cutoff)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Calculate growth rate
   */
  getGrowthRate(days = 7) {
    const recent = this.getProgressOverTime(days);
    if (recent.length < 2) return 0;

    const oldest = recent[0];
    const newest = recent[recent.length - 1];
    const growth = newest.collectedCards - oldest.collectedCards;
    
    return growth;
  }

  /**
   * Get average cards per day
   */
  getAveragePerDay(days = 30) {
    const recent = this.getProgressOverTime(days);
    if (recent.length < 2) return 0;

    const oldest = recent[0];
    const newest = recent[recent.length - 1];
    const growth = newest.collectedCards - oldest.collectedCards;
    const daysPassed = (newest.timestamp - oldest.timestamp) / (24 * 60 * 60 * 1000);
    
    return daysPassed > 0 ? (growth / daysPassed).toFixed(2) : 0;
  }

  /**
   * Predict completion date
   */
  predictCompletionDate(currentStats, days = 30) {
    const avgPerDay = parseFloat(this.getAveragePerDay(days));
    if (avgPerDay <= 0) return null;

    const remaining = currentStats.totalCards - currentStats.collectedCards;
    const daysToComplete = Math.ceil(remaining / avgPerDay);
    
    const completionDate = new Date();
    completionDate.setDate(completionDate.getDate() + daysToComplete);
    
    return {
      date: completionDate,
      daysRemaining: daysToComplete,
      avgPerDay: avgPerDay
    };
  }

  /**
   * Get most improved sets
   */
  getMostImprovedSets(days = 30) {
    const recent = this.getProgressOverTime(days);
    if (recent.length < 2) return [];

    const oldest = recent[0];
    const newest = recent[recent.length - 1];

    const improvements = newest.sets.map((currentSet, idx) => {
      const oldSet = oldest.sets.find(s => s.id === currentSet.id);
      if (!oldSet) return null;

      const improvement = currentSet.collected - oldSet.collected;
      return {
        ...currentSet,
        improvement,
        improvementPercent: oldSet.total > 0 
          ? ((improvement / oldSet.total) * 100).toFixed(1)
          : 0
      };
    }).filter(s => s && s.improvement > 0);

    return improvements.sort((a, b) => b.improvement - a.improvement);
  }

  /**
   * Get collection velocity (cards per week)
   */
  getVelocity(weeks = 4) {
    const velocities = [];
    
    for (let i = 0; i < weeks; i++) {
      const endDate = Date.now() - (i * 7 * 24 * 60 * 60 * 1000);
      const startDate = endDate - (7 * 24 * 60 * 60 * 1000);
      
      const weekData = this.history.filter(s => 
        s.timestamp >= startDate && s.timestamp < endDate
      );

      if (weekData.length >= 2) {
        const oldest = weekData[0];
        const newest = weekData[weekData.length - 1];
        velocities.push({
          week: weeks - i,
          cards: newest.collectedCards - oldest.collectedCards,
          startDate: new Date(startDate),
          endDate: new Date(endDate)
        });
      }
    }

    return velocities.reverse();
  }

  /**
   * Get rarity distribution history
   */
  getRarityDistributionHistory(cards) {
    const distribution = {};
    
    cards.forEach(card => {
      const rarity = card.rarity || 'Unknown';
      if (!distribution[rarity]) {
        distribution[rarity] = {
          total: 0,
          collected: 0,
          missing: 0
        };
      }
      
      distribution[rarity].total++;
      if (card.collected || card.reverseHolo) {
        distribution[rarity].collected++;
      } else {
        distribution[rarity].missing++;
      }
    });

    return Object.entries(distribution)
      .map(([rarity, data]) => ({
        rarity,
        ...data,
        completion: data.total > 0 
          ? ((data.collected / data.total) * 100).toFixed(1)
          : 0
      }))
      .sort((a, b) => b.total - a.total);
  }

  /**
   * Get set completion milestones
   */
  getMilestones() {
    const milestones = [];
    
    this.history.forEach((snapshot, idx) => {
      if (idx === 0) return;
      
      const previous = this.history[idx - 1];
      
      // Check for newly completed sets
      snapshot.sets.forEach(set => {
        const prevSet = previous.sets.find(s => s.id === set.id);
        if (prevSet && prevSet.completion < 100 && set.completion === 100) {
          milestones.push({
            type: 'set_complete',
            date: new Date(snapshot.timestamp),
            setId: set.id,
            setName: set.name,
            description: `Set "${set.name}" vollständig!`
          });
        }
      });

      // Check for completion milestones
      const milestonePercents = [25, 50, 75, 90];
      milestonePercents.forEach(percent => {
        if (previous.completionPercent < percent && snapshot.completionPercent >= percent) {
          milestones.push({
            type: 'completion_milestone',
            date: new Date(snapshot.timestamp),
            percent: percent,
            description: `${percent}% der Sammlung erreicht!`
          });
        }
      });
    });

    return milestones.sort((a, b) => b.date - a.date);
  }

  /**
   * Get streak (consecutive days with activity)
   */
  getCurrentStreak() {
    if (this.history.length === 0) return 0;

    let streak = 0;
    const oneDayMs = 24 * 60 * 60 * 1000;
    let currentDate = Date.now();

    for (let i = this.history.length - 1; i >= 0; i--) {
      const snapshot = this.history[i];
      const daysDiff = Math.floor((currentDate - snapshot.timestamp) / oneDayMs);

      if (daysDiff <= 1) {
        streak++;
        currentDate = snapshot.timestamp;
      } else {
        break;
      }
    }

    return streak;
  }

  /**
   * Export analytics data
   */
  exportData() {
    return {
      history: this.history,
      summary: {
        totalSnapshots: this.history.length,
        oldestSnapshot: this.history[0]?.date,
        newestSnapshot: this.history[this.history.length - 1]?.date,
        growthRate7d: this.getGrowthRate(7),
        growthRate30d: this.getGrowthRate(30),
        avgPerDay: this.getAveragePerDay(30),
        currentStreak: this.getCurrentStreak()
      }
    };
  }

  /**
   * Clear history
   */
  clearHistory() {
    this.history = [];
    localStorage.removeItem('collection_history');
  }
}

// Global instance
let globalAnalytics = null;

/**
 * Initialize global Analytics
 */
function initializeAnalytics() {
  if (!globalAnalytics) {
    globalAnalytics = new AnalyticsAdvanced();
  }
  return globalAnalytics;
}

/**
 * Get global Analytics instance
 */
function getGlobalAnalytics() {
  if (!globalAnalytics) {
    globalAnalytics = new AnalyticsAdvanced();
  }
  return globalAnalytics;
}

export { AnalyticsAdvanced, initializeAnalytics, getGlobalAnalytics };
