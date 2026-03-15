// ══════════════════════════════════════════════════════════════════════════
// QUICK FILTERS & UI ENHANCEMENTS MODULE
// ══════════════════════════════════════════════════════════════════════════

export function initQuickFiltersUI(initialState = {}) {
  const filterContainer = document.getElementById('quick-filters-container');
  if (!filterContainer) return;

  const filters = [
    { id: 'filter-completed', label: '✅ Abgeschlossen', key: 'completed' },
    { id: 'filter-progress', label: '⏳ In Bearbeitung', key: 'inProgress' },
    { id: 'filter-not-imported', label: '📦 Nicht importiert', key: 'notImported' },
    { id: 'filter-favorites', label: '⭐ Favoriten', key: 'favoritesOnly' }
  ];

  filterContainer.innerHTML = `
    <div class="quick-filters-toolbar" role="toolbar" aria-label="Schnellfilter">
      <span class="quick-filters-label">Schnellfilter:</span>
      <div class="quick-filters-buttons">
        ${filters
          .map((f) => `<button class="quick-filter-btn" data-filter="${f.key}" id="${f.id}" type="button" aria-pressed="false">${f.label}</button>`)
          .join('')}
      </div>
      <button class="quick-filter-reset btn-secondary" type="button">Zurücksetzen</button>
    </div>
  `;

  // Store active filters
  const activeFilters = {};
  filters.forEach((f) => {
    activeFilters[f.key] = Boolean(initialState?.[f.key]);
  });

  const syncButtons = () => {
    filterContainer.querySelectorAll('.quick-filter-btn').forEach((btn) => {
      const key = btn.dataset.filter;
      const isActive = Boolean(activeFilters[key]);
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    });
  };

  syncButtons();

  filterContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('.quick-filter-btn');
    if (btn) {
      const filterKey = btn.dataset.filter;
      activeFilters[filterKey] = !activeFilters[filterKey];
      syncButtons();

      // Dispatch custom event for the main app to listen to
      window.dispatchEvent(new CustomEvent('quick-filters-changed', { detail: { ...activeFilters } }));
      return;
    }

    const resetBtn = e.target.closest('.quick-filter-reset');
    if (!resetBtn) return;

    Object.keys(activeFilters).forEach((key) => {
      activeFilters[key] = false;
    });
    syncButtons();

    // Dispatch custom event for the main app to listen to
    window.dispatchEvent(new CustomEvent('quick-filters-changed', { detail: { ...activeFilters } }));
  });

  return { container: filterContainer, activeFilters };
}

// ══════════════════════════════════════════════════════════════════════════
// SEARCH HISTORY UI
// ══════════════════════════════════════════════════════════════════════════

export function createSearchHistoryWidget(searchInput, onSelect) {
  const dropdown = document.createElement('div');
  dropdown.className = 'search-history-dropdown hidden';
  dropdown.style.cssText = `
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-top: none;
    border-radius: 0 0 4px 4px;
    max-height: 200px;
    overflow-y: auto;
    z-index: 10;
  `;

  searchInput.addEventListener('focus', () => {
    const query = searchInput.value;
    const history = window.SEARCH_HISTORY || [];
    
    if (query === '' && history.length > 0) {
      dropdown.innerHTML = history
        .slice(0, 10)
        .map(h => `<div class="search-history-item" style="padding: 8px 12px; cursor: pointer; border-bottom: 1px solid var(--color-bg); hover:background: var(--color-bg);">${h}</div>`)
        .join('');
      
      dropdown.classList.remove('hidden');
      dropdown.querySelectorAll('.search-history-item').forEach(item => {
        item.addEventListener('click', () => {
          searchInput.value = item.textContent;
          onSelect?.(item.textContent);
          dropdown.classList.add('hidden');
        });
      });
    }
  });

  searchInput.addEventListener('blur', () => {
    setTimeout(() => dropdown.classList.add('hidden'), 200);
  });

  searchInput.parentElement.style.position = 'relative';
  searchInput.parentElement.appendChild(dropdown);
  return dropdown;
}

// ══════════════════════════════════════════════════════════════════════════
// STATISTICS PANEL
// ══════════════════════════════════════════════════════════════════════════

export function createStatisticsPanel(stats) {
  const panel = document.createElement('div');
  panel.className = 'statistics-panel';
  panel.style.cssText = `
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 16px;
    margin: 16px 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 16px;
  `;

  const items = [
    { label: 'Importiert', value: stats.totalSets, icon: '📦' },
    { label: 'Abgeschlossen', value: stats.completedSets, icon: '✅' },
    { label: 'In Bearbeitung', value: stats.partialSets, icon: '⏳' },
    { label: 'Karten', value: stats.collectedCards + '/' + stats.totalCards, icon: '🎴' },
    { label: 'Fortschritt', value: stats.percentComplete + '%', icon: '📊' },
    { label: 'Holografisch', value: stats.holographics, icon: '✨' }
  ];

  panel.innerHTML = items
    .map(item => `
      <div class="stat-item" style="text-align: center;">
        <div style="font-size: 24px; margin-bottom: 4px;">${item.icon}</div>
        <div style="font-size: 12px; color: var(--color-muted); margin-bottom: 4px;">${item.label}</div>
        <div style="font-size: 18px; font-weight: 600;">${item.value}</div>
      </div>
    `)
    .join('');

  return panel;
}

// ══════════════════════════════════════════════════════════════════════════
// EXPORT COLLECTION DIALOG
// ══════════════════════════════════════════════════════════════════════════

export function createExportDialog(report) {
  const dialog = document.createElement('dialog');
  dialog.className = 'export-dialog ss-dialog';
  dialog.innerHTML = `
    <h2>📊 Sammlung exportieren</h2>
    <div style="max-height: 300px; overflow-y: auto; border: 1px solid var(--color-border); border-radius: 4px; padding: 12px; margin: 12px 0; background: var(--color-bg); font-size: 12px; font-family: monospace; white-space: pre-wrap; word-break: break-all;">
      ${JSON.stringify(report, null, 2)}
    </div>
    <div style="margin: 12px 0;">
      <p style="font-size: 12px; color: var(--color-muted);">
        Klicke den Button unten um die Report als JSON-Datei herunterzuladen:
      </p>
    </div>
    <div class="dialog-actions">
      <button class="btn-secondary" type="button" data-action="close">Abbrechen</button>
      <button class="btn-primary" type="button" data-action="download">⬇️ Herunterladen</button>
    </div>
  `;

  dialog.querySelector('[data-action="close"]').addEventListener('click', () => dialog.close());
  dialog.querySelector('[data-action="download"]').addEventListener('click', () => {
    const json = JSON.stringify(report, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `poke-collection-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  return dialog;
}

// ══════════════════════════════════════════════════════════════════════════
// SETTINGS PANEL
// ══════════════════════════════════════════════════════════════════════════

export function createSettingsPanel(currentSettings, onSave) {
  const panel = document.createElement('div');
  panel.className = 'settings-panel';
  panel.style.cssText = `
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  `;

  const settings = [
    { key: 'darkMode', label: 'Dark Mode', type: 'toggle' },
    { key: 'compactMode', label: 'Kompaktus Modus', type: 'toggle' },
    { key: 'autoBackup', label: 'Auto Backup', type: 'toggle' },
    { key: 'notificationsEnabled', label: 'Benachrichtigungen', type: 'toggle' }
  ];

  panel.innerHTML = `
    ${settings
      .map(s => `
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
          <input type="checkbox" data-key="${s.key}" ${currentSettings[s.key] ? 'checked' : ''} />
          <span>${s.label}</span>
        </label>
      `)
      .join('')}
    <div style="display: flex; gap: 8px; margin-top: 12px;">
      <button class="btn-secondary" type="button" data-action="clear-history">🗑️ Suchverlauf löschen</button>
      <button class="btn-primary" type="button" data-action="save">💾 Speichern</button>
    </div>
  `;

  panel.querySelector('[data-action="save"]').addEventListener('click', () => {
    const updated = { ...currentSettings };
    panel.querySelectorAll('input[type="checkbox"]').forEach(input => {
      updated[input.dataset.key] = input.checked;
    });
    onSave?.(updated);
  });

  panel.querySelector('[data-action="clear-history"]').addEventListener('click', () => {
    if (window.confirm('Suchverlauf wirklich löschen?')) {
      window.dispatchEvent(new Event('clear-search-history'));
    }
  });

  return panel;
}

// ══════════════════════════════════════════════════════════════════════════
// KEYBOARD SHORTCUTS OVERLAY
// ══════════════════════════════════════════════════════════════════════════

export function createShortcutsOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'shortcuts-overlay hidden';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;

  const panel = document.createElement('div');
  panel.style.cssText = `
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 24px;
    max-width: 500px;
    max-height: 80vh;
    overflow-y: auto;
  `;

  const shortcuts = [
    { key: 'Strg+K / CMD+K', action: 'Command Palette öffnen' },
    { key: '/', action: 'Suche fokussieren' },
    { key: '?', action: 'Shortcuts anzeigen' },
    { key: 'Strg+Shift+S', action: 'Sammlung exportieren' },
    { key: '↑ / ↓', action: 'In Palette navigieren' },
    { key: 'Enter', action: 'Befehl ausführen' },
    { key: 'Esc', action: 'Dialog schließen' }
  ];

  panel.innerHTML = `
    <h2 style="margin-top: 0;">⌨️ Tastaturkürzel</h2>
    <table style="width: 100%; border-collapse: collapse;">
      ${shortcuts
        .map(s => `
          <tr style="border-bottom: 1px solid var(--color-border);">
            <td style="padding: 8px; font-weight: 600; color: var(--color-primary);">${s.key}</td>
            <td style="padding: 8px; color: var(--color-text);">${s.action}</td>
          </tr>
        `)
        .join('')}
    </table>
    <button class="btn-primary" type="button" style="width: 100%; margin-top: 16px;" data-action="close">Schließen</button>
  `;

  panel.querySelector('[data-action="close"]').addEventListener('click', () => {
    overlay.classList.add('hidden');
  });

  overlay.appendChild(panel);

  // Esc key to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.classList.contains('hidden')) {
      overlay.classList.add('hidden');
    }
  });

  return overlay;
}

// ══════════════════════════════════════════════════════════════════════════
// BULK OPERATIONS UI
// ══════════════════════════════════════════════════════════════════════════

export function createBulkActionsToolbar(selectionCount, onAction) {
  const toolbar = document.createElement('div');
  toolbar.className = 'bulk-toolbar hidden';
  toolbar.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--color-primary);
    color: white;
    padding: 12px 16px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    gap: 12px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    z-index: 1000;
  `;

  toolbar.innerHTML = `
    <span id="bulk-count" style="font-weight: 600;">0 ausgewählt</span>
    <div style="width: 1px; height: 24px; background: rgba(255, 255, 255, 0.3);"></div>
    <button class="bulk-action-btn" data-action="mark-all" style="background: rgba(255,255,255,0.2); border: none; color: white; padding: 6px 12px; border-radius: 4px; cursor: pointer;">✔️ Alle markieren</button>
    <button class="bulk-action-btn" data-action="clear" style="background: rgba(255,255,255,0.2); border: none; color: white; padding: 6px 12px; border-radius: 4px; cursor: pointer;">❌ Löschen</button>
  `;

  toolbar.querySelectorAll('.bulk-action-btn').forEach(btn => {
    btn.addEventListener('click', () => onAction?.(btn.dataset.action));
  });

  return toolbar;
}
