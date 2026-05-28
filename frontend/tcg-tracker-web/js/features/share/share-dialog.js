export function createShareDialogController({
  config,
  featureInitFlags,
  showToast,
  documentRef = document,
  locationRef = location,
  navigatorRef = navigator,
  sessionStorageRef = sessionStorage,
} = {}) {
  function closeOtherOpenDialogs(except = []) {
    const keep = new Set(except.filter(Boolean));
    documentRef.querySelectorAll('dialog[open]').forEach((dialog) => {
      if (keep.has(dialog)) return;
      try {
        dialog.close();
      } catch {
        // ignore dialogs that cannot be closed in current state
      }
    });
  }

  function showShareDialog(url) {
    const existing = documentRef.getElementById('dialog-share');
    if (existing) {
      closeOtherOpenDialogs([existing]);
      existing.showModal();
      return;
    }

    const dialog = documentRef.createElement('dialog');
    dialog.id = 'dialog-share';
    dialog.className = 'ss-dialog share-dialog';
    dialog.innerHTML = `
      <h2>Sammlung teilen</h2>
      <p>Der Link enthält deine Spreadsheet-ID und funktioniert für Personen mit Zugriff auf dein Sheet.</p>
      <div class="share-url-wrap">
        <input class="share-url-input" type="text" readonly value="${String(url || '').replace(/"/g, '&quot;')}" />
        <button class="share-copy-btn" type="button">Link kopieren</button>
      </div>
      <div class="dialog-actions">
        <button class="btn-secondary" type="button" onclick="this.closest('dialog').close()">Schließen</button>
      </div>
    `;

    dialog.querySelector('.share-copy-btn')?.addEventListener('click', async () => {
      const input = dialog.querySelector('.share-url-input');
      try {
        await navigatorRef.clipboard.writeText(input.value);
      } catch {
        input.select();
        documentRef.execCommand('copy');
      }
      showToast('Link kopiert!', 'success', 2500);
    });

    dialog.addEventListener('close', () => dialog.remove());
    documentRef.body.appendChild(dialog);
    closeOtherOpenDialogs([dialog]);
    dialog.showModal();
  }

  function initShareButton() {
    if (featureInitFlags.share) return;
    featureInitFlags.share = true;

    const button = documentRef.getElementById('btn-share');
    if (!button) return;

    button.addEventListener('click', () => {
      const spreadsheetId = config.SPREADSHEET_ID || '';
      const shareUrl = new URL(locationRef.href);
      shareUrl.hash = '#dashboard';
      shareUrl.searchParams.delete('ssid');
      shareUrl.searchParams.delete('share');
      shareUrl.searchParams.delete('nocache');
      shareUrl.searchParams.delete('t');
      if (spreadsheetId) shareUrl.searchParams.set('ssid', spreadsheetId);
      showShareDialog(shareUrl.toString());
    });

    const spreadsheetIdFromUrl = new URLSearchParams(locationRef.search).get('ssid');
    if (spreadsheetIdFromUrl && spreadsheetIdFromUrl.length > 10 && !config.SPREADSHEET_ID) {
      sessionStorageRef.setItem('tcg_pending_ssid', spreadsheetIdFromUrl);
    }
  }

  return {
    initShareButton,
    showShareDialog,
  };
}