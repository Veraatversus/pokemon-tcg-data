/**
 * cache.js – In-Memory TTL-Cache für tcg-tracker-web
 *
 * Kein localStorage — rein im RAM. Überlebt keinen Page-Reload,
 * entlastet aber innerhalb einer Session teure API-Requests.
 */

const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 Minuten

/** @type {Map<string, {value: *, expiresAt: number}>} */
const store = new Map();

/** Laufendes Cleanup-Interval-Handle */
let cleanupInterval = null;

/**
 * Startet das automatische Cleanup-Interval (alle 5 Minuten).
 * Wird beim ersten `set()`-Aufruf gestartet, sofern noch nicht aktiv.
 */
function ensureCleanup() {
  if (cleanupInterval !== null) return;
  cleanupInterval = setInterval(() => clearExpired(), 5 * 60 * 1000);
}

/**
 * Speichert einen Wert unter dem gegebenen Schlüssel.
 * @param {string} key
 * @param {*} value
 * @param {number} [ttlMs]  Ablaufzeit in ms (Standard: 10 Minuten)
 */
export function set(key, value, ttlMs = DEFAULT_TTL_MS) {
  ensureCleanup();
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/**
 * Gibt den gecachten Wert zurück, oder `undefined` wenn abgelaufen/nicht vorhanden.
 * @param {string} key
 * @returns {*|undefined}
 */
export function get(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

/**
 * Prüft ob ein gültiger (nicht abgelaufener) Eintrag vorhanden ist.
 * @param {string} key
 * @returns {boolean}
 */
export function has(key) {
  return get(key) !== undefined;
}

/**
 * Entfernt einen Eintrag aus dem Cache.
 * @param {string} key
 */
export function del(key) {
  store.delete(key);
}

/**
 * Entfernt alle abgelaufenen Einträge. Wird automatisch periodisch aufgerufen.
 */
export function clearExpired() {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.expiresAt) store.delete(key);
  }
}

/**
 * Leert den gesamten Cache.
 */
export function clear() {
  store.clear();
}
