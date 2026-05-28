function loadQueuePresetsFromStorage(storageRef, storageKey) {
  try {
    const raw = storageRef.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.name === 'string' && Array.isArray(item.actionIds))
      .map((item) => ({ name: item.name, actionIds: item.actionIds }));
  } catch {
    return [];
  }
}

function persistQueuePresets(storageRef, storageKey, state) {
  storageRef.setItem(storageKey, JSON.stringify(state.queuePresets));
}

function renderQueuePresetSelect(dom, state) {
  if (!dom.queuePresetSelect) return;
  dom.queuePresetSelect.innerHTML = '<option value="">Preset laden…</option>';
  state.queuePresets.forEach((preset, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = preset.name;
    dom.queuePresetSelect.appendChild(option);
  });
}

function moveQueueAction(state, sourceId, targetId) {
  const sourceIndex = state.queueBuilderSequence.indexOf(sourceId);
  const targetIndex = state.queueBuilderSequence.indexOf(targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
  const [item] = state.queueBuilderSequence.splice(sourceIndex, 1);
  state.queueBuilderSequence.splice(targetIndex, 0, item);
}

export function initQueueBuilderDialog({
  dom,
  state,
  storageKey,
  getActionsCatalog,
  enqueueAction,
  showToast,
  downloadJson,
  storageRef = globalThis.localStorage,
  prompt = (message, initialValue = '') => globalThis.prompt(message, initialValue),
  confirm = (message) => globalThis.confirm(message),
  logger = console,
} = {}) {
  function saveCurrentQueuePreset() {
    if (!state.queueBuilderSequence.length) {
      showToast('Keine Aktionen für Preset ausgewählt.', 'info');
      return;
    }
    const name = prompt('Preset-Name:');
    if (!name) return;
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const existingIndex = state.queuePresets.findIndex((preset) => preset.name.toLowerCase() === trimmedName.toLowerCase());
    const payload = { name: trimmedName, actionIds: [...state.queueBuilderSequence] };
    if (existingIndex >= 0) {
      state.queuePresets[existingIndex] = payload;
    } else {
      state.queuePresets.push(payload);
    }
    persistQueuePresets(storageRef, storageKey, state);
    renderQueuePresetSelect(dom, state);
    showToast(`Preset gespeichert: ${trimmedName}`, 'success', 2500);
  }

  function deleteSelectedQueuePreset() {
    const idx = Number(dom.queuePresetSelect?.value ?? '-1');
    if (!Number.isInteger(idx) || idx < 0 || idx >= state.queuePresets.length) {
      showToast('Bitte ein Preset auswählen.', 'info');
      return;
    }
    const presetName = state.queuePresets[idx].name;
    const ok = confirm(`Preset „${presetName}“ löschen?`);
    if (!ok) return;
    state.queuePresets.splice(idx, 1);
    persistQueuePresets(storageRef, storageKey, state);
    renderQueuePresetSelect(dom, state);
    if (dom.queuePresetSelect) dom.queuePresetSelect.value = '';
    showToast(`Preset gelöscht: ${presetName}`, 'info', 2500);
  }

  function renameSelectedQueuePreset() {
    const idx = Number(dom.queuePresetSelect?.value ?? '-1');
    if (!Number.isInteger(idx) || idx < 0 || idx >= state.queuePresets.length) {
      showToast('Bitte ein Preset auswählen.', 'info');
      return;
    }
    const preset = state.queuePresets[idx];
    const newName = prompt('Neuer Name:', preset.name);
    if (newName === null) return;
    const trimmedName = newName.trim();
    if (!trimmedName) return;
    const collision = state.queuePresets.findIndex((entry, index) => index !== idx && entry.name.toLowerCase() === trimmedName.toLowerCase());
    if (collision >= 0) {
      showToast(`Name „${trimmedName}" wird bereits verwendet.`, 'error', 3500);
      return;
    }
    preset.name = trimmedName;
    persistQueuePresets(storageRef, storageKey, state);
    renderQueuePresetSelect(dom, state);
    dom.queuePresetSelect.value = String(idx);
    showToast(`Preset umbenannt: ${trimmedName}`, 'success', 2500);
  }

  function duplicateSelectedQueuePreset() {
    const idx = Number(dom.queuePresetSelect?.value ?? '-1');
    if (!Number.isInteger(idx) || idx < 0 || idx >= state.queuePresets.length) {
      showToast('Bitte ein Preset auswählen.', 'info');
      return;
    }
    const preset = state.queuePresets[idx];
    const defaultName = `${preset.name} (Kopie)`;
    const newName = prompt('Name der Kopie:', defaultName);
    if (newName === null) return;
    const trimmedName = newName.trim();
    if (!trimmedName) return;
    const collision = state.queuePresets.findIndex((entry) => entry.name.toLowerCase() === trimmedName.toLowerCase());
    if (collision >= 0) {
      showToast(`Name „${trimmedName}" wird bereits verwendet.`, 'error', 3500);
      return;
    }
    const copy = { name: trimmedName, actionIds: [...preset.actionIds] };
    state.queuePresets.splice(idx + 1, 0, copy);
    persistQueuePresets(storageRef, storageKey, state);
    renderQueuePresetSelect(dom, state);
    dom.queuePresetSelect.value = String(idx + 1);
    showToast(`Preset dupliziert: ${trimmedName}`, 'success', 2500);
  }

  function renderQueueBuilderSelected(catalog) {
    if (!dom.queueBuilderSelected) return;
    dom.queueBuilderSelected.innerHTML = '';

    if (!state.queueBuilderSequence.length) {
      const empty = document.createElement('li');
      empty.className = 'queue-selected-empty';
      empty.textContent = 'Noch keine Aktion ausgewählt.';
      dom.queueBuilderSelected.appendChild(empty);
      return;
    }

    const byId = new Map(catalog.map((item) => [item.id, item]));
    state.queueBuilderSequence.forEach((actionId, index) => {
      const item = byId.get(actionId);
      if (!item) return;

      const li = document.createElement('li');
      li.className = 'queue-selected-item';
      li.draggable = true;
      li.dataset.actionId = actionId;

      const label = document.createElement('span');
      label.className = 'queue-selected-label';
      label.textContent = `${index + 1}. ${item.label}`;

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn-secondary';
      removeBtn.textContent = 'Entfernen';
      removeBtn.addEventListener('click', () => {
        state.queueBuilderSelection = state.queueBuilderSelection.filter((id) => id !== actionId);
        state.queueBuilderSequence = state.queueBuilderSequence.filter((id) => id !== actionId);
        renderQueueBuilder();
      });

      li.addEventListener('dragstart', (event) => {
        event.dataTransfer?.setData('text/plain', actionId);
        event.dataTransfer.effectAllowed = 'move';
      });

      li.addEventListener('dragover', (event) => {
        event.preventDefault();
        li.classList.add('drag-over');
      });

      li.addEventListener('dragleave', () => {
        li.classList.remove('drag-over');
      });

      li.addEventListener('drop', (event) => {
        event.preventDefault();
        li.classList.remove('drag-over');
        const sourceId = event.dataTransfer?.getData('text/plain');
        if (!sourceId) return;
        moveQueueAction(state, sourceId, actionId);
        renderQueueBuilder();
      });

      li.append(label, removeBtn);
      dom.queueBuilderSelected.appendChild(li);
    });
  }

  function applySelectedQueuePreset() {
    const idx = Number(dom.queuePresetSelect?.value ?? '-1');
    if (!Number.isInteger(idx) || idx < 0 || idx >= state.queuePresets.length) return;
    const preset = state.queuePresets[idx];
    const validIds = new Set(getActionsCatalog().map((action) => action.id));
    state.queueBuilderSequence = preset.actionIds.filter((id) => validIds.has(id));
    state.queueBuilderSelection = [...state.queueBuilderSequence];
    renderQueueBuilder();
  }

  function exportQueuePresetsJson() {
    if (!state.queuePresets.length) {
      showToast('Keine Presets zum Exportieren.', 'info');
      return;
    }
    const payload = {
      app: 'poke-tcg-try4',
      type: 'queue-presets',
      version: 1,
      exportedAt: new Date().toISOString(),
      presets: state.queuePresets
    };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    downloadJson(`poke_queue_presets_${stamp}.json`, payload);
    showToast(`${state.queuePresets.length} Preset(s) exportiert.`, 'success', 3000);
  }

  function normalizeImportedPresets(raw) {
    const presets = Array.isArray(raw?.presets) ? raw.presets : (Array.isArray(raw) ? raw : []);
    const validIds = new Set(getActionsCatalog().map((item) => item.id));
    const normalized = [];

    presets.forEach((entry) => {
      const name = String(entry?.name ?? '').trim();
      const actionIds = Array.isArray(entry?.actionIds)
        ? entry.actionIds.filter((id) => validIds.has(id))
        : [];
      if (!name || !actionIds.length) return;
      normalized.push({ name, actionIds: Array.from(new Set(actionIds)) });
    });

    return normalized;
  }

  function mergeQueuePresets(importedPresets) {
    let added = 0;
    let updated = 0;
    importedPresets.forEach((incoming) => {
      const index = state.queuePresets.findIndex((preset) => preset.name.toLowerCase() === incoming.name.toLowerCase());
      if (index >= 0) {
        state.queuePresets[index] = incoming;
        updated++;
      } else {
        state.queuePresets.push(incoming);
        added++;
      }
    });
    persistQueuePresets(storageRef, storageKey, state);
    renderQueuePresetSelect(dom, state);
    return { added, updated };
  }

  function renderQueueBuilder() {
    const catalog = getActionsCatalog();
    dom.queueBuilderList.innerHTML = '';
    const fragment = document.createDocumentFragment();

    catalog.forEach((item, index) => {
      const row = document.createElement('label');
      row.className = 'queue-builder-item';

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = state.queueBuilderSelection.includes(item.id);
      input.addEventListener('change', () => {
        if (input.checked) {
          if (!state.queueBuilderSelection.includes(item.id)) {
            state.queueBuilderSelection.push(item.id);
          }
          if (!state.queueBuilderSequence.includes(item.id)) {
            state.queueBuilderSequence.push(item.id);
          }
        } else {
          state.queueBuilderSelection = state.queueBuilderSelection.filter((id) => id !== item.id);
          state.queueBuilderSequence = state.queueBuilderSequence.filter((id) => id !== item.id);
        }
        renderQueueBuilderSelected(catalog);
      });

      const main = document.createElement('div');
      main.className = 'batch-item-main';
      const title = document.createElement('span');
      title.className = 'batch-item-title';
      title.textContent = `${index + 1}. ${item.label}`;
      const sub = document.createElement('span');
      sub.className = 'batch-item-sub';
      sub.textContent = item.description;
      main.append(title, sub);

      row.append(input, main);
      fragment.appendChild(row);
    });

    dom.queueBuilderList.appendChild(fragment);
    renderQueueBuilderSelected(catalog);
  }

  function openQueueBuilderDialog() {
    state.queueBuilderSelection = [];
    state.queueBuilderSequence = [];
    if (!state.queuePresets.length) {
      state.queuePresets = loadQueuePresetsFromStorage(storageRef, storageKey);
    }
    renderQueuePresetSelect(dom, state);
    if (dom.queuePresetSelect) dom.queuePresetSelect.value = '';
    renderQueueBuilder();
    dom.queueBuilderDialog.showModal();
  }

  state.queuePresets = loadQueuePresetsFromStorage(storageRef, storageKey);
  renderQueuePresetSelect(dom, state);

  dom.btnQueueBuilder?.addEventListener('click', openQueueBuilderDialog);
  dom.btnQueueBuilderCancel?.addEventListener('click', () => dom.queueBuilderDialog?.close());
  dom.queuePresetSelect?.addEventListener('change', applySelectedQueuePreset);
  dom.btnQueuePresetSave?.addEventListener('click', saveCurrentQueuePreset);
  dom.btnQueuePresetRename?.addEventListener('click', renameSelectedQueuePreset);
  dom.btnQueuePresetDuplicate?.addEventListener('click', duplicateSelectedQueuePreset);
  dom.btnQueuePresetDelete?.addEventListener('click', deleteSelectedQueuePreset);
  dom.btnQueuePresetExport?.addEventListener('click', exportQueuePresetsJson);
  dom.btnQueuePresetImport?.addEventListener('click', () => dom.queuePresetFileInput?.click());

  dom.queuePresetFileInput?.addEventListener('change', async () => {
    const file = dom.queuePresetFileInput.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const imported = normalizeImportedPresets(parsed);
      if (!imported.length) {
        showToast('Keine gültigen Presets im Import gefunden.', 'error', 4500);
        return;
      }
      const { added, updated } = mergeQueuePresets(imported);
      showToast(`Presets importiert: ${added} neu, ${updated} aktualisiert.`, 'success', 4000);
    } catch (err) {
      logger.error('[queuePresetImport]', err);
      showToast(`Preset-Import fehlgeschlagen: ${err.message}`, 'error', 5000);
    } finally {
      dom.queuePresetFileInput.value = '';
    }
  });

  dom.btnQueueBuilderAdd?.addEventListener('click', () => {
    const catalog = getActionsCatalog();
    const byId = new Map(catalog.map((item) => [item.id, item]));
    const selected = state.queueBuilderSequence
      .map((id) => byId.get(id))
      .filter(Boolean);

    if (!selected.length) {
      showToast('Bitte mindestens eine Aktion wählen.', 'info');
      return;
    }

    selected.forEach((item) => enqueueAction(item.label, item.action));
    dom.queueBuilderDialog.close();
    showToast(`${selected.length} Aktion(en) in Reihenfolge zur Queue hinzugefügt.`, 'success', 3000);
  });
}