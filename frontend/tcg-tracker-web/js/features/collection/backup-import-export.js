export function createBackupImportExportController(deps = {}) {
  const {
    dom,
    state,
    CONFIG,
    showToast,
    setLoading,
    setGlobalStatus,
    downloadJson,
    readSetCollectionMap,
    normalizeCardNumber,
    updateCellBoolean,
    loadCurrentSet,
    legacyImportDialog,
    startLegacyWorkbookImport,
  } = deps;

  let bindingsInitialized = false;

  async function exportCollectionBackup() {
    if (!state.sets.length) {
      showToast('Keine importierten Sets fuer Backup vorhanden.', 'info');
      return;
    }

    setLoading(true, 'Erstelle Backup...');
    try {
      const backupSets = [];
      for (let index = 0; index < state.sets.length; index++) {
        const set = state.sets[index];
        setGlobalStatus(`Backup ${index + 1}/${state.sets.length}: ${set.setName}`);
        const dbMap = await readSetCollectionMap(set.setName).catch(() => new Map());
        const cards = [];
        for (const [cardId, db] of dbMap.entries()) {
          if (!db?.g && !db?.rh) continue;
          cards.push({ cardId, g: Boolean(db?.g), rh: Boolean(db?.rh) });
        }
        backupSets.push({ setId: set.setId, setName: set.setName, cards });
      }

      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const payload = {
        app: 'poke-tcg-try4',
        version: 1,
        createdAt: new Date().toISOString(),
        spreadsheetId: CONFIG.SPREADSHEET_ID,
        sets: backupSets,
      };
      downloadJson(`poke_collection_backup_${stamp}.json`, payload);
      showToast(`Backup exportiert (${backupSets.length} Sets).`, 'success', 4000);
    } catch (err) {
      console.error('[exportCollectionBackup]', err);
      showToast(`Backup-Export fehlgeschlagen: ${err.message}`, 'error', 5000);
    } finally {
      setLoading(false);
    }
  }

  function parseBackupPayload(rawText) {
    const parsed = JSON.parse(rawText);
    if (!parsed || typeof parsed !== 'object') throw new Error('Ungueltiges Backup-Format.');
    if (!Array.isArray(parsed.sets)) throw new Error('Backup enthaelt keine Set-Daten.');
    return parsed;
  }

  async function applyCollectionBackup(payload) {
    const sets = payload.sets || [];
    if (!sets.length) {
      showToast('Backup enthaelt keine Sets.', 'info');
      return;
    }

    const byId = new Map((state.sets || []).map((set) => [set.setId, set]));
    let updated = 0;
    let skipped = 0;

    setLoading(true, 'Spiele Backup ein...');
    try {
      for (let setIndex = 0; setIndex < sets.length; setIndex++) {
        const backupSet = sets[setIndex];
        const liveSet = byId.get(backupSet.setId);
        if (!liveSet) {
          skipped++;
          continue;
        }

        setGlobalStatus(`Backup ${setIndex + 1}/${sets.length}: ${liveSet.setName}`);
        const liveMap = await readSetCollectionMap(liveSet.setName).catch(() => new Map());
        const snapshotByCard = new Map((backupSet.cards || []).map((entry) => [normalizeCardNumber(entry.cardId), entry]));

        for (const [cardId, db] of liveMap.entries()) {
          if (!db?.gCell || !db?.rhCell) continue;
          const target = snapshotByCard.get(cardId) || { g: false, rh: false };
          const targetG = Boolean(target.g);
          const targetRh = Boolean(target.g && target.rh);

          if (Boolean(db.g) !== targetG) {
            await updateCellBoolean(liveSet.setName, db.gCell.row, db.gCell.col, targetG);
            db.g = targetG;
            updated++;
          }
          if (Boolean(db.rh) !== targetRh) {
            await updateCellBoolean(liveSet.setName, db.rhCell.row, db.rhCell.col, targetRh);
            db.rh = targetRh;
            updated++;
          }
        }
      }
    } finally {
      setLoading(false);
    }

    state.summaryData = null;
    if (state.currentSet) {
      await loadCurrentSet(true).catch(() => {});
    }
    showToast(`Backup eingespielt. Aenderungen: ${updated}, uebersprungen: ${skipped}.`, skipped ? 'info' : 'success', 5000);
  }

  function initBackupImportExport() {
    if (bindingsInitialized) return;
    bindingsInitialized = true;

    dom.btnExportBackup?.addEventListener('click', exportCollectionBackup);
    dom.btnImportBackup?.addEventListener('click', () => dom.backupFileInput?.click());
    legacyImportDialog.initLegacyImportDialogBindings();

    dom.backupFileInput?.addEventListener('change', async () => {
      const file = dom.backupFileInput.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const payload = parseBackupPayload(text);
        const ok = window.confirm(`Backup mit ${payload.sets.length} Sets einspielen?`);
        if (!ok) return;
        await applyCollectionBackup(payload);
      } catch (err) {
        console.error('[initBackupImportExport]', err);
        showToast(`Backup-Import fehlgeschlagen: ${err.message}`, 'error', 6000);
      } finally {
        dom.backupFileInput.value = '';
      }
    });

    dom.legacyImportFileInput?.addEventListener('change', async () => {
      const file = dom.legacyImportFileInput.files?.[0];
      if (!file) return;
      try {
        await startLegacyWorkbookImport(file);
      } finally {
        dom.legacyImportFileInput.value = '';
      }
    });
  }

  return {
    exportCollectionBackup,
    parseBackupPayload,
    applyCollectionBackup,
    initBackupImportExport,
  };
}
