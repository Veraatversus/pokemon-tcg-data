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
 * `updateCellBooleansBatch` erwartet. Beruecksichtigt werden **alle** Zeilen
 * einer Karte (`cells`, ueber alle Set-Aliase), die Zeilen mehrdeutiger
 * Altschluessel (`ambiguous.cells`) und – fuer alte Eintraege ohne `cells` –
 * `gCell`/`rhCell`. Nur gueltige Koordinaten, jede Zelle einmal; der Wert ist
 * immer `false`, weil das Set gelöscht wird.
 *
 * @param {Map<string, {cells?: Array, ambiguous?: {cells?: Array}, gCell?: {row:number,col:number}, rhCell?: {row:number,col:number}}>} collectionMap
 * @returns {Array<{row:number,col:number,value:false}>}
 */
export function collectDeleteSetCellUpdates(collectionMap) {
  if (!collectionMap || typeof collectionMap.values !== 'function') return [];

  const updates = [];
  const seen = new Set();
  const push = (cell) => {
    if (!cell?.row || !cell?.col) return;
    const row = Number(cell.row);
    const col = Number(cell.col);
    const key = `${row}:${col}`;
    if (seen.has(key)) return;
    seen.add(key);
    updates.push({ row, col, value: false });
  };
  for (const db of collectionMap.values()) {
    const cells = [
      ...(Array.isArray(db?.cells) ? db.cells : []),
      ...(Array.isArray(db?.ambiguous?.cells) ? db.ambiguous.cells : [])
    ];
    if (!cells.length) cells.push({ gCell: db?.gCell, rhCell: db?.rhCell });
    cells.forEach((cell) => {
      push(cell?.gCell);
      push(cell?.rhCell);
    });
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
