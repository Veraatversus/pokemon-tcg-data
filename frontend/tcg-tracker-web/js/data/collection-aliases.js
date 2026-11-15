// Alias-faehige Sammlung: db_collection-Zeilen (setId, cardId, g, rh, updatedAt) ueber die Registry-Aliase
// eines kanonischen Sets lesen (Spec §5.2/§5.3/§7.1). Reine Logik ohne gapi; sheets-db.js nutzt sie.
//
// - ensureResolverForSet(setKey): Registry-Sets einmal laden, Registry-Karten des kanonischen Sets laden,
//   Resolver zurueckgeben. Danach kann resolve()/ambiguous() fuer dieses Set kein CARDS_NOT_LOADED werfen.
// - buildCollectionMap(rows, { canonicalSetId, resolver }): Map<collectionKey, Entry>, linear in den Zeilen
//   (Set-Schluessel werden pro Aufruf memoisiert, nur Zeilen des kanonischen Sets werden aufgeloest).
// - cellsForUpdate(entry, field, value): alle Zellen einer Karte inkl. Regel rh => g.
import { normalizeCardNumber, toBoolean } from '../core/utils.js';
import { loadRegistrySets, loadRegistryCards } from './v3-api.js';
import { createCollectionKeyResolver } from './v3-collection-keys.js';

const COL_G = 3;
const COL_RH = 4;

let resolverState = null;

export function resetCollectionResolverCache() {
  resolverState = null;
}

function getState() {
  if (!resolverState) {
    resolverState = { setsPromise: null, cardsBySet: new Map(), cardPromises: new Map() };
  }
  return resolverState;
}

/**
 * Laedt (gecacht) Registry-Sets und die Registry-Karten des kanonischen Sets zu `setKey`.
 * Unbekannte Set-Schluessel laden keine Karten; resolver.resolveSetKey(setKey) liefert dann null.
 * @returns {Promise<ReturnType<typeof createCollectionKeyResolver>>}
 */
export async function ensureResolverForSet(setKey, { loadSets = loadRegistrySets, loadCards = loadRegistryCards } = {}) {
  const state = getState();
  if (!state.setsPromise) {
    const promise = Promise.resolve()
      .then(() => loadSets())
      .then((sets) => createCollectionKeyResolver(sets || {}, state.cardsBySet));
    state.setsPromise = promise;
    promise.catch(() => {
      if (state.setsPromise === promise) state.setsPromise = null;
    });
  }
  const resolver = await state.setsPromise;
  const canonicalSetId = resolver.resolveSetKey(setKey);
  if (canonicalSetId && !state.cardsBySet.has(canonicalSetId)) {
    let promise = state.cardPromises.get(canonicalSetId);
    if (!promise) {
      promise = Promise.resolve()
        .then(() => loadCards(canonicalSetId))
        .then((cards) => {
          state.cardsBySet.set(canonicalSetId, cards || {});
        });
      state.cardPromises.set(canonicalSetId, promise);
      promise.catch(() => {
        if (state.cardPromises.get(canonicalSetId) === promise) state.cardPromises.delete(canonicalSetId);
      });
    }
    await promise;
  }
  return resolver;
}

/**
 * Resolver nur mit Registry-Sets (keine Karten-Requests): resolveSetKey/aliasesOf fuer Overview-Zuordnung
 * und die Pruefung, ob ein Set ueberhaupt Sammlungszeilen hat.
 */
export function ensureSetResolver(opts = {}) {
  return ensureResolverForSet('', opts);
}

/**
 * Kanonische Set-IDs, unter denen (ueber alle Aliase) db_collection-Zeilen existieren.
 * Nur Registry-Sets noetig. `checkedOnly`: nur Zeilen mit g=true zaehlen.
 * Nicht aufloesbare Set-Schluessel erscheinen unveraendert.
 * @returns {Set<string>} kleingeschriebene Set-IDs
 */
// Memo je Zeilen-Array (readDbRows-Cache) und Resolver, nur fuer checkedOnly=false: Zeilen-Existenz aendert
// sich nur durch Anhaengen (neues Array), Zell-Patches (g/rh) mutieren in place und betreffen nur checkedOnly.
const collectionSetIdsMemo = new WeakMap();

export function collectCollectionSetIds(rows, resolver, { checkedOnly = false } = {}) {
  if (!checkedOnly && Array.isArray(rows)) {
    const cached = collectionSetIdsMemo.get(rows);
    if (cached && cached.resolver === resolver && cached.length === rows.length) return cached.result;
    const result = computeCollectionSetIds(rows, resolver, { checkedOnly });
    collectionSetIdsMemo.set(rows, { resolver, length: rows.length, result });
    return result;
  }
  return computeCollectionSetIds(rows, resolver, { checkedOnly });
}

function computeCollectionSetIds(rows, resolver, { checkedOnly = false } = {}) {
  const out = new Set();
  const memo = new Map();
  (rows || []).forEach((row) => {
    const setKey = str(row?.[0]);
    if (!setKey || !str(row?.[1])) return;
    if (checkedOnly && !toBoolean(row?.[2])) return;
    const lowerKey = setKey.toLowerCase();
    let canonical = memo.get(lowerKey);
    if (canonical === undefined) {
      canonical = (resolver?.resolveSetKey?.(setKey) || setKey).toLowerCase();
      memo.set(lowerKey, canonical);
    }
    out.add(canonical);
  });
  return out;
}

const str = (value) => String(value ?? '').trim();

function makeCell(row, index) {
  const rowNo = index + 2;
  const g = toBoolean(row?.[2]);
  const rhRaw = toBoolean(row?.[3]);
  return {
    setKey: str(row?.[0]),
    cardKey: str(row?.[1]),
    rowNo,
    g,
    rh: rhRaw && g,
    rhRaw,
    gCell: { row: rowNo, col: COL_G },
    rhCell: { row: rowNo, col: COL_RH }
  };
}

function emptyEntry(collectionKey, displayId = collectionKey) {
  return { collectionKey, displayId, g: false, rh: false, cells: [], gCell: null, rhCell: null };
}

function finalizeEntry(entry) {
  const g = entry.cells.some((cell) => cell.g);
  entry.g = g;
  entry.rh = g && entry.cells.some((cell) => cell.rh);
  entry.gCell = entry.cells[0]?.gCell || null;
  entry.rhCell = entry.cells[0]?.rhCell || null;
  return entry;
}

/**
 * Baut die Sammlungs-Map eines kanonischen Sets aus allen db_collection-Zeilen.
 * - Zeilen unter allen Aliasen des Sets werden ueber den Resolver (Namensraum des Set-Schluessels) zugeordnet.
 * - g = ODER ueber alle Zeilen der Karte, rh = ODER(rh && g je Zeile) && g; gCell/rhCell = erste Zelle.
 * - Mehrdeutige Altzeilen (§5.3) werden nicht in g/rh gemischt, sondern je Kandidat unter `ambiguous` vermerkt.
 * - Nicht aufloesbare Zeilen direkt unter der kanonischen Set-ID bleiben unter normalizeCardNumber(cardId)
 *   sichtbar (`orphan: true`), sofern der Schluessel nicht schon belegt ist. Nicht aufloesbare Alias-Zeilen
 *   werden nur gezaehlt (ihr Kartenschluessel liegt in einem anderen Namensraum).
 * @returns {{ map: Map<string, object>, stats: { matchedRows: number, resolvedRows: number, ambiguousRows: number, orphanRows: number, unresolvedAliasRows: number } }}
 */
export function buildCollectionMap(rows, { canonicalSetId, resolver } = {}) {
  const map = new Map();
  const stats = { matchedRows: 0, resolvedRows: 0, ambiguousRows: 0, orphanRows: 0, unresolvedAliasRows: 0 };
  const canonical = str(canonicalSetId);
  if (!canonical || !resolver) return { map, stats };
  const canonicalLower = canonical.toLowerCase();

  const setKeyMemo = new Map();
  const orphans = new Map();
  const ambiguousGroups = new Map();

  (rows || []).forEach((row, index) => {
    const setKey = str(row?.[0]);
    const cardKey = str(row?.[1]);
    if (!setKey || !cardKey) return;
    const setLower = setKey.toLowerCase();
    let rowCanonical = setKeyMemo.get(setLower);
    if (rowCanonical === undefined) {
      rowCanonical = resolver.resolveSetKey(setKey) ?? null;
      setKeyMemo.set(setLower, rowCanonical);
    }
    if (rowCanonical !== canonical) return;
    stats.matchedRows += 1;
    const cell = makeCell(row, index);

    const hit = resolver.resolve(setKey, cardKey);
    if (hit && hit.setId === canonical) {
      stats.resolvedRows += 1;
      if (!map.has(hit.collectionKey)) map.set(hit.collectionKey, emptyEntry(hit.collectionKey));
      map.get(hit.collectionKey).cells.push(cell);
      return;
    }

    const amb = resolver.ambiguous(setKey, cardKey);
    if (amb && amb.setId === canonical) {
      stats.ambiguousRows += 1;
      const groupKey = `${amb.legacyKey}\u0000${amb.collectionKeys.join('\u0000')}`;
      if (!ambiguousGroups.has(groupKey)) {
        ambiguousGroups.set(groupKey, {
          legacyKey: amb.legacyKey,
          collectionKeys: [...amb.collectionKeys],
          g: false,
          rh: false,
          cells: []
        });
      }
      ambiguousGroups.get(groupKey).cells.push(cell);
      return;
    }

    if (setLower === canonicalLower) {
      stats.orphanRows += 1;
      const key = normalizeCardNumber(cardKey);
      if (!orphans.has(key)) orphans.set(key, { ...emptyEntry(key, cardKey), orphan: true });
      orphans.get(key).cells.push(cell);
      return;
    }
    stats.unresolvedAliasRows += 1;
  });

  map.forEach(finalizeEntry);

  for (const group of ambiguousGroups.values()) {
    group.g = group.cells.some((cell) => cell.g);
    group.rh = group.g && group.cells.some((cell) => cell.rh);
    for (const collectionKey of group.collectionKeys) {
      if (!map.has(collectionKey)) map.set(collectionKey, emptyEntry(collectionKey));
      const entry = map.get(collectionKey);
      if (!entry.ambiguous) entry.ambiguous = group;
    }
  }

  for (const [key, entry] of orphans) {
    if (!map.has(key)) map.set(key, finalizeEntry(entry));
  }

  return { map, stats };
}

function entryCells(entry) {
  if (Array.isArray(entry?.cells) && entry.cells.length > 0) return entry.cells;
  if (entry?.gCell || entry?.rhCell) return [{ gCell: entry.gCell, rhCell: entry.rhCell }];
  return [];
}

/**
 * Zell-Updates fuer alle Zeilen einer Karte (fuer updateCellBooleansBatch).
 * Regel rh => g: rh=true setzt auch g=true; g=false setzt auch rh=false.
 * @param {object} entry Eintrag aus readSetCollectionMap/ensureCollectionEntry
 * @param {'g'|'rh'} field
 * @param {boolean} value
 * @returns {{ row: number, col: number, value: boolean }[]}
 */
export function cellsForUpdate(entry, field, value) {
  if (field !== 'g' && field !== 'rh') throw new Error(`cellsForUpdate: unbekanntes Feld '${field}'`);
  const target = Boolean(value);
  const byCell = new Map();
  const push = (cell, cellValue) => {
    const row = Number(cell?.row);
    const col = Number(cell?.col);
    if (!Number.isFinite(row) || row < 1 || !Number.isFinite(col) || col < 1) return;
    byCell.set(`${row}:${col}`, { row, col, value: cellValue });
  };
  const cells = entryCells(entry);
  if (field === 'g') {
    cells.forEach((cell) => push(cell.gCell, target));
    if (!target) cells.forEach((cell) => push(cell.rhCell, false));
  } else {
    if (target) cells.forEach((cell) => push(cell.gCell, true));
    cells.forEach((cell) => push(cell.rhCell, target));
  }
  return [...byCell.values()];
}
