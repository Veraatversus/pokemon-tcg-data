/**
 * ╔══════════════════════════════════════════════════════════════════════════
 * ║ SMART ENGINE – Automatische Daten-Heilung, Offline-Mode, Intelligenz
 * ║ Orchestriert das gesamte Sync/Cache-System mit Auto-Recovery
 * ╚══════════════════════════════════════════════════════════════════════════
 */

import { STORAGE_SCOPE } from '../../core/config.js';

const DB_NAME = `poke-tcg-offline-${STORAGE_SCOPE}`;
const DB_VERSION = 1;
const STORES = {
  sets: 'sets',
  cards: 'cards',
  collection: 'collection',
  metadata: 'metadata'
};

let dbInstance = null;
const engineMetrics = {
  cacheHits: 0,
  cacheMisses: 0,
  offlineRequests: 0,
  healedMismatches: 0,
  lastSyncTime: null,
  isOnline: navigator.onLine,
  syncQueue: []
};

/** Initializes IndexedDB for offline-first support */
async function initOfflineDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      for (const storeName of Object.values(STORES)) {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: 'id' });
        }
      }
    };
  });
}

/** Caches a set of cards with metadata */
async function cacheCardsOffline(setId, cards, metadata = {}) {
  if (!dbInstance) return;
  const tx = dbInstance.transaction([STORES.cards, STORES.metadata], 'readwrite');
  const cardsStore = tx.objectStore(STORES.cards);
  const metaStore = tx.objectStore(STORES.metadata);

  cards.forEach((card) => {
    cardsStore.put({ id: `${setId}__${card.number}`, setId, ...card });
  });

  metaStore.put({
    id: `cards_${setId}`,
    setId,
    cardCount: cards.length,
    cachedAt: new Date().toISOString(),
    hash: simpleHash(JSON.stringify(cards)),
    ...metadata
  });

  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = reject;
  });
}

/** Retrieves cached cards if offline or as fallback */
async function getCachedCardsOffline(setId) {
  if (!dbInstance) return null;
  const tx = dbInstance.transaction(STORES.cards, 'readonly');
  const store = tx.objectStore(STORES.cards);
  const index = store.index ? store.getAll() : null;

  return new Promise((resolve) => {
    const request = store.getAll();
    request.onsuccess = () => {
      const results = request.result.filter((card) => card.setId === setId);
      if (results.length) {
        engineMetrics.cacheHits++;
        resolve(results);
      } else {
        engineMetrics.cacheMisses++;
        resolve(null);
      }
    };
    request.onerror = () => resolve(null);
  });
}

/** Simple hash for cache validation */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/** Monitors online/offline and queues sync operations */
function initSyncQueue() {
  window.addEventListener('online', () => {
    engineMetrics.isOnline = true;
    processSyncQueue();
  });

  window.addEventListener('offline', () => {
    engineMetrics.isOnline = false;
  });
}

/** Processes queued sync operations when online */
async function processSyncQueue() {
  if (!engineMetrics.isOnline || !engineMetrics.syncQueue.length) return;
  const queue = [...engineMetrics.syncQueue];
  engineMetrics.syncQueue = [];

  for (const operation of queue) {
    try {
      await operation.fn(...operation.args);
    } catch (err) {
      console.warn('[SyncQueue] Operation failed, re-queueing:', err);
      engineMetrics.syncQueue.push(operation);
    }
  }
}

/** Auto-healing: Detects and fixes data mismatches in background */
export async function startAutoHealing(apiCollectionMap, sheetCollectionMap) {
  const mismatches = [];
  const fixes = [];

  for (const [cardId, apiData] of apiCollectionMap.entries()) {
    const sheetData = sheetCollectionMap.get(cardId);
    if (!sheetData) {
      mismatches.push({ cardId, type: 'missing-in-sheet', apiData });
      fixes.push({ cardId, action: 'add-to-sheet', data: apiData });
    } else if (JSON.stringify(apiData) !== JSON.stringify(sheetData)) {
      mismatches.push({ cardId, type: 'mismatch', apiData, sheetData });
      fixes.push({ cardId, action: 'sync-from-api', data: apiData });
    }
  }

  engineMetrics.healedMismatches += fixes.length;
  return { mismatches, autoFixCount: fixes.length, shouldApplyFixes: fixes.length > 0 };
}

/** Fuzzy search for sets and cards */
export function fuzzySearch(query, haystack, fields = ['name', 'setName']) {
  const normalizeForSearch = (str) => String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const queryNorm = normalizeForSearch(query);
  const threshold = 0.6;

  return haystack
    .map((item) => {
      const searchableText = fields.map((field) => normalizeForSearch(item[field])).join(' ');
      const similarity = calculateSimilarity(queryNorm, searchableText);
      return { item, similarity };
    })
    .filter((result) => result.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .map((result) => result.item);
}

/** Levenshtein-based similarity for fuzzy matching */
function calculateSimilarity(a, b) {
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  if (longer.length === 0) return 1;
  const editDistance = computeLevenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function computeLevenshteinDistance(a, b) {
  const costs = [[]];
  for (let i = 0; i <= a.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= b.length; j++) {
      if (i === 0) {
        costs[0][j] = j;
      } else if (j > 0) {
        let newValue = costs[i - 1][j - 1];
        if (a.charAt(i - 1) !== b.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[i - 1][j]) + 1;
        }
        costs[i][j] = newValue;
        lastValue = newValue;
      }
    }
  }
  return costs[a.length][b.length];
}

/** Exports metrics dashboard data */
export function getEngineMetrics() {
  const cacheTotal = engineMetrics.cacheHits + engineMetrics.cacheMisses;
  const cacheHitRate = cacheTotal > 0 ? Math.round((engineMetrics.cacheHits / cacheTotal) * 100) : 0;
  return {
    ...engineMetrics,
    cacheHitRate,
    status: engineMetrics.isOnline ? 'online' : 'offline',
    performanceData: {
      cacheHits: engineMetrics.cacheHits,
      cacheMisses: engineMetrics.cacheMisses,
      cacheHitRate: `${cacheHitRate}%`,
      healedMismatches: engineMetrics.healedMismatches,
      queuedOperations: engineMetrics.syncQueue.length
    }
  };
}

/** Initialize engine on app start */
export async function initSmartEngine() {
  try {
    await initOfflineDb();
    initSyncQueue();
    return true;
  } catch (err) {
    console.warn('⚠️ Smart Engine partial init:', err);
    return false;
  }
}

export { cacheCardsOffline, getCachedCardsOffline, processSyncQueue };
