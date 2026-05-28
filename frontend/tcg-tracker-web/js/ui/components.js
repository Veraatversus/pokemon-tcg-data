// ══════════════════════════════════════════════════════════════════════════
// QUICK FILTERS & UI ENHANCEMENTS MODULE
// ══════════════════════════════════════════════════════════════════════════

import { eventBus } from '../core/event-bus.js';
import {
  EVENT_CLEAR_SEARCH_HISTORY,
  EVENT_QUICK_FILTERS_CHANGED,
} from '../core/storage-keys.js';

const escapeTrackerMenuText = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

export function buildTrackerMenuChip({ id = '', label = '', icon = '', className = '', attributes = {} } = {}) {
  const extraAttributes = Object.entries(attributes)
    .map(([key, value]) => ` ${key}="${escapeTrackerMenuText(value)}"`)
    .join('');

  return `<button class="${['quick-filter-btn', 'dashboard-filter-chip', 'tracker-menu-chip', className].filter(Boolean).join(' ')}"${id ? ` id="${escapeTrackerMenuText(id)}"` : ''} type="button"${extraAttributes}>${icon ? `<span class="dashboard-filter-glyph tracker-menu-glyph" aria-hidden="true">${escapeTrackerMenuText(icon)}</span>` : ''}<span>${escapeTrackerMenuText(label)}</span></button>`;
}

export function buildTrackerMenuSection({ label = '', modifier = '', content = '' } = {}) {
  const sectionClasses = ['dashboard-filter-segment', 'tracker-menu-section'];
  if (modifier) {
    sectionClasses.push(`dashboard-filter-segment--${modifier}`, `tracker-menu-section--${modifier}`);
  }

  const captionMarkup = label
    ? `<span class="dashboard-filter-caption tracker-menu-caption">${escapeTrackerMenuText(label)}</span>`
    : '';

  return `<div class="${sectionClasses.join(' ')}">${captionMarkup}${content}</div>`;
}

export function initQuickFiltersUI(initialState = {}) {
  const filterContainer = document.getElementById('quick-filters-container');
  const filterBar = document.getElementById('dashboard-view-tabs');
  if (!filterContainer || !filterBar) return;

  const filters = [
    { id: 'filter-completed', label: 'Abgeschlossen', icon: '✓', key: 'completed', tone: 'done' },
    { id: 'filter-progress', label: 'In Bearbeitung', icon: '◔', key: 'inProgress', tone: 'live' }
  ];

  filterBar.classList.add('dashboard-filter-bar--ready');
  filterContainer.innerHTML = `
    <div class="dashboard-status-cluster tracker-menu-chip-group" role="group" aria-label="Statusfilter">
      ${filters
        .map((f) => buildTrackerMenuChip({
          id: f.id,
          label: f.label,
          icon: f.icon,
          className: 'dashboard-filter-chip',
          attributes: {
            'data-filter': f.key,
            'data-chip-tone': f.tone,
            'aria-pressed': 'false',
            title: f.label
          }
        }))
        .join('')}
      <button class="quick-filter-reset btn-secondary dashboard-filter-reset tracker-menu-reset" type="button" aria-label="Filter zurücksetzen" title="Filter zurücksetzen">
        <span class="quick-filter-reset-icon" aria-hidden="true">↺</span>
      </button>
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

  const emitQuickFiltersChanged = () => {
    const payload = { ...activeFilters };
    eventBus.emit(EVENT_QUICK_FILTERS_CHANGED, payload);
    // Keep DOM event compatibility for old listeners during migration.
    window.dispatchEvent(new CustomEvent(EVENT_QUICK_FILTERS_CHANGED, { detail: payload }));
  };

  syncButtons();

  filterContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('.quick-filter-btn');
    if (btn) {
      const filterKey = btn.dataset.filter;
      activeFilters[filterKey] = !activeFilters[filterKey];
      syncButtons();
      emitQuickFiltersChanged();
      return;
    }

    const resetBtn = e.target.closest('.quick-filter-reset');
    if (!resetBtn) return;

    Object.keys(activeFilters).forEach((key) => {
      activeFilters[key] = false;
    });
    syncButtons();
    emitQuickFiltersChanged();
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
      dropdown.innerHTML = '';
      history.slice(0, 10).forEach((entry) => {
        const item = document.createElement('div');
        item.className = 'search-history-item';
        item.style.cssText = 'padding: 8px 12px; cursor: pointer; border-bottom: 1px solid var(--color-bg);';
        item.textContent = String(entry || '');
        dropdown.appendChild(item);
      });
      
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
  const escapedReport = escapeTrackerMenuText(JSON.stringify(report, null, 2));
  dialog.innerHTML = `
    <h2>📊 Sammlung exportieren</h2>
    <div style="max-height: 300px; overflow-y: auto; border: 1px solid var(--color-border); border-radius: 4px; padding: 12px; margin: 12px 0; background: var(--color-bg); font-size: 12px; font-family: monospace; white-space: pre-wrap; word-break: break-all;">
      ${escapedReport}
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

export function createSettingsPanel(currentSettings = {}, onSave) {
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
    { key: 'compactMode', label: 'Kompaktmodus' },
    { key: 'autoBackup', label: 'Auto-Backup' },
    { key: 'notificationsEnabled', label: 'Benachrichtigungen' }
  ];

  const resolverOptions = [
    { value: 'tcgdex|vera|legacy', label: 'TCGDex > Vera > Legacy' },
    { value: 'vera|tcgdex|legacy', label: 'Vera > TCGDex > Legacy' },
    { value: 'legacy|vera|tcgdex', label: 'Legacy > Vera > TCGDex' },
    { value: 'legacy|tcgdex|vera', label: 'Legacy > TCGDex > Vera' },
    { value: 'vera|legacy|tcgdex', label: 'Vera > Legacy > TCGDex' },
    { value: 'tcgdex|legacy|vera', label: 'TCGDex > Legacy > Vera' }
  ];

  const getResolverDefaultOrder = () => 'tcgdex|vera|legacy';

  const fieldGroups = [
    {
      scope: 'set',
      title: 'Set-Felder',
      fields: ['setName', 'series', 'releaseDate', 'totalCards', 'ptcgoCode', 'logoUrl', 'symbolUrl', 'legalities']
    },
    {
      scope: 'card',
      title: 'Karten-Felder',
      fields: ['number', 'name', 'image', 'imageLarge', 'cardmarketUrl', 'rarity', 'hp', 'types', 'supertype', 'subtypes', 'evolvesFrom', 'artist', 'regulationMark', 'rules', 'flavorText']
    }
  ];

  const currentMatrix = currentSettings.resolverMatrix || { set: {}, card: {} };

  const toolGroups = [
    {
      title: 'Import & Sync',
      buttons: [
        ['btn-overview-sync', '🔄 Overview sync'],
        ['btn-overview-power-refresh', '⚡ Power-Refresh'],
        ['btn-import-batch', '📦 Batch-Import'],
        ['btn-manage-imported-sets', '🗂️ Importierte Sets verwalten'],
        ['btn-import-all-missing', '🌐 Alle fehlenden importieren'],
        ['btn-reimport-current', '♻️ Aktuelles Set reimportieren'],
        ['btn-reimport-all-imported', '🔁 Alle importierten aktualisieren']
      ]
    },
    {
      title: 'Queue & Automatisierung',
      buttons: [
        ['btn-queue-autofix-refresh', '🧩 Queue: Auto-Fix → Refresh'],
        ['btn-queue-builder', '🧱 Queue Builder'],
        ['btn-queue-run', '▶️ Queue starten'],
        ['btn-queue-clear', '🗑️ Queue leeren']
      ]
    },
    {
      title: 'Diagnose & Backup',
      buttons: [
        ['btn-export-summary-csv', '📤 Sammlung CSV'],
        ['btn-data-health-check', '🩺 Datencheck'],
        ['btn-data-health-autofix', '🛠️ Datencheck + Auto-Fix'],
        ['btn-sheets-retry-report', '📈 Sheets Retry Analyse'],
        ['dashboard-action-parity', '🧪 Pokecode-Parity-Test'],
        ['btn-export-backup', '💾 Backup exportieren'],
        ['btn-import-backup', '📥 Backup importieren'],
        ['btn-import-legacy-xlsx', '🧬 Altbestand (.xlsx)'],
        ['btn-import-legacy-sheet', '🔗 Altbestand (Sheets-Link)']
      ]
    }
  ];

  const buildResolverRows = (scope, fields) => fields.map((field) => {
    const currentOrder = Array.isArray(currentMatrix?.[scope]?.[field]) && currentMatrix[scope][field].length
      ? currentMatrix[scope][field].join('|')
      : getResolverDefaultOrder(scope, field);
    return `
      <label style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin: 6px 0;">
        <span style="font-size:12px; color:var(--color-muted);">${scope}.${field}</span>
        <select data-resolver-scope="${scope}" data-resolver-field="${field}" style="min-width: 210px;">
          ${resolverOptions.map((opt) => `<option value="${opt.value}" ${opt.value === currentOrder ? 'selected' : ''}>${opt.label}</option>`).join('')}
        </select>
      </label>
    `;
  }).join('');

  const expertEnabled = Boolean(currentSettings.expertResolverMode);

  panel.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:10px;">
      ${settings.map((s) => `
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
          <input type="checkbox" data-key="${s.key}" ${currentSettings[s.key] ? 'checked' : ''} />
          <span>${s.label}</span>
        </label>
      `).join('')}

      <div style="border:1px solid var(--color-border); border-radius:8px; padding:10px 12px; background: var(--color-surface);">
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:600;">
          <input type="checkbox" data-key="expertResolverMode" ${expertEnabled ? 'checked' : ''} />
          <span>Expert Resolver Modus</span>
        </label>
        <p style="font-size:12px; color:var(--color-muted); margin:8px 0 0; line-height:1.45;">
          Steuert lokal in diesem Browser, ob pro Feld bevorzugt Vera- oder TCGDex-Werte angezeigt werden. Die Rohdaten in Google Sheets bleiben dabei unverändert.
        </p>
      </div>
    </div>

    <p data-expert-resolver-hint style="font-size:12px; color:var(--color-muted); margin:0; ${expertEnabled ? 'display:none;' : ''}">
      Aktiviere den Expert Resolver Modus, um die Quellen-Priorität pro Feld anzupassen.
    </p>

    <details data-expert-resolver-details ${expertEnabled ? 'open' : ''} style="border:1px solid var(--color-border); border-radius:8px; padding:10px 12px; background: var(--color-surface); ${expertEnabled ? '' : 'display:none;'}">
      <summary style="cursor:pointer; font-weight:700;">Resolver-Matrix (Expert)</summary>
      <p style="font-size:12px; color:var(--color-muted); margin:8px 0 10px; line-height:1.45;">
        Reihenfolge = Priorität von links nach rechts. Beispiel: <strong>TCGDex &gt; Vera &gt; Legacy</strong> bedeutet, dass zuerst TCGDex verwendet wird und nur bei leerem Wert auf Vera bzw. Legacy zurückgefallen wird.
      </p>
      <div style="font-size:12px; color:var(--color-muted); border-left:3px solid rgba(37,99,235,.45); padding:8px 10px; background: rgba(37,99,235,.06); border-radius:6px; margin-bottom:10px;">
        Sicherer Standard: Namen und Bilder bevorzugen meist <strong>TCGDex</strong>. Für <strong>Logo/Symbol</strong> sowie <strong>Kartenbild groß</strong> kannst du Vera- und TCGDex-Werte jetzt getrennt priorisieren.
      </div>
      ${fieldGroups.map((group) => `
        <div style="margin: 10px 0 14px;">
          <div style="font-size:12px; font-weight:700; margin-bottom:4px;">${group.title}</div>
          ${buildResolverRows(group.scope, group.fields)}
        </div>
      `).join('')}
      <div style="display:flex; justify-content:flex-end; margin-top:6px;">
        <button class="btn-secondary" type="button" data-action="resolver-defaults">Resolver auf Defaults</button>
      </div>
    </details>

    <details style="border:1px solid var(--color-border); border-radius:8px; padding:10px 12px; background: var(--color-surface);">
      <summary style="cursor:pointer; font-weight:700;">🧰 Tools & Wartung</summary>
      <p style="font-size:12px; color:var(--color-muted); margin:8px 0 10px; line-height:1.45;">
        Die bisherigen Dashboard-Tools sind jetzt hier im Expertenmenü gebündelt.
      </p>
      <div style="display:flex; flex-direction:column; gap:12px;">
        ${toolGroups.map((group) => `
          <section>
            <div style="font-size:12px; font-weight:700; margin-bottom:6px;">${group.title}</div>
            <div style="display:flex; flex-wrap:wrap; gap:8px;">
              ${group.buttons.map(([target, label]) => `
                <button class="btn-secondary" type="button" data-proxy-click="${target}">${label}</button>
              `).join('')}
            </div>
          </section>
        `).join('')}
      </div>
    </details>

    <details style="border:1px solid var(--color-border); border-radius:8px; padding:10px 12px; background: var(--color-surface);">
      <summary style="cursor:pointer; font-weight:700;">💬 Hilfe & Kontakt</summary>
      <p style="font-size:12px; color:var(--color-muted); margin:8px 0 10px; line-height:1.45;">
        Öffnet den Support-Hub für Bug-Reports, Feature-Wünsche und frühzeitige Zugangs-Anfragen.
      </p>
      <div style="display:flex; flex-wrap:wrap; gap:8px;">
        <button class="btn-secondary" type="button" data-proxy-click="btn-open-support-hub">💬 Feedback & Zugang</button>
      </div>
    </details>

    <div style="display:flex; gap:8px; margin-top: 4px; flex-wrap: wrap;">
      <button class="btn-secondary" type="button" data-action="clear-history">🗑️ Suchverlauf löschen</button>
      <button class="btn-primary" type="button" data-action="save">💾 Speichern</button>
    </div>
  `;

  const expertToggle = panel.querySelector('input[data-key="expertResolverMode"]');
  const expertHint = panel.querySelector('[data-expert-resolver-hint]');
  const expertDetails = panel.querySelector('[data-expert-resolver-details]');

  const syncExpertModeUi = () => {
    const enabled = Boolean(expertToggle?.checked);
    if (expertHint) expertHint.style.display = enabled ? 'none' : 'block';
    if (expertDetails) {
      expertDetails.style.display = enabled ? 'block' : 'none';
      if (enabled) expertDetails.open = true;
    }
    panel.querySelectorAll('select[data-resolver-scope][data-resolver-field], [data-action="resolver-defaults"]').forEach((el) => {
      el.disabled = !enabled;
    });
  };

  expertToggle?.addEventListener('change', syncExpertModeUi);
  syncExpertModeUi();

  panel.querySelector('[data-action="save"]').addEventListener('click', () => {
    const updated = { ...currentSettings };
    panel.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      updated[input.dataset.key] = input.checked;
    });

    const matrix = { set: {}, card: {} };
    panel.querySelectorAll('select[data-resolver-scope][data-resolver-field]').forEach((select) => {
      const scope = select.dataset.resolverScope;
      const field = select.dataset.resolverField;
      if (!matrix[scope]) matrix[scope] = {};
      matrix[scope][field] = String(select.value || '').split('|').filter(Boolean);
    });
    updated.resolverMatrix = matrix;

    onSave?.(updated);
  });

  panel.querySelector('[data-action="resolver-defaults"]').addEventListener('click', () => {
    panel.querySelectorAll('select[data-resolver-scope][data-resolver-field]').forEach((select) => {
      const scope = select.dataset.resolverScope;
      const field = select.dataset.resolverField;
      select.value = getResolverDefaultOrder(scope, field);
    });
  });

  panel.querySelector('[data-action="clear-history"]').addEventListener('click', () => {
    if (window.confirm('Suchverlauf wirklich löschen?')) {
      window.dispatchEvent(new Event(EVENT_CLEAR_SEARCH_HISTORY));
    }
  });

  panel.querySelectorAll('[data-proxy-click]').forEach((button) => {
    button.addEventListener('click', () => {
      const targetId = button.dataset.proxyClick;
      const target = targetId ? document.getElementById(targetId) : null;
      const dialog = panel.closest('dialog');
      if (dialog?.open) dialog.close();
      if (target) {
        window.setTimeout(() => target.click(), 0);
      } else {
        console.warn('[settings-panel] Tool target not found:', targetId);
      }
    });
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
