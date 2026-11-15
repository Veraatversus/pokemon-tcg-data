// ══════════════════════════════════════════════════════════════════════════
// QUICK FILTERS & UI ENHANCEMENTS MODULE
// ══════════════════════════════════════════════════════════════════════════

import { eventBus } from '../core/event-bus.js';
import {
  EVENT_CLEAR_SEARCH_HISTORY,
  EVENT_QUICK_FILTERS_CHANGED,
} from '../core/storage-keys.js';
import { SETTINGS_RESET_ACTIONS } from '../features/settings/runtime-reset.js';

const escapeTrackerMenuText = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

function buildTrackerMenuChip({ id = '', label = '', icon = '', className = '', attributes = {} } = {}) {
  const extraAttributes = Object.entries(attributes)
    .map(([key, value]) => ` ${key}="${escapeTrackerMenuText(value)}"`)
    .join('');

  return `<button class="${['quick-filter-btn', 'dashboard-filter-chip', 'tracker-menu-chip', className].filter(Boolean).join(' ')}"${id ? ` id="${escapeTrackerMenuText(id)}"` : ''} type="button"${extraAttributes}>${icon ? `<span class="dashboard-filter-glyph tracker-menu-glyph" aria-hidden="true">${escapeTrackerMenuText(icon)}</span>` : ''}<span>${escapeTrackerMenuText(label)}</span></button>`;
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
// STATISTICS PANEL
// ══════════════════════════════════════════════════════════════════════════

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

export function createSettingsPanel(currentSettings = {}, onSave, options = {}) {
  const onAction = typeof options?.onAction === 'function' ? options.onAction : null;
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

  const cardmarketBasePriceOptions = [
    { value: 'trend', label: 'Trend' },
    { value: 'average', label: 'Durchschnitt (Ø)' },
    { value: 'average1', label: 'Durchschnitt 1 Tag (Ø1)' },
    { value: 'average7', label: 'Durchschnitt 7 Tage (Ø7)' },
    { value: 'average30', label: 'Durchschnitt 30 Tage (Ø30)' },
    { value: 'low', label: 'Low' }
  ];

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
      title: 'Cardmarket',
      buttons: [
        ['btn-cardmarket-reload-prices', '💱 Preise neu laden']
      ]
    },
    {
      title: 'Diagnose & Backup',
      buttons: [
        ['btn-export-summary-csv', '📤 Sammlung CSV'],
        ['btn-data-health-check', '🩺 Datencheck'],
        ['btn-data-health-autofix', '🛠️ Datencheck + Auto-Fix'],
        ['btn-sheets-retry-report', '📈 Sheets Retry Analyse'],
        ['btn-export-backup', '💾 Backup exportieren'],
        ['btn-import-backup', '📥 Backup importieren'],
        ['btn-import-legacy-xlsx', '🧬 Altbestand (.xlsx)'],
        ['btn-import-legacy-sheet', '🔗 Altbestand (Sheets-Link)']
      ]
    }
  ];

  panel.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:10px;">
      ${settings.map((s) => `
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
          <input type="checkbox" data-key="${s.key}" ${currentSettings[s.key] ? 'checked' : ''} />
          <span>${s.label}</span>
        </label>
      `).join('')}

      <label style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
        <span>Kartensprache</span>
        <select data-key="cardLanguage" style="min-width: 200px;">
          <option value="de" ${String(currentSettings.cardLanguage) !== 'en' ? 'selected' : ''}>Deutsch (Standard)</option>
          <option value="en" ${String(currentSettings.cardLanguage) === 'en' ? 'selected' : ''}>Englisch</option>
        </select>
      </label>

      <label style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
        <span>Standard-Grundpreis (Cardmarket)</span>
        <select data-key="cardmarketBasePriceType" style="min-width: 200px;">
          ${cardmarketBasePriceOptions.map((opt) => `<option value="${opt.value}" ${opt.value === String(currentSettings.cardmarketBasePriceType || 'trend') ? 'selected' : ''}>${opt.label}</option>`).join('')}
        </select>
      </label>
      <p style="font-size:12px; color:var(--color-muted); margin:0; line-height:1.45;">
        Namen, Bilder und Kartentexte folgen der Kartensprache (fehlt ein Wert, wird die andere Sprache gezeigt). Der Grundpreis steuert Cardmarket-Buttons/Links sowie die Preisstatistik; fehlt der gewählte Wert, greifen automatische Fallbacks.
      </p>
    </div>

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

    <details style="border:1px solid var(--color-border); border-radius:8px; padding:10px 12px; background: var(--color-surface);">
      <summary style="cursor:pointer; font-weight:700;">Reset & Datenschutz</summary>
      <p style="font-size:12px; color:var(--color-muted); margin:8px 0 10px; line-height:1.45;">
        Diese Aktionen betreffen nur Browser-Cache und lokale Laufzeitdaten. Google-Sheets-Inhalte bleiben unangetastet.
      </p>
      <div style="display:flex; flex-direction:column; gap:12px;">
        <section>
          <div style="font-size:12px; font-weight:700; margin-bottom:6px;">Einzeln zuruecksetzen</div>
          <div style="display:flex; flex-wrap:wrap; gap:8px;">
            <button class="btn-secondary" type="button" data-reset-action="${SETTINGS_RESET_ACTIONS.SEARCH_HISTORY}">Suchverlauf loeschen</button>
            <button class="btn-secondary" type="button" data-reset-action="${SETTINGS_RESET_ACTIONS.FAVORITES}">Favoriten loeschen</button>
            <button class="btn-secondary" type="button" data-reset-action="${SETTINGS_RESET_ACTIONS.SETTINGS}">Einstellungen loeschen</button>
            <button class="btn-secondary" type="button" data-reset-action="${SETTINGS_RESET_ACTIONS.SYNC_STATUS}">Sync-Status loeschen</button>
            <button class="btn-secondary" type="button" data-reset-action="${SETTINGS_RESET_ACTIONS.CACHE}">App-Cache leeren</button>
            <button class="btn-secondary" type="button" data-reset-action="${SETTINGS_RESET_ACTIONS.COOKIES}">Cookies loeschen</button>
          </div>
        </section>
        <section>
          <div style="font-size:12px; font-weight:700; margin-bottom:6px;">Komplette Resets</div>
          <div style="display:flex; flex-wrap:wrap; gap:8px;">
            <button class="btn-secondary" type="button" data-reset-action="${SETTINGS_RESET_ACTIONS.ALL_KEEP_LOGIN}">Reset all (Login behalten)</button>
            <button class="btn-secondary" type="button" data-reset-action="${SETTINGS_RESET_ACTIONS.ALL_FULL}" style="border-color: rgba(220,38,38,.45); color: #b91c1c;">Reset all komplett (inkl. Login)</button>
          </div>
        </section>
      </div>
    </details>

    <div style="display:flex; gap:8px; margin-top: 4px; flex-wrap: wrap;">
      <button class="btn-secondary" type="button" data-action="clear-history">🗑️ Suchverlauf löschen</button>
      <button class="btn-primary" type="button" data-action="save">💾 Speichern</button>
    </div>
  `;

  panel.querySelector('[data-action="save"]').addEventListener('click', () => {
    const updated = { ...currentSettings };
    panel.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      updated[input.dataset.key] = input.checked;
    });
    panel.querySelectorAll('select[data-key]').forEach((select) => {
      updated[select.dataset.key] = String(select.value || '').trim();
    });

    // Frueher gespeicherte Resolver-Matrix/Expert-Modus nicht weitertragen.
    delete updated.resolverMatrix;
    delete updated.expertResolverMode;

    onSave?.(updated);
  });

  panel.querySelector('[data-action="clear-history"]').addEventListener('click', () => {
    if (!window.confirm('Suchverlauf wirklich löschen?')) return;
    if (onAction) {
      Promise.resolve(onAction('clear-history')).catch((error) => {
        console.error('[settings-panel] clear-history action failed:', error);
      });
      return;
    }
    window.dispatchEvent(new Event(EVENT_CLEAR_SEARCH_HISTORY));
  });

  panel.querySelectorAll('[data-reset-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      const action = button.dataset.resetAction;
      if (!action) return;
      if (!onAction) {
        console.warn('[settings-panel] Missing onAction handler for reset action:', action);
        return;
      }

      button.disabled = true;
      try {
        await onAction(action);
      } catch (error) {
        console.error('[settings-panel] reset action failed:', action, error);
      } finally {
        button.disabled = false;
      }
    });
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
// BULK OPERATIONS UI
// ══════════════════════════════════════════════════════════════════════════
