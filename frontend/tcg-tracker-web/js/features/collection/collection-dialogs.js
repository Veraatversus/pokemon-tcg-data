// Sammlungs-Verwaltung: Batch-Import- und Verwaltungsdialog, Set loeschen, Reimport, Summary-CSV,
// Backup exportieren/einspielen, Datenpruefung und Verdrahtung der Backup-/Altbestand-Knoepfe.
import {
  readSetCollectionMap,
  updateCellBooleansBatch,
  readSummarySheet,
  upsertOverviewSet,
  markAliasSetRowsNotImported,
  listCollectionSetIds,
  invalidateCollectionRowCache
} from '../../data/sheets-db.js?v=20261114-clean-1';
import { hasEntryCells, stateCellUpdates, applyEntryState, compareSetCollection } from '../../data/collection-writes.js';
import { findSetByIdOrAlias } from '../../data/set-aliases.js';
import { fetchMergedCards } from '../../data/pokemon-api.js?v=20261114-clean-1';
import { toBoolean } from '../../core/utils.js';
import * as cache from '../../core/cache.js';
import { CONFIG } from '../../core/config.js';
import { createAutoSnapshot, applyDeleteSetCellUpdates } from './index.js';
import { ensureResolverForSet } from '../../data/collection-aliases.js';
import { buildCollectionBackupSets } from './backup-export.js';
import { buildBackupRestoreSnapshot, planBackupRestore } from './legacy-key-resolution.js';
import { startJob, updateJob, finishJob, assertJobNotCancelled, importSetsSequential } from './import-jobs.js';
import {
  openLegacySheetImportDialog, submitLegacySheetImportDialog, setAllLegacyImportSelections, closeLegacyImportSelectionDialog,
  confirmLegacyImportSelectionDialog, renderLegacyImportSelectionDialog, handleLegacyImportSelectionTreeChange,
  handleLegacyImportSelectionTreeToggle, startLegacyWorkbookImport
} from './legacy-import-dialog.js';
import { downloadJson } from '../../advanced-features.js';
import { dom } from '../../app/dom.js';
import { state } from '../../app/state.js';
import { navigate } from '../../app/router.js';
import { setGlobalStatus, setLoading, showToast } from '../../ui/helpers.js';
import { resetSheetsRetryMetrics, openSheetsRetryReportDialog } from '../../ui/sheets-feedback.js';
import { allImportedSets, loadSets, renderDashboard, getSetById } from '../../views/dashboard.js';
import { loadCurrentSet } from '../../views/set-view.js';

export async function deleteSetFromCollection(set, options = {}) {
  const { skipReload = false, skipConfirm = false } = options;
  if (!set?.setId || !set.imported) {
    showToast('Set kann nicht geloescht werden.', 'error', 3000);
    return;
  }

  const confirmMsg = `${set.setName} wirklich aus deiner Sammlung loeschen? Diese Aktion kann nicht rueckgaengig gemacht werden.`;
  if (!skipConfirm && !window.confirm(confirmMsg)) {
    return;
  }

  setLoading(true, `Loesche ${set.setName}`);
  setGlobalStatus(`Loesche ${set.setName}`);
  
  try {
    // Auto-Snapshot vor dem Loeschen erstellen
    try {
      const currentCollection = state.collection || {};
      const action = `Delete Set: ${set.setName}`;
      await createAutoSnapshot(action, currentCollection);
    } catch (err) {
      console.warn('Auto-snapshot vor Loeschung fehlgeschlagen:', err);
    }

    // Entferne das Set aus der Sammlung
    // Wir sammeln alle Cell-Updates zuerst und schicken sie gebündelt in EINEM
    // batchUpdate an die Google-Sheets-API, um das Per-Request-Rate-Limit (429)
    // bei großen Sets zu vermeiden (vgl. updateCellBooleansBatch).
    const range = await readSetCollectionMap(set.setName, { setId: set.setId }).catch(() => new Map());
    await applyDeleteSetCellUpdates({
      setName: set.setName,
      collectionMap: range,
      updateCellBooleansBatch,
      chunkSize: 250,
    });

    await upsertOverviewSet(set, false);
    // Alias-Zeilen (db_sets/Overview) ebenfalls auf imported=false, sonst ODERt die Alias-Zuordnung das Set
    // beim naechsten Laden wieder als importiert zurueck. Nur Status-Zellen; keine Zeile wird geloescht.
    let aliasWarning = '';
    try {
      await markAliasSetRowsNotImported(set);
    } catch (err) {
      console.warn('[deleteSetFromCollection] Alias-Zeilen nicht aktualisiert', err);
      aliasWarning = ` Alias-Zeilen konnten nicht aktualisiert werden (${err?.message || err}); bitte erneut loeschen.`;
    }

    cache.del(`cards_${set.setId}`);
    cache.del(`db_${set.setId}`);
    cache.del(`db_cards_${set.setId}`);
    state.summaryData = null;
    state.summaryOverrides.delete(set.setName);
    state.summaryOverrides.delete(set.setId);

    // Aktualisiere die Ansicht
    if (!skipReload) {
      await loadSets();
      await renderDashboard();
    }
    
    showToast(`${set.setName} wurde geloescht.${aliasWarning}`, aliasWarning ? 'error' : 'success', aliasWarning ? 6000 : 3000);
    setGlobalStatus(`${set.setName} wurde geloescht.`);
  } catch (err) {
    console.error('[deleteSetFromCollection]', err);
    showToast(`Loeschen fehlgeschlagen: ${err.message}`, 'error', 5000);
    setGlobalStatus(`Fehler beim Loeschen: ${set.setName}`);
  } finally {
    setLoading(false);
  }
}

function getBatchCandidates() {
  return state.allSets.filter((set) => !set.imported);
}

function updateBatchInfo() {
  const selected = state.batchSelection.size;
  dom.batchInfo.classList.remove('hidden');
  dom.batchInfo.textContent = `${selected} Set${selected === 1 ? '' : 's'} ausgewaehlt`;
}

function renderBatchDialogList() {
  const query = (dom.batchSearchInput.value || '').trim().toLowerCase();
  const sets = getBatchCandidates().filter((set) => {
    if (!query) return true;
    return [set.setId, set.setName, set.series].some((field) => String(field || '').toLowerCase().includes(query));
  });

  dom.batchList.innerHTML = '';
  if (!sets.length) {
    dom.batchList.innerHTML = '<p class="empty-state">Keine passenden Sets gefunden.</p>';
    updateBatchInfo();
    return;
  }

  const fragment = document.createDocumentFragment();
  sets.forEach((set) => {
    const row = document.createElement('label');
    row.className = 'batch-item';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = state.batchSelection.has(set.setId);
    input.addEventListener('change', () => {
      if (input.checked) state.batchSelection.add(set.setId);
      else state.batchSelection.delete(set.setId);
      updateBatchInfo();
    });

    const main = document.createElement('div');
    main.className = 'batch-item-main';

    const title = document.createElement('span');
    title.className = 'batch-item-title';
    title.textContent = `${set.setId} - ${set.setName}`;

    const sub = document.createElement('span');
    sub.className = 'batch-item-sub';
    sub.textContent = `${set.series || 'Serie unbekannt'} - ${set.totalCards || '?'} Karten`;

    main.append(title, sub);
    row.append(input, main);
    fragment.appendChild(row);
  });

  dom.batchList.appendChild(fragment);
  updateBatchInfo();
}

export function openBatchImportDialog() {
  state.batchSelection.clear();
  dom.batchSearchInput.value = '';
  renderBatchDialogList();
  dom.batchDialog.showModal();
}

export function initBatchImportDialog() {
  dom.batchSearchInput?.addEventListener('input', renderBatchDialogList);

  dom.btnBatchSelectVisible?.addEventListener('click', () => {
    const checkboxes = dom.batchList.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach((checkbox) => {
      checkbox.checked = true;
      const label = checkbox.closest('.batch-item')?.querySelector('.batch-item-title')?.textContent || '';
      const setId = label.split(' - ')[0] || '';
      if (setId) state.batchSelection.add(setId);
    });
    updateBatchInfo();
  });

  dom.btnBatchClearSelection?.addEventListener('click', () => {
    state.batchSelection.clear();
    renderBatchDialogList();
  });

  dom.btnBatchCancel?.addEventListener('click', () => dom.batchDialog?.close());

  dom.btnBatchImportSelected?.addEventListener('click', async () => {
    const selectedIds = Array.from(state.batchSelection);
    if (!selectedIds.length) {
      showToast('Bitte mindestens ein Set auswaehlen.', 'info');
      return;
    }
    dom.batchDialog.close();
    const targetSets = selectedIds.map((id) => getSetById(id)).filter(Boolean);
    await importSetsSequential(targetSets, { successMessage: '{count} Sets per Batch importiert.' });
  });
}

function getImportedSetsForManagement() {
  return (state.allSets || []).filter((set) => toBoolean(set.imported));
}

function updateManageSetsInfo(filtered = []) {
  if (!dom.manageSetsInfo) return;
  const selectedCount = state.manageSetsSelection.size;
  dom.manageSetsInfo.textContent = `${selectedCount} ausgewaehlt - ${filtered.length} sichtbar`;
}

function renderManageImportedSetsList() {
  if (!dom.manageSetsList) return;
  const query = String(dom.manageSetsSearch?.value || '').trim().toLowerCase();
  const importedSets = getImportedSetsForManagement();
  const filtered = !query
    ? importedSets
    : importedSets.filter((set) =>
      String(set.setName || '').toLowerCase().includes(query)
      || String(set.setId || '').toLowerCase().includes(query)
      || String(set.series || '').toLowerCase().includes(query)
    );

  if (!filtered.length) {
    dom.manageSetsList.innerHTML = '<p class="empty-state">Keine importierten Sets fuer den aktuellen Filter.</p>';
    updateManageSetsInfo(filtered);
    return;
  }

  const fragment = document.createDocumentFragment();
  filtered.forEach((set) => {
    const row = document.createElement('label');
    row.className = 'batch-item';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = state.manageSetsSelection.has(set.setId);
    input.addEventListener('change', () => {
      if (input.checked) state.manageSetsSelection.add(set.setId);
      else state.manageSetsSelection.delete(set.setId);
      updateManageSetsInfo(filtered);
    });

    const main = document.createElement('span');
    main.className = 'batch-item-main';

    const title = document.createElement('span');
    title.className = 'batch-item-title';
    title.textContent = `${set.setId} - ${set.setName}`;

    const sub = document.createElement('span');
    sub.className = 'batch-item-sub';
    sub.textContent = `${set.series || 'Serie unbekannt'} - ${set.totalCards || '?'} Karten`;

    main.append(title, sub);
    row.append(input, main);
    fragment.appendChild(row);
  });

  dom.manageSetsList.innerHTML = '';
  dom.manageSetsList.appendChild(fragment);
  updateManageSetsInfo(filtered);
}

function openManageImportedSetsDialog() {
  state.manageSetsSelection.clear();
  if (dom.manageSetsSearch) dom.manageSetsSearch.value = '';
  renderManageImportedSetsList();
  dom.manageSetsDialog?.showModal();
}

async function reimportSelectedImportedSets() {
  const selectedIds = Array.from(state.manageSetsSelection);
  if (!selectedIds.length) {
    showToast('Bitte mindestens ein Set auswaehlen.', 'info');
    return;
  }

  const selectedSets = selectedIds.map((id) => getSetById(id)).filter(Boolean);
  dom.manageSetsDialog?.close();
  await importSetsSequential(selectedSets, { successMessage: '{count} ausgewaehlte Sets aktualisiert.' });
}

async function deleteSelectedImportedSets() {
  const selectedIds = Array.from(state.manageSetsSelection);
  if (!selectedIds.length) {
    showToast('Bitte mindestens ein Set auswaehlen.', 'info');
    return;
  }

  const selectedSets = selectedIds
    .map((id) => getSetById(id))
    .filter((set) => set && toBoolean(set.imported));

  if (!selectedSets.length) {
    showToast('Keine lschbaren importierten Sets ausgewaehlt.', 'info');
    return;
  }

  const ok = window.confirm(`${selectedSets.length} importierte Sets wirklich loeschen?`);
  if (!ok) return;

  dom.manageSetsDialog?.close();
  setLoading(true, 'Loesche ausgewaehlte Sets');
  let deleted = 0;
  let failed = 0;
  try {
    for (const set of selectedSets) {
      try {
        await deleteSetFromCollection(set, { skipReload: true, skipConfirm: true });
        deleted++;
      } catch (err) {
        console.warn('[deleteSelectedImportedSets]', set?.setId, err);
        failed++;
      }
    }
  } finally {
    setLoading(false);
  }

  state.summaryData = null;
  await loadSets();
  await renderDashboard();
  showToast(`${deleted} geloescht${failed ? `, ${failed} Fehler` : ''}.`, failed ? 'error' : 'success', 4500);
}

export function initManageImportedSetsDialog() {
  dom.btnManageImportedSets?.addEventListener('click', openManageImportedSetsDialog);
  dom.manageSetsSearch?.addEventListener('input', () => renderManageImportedSetsList());
  dom.btnManageSetsSelectVisible?.addEventListener('click', () => {
    dom.manageSetsList?.querySelectorAll('.batch-item input[type="checkbox"]').forEach((input) => {
      const label = input.closest('.batch-item')?.querySelector('.batch-item-title')?.textContent || '';
      const setId = label.split(' - ')[0] || '';
      if (setId) state.manageSetsSelection.add(setId);
    });
    renderManageImportedSetsList();
  });
  dom.btnManageSetsClearSelection?.addEventListener('click', () => {
    state.manageSetsSelection.clear();
    renderManageImportedSetsList();
  });
  dom.btnManageSetsReimportSelected?.addEventListener('click', reimportSelectedImportedSets);
  dom.btnManageSetsDeleteSelected?.addEventListener('click', deleteSelectedImportedSets);
  dom.btnManageSetsCancel?.addEventListener('click', () => dom.manageSetsDialog?.close());

  dom.btnSheetsRetryReport?.addEventListener('click', openSheetsRetryReportDialog);
  dom.btnSheetsRetryReset?.addEventListener('click', () => resetSheetsRetryMetrics());
  dom.btnSheetsRetryClose?.addEventListener('click', () => dom.sheetsRetryDialog?.close());
}

export async function reimportAllImportedSets() {
  if (!state.sets.length) {
    showToast('Keine importierten Sets vorhanden.', 'info');
    return;
  }
  const ok = window.confirm(`${state.sets.length} importierte Sets neu laden? Bestehende Sammel-Checks bleiben erhalten.`);
  if (!ok) return;
  await importSetsSequential(state.sets, { successMessage: '{count} importierte Sets aktualisiert.' });
}

export async function exportCollectionSummaryCsv() {
  // Export vollstaendig aus dem Sheet (inkl. in der Anzeige ausgeblendeter Sets); state.summaryData ist gefiltert.
  const rows = await readSummarySheet().catch(() => (Array.isArray(state.summaryData) ? state.summaryData : []));
  if (!rows.length) {
    showToast('Keine Summary-Daten zum Export vorhanden.', 'info');
    return;
  }

  const csvRows = [
    'Set,Total,Collected,RH,Percent,PTCGO',
    ...rows.map((row) => [
      row.setName,
      row.total,
      row.collected,
      row.rh,
      row.percent,
      row.ptcgoCode || ''
    ].map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','))
  ];

  const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 10);
  const a = Object.assign(document.createElement('a'), {
    href: url,
    download: `sammlung_summary_${stamp}.csv`
  });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Summary als CSV exportiert.', 'success');
}

async function exportCollectionBackup() {
  if (!allImportedSets().length) {
    showToast('Keine importierten Sets fuer Backup vorhanden.', 'info');
    return;
  }

  setLoading(true, 'Erstelle Backup...');
  try {
    // db_collection einmal strikt lesen; Registry-Karten nur fuer Sets mit Haken (lazy). Jeder Lesefehler
    // bricht den Export ab (BackupExportError) – nie ein unvollstaendiges Backup schreiben.
    const backupSets = await buildCollectionBackupSets(allImportedSets(), {
      listSetIds: () => listCollectionSetIds({ checkedOnly: true, strict: true }),
      ensureResolver: (setId) => ensureResolverForSet(setId),
      readMap: (set) => readSetCollectionMap(set.setName, { setId: set.setId, strict: true }),
      onProgress: (index, total, set) => setGlobalStatus(`Backup ${index + 1}/${total}: ${set.setName}`)
    });

    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const payload = {
      app: 'poke-tcg-try4',
      version: 2, // cardId = collectionKey (v3), Sets kanonisch
      createdAt: new Date().toISOString(),
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      sets: backupSets
    };
    downloadJson(`poke_collection_backup_${stamp}.json`, payload);
    showToast(`Backup exportiert (${backupSets.length} Sets).`, 'success', 4000);
  } catch (err) {
    console.error('[exportCollectionBackup]', err);
    showToast(`Backup-Export fehlgeschlagen: ${err.message}`, 'error', 8000);
  } finally {
    setLoading(false);
  }
}

export async function runDataHealthCheck({ autoFix = false } = {}) {
  if (!state.sets.length) {
    showToast('Keine importierten Sets fuer Datencheck.', 'info');
    return;
  }

  setLoading(true, 'Datencheck laeuft');
  const report = {
    createdAt: new Date().toISOString(),
    checkedSets: state.sets.length,
    mismatches: [],
    errors: []
  };
  const mismatchSets = [];
  const job = startJob(autoFix ? 'Datencheck + Auto-Fix' : 'Datencheck', state.sets.length);

  try {
    for (let index = 0; index < state.sets.length; index++) {
      assertJobNotCancelled(job);
      const set = state.sets[index];
      setGlobalStatus(`Datencheck ${index + 1}/${state.sets.length}: ${set.setName}`);
      updateJob(job, index, `Datencheck ${index + 1}/${state.sets.length}: ${set.setName}`);
      try {
        const [apiCards, sheetMap] = await Promise.all([
          fetchMergedCards(set.setId),
          readSetCollectionMap(set.setName, { setId: set.setId })
        ]);

        // Kanonische v3-Karten gegen die alias-faehige Sammlungs-Map (zusammengefuehrte Untersets wie
        // swsh12pt5gg zaehlen zum Hauptset; Waisen/mehrdeutige Altzeilen sind keine Abweichung).
        const comparison = compareSetCollection(apiCards, sheetMap);
        const { apiCount, sheetCount } = comparison;
        if (comparison.mismatch) {
          mismatchSets.push(set);
          report.mismatches.push({
            setId: set.setId,
            setName: set.setName,
            apiCount,
            sheetCount,
            missingKeys: comparison.missingKeys.slice(0, 50),
            extraKeys: comparison.extraKeys.slice(0, 50),
            orphanCount: comparison.orphanCount,
            delta: sheetCount - apiCount
          });
        }
      } catch (err) {
        report.errors.push({ setId: set.setId, setName: set.setName, error: err.message });
      }
    }
    updateJob(job, state.sets.length, `Datencheck beendet: ${report.mismatches.length} Abweichungen`);
  } catch (err) {
    finishJob(job, err.message || 'Datencheck abgebrochen', true);
    throw err;
  } finally {
    setLoading(false);
  }

  if (!report.mismatches.length && !report.errors.length) {
    finishJob(job, 'Keine Abweichungen gefunden', false);
    showToast(`Datencheck ok: ${report.checkedSets} Sets geprft, keine Abweichungen.`, 'success', 4500);
    return;
  }

  console.group('[DataHealthCheck] Bericht');
  if (report.mismatches.length) console.table(report.mismatches);
  if (report.errors.length) console.table(report.errors);
  console.groupEnd();

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  downloadJson(`poke_data_health_${stamp}.json`, report);
  showToast(`Datencheck fertig: ${report.mismatches.length} Abweichungen, ${report.errors.length} Fehler. Report exportiert.`, 'error', 6500);

  if (!autoFix || !mismatchSets.length) {
    finishJob(job, `Datencheck abgeschlossen (${report.mismatches.length} Abweichungen)`, true);
    return;
  }

  const confirmText = `${mismatchSets.length} Set${mismatchSets.length === 1 ? '' : 's'} mit Abweichungen automatisch reimportieren?`;
  const ok = window.confirm(confirmText);
  if (!ok) {
    finishJob(job, 'Auto-Fix abgebrochen', true);
    return;
  }

  // Auto-Snapshot vor dem Auto-Fix erstellen
  try {
    const currentCollection = state.collection || {};
    const action = `Auto-Fix: ${mismatchSets.length} Set(s) mit Abweichungen`;
    await createAutoSnapshot(action, currentCollection);
  } catch (err) {
    console.warn('Auto-snapshot vor Auto-Fix fehlgeschlagen:', err);
    // Fehler blockiert nicht das Auto-Fix
  }

  const uniqueSets = Array.from(new Map(mismatchSets.map((set) => [set.setId, set])).values());
  await importSetsSequential(uniqueSets, { successMessage: '{count} Mismatch-Set(s) automatisch repariert.' });
  finishJob(job, `Auto-Fix ausgefuehrt (${uniqueSets.length} Sets)`, false);
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

  let updated = 0;
  let skipped = 0;
  let unresolvedCards = 0;
  let ambiguousCards = 0;
  const version = Number(payload?.version) || 1;

  // Backup-Sets dem Live-Set zuordnen (auch ueber Aliase, z. B. swsh12pt5gg/TCGDEX-30th-c) und je Live-Set
  // zusammenfuehren (ODER), damit ein Alias-Backup die Haken des Hauptsets nicht abwaehlt.
  const byLiveSet = new Map();
  for (const backupSet of sets) {
    const liveSet = findSetByIdOrAlias(allImportedSets(), backupSet?.setId);
    if (!liveSet) {
      skipped++;
      continue;
    }
    if (!byLiveSet.has(liveSet.setId)) byLiveSet.set(liveSet.setId, { liveSet, backupSets: [] });
    byLiveSet.get(liveSet.setId).backupSets.push(backupSet);
  }

  setLoading(true, 'Spiele Backup ein...');
  try {
    // Einmal frisch lesen (Cache verwerfen) statt je Set: bei 100-200 Sets waeren das sonst ebenso viele
    // volle db_collection-Reads und die Sheets-Quote wuerde den Restore mittendrin abbrechen. Die eigenen
    // Writes fuehrt sheets-db im Zeilen-Cache mit.
    invalidateCollectionRowCache();
    let setIndex = 0;
    for (const { liveSet, backupSets } of byLiveSet.values()) {
      setIndex++;
      setGlobalStatus(`Backup ${setIndex}/${byLiveSet.size}: ${liveSet.setName}`);
      // Schluessel gelten im Namensraum der Backup-Set-ID (v1: Nummern, bei TCGDEX-Aliasen localIds):
      // Aufloesung ueber die Registry; mehrdeutig/nicht aufloesbar -> uebersprungen, nie der rohe Schluessel.
      const resolver = await ensureResolverForSet(liveSet.setId);
      const { snapshot, protectedKeys, unresolved, ambiguous } = buildBackupRestoreSnapshot(backupSets, {
        liveSetId: liveSet.setId,
        version,
        resolver
      });
      unresolvedCards += unresolved;
      ambiguousCards += ambiguous;
      // Strikt lesen (Stand der einen frischen Lesung oben); ein Lesefehler bricht ab, statt gegen eine
      // leere Map zu planen.
      const liveMap = await readSetCollectionMap(liveSet.setName, { setId: liveSet.setId, strict: true });
      const pendingUpdates = [];
      const restorePlan = planBackupRestore(liveMap, {
        snapshot,
        protectedKeys,
        // Nicht aufloesbare Schluessel koennten jede Karte meinen: dann nur Haken setzen, keine entfernen.
        allowUncheck: unresolved === 0,
        hasCells: hasEntryCells
      });
      for (const { entry, target } of restorePlan) {
        pendingUpdates.push(...stateCellUpdates(entry, target));
        applyEntryState(entry, target);
        updated++;
      }
      if (pendingUpdates.length) {
        await updateCellBooleansBatch(liveSet.setName, pendingUpdates, { chunkSize: 200 });
      }
    }
  } finally {
    setLoading(false);
  }

  state.summaryData = null;
  if (state.currentSet) {
    await loadCurrentSet(true).catch(() => {});
  }
  const notAssigned = unresolvedCards + ambiguousCards;
  const notAssignedText = notAssigned
    ? ` Nicht zuordenbare Karten: ${notAssigned} (${ambiguousCards} mehrdeutig, ${unresolvedCards} unbekannt) - nicht geschrieben.`
    : '';
  showToast(`Backup eingespielt. aenderungen: ${updated}, uebersprungene Sets: ${skipped}.${notAssignedText}`,
    skipped || notAssigned ? 'info' : 'success', notAssigned ? 8000 : 5000);
}

export function initBackupImportExport() {
  dom.btnExportBackup?.addEventListener('click', exportCollectionBackup);
  dom.btnImportBackup?.addEventListener('click', () => dom.backupFileInput?.click());
  dom.btnImportLegacyXlsx?.addEventListener('click', () => dom.legacyImportFileInput?.click());
  dom.btnImportLegacySheet?.addEventListener('click', openLegacySheetImportDialog);
  dom.btnLegacySheetCancel?.addEventListener('click', () => dom.legacySheetDialog?.close());
  dom.btnLegacySheetImportConfirm?.addEventListener('click', submitLegacySheetImportDialog);
  dom.legacySheetInput?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    submitLegacySheetImportDialog();
  });
  dom.btnLegacySelectionAll?.addEventListener('click', () => setAllLegacyImportSelections(true));
  dom.btnLegacySelectionNone?.addEventListener('click', () => setAllLegacyImportSelections(false));
  dom.btnLegacySelectionCancel?.addEventListener('click', () => closeLegacyImportSelectionDialog(null));
  dom.btnLegacySelectionConfirm?.addEventListener('click', confirmLegacyImportSelectionDialog);
  dom.legacySelectionSearch?.addEventListener('input', renderLegacyImportSelectionDialog);
  dom.legacySelectionTree?.addEventListener('change', handleLegacyImportSelectionTreeChange);
  dom.legacySelectionTree?.addEventListener('click', (event) => {
    if (event.target?.closest?.('.legacy-tree-summary-check')) {
      event.stopPropagation();
    }
  }, true);
  dom.legacySelectionTree?.addEventListener('toggle', handleLegacyImportSelectionTreeToggle, true);
  dom.legacySelectionDialog?.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeLegacyImportSelectionDialog(null);
  });

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

export async function reimportCurrentSetFromApi() {
  if (!state.currentSet) {
    showToast('Kein aktuelles Set geladen.', 'info');
    return;
  }
  const set = getSetById(state.currentSet.setId) || state.currentSet;
  const ok = window.confirm(`Set "${set.setName}" neu importieren? Vorhandene Sammel-Checks bleiben erhalten.`);
  if (!ok) return;

  await importSetsSequential([set], { successMessage: 'Set erfolgreich reimportiert.' });
  dom.selector.value = set.setId;
  navigate(`set/${set.setId}`);
  await loadCurrentSet(true);
}
