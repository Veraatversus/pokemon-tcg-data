// ══════════════════════════════════════════════════════════════════════════
// ENHANCED FEATURES: Favorites, Search History, Quick Filters, Export/Import
// ══════════════════════════════════════════════════════════════════════════

import { scopedStorageKey } from './config.js';

const STORAGE_KEYS = {
  favorites: scopedStorageKey('favorites-sets'),
  searchHistory: scopedStorageKey('search-history'),
  settings: scopedStorageKey('user-settings'),
  collections: scopedStorageKey('collections-exports')
};

const MAX_SEARCH_HISTORY = 20;
const MAX_FAVORITES = 999;

// ══════════════════════════════════════════════════════════════════════════
// FAVORITES MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════

export function loadFavorites() {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.favorites);
    if (!data) return new Set();
    const parsed = JSON.parse(data);
    if (parsed instanceof Set) return parsed;
    if (Array.isArray(parsed)) return new Set(parsed);
    if (parsed && typeof parsed === 'object') {
      return new Set(Object.keys(parsed).filter((key) => Boolean(parsed[key])));
    }
    return new Set();
  } catch (err) {
    console.warn('Failed to load favorites:', err);
    return new Set();
  }
}

export function saveFavorites(favorites) {
  try {
    const arr = Array.from(favorites || []);
    localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify(arr));
    return true;
  } catch (err) {
    console.warn('Failed to save favorites:', err);
    return false;
  }
}

export function toggleFavorite(setId) {
  const favorites = loadFavorites();
  if (favorites.has(setId)) {
    favorites.delete(setId);
  } else {
    favorites.add(setId);
  }
  saveFavorites(favorites);
  return favorites.has(setId);
}

export function isFavorite(setId) {
  return loadFavorites().has(setId);
}

export function getFavoritesList() {
  return Array.from(loadFavorites());
}

// ══════════════════════════════════════════════════════════════════════════
// SEARCH HISTORY
// ══════════════════════════════════════════════════════════════════════════

export function loadSearchHistory() {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.searchHistory);
    return data ? JSON.parse(data) : [];
  } catch (err) {
    console.warn('Failed to load search history:', err);
    return [];
  }
}

export function saveSearchHistory(history) {
  try {
    localStorage.setItem(STORAGE_KEYS.searchHistory, JSON.stringify(history));
    return true;
  } catch (err) {
    console.warn('Failed to save search history:', err);
    return false;
  }
}

export function addSearchHistory(query) {
  if (!query || query.length < 2) return;
  let history = loadSearchHistory();
  
  // Remove duplicate if exists
  history = history.filter(h => h !== query);
  
  // Add to beginning
  history.unshift(query);
  
  // Keep only max items
  if (history.length > MAX_SEARCH_HISTORY) {
    history = history.slice(0, MAX_SEARCH_HISTORY);
  }
  
  saveSearchHistory(history);
  return history;
}

export function clearSearchHistory() {
  localStorage.removeItem(STORAGE_KEYS.searchHistory);
  return true;
}

// ══════════════════════════════════════════════════════════════════════════
// COLLECTION EXPORT/IMPORT
// ══════════════════════════════════════════════════════════════════════════

export function createCollectionSnapshot(collectionData, setList) {
  const timestamp = new Date().toISOString();
  const snapshot = {
    version: 2,
    exported: timestamp,
    sets: setList.map(set => ({
      setId: set.setId,
      setName: set.setName,
      series: set.series,
      imported: set.imported
    })),
    collection: collectionData,
    stats: {
      totalSets: setList.filter(s => s.imported).length,
      totalCards: Object.values(collectionData).reduce((sum, set) => sum + (set ? Object.keys(set).length : 0), 0),
      favorites: getFavoritesList().length
    }
  };
  return snapshot;
}

export function generateCollectionReport(collectionData, setList) {
  const importedSets = setList.filter(s => s.imported);
  const completedSets = importedSets.filter(set => {
    const collected = collectionData[set.setName] 
      ? Object.values(collectionData[set.setName]).filter(c => c).length 
      : 0;
    return collected >= (set.totalCards || 1);
  });

  const totalCards = Object.values(collectionData).reduce((sum, set) => {
    if (!set) return sum;
    return sum + Object.values(set).filter(c => c).length;
  }, 0);

  const favorites = getFavoritesList();
  
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      imported: `${importedSets.length} Sets`,
      completed: `${completedSets.length} Sets (${((completedSets.length / importedSets.length) * 100).toFixed(1)}%)`,
      totalCards: `${totalCards} Karten`,
      favorites: `${favorites.length} Favoriten`
    },
    setDetails: importedSets.map(set => {
      const collected = collectionData[set.setName] 
        ? Object.values(collectionData[set.setName]).filter(c => c).length 
        : 0;
      const total = set.totalCards || 1;
      return {
        id: set.setId,
        name: set.setName,
        collected: collected,
        total: total,
        percentage: Math.round((collected / total) * 100),
        isFavorite: favorites.includes(set.setId)
      };
    }),
    favorites: favorites
  };
}

// ══════════════════════════════════════════════════════════════════════════
// USER SETTINGS & PREFERENCES
// ══════════════════════════════════════════════════════════════════════════

const DEFAULT_SETTINGS = {
  darkMode: true,
  sortBy: 'series-date',
  filterCompleted: false,
  filterInProgress: false,
  filterNotImported: false,
  showFavoritesOnly: false,
  autoBackup: true,
  notificationsEnabled: true,
  compactMode: false,
  syncInterval: 60000 // 1 minute
};

export function loadSettings() {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.settings);
    return data ? { ...DEFAULT_SETTINGS, ...JSON.parse(data) } : DEFAULT_SETTINGS;
  } catch (err) {
    console.warn('Failed to load settings:', err);
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
    return true;
  } catch (err) {
    console.warn('Failed to save settings:', err);
    return false;
  }
}

export function updateSetting(key, value) {
  const settings = loadSettings();
  settings[key] = value;
  saveSettings(settings);
  return settings;
}

// ══════════════════════════════════════════════════════════════════════════
// QUICK FILTERS
// ══════════════════════════════════════════════════════════════════════════

export function applyQuickFilters(sets, collectionData, filters) {
  let filtered = [...sets];

  if (filters.completed) {
    filtered = filtered.filter(set => {
      if (!set.imported) return false;
      const collected = collectionData[set.setName]
        ? Object.values(collectionData[set.setName]).filter(c => c).length
        : 0;
      return collected >= (set.totalCards || 1);
    });
  }

  if (filters.inProgress) {
    filtered = filtered.filter(set => {
      if (!set.imported) return false;
      const collected = collectionData[set.setName]
        ? Object.values(collectionData[set.setName]).filter(c => c).length
        : 0;
      return collected > 0 && collected < (set.totalCards || 1);
    });
  }

  if (filters.notImported) {
    filtered = filtered.filter(set => !set.imported);
  }

  if (filters.favoritesOnly) {
    const favorites = getFavoritesList();
    filtered = filtered.filter(set => favorites.includes(set.setId));
  }

  return filtered;
}

// ══════════════════════════════════════════════════════════════════════════
// SYNC STATUS TRACKING
// ══════════════════════════════════════════════════════════════════════════

let syncStatus = {
  isSyncing: false,
  lastSync: null,
  pendingOperations: 0,
  failedOperations: 0
};

export function getSyncStatus() {
  return { ...syncStatus };
}

export function setSyncStatus(status, isSyncing) {
  syncStatus.isSyncing = isSyncing;
  if (status === 'success') {
    syncStatus.lastSync = new Date().toISOString();
    syncStatus.failedOperations = 0;
  } else if (status === 'failed') {
    syncStatus.failedOperations++;
  } else if (status === 'pending') {
    syncStatus.pendingOperations++;
  }
}

export function resetSyncStatus() {
  syncStatus = {
    isSyncing: false,
    lastSync: new Date().toISOString(),
    pendingOperations: 0,
    failedOperations: 0
  };
}

// ══════════════════════════════════════════════════════════════════════════
// BULK OPERATIONS
// ══════════════════════════════════════════════════════════════════════════

let bulkSelectState = {
  enabled: false,
  selected: new Set(),
  selectionType: null // 'sets' or 'cards'
};

export function initBulkMode(type = 'cards') {
  bulkSelectState.enabled = true;
  bulkSelectState.selected.clear();
  bulkSelectState.selectionType = type;
  return bulkSelectState;
}

export function toggleBulkSelection(id) {
  if (!bulkSelectState.enabled) return false;
  if (bulkSelectState.selected.has(id)) {
    bulkSelectState.selected.delete(id);
  } else {
    bulkSelectState.selected.add(id);
  }
  return true;
}

export function getBulkSelection() {
  return {
    enabled: bulkSelectState.enabled,
    count: bulkSelectState.selected.size,
    items: Array.from(bulkSelectState.selected),
    type: bulkSelectState.selectionType
  };
}

export function clearBulkSelection() {
  bulkSelectState.enabled = false;
  bulkSelectState.selected.clear();
  bulkSelectState.selectionType = null;
}

export function selectAllBulk(items) {
  if (!bulkSelectState.enabled) return;
  items.forEach(item => bulkSelectState.selected.add(item));
}

// ══════════════════════════════════════════════════════════════════════════
// ANALYTICS & STATISTICS
// ══════════════════════════════════════════════════════════════════════════

export function calculateCollectionStats(collectionData, setList) {
  const importedSets = setList.filter(s => s.imported);
  
  if (importedSets.length === 0) {
    return {
      totalSets: 0,
      completedSets: 0,
      partialSets: 0,
      totalCards: 0,
      collectedCards: 0,
      percentComplete: 0,
      averagePercentPerSet: 0,
      rareCards: 0,
      holographics: 0
    };
  }

  let totalCards = 0;
  let collectedCards = 0;
  let completedCount = 0;
  let partialCount = 0;
  let holoCount = 0;

  const setStats = importedSets.map(set => {
    const setCollection = collectionData[set.setName] || {};
    const total = set.totalCards || 1;
    const collected = Object.values(setCollection).filter(c => c).length;
    const holos = Object.values(setCollection).filter(c => c && typeof c === 'object' && c.rh).length;
    
    totalCards += total;
    collectedCards += collected;
    holoCount += holos;
    
    if (collected >= total) completedCount++;
    else if (collected > 0) partialCount++;

    return {
      setId: set.setId,
      collected,
      total,
      percentage: (collected / total) * 100
    };
  });

  const averagePercentPerSet = setStats.length > 0
    ? setStats.reduce((sum, s) => sum + s.percentage, 0) / setStats.length
    : 0;

  return {
    totalSets: importedSets.length,
    completedSets: completedCount,
    partialSets: partialCount,
    notStartedSets: importedSets.length - completedCount - partialCount,
    totalCards,
    collectedCards,
    percentComplete: totalCards > 0 ? Math.round((collectedCards / totalCards) * 100) : 0,
    averagePercentPerSet: Math.round(averagePercentPerSet * 10) / 10,
    holographics: holoCount,
    setDetails: setStats
  };
}

// ══════════════════════════════════════════════════════════════════════════
// RECOMMENDATIONS ENGINE
// ══════════════════════════════════════════════════════════════════════════

export function generateSmartRecommendations(collectionData, setList, stats) {
  const recommendations = [];
  const favorites = getFavoritesList();

  // Find "almost complete" sets
  const almostComplete = stats.setDetails
    .filter(s => s.percentage >= 80 && s.percentage < 100)
    .sort((a, b) => b.percentage - a.percentage)
    .slice(0, 3);

  almostComplete.forEach(set => {
    const setInfo = setList.find(s => s.setId === set.setId);
    recommendations.push({
      type: 'almost-complete',
      priority: 'high',
      setId: set.setId,
      setName: setInfo?.setName || set.setId,
      message: `Nur noch ${set.total - set.collected} Karten bis Komplettierung!`,
      progress: set.percentage,
      icon: '🎯'
    });
  });

  // Recommend easy starter sets
  const easyStarters = setList
    .filter(s => s.imported && !favorites.includes(s.setId) && s.totalCards && s.totalCards <= 102)
    .slice(0, 2);

  easyStarters.forEach(set => {
    recommendations.push({
      type: 'easy-starter',
      priority: 'medium',
      setId: set.setId,
      setName: set.setName,
      message: `Kleiner Set perfekt zum Start (${set.totalCards} Karten)`,
      size: set.totalCards,
      icon: '⭐'
    });
  });

  // Recommend next unstarted set
  const unstarted = setList
    .filter(s => s.imported && !stats.setDetails.find(sd => sd.setId === s.setId))
    .slice(0, 1);

  unstarted.forEach(set => {
    recommendations.push({
      type: 'next-set',
      priority: 'low',
      setId: set.setId,
      setName: set.setName,
      message: `Nicht angefangen - bereit zum Starten?`,
      icon: '📦'
    });
  });

  return recommendations;
}
