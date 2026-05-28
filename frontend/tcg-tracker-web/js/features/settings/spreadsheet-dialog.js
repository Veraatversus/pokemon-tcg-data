import { eventBus } from '../../core/event-bus.js';
import { EVENT_SPREADSHEET_SWITCHED } from '../../core/storage-keys.js';

export function createSpreadsheetDialogController(deps = {}) {
  const {
    dom,
    state,
    config,
    showToast,
    signIn,
    resetSheetsDataCaches,
    resetRuntimeUiForSpreadsheetSwitch,
    loadSets,
    gapiRef = globalThis.gapi,
  } = deps;

  function closeOtherOpenDialogs(except = []) {
    const keep = new Set(except.filter(Boolean));
    document.querySelectorAll('dialog[open]').forEach((dialog) => {
      if (keep.has(dialog)) return;
      try {
        dialog.close();
      } catch {
        // ignore dialogs that cannot be closed in current state
      }
    });
  }

  function extractSpreadsheetId(input) {
    if (!input) return null;
    const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (match) return match[1];
    if (/^[a-zA-Z0-9_-]{20,}$/.test(String(input).trim())) return String(input).trim();
    return null;
  }

  function setSpreadsheetDialogError(message = '', isError = true) {
    if (!dom.dialogError) return;
    dom.dialogError.textContent = message;
    dom.dialogError.style.color = isError ? 'var(--color-danger)' : 'var(--color-muted)';
    dom.dialogError.classList.toggle('hidden', !message);
  }

  function parseDriveSpreadsheetFile(file, sourceLabel) {
    return {
      id: String(file?.id || '').trim(),
      name: String(file?.name || 'Unbenannte Tabelle').trim(),
      source: sourceLabel,
    };
  }

  async function listAccessibleSpreadsheets() {
    const baseQuery = "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false";
    const fields = 'files(id,name,owners(displayName,emailAddress),shared),nextPageToken';

    async function listAllFiles(query) {
      const files = [];
      let pageToken;

      do {
        const response = await gapiRef.client.drive.files.list({
          q: query,
          pageSize: 100,
          orderBy: 'modifiedTime desc',
          fields,
          includeItemsFromAllDrives: true,
          supportsAllDrives: true,
          pageToken,
        });

        files.push(...(response?.result?.files || []));
        pageToken = response?.result?.nextPageToken || null;
      } while (pageToken);

      return files;
    }

    const [ownFiles, sharedFiles] = await Promise.all([
      listAllFiles(`${baseQuery} and 'me' in owners`),
      listAllFiles(`${baseQuery} and sharedWithMe=true`),
    ]);

    const all = [];
    const seen = new Set();

    const addFiles = (files, label) => {
      (files || []).forEach((file) => {
        const parsed = parseDriveSpreadsheetFile(file, label);
        if (!parsed.id || seen.has(parsed.id)) return;
        seen.add(parsed.id);
        all.push(parsed);
      });
    };

    addFiles(ownFiles, 'Eigene Datei');
    addFiles(sharedFiles, 'Freigegeben');

    all.sort((left, right) => left.name.localeCompare(right.name, 'de', { sensitivity: 'base' }));
    return all;
  }

  function renderSpreadsheetOptions(items = []) {
    if (!dom.dialogExistingSelect) return;
    const currentId = config.SPREADSHEET_ID || '';
    dom.dialogExistingSelect.innerHTML = '<option value="">Bitte Tabelle auswählen…</option>';

    if (!items.length) {
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = 'Keine Tabellen gefunden';
      dom.dialogExistingSelect.appendChild(empty);
      if (dom.btnSpreadsheetUseSelected) dom.btnSpreadsheetUseSelected.disabled = true;
      return;
    }

    items.forEach((item) => {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = `${item.name} — ${item.source}`;
      dom.dialogExistingSelect.appendChild(option);
    });

    if (currentId && items.some((item) => item.id === currentId)) {
      dom.dialogExistingSelect.value = currentId;
    }

    if (dom.btnSpreadsheetUseSelected) dom.btnSpreadsheetUseSelected.disabled = false;
  }

  async function refreshSpreadsheetList(options = {}) {
    const allowReauth = options.allowReauth !== false;
    if (!dom.dialogExistingSelect || !state.loggedIn) return;

    try {
      dom.dialogExistingSelect.disabled = true;
      if (dom.btnSpreadsheetRefresh) dom.btnSpreadsheetRefresh.disabled = true;
      setSpreadsheetDialogError('Tabellen werden geladen…', false);
      const items = await listAccessibleSpreadsheets();
      renderSpreadsheetOptions(items);
      setSpreadsheetDialogError('');
    } catch (err) {
      console.error('[refreshSpreadsheetList]', err);

      const status = err?.status || err?.result?.error?.code;
      const reason = err?.result?.error?.status || '';
      const missingScope = status === 401 || status === 403 || reason === 'PERMISSION_DENIED';

      if (allowReauth && missingScope) {
        setSpreadsheetDialogError('Berechtigungen werden aktualisiert…', false);
        const reauthed = await signIn({ forceConsent: true });
        if (reauthed) {
          await refreshSpreadsheetList({ allowReauth: false });
          return;
        }
      }

      setSpreadsheetDialogError('Tabellen konnten nicht geladen werden. Falls nötig bitte einmal neu einloggen.');
    } finally {
      dom.dialogExistingSelect.disabled = false;
      if (dom.btnSpreadsheetRefresh) dom.btnSpreadsheetRefresh.disabled = false;
    }
  }

  async function applySpreadsheetSelection(id) {
    if (!id) {
      setSpreadsheetDialogError('Bitte eine Tabelle auswählen oder ID/URL eingeben.');
      return;
    }

    const nextId = String(id).trim();
    const previousId = config.SPREADSHEET_ID;

    try {
      setSpreadsheetDialogError('Prüfe Tabellenzugriff…', false);
      await gapiRef.client.sheets.spreadsheets.get({
        spreadsheetId: nextId,
        fields: 'spreadsheetId,properties(title)',
      });

      config.SPREADSHEET_ID = nextId;
      resetSheetsDataCaches();
      resetRuntimeUiForSpreadsheetSwitch();
      updateSpreadsheetInfoBar();
      await loadSets();

      const eventPayload = {
        previousSpreadsheetId: previousId || null,
        spreadsheetId: nextId,
        timestamp: Date.now(),
      };
      eventBus.emit(EVENT_SPREADSHEET_SWITCHED, eventPayload);
      // Keep DOM event compatibility for legacy listeners.
      window.dispatchEvent(new CustomEvent(EVENT_SPREADSHEET_SWITCHED, { detail: eventPayload }));

      setSpreadsheetDialogError('');
      dom.dialog?.close();
    } catch (err) {
      config.SPREADSHEET_ID = previousId;
      resetSheetsDataCaches();
      updateSpreadsheetInfoBar();
      console.error('[applySpreadsheetSelection]', err);
      setSpreadsheetDialogError(`Tabelle konnte nicht verwendet werden: ${err.message || err}`);
      showToast('Tabellenauswahl fehlgeschlagen.', 'error', 3200);
      throw err;
    }
  }

  async function createAndUseSpreadsheet() {
    const title = String(dom.dialogNewNameInput?.value || '').trim() || `Pokémon TCG Tracker ${new Date().toLocaleDateString('de-DE')}`;

    try {
      if (dom.btnSpreadsheetCreate) dom.btnSpreadsheetCreate.disabled = true;
      setSpreadsheetDialogError('Neue Tabelle wird erstellt…', false);

      const response = await gapiRef.client.sheets.spreadsheets.create({
        properties: { title },
      });

      const spreadsheetId = String(response?.result?.spreadsheetId || '').trim();
      if (!spreadsheetId) {
        throw new Error('Spreadsheet-ID wurde nicht zurückgegeben.');
      }

      await applySpreadsheetSelection(spreadsheetId);
      showToast(`Neue Tabelle erstellt: ${title}`, 'success');
    } catch (err) {
      console.error('[createAndUseSpreadsheet]', err);
      setSpreadsheetDialogError(`Neue Tabelle konnte nicht erstellt werden: ${err.message || err}`);
    } finally {
      if (dom.btnSpreadsheetCreate) dom.btnSpreadsheetCreate.disabled = false;
    }
  }

  function updateSpreadsheetInfoBar() {
    const id = config.SPREADSHEET_ID;
    if (id) {
      dom.spreadsheetLink.href = `https://docs.google.com/spreadsheets/d/${id}/edit`;
      dom.spreadsheetLink.textContent = `${id.slice(0, 22)}…`;
      dom.spreadsheetInfo.classList.remove('hidden');
    } else {
      dom.spreadsheetInfo.classList.add('hidden');
    }
  }

  function openSpreadsheetDialog(required = false) {
    dom.dialogError.textContent = '';
    dom.dialogError.classList.add('hidden');
    dom.dialogInput.value = config.SPREADSHEET_ID || '';
    if (dom.dialogNewNameInput) dom.dialogNewNameInput.value = '';
    dom.btnDialogCancel.disabled = required;
    dom.btnDialogCancel.style.display = required ? 'none' : '';
    closeOtherOpenDialogs([dom.dialog]);
    dom.dialog.showModal();
    refreshSpreadsheetList();
  }

  function initSpreadsheetDialog() {
    dom.dialog?.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !dom.btnDialogCancel.disabled) dom.dialog.close();
    });

    dom.btnDialogSave?.addEventListener('click', async () => {
      const id = extractSpreadsheetId(dom.dialogInput?.value?.trim());
      if (!id) {
        setSpreadsheetDialogError('Ungültige Spreadsheet-ID oder URL.');
        return;
      }
      try {
        await applySpreadsheetSelection(id);
      } catch {
        // Fehler wird bereits im Dialog angezeigt
      }
    });

    dom.btnDialogCancel?.addEventListener('click', () => dom.dialog?.close());
    dom.btnChangeSheet?.addEventListener('click', () => openSpreadsheetDialog(false));
    dom.btnSpreadsheetRefresh?.addEventListener('click', () => refreshSpreadsheetList());

    dom.btnSpreadsheetUseSelected?.addEventListener('click', async () => {
      const id = String(dom.dialogExistingSelect?.value || '').trim();
      try {
        await applySpreadsheetSelection(id);
      } catch {
        // Fehler wird bereits im Dialog angezeigt
      }
    });

    dom.btnSpreadsheetCreate?.addEventListener('click', async () => {
      await createAndUseSpreadsheet();
    });
  }

  return {
    initSpreadsheetDialog,
    openSpreadsheetDialog,
    updateSpreadsheetInfoBar,
  };
}
