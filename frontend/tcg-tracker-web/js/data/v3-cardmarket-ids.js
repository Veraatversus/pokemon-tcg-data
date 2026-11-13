// Cardmarket-IDs aus api/v3 fuer Records, die nicht aus api/v3 stammen (db_cards-Offline-Zeilen, Statistik).
//  - Karten: api/v3/search-index.json, Feld `cm` (primaere ID, Regel wie primaryCardmarketProductId in v3-records.js); der Index wird ohnehin fuer die Suche
//    geladen (einmal je Session, SW-Cache) - keine Kartendatei je Set noetig.
//  - Sets: api/v3/sets.json ids.cardmarket = Cardmarket-expansionId (vor tracker.json / Abstimmung).
// Fehler (offline, kein Index) liefern leere Tabellen: Aufrufer fallen dann auf ihren bisherigen Weg zurueck.
import { loadV3SearchIndex, loadV3Sets } from './v3-api.js';
import { attachV3CardmarketIds, normalizeCardmarketProductId, v3CardmarketKeys } from './cardmarket-url-utils.js';

const idMapByIndex = new WeakMap();
const expansionMapBySets = new WeakMap();

/** Map v3CardmarketKeys(setId, cardId) -> Produkt-ID (String) aus Indexeintraegen mit `cm`. */
export function buildV3CardmarketIdMap(index = []) {
  if (Array.isArray(index) && idMapByIndex.has(index)) return idMapByIndex.get(index);
  const map = new Map();
  for (const entry of Array.isArray(index) ? index : []) {
    const productId = normalizeCardmarketProductId(entry?.cm);
    if (!productId) continue;
    for (const key of v3CardmarketKeys(entry?.setId, entry?.cardId)) map.set(key, productId);
  }
  if (Array.isArray(index)) idMapByIndex.set(index, map);
  return map;
}

export const V3_ID_MAP_TIMEOUT_MS = 10_000;
export const V3_ID_MAP_NEGATIVE_CACHE_MS = 60_000;

// Fehlgeschlagene Index-Ladevorgaenge je Loader: bis zu diesem Zeitpunkt wird nicht erneut geladen
// (Statistik liest db_cards fuer viele Sets nacheinander - offline soll das nicht je Set warten).
const failedUntilByLoader = new WeakMap();

export function resetV3CardmarketIdCache() {
  failedUntilByLoader.delete(loadV3SearchIndex);
}

function withTimeout(promise, ms) {
  if (!(ms > 0)) return promise;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`search-index.json: keine Antwort nach ${ms} ms`);
      error.name = 'TimeoutError';
      reject(error);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * v3-ID-Tabelle aus dem Suchindex. Fehler oder Zeitueberschreitung (timeoutMs) -> leere Map, und fuer
 * negativeCacheMs wird der Loader nicht erneut aufgerufen. Abbruch (AbortError) wird weitergereicht.
 */
export async function getV3CardmarketIdMap({
  loadIndex = loadV3SearchIndex,
  signal,
  timeoutMs = V3_ID_MAP_TIMEOUT_MS,
  negativeCacheMs = V3_ID_MAP_NEGATIVE_CACHE_MS,
  now = Date.now,
} = {}) {
  if ((failedUntilByLoader.get(loadIndex) || 0) > now()) return new Map();
  try {
    return buildV3CardmarketIdMap(await withTimeout(Promise.resolve().then(() => loadIndex({ signal })), timeoutMs));
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    if (negativeCacheMs > 0) failedUntilByLoader.set(loadIndex, now() + negativeCacheMs);
    return new Map();
  }
}

/** Laedt die v3-ID-Tabelle und haengt die IDs an (attachV3CardmarketIds); ohne Tabelle unveraendert. */
export async function withV3CardmarketIds(records = [], { setId = '', language = 'de', loadIndex, signal } = {}) {
  if (!Array.isArray(records) || records.length === 0) return records;
  const idMap = await getV3CardmarketIdMap({ ...(loadIndex ? { loadIndex } : {}), signal });
  return attachV3CardmarketIds(records, idMap, { setId, language });
}

const firstId = (value) => normalizeCardmarketProductId(Array.isArray(value) ? value[0] : value);

/** Map setId/Alias (klein) -> Cardmarket-expansionId (String) aus api/v3/sets.json. */
export function buildV3ExpansionIdMap(sets = []) {
  if (Array.isArray(sets) && expansionMapBySets.has(sets)) return expansionMapBySets.get(sets);
  const map = new Map();
  for (const set of Array.isArray(sets) ? sets : []) {
    const expansionId = firstId(set?.ids?.cardmarket);
    if (!expansionId || !set?.id) continue;
    map.set(String(set.id).trim().toLowerCase(), expansionId);
    for (const alias of Array.isArray(set.aliases) ? set.aliases : []) {
      const key = String(alias || '').trim().toLowerCase();
      if (key && !map.has(key)) map.set(key, expansionId);
    }
  }
  if (Array.isArray(sets)) expansionMapBySets.set(sets, map);
  return map;
}

/** Cardmarket-expansionId eines Sets laut api/v3 ('' wenn unbekannt oder api/v3 nicht erreichbar). */
export async function getV3CardmarketExpansionId(setId, { loadSets = loadV3Sets, signal } = {}) {
  const key = String(setId || '').trim().toLowerCase();
  if (!key) return '';
  try {
    return buildV3ExpansionIdMap(await loadSets({ signal })).get(key) || '';
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    return '';
  }
}
