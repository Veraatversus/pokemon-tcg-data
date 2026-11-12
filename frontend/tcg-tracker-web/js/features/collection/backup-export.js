// Backup-Export (Version 2: cardId = collectionKey, Sets kanonisch). Reine Ablauflogik mit hereingereichten
// Lesern, damit ein Lesefehler nie zu einem stillen, unvollstaendigen Backup fuehrt (Final-Review Finding 7).
//
// deps:
// - listSetIds(): Set<string> kleingeschriebener Set-IDs mit Haken (strikt; wirft bei Lesefehler)
// - ensureResolver(setId): Registry + Karten des Sets laden (wirft, wenn die Registry nicht erreichbar ist –
//   ohne sie waeren die Schluessel keine collectionKeys)
// - readMap(set): Sammlungs-Map des Sets (strikt; wirft bei Lesefehler)
// - onProgress(index, total, set): optional

export class BackupExportError extends Error {
  constructor(message, { cause, setId } = {}) {
    super(message, { cause });
    this.name = 'BackupExportError';
    this.code = 'BACKUP_READ_FAILED';
    if (setId) this.setId = setId;
  }
}

const reason = (err) => err?.message || String(err);

/** @returns {Promise<Array<{ setId: string, setName: string, cards: Array<{ cardId: string, g: boolean, rh: boolean }> }>>} */
export async function buildCollectionBackupSets(sets, { listSetIds, ensureResolver, readMap, onProgress } = {}) {
  const list = Array.isArray(sets) ? sets : [];
  let setsWithChecks;
  try {
    setsWithChecks = await listSetIds();
  } catch (err) {
    throw new BackupExportError(`Sammlung (db_collection) konnte nicht gelesen werden: ${reason(err)}. Es wurde kein Backup erstellt.`, { cause: err });
  }

  const backupSets = [];
  for (let index = 0; index < list.length; index++) {
    const set = list[index];
    onProgress?.(index, list.length, set);
    const cards = [];
    if (setsWithChecks.has(String(set?.setId || '').toLowerCase())) {
      let dbMap;
      try {
        await ensureResolver(set.setId);
        dbMap = await readMap(set);
      } catch (err) {
        throw new BackupExportError(
          `Sammlung von ${set?.setName || set?.setId} konnte nicht gelesen werden: ${reason(err)}. Es wurde kein Backup erstellt.`,
          { cause: err, setId: set?.setId }
        );
      }
      for (const [cardId, db] of dbMap.entries()) {
        if (!db?.g && !db?.rh) continue;
        cards.push({ cardId, g: Boolean(db?.g), rh: Boolean(db?.rh) });
      }
    }
    backupSets.push({ setId: set.setId, setName: set.setName, cards });
  }
  return backupSets;
}
