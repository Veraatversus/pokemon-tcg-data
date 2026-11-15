// Spreadsheet-Dialog: Auswahl, Anlegen und Wechsel des Google-Spreadsheets.
import { signIn } from '../../core/auth.js';
import { resetSheetsDataCaches } from '../../data/sheets-db.js?v=20261115-clean-5';
import { CONFIG } from '../../core/config.js';
import { formatSpreadsheetOptionLabel, isSpreadsheetAccessDeniedError, normalizeSpreadsheetDisplayText, resolveSpreadsheetSelectionErrorMessage } from './spreadsheet-dialog-helpers.js';
import { showToast, normalizeUiText, closeOtherOpenDialogs, resetRuntimeUiForSpreadsheetSwitch } from '../../ui/helpers.js';
import { dom } from '../../app/dom.js';
import { state, uiState } from '../../app/state.js';
import { actions } from '../../app/actions.js';

function extractSpreadsheetId(input) {
  if (!input) return null;
  const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(input.trim())) return input.trim();
  return null;
}

export function openSpreadsheetDialog(required = false) {
  dom.dialogError.textContent = '';
  dom.dialogError.classList.add('hidden');
  dom.dialogInput.value = CONFIG.SPREADSHEET_ID || '';
  if (dom.dialogNewNameInput) dom.dialogNewNameInput.value = '';
  uiState.spreadsheetDialogReturnFocusEl = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
  if (dom.dialog) dom.dialog.dataset.required = required ? 'true' : 'false';
  dom.btnDialogCancel.disabled = required;
  dom.btnDialogCancel.style.display = required ? 'none' : '';
  closeOtherOpenDialogs([dom.dialog]);
  dom.dialog.showModal();
  refreshSpreadsheetList();
}

function setSpreadsheetDialogError(message = '', isError = true) {
  if (!dom.dialogError) return;
  dom.dialogError.textContent = normalizeUiText(message);
  dom.dialogError.style.color = isError ? 'var(--color-danger)' : 'var(--color-muted)';
  dom.dialogError.classList.toggle('hidden', !message);
}

function parseDriveSpreadsheetFile(file, sourceLabel) {
  return {
    id: String(file?.id || '').trim(),
    name: normalizeSpreadsheetDisplayText(file?.name || 'Unbenannte Tabelle') || 'Unbenannte Tabelle',
    source: normalizeSpreadsheetDisplayText(sourceLabel)
  };
}

async function listAccessibleSpreadsheets() {
  const baseQuery = "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false";
  const fields = 'files(id,name,owners(displayName,emailAddress),shared),nextPageToken';

  async function listAllFiles(query) {
    const files = [];
    let pageToken;

    do {
      const response = await gapi.client.drive.files.list({
        q: query,
        pageSize: 100,
        orderBy: 'modifiedTime desc',
        fields,
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
        pageToken
      });

      files.push(...(response?.result?.files || []));
      pageToken = response?.result?.nextPageToken || null;
    } while (pageToken);

    return files;
  }

  const [ownFiles, sharedFiles] = await Promise.all([
    listAllFiles(`${baseQuery} and 'me' in owners`),
    listAllFiles(`${baseQuery} and sharedWithMe=true`)
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

  all.sort((a, b) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }));
  return all;
}

function renderSpreadsheetOptions(items = []) {
  if (!dom.dialogExistingSelect) return;
  const currentId = CONFIG.SPREADSHEET_ID || '';
  dom.dialogExistingSelect.innerHTML = '<option value="">Bitte Tabelle auswaehlen...</option>';

  if (!items.length) {
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = 'Keine Tabellen gefunden';
    dom.dialogExistingSelect.appendChild(empty);
    dom.btnSpreadsheetUseSelected && (dom.btnSpreadsheetUseSelected.disabled = true);
    return;
  }

  items.forEach((item) => {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = formatSpreadsheetOptionLabel(item.name, item.source);
    dom.dialogExistingSelect.appendChild(option);
  });

  if (currentId && items.some((item) => item.id === currentId)) {
    dom.dialogExistingSelect.value = currentId;
  }

  dom.btnSpreadsheetUseSelected && (dom.btnSpreadsheetUseSelected.disabled = false);
}

async function refreshSpreadsheetList(options = {}) {
  const allowReauth = options.allowReauth !== false;
  if (!dom.dialogExistingSelect || !state.loggedIn) return;
  try {
    dom.dialogExistingSelect.disabled = true;
    dom.btnSpreadsheetRefresh && (dom.btnSpreadsheetRefresh.disabled = true);
    setSpreadsheetDialogError('Tabellen werden geladen...', false);
    const items = await listAccessibleSpreadsheets();
    renderSpreadsheetOptions(items);
    setSpreadsheetDialogError('');
  } catch (err) {
    console.error('[refreshSpreadsheetList]', err);

    if (allowReauth && isSpreadsheetAccessDeniedError(err)) {
      setSpreadsheetDialogError('Berechtigungen werden aktualisiert...', false);
      const reauthed = await signIn({ forceConsent: true });
      if (reauthed) {
        await refreshSpreadsheetList({ allowReauth: false });
        return;
      }
    }

    setSpreadsheetDialogError('Tabellen konnten nicht geladen werden. Bitte Login und Freigaben pruefen.');
  } finally {
    dom.dialogExistingSelect.disabled = false;
    dom.btnSpreadsheetRefresh && (dom.btnSpreadsheetRefresh.disabled = false);
  }
}

async function applySpreadsheetSelection(id) {
  if (!id) {
    setSpreadsheetDialogError('Bitte eine Tabelle waehlen oder ID/URL eingeben.');
    return;
  }

  const nextId = String(id).trim();
  const previousId = CONFIG.SPREADSHEET_ID;

  try {
    setSpreadsheetDialogError('Pruefe Tabellenzugriff...', false);
    await gapi.client.sheets.spreadsheets.get({
      spreadsheetId: nextId,
      fields: 'spreadsheetId,properties(title)'
    });

    CONFIG.SPREADSHEET_ID = nextId;
    resetSheetsDataCaches();
    resetRuntimeUiForSpreadsheetSwitch();
    updateSpreadsheetInfoBar();
    await actions.loadSets();
    setSpreadsheetDialogError('');
    dom.dialog?.close();
  } catch (err) {
    CONFIG.SPREADSHEET_ID = previousId;
    resetSheetsDataCaches();
    updateSpreadsheetInfoBar();
    console.error('[applySpreadsheetSelection]', err);
    setSpreadsheetDialogError(resolveSpreadsheetSelectionErrorMessage(err, nextId));
    showToast('Tabellenauswahl fehlgeschlagen.', 'error', 3200);
    throw err;
  }
}

async function createAndUseSpreadsheet() {
  const title = String(dom.dialogNewNameInput?.value || '').trim() || `Pokemon TCG Tracker ${new Date().toLocaleDateString('de-DE')}`;
  try {
    dom.btnSpreadsheetCreate && (dom.btnSpreadsheetCreate.disabled = true);
    setSpreadsheetDialogError('Neue Tabelle wird erstellt...', false);

    const response = await gapi.client.sheets.spreadsheets.create({
      properties: { title }
    });

    const spreadsheetId = String(response?.result?.spreadsheetId || '').trim();
    if (!spreadsheetId) {
      throw new Error('Spreadsheet-ID wurde nicht zurueckgegeben.');
    }

    await applySpreadsheetSelection(spreadsheetId);
    showToast(`Neue Tabelle erstellt: ${title}`, 'success');
  } catch (err) {
    console.error('[createAndUseSpreadsheet]', err);
    setSpreadsheetDialogError(`Neue Tabelle konnte nicht erstellt werden: ${err.message || err}`);
  } finally {
    dom.btnSpreadsheetCreate && (dom.btnSpreadsheetCreate.disabled = false);
  }
}

export function updateSpreadsheetInfoBar() {
  const id = CONFIG.SPREADSHEET_ID;
  if (id) {
    dom.spreadsheetLink.href = `https://docs.google.com/spreadsheets/d/${id}/edit`;
    dom.spreadsheetLink.textContent = id.slice(0, 22) + '\u2026';
    dom.spreadsheetInfo.classList.remove('hidden');
  } else {
    dom.spreadsheetInfo.classList.add('hidden');
  }
}

export function initSpreadsheetDialog() {
  dom.dialog?.addEventListener('close', () => {
    if (uiState.spreadsheetDialogReturnFocusEl && typeof uiState.spreadsheetDialogReturnFocusEl.focus === 'function') {
      uiState.spreadsheetDialogReturnFocusEl.focus();
    }
    uiState.spreadsheetDialogReturnFocusEl = null;
  });
  dom.dialog?.addEventListener('cancel', (e) => {
    const required = dom.dialog?.dataset?.required === 'true';
    if (required) e.preventDefault();
  });
  dom.dialog?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !dom.btnDialogCancel.disabled) dom.dialog.close();
  });
  dom.btnDialogSave?.addEventListener('click', async () => {
    const id = extractSpreadsheetId(dom.dialogInput?.value?.trim());
    if (!id) {
      setSpreadsheetDialogError('Ungueltige Spreadsheet-ID oder URL.');
      return;
    }
    try {
      await applySpreadsheetSelection(id);
    } catch {
      // Fehler bereits im Dialog angezeigt
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
      // Fehler bereits im Dialog angezeigt
    }
  });
  dom.btnSpreadsheetCreate?.addEventListener('click', async () => {
    await createAndUseSpreadsheet();
  });
}
