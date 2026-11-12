// Gemeinsame, reine Hilfen fuer alle Sammlungs-Aufrufer (Set-Ansicht, Lightbox, Suche, Bulk, Undo,
// Backup, Legacy-Import, Datencheck). Kein gapi, kein DOM.
//
// Regeln (Spec §7.1, Plan Task 6):
// - Sammlungs-Lookups laufen ueber `card.collectionKey` (v3 cardId), nie ueber normalizeCardNumber(card.number).
// - Schreiben betrifft alle Zeilen (`cells`) einer Karte, ueber cellsForUpdate.
// - Mehrdeutige Altzeilen (§5.3) werden nie still einer Karte zugeschlagen: ist der Altstatus gesetzt,
//   wird nicht geschrieben, sondern der Hook fuer die Migration (Task 7) aufgerufen.
import { normalizeCardNumber } from '../core/utils.js';
import { cellsForUpdate } from './collection-aliases.js';

export const AMBIGUOUS_LEGACY_KEY = 'AMBIGUOUS_LEGACY_KEY';

/**
 * Sammlungsschluessel einer Karte. v3-Karten (und db_cards-Fallback-Karten, siehe readDbCardsForSet)
 * tragen `collectionKey`. Nur Karten ohne dieses Feld (z. B. Offline-Suchcache einer aelteren
 * App-Version) fallen auf die normalisierte Nummer zurueck – das ist auch der Schluessel, den die
 * Sammlungs-Map ohne Registry verwendet.
 */
export function collectionKeyOf(card) {
  const explicit = String(card?.collectionKey ?? '').trim();
  if (explicit) return explicit;
  return normalizeCardNumber(card?.number ?? '');
}

/** Platzhalter-Eintrag fuer Karten ohne Sammlungszeile. */
export function emptyCollectionEntry(card, key = collectionKeyOf(card)) {
  return {
    collectionKey: key,
    displayId: String(card?.number ?? key ?? ''),
    g: false,
    rh: false,
    cells: [],
    gCell: null,
    rhCell: null
  };
}

/** true, wenn der Eintrag mindestens eine beschreibbare Zeile hat. */
export function hasEntryCells(entry) {
  if (Array.isArray(entry?.cells) && entry.cells.length > 0) return true;
  return Boolean(entry?.gCell && entry?.rhCell);
}

/**
 * Zell-Updates, die den Status {g, rh} in **alle** Zeilen der Karte schreiben (rh nur mit g).
 * @returns {{row:number,col:number,value:boolean}[]}
 */
export function stateCellUpdates(entry, { g, rh } = {}) {
  const targetG = Boolean(g);
  const targetRh = targetG && Boolean(rh);
  const byCell = new Map();
  [...cellsForUpdate(entry, 'g', targetG), ...cellsForUpdate(entry, 'rh', targetRh)]
    .forEach((update) => byCell.set(`${update.row}:${update.col}`, update));
  return [...byCell.values()];
}

/** Uebernimmt den geschriebenen Status in den (gecachten) Eintrag und seine Zellen. */
export function applyEntryState(entry, { g, rh } = {}) {
  if (!entry) return entry;
  const targetG = Boolean(g);
  const targetRh = targetG && Boolean(rh);
  entry.g = targetG;
  entry.rh = targetRh;
  (Array.isArray(entry.cells) ? entry.cells : []).forEach((cell) => {
    cell.g = targetG;
    cell.rh = targetRh;
    cell.rhRaw = targetRh;
  });
  return entry;
}

/** Uebernimmt Zellen/Schluessel eines frisch angelegten oder gelesenen Eintrags (ensureCollectionEntry). */
export function adoptEnsuredEntry(db, ensured) {
  const target = db || {};
  if (!ensured) return target;
  target.collectionKey = ensured.collectionKey || target.collectionKey;
  target.displayId = ensured.displayId || target.displayId;
  target.cells = Array.isArray(ensured.cells) ? ensured.cells : [];
  target.gCell = ensured.gCell || null;
  target.rhCell = ensured.rhCell || null;
  // Frisch gelesener Stand ist massgeblich (der Cache kann veraltet sein).
  target.g = Boolean(ensured.g);
  target.rh = Boolean(ensured.rh && ensured.g);
  if (ensured.ambiguous) target.ambiguous = ensured.ambiguous;
  return target;
}

export function isAmbiguousLegacyKeyError(err) {
  return err?.code === AMBIGUOUS_LEGACY_KEY;
}

/**
 * Karte ohne eigene Zeile, deren Status in einer mehrdeutigen Altzeile mit gesetztem Haken steckt (§5.3).
 * Dann darf nichts geschrieben werden, bis die Migration (Task 7) entschieden hat. Liefert einen Fehler im
 * Format von ensureCollectionEntry (code AMBIGUOUS_LEGACY_KEY) oder null.
 */
export function pendingAmbiguityError(entry, { setId = '' } = {}) {
  const amb = entry?.ambiguous;
  if (!amb || hasEntryCells(entry)) return null;
  if (!amb.g && !amb.rh) return null;
  const err = new Error(`Kartenschlüssel „${amb.legacyKey}“ ist mehrdeutig (${(amb.collectionKeys || []).join(', ')}).`);
  err.code = AMBIGUOUS_LEGACY_KEY;
  err.setId = setId;
  err.legacyKey = amb.legacyKey;
  err.collectionKeys = [...(amb.collectionKeys || [])];
  return err;
}

/** Verstaendliche deutsche Meldung fuer AMBIGUOUS_LEGACY_KEY. */
export function describeAmbiguousLegacyKey(err) {
  const legacyKey = String(err?.legacyKey ?? '').trim() || '?';
  const candidates = Array.isArray(err?.collectionKeys) && err.collectionKeys.length
    ? ` (${err.collectionKeys.join(', ')})`
    : '';
  const setLabel = err?.setId ? ` in ${err.setId}` : '';
  return `Die alte Sammlungszeile „${legacyKey}“${setLabel} gilt für mehrere Karten${candidates}. `
    + 'Der Haken wird erst nach der Zuordnung übernommen; es wurde nichts geschrieben.';
}

/**
 * Datencheck: vergleicht die kanonische v3-Kartenliste mit der alias-faehigen Sammlungs-Map.
 * - fehlend: v3-Karte ohne Zeile (weder eigene Zeile noch abdeckende mehrdeutige Altzeile) -> Reimport hilft.
 * - extra: aufgeloeste Eintraege mit Zeilen, die v3 nicht kennt (Registry/v3-Drift).
 * - Waisen (nicht aufloesbare Zeilen der kanonischen Set-ID) werden nur gezaehlt: ein Reimport loest sie
 *   nicht auf, sie duerfen das Set nicht dauerhaft als Abweichung markieren.
 * Zusammengefuehrte Untersets (z. B. swsh12pt5gg) zaehlen so als Teil des Hauptsets.
 */
export function compareSetCollection(apiCards = [], collectionMap = new Map()) {
  const map = collectionMap instanceof Map ? collectionMap : new Map();
  const apiKeys = new Set((Array.isArray(apiCards) ? apiCards : []).map(collectionKeyOf).filter(Boolean));
  const missingKeys = [];
  let present = 0;
  let ambiguousCovered = 0;
  for (const key of apiKeys) {
    const entry = map.get(key);
    if (hasEntryCells(entry)) present += 1;
    else if (entry?.ambiguous?.cells?.length) ambiguousCovered += 1;
    else missingKeys.push(key);
  }
  const extraKeys = [];
  let orphanCount = 0;
  for (const [key, entry] of map) {
    if (apiKeys.has(key)) continue;
    if (entry?.orphan) { orphanCount += 1; continue; }
    if (hasEntryCells(entry)) extraKeys.push(key);
  }
  return {
    apiCount: apiKeys.size,
    sheetCount: present + ambiguousCovered,
    missingKeys,
    extraKeys,
    orphanCount,
    ambiguousCovered,
    mismatch: missingKeys.length > 0 || extraKeys.length > 0
  };
}
