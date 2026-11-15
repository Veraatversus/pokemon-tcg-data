import { initAuth, signIn, signOut, isSignedIn } from './core/auth.js';
import {
  listSetsOverviewData,
  readSetCollectionMap,
  ensureCollectionEntry,
  updateCellBooleansBatch,
  readSummarySheet,
  writeSetting,
  importSetIntoCollection,
  upsertOverviewSet,
  markAliasSetRowsNotImported,
  syncOverviewWithApiSets,
  resetSheetsDataCaches,
  listCollectionSetIds,
  invalidateCollectionRowCache
} from './data/sheets-db.js?v=20261114-clean-1';
import {
  emptyCollectionEntry,
  hasEntryCells,
  stateCellUpdates,
  applyEntryState,
  adoptEnsuredEntry,
  pendingAmbiguityError,
  isAmbiguousLegacyKeyError,
  compareSetCollection
} from './data/collection-writes.js';
import { findSetByIdOrAlias } from './data/set-aliases.js';
import { fetchMergedCards, fetchMergedCardsWithSetMeta, fetchAllAvailableSets } from './data/pokemon-api.js?v=20261114-clean-1';
import { loadPriceStamp, refreshV3Prices } from './data/v3-prices.js?v=20261114-clean-1';
import {
  toBoolean
} from './core/utils.js';
import * as cache from './core/cache.js';
import { CONFIG, scopedStorageKey } from './core/config.js';
import {
  QUEUE_PRESETS_STORAGE_KEY,
  DASHBOARD_PREFS_STORAGE_KEY,
  RECENT_SETS_STORAGE_KEY,
  REALTIME_CLIENT_STORAGE_KEY,
  DEV_COMPLETION_STORAGE_KEY
} from './core/storage-keys.js';
import {
  initSmartEngine,
  getEngineMetrics
} from './features/search/index.js';
import {
  createAutoSnapshot,
  loadSnapshots,
  applyDeleteSetCellUpdates,
  tryAutoResumeImport
} from './features/collection/index.js';
import {
  loadLegacyWorkbookFromFile,
  loadLegacyWorkbookFromSpreadsheetInput,
  parseLegacyWorkbook,
  buildLegacyImportPlan,
  buildLegacyImportSelectionTree,
  filterLegacyImportPlanBySelection,
  summarizeLegacyImportPlan,
  extractLegacySpreadsheetId
} from './features/collection/legacy-import.js?v=20261114-clean-1';
import { ensureResolverForSet } from './data/collection-aliases.js';
import { buildCollectionBackupSets } from './features/collection/backup-export.js';
import { buildBackupRestoreSnapshot, planBackupRestore, pickSourceSetKey, resolveSourceCardKey } from './features/collection/legacy-key-resolution.js';
import { initCommandPalette } from './ui/command-palette.js';
import {
  resetCardmarketPriceSummaryCaches
} from './ui/cardmarket-price.js?v=20261114-clean-1';
import {
  loadSearchHistory,
  clearSearchHistory,
  generateCollectionReport,
  loadSettings,
  saveSettings
} from './enhanced-features.js?v=20261114-clean-1';

import {
  initQuickFiltersUI,
  createExportDialog,
  createSettingsPanel
} from './ui/components.js?v=20261114-clean-1';
import {
  initSheetsWriteFeedback as initSheetsWriteFeedbackUi,
  resetSheetsRetryMetrics as resetSheetsRetryMetricsUi,
  renderSheetsRetryReport as renderSheetsRetryReportUi,
  openSheetsRetryReportDialog as openSheetsRetryReportDialogUi
} from './ui/sheets-retry-report.js';

import {
  downloadJson,
  createLocalBackup,
  getLocalBackups
} from './advanced-features.js';
import {
  initRealtimeSync
} from './features/community/index.js';
import {
  SETTINGS_RESET_ACTIONS,
  clearCookiesBestEffort,
  clearServiceWorkerRuntimeCaches,
  getOauthRedirectStateKey,
  getResetLocalStorageKeys,
  listMatchingLocalStorageKeys,
  removeLocalStorageKeys,
} from './features/settings/runtime-reset.js';
import { runWithRetry, isRetryableError } from './core/retry.js';
import { createBootstrapController } from './app/bootstrap-controller.js';
import { initPwaFeatures } from './app/pwa-init.js';
import { dom } from './app/dom.js';
import { state } from './app/state.js';
import { isSheetsQuotaError, getImportCooldownMs } from './features/collection/import-rate-limit.js';
import { isAuthReloginRequiredError, getAuthReloginImportMessage } from './features/collection/import-auth-guard.js';
import { registerActions } from './app/actions.js';
import { showView, navigate, handleRouteChange } from './app/router.js';
import {
  setGlobalStatus,
  setLoading,
  showToast,
  normalizeUiText,
  installMojibakeSanitizer,
  closeOtherOpenDialogs,
  openSupportHubDialog,
  openSupportChannel,
  pushAuditEntry,
  renderAuditPanel,
  updateSaveStatePill,
  updateUndoUi,
  undoLastChange,
  getErrorMessage,
  setEmptyState,
  setRefreshMenuOpen,
  syncRefreshControls
} from './ui/helpers.js';
import {
  allImportedSets, loadSets, buildSeriesMap, renderDashboard,
  syncDashboardCardForSet, getSetById, ensureSetSelectorOption
} from './views/dashboard.js';
import {
  renderSearchSetFilterOptions, runSearch, initSearch, initSearchAutocomplete
} from './views/search.js';
import { openSpreadsheetDialog, updateSpreadsheetInfoBar, initSpreadsheetDialog } from './features/settings/spreadsheet-dialog.js';
import { renderStats } from './views/stats.js';
import {
  updateStats, applyFilter, initFilterButtons, initSortControl, getCurrentCardmarketBasePriceType, loadCardmarketPriceSummary,
  hydrateCardmarketLink, makeCheckbox, syncCollectionCheckboxUi, syncSharedLegacyBadge, onAmbiguousLegacyKey,
  reportCollectionWriteError, ensureWritableCollectionEntry, writeCollectionEntryState, updateCardState,
  broadcastRealtimeCardUpdate, applyIncomingRealtimeUpdate
} from './views/set-cards.js';
import { openLightbox, renderLightbox, initLightbox } from './views/lightbox.js';
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
  renderSetSelectorOptions,
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

/**
 * App-Start: liest den Preis-Stamp (api/v3/prices/meta.json generatedAt) vorab, damit die ersten
 * Preisdateien sofort mit ?v=<stamp> geladen werden. Fire-and-forget – blockiert den Bootstrap nicht.
 * @returns {Promise<string>} Stamp ('' ohne Stamp/bei Fehler)
 */
async function prefetchPriceStamp() {
  try {
    return await loadPriceStamp();
  } catch (err) {
    console.warn('[v3-prices] stamp prefetch failed', err);
    return '';
  }
}

/**
 * Manueller Cardmarket-Preis-Refresh, ausgeloest vom Settings-Button 'Preise neu laden'.
 * Leert immer die Preis-Caches (Preisdateien + Preis-Zusammenfassungen je Karte) und liest
 * api/v3/prices/meta.json neu; ein neuer Stamp laedt neue Preisdateien.
 */
async function reloadCardmarketPricesManually() {
  const btn = dom.btnCardmarketReloadPrices;
  if (!btn) return;

  setLoading(true, 'Pruefe Cardmarket-Preise...');
  btn.disabled = true;
  try {
    const result = await refreshV3Prices();
    resetCardmarketPriceSummaryCaches();
    const stampLabel = result.currentStamp
      ? new Date(result.currentStamp).toLocaleString('de-DE')
      : '(unbekannt)';

    if (result.changed) {
      showToast(`Cardmarket-Preise aktualisiert (Stand ${stampLabel}).`, 'success', 5000);
    } else {
      showToast(
        `Cardmarket-Preise sind aktuell (Stand ${stampLabel}). Preis-Caches wurden geleert.`,
        'info',
        4000
      );
    }
  } catch (err) {
    const message = getErrorMessage(err, 'Unbekannter Fehler');
    showToast(`Preis-Refresh fehlgeschlagen: ${message}`, 'error', 6000);
    console.warn('[cardmarket-manual-refresh] failed', err);
  } finally {
    setLoading(false);
    btn.disabled = false;
  }
}

const LOADING_MAX_BLOCK_MS = 12000;

const AUTO_IMPORT_QUEUE_LIMIT = 3;
const IMPORT_BASE_GAP_MS = 1200;
const IMPORT_QUOTA_BASE_DELAY_MS = 12000;
const IMPORT_MAX_DELAY_MS = 45000;
const IMPORT_RETRY_ATTEMPTS = 3;
const IMPORT_WRITE_PREFLIGHT_KEY = 'runtime_last_write_probe';

function waitMs(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, Math.max(0, Number(ms) || 0));
  });
}

function isImportRetryableError(error) {
  return isSheetsQuotaError(error) || isRetryableError(error);
}

function resolveQuotaCooldownMs(consecutiveQuotaErrors = 0) {
  return getImportCooldownMs({
    consecutiveQuotaErrors,
    baseDelayMs: IMPORT_BASE_GAP_MS,
    quotaBaseDelayMs: IMPORT_QUOTA_BASE_DELAY_MS,
    maxDelayMs: IMPORT_MAX_DELAY_MS,
  });
}

async function importSetIntoCollectionWithBackoff(set, contextLabel = '') {
  return runWithRetry(async () => {
    const { cards, setMetaPatch } = await fetchMergedCardsWithSetMeta(set.setId);
    await importSetIntoCollection({ ...set, ...(setMetaPatch || {}) }, cards);
    return { cards, setMetaPatch };
  }, {
    attempts: IMPORT_RETRY_ATTEMPTS,
    baseDelayMs: 900,
    maxDelayMs: 7000,
    shouldRetry: isImportRetryableError,
    onRetry: (error, retryState) => {
      const nextWaitSeconds = Math.ceil(Number(retryState?.nextDelayMs || 0) / 1000);
      if (!Number.isFinite(nextWaitSeconds) || nextWaitSeconds <= 0) return;
      const prefix = contextLabel ? `${contextLabel}: ` : '';
      const reason = isSheetsQuotaError(error) ? 'API-Quota' : 'temporarer Fehler';
      setGlobalStatus(`${prefix}Wiederhole (${reason}) in ${nextWaitSeconds}s`);
    },
  });
}

async function runImportWritePreflight(contextLabel = 'Import') {
  try {
    await writeSetting(IMPORT_WRITE_PREFLIGHT_KEY, new Date().toISOString());
    state.importAuthBlocked = false;
    return true;
  } catch (error) {
    if (isAuthReloginRequiredError(error)) {
      state.importAuthBlocked = true;
      const message = getAuthReloginImportMessage();
      showToast(message, 'error', 7000);
      setGlobalStatus(`${contextLabel}: ${message}`);
      return false;
    }
    throw error;
  }
}

function resolveAutoImportSetLabel(setId) {
  const match = getSetById(setId)
    || (state.currentSet?.setId === setId ? state.currentSet : null);
  return match?.setName || setId;
}

function updateAutoImportQueueUi() {
  if (state.activeJob || state.queueRunning) return;
  if (!dom.jobPanel || !dom.jobTitle || !dom.jobStatusText) return;

  const activeSetId = state.autoImportActiveSetId;
  const queuedIds = Array.isArray(state.autoImportQueuedSetIds) ? state.autoImportQueuedSetIds : [];
  const totalCount = (activeSetId ? 1 : 0) + queuedIds.length;

  if (totalCount === 0) {
    if (dom.jobTitle.textContent === 'Auto-Import Queue') {
      dom.jobPanel.classList.add('hidden');
      dom.jobTitle.textContent = 'Job Queue';
      dom.jobStatusText.textContent = 'Bereit';
      if (dom.btnJobCancel) dom.btnJobCancel.disabled = true;
    }
    return;
  }

  dom.jobPanel.classList.remove('hidden');
  dom.jobTitle.textContent = 'Auto-Import Queue';
  const activeLabel = activeSetId ? `Aktiv: ${resolveAutoImportSetLabel(activeSetId)}` : 'Wartet auf freien Slot';
  const waitingLabel = queuedIds.length ? ` - ${queuedIds.length} wartend` : '';
  dom.jobStatusText.textContent = `${activeLabel}${waitingLabel}`;
  if (dom.btnJobCancel) dom.btnJobCancel.disabled = true;
}

function renderSetSelectorOptions(preferredValue = '') {
  if (!dom.selector) return;

  const desiredValue = String(preferredValue || dom.selector.value || '').trim();
  const importedSets = Array.isArray(state.sets) ? state.sets.filter((set) => set?.setId) : [];
  const knownSets = Array.isArray(state.allSets) && state.allSets.length
    ? state.allSets.filter((set) => set?.setId)
    : importedSets;
  const notImportedSets = [...knownSets]
    .filter((set) => !toBoolean(set.imported))
    .sort((a, b) => String(a.setName || a.setId).localeCompare(String(b.setName || b.setId), undefined, {
      numeric: true,
      sensitivity: 'base'
    }));

  dom.selector.innerHTML = '<option value="">Bitte wählen...</option>';

  const seriesMap = buildSeriesMap(importedSets);
  seriesMap.forEach((groupInfo) => {
    const group = document.createElement('optgroup');
    group.label = groupInfo.label;
    group.dataset.seriesKey = groupInfo.key;
    groupInfo.sets.forEach((set) => {
      const opt = document.createElement('option');
      opt.value = set.setId;
      opt.textContent = set.setName;
      opt.dataset.imported = 'true';
      group.appendChild(opt);
    });
    dom.selector.appendChild(group);
  });

  if (notImportedSets.length) {
    const extraGroup = document.createElement('optgroup');
    extraGroup.label = 'Weitere Sets (noch nicht importiert)';
    extraGroup.dataset.seriesKey = 'not-imported';

    notImportedSets.forEach((set) => {
      const opt = document.createElement('option');
      opt.value = set.setId;
      opt.textContent = set.setName || set.setId;
      opt.dataset.imported = 'false';
      opt.classList.add('option-not-imported');
      extraGroup.appendChild(opt);
    });

    dom.selector.appendChild(extraGroup);
  }

  if (desiredValue && Array.from(dom.selector.options).some((option) => option.value === desiredValue)) {
    dom.selector.value = desiredValue;
  }
}

function loadRecentSets() {
  try {
    const raw = localStorage.getItem(RECENT_SETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && item.setId)
      .map((item) => ({
        setId: String(item.setId),
        setName: String(item.setName || item.setId),
        at: Number(item.at) || Date.now()
      }))
      .slice(0, 8);
  } catch (err) {
    console.warn('[loadRecentSets]', err);
    return [];
  }
}

function saveRecentSets() {
  try {
    localStorage.setItem(RECENT_SETS_STORAGE_KEY, JSON.stringify(state.recentSets || []));
  } catch (err) {
    console.warn('[saveRecentSets]', err);
  }
}

function syncSetNavLink(setMeta = state.currentSet) {
  if (!dom.navSetLink) return;
  const label = String(setMeta?.setName || 'Set-Ansicht');
  dom.navSetLink.textContent = label;
  dom.navSetLink.title = label;
  dom.navSetLink.href = setMeta?.setId ? `#set/${setMeta.setId}` : '#set';
}

function positionRecentSetsDropdown() {
  if (!dom.navSetSplit || !dom.recentSets || !dom.navSetSplit.classList.contains('open')) return;

  const anchorRect = dom.navSetSplit.getBoundingClientRect();
  const viewportPadding = 12;
  const maxWidth = Math.min(340, window.innerWidth - (viewportPadding * 2));
  const menuWidth = Math.min(dom.recentSets.offsetWidth || maxWidth, maxWidth);
  let left = anchorRect.left;

  if ((left + menuWidth) > (window.innerWidth - viewportPadding)) {
    left = window.innerWidth - viewportPadding - menuWidth;
  }
  if (left < viewportPadding) {
    left = viewportPadding;
  }

  dom.recentSets.style.setProperty('--recent-sets-left', `${Math.round(left)}px`);
  dom.recentSets.style.setProperty('--recent-sets-top', `${Math.round(anchorRect.bottom + 8)}px`);
}

function setRecentSetsDropdownOpen(isOpen) {
  if (!dom.navSetSplit || !dom.btnNavSetToggle || !dom.recentSets) return;
  const hasItems = !dom.recentSets.classList.contains('hidden') && dom.recentSets.childElementCount > 0;
  const shouldOpen = Boolean(isOpen) && hasItems;
  dom.navSetSplit.classList.toggle('open', shouldOpen);
  dom.btnNavSetToggle.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
  if (shouldOpen) {
    window.requestAnimationFrame(positionRecentSetsDropdown);
  }
}

function syncRecentSetsDropdownAvailability(hasItems) {
  if (!dom.btnNavSetToggle) return;
  dom.btnNavSetToggle.disabled = !hasItems;
  dom.btnNavSetToggle.setAttribute('aria-disabled', hasItems ? 'false' : 'true');
  if (!hasItems) {
    setRecentSetsDropdownOpen(false);
  }
}

function renderRecentSets() {
  if (!dom.recentSets) return;
  const recent = (Array.isArray(state.recentSets) ? state.recentSets : [])
    .filter((entry) => !state.isExcludedSet(entry));
  if (!state.loggedIn || recent.length === 0) {
    dom.recentSets.classList.add('hidden');
    dom.recentSets.innerHTML = '';
    syncRecentSetsDropdownAvailability(false);
    return;
  }

  const labelsById = new Map((state.allSets || []).map((set) => [set.setId, set.setName || set.setId]));
  dom.recentSets.innerHTML = recent
    .map((entry) => {
      const label = labelsById.get(entry.setId) || entry.setName || entry.setId;
      return `<button class="recent-set-chip" type="button" role="menuitem" data-set-id="${entry.setId}" title="${label}">${label}</button>`;
    })
    .join('');
  dom.recentSets.classList.remove('hidden');
  syncRecentSetsDropdownAvailability(true);
  if (dom.navSetSplit?.classList.contains('open')) {
    window.requestAnimationFrame(positionRecentSetsDropdown);
  }

  dom.recentSets.querySelectorAll('.recent-set-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const setId = chip.dataset.setId;
      if (!setId) return;
      dom.selector.value = setId;
      setRecentSetsDropdownOpen(false);
      navigate(`set/${setId}`);
    });
  });
}

function markSetAsRecent(setMeta) {
  if (!setMeta?.setId) return;
  const normalizedId = String(setMeta.setId);
  const normalizedName = String(setMeta.setName || normalizedId);
  const next = [
    { setId: normalizedId, setName: normalizedName, at: Date.now() },
    ...(state.recentSets || []).filter((entry) => String(entry.setId) !== normalizedId)
  ].slice(0, 8);

  state.recentSets = next;
  saveRecentSets();
  renderRecentSets();
}

function initSheetsWriteFeedback() {
  initSheetsWriteFeedbackUi({
    state,
    renderSheetsRetryReport,
    setGlobalStatus,
    updateJob,
  });
}

function resetSheetsRetryMetrics() {
  resetSheetsRetryMetricsUi(state, renderSheetsRetryReport);
}

function renderSheetsRetryReport() {
  renderSheetsRetryReportUi({ dom, state });
}

function openSheetsRetryReportDialog() {
  openSheetsRetryReportDialogUi(dom, renderSheetsRetryReport);
}

function initAuditAndSaveUi() {
  updateSaveStatePill();
  renderAuditPanel();
  updateUndoUi();

  dom.btnAuditPanel?.addEventListener('click', () => {
    if (!dom.auditPanel) return;
    dom.auditPanel.classList.toggle('hidden');
    const expanded = !dom.auditPanel.classList.contains('hidden');
    dom.btnAuditPanel.setAttribute('aria-expanded', String(expanded));
  });

  dom.btnAuditClear?.addEventListener('click', () => {
    state.auditEntries = [];
    renderAuditPanel();
  });

  dom.btnUndoLast?.addEventListener('click', () => undoLastChange());

  window.addEventListener('keydown', (event) => {
    const isUndo = (event.ctrlKey || event.metaKey) && String(event.key).toLowerCase() === 'z';
    if (!isUndo) return;
    if (event.target?.matches?.('input, textarea, [contenteditable="true"]')) return;
    event.preventDefault();
    undoLastChange();
  });
}

function initDevCompletionMode() {
  const query = new URLSearchParams(window.location.search);
  const fromQuery = query.get('devComplete');

  if (fromQuery === '1') localStorage.setItem(DEV_COMPLETION_STORAGE_KEY, '1');
  if (fromQuery === '0') localStorage.removeItem(DEV_COMPLETION_STORAGE_KEY);

  state.devCompletionMode = localStorage.getItem(DEV_COMPLETION_STORAGE_KEY) === '1';
  if (state.devCompletionMode) {
    pushAuditEntry('info', 'Dev-Completion-Modus aktiv');
  }
}

function loadDashboardPreferences() {
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

function saveDashboardPreferences() {
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

function startJob(title, totalSteps = 0) {
  const job = {
    id: Date.now(),
    title,
    totalSteps: Math.max(0, Number(totalSteps) || 0),
    current: 0,
    cancelled: false,
    startedAt: Date.now()
  };
  state.activeJob = job;
  dom.jobPanel?.classList.remove('hidden');
  if (dom.jobTitle) dom.jobTitle.textContent = normalizeUiText(title);
  if (dom.jobStatusText) dom.jobStatusText.textContent = 'Gestartet...';
  if (dom.jobProgressFill) dom.jobProgressFill.style.width = '0%';
  if (dom.btnJobCancel) dom.btnJobCancel.disabled = false;
  return job;
}

function pushJobHistory(text) {
  if (!dom.jobHistory) return;
  const item = document.createElement('li');
  item.textContent = normalizeUiText(text);
  dom.jobHistory.prepend(item);
  while (dom.jobHistory.children.length > 30) {
    dom.jobHistory.removeChild(dom.jobHistory.lastChild);
  }
}

function updateJob(job, current, text) {
  if (!job || state.activeJob?.id !== job.id) return;
  job.current = Math.max(0, Number(current) || 0);
  const pct = job.totalSteps > 0 ? Math.min(100, Math.round((job.current / job.totalSteps) * 100)) : 0;
  if (dom.jobProgressFill) dom.jobProgressFill.style.width = `${pct}%`;
  if (dom.jobStatusText) dom.jobStatusText.textContent = normalizeUiText(text || `${job.current}/${job.totalSteps}`);
}

function finishJob(job, summary, isError = false) {
  if (!job || state.activeJob?.id !== job.id) return;
  if (dom.jobStatusText) dom.jobStatusText.textContent = normalizeUiText(summary);
  if (dom.btnJobCancel) dom.btnJobCancel.disabled = true;
  if (dom.jobProgressFill && job.totalSteps > 0) {
    dom.jobProgressFill.style.width = isError ? dom.jobProgressFill.style.width : '100%';
  }
  pushJobHistory(`${new Date().toLocaleTimeString('de-DE')} - ${job.title}: ${summary}`);
  state.activeJob = null;
}

function assertJobNotCancelled(job) {
  if (job?.cancelled) {
    throw new Error('Vorgang abgebrochen.');
  }
}

function updateQueueUiState() {
  const queued = state.queuedActions.length;
  if (dom.btnQueueRun) dom.btnQueueRun.disabled = state.queueRunning || queued === 0;
  if (dom.btnQueueClear) dom.btnQueueClear.disabled = state.queueRunning || queued === 0;
}

function enqueueAction(label, action) {
  state.queuedActions.push({ id: Date.now() + Math.random(), label, action });
  pushJobHistory(`${new Date().toLocaleTimeString('de-DE')} - Queue hinzugefuegt: ${label}`);
  updateQueueUiState();
}

function clearQueuedActions() {
  const count = state.queuedActions.length;
  state.queuedActions = [];
  updateQueueUiState();
  if (count > 0) showToast(`Queue geleert (${count} entfernt).`, 'info');
}

async function runQueuedActions() {
  if (state.queueRunning || state.queuedActions.length === 0) return;
  state.queueRunning = true;
  state.queueCancelRequested = false;
  updateQueueUiState();
  dom.jobPanel?.classList.remove('hidden');
  if (dom.jobTitle) dom.jobTitle.textContent = 'Job Queue';

  try {
    while (state.queuedActions.length > 0) {
      if (state.queueCancelRequested) {
        pushJobHistory(`${new Date().toLocaleTimeString('de-DE')} - Queue abgebrochen`);
        break;
      }
      const next = state.queuedActions.shift();
      updateQueueUiState();
      if (dom.jobStatusText) dom.jobStatusText.textContent = `Queue: ${next.label}`;
      pushJobHistory(`${new Date().toLocaleTimeString('de-DE')} - Queue startet: ${next.label}`);
      try {
        await next.action();
      } catch (err) {
        pushJobHistory(`${new Date().toLocaleTimeString('de-DE')} - Queue-Fehler: ${next.label} (${err.message})`);
        showToast(`Queue gestoppt: ${next.label} - ${err.message}`, 'error', 6000);
        break;
      }
    }
  } finally {
    const remaining = state.queuedActions.length;
    state.queueRunning = false;
    state.queueCancelRequested = false;
    updateQueueUiState();
    if (remaining === 0) {
      if (dom.jobStatusText) dom.jobStatusText.textContent = 'Queue beendet';
      showToast('Queue abgearbeitet.', 'success', 3000);
    } else {
      if (dom.jobStatusText) dom.jobStatusText.textContent = `Queue gestoppt (${remaining} offen)`;
    }
  }
}

function getQueueBuilderActionsCatalog() {
  return [
    {
      id: 'overview-sync',
      label: 'Overview sync',
      description: 'Abgleich der Overview-Liste mit API-Sets',
      action: () => syncOverviewFromApi()
    },
    {
      id: 'power-refresh',
      label: 'Power-Refresh Overview',
      description: 'Overview-Update mit Aenderungsreport',
      action: () => powerRefreshOverviewFromApi()
    },
    {
      id: 'health-check',
      label: 'Datencheck',
      description: 'Prueft importierte Sets auf API/Sheet-Mismatch',
      action: () => runDataHealthCheck({ autoFix: false })
    },
    {
      id: 'health-autofix',
      label: 'Datencheck + Auto-Fix',
      description: 'Datencheck mit optionalem Reimport betroffener Sets',
      action: () => runDataHealthCheck({ autoFix: true })
    },
    {
      id: 'reimport-all',
      label: 'Alle importierten aktualisieren',
      description: 'Reimport aller bereits importierten Sets',
      action: () => reimportAllImportedSets()
    },
    {
      id: 'export-summary-csv',
      label: 'Summary CSV exportieren',
      description: 'Export der Sammlung als CSV-Datei',
      action: () => exportCollectionSummaryCsv()
    },
    {
      id: 'data-health-report',
      label: 'Datencheck-Report exportieren',
      description: 'Erstellt Konsistenzreport als JSON',
      action: () => runDataHealthCheck({ autoFix: false })
    }
  ];
}

function loadQueuePresetsFromStorage() {
  try {
    const raw = localStorage.getItem(QUEUE_PRESETS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.name === 'string' && Array.isArray(item.actionIds))
      .map((item) => ({ name: item.name, actionIds: item.actionIds }));
  } catch {
    return [];
  }
}

function persistQueuePresets() {
  localStorage.setItem(QUEUE_PRESETS_STORAGE_KEY, JSON.stringify(state.queuePresets));
}

function renderQueuePresetSelect() {
  if (!dom.queuePresetSelect) return;
  dom.queuePresetSelect.innerHTML = '<option value="">Preset laden...</option>';
  state.queuePresets.forEach((preset, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = preset.name;
    dom.queuePresetSelect.appendChild(option);
  });
}

function saveCurrentQueuePreset() {
  if (!state.queueBuilderSequence.length) {
    showToast('Keine Aktionen fuer Preset ausgewaehlt.', 'info');
    return;
  }
  const name = window.prompt('Preset-Name:');
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
  persistQueuePresets();
  renderQueuePresetSelect();
  showToast(`Preset gespeichert: ${trimmedName}`, 'success', 2500);
}

function deleteSelectedQueuePreset() {
  const idx = Number(dom.queuePresetSelect?.value ?? '-1');
  if (!Number.isInteger(idx) || idx < 0 || idx >= state.queuePresets.length) {
    showToast('Bitte ein Preset auswaehlen.', 'info');
    return;
  }
  const presetName = state.queuePresets[idx].name;
  const ok = window.confirm(`Preset ${presetName} loeschen?`);
  if (!ok) return;
  state.queuePresets.splice(idx, 1);
  persistQueuePresets();
  renderQueuePresetSelect();
  if (dom.queuePresetSelect) dom.queuePresetSelect.value = '';
  showToast(`Preset geloescht: ${presetName}`, 'info', 2500);
}

function renameSelectedQueuePreset() {
  const idx = Number(dom.queuePresetSelect?.value ?? '-1');
  if (!Number.isInteger(idx) || idx < 0 || idx >= state.queuePresets.length) {
    showToast('Bitte ein Preset auswaehlen.', 'info');
    return;
  }
  const preset = state.queuePresets[idx];
  const newName = window.prompt('Neuer Name:', preset.name);
  if (newName === null) return;
  const trimmedName = newName.trim();
  if (!trimmedName) return;
  const collision = state.queuePresets.findIndex((p, i) => i !== idx && p.name.toLowerCase() === trimmedName.toLowerCase());
  if (collision >= 0) {
    showToast(`Name ${trimmedName}" wird bereits verwendet.`, 'error', 3500);
    return;
  }
  preset.name = trimmedName;
  persistQueuePresets();
  renderQueuePresetSelect();
  dom.queuePresetSelect.value = String(idx);
  showToast(`Preset umbenannt: ${trimmedName}`, 'success', 2500);
}

function duplicateSelectedQueuePreset() {
  const idx = Number(dom.queuePresetSelect?.value ?? '-1');
  if (!Number.isInteger(idx) || idx < 0 || idx >= state.queuePresets.length) {
    showToast('Bitte ein Preset auswaehlen.', 'info');
    return;
  }
  const preset = state.queuePresets[idx];
  const defaultName = `${preset.name} (Kopie)`;
  const newName = window.prompt('Name der Kopie:', defaultName);
  if (newName === null) return;
  const trimmedName = newName.trim();
  if (!trimmedName) return;
  const collision = state.queuePresets.findIndex((p) => p.name.toLowerCase() === trimmedName.toLowerCase());
  if (collision >= 0) {
    showToast(`Name ${trimmedName}" wird bereits verwendet.`, 'error', 3500);
    return;
  }
  const copy = { name: trimmedName, actionIds: [...preset.actionIds] };
  state.queuePresets.splice(idx + 1, 0, copy);
  persistQueuePresets();
  renderQueuePresetSelect();
  dom.queuePresetSelect.value = String(idx + 1);
  showToast(`Preset dupliziert: ${trimmedName}`, 'success', 2500);
}

function applySelectedQueuePreset() {
  const idx = Number(dom.queuePresetSelect?.value ?? '-1');
  if (!Number.isInteger(idx) || idx < 0 || idx >= state.queuePresets.length) {
    return;
  }
  const preset = state.queuePresets[idx];
  const validIds = new Set(getQueueBuilderActionsCatalog().map((action) => action.id));
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
  const validIds = new Set(getQueueBuilderActionsCatalog().map((item) => item.id));
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
  persistQueuePresets();
  renderQueuePresetSelect();
  return { added, updated };
}

function moveQueueAction(sourceId, targetId) {
  const sourceIndex = state.queueBuilderSequence.indexOf(sourceId);
  const targetIndex = state.queueBuilderSequence.indexOf(targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
  const [item] = state.queueBuilderSequence.splice(sourceIndex, 1);
  state.queueBuilderSequence.splice(targetIndex, 0, item);
}

function renderQueueBuilderSelected(catalog) {
  if (!dom.queueBuilderSelected) return;
  dom.queueBuilderSelected.innerHTML = '';

  if (!state.queueBuilderSequence.length) {
    const empty = document.createElement('li');
    empty.className = 'queue-selected-empty';
    empty.textContent = 'Noch keine Aktion ausgewaehlt.';
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
      moveQueueAction(sourceId, actionId);
      renderQueueBuilder();
    });

    li.append(label, removeBtn);
    dom.queueBuilderSelected.appendChild(li);
  });
}

function renderQueueBuilder() {
  const catalog = getQueueBuilderActionsCatalog();
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
    state.queuePresets = loadQueuePresetsFromStorage();
  }
  renderQueuePresetSelect();
  if (dom.queuePresetSelect) dom.queuePresetSelect.value = '';
  renderQueueBuilder();
  dom.queueBuilderDialog.showModal();
}

function initQueueBuilderDialog() {
  state.queuePresets = loadQueuePresetsFromStorage();
  renderQueuePresetSelect();

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
        showToast('Keine gueltigen Presets im Import gefunden.', 'error', 4500);
        return;
      }
      const { added, updated } = mergeQueuePresets(imported);
      showToast(`Presets importiert: ${added} neu, ${updated} aktualisiert.`, 'success', 4000);
    } catch (err) {
      console.error('[queuePresetImport]', err);
      showToast(`Preset-Import fehlgeschlagen: ${err.message}`, 'error', 5000);
    } finally {
      dom.queuePresetFileInput.value = '';
    }
  });

  dom.btnQueueBuilderAdd?.addEventListener('click', () => {
    const catalog = getQueueBuilderActionsCatalog();
    const byId = new Map(catalog.map((item) => [item.id, item]));
    const selected = state.queueBuilderSequence
      .map((id) => byId.get(id))
      .filter(Boolean);

    if (!selected.length) {
      showToast('Bitte mindestens eine Aktion waehlen.', 'info');
      return;
    }

    selected.forEach((item) => enqueueAction(item.label, item.action));
    dom.queueBuilderDialog.close();
    showToast(`${selected.length} Aktion(en) in Reihenfolge zur Queue hinzugefuegt.`, 'success', 3000);
  });
}

// --------------------------------------------------------------------------
// DASHBOARD
// --------------------------------------------------------------------------

function mergeImportedSetIntoLocalState(setMeta = {}) {
  if (!setMeta?.setId) return null;

  const mergedSet = {
    ...setMeta,
    imported: true,
    totalCards: Number(setMeta?.totalCards) || Number(setMeta?.printedTotal) || 0,
  };

  const mergeIntoList = (list, { addIfMissing = false } = {}) => {
    if (!Array.isArray(list)) return null;
    const index = list.findIndex((entry) => entry?.setId === mergedSet.setId);
    if (index >= 0) {
      list[index] = { ...list[index], ...mergedSet, imported: true };
      return list[index];
    }
    if (!addIfMissing) return null;
    const appended = { ...mergedSet, imported: true };
    list.push(appended);
    return appended;
  };

  const allSet = mergeIntoList(state.allSets, { addIfMissing: true }) || mergedSet;
  mergeIntoList(state.sets, { addIfMissing: true });
  if (state.importedSetsAll !== state.sets) mergeIntoList(state.importedSetsAll, { addIfMissing: true });

  if (state.currentSet?.setId === mergedSet.setId) {
    state.currentSet = { ...state.currentSet, ...allSet, imported: true };
    state.pendingSearchSetImport = false;
  }

  ensureSetSelectorOption(allSet);
  renderSearchSetFilterOptions();
  return allSet;
}

function scheduleAutoImportUiRefresh() {
  if (state.autoImportRefreshTimer) {
    clearTimeout(state.autoImportRefreshTimer);
  }

  state.autoImportRefreshTimer = window.setTimeout(async () => {
    state.autoImportRefreshTimer = null;
    try {
      renderSearchSetFilterOptions();
      renderSetSelectorOptions(state.currentSet?.setId || dom.selector?.value || '');
      if (dom.viewDashboard && !dom.viewDashboard.classList.contains('hidden')) {
        await renderDashboard();
      }
      if (dom.viewStats && !dom.viewStats.classList.contains('hidden')) {
        await renderStats();
      }
      if (dom.viewSearch && !dom.viewSearch.classList.contains('hidden') && String(dom.searchInput?.value || '').trim()) {
        runSearch({ force: true });
      }
    } catch (err) {
      console.warn('[scheduleAutoImportUiRefresh]', err);
    }
  }, 180);
}

async function ensureSetImportedFromApi(setMeta, cards, options = {}) {
  const { setMetaPatch = null, showSuccessToast = false, successMessage = '', source = 'search' } = options;
  const setId = String(setMeta?.setId || '').trim();
  const safeCards = Array.isArray(cards) ? cards : [];
  if (!setId || safeCards.length === 0) return null;

  const mergedSet = {
    ...setMeta,
    ...(setMetaPatch || {}),
    imported: true,
    totalCards: Number(setMetaPatch?.totalCards) || Number(setMeta?.totalCards) || safeCards.length,
  };
  const existingSetState = [
    ...(Array.isArray(state.sets) ? state.sets : []),
    ...(Array.isArray(state.allSets) ? state.allSets : []),
  ].find((entry) => entry?.setId === setId);
  const alreadyImported = toBoolean(setMeta?.imported)
    || toBoolean(existingSetState?.imported);

  if (alreadyImported) {
    return mergeImportedSetIntoLocalState(mergedSet) || mergedSet;
  }

  if (state.autoImportJobs.has(setId)) {
    return state.autoImportJobs.get(setId);
  }

  const pendingCount = (state.autoImportActiveSetId ? 1 : 0) + state.autoImportQueuedSetIds.length;
  if (pendingCount >= AUTO_IMPORT_QUEUE_LIMIT) {
    const now = Date.now();
    if (now - Number(state.autoImportLastLimitToastAt || 0) > 2500) {
      state.autoImportLastLimitToastAt = now;
      showToast(`Auto-Import-Warteschlange voll (${AUTO_IMPORT_QUEUE_LIMIT}). ${mergedSet.setName || setId} wird vorerst nicht automatisch importiert.`, 'info', 4500);
    }
    setGlobalStatus(`Auto-Import pausiert: Warteschlange voll (${AUTO_IMPORT_QUEUE_LIMIT}).`);
    updateAutoImportQueueUi();
    return null;
  }

  state.autoImportQueuedSetIds = [...state.autoImportQueuedSetIds, setId];
  updateAutoImportQueueUi();

  const queuedJob = state.autoImportQueue
    .catch(() => undefined)
    .then(async () => {
      state.autoImportQueuedSetIds = state.autoImportQueuedSetIds.filter((id) => id !== setId);
      state.autoImportActiveSetId = setId;
      updateAutoImportQueueUi();
      setGlobalStatus(`Auto-Importiere ${mergedSet.setName || setId}`);

      await importSetIntoCollection(mergedSet, safeCards);
      cache.del(`cards_${setId}`);
      cache.del(`db_cards_${setId}`);
      cache.del(`db_${setId}`);
      state.searchCache.clear();
      state.summaryData = null;

      const refreshedSet = mergeImportedSetIntoLocalState(mergedSet) || mergedSet;
      scheduleAutoImportUiRefresh();

      if (showSuccessToast) {
        const message = successMessage || `${refreshedSet.setName} wurde automatisch importiert.`;
        showToast(message, 'success', 3200);
      }

      return refreshedSet;
    });

  state.autoImportQueue = queuedJob.catch(() => undefined);

  const job = queuedJob.catch((err) => {
    console.warn(`[ensureSetImportedFromApi:${source}]`, err);
    throw err;
  }).finally(() => {
    state.autoImportQueuedSetIds = state.autoImportQueuedSetIds.filter((id) => id !== setId);
    if (state.autoImportActiveSetId === setId) {
      state.autoImportActiveSetId = null;
    }
    state.autoImportJobs.delete(setId);
    updateAutoImportQueueUi();
  });

  state.autoImportJobs.set(setId, job);
  updateAutoImportQueueUi();
  return job;
}

async function importSetFromOverview(set) {
  if (!set?.setId) return;
  if (set.imported) {
    dom.selector.value = set.setId;
    navigate(`set/${set.setId}`);
    return;
  }

  if (state.manualImportJobs.has(set.setId)) {
    return state.manualImportJobs.get(set.setId);
  }

  if (state.importAuthBlocked) {
    const ok = await runImportWritePreflight('Import-Preflight').catch(() => false);
    if (!ok) return;
  } else {
    const ok = await runImportWritePreflight('Import-Preflight').catch((error) => {
      console.error('[importSetFromOverview:preflight]', getErrorMessage(error, error));
      return false;
    });
    if (!ok) return;
  }

  const queuedJob = state.manualImportQueue
    .catch(() => undefined)
    .then(async () => {
      setLoading(true, `Importiere ${set.setName}`);
      setGlobalStatus(`Importiere ${set.setName}`);
      try {
        await importSetIntoCollectionWithBackoff(set, set.setName || set.setId);
        cache.del(`cards_${set.setId}`);
        cache.del(`db_cards_${set.setId}`);
        cache.del(`db_${set.setId}`);
        state.searchCache.clear();
        state.summaryData = null;

        await loadSets();
        markSetAsRecent(set);
        await renderDashboard();
        setGlobalStatus(`${set.setName} wurde importiert.`);
        showToast(`${set.setName} wurde importiert.`, 'success', 3000);
      } catch (err) {
        console.error('[importSetFromOverview]', getErrorMessage(err, err));
        if (isAuthReloginRequiredError(err)) {
          state.importAuthBlocked = true;
          const message = getAuthReloginImportMessage();
          showToast(message, 'error', 7000);
          setGlobalStatus(message);
          return;
        }
        const reason = getErrorMessage(err);
        showToast(`Import fehlgeschlagen: ${reason}`, 'error', 5000);
        setGlobalStatus(`Import fehlgeschlagen: ${set.setName}`);
      } finally {
        setLoading(false);
      }

      await waitMs(IMPORT_BASE_GAP_MS);
    });

  const trackedJob = queuedJob.finally(() => {
    state.manualImportJobs.delete(set.setId);
  });

  state.manualImportQueue = queuedJob.catch(() => undefined);
  state.manualImportJobs.set(set.setId, trackedJob);
  return trackedJob;
}

async function deleteSetFromCollection(set, options = {}) {
  const { skipReload = false, skipConfirm = false } = options;
  if (!set?.setId || !set.imported) {
    showToast('Set kann nicht geloescht werden.', 'error', 3000);
    return;
  }

  const confirmMsg = `${set.setName} wirklich aus deiner Sammlung loeschen? Diese Aktion kann nicht rueckgaengig gemacht werden.`;
  if (!skipConfirm && !window.confirm(confirmMsg)) {
    return;
  }

  setLoading(true, `Loesche ${set.setName}`);
  setGlobalStatus(`Loesche ${set.setName}`);
  
  try {
    // Auto-Snapshot vor dem Loeschen erstellen
    try {
      const currentCollection = state.collection || {};
      const action = `Delete Set: ${set.setName}`;
      await createAutoSnapshot(action, currentCollection);
    } catch (err) {
      console.warn('Auto-snapshot vor Loeschung fehlgeschlagen:', err);
    }

    // Entferne das Set aus der Sammlung
    // Wir sammeln alle Cell-Updates zuerst und schicken sie gebündelt in EINEM
    // batchUpdate an die Google-Sheets-API, um das Per-Request-Rate-Limit (429)
    // bei großen Sets zu vermeiden (vgl. updateCellBooleansBatch).
    const range = await readSetCollectionMap(set.setName, { setId: set.setId }).catch(() => new Map());
    await applyDeleteSetCellUpdates({
      setName: set.setName,
      collectionMap: range,
      updateCellBooleansBatch,
      chunkSize: 250,
    });

    await upsertOverviewSet(set, false);
    // Alias-Zeilen (db_sets/Overview) ebenfalls auf imported=false, sonst ODERt die Alias-Zuordnung das Set
    // beim naechsten Laden wieder als importiert zurueck. Nur Status-Zellen; keine Zeile wird geloescht.
    let aliasWarning = '';
    try {
      await markAliasSetRowsNotImported(set);
    } catch (err) {
      console.warn('[deleteSetFromCollection] Alias-Zeilen nicht aktualisiert', err);
      aliasWarning = ` Alias-Zeilen konnten nicht aktualisiert werden (${err?.message || err}); bitte erneut loeschen.`;
    }

    cache.del(`cards_${set.setId}`);
    cache.del(`db_${set.setId}`);
    cache.del(`db_cards_${set.setId}`);
    state.summaryData = null;
    state.summaryOverrides.delete(set.setName);
    state.summaryOverrides.delete(set.setId);

    // Aktualisiere die Ansicht
    if (!skipReload) {
      await loadSets();
      await renderDashboard();
    }
    
    showToast(`${set.setName} wurde geloescht.${aliasWarning}`, aliasWarning ? 'error' : 'success', aliasWarning ? 6000 : 3000);
    setGlobalStatus(`${set.setName} wurde geloescht.`);
  } catch (err) {
    console.error('[deleteSetFromCollection]', err);
    showToast(`Loeschen fehlgeschlagen: ${err.message}`, 'error', 5000);
    setGlobalStatus(`Fehler beim Loeschen: ${set.setName}`);
  } finally {
    setLoading(false);
  }
}

async function importSetsSequential(sets, options = {}) {
  const { successMessage = 'Import abgeschlossen.' } = options;
  const validSets = (sets || []).filter((set) => set?.setId && set?.setName);
  if (!validSets.length) {
    showToast('Keine passenden Sets gefunden.', 'info');
    return;
  }

  const preflightOk = await runImportWritePreflight('Batch-Preflight').catch((error) => {
    console.error('[importSetsSequential:preflight]', error);
    showToast(`Preflight fehlgeschlagen: ${getErrorMessage(error)}`, 'error', 6000);
    return false;
  });
  if (!preflightOk) {
    return;
  }

  // Auto-Snapshot vor dem Import erstellen
  try {
    const currentCollection = state.collection || {};
    const snapshotCount = (loadSnapshots() || []).length;
    const action = `Import: ${validSets.map(s => s.setName).join(', ')}${snapshotCount > 15 ? ' (oldest will be removed)' : ''}`;
    await createAutoSnapshot(action, currentCollection);
  } catch (err) {
    console.warn('Auto-snapshot vor Import fehlgeschlagen:', err);
    // Fehler blockiert nicht den Import
  }

  let done = 0;
  let failed = 0;
  let consecutiveQuotaErrors = 0;
  let pausedForAuth = false;
  const job = startJob('Import', validSets.length);
  setLoading(true, 'Import laeuft');
  try {
    for (let index = 0; index < validSets.length; index++) {
      assertJobNotCancelled(job);
      const set = validSets[index];
      setGlobalStatus(`Importiere ${index + 1}/${validSets.length}: ${set.setName}`);
      updateJob(job, index, `Importiere ${index + 1}/${validSets.length}: ${set.setName}`);
      try {
        await importSetIntoCollectionWithBackoff(set, `${index + 1}/${validSets.length}`);
        cache.del(`cards_${set.setId}`);
        cache.del(`db_${set.setId}`);
        cache.del(`db_cards_${set.setId}`);
        // Live-Update: state.allSets spiegelt den importierten Status sofort,
        // damit das Dashboard-Card-Toggle ohne render-Roundtrip sichtbar wird.
        const allSetIdx = state.allSets.findIndex((s) => s.setId === set.setId);
        if (allSetIdx >= 0 && !state.allSets[allSetIdx].imported) {
          state.allSets[allSetIdx] = { ...state.allSets[allSetIdx], imported: true };
        }
        // Card-Level-Update: einzelne Dashboard-Card sofort umschalten
        // (Button "Loeschen" statt "Importieren" wird sichtbar, Karten-Zaehler
        // steigt). syncDashboardCardForSet ist ein leichtgewichtiger DOM-Patch,
        // keine Sheets-Calls.
        try {
          syncDashboardCardForSet(state.allSets[allSetIdx] || set, {
            total: Number(set.totalCards) || state.allSets[allSetIdx]?.totalCards || 0,
            collected: 0,
            rh: 0
          });
        } catch (cardErr) {
          console.warn('[importSetsSequential] card-level update failed', cardErr);
        }
        consecutiveQuotaErrors = 0;
        done++;
        // Volles Dashboard-Refresh alle 10 Sets – fuer den 'X von Y'-Counter
        // in der Topbar. Card-Level oben aktualisiert sich pro Set.
        if (done > 0 && done % 10 === 0) {
          try {
            await loadSets();
            await renderDashboard();
          } catch (refreshErr) {
            console.warn('[importSetsSequential] dashboard refresh failed', refreshErr);
          }
        }
      } catch (err) {
        console.warn('[importSetsSequential] import failed for', set.setId, getErrorMessage(err, err));
        if (isAuthReloginRequiredError(err)) {
          state.importAuthBlocked = true;
          pausedForAuth = true;
          const message = getAuthReloginImportMessage();
          setGlobalStatus(message);
          updateJob(job, index, `Pausiert: Re-Login erforderlich bei ${set.setName}`);
          break;
        }

        failed++;
        if (isSheetsQuotaError(err)) {
          consecutiveQuotaErrors += 1;
          const cooldownMs = resolveQuotaCooldownMs(consecutiveQuotaErrors);
          const waitSeconds = Math.ceil(cooldownMs / 1000);
          setGlobalStatus(`Sheets-Rate-Limit erkannt. Warte ${waitSeconds}s vor dem naechsten Import`);
          updateJob(job, index, `Rate-Limit bei ${set.setName}. Cooldown ${waitSeconds}s`);
          await waitMs(cooldownMs);
        } else {
          consecutiveQuotaErrors = 0;
        }
      }

      if (index < validSets.length - 1) {
        await waitMs(IMPORT_BASE_GAP_MS);
      }
    }
    if (pausedForAuth) {
      const message = getAuthReloginImportMessage();
      updateJob(job, done + failed, 'Import pausiert: Re-Login erforderlich');
      finishJob(job, message, true);
    } else {
      updateJob(job, validSets.length, `Import abgeschlossen: ${done} erfolgreich, ${failed} Fehler`);
      finishJob(job, `Import abgeschlossen (${done}/${validSets.length})`, failed > 0);
    }
  } catch (err) {
    finishJob(job, getErrorMessage(err, 'Import abgebrochen'), true);
    throw err;
  } finally {
    setLoading(false);
  }

  if (pausedForAuth) {
    showToast(getAuthReloginImportMessage(), 'error', 7000);
    return;
  }

  state.summaryData = null;
  await loadSets();

  if (failed > 0) {
    showToast(`${done} importiert, ${failed} fehlgeschlagen.`, 'error', 6000);
  } else {
    showToast(successMessage.replace('{count}', String(done)), 'success', 3500);
  }
}

async function syncOverviewFromApi() {
  if (!isSignedIn()) {
    showToast('Bitte zuerst anmelden.', 'info');
    return;
  }
  setLoading(true, 'Synchronisiere Overview...');
  try {
    const apiSets = await fetchAllAvailableSets();
    const importedIds = new Set(allImportedSets().map((set) => set.setId));
    await syncOverviewWithApiSets(apiSets, importedIds);
    await loadSets();
    showToast(`Overview synchronisiert (${apiSets.length} Sets).`, 'success');
  } catch (err) {
    console.error('[syncOverviewFromApi]', err);
    showToast(`Overview-Sync fehlgeschlagen: ${err.message}`, 'error', 5000);
  } finally {
    setLoading(false);
  }
}

function normalizeComparable(value) {
  return String(value ?? '').trim();
}

function summarizeOverviewChanges(oldOverviewSets, apiSets) {
  const oldById = new Map((oldOverviewSets || []).map((set) => [set.setId, set]));
  const fields = ['setName', 'logoUrl', 'symbolUrl', 'series', 'releaseDate', 'totalCards', 'ptcgoCode'];

  let added = 0;
  let changed = 0;
  let unchanged = 0;
  const changedSets = [];

  for (const apiSet of (apiSets || [])) {
    const prev = oldById.get(apiSet.setId);
    if (!prev) {
      added++;
      continue;
    }

    const changedFields = fields.filter((field) =>
      normalizeComparable(prev[field]) !== normalizeComparable(apiSet[field])
    );

    if (changedFields.length > 0) {
      changed++;
      changedSets.push({ setId: apiSet.setId, setName: apiSet.setName, changedFields });
    } else {
      unchanged++;
    }
  }

  return { added, changed, unchanged, changedSets };
}

async function powerRefreshOverviewFromApi() {
  setLoading(true, 'Power-Refresh laeuft');
  
  // Auto-Snapshot vor dem Power-Refresh erstellen
  try {
    const currentCollection = state.collection || {};
    const action = `Power-Refresh: Sets Overview aktualisiert`;
    await createAutoSnapshot(action, currentCollection);
  } catch (err) {
    console.warn('Auto-snapshot vor Power-Refresh fehlgeschlagen:', err);
    // Fehler blockiert nicht den Refresh
  }

  try {
    const [oldOverviewSets, apiSets] = await Promise.all([
      listSetsOverviewData().catch(() => []),
      fetchAllAvailableSets()
    ]);

    const report = summarizeOverviewChanges(oldOverviewSets, apiSets);
    const importedIds = new Set(allImportedSets().map((set) => set.setId));
    await syncOverviewWithApiSets(apiSets, importedIds);
    await loadSets();

    const msg = `Power-Refresh: +${report.added} neu, ${report.changed} geaendert, ${report.unchanged} unveraendert.`;
    setGlobalStatus(msg);
    showToast(msg, 'success', 5000);

    if (report.changedSets.length) {
      setGlobalStatus(`${msg} (${report.changedSets.length} Sets mit Detailaenderungen)`);
    }
  } catch (err) {
    console.error('[powerRefreshOverviewFromApi]', err);
    showToast(`Power-Refresh fehlgeschlagen: ${err.message}`, 'error', 6000);
  } finally {
    setLoading(false);
  }
}

async function importAllMissingSets() {
  const missing = state.allSets.filter((set) => !set.imported);
  if (!missing.length) {
    showToast('Alle Sets sind bereits importiert.', 'info');
    return;
  }
  const ok = window.confirm(`${missing.length} Sets importieren? Dieser Vorgang kann einige Minuten dauern.`);
  if (!ok) return;
  await importSetsSequential(missing, { successMessage: '{count} Sets importiert.' });
}

function getBatchCandidates() {
  return state.allSets.filter((set) => !set.imported);
}

function updateBatchInfo() {
  const selected = state.batchSelection.size;
  dom.batchInfo.classList.remove('hidden');
  dom.batchInfo.textContent = `${selected} Set${selected === 1 ? '' : 's'} ausgewaehlt`;
}

function renderBatchDialogList() {
  const query = (dom.batchSearchInput.value || '').trim().toLowerCase();
  const sets = getBatchCandidates().filter((set) => {
    if (!query) return true;
    return [set.setId, set.setName, set.series].some((field) => String(field || '').toLowerCase().includes(query));
  });

  dom.batchList.innerHTML = '';
  if (!sets.length) {
    dom.batchList.innerHTML = '<p class="empty-state">Keine passenden Sets gefunden.</p>';
    updateBatchInfo();
    return;
  }

  const fragment = document.createDocumentFragment();
  sets.forEach((set) => {
    const row = document.createElement('label');
    row.className = 'batch-item';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = state.batchSelection.has(set.setId);
    input.addEventListener('change', () => {
      if (input.checked) state.batchSelection.add(set.setId);
      else state.batchSelection.delete(set.setId);
      updateBatchInfo();
    });

    const main = document.createElement('div');
    main.className = 'batch-item-main';

    const title = document.createElement('span');
    title.className = 'batch-item-title';
    title.textContent = `${set.setId} - ${set.setName}`;

    const sub = document.createElement('span');
    sub.className = 'batch-item-sub';
    sub.textContent = `${set.series || 'Serie unbekannt'} - ${set.totalCards || '?'} Karten`;

    main.append(title, sub);
    row.append(input, main);
    fragment.appendChild(row);
  });

  dom.batchList.appendChild(fragment);
  updateBatchInfo();
}

function openBatchImportDialog() {
  state.batchSelection.clear();
  dom.batchSearchInput.value = '';
  renderBatchDialogList();
  dom.batchDialog.showModal();
}

function initBatchImportDialog() {
  dom.batchSearchInput?.addEventListener('input', renderBatchDialogList);

  dom.btnBatchSelectVisible?.addEventListener('click', () => {
    const checkboxes = dom.batchList.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach((checkbox) => {
      checkbox.checked = true;
      const label = checkbox.closest('.batch-item')?.querySelector('.batch-item-title')?.textContent || '';
      const setId = label.split(' - ')[0] || '';
      if (setId) state.batchSelection.add(setId);
    });
    updateBatchInfo();
  });

  dom.btnBatchClearSelection?.addEventListener('click', () => {
    state.batchSelection.clear();
    renderBatchDialogList();
  });

  dom.btnBatchCancel?.addEventListener('click', () => dom.batchDialog?.close());

  dom.btnBatchImportSelected?.addEventListener('click', async () => {
    const selectedIds = Array.from(state.batchSelection);
    if (!selectedIds.length) {
      showToast('Bitte mindestens ein Set auswaehlen.', 'info');
      return;
    }
    dom.batchDialog.close();
    const targetSets = selectedIds.map((id) => getSetById(id)).filter(Boolean);
    await importSetsSequential(targetSets, { successMessage: '{count} Sets per Batch importiert.' });
  });
}

function getImportedSetsForManagement() {
  return (state.allSets || []).filter((set) => toBoolean(set.imported));
}

function updateManageSetsInfo(filtered = []) {
  if (!dom.manageSetsInfo) return;
  const selectedCount = state.manageSetsSelection.size;
  dom.manageSetsInfo.textContent = `${selectedCount} ausgewaehlt - ${filtered.length} sichtbar`;
}

function renderManageImportedSetsList() {
  if (!dom.manageSetsList) return;
  const query = String(dom.manageSetsSearch?.value || '').trim().toLowerCase();
  const importedSets = getImportedSetsForManagement();
  const filtered = !query
    ? importedSets
    : importedSets.filter((set) =>
      String(set.setName || '').toLowerCase().includes(query)
      || String(set.setId || '').toLowerCase().includes(query)
      || String(set.series || '').toLowerCase().includes(query)
    );

  if (!filtered.length) {
    dom.manageSetsList.innerHTML = '<p class="empty-state">Keine importierten Sets fuer den aktuellen Filter.</p>';
    updateManageSetsInfo(filtered);
    return;
  }

  const fragment = document.createDocumentFragment();
  filtered.forEach((set) => {
    const row = document.createElement('label');
    row.className = 'batch-item';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = state.manageSetsSelection.has(set.setId);
    input.addEventListener('change', () => {
      if (input.checked) state.manageSetsSelection.add(set.setId);
      else state.manageSetsSelection.delete(set.setId);
      updateManageSetsInfo(filtered);
    });

    const main = document.createElement('span');
    main.className = 'batch-item-main';

    const title = document.createElement('span');
    title.className = 'batch-item-title';
    title.textContent = `${set.setId} - ${set.setName}`;

    const sub = document.createElement('span');
    sub.className = 'batch-item-sub';
    sub.textContent = `${set.series || 'Serie unbekannt'} - ${set.totalCards || '?'} Karten`;

    main.append(title, sub);
    row.append(input, main);
    fragment.appendChild(row);
  });

  dom.manageSetsList.innerHTML = '';
  dom.manageSetsList.appendChild(fragment);
  updateManageSetsInfo(filtered);
}

function openManageImportedSetsDialog() {
  state.manageSetsSelection.clear();
  if (dom.manageSetsSearch) dom.manageSetsSearch.value = '';
  renderManageImportedSetsList();
  dom.manageSetsDialog?.showModal();
}

async function reimportSelectedImportedSets() {
  const selectedIds = Array.from(state.manageSetsSelection);
  if (!selectedIds.length) {
    showToast('Bitte mindestens ein Set auswaehlen.', 'info');
    return;
  }

  const selectedSets = selectedIds.map((id) => getSetById(id)).filter(Boolean);
  dom.manageSetsDialog?.close();
  await importSetsSequential(selectedSets, { successMessage: '{count} ausgewaehlte Sets aktualisiert.' });
}

async function deleteSelectedImportedSets() {
  const selectedIds = Array.from(state.manageSetsSelection);
  if (!selectedIds.length) {
    showToast('Bitte mindestens ein Set auswaehlen.', 'info');
    return;
  }

  const selectedSets = selectedIds
    .map((id) => getSetById(id))
    .filter((set) => set && toBoolean(set.imported));

  if (!selectedSets.length) {
    showToast('Keine lschbaren importierten Sets ausgewaehlt.', 'info');
    return;
  }

  const ok = window.confirm(`${selectedSets.length} importierte Sets wirklich loeschen?`);
  if (!ok) return;

  dom.manageSetsDialog?.close();
  setLoading(true, 'Loesche ausgewaehlte Sets');
  let deleted = 0;
  let failed = 0;
  try {
    for (const set of selectedSets) {
      try {
        await deleteSetFromCollection(set, { skipReload: true, skipConfirm: true });
        deleted++;
      } catch (err) {
        console.warn('[deleteSelectedImportedSets]', set?.setId, err);
        failed++;
      }
    }
  } finally {
    setLoading(false);
  }

  state.summaryData = null;
  await loadSets();
  await renderDashboard();
  showToast(`${deleted} geloescht${failed ? `, ${failed} Fehler` : ''}.`, failed ? 'error' : 'success', 4500);
}

function initManageImportedSetsDialog() {
  dom.btnManageImportedSets?.addEventListener('click', openManageImportedSetsDialog);
  dom.manageSetsSearch?.addEventListener('input', () => renderManageImportedSetsList());
  dom.btnManageSetsSelectVisible?.addEventListener('click', () => {
    dom.manageSetsList?.querySelectorAll('.batch-item input[type="checkbox"]').forEach((input) => {
      const label = input.closest('.batch-item')?.querySelector('.batch-item-title')?.textContent || '';
      const setId = label.split(' - ')[0] || '';
      if (setId) state.manageSetsSelection.add(setId);
    });
    renderManageImportedSetsList();
  });
  dom.btnManageSetsClearSelection?.addEventListener('click', () => {
    state.manageSetsSelection.clear();
    renderManageImportedSetsList();
  });
  dom.btnManageSetsReimportSelected?.addEventListener('click', reimportSelectedImportedSets);
  dom.btnManageSetsDeleteSelected?.addEventListener('click', deleteSelectedImportedSets);
  dom.btnManageSetsCancel?.addEventListener('click', () => dom.manageSetsDialog?.close());

  dom.btnSheetsRetryReport?.addEventListener('click', openSheetsRetryReportDialog);
  dom.btnSheetsRetryReset?.addEventListener('click', () => resetSheetsRetryMetrics());
  dom.btnSheetsRetryClose?.addEventListener('click', () => dom.sheetsRetryDialog?.close());
}

async function reimportAllImportedSets() {
  if (!state.sets.length) {
    showToast('Keine importierten Sets vorhanden.', 'info');
    return;
  }
  const ok = window.confirm(`${state.sets.length} importierte Sets neu laden? Bestehende Sammel-Checks bleiben erhalten.`);
  if (!ok) return;
  await importSetsSequential(state.sets, { successMessage: '{count} importierte Sets aktualisiert.' });
}

async function exportCollectionSummaryCsv() {
  // Export vollstaendig aus dem Sheet (inkl. in der Anzeige ausgeblendeter Sets); state.summaryData ist gefiltert.
  const rows = await readSummarySheet().catch(() => (Array.isArray(state.summaryData) ? state.summaryData : []));
  if (!rows.length) {
    showToast('Keine Summary-Daten zum Export vorhanden.', 'info');
    return;
  }

  const csvRows = [
    'Set,Total,Collected,RH,Percent,PTCGO',
    ...rows.map((row) => [
      row.setName,
      row.total,
      row.collected,
      row.rh,
      row.percent,
      row.ptcgoCode || ''
    ].map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','))
  ];

  const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 10);
  const a = Object.assign(document.createElement('a'), {
    href: url,
    download: `sammlung_summary_${stamp}.csv`
  });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Summary als CSV exportiert.', 'success');
}

async function exportCollectionBackup() {
  if (!allImportedSets().length) {
    showToast('Keine importierten Sets fuer Backup vorhanden.', 'info');
    return;
  }

  setLoading(true, 'Erstelle Backup...');
  try {
    // db_collection einmal strikt lesen; Registry-Karten nur fuer Sets mit Haken (lazy). Jeder Lesefehler
    // bricht den Export ab (BackupExportError) – nie ein unvollstaendiges Backup schreiben.
    const backupSets = await buildCollectionBackupSets(allImportedSets(), {
      listSetIds: () => listCollectionSetIds({ checkedOnly: true, strict: true }),
      ensureResolver: (setId) => ensureResolverForSet(setId),
      readMap: (set) => readSetCollectionMap(set.setName, { setId: set.setId, strict: true }),
      onProgress: (index, total, set) => setGlobalStatus(`Backup ${index + 1}/${total}: ${set.setName}`)
    });

    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const payload = {
      app: 'poke-tcg-try4',
      version: 2, // cardId = collectionKey (v3), Sets kanonisch
      createdAt: new Date().toISOString(),
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      sets: backupSets
    };
    downloadJson(`poke_collection_backup_${stamp}.json`, payload);
    showToast(`Backup exportiert (${backupSets.length} Sets).`, 'success', 4000);
  } catch (err) {
    console.error('[exportCollectionBackup]', err);
    showToast(`Backup-Export fehlgeschlagen: ${err.message}`, 'error', 8000);
  } finally {
    setLoading(false);
  }
}

async function runDataHealthCheck({ autoFix = false } = {}) {
  if (!state.sets.length) {
    showToast('Keine importierten Sets fuer Datencheck.', 'info');
    return;
  }

  setLoading(true, 'Datencheck laeuft');
  const report = {
    createdAt: new Date().toISOString(),
    checkedSets: state.sets.length,
    mismatches: [],
    errors: []
  };
  const mismatchSets = [];
  const job = startJob(autoFix ? 'Datencheck + Auto-Fix' : 'Datencheck', state.sets.length);

  try {
    for (let index = 0; index < state.sets.length; index++) {
      assertJobNotCancelled(job);
      const set = state.sets[index];
      setGlobalStatus(`Datencheck ${index + 1}/${state.sets.length}: ${set.setName}`);
      updateJob(job, index, `Datencheck ${index + 1}/${state.sets.length}: ${set.setName}`);
      try {
        const [apiCards, sheetMap] = await Promise.all([
          fetchMergedCards(set.setId),
          readSetCollectionMap(set.setName, { setId: set.setId })
        ]);

        // Kanonische v3-Karten gegen die alias-faehige Sammlungs-Map (zusammengefuehrte Untersets wie
        // swsh12pt5gg zaehlen zum Hauptset; Waisen/mehrdeutige Altzeilen sind keine Abweichung).
        const comparison = compareSetCollection(apiCards, sheetMap);
        const { apiCount, sheetCount } = comparison;
        if (comparison.mismatch) {
          mismatchSets.push(set);
          report.mismatches.push({
            setId: set.setId,
            setName: set.setName,
            apiCount,
            sheetCount,
            missingKeys: comparison.missingKeys.slice(0, 50),
            extraKeys: comparison.extraKeys.slice(0, 50),
            orphanCount: comparison.orphanCount,
            delta: sheetCount - apiCount
          });
        }
      } catch (err) {
        report.errors.push({ setId: set.setId, setName: set.setName, error: err.message });
      }
    }
    updateJob(job, state.sets.length, `Datencheck beendet: ${report.mismatches.length} Abweichungen`);
  } catch (err) {
    finishJob(job, err.message || 'Datencheck abgebrochen', true);
    throw err;
  } finally {
    setLoading(false);
  }

  if (!report.mismatches.length && !report.errors.length) {
    finishJob(job, 'Keine Abweichungen gefunden', false);
    showToast(`Datencheck ok: ${report.checkedSets} Sets geprft, keine Abweichungen.`, 'success', 4500);
    return;
  }

  console.group('[DataHealthCheck] Bericht');
  if (report.mismatches.length) console.table(report.mismatches);
  if (report.errors.length) console.table(report.errors);
  console.groupEnd();

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  downloadJson(`poke_data_health_${stamp}.json`, report);
  showToast(`Datencheck fertig: ${report.mismatches.length} Abweichungen, ${report.errors.length} Fehler. Report exportiert.`, 'error', 6500);

  if (!autoFix || !mismatchSets.length) {
    finishJob(job, `Datencheck abgeschlossen (${report.mismatches.length} Abweichungen)`, true);
    return;
  }

  const confirmText = `${mismatchSets.length} Set${mismatchSets.length === 1 ? '' : 's'} mit Abweichungen automatisch reimportieren?`;
  const ok = window.confirm(confirmText);
  if (!ok) {
    finishJob(job, 'Auto-Fix abgebrochen', true);
    return;
  }

  // Auto-Snapshot vor dem Auto-Fix erstellen
  try {
    const currentCollection = state.collection || {};
    const action = `Auto-Fix: ${mismatchSets.length} Set(s) mit Abweichungen`;
    await createAutoSnapshot(action, currentCollection);
  } catch (err) {
    console.warn('Auto-snapshot vor Auto-Fix fehlgeschlagen:', err);
    // Fehler blockiert nicht das Auto-Fix
  }

  const uniqueSets = Array.from(new Map(mismatchSets.map((set) => [set.setId, set])).values());
  await importSetsSequential(uniqueSets, { successMessage: '{count} Mismatch-Set(s) automatisch repariert.' });
  finishJob(job, `Auto-Fix ausgefuehrt (${uniqueSets.length} Sets)`, false);
}

function parseBackupPayload(rawText) {
  const parsed = JSON.parse(rawText);
  if (!parsed || typeof parsed !== 'object') throw new Error('Ungueltiges Backup-Format.');
  if (!Array.isArray(parsed.sets)) throw new Error('Backup enthaelt keine Set-Daten.');
  return parsed;
}

async function applyCollectionBackup(payload) {
  const sets = payload.sets || [];
  if (!sets.length) {
    showToast('Backup enthaelt keine Sets.', 'info');
    return;
  }

  let updated = 0;
  let skipped = 0;
  let unresolvedCards = 0;
  let ambiguousCards = 0;
  const version = Number(payload?.version) || 1;

  // Backup-Sets dem Live-Set zuordnen (auch ueber Aliase, z. B. swsh12pt5gg/TCGDEX-30th-c) und je Live-Set
  // zusammenfuehren (ODER), damit ein Alias-Backup die Haken des Hauptsets nicht abwaehlt.
  const byLiveSet = new Map();
  for (const backupSet of sets) {
    const liveSet = findSetByIdOrAlias(allImportedSets(), backupSet?.setId);
    if (!liveSet) {
      skipped++;
      continue;
    }
    if (!byLiveSet.has(liveSet.setId)) byLiveSet.set(liveSet.setId, { liveSet, backupSets: [] });
    byLiveSet.get(liveSet.setId).backupSets.push(backupSet);
  }

  setLoading(true, 'Spiele Backup ein...');
  try {
    // Einmal frisch lesen (Cache verwerfen) statt je Set: bei 100-200 Sets waeren das sonst ebenso viele
    // volle db_collection-Reads und die Sheets-Quote wuerde den Restore mittendrin abbrechen. Die eigenen
    // Writes fuehrt sheets-db im Zeilen-Cache mit.
    invalidateCollectionRowCache();
    let setIndex = 0;
    for (const { liveSet, backupSets } of byLiveSet.values()) {
      setIndex++;
      setGlobalStatus(`Backup ${setIndex}/${byLiveSet.size}: ${liveSet.setName}`);
      // Schluessel gelten im Namensraum der Backup-Set-ID (v1: Nummern, bei TCGDEX-Aliasen localIds):
      // Aufloesung ueber die Registry; mehrdeutig/nicht aufloesbar -> uebersprungen, nie der rohe Schluessel.
      const resolver = await ensureResolverForSet(liveSet.setId);
      const { snapshot, protectedKeys, unresolved, ambiguous } = buildBackupRestoreSnapshot(backupSets, {
        liveSetId: liveSet.setId,
        version,
        resolver
      });
      unresolvedCards += unresolved;
      ambiguousCards += ambiguous;
      // Strikt lesen (Stand der einen frischen Lesung oben); ein Lesefehler bricht ab, statt gegen eine
      // leere Map zu planen.
      const liveMap = await readSetCollectionMap(liveSet.setName, { setId: liveSet.setId, strict: true });
      const pendingUpdates = [];
      const restorePlan = planBackupRestore(liveMap, {
        snapshot,
        protectedKeys,
        // Nicht aufloesbare Schluessel koennten jede Karte meinen: dann nur Haken setzen, keine entfernen.
        allowUncheck: unresolved === 0,
        hasCells: hasEntryCells
      });
      for (const { entry, target } of restorePlan) {
        pendingUpdates.push(...stateCellUpdates(entry, target));
        applyEntryState(entry, target);
        updated++;
      }
      if (pendingUpdates.length) {
        await updateCellBooleansBatch(liveSet.setName, pendingUpdates, { chunkSize: 200 });
      }
    }
  } finally {
    setLoading(false);
  }

  state.summaryData = null;
  if (state.currentSet) {
    await loadCurrentSet(true).catch(() => {});
  }
  const notAssigned = unresolvedCards + ambiguousCards;
  const notAssignedText = notAssigned
    ? ` Nicht zuordenbare Karten: ${notAssigned} (${ambiguousCards} mehrdeutig, ${unresolvedCards} unbekannt) - nicht geschrieben.`
    : '';
  showToast(`Backup eingespielt. aenderungen: ${updated}, uebersprungene Sets: ${skipped}.${notAssignedText}`,
    skipped || notAssigned ? 'info' : 'success', notAssigned ? 8000 : 5000);
}

function buildLegacyImportPreviewText(plan) {
  const summary = summarizeLegacyImportPlan(plan);
  const lines = [
    `Set-Blaetter erkannt: ${summary.sheetCount}`,
    `Markierte Karten (G/RH): ${summary.checkedCardCount}`,
    `Eindeutig zuordenbar: ${summary.matchedCardCount}`,
    `Fehlende Sets zum Vorimport: ${summary.missingSetCount}`
  ];

  if (!summary.ok) {
    lines.push('');
    lines.push(`Offene Set-Konflikte: ${summary.unresolvedSheetCount}`);
    lines.push(`Offene Karten-Konflikte: ${summary.unresolvedCardCount}`);

    if (plan.unresolvedSheets?.length) {
      lines.push('');
      lines.push('Set-Probleme:');
      plan.unresolvedSheets.slice(0, 5).forEach((entry) => {
        lines.push(` ${entry.sheetName}: ${entry.reason}`);
      });
    }

    if (plan.unresolvedCards?.length) {
      lines.push('');
      lines.push('Karten-Probleme:');
      plan.unresolvedCards.slice(0, 8).forEach((entry) => {
        lines.push(` ${entry.setId} / ${entry.sourceCardId}: ${entry.reason}`);
      });
    }

    lines.push('');
    lines.push('Der Import wurde blockiert, bis alle Konflikte eindeutig geloest sind.');
    return lines.join('\n');
  }

  lines.push('');
  lines.push('Der Import setzt die betroffenen Sets exakt auf den Altbestand-Stand (G/RH) - inklusive Entfernen nicht markierter Treffer in diesen Sets.');
  return lines.join('\n');
}

async function prepareLegacyWorkbookImport(workbook, sourceLabel = 'Altbestand') {
  if (!workbook) throw new Error('Keine Altbestand-Quelle ausgewaehlt.');
  if (!state.allSets?.length) {
    await loadSets();
  }
  if (!state.allSets?.length) {
    throw new Error('Sets konnten vor der Analyse nicht geladen werden.');
  }

  const parsedWorkbook = parseLegacyWorkbook(workbook);
  if (!parsedWorkbook.sheets.length) {
    throw new Error(`In ${sourceLabel} wurden keine markierten Karten gefunden.`);
  }

  const preflight = buildLegacyImportPlan({
    parsedWorkbook,
    allSets: state.allSets,
    cardsBySetId: {}
  });

  if (preflight.unresolvedSheets.length) {
    return { parsedWorkbook, cardsBySetId: {}, plan: preflight };
  }

  const cardsBySetId = {};
  const uniqueSetIds = Array.from(new Set(preflight.matchedSets.map((entry) => entry.setId)));

  for (let index = 0; index < uniqueSetIds.length; index++) {
    const setId = uniqueSetIds[index];
    const setMeta = getSetById(setId);
    setGlobalStatus(`Analysiere ${sourceLabel} ${index + 1}/${uniqueSetIds.length}: ${setMeta?.setName || setId}`);
    const cards = await fetchMergedCards(setId);
    if (!Array.isArray(cards) || !cards.length) {
      throw new Error(`Kartenkatalog fuer ${setMeta?.setName || setId} konnte nicht geladen werden.`);
    }
    cardsBySetId[setId] = cards;
  }

  const plan = buildLegacyImportPlan({
    parsedWorkbook,
    allSets: state.allSets,
    cardsBySetId
  });

  return { parsedWorkbook, cardsBySetId, plan };
}

let legacyImportSelectionDialogState = null;

async function applyLegacyImportPlan(plan, cardsBySetId) {
  if (!plan?.ok) {
    throw new Error('Der Dry-Run enthaelt noch Konflikte.');
  }

  const missingSets = plan.missingSetIds
    .map((setId) => getSetById(setId))
    .filter((set) => set?.setId);

  if (missingSets.length) {
    await importSetsSequential(missingSets, {
      successMessage: '{count} fehlende Sets fuer den Altbestand-Import importiert.'
    });
    await loadSets();
  }

  try {
    await createAutoSnapshot(`Legacy Altbestand Import (${plan.matchedSets.length} Sets)`, state.collection || {});
  } catch (err) {
    console.warn('[applyLegacyImportPlan] snapshot failed', err);
  }

  let updatedCells = 0;
  let legacyAmbiguous = 0;
  let legacyUnresolved = 0;
  const ambiguousSkipped = [];
  setLoading(true, 'Synchronisiere Altbestand...');
  try {
    for (let setIndex = 0; setIndex < plan.matchedSets.length; setIndex++) {
      const matchedSet = plan.matchedSets[setIndex];
      const liveSet = getSetById(matchedSet.setId);
      if (!liveSet?.setName) {
        throw new Error(`Ziel-Set ${matchedSet.setId} ist nach dem Vorimport nicht verfuegbar.`);
      }

      setGlobalStatus(`Altbestand-Import ${setIndex + 1}/${plan.matchedSets.length}: ${liveSet.setName}`);
      const liveMap = await readSetCollectionMap(liveSet.setName, { setId: liveSet.setId }).catch(() => new Map());
      // Quellnummern gelten im Namensraum des QUELL-Sets (Blatt-Set-ID, z. B. TCGDEX-30th-c mit localIds;
      // ohne Set-ID: das Live-Set). Nur eindeutig aufgeloeste collectionKeys werden geschrieben, nie rohe Nummern.
      const resolver = await ensureResolverForSet(liveSet.setId);
      const sourceSetKey = pickSourceSetKey(resolver, { sourceSetId: matchedSet.sourceSetIdRaw, liveSetId: liveSet.setId });
      const pendingCellUpdates = [];

      for (const target of (matchedSet.cards || [])) {
        const rawCardId = String(target?.sourceCardId || target?.cardId || '').trim();
        if (!rawCardId) continue;
        const resolved = resolveSourceCardKey(resolver, sourceSetKey, rawCardId);
        if (resolved.skip === 'ambiguous') {
          legacyAmbiguous++;
          continue;
        }
        if (resolved.skip) {
          legacyUnresolved++;
          continue;
        }
        const key = resolved.collectionKey;

        let entry = liveMap.get(key) || null;
        if (!hasEntryCells(entry)) {
          try {
            const pending = pendingAmbiguityError(entry, { setId: liveSet.setId });
            if (pending) throw pending;
            entry = adoptEnsuredEntry(entry || emptyCollectionEntry({ collectionKey: key, number: key }, key),
              await ensureCollectionEntry(liveSet.setName, key, { setId: liveSet.setId }));
            liveMap.set(entry.collectionKey || key, entry);
          } catch (err) {
            if (!isAmbiguousLegacyKeyError(err)) throw err;
            ambiguousSkipped.push(err);
            continue;
          }
        }

        const targetG = Boolean(target.g);
        const targetRh = Boolean(target.g && target.rh);
        if (Boolean(entry.g) === targetG && Boolean(entry.rh) === targetRh) continue;
        const updates = stateCellUpdates(entry, { g: targetG, rh: targetRh });
        pendingCellUpdates.push(...updates);
        applyEntryState(entry, { g: targetG, rh: targetRh });
        updatedCells += updates.length;
      }

      if (pendingCellUpdates.length) {
        await updateCellBooleansBatch(liveSet.setName, pendingCellUpdates, { chunkSize: 200 });
      }
    }
  } finally {
    setLoading(false);
  }

  state.summaryData = null;
  await loadSets();
  if (state.currentSet?.setId) {
    await loadCurrentSet(true).catch(() => {});
  }

  if (ambiguousSkipped.length) onAmbiguousLegacyKey(ambiguousSkipped[0]);
  setGlobalStatus(`Altbestand importiert: ${plan.matchedSets.length} Sets, ${updatedCells} aenderungen.`);
  const legacySkipped = legacyAmbiguous + legacyUnresolved + ambiguousSkipped.length;
  const legacySkippedText = legacySkipped
    ? ` Nicht zuordenbar und nicht geschrieben: ${legacySkipped} Karte(n) (${legacyAmbiguous + ambiguousSkipped.length} mehrdeutig, ${legacyUnresolved} unbekannt).`
    : '';
  showToast(`Altbestand importiert: ${plan.matchedSets.length} Sets synchronisiert, ${updatedCells} aenderungen geschrieben.${legacySkippedText}`,
    legacySkipped ? 'info' : 'success', legacySkipped ? 8000 : 5000);
}

function setLegacySheetDialogError(message = '') {
  if (!dom.legacySheetError) return;
  dom.legacySheetError.textContent = message;
  dom.legacySheetError.classList.toggle('hidden', !message);
}

function escapeLegacyImportSelectionHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function syncLegacyImportSelectionSetState(setEntry) {
  if (!setEntry || !Array.isArray(setEntry.cards)) return 0;
  const selectedCards = setEntry.cards.filter((card) => card?.selected !== false).length;
  setEntry.selected = selectedCards > 0;
  return selectedCards;
}

function getLegacyImportSelectionStats(tree) {
  const sets = Array.isArray(tree?.sets) ? tree.sets : [];
  const totalSetCount = sets.length;
  const totalCardCount = sets.reduce((sum, set) => sum + (Array.isArray(set?.cards) ? set.cards.length : 0), 0);
  const selectedSetCount = sets.filter((set) => Array.isArray(set?.cards) && set.cards.some((card) => card?.selected !== false)).length;
  const selectedCardCount = sets.reduce((sum, set) => sum + (Array.isArray(set?.cards) ? set.cards.filter((card) => card?.selected !== false).length : 0), 0);
  const autoImportSetCount = sets.filter((set) => !set?.imported && Array.isArray(set?.cards) && set.cards.some((card) => card?.selected !== false)).length;
  return { totalSetCount, totalCardCount, selectedSetCount, selectedCardCount, autoImportSetCount };
}

function renderLegacyImportSelectionDialog() {
  const session = legacyImportSelectionDialogState;
  if (!session || !dom.legacySelectionTree) return;

  const query = String(dom.legacySelectionSearch?.value || '').trim().toLowerCase();
  const stats = getLegacyImportSelectionStats(session.tree);

  if (dom.legacySelectionSummary) {
    dom.legacySelectionSummary.innerHTML = `
      <div class="legacy-selection-stat"><strong>${stats.selectedSetCount}</strong><span>Sets</span></div>
      <div class="legacy-selection-stat"><strong>${stats.selectedCardCount}</strong><span>Karten</span></div>
      <div class="legacy-selection-stat"><strong>${stats.autoImportSetCount}</strong><span>Vorimporte</span></div>
    `;
  }

  if (dom.legacySelectionInfo) {
    dom.legacySelectionInfo.textContent = stats.selectedCardCount > 0
      ? `${stats.selectedCardCount} von ${stats.totalCardCount} Karten aus ${stats.selectedSetCount} von ${stats.totalSetCount} Sets werden uebernommen.${stats.autoImportSetCount ? ` ${stats.autoImportSetCount} Sets werden dafuer bei Bedarf zuerst importiert.` : ''}`
      : 'Bitte mindestens ein Set oder eine Karte auswaehlen.';
  }

  if (dom.btnLegacySelectionConfirm) {
    dom.btnLegacySelectionConfirm.disabled = stats.selectedCardCount === 0;
    dom.btnLegacySelectionConfirm.textContent = stats.selectedCardCount > 0
      ? `Ausgewaehlte importieren (${stats.selectedCardCount})`
      : 'Ausgewaehlte importieren';
  }

  const setMarkup = (session.tree.sets || []).map((setEntry, setIndex) => {
    const selectedCount = syncLegacyImportSelectionSetState(setEntry);
    const setSearchText = [setEntry.setName, setEntry.sheetName, setEntry.setId].join(' ').toLowerCase();
    const setMatches = !query || setSearchText.includes(query);
    const visibleCards = (setEntry.cards || [])
      .map((card, cardIndex) => ({ card, cardIndex }))
      .filter(({ card }) => !query || setMatches || [card.name, card.cardId, card.sourceCardId].join(' ').toLowerCase().includes(query));

    if (query && !setMatches && !visibleCards.length) return '';

    const shouldOpen = query ? true : Boolean(setEntry.expanded);
    const cardsMarkup = shouldOpen
      ? visibleCards.map(({ card, cardIndex }) => {
          const badgeHtml = [
            card.g ? '<span class="legacy-tree-badge is-collected">G</span>' : '',
            card.rh ? '<span class="legacy-tree-badge is-reverse">RH</span>' : ''
          ].join('');
          const cardNumber = escapeLegacyImportSelectionHtml(card.sourceCardId || card.cardId || '');
          const cardName = escapeLegacyImportSelectionHtml(card.name || card.cardId || 'Unbenannte Karte');
          return `
            <label class="legacy-tree-card">
              <input type="checkbox" data-selection-type="card" data-set-index="${setIndex}" data-card-index="${cardIndex}" ${card.selected !== false ? 'checked' : ''} />
              <span class="legacy-tree-card-id">#${cardNumber}</span>
              <span class="legacy-tree-card-name">${cardName}</span>
              <span class="legacy-tree-card-flags">${badgeHtml}</span>
            </label>
          `;
        }).join('')
      : '';

    const summaryLabel = escapeLegacyImportSelectionHtml(setEntry.setName || setEntry.sheetName || setEntry.setId || 'Unbekanntes Set');
    const summaryMeta = escapeLegacyImportSelectionHtml(setEntry.sheetName && setEntry.sheetName !== setEntry.setName
      ? `${setEntry.sheetName} - ${setEntry.setId}`
      : `Set-ID: ${setEntry.setId}`);

    return `
      <details class="legacy-tree-set" data-set-index="${setIndex}" ${shouldOpen ? 'open' : ''}>
        <summary class="legacy-tree-set-summary">
          <label class="legacy-tree-summary-check">
            <input class="legacy-tree-set-toggle" type="checkbox" data-selection-type="set" data-set-index="${setIndex}" ${selectedCount > 0 ? 'checked' : ''} />
          </label>
          <div class="legacy-tree-set-copy">
            <strong>${summaryLabel}</strong>
            <small>${summaryMeta}</small>
          </div>
          <div class="legacy-tree-set-meta">
            <span class="legacy-tree-pill ${setEntry.imported ? '' : 'is-accent'}">${setEntry.imported ? 'bereits importiert' : 'wird vorimportiert'}</span>
            <span class="legacy-tree-count">${selectedCount}/${setEntry.cards.length}</span>
          </div>
        </summary>
        <div class="legacy-tree-card-list" role="group">
          ${cardsMarkup || '<p class="legacy-selection-empty">Keine Karten fuer diesen Filter.</p>'}
        </div>
      </details>
    `;
  }).filter(Boolean).join('');

  dom.legacySelectionTree.innerHTML = setMarkup || '<p class="legacy-selection-empty">Keine Sets oder Karten fuer diesen Filter gefunden.</p>';

  dom.legacySelectionTree.querySelectorAll('.legacy-tree-set-toggle').forEach((checkbox) => {
    const setIndex = Number(checkbox.dataset.setIndex || '-1');
    const setEntry = session.tree.sets[setIndex];
    if (!setEntry) return;
    const total = Array.isArray(setEntry.cards) ? setEntry.cards.length : 0;
    const selected = Array.isArray(setEntry.cards) ? setEntry.cards.filter((card) => card?.selected !== false).length : 0;
    checkbox.checked = selected > 0;
    checkbox.indeterminate = selected > 0 && selected < total;
  });
}

function closeLegacyImportSelectionDialog(result = null) {
  const resolver = legacyImportSelectionDialogState?.resolve || null;
  legacyImportSelectionDialogState = null;
  dom.legacySelectionDialog?.close();
  if (dom.legacySelectionSearch) dom.legacySelectionSearch.value = '';
  if (dom.legacySelectionTree) dom.legacySelectionTree.innerHTML = '';
  if (dom.legacySelectionSummary) dom.legacySelectionSummary.innerHTML = '';
  if (dom.legacySelectionInfo) dom.legacySelectionInfo.textContent = '';
  if (typeof resolver === 'function') resolver(result);
}

function setAllLegacyImportSelections(selected) {
  const session = legacyImportSelectionDialogState;
  if (!session) return;
  session.tree.sets.forEach((setEntry) => {
    setEntry.selected = Boolean(selected);
    (setEntry.cards || []).forEach((card) => {
      card.selected = Boolean(selected);
    });
  });
  renderLegacyImportSelectionDialog();
}

function confirmLegacyImportSelectionDialog() {
  const session = legacyImportSelectionDialogState;
  if (!session) return;
  const filteredPlan = filterLegacyImportPlanBySelection(session.plan, session.tree);
  const summary = summarizeLegacyImportPlan(filteredPlan);
  if (!summary.checkedCardCount) {
    renderLegacyImportSelectionDialog();
    return;
  }
  closeLegacyImportSelectionDialog(filteredPlan);
}

function handleLegacyImportSelectionTreeChange(event) {
  const target = event.target;
  const session = legacyImportSelectionDialogState;
  if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox' || !session) return;

  const setIndex = Number(target.dataset.setIndex || '-1');
  const setEntry = session.tree.sets[setIndex];
  if (!setEntry) return;

  if (target.dataset.selectionType === 'set') {
    setEntry.selected = target.checked;
    (setEntry.cards || []).forEach((card) => {
      card.selected = target.checked;
    });
  } else if (target.dataset.selectionType === 'card') {
    const cardIndex = Number(target.dataset.cardIndex || '-1');
    const cardEntry = setEntry.cards?.[cardIndex];
    if (!cardEntry) return;
    cardEntry.selected = target.checked;
    syncLegacyImportSelectionSetState(setEntry);
  }

  renderLegacyImportSelectionDialog();
}

function handleLegacyImportSelectionTreeToggle(event) {
  const session = legacyImportSelectionDialogState;
  const details = event.target;
  if (!(details instanceof HTMLDetailsElement) || !session) return;
  const setIndex = Number(details.dataset.setIndex || '-1');
  const setEntry = session.tree.sets?.[setIndex];
  if (!setEntry) return;
  setEntry.expanded = Boolean(details.open);
  renderLegacyImportSelectionDialog();
}

function openLegacyImportSelectionDialog(plan, cardsBySetId) {
  if (!dom.legacySelectionDialog || !dom.legacySelectionTree) {
    const ok = window.confirm(`${buildLegacyImportPreviewText(plan)}\n\nImport jetzt anwenden?`);
    return Promise.resolve(ok ? plan : null);
  }

  const tree = buildLegacyImportSelectionTree(plan, cardsBySetId);
  tree.sets.forEach(syncLegacyImportSelectionSetState);
  legacyImportSelectionDialogState = {
    plan,
    tree,
    resolve: null
  };

  if (dom.legacySelectionSearch) {
    dom.legacySelectionSearch.value = '';
  }

  renderLegacyImportSelectionDialog();
  dom.legacySelectionDialog.showModal();
  dom.legacySelectionSearch?.focus();

  return new Promise((resolve) => {
    legacyImportSelectionDialogState.resolve = resolve;
  });
}

function openLegacySheetImportDialog() {
  setLegacySheetDialogError('');
  if (dom.legacySheetInput) {
    dom.legacySheetInput.value = '';
  }
  dom.legacySheetDialog?.showModal();
  dom.legacySheetInput?.focus();
}

async function submitLegacySheetImportDialog() {
  const rawInput = String(dom.legacySheetInput?.value || '').trim();
  const spreadsheetId = extractLegacySpreadsheetId(rawInput);
  if (!spreadsheetId) {
    setLegacySheetDialogError('Bitte einen gueltigen Google-Sheets-Link oder eine Spreadsheet-ID eingeben.');
    dom.legacySheetInput?.focus();
    return;
  }

  dom.legacySheetDialog?.close();
  await startLegacyWorkbookImport({
    spreadsheetInput: spreadsheetId,
    sourceLabel: 'Google Sheet'
  });
}

async function startLegacyWorkbookImport(source = {}) {
  const sourceFile = source instanceof Blob ? source : source?.file || null;
  const spreadsheetInput = typeof source === 'string' ? source : source?.spreadsheetInput || '';
  const sourceLabel = String(source?.sourceLabel || (sourceFile ? 'XLSX' : 'Google Sheet')).trim();
  if (!sourceFile && !spreadsheetInput) return;

  setLoading(true, 'Analysiere Altbestand...');
  try {
    let workbook;
    if (sourceFile) {
      workbook = await loadLegacyWorkbookFromFile(sourceFile);
    } else {
      try {
        workbook = await loadLegacyWorkbookFromSpreadsheetInput(spreadsheetInput);
      } catch (err) {
        if (err?.code !== 'legacy-drive-export-scope-required') throw err;

        setGlobalStatus('Altbestand-Import benoetigt eine einmalige Google-Freigabe');
        const allowUpgrade = window.confirm('Damit der Sheets-Link exakt wie der XLSX-Import ausgewertet wird, braucht der Tracker einmalig zusaetzliche Google-Drive-Leseberechtigung. Jetzt Google-Freigabe aktualisieren?');
        if (!allowUpgrade) {
          throw new Error('Google-Berechtigung fuer den direkten Sheets-Link-Import wurde nicht erteilt.');
        }

        const reauthOk = await signIn({ forceConsent: true });
        if (!reauthOk) {
          throw new Error('Google-Anmeldung wurde nicht abgeschlossen. Bitte Popup erlauben und erneut versuchen.');
        }

        workbook = await loadLegacyWorkbookFromSpreadsheetInput(spreadsheetInput);
      }
    }

    const { plan, cardsBySetId } = await prepareLegacyWorkbookImport(workbook, sourceLabel);
    const summary = summarizeLegacyImportPlan(plan);

    if (!summary.ok) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      downloadJson(`legacy_import_report_${stamp}.json`, {
        createdAt: new Date().toISOString(),
        summary,
        plan
      });
      setGlobalStatus(`Altbestand blockiert: ${summary.unresolvedSheetCount} Set-, ${summary.unresolvedCardCount} Kartenkonflikte.`);
      window.alert(buildLegacyImportPreviewText(plan));
      showToast(`Import blockiert: ${summary.unresolvedSheetCount} Set- und ${summary.unresolvedCardCount} Kartenkonflikte. Pruefbericht exportiert.`, 'error', 7000);
      return;
    }

    setLoading(false);
    setGlobalStatus(`Altbestand analysiert: ${summary.sheetCount} Sets, ${summary.checkedCardCount} markierte Karten. Bitte Auswahl pruefen.`);
    const selectedPlan = await openLegacyImportSelectionDialog(plan, cardsBySetId);
    if (!selectedPlan) {
      setGlobalStatus('Altbestand-Analyse abgeschlossen - Import nicht angewendet.');
      showToast('Altbestand analysiert. Es wurden noch keine aenderungen geschrieben.', 'info', 4500);
      return;
    }

    await applyLegacyImportPlan(selectedPlan, cardsBySetId);
  } catch (err) {
    const message = getErrorMessage(err, 'Unbekannter Fehler');
    console.error('[startLegacyWorkbookImport]', err);
    setGlobalStatus(`Altbestand-Import fehlgeschlagen: ${message}`);
    showToast(`Altbestand-Import fehlgeschlagen: ${message}`, 'error', 7000);
  } finally {
    setLoading(false);
  }
}

function initBackupImportExport() {
  dom.btnExportBackup?.addEventListener('click', exportCollectionBackup);
  dom.btnImportBackup?.addEventListener('click', () => dom.backupFileInput?.click());
  dom.btnImportLegacyXlsx?.addEventListener('click', () => dom.legacyImportFileInput?.click());
  dom.btnImportLegacySheet?.addEventListener('click', openLegacySheetImportDialog);
  dom.btnLegacySheetCancel?.addEventListener('click', () => dom.legacySheetDialog?.close());
  dom.btnLegacySheetImportConfirm?.addEventListener('click', submitLegacySheetImportDialog);
  dom.legacySheetInput?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    submitLegacySheetImportDialog();
  });
  dom.btnLegacySelectionAll?.addEventListener('click', () => setAllLegacyImportSelections(true));
  dom.btnLegacySelectionNone?.addEventListener('click', () => setAllLegacyImportSelections(false));
  dom.btnLegacySelectionCancel?.addEventListener('click', () => closeLegacyImportSelectionDialog(null));
  dom.btnLegacySelectionConfirm?.addEventListener('click', confirmLegacyImportSelectionDialog);
  dom.legacySelectionSearch?.addEventListener('input', renderLegacyImportSelectionDialog);
  dom.legacySelectionTree?.addEventListener('change', handleLegacyImportSelectionTreeChange);
  dom.legacySelectionTree?.addEventListener('click', (event) => {
    if (event.target?.closest?.('.legacy-tree-summary-check')) {
      event.stopPropagation();
    }
  }, true);
  dom.legacySelectionTree?.addEventListener('toggle', handleLegacyImportSelectionTreeToggle, true);
  dom.legacySelectionDialog?.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeLegacyImportSelectionDialog(null);
  });

  dom.backupFileInput?.addEventListener('change', async () => {
    const file = dom.backupFileInput.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const payload = parseBackupPayload(text);
      const ok = window.confirm(`Backup mit ${payload.sets.length} Sets einspielen?`);
      if (!ok) return;
      await applyCollectionBackup(payload);
    } catch (err) {
      console.error('[initBackupImportExport]', err);
      showToast(`Backup-Import fehlgeschlagen: ${err.message}`, 'error', 6000);
    } finally {
      dom.backupFileInput.value = '';
    }
  });

  dom.legacyImportFileInput?.addEventListener('change', async () => {
    const file = dom.legacyImportFileInput.files?.[0];
    if (!file) return;
    try {
      await startLegacyWorkbookImport(file);
    } finally {
      dom.legacyImportFileInput.value = '';
    }
  });
}

async function reimportCurrentSetFromApi() {
  if (!state.currentSet) {
    showToast('Kein aktuelles Set geladen.', 'info');
    return;
  }
  const set = getSetById(state.currentSet.setId) || state.currentSet;
  const ok = window.confirm(`Set "${set.setName}" neu importieren? Vorhandene Sammel-Checks bleiben erhalten.`);
  if (!ok) return;

  await importSetsSequential([set], { successMessage: 'Set erfolgreich reimportiert.' });
  dom.selector.value = set.setId;
  navigate(`set/${set.setId}`);
  await loadCurrentSet(true);
}

function openSettingsDialog() {
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
    resetToLoggedOut();
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
    showToast('Queue-Preset hinzugefuegt (Auto-Fix ? Refresh).', 'info', 3000);
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
