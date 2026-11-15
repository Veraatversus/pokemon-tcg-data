// Sammlungs-Maps je Set fuer Suchergebnisse und die Such-Lightbox.
// Cache-Schluessel `db_<setId>` (derselbe wie in loadCurrentSet).

/**
 * Liest die Sammlungs-Map eines Sets; nur eine erfolgreiche Lesung kommt in den Cache.
 * Ein Lesefehler wird nicht als leere Map gecacht, sonst wuerde die Sammlung bis zum Ablauf
 * der TTL leer erscheinen und ein Haken koennte eine zweite Zeile neben der echten anlegen.
 *
 * @param {{ setId: string, setName: string }} set
 * @param {{ cache: { has: Function, get: Function, set: Function }, read: Function, ttlMs: number, onError?: Function }} deps
 * @returns {Promise<Map|null>} Map bei Erfolg oder aus dem Cache, null bei Lesefehler
 */
export async function readCollectionMapCached(set, { cache, read, ttlMs, onError } = {}) {
  const key = `db_${set?.setId}`;
  if (cache.has(key)) return cache.get(key);
  try {
    const map = await read(set.setName, { setId: set.setId });
    const safeMap = map instanceof Map ? map : new Map();
    cache.set(key, safeMap, ttlMs);
    return safeMap;
  } catch (err) {
    onError?.(err);
    return null;
  }
}
