// ══════════════════════════════════════════════════════════════════════════
// ADVANCED SEARCH & FILTERING ENGINE
// ══════════════════════════════════════════════════════════════════════════

export class AdvancedSearch {
  constructor(allSets, collectionData) {
    this.allSets = allSets;
    this.collectionData = collectionData;
    this.filters = {
      series: null,
      minCards: 0,
      maxCards: 999,
      minCompletion: 0,
      maxCompletion: 100,
      hasHolo: null,
      isFavorite: null
    };
  }

  applyFilters(query = '') {
    let results = [...this.allSets];

    if (query) {
      const q = query.toLowerCase();
      results = results.filter(set =>
        set.setName.toLowerCase().includes(q) ||
        set.setId.toLowerCase().includes(q) ||
        (set.series || '').toLowerCase().includes(q)
      );
    }

    if (this.filters.series) {
      results = results.filter(set => set.series === this.filters.series);
    }

    if (this.filters.minCards > 0) {
      results = results.filter(set => (set.totalCards || 0) >= this.filters.minCards);
    }

    if (this.filters.maxCards < 999) {
      results = results.filter(set => (set.totalCards || 0) <= this.filters.maxCards);
    }

    if (this.filters.isFavorite !== null) {
      const favorites = this.getFavoritesFromStorage();
      results = results.filter(set =>
        favorites.has(set.setId) === this.filters.isFavorite
      );
    }

    return results;
  }

  getFavoritesFromStorage() {
    try {
      const data = localStorage.getItem('poke-favorites-sets');
      return new Set(data ? JSON.parse(data) : []);
    } catch {
      return new Set();
    }
  }

  setFilter(key, value) {
    if (key in this.filters) {
      this.filters[key] = value;
    }
    return this;
  }

  resetFilters() {
    this.filters = {
      series: null,
      minCards: 0,
      maxCards: 999,
      minCompletion: 0,
      maxCompletion: 100,
      hasHolo: null,
      isFavorite: null
    };
    return this;
  }
}

// ══════════════════════════════════════════════════════════════════════════
// SYNC INDICATOR & STATUS TRACKING
// ══════════════════════════════════════════════════════════════════════════

export class SyncIndicator {
  constructor() {
    this.state = 'idle'; // idle, syncing, success, error
    this.lastSync = null;
    this.nextSync = null;
    this.failCount = 0;
    this.listeners = [];
  }

  setState(newState) {
    this.state = newState;
    
    if (newState === 'success') {
      this.lastSync = new Date();
      this.failCount = 0;
    } else if (newState === 'error') {
      this.failCount++;
    }

    this.notifyListeners();
  }

  notifyListeners() {
    this.listeners.forEach(fn => fn(this.getStatus()));
  }

  subscribe(callback) {
    this.listeners.push(callback);
    callback(this.getStatus());
  }

  getStatus() {
    const minutes = this.lastSync
      ? Math.floor((Date.now() - this.lastSync) / 60000)
      : null;

    return {
      state: this.state,
      lastSync: this.lastSync,
      lastSyncAgo: minutes ? `vor ${minutes}m` : 'niemals',
      failCount: this.failCount,
      isHealthy: this.failCount < 3
    };
  }

  getIcon() {
    const icons = {
      idle: '⚪',
      syncing: '🔄',
      success: '✅',
      error: '❌'
    };
    return icons[this.state] || '❓';
  }
}

// ══════════════════════════════════════════════════════════════════════════
// CARD COLLECTION TOOLS (Bulk marking, multi-select)
// ══════════════════════════════════════════════════════════════════════════

export class CardCollectionTools {
  constructor() {
    this.selectedCards = new Set();
    this.selectionMode = false;
  }

  enableSelection() {
    this.selectionMode = true;
    this.selectedCards.clear();
  }

  disableSelection() {
    this.selectionMode = false;
    this.selectedCards.clear();
  }

  toggleCard(cardId) {
    if (!this.selectionMode) return false;
    
    if (this.selectedCards.has(cardId)) {
      this.selectedCards.delete(cardId);
    } else {
      this.selectedCards.add(cardId);
    }
    
    return true;
  }

  selectAll(cardIds) {
    this.selectedCards = new Set(cardIds);
  }

  clearSelection() {
    this.selectedCards.clear();
  }

  getSelected() {
    return Array.from(this.selectedCards);
  }

  getCount() {
    return this.selectedCards.size;
  }

  isSelected(cardId) {
    return this.selectedCards.has(cardId);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// COLLECTION INSIGHTS & ANALYTICS
// ══════════════════════════════════════════════════════════════════════════

export function generateCollectionInsights(collectionData, setList, stats) {
  const insights = [];

  // Insight 1: Completion progress
  if (stats.percentComplete >= 90) {
    insights.push({
      type: 'milestone',
      icon: '🎉',
      title: 'Du bist sehr nah dran!',
      message: `${stats.percentComplete}% Gesamtfortschritt - fast geschafft!`,
      priority: 'high'
    });
  } else if (stats.percentComplete >= 50) {
    insights.push({
      type: 'progress',
      icon: '📈',
      title: 'Guter Fortschritt',
      message: `${stats.percentComplete}% deiner Sammlung ist abgeschlossen`,
      priority: 'medium'
    });
  }

  // Insight 2: Easy wins
  const nearlyComplete = stats.setDetails
    .filter(s => s.percentage >= 80 && s.percentage < 100)
    .slice(0, 1);

  if (nearlyComplete.length > 0) {
    insights.push({
      type: 'opportunity',
      icon: '🎯',
      title: 'Schnelle Siege möglich',
      message: `${nearlyComplete[0].setId}: Nur noch ${nearlyComplete[0].total - nearlyComplete[0].collected} Karte(n)!`,
      priority: 'high'
    });
  }

  // Insight 3: Unused sets
  const unused = setList.filter(s => s.imported && !stats.setDetails.find(sd => sd.setId === s.setId));
  if (unused.length > 0) {
    insights.push({
      type: 'reminder',
      icon: '📦',
      title: `${unused.length} Sets nicht gestartet`,
      message: `${unused.slice(0, 2).map(s => s.setName).join(', ')}...`,
      priority: 'low'
    });
  }

  // Insight 4: Rarity tracking
  if (stats.holographics > 0) {
    insights.push({
      type: 'achievement',
      icon: '✨',
      title: `${stats.holographics} Holografische Karten`,
      message: 'Schöne seltene Karten in deiner Sammlung!',
      priority: 'medium'
    });
  }

  return insights;
}

// ══════════════════════════════════════════════════════════════════════════
// SET COMPARISON TOOL
// ══════════════════════════════════════════════════════════════════════════

export function generateSetComparison(set1Id, set2Id, collectionData, setList) {
  const set1 = setList.find(s => s.setId === set1Id);
  const set2 = setList.find(s => s.setId === set2Id);

  if (!set1 || !set2) return null;

  const collection1 = collectionData[set1.setName] || {};
  const collection2 = collectionData[set2.setName] || {};

  const collected1 = Object.values(collection1).filter(c => c).length;
  const collected2 = Object.values(collection2).filter(c => c).length;

  const percent1 = (collected1 / (set1.totalCards || 1)) * 100;
  const percent2 = (collected2 / (set2.totalCards || 1)) * 100;

  return {
    set1: {
      id: set1.setId,
      name: set1.setName,
      collected: collected1,
      total: set1.totalCards || 0,
      percentage: Math.round(percent1),
      series: set1.series
    },
    set2: {
      id: set2.setId,
      name: set2.setName,
      collected: collected2,
      total: set2.totalCards || 0,
      percentage: Math.round(percent2),
      series: set2.series
    },
    difference: Math.abs(percent1 - percent2),
    leader: percent1 > percent2 ? 'set1' : percent2 > percent1 ? 'set2' : 'tie'
  };
}

// ══════════════════════════════════════════════════════════════════════════
// NOTIFICATION MANAGER
// ══════════════════════════════════════════════════════════════════════════

export class NotificationManager {
  constructor(maxNotifications = 5) {
    this.notifications = [];
    this.maxNotifications = maxNotifications;
  }

  add(notification) {
    const id = Date.now();
    const notif = {
      id,
      timestamp: new Date(),
      ...notification
    };

    this.notifications.unshift(notif);

    if (this.notifications.length > this.maxNotifications) {
      this.notifications.pop();
    }

    return id;
  }

  remove(id) {
    this.notifications = this.notifications.filter(n => n.id !== id);
  }

  getAll() {
    return this.notifications;
  }

  getRecent(count = 5) {
    return this.notifications.slice(0, count);
  }

  createNotification(type, title, message, duration = 5000) {
    return {
      type, // 'success', 'error', 'info', 'warning'
      title,
      message,
      duration,
      icon: this.getIconForType(type),
      dismissible: true
    };
  }

  getIconForType(type) {
    const icons = {
      success: '✅',
      error: '❌',
      info: 'ℹ️',
      warning: '⚠️'
    };
    return icons[type] || '📝';
  }
}

// ══════════════════════════════════════════════════════════════════════════
// PERFORMANCE ANALYTICS
// ══════════════════════════════════════════════════════════════════════════

export class PerformanceTracker {
  constructor() {
    this.metrics = {
      pageLoadTime: 0,
      apiResponseTimes: [],
      cachedRequests: 0,
      apiRequests: 0,
      offlineRequests: 0
    };
    this.startTime = performance.now();
  }

  recordApiCall(duration, fromCache = false) {
    this.metrics.apiResponseTimes.push(duration);
    if (fromCache) {
      this.metrics.cachedRequests++;
    } else {
      this.metrics.apiRequests++;
    }
  }

  recordOfflineRequest() {
    this.metrics.offlineRequests++;
  }

  getMetrics() {
    const avgResponseTime = this.metrics.apiResponseTimes.length > 0
      ? Math.round(this.metrics.apiResponseTimes.reduce((a, b) => a + b, 0) / this.metrics.apiResponseTimes.length)
      : 0;

    return {
      pageLoadTime: Math.round(performance.now() - this.startTime),
      avgApiResponseTime: avgResponseTime,
      totalApiCalls: this.metrics.apiRequests + this.metrics.cachedRequests,
      cacheHitRate: this.metrics.apiRequests + this.metrics.cachedRequests > 0
        ? Math.round((this.metrics.cachedRequests / (this.metrics.apiRequests + this.metrics.cachedRequests)) * 100)
        : 0,
      offlineRequests: this.metrics.offlineRequests,
      totalRequests: this.metrics.apiRequests
    };
  }
}
