export function createManageImportedSetsDialogController({
  state,
  dom,
  toBoolean,
  getSetById,
  importSetsSequential,
  deleteSetFromCollection,
  setLoading,
  loadSets,
  renderDashboard,
  showToast,
  openSheetsRetryReportDialog,
  resetSheetsRetryMetrics,
  confirmDelete,
} = {}) {
  function getImportedSetsForManagement() {
    return (state.allSets || []).filter((set) => toBoolean(set.imported));
  }

  function updateManageSetsInfo(filtered = []) {
    if (!dom.manageSetsInfo) return;
    const selectedCount = state.manageSetsSelection.size;
    dom.manageSetsInfo.textContent = `${selectedCount} ausgewählt • ${filtered.length} sichtbar`;
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
      dom.manageSetsList.innerHTML = '<p class="empty-state">Keine importierten Sets für den aktuellen Filter.</p>';
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
      title.textContent = `${set.setId} — ${set.setName}`;

      const sub = document.createElement('span');
      sub.className = 'batch-item-sub';
      sub.textContent = `${set.series || 'Serie unbekannt'} • ${set.totalCards || '?'} Karten`;

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
      showToast('Bitte mindestens ein Set auswählen.', 'info');
      return;
    }

    const selectedSets = selectedIds.map((id) => getSetById(id)).filter(Boolean);
    dom.manageSetsDialog?.close();
    await importSetsSequential(selectedSets, { successMessage: '{count} ausgewählte Sets aktualisiert.' });
  }

  async function deleteSelectedImportedSets() {
    const selectedIds = Array.from(state.manageSetsSelection);
    if (!selectedIds.length) {
      showToast('Bitte mindestens ein Set auswählen.', 'info');
      return;
    }

    const selectedSets = selectedIds
      .map((id) => getSetById(id))
      .filter((set) => set && toBoolean(set.imported));

    if (!selectedSets.length) {
      showToast('Keine löschbaren importierten Sets ausgewählt.', 'info');
      return;
    }

    const ok = confirmDelete(`${selectedSets.length} importierte Sets wirklich löschen?`);
    if (!ok) return;

    dom.manageSetsDialog?.close();
    setLoading(true, 'Lösche ausgewählte Sets…');
    let deleted = 0;
    let failed = 0;
    try {
      for (const set of selectedSets) {
        try {
          await deleteSetFromCollection(set, { skipReload: true, skipConfirm: true });
          deleted += 1;
        } catch (error) {
          console.warn('[deleteSelectedImportedSets]', set?.setId, error);
          failed += 1;
        }
      }
    } finally {
      setLoading(false);
    }

    state.summaryData = null;
    await loadSets();
    await renderDashboard();
    showToast(`${deleted} gelöscht${failed ? `, ${failed} Fehler` : ''}.`, failed ? 'error' : 'success', 4500);
  }

  function initManageImportedSetsDialog() {
    dom.btnManageImportedSets?.addEventListener('click', openManageImportedSetsDialog);
    dom.manageSetsSearch?.addEventListener('input', () => renderManageImportedSetsList());
    dom.btnManageSetsSelectVisible?.addEventListener('click', () => {
      dom.manageSetsList?.querySelectorAll('.batch-item input[type="checkbox"]').forEach((input) => {
        const label = input.closest('.batch-item')?.querySelector('.batch-item-title')?.textContent || '';
        const setId = label.split(' — ')[0] || '';
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

  return {
    getImportedSetsForManagement,
    updateManageSetsInfo,
    renderManageImportedSetsList,
    openManageImportedSetsDialog,
    reimportSelectedImportedSets,
    deleteSelectedImportedSets,
    initManageImportedSetsDialog,
  };
}
