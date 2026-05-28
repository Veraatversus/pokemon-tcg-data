// ══════════════════════════════════════════════════════════════════════════
// COLLECTION SHARING, WISHLISTS & SOCIAL FEATURES
// ══════════════════════════════════════════════════════════════════════════

import { scopedStorageKey, scopedStoragePrefix } from './core/config.js';

const STORAGE_KEYS = {
  wishlists: scopedStorageKey('wishlists'),
  trading_log: scopedStorageKey('trading-log'),
  achievements: scopedStorageKey('achievements'),
  backup_schedule: scopedStorageKey('backup-schedule'),
  collection_shares: scopedStorageKey('collection-shares')
};

const SET_RATING_PREFIX = scopedStoragePrefix('set-rating-');

// ══════════════════════════════════════════════════════════════════════════
// WISHLIST MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════

export function loadWishlists() {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.wishlists);
    return data ? JSON.parse(data) : {};
  } catch (err) {
    console.warn('Failed to load wishlists:', err);
    return {};
  }
}

export function createWishlist(name) {
  const wishlists = loadWishlists();
  const id = Date.now().toString();
  
  wishlists[id] = {
    id,
    name,
    created: new Date().toISOString(),
    items: [],
    priority: 'medium' // low, medium, high
  };
  
  saveWishlists(wishlists);
  return wishlists[id];
}

export function addToWishlist(wishlistId, setId, priority = 'medium') {
  const wishlists = loadWishlists();
  if (!wishlists[wishlistId]) return false;
  
  const item = {
    setId,
    addedAt: new Date().toISOString(),
    priority,
    notes: ''
  };
  
  wishlists[wishlistId].items.push(item);
  saveWishlists(wishlists);
  return true;
}

export function removeFromWishlist(wishlistId, setId) {
  const wishlists = loadWishlists();
  if (!wishlists[wishlistId]) return false;
  
  wishlists[wishlistId].items = wishlists[wishlistId].items.filter(
    item => item.setId !== setId
  );
  
  saveWishlists(wishlists);
  return true;
}

export function deleteWishlist(wishlistId) {
  const wishlists = loadWishlists();
  delete wishlists[wishlistId];
  saveWishlists(wishlists);
  return true;
}

export function getWishlistsCount() {
  return Object.keys(loadWishlists()).length;
}

function saveWishlists(wishlists) {
  try {
    localStorage.setItem(STORAGE_KEYS.wishlists, JSON.stringify(wishlists));
    return true;
  } catch (err) {
    console.warn('Failed to save wishlists:', err);
    return false;
  }
}

// ══════════════════════════════════════════════════════════════════════════
// COLLECTION SHARING (via URL with encoded data)
// ══════════════════════════════════════════════════════════════════════════

export function generateShareableCollectionUrl(collectionData, setList) {
  try {
    // Create a summary of the collection
    const summary = {
      version: 1,
      exported: new Date().toISOString(),
      sets: setList
        .filter(s => s.imported)
        .map(s => ({
          id: s.setId,
          name: s.setName,
          series: s.series,
          collected: (collectionData[s.setName] || {})
            ? Object.values(collectionData[s.setName]).filter(c => c).length
            : 0,
          total: s.totalCards || 0
        }))
    };

    // Compress to base64 URL-safe format
    const json = JSON.stringify(summary);
    const compressed = btoa(json);
    const urlSafeCompressed = compressed
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    const baseUrl = window.location.origin + window.location.pathname;
    return `${baseUrl}?share=${urlSafeCompressed}`;
  } catch (err) {
    console.error('Failed to generate share URL:', err);
    return null;
  }
}

export function parseSharedCollection(shareData) {
  try {
    // Restore URL-safe base64
    let base64 = shareData
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    // Add padding if needed
    while (base64.length % 4) {
      base64 += '=';
    }

    const json = atob(base64);
    return JSON.parse(json);
  } catch (err) {
    console.error('Failed to parse shared collection:', err);
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════════════
// TRADING LOG & HISTORY
// ══════════════════════════════════════════════════════════════════════════

export function addTradeLog(type, setId, cardNumber, notes = '') {
  try {
    const log = localStorage.getItem(STORAGE_KEYS.trading_log);
    const trades = log ? JSON.parse(log) : [];

    trades.push({
      id: Date.now(),
      type, // 'add', 'remove', 'trade', 'upgrade'
      setId,
      cardNumber,
      timestamp: new Date().toISOString(),
      notes
    });

    localStorage.setItem(STORAGE_KEYS.trading_log, JSON.stringify(trades));
    return true;
  } catch (err) {
    console.warn('Failed to add trade log:', err);
    return false;
  }
}

export function getTradingLog(limit = 50) {
  try {
    const log = localStorage.getItem(STORAGE_KEYS.trading_log);
    const trades = log ? JSON.parse(log) : [];
    return trades.slice(0, limit).reverse();
  } catch (err) {
    console.warn('Failed to get trading log:', err);
    return [];
  }
}

export function getTradingStats() {
  try {
    const log = localStorage.getItem(STORAGE_KEYS.trading_log);
    const trades = log ? JSON.parse(log) : [];

    const stats = {
      total: trades.length,
      byType: {
        add: 0,
        remove: 0,
        trade: 0,
        upgrade: 0
      },
      lastUpdate: trades.length > 0 ? trades[trades.length - 1].timestamp : null
    };

    trades.forEach(t => {
      if (stats.byType[t.type] !== undefined) {
        stats.byType[t.type]++;
      }
    });

    return stats;
  } catch (err) {
    console.warn('Failed to get trading stats:', err);
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════════════
// BATCH BACKUP SCHEDULING
// ══════════════════════════════════════════════════════════════════════════

export function scheduleBackup(frequency = 'weekly') {
  try {
    const schedule = {
      frequency, // daily, weekly, monthly
      lastBackup: new Date().toISOString(),
      nextBackup: calculateNextBackupDate(frequency),
      enabled: true,
      autoDelete: true,
      maxBackups: 10
    };

    localStorage.setItem(STORAGE_KEYS.backup_schedule, JSON.stringify(schedule));
    return schedule;
  } catch (err) {
    console.warn('Failed to schedule backup:', err);
    return null;
  }
}

function calculateNextBackupDate(frequency) {
  const now = new Date();
  const next = new Date(now);

  if (frequency === 'daily') {
    next.setDate(next.getDate() + 1);
  } else if (frequency === 'weekly') {
    next.setDate(next.getDate() + 7);
  } else if (frequency === 'monthly') {
    next.setMonth(next.getMonth() + 1);
  }

  return next.toISOString();
}

export function getBackupSchedule() {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.backup_schedule);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    console.warn('Failed to get backup schedule:', err);
    return null;
  }
}

export function updateBackupSchedule(updates) {
  try {
    const schedule = getBackupSchedule() || {};
    const updated = { ...schedule, ...updates };
    localStorage.setItem(STORAGE_KEYS.backup_schedule, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.warn('Failed to update backup schedule:', err);
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ACHIEVEMENTS & BADGES
// ══════════════════════════════════════════════════════════════════════════

export const ACHIEVEMENTS = {
  FIRST_IMPORT: {
    id: 'first_import',
    name: 'Anfänger',
    description: 'Importiere dein erstes Set',
    icon: '🎯',
    condition: (stats) => stats.totalSets >= 1
  },
  COLLECTION_COMPLETE: {
    id: 'collection_complete',
    name: 'Sammler',
    description: 'Vervollständige einen ganzen Set',
    icon: '✅',
    condition: (stats) => stats.completedSets >= 1
  },
  COLLECTION_25: {
    id: 'collection_25',
    name: '25% Club',
    description: 'Erreiche 25% Gesamtfortschritt',
    icon: '🥉',
    condition: (stats) => stats.percentComplete >= 25
  },
  COLLECTION_50: {
    id: 'collection_50',
    name: '50% Club',
    description: 'Erreiche 50% Gesamtfortschritt',
    icon: '🥈',
    condition: (stats) => stats.percentComplete >= 50
  },
  COLLECTION_75: {
    id: 'collection_75',
    name: '75% Club',
    description: 'Erreiche 75% Gesamtfortschritt',
    icon: '🥇',
    condition: (stats) => stats.percentComplete >= 75
  },
  COLLECTION_MASTER: {
    id: 'collection_master',
    name: 'Master Collector',
    description: 'Erreiche 100% Gesamtfortschritt',
    icon: '👑',
    condition: (stats) => stats.percentComplete >= 100
  },
  COLLECTION_MILESTONE: {
    id: 'collection_milestone',
    name: 'Meilenstein',
    description: 'Importiere 10 Sets',
    icon: '🎪',
    condition: (stats) => stats.totalSets >= 10
  },
  HOLO_COLLECTOR: {
    id: 'holo_collector',
    name: 'Holografisch Fan',
    description: 'Sammle 50 holografische Karten',
    icon: '✨',
    condition: (stats) => stats.holographics >= 50
  },
  SPEED_COLLECTOR: {
    id: 'speed_collector',
    name: 'Schnelle Finger',
    description: 'Markiere 100 Karten an einem Tag',
    icon: '⚡',
    condition: () => false // Track separately
  }
};

export function unlockAchievement(achievementId) {
  try {
    const achievements = localStorage.getItem(STORAGE_KEYS.achievements);
    const unlocked = achievements ? JSON.parse(achievements) : {};

    if (!unlocked[achievementId]) {
      unlocked[achievementId] = {
        id: achievementId,
        unlockedAt: new Date().toISOString()
      };
      localStorage.setItem(STORAGE_KEYS.achievements, JSON.stringify(unlocked));
      return true;
    }
    return false;
  } catch (err) {
    console.warn('Failed to unlock achievement:', err);
    return false;
  }
}

export function getUnlockedAchievements() {
  try {
    const achievements = localStorage.getItem(STORAGE_KEYS.achievements);
    return achievements ? JSON.parse(achievements) : {};
  } catch (err) {
    console.warn('Failed to get achievements:', err);
    return {};
  }
}

export function checkAchievementsProgress(stats) {
  const unlocked = getUnlockedAchievements();
  const newAchievements = [];

  Object.values(ACHIEVEMENTS).forEach((achievement) => {
    if (!unlocked[achievement.id] && achievement.condition(stats)) {
      if (unlockAchievement(achievement.id)) {
        newAchievements.push(achievement);
      }
    }
  });

  return newAchievements;
}

// ══════════════════════════════════════════════════════════════════════════
// CSV EXPORT/IMPORT
// ══════════════════════════════════════════════════════════════════════════

export function exportCollectionAsCSV(collectionData, setList) {
  try {
    let csv = 'Set ID,Set Name,Series,Card Number,Have G,Have RH\n';

    setList.forEach((set) => {
      const collection = collectionData[set.setName] || {};

      Object.entries(collection).forEach(([cardNum, hasCard]) => {
        if (hasCard) {
          const hasG = typeof hasCard === 'object' ? (hasCard.g ? 'Yes' : 'No') : 'Yes';
          const hasRH = typeof hasCard === 'object' ? (hasCard.rh ? 'Yes' : 'No') : 'No';

          csv += `"${set.setId}","${set.setName}","${set.series || ''}","${cardNum}","${hasG}","${hasRH}"\n`;
        }
      });
    });

    return csv;
  } catch (err) {
    console.error('Failed to export CSV:', err);
    return null;
  }
}

export function importCollectionFromCSV(csvContent) {
  try {
    const lines = csvContent.split('\n').filter(line => line.trim());
    if (lines.length < 2) return null;

    const header = lines[0].split(',');
    const imported = {};

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      if (values.length < 6) continue;

      const [setId, setName, series, cardNum, hasG, hasRH] = values;

      if (!imported[setName]) {
        imported[setName] = {};
      }

      imported[setName][cardNum] = {
        g: hasG === 'Yes',
        rh: hasRH === 'Yes'
      };
    }

    return imported;
  } catch (err) {
    console.error('Failed to import CSV:', err);
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════════════
// GESTURE CONTROLS
// ══════════════════════════════════════════════════════════════════════════

export class GestureController {
  constructor(element) {
    this.element = element;
    this.touchStartX = 0;
    this.touchStartY = 0;
    this.listeners = {
      swipeleft: [],
      swiperight: [],
      swipeup: [],
      swipedown: [],
      doubletap: []
    };

    this.init();
  }

  init() {
    this.element.addEventListener('touchstart', this.handleTouchStart.bind(this));
    this.element.addEventListener('touchmove', this.handleTouchMove.bind(this));
    this.element.addEventListener('touchend', this.handleTouchEnd.bind(this));
  }

  handleTouchStart(e) {
    this.touchStartX = e.changedTouches[0].screenX;
    this.touchStartY = e.changedTouches[0].screenY;
  }

  handleTouchMove(e) {
    // Could add swipe-in-progress feedback here
  }

  handleTouchEnd(e) {
    const touchEndX = e.changedTouches[0].screenX;
    const touchEndY = e.changedTouches[0].screenY;

    const deltaX = touchEndX - this.touchStartX;
    const deltaY = touchEndY - this.touchStartY;

    const threshold = 50;

    if (Math.abs(deltaX) > threshold && Math.abs(deltaX) > Math.abs(deltaY)) {
      if (deltaX > 0) {
        this.emit('swiperight', { deltaX, deltaY });
      } else {
        this.emit('swipeleft', { deltaX, deltaY });
      }
    } else if (Math.abs(deltaY) > threshold && Math.abs(deltaY) > Math.abs(deltaX)) {
      if (deltaY > 0) {
        this.emit('swipedown', { deltaX, deltaY });
      } else {
        this.emit('swipeup', { deltaX, deltaY });
      }
    }
  }

  on(gesture, callback) {
    if (this.listeners[gesture]) {
      this.listeners[gesture].push(callback);
    }
  }

  emit(gesture, data) {
    if (this.listeners[gesture]) {
      this.listeners[gesture].forEach(cb => cb(data));
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════
// SET RATINGS & REVIEWS
// ══════════════════════════════════════════════════════════════════════════

export function rateSet(setId, rating, review = '') {
  try {
    const key = `${SET_RATING_PREFIX}${setId}`;
    const ratingData = {
      setId,
      rating: Math.min(5, Math.max(1, rating)),
      review: review.substring(0, 500),
      ratedAt: new Date().toISOString()
    };

    localStorage.setItem(key, JSON.stringify(ratingData));
    return ratingData;
  } catch (err) {
    console.warn('Failed to save rating:', err);
    return null;
  }
}

export function getSetRating(setId) {
  try {
    const key = `${SET_RATING_PREFIX}${setId}`;
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    console.warn('Failed to get rating:', err);
    return null;
  }
}

export function getAllRatings() {
  try {
    const ratings = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(SET_RATING_PREFIX)) {
        ratings.push(JSON.parse(localStorage.getItem(key)));
      }
    }
    return ratings;
  } catch (err) {
    console.warn('Failed to get all ratings:', err);
    return [];
  }
}
