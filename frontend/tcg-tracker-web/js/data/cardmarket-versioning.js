/**
 * cardmarket-versioning.js – zentrale Cardmarket-Cache-Invalidierung
 *
 * Verbindet den Build-Stamp-Check (`cardmarket-build-stamp.js`) mit den
 * In-Memory-Caches der Preissuche, damit die App nach einem täglichen
 * Cardmarket-Drop die neuen Kurse anzeigt, ohne dass der Nutzer erst
 * "App-Cache leeren" aufrufen muss.
 *
 * Aufrufer (z. B. der Bootstrap) erhalten eine Promise, die ohne
 * UI-Blocker läuft. Im Offline-Fall wird der bisherige Stand beibehalten.
 */

import { syncCardmarketBuildStamp } from './cardmarket-build-stamp.js?v=20260608-stats-live-progress-rh-fix';
import { resetCardmarketDataCaches } from './cardmarket-data.js?v=20260608-stats-live-progress-rh-fix';
import { resetCardmarketPriceCaches } from '../views/set-view-controller.js?v=20260608-stats-live-progress-rh-fix';

function safeInvoke(reset) {
  try {
    reset();
    return true;
  } catch (err) {
    console.warn('[cardmarket-versioning] reset failed', err);
    return false;
  }
}

/**
 * Setzt alle Cardmarket-relevanten In-Memory-Caches zurück. Eine Liste
 * der zurückgesetzten Subsysteme wird für Diagnose/Telemetry zurückgegeben.
 */
export function resetAllCardmarketCaches() {
  const reset = [];
  if (safeInvoke(resetCardmarketDataCaches)) reset.push('cardmarket-data');
  if (safeInvoke(resetCardmarketPriceCaches)) reset.push('set-view-price-cache');
  return { reset };
}

/**
 * Convenience-Hook: prüft den Build-Stamp und invalidiert bei einer
 * Versionsänderung automatisch die Caches. Fire-and-forget – blockiert
 * den Bootstrap nicht.
 *
 * @param {object} [options]
 * @param {Function} [options.fetchImpl]  Test-Hook
 * @param {Storage}   [options.storageRef]  Test-Hook
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{ changed: boolean, reason: string, previousStamp: string, currentStamp: string, reset: string[] }>}
 */
export async function applyCardmarketBuildStampCheck(options = {}) {
  const evaluation = await syncCardmarketBuildStamp(options);
  const { changed, currentStamp, previousStamp, reason } = evaluation;

  let reset = [];
  if (changed) {
    const result = resetAllCardmarketCaches();
    reset = result.reset;
  }

  return { changed, reason, previousStamp, currentStamp, reset };
}
