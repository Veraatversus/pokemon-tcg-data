/**
 * cardmarket-build-stamp.js – Cardmarket-Data-Versionserkennung
 *
 * Die statischen Cardmarket-Artefakte werden täglich vom
 * `Build Cardmarket Data`-Workflow neu erzeugt (siehe
 * .github/workflows/build-cardmarket-data.yml). `cardmarket/meta.json`
 * enthält dazu den Zeitstempel `generatedAt`.
 *
 * Beim App-Start vergleichen wir diesen Zeitstempel mit dem letzten
 * bekannten, in `localStorage` abgelegten Wert. Weicht er ab, gilt der
 * tägliche Preis-Drop als neu und alle In-Memory-Caches, die Preise oder
 * Set-Payloads halten, müssen verworfen werden, damit der Nutzer die
 * aktuellen Kurse sofort sieht – ohne manuelles "Cache löschen".
 *
 * Schlägt der `meta.json`-Fetch fehl (z. B. offline), wird der bisherige
 * Stand beibehalten und beim nächsten Start erneut versucht.
 */

import { CONFIG, scopedStorageKey } from '../core/config.js?v=20260608-stats-live-progress-rh-fix';

const BUILD_STAMP_STORAGE_KEY = scopedStorageKey('cardmarket-build-stamp');

function getCardmarketMetaUrl() {
  const base = String(CONFIG?.APIS?.VERA_BASE || '').replace(/\/$/, '');
  return `${base}/cardmarket/meta.json`;
}

function readStoredStamp(storageRef) {
  try {
    return storageRef.getItem(BUILD_STAMP_STORAGE_KEY) || '';
  } catch (err) {
    console.warn('[cardmarket-build-stamp] read failed', err);
    return '';
  }
}

function writeStoredStamp(storageRef, stamp) {
  try {
    if (stamp) storageRef.setItem(BUILD_STAMP_STORAGE_KEY, stamp);
    else storageRef.removeItem(BUILD_STAMP_STORAGE_KEY);
  } catch (err) {
    console.warn('[cardmarket-build-stamp] write failed', err);
  }
}

/**
 * Parst das `meta.json`-Payload und gibt den relevanten `generatedAt`-Wert
 * zurück. Defensive gegen Schema-Änderungen: fehlt das Feld, ist das
 * Ergebnis `''` und damit "kein verwertbarer Stamp".
 */
export function extractCardmarketBuildStamp(meta = {}) {
  if (!meta || typeof meta !== 'object') return '';
  return String(meta.generatedAt || meta.singlesSourceCreatedAt || '').trim();
}

/**
 * Fragt `cardmarket/meta.json` per `fetch` ab. Liefert den `generatedAt`-
 * String oder `null` bei Netzwerk-/Parse-Fehlern. Eine explizite
 * `signal`-Option erlaubt Aufrufern, den Vorgang abzubrechen.
 */
export async function fetchCardmarketBuildStamp({ fetchImpl = globalThis.fetch, signal } = {}) {
  if (typeof fetchImpl !== 'function') return null;
  const url = getCardmarketMetaUrl();
  if (!url || url === '/cardmarket/meta.json') return null;

  try {
    const response = await fetchImpl(url, { signal, cache: 'no-store' });
    if (!response || !response.ok) return null;
    const meta = await response.json();
    return extractCardmarketBuildStamp(meta) || null;
  } catch (err) {
    if (err?.name === 'AbortError') return null;
    console.warn('[cardmarket-build-stamp] fetch failed', err);
    return null;
  }
}

/**
 * Vergleicht `currentStamp` mit dem in `localStorage` abgelegten Wert.
 *
 * @returns {{
 *   changed: boolean,
 *   previousStamp: string,
 *   currentStamp: string,
 *   reason: 'first-sync' | 'unchanged' | 'updated' | 'rolled-back' | 'invalid',
 * }}
 */
export function evaluateCardmarketBuildStamp({
  currentStamp,
  storageRef = (typeof localStorage !== 'undefined' ? localStorage : null),
} = {}) {
  const previousStamp = readStoredStamp(storageRef) || '';

  if (!currentStamp) {
    return { changed: false, previousStamp, currentStamp: '', reason: 'invalid' };
  }

  if (!previousStamp) {
    return { changed: false, previousStamp: '', currentStamp, reason: 'first-sync' };
  }

  if (currentStamp === previousStamp) {
    return { changed: false, previousStamp, currentStamp, reason: 'unchanged' };
  }

  // Tagesvergleich reicht: Cardmarket-Refresh erfolgt maximal 1× pro Tag.
  const isNewer = Date.parse(currentStamp) > Date.parse(previousStamp);
  return {
    changed: isNewer,
    previousStamp,
    currentStamp,
    reason: isNewer ? 'updated' : 'rolled-back',
  };
}

/**
 * Persistiert den aktuellen Build-Stamp. Wird nach erfolgreichem Sync
 * aufgerufen, damit der nächste Start die Daten nicht erneut invalidieren
 * muss.
 */
export function persistCardmarketBuildStamp({
  currentStamp,
  storageRef = (typeof localStorage !== 'undefined' ? localStorage : null),
} = {}) {
  if (!currentStamp) return;
  writeStoredStamp(storageRef, currentStamp);
}

/**
 * Convenience-Helfer: lädt den Stamp, vergleicht ihn, schreibt ihn
 * zurück und liefert die Bewertung. `signal`/`fetchImpl` werden
 * durchgereicht, damit Tests und Aufrufer die Implementierung steuern
 * können.
 */
export async function syncCardmarketBuildStamp({
  fetchImpl,
  signal,
  storageRef,
} = {}) {
  const currentStamp = await fetchCardmarketBuildStamp({ fetchImpl, signal });
  if (!currentStamp) {
    return {
      changed: false,
      previousStamp: readStoredStamp(storageRef),
      currentStamp: '',
      reason: 'invalid',
    };
  }

  const evaluation = evaluateCardmarketBuildStamp({ currentStamp, storageRef });
  if (evaluation.reason === 'first-sync' || evaluation.reason === 'updated' || evaluation.reason === 'rolled-back') {
    persistCardmarketBuildStamp({ currentStamp, storageRef });
  }
  return evaluation;
}
