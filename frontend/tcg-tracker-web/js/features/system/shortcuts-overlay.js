const KEYBOARD_SHORTCUTS = [
  ['D', 'Dashboard öffnen'],
  ['S', 'Set-Ansicht öffnen'],
  ['T', 'Statistiken öffnen'],
  ['/', 'Suche fokussieren'],
  ['← / →', 'Karte navigieren'],
  ['Leertaste', 'Normal (G) togglen'],
  ['R', 'Reverse Holo (RH) togglen'],
  ['I', 'Kartendetails / Bild-Zoom'],
  ['Cmd/Strg K', 'Command Palette öffnen'],
  ['?', 'Diese Shortcut-Übersicht'],
  ['Esc', 'Dialog / Overlay schließen'],
];

export function createShortcutsOverlayController({
  stateRef,
  documentRef = document,
  windowRef = window,
  locationRef = location,
  sessionStorageRef = sessionStorage,
} = {}) {
  let initialized = false;

  function showShortcutsOverlay() {
    const existing = documentRef.getElementById('shortcuts-overlay');
    if (existing) {
      existing.remove();
      return;
    }

    const overlay = documentRef.createElement('div');
    overlay.id = 'shortcuts-overlay';
    overlay.className = 'shortcuts-overlay';
    overlay.innerHTML = `
      <div class="shortcuts-panel" role="dialog" aria-modal="true" aria-label="Keyboard Shortcuts">
        <h2>⌨️ Keyboard Shortcuts</h2>
        <p>Tippe außerhalb von Eingabefeldern</p>
        <table class="shortcut-table">
          <tbody>
            ${KEYBOARD_SHORTCUTS.map(([key, desc]) => `
              <tr>
                <td><span class="shortcut-key">${key}</span></td>
                <td class="shortcut-desc">${desc}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <p class="shortcuts-close-hint">Esc oder ? oder Klick außerhalb zum Schließen</p>
      </div>
    `;

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) overlay.remove();
    });

    documentRef.body.appendChild(overlay);
  }

  function initShortcutsOverlay() {
    if (initialized) return;
    initialized = true;

    windowRef.addEventListener('keydown', (event) => {
      if (event.target?.matches?.('input, textarea, select, [contenteditable]')) return;
      const isQuestionShortcut = event.key === '?' || (event.key === '/' && event.shiftKey) || (event.code === 'Slash' && event.shiftKey);
      if (isQuestionShortcut) {
        event.preventDefault();
        showShortcutsOverlay();
        return;
      }
      if (event.key === 'Escape') {
        documentRef.getElementById('shortcuts-overlay')?.remove();
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      switch (event.key.toLowerCase()) {
        case 'd':
          event.preventDefault();
          locationRef.hash = '#dashboard';
          break;
        case 's': {
          event.preventDefault();
          const lastSet = stateRef?.currentSet?.setId || sessionStorageRef.getItem('tcg_last_set');
          locationRef.hash = lastSet ? `#set/${lastSet}` : '#dashboard';
          break;
        }
        case 't':
          event.preventDefault();
          locationRef.hash = '#stats';
          break;
        case '/':
          event.preventDefault();
          locationRef.hash = '#search';
          // Route-Render kann asynchron sein: mehrfach versuchen, dann sinnvollen Fallback nutzen.
          {
            const focusSearchInput = () => {
              const searchInput = documentRef.getElementById('search-input');
              const viewSearch = documentRef.getElementById('view-search');
              const searchVisible = !!(viewSearch && !viewSearch.classList.contains('hidden'));
              if (searchInput && searchVisible) {
                searchInput.focus();
                return true;
              }
              return false;
            };

            let tries = 0;
            const maxTries = 8;
            const tick = () => {
              if (focusSearchInput()) return;
              tries += 1;
              if (tries < maxTries) {
                setTimeout(tick, 80);
                return;
              }
              // Fallback (z.B. nicht eingeloggt): Dashboard-Suche fokussieren.
              documentRef.getElementById('dash-filter')?.focus();
            };
            setTimeout(tick, 0);
          }
          break;
      }
    });
  }

  return {
    initShortcutsOverlay,
  };
}
