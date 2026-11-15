// Einstellungen: Dashboard-Einstellungen laden/speichern, Dev-Completion-Modus, Einstellungs-Dialog
// und dessen Aktionen (Suchverlauf, Favoriten, Caches, Cookies, Reset).
// resetToLoggedOut liegt im Bootstrap von app.js und wird ueber actions.resetToLoggedOut() aufgerufen.
import { signOut } from '../../core/auth.js';
import { resetSheetsDataCaches } from '../../data/sheets-db.js?v=20261114-clean-1';
import * as cache from '../../core/cache.js';
import { scopedStorageKey } from '../../core/config.js';
import {
  QUEUE_PRESETS_STORAGE_KEY,
  DASHBOARD_PREFS_STORAGE_KEY,
  RECENT_SETS_STORAGE_KEY,
  DEV_COMPLETION_STORAGE_KEY
} from '../../core/storage-keys.js';
import { clearSearchHistory, loadSettings, saveSettings } from '../../enhanced-features.js?v=20261114-clean-1';
import { createSettingsPanel } from '../../ui/components.js?v=20261114-clean-1';
import {
  SETTINGS_RESET_ACTIONS,
  clearCookiesBestEffort,
  clearServiceWorkerRuntimeCaches,
  getOauthRedirectStateKey,
  getResetLocalStorageKeys,
  listMatchingLocalStorageKeys,
  removeLocalStorageKeys,
} from './runtime-reset.js';
import { state } from '../../app/state.js';
import { actions } from '../../app/actions.js';
import { showToast, closeOtherOpenDialogs, pushAuditEntry } from '../../ui/helpers.js';

export function initDevCompletionMode() {
  const query = new URLSearchParams(window.location.search);
  const fromQuery = query.get('devComplete');

  if (fromQuery === '1') localStorage.setItem(DEV_COMPLETION_STORAGE_KEY, '1');
  if (fromQuery === '0') localStorage.removeItem(DEV_COMPLETION_STORAGE_KEY);

  state.devCompletionMode = localStorage.getItem(DEV_COMPLETION_STORAGE_KEY) === '1';
  if (state.devCompletionMode) {
    pushAuditEntry('info', 'Dev-Completion-Modus aktiv');
  }
}

export function loadDashboardPreferences() {
  try {
    const raw = localStorage.getItem(DASHBOARD_PREFS_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);

    const allowedViews = new Set(['all', 'imported', 'not-imported', 'favorites']);
    if (allowedViews.has(parsed?.dashboardView)) {
      state.dashboardView = parsed.dashboardView;
    }

    const allowedDensities = new Set(['comfortable', 'compact', 'logos']);
    if (allowedDensities.has(parsed?.dashboardDensity)) {
      state.dashboardDensity = parsed.dashboardDensity;
    } else if (typeof parsed?.dashboardCompact === 'boolean') {
      state.dashboardDensity = parsed.dashboardCompact ? 'compact' : 'comfortable';
    }

    const legacyNotImported = Boolean(parsed?.quickFilters?.notImported);
    const legacyFavoritesOnly = Boolean(parsed?.quickFilters?.favoritesOnly);

    if (parsed?.quickFilters && typeof parsed.quickFilters === 'object') {
      state.quickFilters = {
        ...state.quickFilters,
        completed: Boolean(parsed.quickFilters.completed),
        inProgress: Boolean(parsed.quickFilters.inProgress),
      };
    }

    if (state.dashboardView === 'all') {
      if (legacyFavoritesOnly) state.dashboardView = 'favorites';
      else if (legacyNotImported) state.dashboardView = 'not-imported';
    }
  } catch (err) {
    console.warn('[loadDashboardPreferences]', err);
  }
}

export function saveDashboardPreferences() {
  try {
    const payload = {
      dashboardView: state.dashboardView,
      dashboardDensity: state.dashboardDensity,
      quickFilters: {
        completed: Boolean(state.quickFilters?.completed),
        inProgress: Boolean(state.quickFilters?.inProgress),
      },
    };
    localStorage.setItem(DASHBOARD_PREFS_STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn('[saveDashboardPreferences]', err);
  }
}

export function openSettingsDialog() {
  const currentSettings = loadSettings();
  const settingsPanel = createSettingsPanel(currentSettings, (updated) => {
    saveSettings(updated);
    showToast('Einstellungen gespeichert', 'success', 2000);
    window.location.reload();
  }, {
    onAction: handleSettingsAction,
  });

  const dialog = document.createElement('dialog');
  dialog.id = 'dialog-settings';
  dialog.className = 'ss-dialog';
  dialog.style.cssText = 'width: min(92vw, 760px); max-height: 88vh;';
  dialog.innerHTML = '<h2>Einstellungen</h2>';
  dialog.appendChild(settingsPanel);
  document.body.appendChild(dialog);
  closeOtherOpenDialogs([dialog]);
  dialog.showModal();
  dialog.addEventListener('close', () => dialog.remove());
}

function removeScopedSessionRuntimeData() {
  try {
    sessionStorage.removeItem(getOauthRedirectStateKey());
  } catch {
    // Ignore browser storage access edge cases.
  }
}

function removeCacheInvalidationRuntimeKeys() {
  const keys = listMatchingLocalStorageKeys(localStorage);
  if (!keys.length) return;
  removeLocalStorageKeys(localStorage, keys);
}

function scheduleReload(delayMs = 900) {
  window.setTimeout(() => {
    window.location.reload();
  }, delayMs);
}

async function clearAppRuntimeCaches() {
  const swResult = await clearServiceWorkerRuntimeCaches({
    serviceWorkerController: navigator.serviceWorker?.controller,
  });

  cache.clear();
  resetSheetsDataCaches();
  removeCacheInvalidationRuntimeKeys();

  if (!swResult.success && swResult.reason !== 'no-controller') {
    console.warn('[settings reset] SW cache clear not fully acknowledged:', swResult);
  }

  return swResult;
}

function removeStorageForFullRuntimeReset({ includeLoginData }) {
  const keys = getResetLocalStorageKeys({
    includeAuthKeys: Boolean(includeLoginData),
    includeSpreadsheetKey: Boolean(includeLoginData),
  });
  removeLocalStorageKeys(localStorage, keys);
  removeCacheInvalidationRuntimeKeys();
}

async function runCompleteRuntimeReset({ includeLoginData }) {
  await clearAppRuntimeCaches();
  removeScopedSessionRuntimeData();

  const removedCookies = clearCookiesBestEffort({ documentRef: document });

  if (includeLoginData) {
    try {
      signOut();
    } catch (error) {
      console.warn('[settings reset] signOut failed during full reset:', error);
    }
  }

  removeStorageForFullRuntimeReset({ includeLoginData });

  if (includeLoginData) {
    actions.resetToLoggedOut();
    showToast(`Kompletter Reset abgeschlossen (${removedCookies} Cookie(s) geloescht).`, 'success', 3500);
  } else {
    showToast(`Reset abgeschlossen (${removedCookies} Cookie(s) geloescht). Login bleibt erhalten.`, 'success', 3500);
  }

  scheduleReload(1000);
}

async function handleSettingsAction(action) {
  switch (action) {
    case 'clear-history': {
      clearSearchHistory();
      window.SEARCH_HISTORY = [];
      showToast('Suchverlauf geloescht', 'success', 2200);
      return;
    }
    case SETTINGS_RESET_ACTIONS.SEARCH_HISTORY: {
      if (!window.confirm('Suchverlauf wirklich loeschen?')) return;
      clearSearchHistory();
      window.SEARCH_HISTORY = [];
      showToast('Suchverlauf geloescht', 'success', 2200);
      return;
    }
    case SETTINGS_RESET_ACTIONS.FAVORITES: {
      if (!window.confirm('Favoriten wirklich loeschen?')) return;
      removeLocalStorageKeys(localStorage, [scopedStorageKey('favorites-sets')]);
      showToast('Favoriten geloescht', 'success', 2200);
      return;
    }
    case SETTINGS_RESET_ACTIONS.SETTINGS: {
      if (!window.confirm('Lokale App-Einstellungen wirklich loeschen?')) return;
      removeLocalStorageKeys(localStorage, [
        scopedStorageKey('user-settings'),
        DASHBOARD_PREFS_STORAGE_KEY,
        QUEUE_PRESETS_STORAGE_KEY,
        RECENT_SETS_STORAGE_KEY,
        DEV_COMPLETION_STORAGE_KEY,
        'gridZoom',
      ]);
      showToast('Lokale Einstellungen geloescht', 'success', 2400);
      return;
    }
    case SETTINGS_RESET_ACTIONS.SYNC_STATUS: {
      if (!window.confirm('Sync-Status wirklich loeschen?')) return;
      removeLocalStorageKeys(localStorage, [
        scopedStorageKey('sync-status'),
        'tcg_tracker:sync:last_sheets_sync',
        'tcg_tracker:sync:last_api_sync',
      ]);
      showToast('Sync-Status geloescht', 'success', 2400);
      return;
    }
    case SETTINGS_RESET_ACTIONS.CACHE: {
      if (!window.confirm('App-Cache wirklich leeren? Die Seite wird danach neu geladen.')) return;
      await clearAppRuntimeCaches();
      showToast('Cache geleert. Seite wird neu geladen.', 'success', 2600);
      scheduleReload(800);
      return;
    }
    case SETTINGS_RESET_ACTIONS.COOKIES: {
      if (!window.confirm('Cookies dieser App-Domain wirklich loeschen?')) return;
      const removed = clearCookiesBestEffort({ documentRef: document });
      showToast(`Cookies geloescht: ${removed}`, 'success', 2400);
      return;
    }
    case SETTINGS_RESET_ACTIONS.ALL_KEEP_LOGIN: {
      if (!window.confirm('Reset all ausfuehren und Login behalten? Tabelle bleibt unangetastet.')) return;
      await runCompleteRuntimeReset({ includeLoginData: false });
      return;
    }
    case SETTINGS_RESET_ACTIONS.ALL_FULL: {
      if (!window.confirm('Kompletten Reset inkl. Google-Logout ausfuehren? Tabelle bleibt unangetastet.')) return;
      await runCompleteRuntimeReset({ includeLoginData: true });
      return;
    }
    default:
      console.warn('[settings] Unknown settings action:', action);
  }
}
