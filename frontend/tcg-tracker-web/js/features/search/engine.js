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
