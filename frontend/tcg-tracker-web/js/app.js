// Einstieg der App: Importe, Aktionsregister, Verdrahtung der Dashboard-Steuerung und Bootstrap.
import { initAuth, signIn, signOut, isSignedIn } from './core/auth.js';
import { CONFIG } from './core/config.js';
import {
  REALTIME_CLIENT_STORAGE_KEY
} from './core/storage-keys.js';
import {
  initSmartEngine,
  getEngineMetrics
} from './features/search/index.js';
import {
  loadSnapshots,
  tryAutoResumeImport
} from './features/collection/index.js';
import { initCommandPalette } from './ui/command-palette.js';
import {
  loadSearchHistory,
  clearSearchHistory,
  generateCollectionReport
} from './enhanced-features.js?v=20261115-umlaute';

import {
  initQuickFiltersUI,
  createExportDialog
} from './ui/components.js?v=20261115-umlaute';

import {
  downloadJson,
  createLocalBackup,
  getLocalBackups
} from './advanced-features.js';
import {
  initRealtimeSync
} from './features/community/index.js';
import { createBootstrapController } from './app/bootstrap-controller.js';
import { initPwaFeatures } from './app/pwa-init.js';
import { dom } from './app/dom.js';
import { state } from './app/state.js';
import { registerActions } from './app/actions.js';
import { showView, navigate, handleRouteChange } from './app/router.js';
import {
  setGlobalStatus,
  setLoading,
  showToast,
  installMojibakeSanitizer,
  openSupportHubDialog,
  openSupportChannel,
  renderAuditPanel,
  updateSaveStatePill,
  updateUndoUi,
  setEmptyState,
  setRefreshMenuOpen,
  syncRefreshControls
} from './ui/helpers.js';
import { loadSets, renderDashboard, getSetById, ensureSetSelectorOption, renderSetSelectorOptions } from './views/dashboard.js';
import { startBrowseMode, stopBrowseMode } from './app/browse-mode.js';
import { runSearch, initSearch, initSearchAutocomplete } from './views/search.js';
import { openSpreadsheetDialog, updateSpreadsheetInfoBar, initSpreadsheetDialog } from './features/settings/spreadsheet-dialog.js';
import { renderStats } from './views/stats.js';
import { prefetchPriceStamp, reloadCardmarketPricesManually } from './views/stats-price.js';
import {
  updateStats, applyFilter, initFilterButtons, initSortControl, getCurrentCardmarketBasePriceType, loadCardmarketPriceSummary,
  hydrateCardmarketLink, makeCheckbox, syncCollectionCheckboxUi, syncSharedLegacyBadge,
  reportCollectionWriteError, ensureWritableCollectionEntry, writeCollectionEntryState, updateCardState,
  broadcastRealtimeCardUpdate, applyIncomingRealtimeUpdate
} from './views/set-cards.js';
import { openLightbox, renderLightbox, initLightbox } from './views/lightbox.js';
import {
  loadRecentSets, syncSetNavLink, positionRecentSetsDropdown, setRecentSetsDropdownOpen, renderRecentSets, markSetAsRecent
} from './app/recent-sets.js';
import {
  updateQueueUiState, enqueueAction, clearQueuedActions, runQueuedActions, ensureSetImportedFromApi, importSetFromOverview,
  syncOverviewFromApi, powerRefreshOverviewFromApi, importAllMissingSets
} from './features/collection/import-jobs.js';
import {
  deleteSetFromCollection, openBatchImportDialog, initBatchImportDialog, initManageImportedSetsDialog, reimportAllImportedSets,
  exportCollectionSummaryCsv, runDataHealthCheck, initBackupImportExport, reimportCurrentSetFromApi
} from './features/collection/collection-dialogs.js';
import { initQueueBuilderDialog } from './features/collection/queue-presets.js';
import { initSheetsWriteFeedback, initAuditAndSaveUi } from './ui/sheets-feedback.js';
import {
  initDevCompletionMode, loadDashboardPreferences, saveDashboardPreferences, openSettingsDialog
} from './features/settings/settings-actions.js';
import {
  initOfflineIndicator, initDashboardHoverPreview, checkSetCompletion, initShortcutsOverlay, initShareButton,
  initCustomSelects, initAutoHideTopbar
} from './ui/app-extras.js';
import {
  initGridZoom, toggleBulkSelect, initBulkEdit, exportMissingCards, initKeyboardNav,
  loadSetCardsV3First, loadSetCardsWithHydration, loadCurrentSet
} from './views/set-view.js';
// Funktionen, die ausgelagerte Module ueber actions.<name>() aufrufen (Funktionsdeklarationen sind gehoistet).
registerActions({
  syncSetNavLink,
  updateStats,
  applyFilter,
  updateCardState,
  broadcastRealtimeCardUpdate,
  setRecentSetsDropdownOpen,
  renderDashboard,
  getSetById,
  ensureSetSelectorOption,
  renderStats,
  runSearch,
  loadCurrentSet,
  loadSets,
  renderRecentSets,
  importSetFromOverview,
  deleteSetFromCollection,
  checkSetCompletion,
  makeCheckbox,
  syncSharedLegacyBadge,
  hydrateCardmarketLink,
  ensureWritableCollectionEntry,
  syncCollectionCheckboxUi,
  writeCollectionEntryState,
  reportCollectionWriteError,
  loadSetCardsV3First,
  openLightbox,
  loadSetCardsWithHydration,
  getCurrentCardmarketBasePriceType,
  loadCardmarketPriceSummary,
  renderLightbox,
  toggleBulkSelect,
  markSetAsRecent,
  resetToLoggedOut,
  ensureSetImportedFromApi,
});

// --------------------------------------------------------------------------
// DASHBOARD-STEUERUNG (nur Verdrahtung der Knoepfe mit den Feature-Modulen)
// --------------------------------------------------------------------------

function initDashboardControls() {
  let debounce;
  dom.dashFilter.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(renderDashboard, 200);
  });
  dom.dashSeriesFilter.addEventListener('change', () => {
    renderDashboard();
  });
  dom.dashSort.addEventListener('change', () => {
    renderDashboard();
  });
  document.querySelectorAll('.dashboard-view-tab').forEach((button) => {
    if (!button.dataset.dashboardView) return;
    button.addEventListener('click', () => {
      const view = button.dataset.dashboardView || 'all';
      if (state.dashboardView === view) return;
      state.dashboardView = view;
      saveDashboardPreferences();
      renderDashboard();
    });
  });
  dom.btnDashboardCompact?.addEventListener('click', () => {
    const order = ['comfortable', 'compact', 'logos'];
    const currentIndex = order.indexOf(state.dashboardDensity || 'comfortable');
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % order.length;
    state.dashboardDensity = order[nextIndex];
    saveDashboardPreferences();
    renderDashboard();
  });
  dom.btnOpenSettings?.addEventListener('click', openSettingsDialog);
  dom.btnOpenSupportHub?.addEventListener('click', openSupportHubDialog);
  dom.supportHubDialog?.querySelectorAll('[data-support-kind]').forEach((button) => {
    button.addEventListener('click', () => openSupportChannel(button.dataset.supportKind));
  });
  dom.supportHubDialog?.querySelectorAll('[data-action="close-support-hub"]').forEach((button) => {
    button.addEventListener('click', () => dom.supportHubDialog.close());
  });
  dom.btnOverviewSync?.addEventListener('click', syncOverviewFromApi);
  dom.btnOverviewPowerRefresh?.addEventListener('click', powerRefreshOverviewFromApi);
  dom.btnImportBatch?.addEventListener('click', openBatchImportDialog);
  dom.btnImportAll?.addEventListener('click', importAllMissingSets);
  dom.btnReimportCurrent?.addEventListener('click', reimportCurrentSetFromApi);
  dom.btnReimportAllImported?.addEventListener('click', reimportAllImportedSets);
  dom.btnExportSummaryCsv?.addEventListener('click', exportCollectionSummaryCsv);
  dom.btnDataHealthCheck?.addEventListener('click', () => runDataHealthCheck({ autoFix: false }));
  dom.btnDataHealthAutofix?.addEventListener('click', () => runDataHealthCheck({ autoFix: true }));
  dom.btnCardmarketReloadPrices?.addEventListener('click', reloadCardmarketPricesManually);
  dom.btnQueueAutofixRefresh?.addEventListener('click', () => {
    enqueueAction('Datencheck + Auto-Fix', () => runDataHealthCheck({ autoFix: true }));
    enqueueAction('Power-Refresh Overview', () => powerRefreshOverviewFromApi());
    showToast('Queue-Preset hinzugefuegt (Auto-Fix → Refresh).', 'info', 3000);
  });
  dom.btnQueueRun?.addEventListener('click', runQueuedActions);
  dom.btnQueueClear?.addEventListener('click', clearQueuedActions);
  dom.btnJobCancel?.addEventListener('click', () => {
    if (state.activeJob) {
      state.activeJob.cancelled = true;
    }
    if (state.queueRunning) {
      state.queueCancelRequested = true;
    }
    if (!state.activeJob && !state.queueRunning) return;
    if (dom.btnJobCancel) dom.btnJobCancel.disabled = true;
    if (dom.jobStatusText) dom.jobStatusText.textContent = 'Abbruch angefordert...';
  });

  updateQueueUiState();
}

// hasRichCardDetails/needsApiCardEnrichment: js/core/card-enrichment.js (v3 massgeblich, siehe dort).

// --------------------------------------------------------------------------
// BOOTSTRAP
// --------------------------------------------------------------------------
function createBootstrapRuntimeController() {
  return createBootstrapController({
    state,
    dom,
    config: CONFIG,
    eventBus: {
      on: (eventName, handler) => {
        window.addEventListener(eventName, (event) => {
          handler(event?.detail || {});
        });
      },
    },
    eventQuickFiltersChanged: 'quick-filters-changed',
    eventClearSearchHistory: 'clear-search-history',
    loadDashboardPreferences,
    loadRecentSets,
    initSmartEngine,
    prefetchPriceStamp,
    initAutoHideTopbar,
    initGridZoom,
    initCustomSelects,
    initFilterButtons,
    spreadsheetDialogController: {
      initSpreadsheetDialog,
    },
    initBatchImportDialog,
    initManageImportedSetsDialog,
    initBackupImportExport,
    initQueueBuilderDialog,
    initDashboardControls,
    initSheetsWriteFeedback,
    initAuditAndSaveUi,
    initDevCompletionMode,
    initSortControl,
    initSearch,
    initOfflineIndicator,
    initDashboardHoverPreview,
    initSearchAutocomplete,
    initShareButton,
    initRealtimeSync,
    realtimeClientStorageKey: REALTIME_CLIENT_STORAGE_KEY,
    applyIncomingRealtimeUpdate,
    initQuickFiltersUI,
    saveDashboardPreferences,
    renderDashboard,
    loadSearchHistory,
    clearSearchHistory,
    showToast,
    openBatchImportDialog,
    runDataHealthCheck,
    downloadJson,
    loadSnapshots,
    openSettingsDialog,
    generateCollectionReport,
    createExportDialog,
    createLocalBackup,
    getLocalBackups,
    initCommandPalette,
    getEngineMetrics,
    navigate,
    setRecentSetsDropdownOpen,
    setRefreshMenuOpen,
    positionRecentSetsDropdown,
    handleRouteChange,
    setLoading,
    setGlobalStatus,
    initAuth,
    syncAuthButtonLabel,
    signIn,
    signOut,
    resetToLoggedOut,
    startBrowseModeUi,
    isSignedIn,
    loadCurrentSet,
    reimportCurrentSetFromApi,
    exportMissingCards,
    onLoginSuccess,
    showView,
    syncRefreshControls,
    syncSetNavLink,
    setEmptyState,
  });
}

async function bootstrap() {
  const bootstrapController = createBootstrapRuntimeController();
  await bootstrapController.bootstrapCore();

  installMojibakeSanitizer();

  initLightbox();
  initBulkEdit();
  initKeyboardNav();

  await bootstrapController.bootstrapPostCore();
}

async function onLoginSuccess() {
  stopBrowseModeUi();
  state.loggedIn = true;
  dom.auth.dataset.state = 'out'; dom.auth.disabled = false; syncAuthButtonLabel();
  renderRecentSets();
  if (!CONFIG.SPREADSHEET_ID) { openSpreadsheetDialog(true); setLoading(false); return; }
  updateSpreadsheetInfoBar();
  await loadSets();

  // Wenn der letzte Bulk-Import wegen abgelaufenem Login pausiert wurde,
  // automatisch fortsetzen – der User muss nicht erneut auf
  // "Alle fehlenden importieren" klicken.
  const wasBlocked = state.importAuthBlocked;
  if (wasBlocked) {
    state.importAuthBlocked = false;
    await tryAutoResumeImport({
      importAuthBlocked: true,
      runImport: importAllMissingSets,
      showToast,
      setGlobalStatus,
    });
  }
}

function resetToLoggedOut() {
  state.loggedIn = false; state.sets = []; state.allSets = []; state.importedSetsAll = []; state.currentSet = null;
  state.dbMap = new Map(); state.cards = []; state.summaryData = null;
  syncSetNavLink(null);
  state.summaryOverrides = new Map();
  state.pendingWrites = 0;
  state.lastSaveError = null;
  state.undoStack = [];
  state.auditEntries = [];
  dom.cards.innerHTML = '';
  dom.selector.innerHTML = '<option value="">Bitte w\u00e4hlen\u2026</option>';
  dom.selector.disabled = true; dom.load.disabled = true; dom.refresh.disabled = true;
  if (dom.btnRefreshMenu) dom.btnRefreshMenu.disabled = true;
  setRefreshMenuOpen(false);
  dom.auth.dataset.state = 'in'; dom.auth.disabled = false; syncAuthButtonLabel();
  dom.statsSection.classList.add('hidden');
  dom.filterSection.classList.add('hidden');
  dom.sortSection.classList.add('hidden');
  dom.setLogoWrap.classList.add('hidden');
  dom.spreadsheetInfo.classList.add('hidden');
  dom.mainNav.classList.add('hidden');
  dom.auditPanel?.classList.add('hidden');
  renderRecentSets();
  renderAuditPanel();
  updateSaveStatePill();
  updateUndoUi();
  setEmptyState(true);
  setGlobalStatus('Abgemeldet.');
  showView('dashboard');
  dom.dashboardGrid.innerHTML = '<p class="empty-state">Bitte anmelden.</p>';
  // Schalter an: statt der leeren Seite in den Stoebermodus (alle Sets aus api/v3, ohne Sammlung).
  startBrowseModeUi().catch((err) => console.warn('[browse-mode]', err));
}

function setStatsNavHidden(hidden) {
  dom.mainNav?.querySelector('[data-view="stats"]')?.classList.toggle('hidden', hidden);
}

/** Stoebermodus ohne Login starten (app-flags.json); false = Schalter aus, Seite bleibt bei "Bitte anmelden". */
async function startBrowseModeUi() {
  return startBrowseMode({
    onEnter: (sets) => {
      dom.mainNav.classList.remove('hidden');
      setStatsNavHidden(true);
      renderSetSelectorOptions();
      dom.selector.disabled = false;
      dom.load.disabled = false;
      setGlobalStatus(`Stöbermodus – ${sets.length} Sets`);
      if (!window.location.hash || window.location.hash === '#') navigate('dashboard');
      else handleRouteChange();
    },
  });
}

function stopBrowseModeUi() {
  stopBrowseMode();
  setStatsNavHidden(false);
}

function getAuthButtonLabel() {
  const isNarrow = window.matchMedia('(max-width: 360px)').matches;
  if (dom.auth?.dataset?.state === 'out') return 'Logout';
  return isNarrow ? 'Login' : 'Google Login';
}

function syncAuthButtonLabel() {
  if (!dom.auth) return;
  dom.auth.textContent = getAuthButtonLabel();
}

bootstrap().catch((err) => {
  console.error(err);
  setGlobalStatus(`Fehler: ${err.message}`);
  setLoading(false);
});

// --------------------------------------------------------------------------
// SERVICE WORKER + PWA-INSTALL (js/app/pwa-init.js)
// --------------------------------------------------------------------------
initPwaFeatures({ showToast });

// --------------------------------------------------------------------------
// FEATURE 8: Keyboard-Shortcuts Overlay (js/ui/app-extras.js)
// --------------------------------------------------------------------------
initShortcutsOverlay();
