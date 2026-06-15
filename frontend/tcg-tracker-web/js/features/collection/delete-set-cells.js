/**
 * delete-set-cells.js – reine Sammel- und Batch-Helfer für die Set-Löschung
 *
 * Wenn ein Set aus der Sammlung entfernt wird, müssen alle G- und RH-Zellen
 * des Set-Tabs auf `false` zurückgesetzt werden. Das frühere Vorgehen rief
 * `updateCellBoolean` für jede Zelle einzeln auf und lief bei großen Sets
 * (>= 60 Karten) in das Per-Request-Rate-Limit (HTTP 429) der
 * Google-Sheets-API.
 *
 * `collectDeleteSetCellUpdates` sammelt die Updates in einem Array, das an
 * `updateCellBooleansBatch` weitergereicht wird – dieses bündelt sie zu
 * einem einzigen `batchUpdate`-Request mit eingebautem Exponential-Backoff.
 */

/**
 * Wandelt eine `readSetCollectionMap`-Map in die flache Update-Liste, die
 * `updateCellBooleansBatch` erwartet. Es werden nur Einträge mit gültiger
 * `gCell`/`rhCell` (Zeile & Spalte) berücksichtigt; der Wert ist immer
 * `false`, weil das Set gelöscht wird.
 *
 * @param {Map<string, {gCell?: {row:number,col:number}, rhCell?: {row:number,col:number}}>} collectionMap
 * @returns {Array<{row:number,col:number,value:false}>}
 */
export function collectDeleteSetCellUpdates(collectionMap) {
  if (!collectionMap || typeof collectionMap.values !== 'function') return [];

  const updates = [];
  for (const db of collectionMap.values()) {
    if (db?.gCell?.row && db?.gCell?.col) {
      updates.push({ row: Number(db.gCell.row), col: Number(db.gCell.col), value: false });
    }
    if (db?.rhCell?.row && db?.rhCell?.col) {
      updates.push({ row: Number(db.rhCell.row), col: Number(db.rhCell.col), value: false });
    }
  }
  return updates;
}

/**
 * Führt die in `collectDeleteSetCellUpdates` gesammelten Updates über
 * `updateCellBooleansBatch` aus und gibt die Anzahl der tatsächlich
 * geschriebenen Zellen zurück. Eine leere Liste ist ein No-Op und liefert
 * `0`.
 */
export async function applyDeleteSetCellUpdates({ setName, collectionMap, updateCellBooleansBatch, chunkSize = 250 } = {}) {
  if (typeof updateCellBooleansBatch !== 'function') {
    throw new Error('applyDeleteSetCellUpdates: updateCellBooleansBatch ist erforderlich');
  }
  const updates = collectDeleteSetCellUpdates(collectionMap);
  if (!updates.length) return 0;
  return Number(await updateCellBooleansBatch(setName, updates, { chunkSize })) || updates.length;
}
