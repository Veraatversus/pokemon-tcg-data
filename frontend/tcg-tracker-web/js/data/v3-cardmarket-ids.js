// Cardmarket-IDs und Kartenbilder aus api/v3 fuer Records, die nicht aus api/v3 stammen (db_cards-Offline-Zeilen, Statistik).
//  - Karten: api/v3/search-index.json, Feld `cm` (primaere ID, Regel wie primaryCardmarketProductId in v3-records.js) sowie
//    `img` (EN) / `imgDe` (DE) als kleines Kartenbild; der Index wird ohnehin fuer die Suche
//    geladen (einmal je Session, SW-Cache) - keine Kartendatei je Set noetig. api/v3 wird taeglich aktualisiert,
//    die db_cards-Zeile stammt vom Importzeitpunkt: Index-Bilder gewinnen, Sheet-Bilder bleiben Reserve.
//  - Sets: api/v3/sets.json ids.cardmarket = Cardmarket-expansionId (vor tracker.json / Abstimmung).
// Fehler (offline, kein Index) liefern leere Tabellen: Aufrufer fallen dann auf ihren bisherigen Weg zurueck.
import { loadV3SearchIndex, loadV3Sets } from './v3-api.js';
import { attachV3CardmarketIds, normalizeCardmarketProductId, v3CardmarketKeys } from './cardmarket-url-utils.js';

const idMapByIndex = new WeakMap();
const dataMapByIndex = new WeakMap();
const idMapByDataMap = new WeakMap();
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

const text = (value) => String(value ?? '').trim();

/**
 * Map v3CardmarketKeys(setId, cardId) -> { productId, img, imgDe } aus Indexeintraegen mit `cm`, `img` oder `imgDe`.
 * productId: String ('' ohne ID), img/imgDe: kleine Kartenbilder EN/DE ('' ohne Bild).
 */
export function buildV3CardDataMap(index = []) {
  if (Array.isArray(index) && dataMapByIndex.has(index)) return dataMapByIndex.get(index);
  const map = new Map();
  for (const entry of Array.isArray(index) ? index : []) {
    const data = { productId: normalizeCardmarketProductId(entry?.cm), img: text(entry?.img), imgDe: text(entry?.imgDe) };
    if (!data.productId && !data.img && !data.imgDe) continue;
    for (const key of v3CardmarketKeys(entry?.setId, entry?.cardId)) map.set(key, data);
  }
  if (Array.isArray(index)) dataMapByIndex.set(index, map);
  return map;
}

function idMapFromDataMap(dataMap) {
  if (idMapByDataMap.has(dataMap)) return idMapByDataMap.get(dataMap);
  const idMap = new Map();
  for (const [key, data] of dataMap) if (data?.productId) idMap.set(key, data.productId);
  idMapByDataMap.set(dataMap, idMap);
  return idMap;
}

// Lookup wie attachV3CardmarketIds (cardmarket-url-utils.js): v3-cardId, sonst <setId>::<collectionKey>
// (Record-setId vor setId). Bewusst lokal: ein neuer Export aus cardmarket-url-utils.js (unversioniert importiert)
// liesse dieses Modul mit einer gecachten alten Fassung nicht laden.
function lookupV3CardData(record = {}, dataMap, setId = '') {
  const lower = (value) => text(value).toLowerCase();
  const fullId = lower(record?.cardId);
  if (fullId && dataMap.has(`id:${fullId}`)) return dataMap.get(`id:${fullId}`);
  const key = lower(record?.collectionKey);
  if (!key) return null;
  for (const candidateSetId of [record?.setId, setId]) {
    const set = lower(candidateSetId);
    if (set && dataMap.has(`${set}::${key}`)) return dataMap.get(`${set}::${key}`);
  }
  return null;
}

/**
 * Grosses Bild nur fuer TCGdex-Assets (.../low.webp -> .../high.webp, wie rewriteTcgdexImageQuality in
 * schema-contract.js); andere URLs -> '' (das grosse Bild bleibt den bestehenden Fallbacks ueberlassen).
 */
export function tcgdexLargeImageUrl(smallUrl) {
  const url = text(smallUrl);
  if (!/^https?:\/\/assets\.tcgdex\.net\//i.test(url)) return '';
  const withExt = url.match(/\/low\.(png|jpe?g|webp)$/i);
  if (withExt) return url.replace(/\/low\.(png|jpe?g|webp)$/i, `/high.${withExt[1].toLowerCase()}`);
  if (/\/low$/i.test(url)) return url.replace(/\/low$/i, '/high');
  return '';
}

function withIndexImages(record, data, language) {
  const img = data?.img || '';
  const imgDe = data?.imgDe || '';
  if (!img && !imgDe) return record;
  const sized = (small) => {
    const large = tcgdexLargeImageUrl(small);
    return large ? { small, large } : { small };
  };
  const out = { ...record };
  if (img) {
    const images = record.images && typeof record.images === 'object' ? record.images : {};
    out.images = { ...images, ...sized(img) };
  }
  if (imgDe) {
    const i18nDe = record.i18n_de && typeof record.i18n_de === 'object' ? record.i18n_de : {};
    out.i18n_de = { ...i18nDe, images: { ...(i18nDe.images || {}), ...sized(imgDe) } };
  }
  // Anzeigefelder (resolveDisplayCard) in Kartensprache nachziehen; Sheet-Spalten (vera_*/tcgdex_*) bleiben unveraendert.
  const preferred = language === 'en' ? (img || imgDe) : (imgDe || img);
  const large = tcgdexLargeImageUrl(preferred) || text(record.imageLarge) || preferred;
  out.image = preferred;
  out.imageUrl = preferred;
  out.imageLarge = large;
  out.imageLargeUrl = large;
  return out;
}

/**
 * Haengt v3-Cardmarket-IDs (attachV3CardmarketIds; vorhandene v3-IDs bleiben) und Index-Bilder an Karten-Records:
 * images.small aus `img`, i18n_de.images.small aus `imgDe` (TCGdex-URLs zusaetzlich .large = high.webp).
 * imageCandidates (image-fallback.js) nimmt sie vor tcgdex_image_* / vera_images_* der Sheet-Zeile.
 * Records ohne Treffer kommen unveraendert (gleiche Referenz) zurueck; ohne Tabelle das Eingabe-Array.
 */
export function attachV3CardData(records = [], dataMap = null, { setId = '', language = 'de' } = {}) {
  if (!Array.isArray(records)) return [];
  if (!(dataMap instanceof Map) || dataMap.size === 0) return records;
  const withIds = attachV3CardmarketIds(records, idMapFromDataMap(dataMap), { setId, language });
  return withIds.map((record, i) => (
    record ? withIndexImages(record, lookupV3CardData(records[i], dataMap, setId), language) : record
  ));
}

export const V3_ID_MAP_TIMEOUT_MS = 20_000;
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
 * v3-ID-Tabelle aus dem Suchindex. Fehler oder Zeitueberschreitung (timeoutMs) -> leere Map.
 * Nur echte Fehler sperren den Loader fuer negativeCacheMs; nach einer Zeitueberschreitung laeuft der
 * Index-Load weiter (loadV3SearchIndex haelt ihn je Session), der naechste Aufruf wartet darauf.
 * Abbruch (AbortError) wird weitergereicht.
 */
async function loadGuardedIndex({
  loadIndex = loadV3SearchIndex,
  signal,
  timeoutMs = V3_ID_MAP_TIMEOUT_MS,
  negativeCacheMs = V3_ID_MAP_NEGATIVE_CACHE_MS,
  now = Date.now,
} = {}) {
  if ((failedUntilByLoader.get(loadIndex) || 0) > now()) return null;
  try {
    return await withTimeout(Promise.resolve().then(() => loadIndex({ signal })), timeoutMs);
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    if (error?.name !== 'TimeoutError' && negativeCacheMs > 0) failedUntilByLoader.set(loadIndex, now() + negativeCacheMs);
    return null;
  }
}

export async function getV3CardmarketIdMap(options = {}) {
  const index = await loadGuardedIndex(options);
  return index ? buildV3CardmarketIdMap(index) : new Map();
}

/** Wie getV3CardmarketIdMap, aber mit Bildern (buildV3CardDataMap); gleicher Zeitlimit-/Negativ-Cache-Weg. */
export async function getV3CardDataMap(options = {}) {
  const index = await loadGuardedIndex(options);
  return index ? buildV3CardDataMap(index) : new Map();
}

/**
 * Einziger Anreicherungsschritt fuer db_cards-Records (readDbCardsForSet): laedt den Suchindex und haengt
 * v3-Cardmarket-IDs und Index-Bilder an (attachV3CardData); ohne Index (offline/Fehler) unveraendert -
 * die Sheet-Werte gelten dann.
 */
export async function withV3CardmarketIds(records = [], { setId = '', language = 'de', loadIndex, signal } = {}) {
  if (!Array.isArray(records) || records.length === 0) return records;
  const dataMap = await getV3CardDataMap({ ...(loadIndex ? { loadIndex } : {}), signal });
  return attachV3CardData(records, dataMap, { setId, language });
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
