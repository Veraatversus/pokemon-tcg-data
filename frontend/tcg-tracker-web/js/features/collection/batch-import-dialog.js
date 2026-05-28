export function createBatchImportDialogController({
  state,
  dom,
  getSetById,
  importSetsSequential,
  showToast,
} = {}) {
  function getBatchCandidates() {
    return (state.allSets || []).filter((set) => !set.imported);
  }

  function updateBatchInfo() {
    const selected = state.batchSelection.size;
    dom.batchInfo.classList.remove('hidden');
    dom.batchInfo.textContent = `${selected} Set${selected === 1 ? '' : 's'} ausgewählt`;
  }

  function renderBatchDialogList() {
    const query = String(dom.batchSearchInput?.value || '').trim().toLowerCase();
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
      title.textContent = `${set.setId} — ${set.setName}`;

      const sub = document.createElement('span');
      sub.className = 'batch-item-sub';
      sub.textContent = `${set.series || 'Serie unbekannt'} • ${set.totalCards || '?'} Karten`;

      main.append(title, sub);
      row.append(input, main);
      fragment.appendChild(row);
    });

    dom.batchList.appendChild(fragment);
    updateBatchInfo();
  }

  function openBatchImportDialog() {
    state.batchSelection.clear();
    dom.batchSearchInput.value = '';
    renderBatchDialogList();
    dom.batchDialog.showModal();
  }

  function initBatchImportDialog() {
    dom.batchSearchInput?.addEventListener('input', renderBatchDialogList);

    dom.btnBatchSelectVisible?.addEventListener('click', () => {
      const checkboxes = dom.batchList.querySelectorAll('input[type="checkbox"]');
      checkboxes.forEach((checkbox) => {
        checkbox.checked = true;
        const label = checkbox.closest('.batch-item')?.querySelector('.batch-item-title')?.textContent || '';
        const setId = label.split(' — ')[0] || '';
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
        showToast('Bitte mindestens ein Set auswählen.', 'info');
        return;
      }
      dom.batchDialog.close();
      const targetSets = selectedIds.map((id) => getSetById(id)).filter(Boolean);
      await importSetsSequential(targetSets, { successMessage: '{count} Sets per Batch importiert.' });
    });
  }

  return {
    getBatchCandidates,
    updateBatchInfo,
    renderBatchDialogList,
    openBatchImportDialog,
    initBatchImportDialog,
  };
}
