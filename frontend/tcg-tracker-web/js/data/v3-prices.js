// Cardmarket-Preise aus api/v3/prices (Spec §2.3, §5): eine kompakte Datei je Set
//   prices/<setId>.json = { "<cardId>": { productId, avg, trend, avg1, avg7, avg30, low, trendHolo, avg1Holo, avg7Holo, avg30Holo, lowHolo } }
// (nur vorhandene Felder). prices/meta.json.generatedAt aendert sich mit jeder Preisdatei und haengt als ?v=<stamp> an
// jeder Preisdatei-URL: der Service Worker cached diese URLs cache-first, ein neuer Stamp ist eine neue URL.
// meta.json wird je Sitzung einmal frisch gelesen (offline: zuletzt gespeicherter Stamp).
// Kein Matching im Browser: Preis nur, wenn die productId des Eintrags der Produkt-ID des Records entspricht
// (resolveCardmarketProductId, v3-ID zuerst) - sonst kein Preis statt eines falschen.
import { CONFIG, scopedStorageKey } from '../core/config.js';
import { loadV3Sets, resolveV3Bases } from './v3-api.js';
import { resolveCardmarketProductId } from './cardmarket-url-utils.js';

const STAMP_STORAGE_KEY = scopedStorageKey('v3-prices-stamp');

let stampPromise = null;
const setPricePromises = new Map(); // setId (klein) -> Promise<Map<cardId, price>>
const setIdsBySets = new WeakMap(); // sets.json-Array -> Map<setId klein, setId>

const text = (value) => String(value ?? '').trim();

function defaultStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function readStoredStamp(storage) {
  try {
    return text(storage?.getItem(STAMP_STORAGE_KEY));
  } catch {
    return '';
  }
}

function writeStoredStamp(storage, stamp) {
  try {
    if (stamp) storage?.setItem(STAMP_STORAGE_KEY, stamp);
  } catch {
    // Storage voll/gesperrt: Stamp gilt nur fuer diese Sitzung
  }
}

function pricesBaseUrl({ href = globalThis.location?.href, config = CONFIG } = {}) {
  return `${resolveV3Bases({ href, config }).v3}prices/`;
}

function fetchFn(fetchImpl) {
  return fetchImpl || ((url, init) => fetch(url, init));
}

/**
 * Aktueller Preis-Stamp (prices/meta.json generatedAt), einmal je Sitzung gelesen. Netzfehler/kein Stamp ->
 * zuletzt gespeicherter Stamp ('' ohne). Optionen (Tests): href, config, fetchImpl, storage, signal.
 */
export function loadPriceStamp(options = {}) {
  if (stampPromise) return stampPromise;
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  const promise = (async () => {
    try {
      const response = await fetchFn(options.fetchImpl)(`${pricesBaseUrl(options)}meta.json`, {
        cache: 'no-store',
        signal: options.signal,
      });
      if (response?.ok) {
        const stamp = text((await response.json())?.generatedAt);
        if (stamp) {
          writeStoredStamp(storage, stamp);
          return stamp;
        }
      }
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
    }
    return readStoredStamp(storage);
  })();
  stampPromise = promise;
  promise.catch(() => {
    if (stampPromise === promise) stampPromise = null;
  });
  return promise;
}

/**
 * Preise eines Sets: Map<cardId, price>. Set ohne Preisdatei (404) -> leere Map. Andere Fehler werfen und
 * werden nicht gemerkt (naechster Aufruf versucht es erneut).
 */
/**
 * Kanonische v3-setId (Schreibweise wie in sets.json und im Dateinamen der Preisdatei). sets.json ist ohnehin
 * geladen (v3-api-Cache); ohne sets.json (offline/Fehler) bleibt die setId unveraendert.
 */
async function canonicalPriceSetId(id, options = {}) {
  try {
    const loadSets = options.loadSets || ((opts) => loadV3Sets(opts));
    const sets = await loadSets({ href: options.href, config: options.config, fetchImpl: options.fetchImpl, signal: options.signal });
    if (!Array.isArray(sets)) return id;
    let ids = setIdsBySets.get(sets);
    if (!ids) {
      ids = new Map(sets.map((set) => [text(set?.id).toLowerCase(), text(set?.id)]).filter(([key]) => key));
      setIdsBySets.set(sets, ids);
    }
    return ids.get(id.toLowerCase()) || id;
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    return id;
  }
}

export function loadSetPrices(setId, options = {}) {
  const requested = text(setId);
  if (!requested) return Promise.resolve(new Map());
  const key = requested.toLowerCase();
  if (setPricePromises.has(key)) return setPricePromises.get(key);
  const promise = (async () => {
    const [stamp, id] = await Promise.all([loadPriceStamp(options), canonicalPriceSetId(requested, options)]);
    const url = `${pricesBaseUrl(options)}${encodeURIComponent(id)}.json${stamp ? `?v=${encodeURIComponent(stamp)}` : ''}`;
    const response = await fetchFn(options.fetchImpl)(url, { signal: options.signal });
    if (response?.status === 404) return new Map();
    if (!response?.ok) {
      const err = new Error(`v3 prices error ${response?.status}: ${url}`);
      err.status = response?.status;
      throw err;
    }
    const json = await response.json();
    return new Map(Object.entries(json && typeof json === 'object' ? json : {}));
  })();
  setPricePromises.set(key, promise);
  promise.catch(() => {
    if (setPricePromises.get(key) === promise) setPricePromises.delete(key);
  });
  return promise;
}

/**
 * Schluessel einer Karte in der Preisdatei: kanonische setId + v3-cardId (= collectionKey; sonst die v3-id
 * `<setId>-<cardId>` ohne Set-Praefix). `setId` (Option) gilt nur, wenn der Record keine eigene traegt.
 */
export function priceCardRef(card = {}, { setId = '' } = {}) {
  const set = text(card?.setId) || text(setId);
  let cardId = text(card?.collectionKey);
  if (!cardId) {
    const fullId = text(card?.cardId);
    const prefix = set ? `${set}-` : '';
    if (prefix && fullId.toLowerCase().startsWith(prefix.toLowerCase()) && fullId.length > prefix.length) {
      cardId = fullId.slice(prefix.length);
    }
  }
  return { setId: set, cardId };
}

/**
 * Preis-Eintrag einer Karte (Set-Ansicht, Suche, Statistik/Watchlist) oder null. Nur wenn die productId des
 * Eintrags der Produkt-ID des Records entspricht (resolveCardmarketProductId: v3-ID, sonst Legacy-URL).
 */
export async function getCardPrice(card = {}, options = {}) {
  const { setId, cardId } = priceCardRef(card, options);
  if (!setId || !cardId) return null;
  const { productId } = resolveCardmarketProductId(card);
  if (!productId) return null;
  const prices = await loadSetPrices(setId, options);
  const price = prices.get(cardId);
  if (!price || text(price.productId) !== text(productId)) return null;
  return price;
}

/** Leert Stamp und Preisdateien dieser Sitzung; der gespeicherte Stamp bleibt als Offline-Rueckfall. */
export function resetV3PriceCaches() {
  stampPromise = null;
  setPricePromises.clear();
}

/**
 * "Preise neu laden": leert die Preis-Caches und liest prices/meta.json neu. Ein neuer Stamp ist eine neue
 * Datei-URL (der Service Worker holt sie aus dem Netz). -> { changed, previousStamp, currentStamp }
 */
export async function refreshV3Prices(options = {}) {
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  const previousStamp = (stampPromise ? await stampPromise.catch(() => '') : '') || readStoredStamp(storage);
  resetV3PriceCaches();
  const currentStamp = await loadPriceStamp(options);
  return { changed: Boolean(currentStamp) && currentStamp !== previousStamp, previousStamp, currentStamp };
}
