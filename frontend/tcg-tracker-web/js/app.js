import { initAuth, signIn, signOut, isSignedIn } from './auth.js';
import {
  listImportedSets,
  listSetsOverviewData,
  readSetCollectionMap,
  readDbCardsForSet,
  ensureCollectionEntry,
  updateCellBoolean,
  readSummarySheet,
  readSettings,
  writeSetting,
  importSetIntoCollection,
  syncOverviewWithApiSets,
} from './sheets-db.js';
import { fetchMergedCards, fetchAllAvailableSets, runPokecodeParityCheck } from './pokemon-api.js';
import { normalizeCardNumber } from './utils.js';
import * as cache from './cache.js';
import { CONFIG, scopedStorageKey } from './config.js';
import {
  initSmartEngine,
  startAutoHealing,
  fuzzySearch,
  getEngineMetrics,
  cacheCardsOffline,
  getCachedCardsOffline
} from './smart-engine.js';
import {
  createAutoSnapshot,
  loadSnapshots
} from './collection-versioning.js';
import { initCommandPalette } from './command-palette.js';
import {
  loadFavorites, saveFavorites, toggleFavorite, isFavorite,
  loadSearchHistory, addSearchHistory, clearSearchHistory,
  createCollectionSnapshot, generateCollectionReport,
  loadSettings, saveSettings, updateSetting,
  applyQuickFilters, calculateCollectionStats,
  getSyncStatus, setSyncStatus
} from './enhanced-features.js';
import {
  initQuickFiltersUI, createSearchHistoryWidget, createStatisticsPanel,
  createExportDialog, createSettingsPanel, createShortcutsOverlay,
  createBulkActionsToolbar
} from './ui-components.js';
import {
  AdvancedSearch, SyncIndicator, CardCollectionTools,
  generateCollectionInsights, generateSetComparison,
  NotificationManager, PerformanceTracker
} from './advanced-tools.js';
import {
  loadWishlists, addTradeLog, getTradingLog, checkAchievementsProgress,
  importCollectionFromCSV, GestureController, rateSet, getAllRatings
} from './social-features.js';
import {
  createWishlistPanel, createSharingDialog, createTradingLogPanel,
  createAchievementsPanel, createCSVExportPanel, createSetRatingWidget,
  createRatingStatsWidget
} from './social-ui.js';
import {
  VoiceCommandRecognizer, GestureRecognizer, downloadJson, downloadCsv,
  createLocalBackup, getLocalBackups, restoreLocalBackup, deleteLocalBackup,
  generateAdvancedStatistics
} from './advanced-features.js';
import {
  createUserProfile, getUserProfile, updateUserProfile,
  createPublicShare, getSharedCollection, followUser, unfollowUser,
  isFollowing, getFollowers, addReview, getReviewsForShare,
  getTrendingCollections, searchPublicCollections, getCollectionsByUser,
  checkCollectionBadges, getCommunityStats, createUserProfile as createProfile
} from './community-features.js';
import {
  createUserProfileCard, createSharedCollectionCard, createCommunityTrendingPanel,
  createReviewsPanel, createCommunitySearchPanel, createCommunityStatsBanner

} from './community-ui.js';
import {
  detectCardRarity, detectCardType, getCardEstimatedValue,
  calculateCollectionValue, applyCardFilters,
  getCardsByRarity, getCardsByType, getRareCards,
  getCollectionValueStats, getAvailableRarities, getAvailableTypes
} from './card-filters.js';
import {
  getWantedCards, addWantedCard, removeWantedCard, isCardWanted,
  getWantedCardsByPriority, createTradeOffer, getTradeOffers,
  updateTradeOffer, acceptTradeOffer, deleteTradeOffer,
  findMatchingTrades, recordTradeCompletion, getTradeHistory,
  getUserTradeStats, generateTradeSuggestions, getTradePlaceSummary,
  TRADE_STATUS
} from './trading-system.js';
import {
  createWantedCardsPanel, createTradeMarketplacePanel,
  createTradeStatsCard, createTradeSuggestionsPanel,
  createTradeHistoryPanel
} from './trading-ui.js';
import {
  initRealtimeSync,
  buildCollectionUpdateEvent
} from './realtime-sync.js';
// ══════════════════════════════════════════════════════════════════════════
// DOM-REFERENZEN
// ══════════════════════════════════════════════════════════════════════════
const dom = {
  // Global
  login:            document.getElementById('btn-login'),
  logout:           document.getElementById('btn-logout'),
  darkModeToggle:   document.getElementById('btn-dark-mode'),
  mainNav:          document.getElementById('main-nav'),
  loadingOverlay:   document.getElementById('loading-overlay'),
  loadingText:      document.getElementById('loading-text'),
  toastContainer:   document.getElementById('toast-container'),
  globalStatus:     document.getElementById('global-status'),
  jobPanel:         document.getElementById('job-panel'),
  jobTitle:         document.getElementById('job-title'),
  jobStatusText:    document.getElementById('job-status-text'),
  jobProgressFill:  document.getElementById('job-progress-fill'),
  jobHistory:       document.getElementById('job-history'),
  btnJobCancel:     document.getElementById('btn-job-cancel'),
  // Spreadsheet-Dialog
  dialog:           document.getElementById('dialog-spreadsheet'),
  dialogInput:      document.getElementById('input-spreadsheet-id'),
  dialogExistingSelect: document.getElementById('select-spreadsheet-existing'),
  dialogNewNameInput: document.getElementById('input-new-spreadsheet-name'),
  dialogError:      document.getElementById('dialog-error'),
  btnDialogSave:    document.getElementById('btn-dialog-save'),
  btnDialogCancel:  document.getElementById('btn-dialog-cancel'),
  btnSpreadsheetRefresh: document.getElementById('btn-spreadsheet-refresh'),
  btnSpreadsheetUseSelected: document.getElementById('btn-spreadsheet-use-selected'),
  btnSpreadsheetCreate: document.getElementById('btn-spreadsheet-create'),
  batchDialog:      document.getElementById('dialog-batch-import'),
  batchSearchInput: document.getElementById('batch-search-input'),
  batchList:        document.getElementById('batch-list'),
  batchInfo:        document.getElementById('batch-selection-info'),
  btnBatchSelectVisible: document.getElementById('btn-batch-select-visible'),
  btnBatchClearSelection: document.getElementById('btn-batch-clear-selection'),
  btnBatchCancel:   document.getElementById('btn-batch-cancel'),
  btnBatchImportSelected: document.getElementById('btn-batch-import-selected'),
  spreadsheetInfo:  document.getElementById('spreadsheet-info'),
  spreadsheetLink:  document.getElementById('spreadsheet-link'),
  btnChangeSheet:   document.getElementById('btn-change-spreadsheet'),
  // Views
  viewDashboard:    document.getElementById('view-dashboard'),
  viewSet:          document.getElementById('view-set'),
  viewStats:        document.getElementById('view-stats'),
  viewSearch:       document.getElementById('view-search'),
  // Dashboard
  dashFilter:       document.getElementById('dash-filter'),
  dashSeriesFilter: document.getElementById('dash-series-filter'),
  dashSort:         document.getElementById('dash-sort'),
  recentSets:       document.getElementById('recent-sets'),
  btnOverviewSync:  document.getElementById('btn-overview-sync'),
  btnOverviewPowerRefresh: document.getElementById('btn-overview-power-refresh'),
  btnImportBatch:   document.getElementById('btn-import-batch'),
  btnImportAll:     document.getElementById('btn-import-all-missing'),
  btnReimportCurrent: document.getElementById('btn-reimport-current'),
  btnReimportAllImported: document.getElementById('btn-reimport-all-imported'),
  btnExportSummaryCsv: document.getElementById('btn-export-summary-csv'),
  btnDataHealthCheck: document.getElementById('btn-data-health-check'),
  btnDataHealthAutofix: document.getElementById('btn-data-health-autofix'),
  btnParityCheck: document.getElementById('dashboard-action-parity'),
  btnQueueAutofixRefresh: document.getElementById('btn-queue-autofix-refresh'),
  btnQueueBuilder: document.getElementById('btn-queue-builder'),
  btnQueueRun: document.getElementById('btn-queue-run'),
  btnQueueClear: document.getElementById('btn-queue-clear'),
  btnDashboardCompact: document.getElementById('btn-dashboard-compact'),
  queueBuilderDialog: document.getElementById('dialog-queue-builder'),
  queueBuilderList: document.getElementById('queue-builder-list'),
  queueBuilderSelected: document.getElementById('queue-builder-selected'),
  queuePresetSelect: document.getElementById('queue-preset-select'),
  btnQueuePresetSave: document.getElementById('btn-queue-preset-save'),
  btnQueuePresetRename: document.getElementById('btn-queue-preset-rename'),
  btnQueuePresetDuplicate: document.getElementById('btn-queue-preset-duplicate'),
  btnQueuePresetDelete: document.getElementById('btn-queue-preset-delete'),
  btnQueuePresetExport: document.getElementById('btn-queue-preset-export'),
  btnQueuePresetImport: document.getElementById('btn-queue-preset-import'),
  queuePresetFileInput: document.getElementById('input-queue-presets-file'),
  btnQueueBuilderCancel: document.getElementById('btn-queue-builder-cancel'),
  btnQueueBuilderAdd: document.getElementById('btn-queue-builder-add'),
  btnExportBackup: document.getElementById('btn-export-backup'),
  btnImportBackup: document.getElementById('btn-import-backup'),
  backupFileInput: document.getElementById('input-backup-file'),
  dashboardGrid:    document.getElementById('dashboard-grid'),
  // Set detail – sidebar
  selector:         document.getElementById('set-selector'),
  load:             document.getElementById('btn-load'),
  refresh:          document.getElementById('btn-refresh'),
  status:           document.getElementById('status'),
  setLogoWrap:      document.getElementById('set-logo-wrap'),
  setLogo:          document.getElementById('set-logo'),
  setSymbol:        document.getElementById('set-symbol'),
  statsSection:     document.getElementById('stats-section'),
  filterSection:    document.getElementById('filter-section'),
  sortSection:      document.getElementById('sort-section'),
  progressFill:     document.getElementById('progress-fill'),
  progressText:     document.getElementById('progress-text'),
  statTotal:        document.getElementById('stat-total'),
  statCollected:    document.getElementById('stat-collected'),
  statRh:           document.getElementById('stat-rh'),
  statMissing:      document.getElementById('stat-missing'),
  cardSort:         document.getElementById('card-sort'),
  // Set detail – toolbar
  btnBulkEdit:      document.getElementById('btn-bulk-edit'),
  btnMissingExport: document.getElementById('btn-missing-export'),
  bulkToolbar:      document.getElementById('bulk-toolbar'),
  bulkCount:        document.getElementById('bulk-count'),
  btnBulkMarkG:     document.getElementById('btn-bulk-mark-g'),
  btnBulkMarkRh:    document.getElementById('btn-bulk-mark-rh'),
  btnBulkUnmark:    document.getElementById('btn-bulk-unmark'),
  btnBulkCancel:    document.getElementById('btn-bulk-cancel'),
  // Cards
  cards:            document.getElementById('cards'),
  emptyState:       document.getElementById('empty-state'),
  // Lightbox
  lightboxDialog:   document.getElementById('dialog-lightbox'),
  lightboxImg:      document.getElementById('lightbox-img'),
  lightboxTitle:    document.getElementById('lightbox-title'),
  lightboxSubtitle: document.getElementById('lightbox-subtitle'),
  lightboxCounter:  document.getElementById('lightbox-counter'),
  lightboxRarity:   document.getElementById('lightbox-rarity'),
  lightboxHp:       document.getElementById('lightbox-hp'),
  lightboxTypes:    document.getElementById('lightbox-types'),
  lightboxSupertype: document.getElementById('lightbox-supertype'),
  lightboxSubtypes: document.getElementById('lightbox-subtypes'),
  lightboxEvolvesFrom: document.getElementById('lightbox-evolves-from'),
  lightboxArtist:   document.getElementById('lightbox-artist'),
  lightboxRegulationMark: document.getElementById('lightbox-regulation-mark'),
  lightboxRules:    document.getElementById('lightbox-rules'),
  lightboxFlavorText: document.getElementById('lightbox-flavor-text'),
  lightboxCmLink:   document.getElementById('lightbox-cm-link'),
  lightboxGCheck:   document.getElementById('lightbox-g-check'),
  lightboxRhCheck:  document.getElementById('lightbox-rh-check'),
  btnLightboxClose: document.getElementById('btn-lightbox-close'),
  btnLightboxPrev:  document.getElementById('btn-lightbox-prev'),
  btnLightboxNext:  document.getElementById('btn-lightbox-next'),
  // Stats view
  statsContent:     document.getElementById('stats-content'),
  // Search view
  searchInput:      document.getElementById('search-input'),
  searchSetFilter:  document.getElementById('search-set-filter'),
  searchScopeMode:  document.getElementById('search-scope-mode'),
  searchResults:    document.getElementById('search-results'),
};

// ══════════════════════════════════════════════════════════════════════════
// APP-STATE
// ══════════════════════════════════════════════════════════════════════════
const state = {
  loggedIn:     false,
  sets:         [],
  allSets:      [],
  summaryData:  null,
  currentSet:   null,
  dbMap:        new Map(),
  cards:        [],
  filter:       'all',
  sortOrder:    'number',
  bulkMode:     false,
  bulkSelected: new Set(),
  lightboxIndex: 0,
  searchCache:  new Map(),
  searchRunId:  0,
  searchAbortController: null,
  pendingSearchSetImport: false,
  batchSelection: new Set(),
  activeJob: null,
  queuedActions: [],
  queueRunning: false,
  queueCancelRequested: false,
  queueBuilderSelection: [],
  queueBuilderSequence: [],
  queuePresets: [],
  recentSets: [],
  dashboardView: 'all',
  dashboardDensity: 'comfortable',
  dashboardVirtualCount: 180,
  quickFilters: {
    completed: false,
    inProgress: false,
    notImported: false,
    favoritesOnly: false,
  },
  realtimeClientId: null,
  realtime: null,
};

let focusedCardIndex = -1;

const QUEUE_PRESETS_STORAGE_KEY = scopedStorageKey('queue_presets_v1');
const DASHBOARD_PREFS_STORAGE_KEY = scopedStorageKey('dashboard_prefs_v1');
const RECENT_SETS_STORAGE_KEY = scopedStorageKey('recent_sets_v1');
const DARK_MODE_STORAGE_KEY = scopedStorageKey('dark_mode');
const REALTIME_CLIENT_STORAGE_KEY = scopedStorageKey('realtime_client_id');
const USER_ID_STORAGE_KEY = scopedStorageKey('user_id');
const DASHBOARD_VIRTUAL_PAGE_SIZE = 180;
const SEARCH_INPUT_DEBOUNCE_MS = 900;
const DASHBOARD_VIRTUAL_THRESHOLD = 220;
const SEARCH_SCOPE_IMPORTED = 'imported';
const SEARCH_SCOPE_ALL = 'all';
const SEARCH_SCOPE_ONLINE = 'online';

function getSearchScopeMode() {
  const mode = String(dom.searchScopeMode?.value || SEARCH_SCOPE_IMPORTED);
  if (mode === SEARCH_SCOPE_ALL || mode === SEARCH_SCOPE_ONLINE) {
    return mode;
  }
  return SEARCH_SCOPE_IMPORTED;
}

function getSetsForSearchMode(mode) {
  if (mode === SEARCH_SCOPE_IMPORTED) {
    return state.sets || [];
  }
  return state.allSets?.length ? state.allSets : (state.sets || []);
}

function shouldUseApiForSearchSet(mode, set) {
  if (mode === SEARCH_SCOPE_ONLINE) {
    return true;
  }
  if (mode === SEARCH_SCOPE_ALL) {
    return !Boolean(set?.imported);
  }
  return false;
}

function getSearchModeMeta(mode) {
  if (mode === SEARCH_SCOPE_ONLINE) {
    return {
      label: '⚡ Modus: Online-Suche',
      className: 'online',
      hint: 'DB + API für alle Sets'
    };
  }
  if (mode === SEARCH_SCOPE_ALL) {
    return {
      label: '🌐 Modus: Alle Sets',
      className: 'all',
      hint: 'Importierte aus DB, nicht importierte online'
    };
  }
  return {
    label: '📦 Modus: Importierte Sets',
    className: 'imported',
    hint: 'Nur importierte Sets/DB'
  };
}

function renderSearchSetFilterOptions() {
  if (!dom.searchSetFilter) return;
  const mode = getSearchScopeMode();
  const previousValue = String(dom.searchSetFilter.value || '');
  const sets = getSetsForSearchMode(mode);
  const allLabel = mode === SEARCH_SCOPE_IMPORTED ? 'Importierte Sets' : 'Alle Sets';

  dom.searchSetFilter.innerHTML = `<option value="">${allLabel}</option>`;
  sets.forEach((set) => {
    const opt = document.createElement('option');
    opt.value = set.setId;
    opt.textContent = set.setName;
    dom.searchSetFilter.appendChild(opt);
  });

  if (previousValue && sets.some((set) => set.setId === previousValue)) {
    dom.searchSetFilter.value = previousValue;
  } else {
    dom.searchSetFilter.value = '';
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

function renderRecentSets() {
  if (!dom.recentSets) return;
  const recent = Array.isArray(state.recentSets) ? state.recentSets : [];
  if (!state.loggedIn || recent.length === 0) {
    dom.recentSets.classList.add('hidden');
    dom.recentSets.innerHTML = '';
    return;
  }

  const labelsById = new Map((state.allSets || []).map((set) => [set.setId, set.setName || set.setId]));
  dom.recentSets.innerHTML = recent
    .map((entry) => {
      const label = labelsById.get(entry.setId) || entry.setName || entry.setId;
      return `<button class="recent-set-chip" type="button" data-set-id="${entry.setId}" title="${label}">${label}</button>`;
    })
    .join('');
  dom.recentSets.classList.remove('hidden');

  dom.recentSets.querySelectorAll('.recent-set-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const setId = chip.dataset.setId;
      if (!setId) return;
      dom.selector.value = setId;
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

function resetDashboardVirtualization() {
  state.dashboardVirtualCount = DASHBOARD_VIRTUAL_PAGE_SIZE;
}

function createDashboardVirtualFooter(total, visible) {
  const wrapper = document.createElement('div');
  wrapper.className = 'dashboard-virtual-footer';
  const remaining = Math.max(0, total - visible);

  wrapper.innerHTML = `
    <p>Zeige ${visible} von ${total} Sets${remaining > 0 ? ` • ${remaining} weitere` : ''}</p>
    <div class="dashboard-virtual-actions">
      <button class="btn-secondary" type="button" data-action="more">Mehr laden (+${DASHBOARD_VIRTUAL_PAGE_SIZE})</button>
      <button class="btn-secondary" type="button" data-action="all">Alle laden</button>
    </div>
  `;

  wrapper.querySelector('[data-action="more"]')?.addEventListener('click', () => {
    state.dashboardVirtualCount = Math.min(total, (state.dashboardVirtualCount || DASHBOARD_VIRTUAL_PAGE_SIZE) + DASHBOARD_VIRTUAL_PAGE_SIZE);
    renderDashboard();
  });
  wrapper.querySelector('[data-action="all"]')?.addEventListener('click', () => {
    state.dashboardVirtualCount = total;
    renderDashboard();
  });

  return wrapper;
}

function initSheetsWriteFeedback() {
  window.addEventListener('sheets-write-retry', (event) => {
    const details = event?.detail || {};
    const retryLabel = `${details.attempt || '?'} / ${details.maxRetries || '?'}`;
    const waitSeconds = Math.max(1, Math.ceil((Number(details.delayMs) || 0) / 1000));
    const message = `Sheets-Write Retry ${retryLabel} (warte ${waitSeconds}s)`;
    setGlobalStatus(message);
    if (state.activeJob) {
      updateJob(state.activeJob, state.activeJob.current, message);
    }
  });

  window.addEventListener('sheets-write-failed', (event) => {
    const details = event?.detail || {};
    const message = `Sheets-Write fehlgeschlagen (${details.status || 'unbekannt'}): ${details.range || 'Range unbekannt'}`;
    setGlobalStatus(message);
    if (state.activeJob) {
      updateJob(state.activeJob, state.activeJob.current, message);
    }
  });
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

    if (parsed?.quickFilters && typeof parsed.quickFilters === 'object') {
      state.quickFilters = {
        ...state.quickFilters,
        completed: Boolean(parsed.quickFilters.completed),
        inProgress: Boolean(parsed.quickFilters.inProgress),
        notImported: Boolean(parsed.quickFilters.notImported),
        favoritesOnly: Boolean(parsed.quickFilters.favoritesOnly),
      };
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
      quickFilters: state.quickFilters,
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
  if (dom.jobTitle) dom.jobTitle.textContent = title;
  if (dom.jobStatusText) dom.jobStatusText.textContent = 'Gestartet…';
  if (dom.jobProgressFill) dom.jobProgressFill.style.width = '0%';
  if (dom.btnJobCancel) dom.btnJobCancel.disabled = false;
  return job;
}

function pushJobHistory(text) {
  if (!dom.jobHistory) return;
  const item = document.createElement('li');
  item.textContent = text;
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
  if (dom.jobStatusText) dom.jobStatusText.textContent = text || `${job.current}/${job.totalSteps}`;
}

function finishJob(job, summary, isError = false) {
  if (!job || state.activeJob?.id !== job.id) return;
  if (dom.jobStatusText) dom.jobStatusText.textContent = summary;
  if (dom.btnJobCancel) dom.btnJobCancel.disabled = true;
  if (dom.jobProgressFill && job.totalSteps > 0) {
    dom.jobProgressFill.style.width = isError ? dom.jobProgressFill.style.width : '100%';
  }
  pushJobHistory(`${new Date().toLocaleTimeString('de-DE')} • ${job.title}: ${summary}`);
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
  pushJobHistory(`${new Date().toLocaleTimeString('de-DE')} • Queue hinzugefügt: ${label}`);
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
        pushJobHistory(`${new Date().toLocaleTimeString('de-DE')} • Queue abgebrochen`);
        break;
      }
      const next = state.queuedActions.shift();
      updateQueueUiState();
      if (dom.jobStatusText) dom.jobStatusText.textContent = `Queue: ${next.label}`;
      pushJobHistory(`${new Date().toLocaleTimeString('de-DE')} • Queue startet: ${next.label}`);
      try {
        await next.action();
      } catch (err) {
        pushJobHistory(`${new Date().toLocaleTimeString('de-DE')} • Queue-Fehler: ${next.label} (${err.message})`);
        showToast(`Queue gestoppt: ${next.label} – ${err.message}`, 'error', 6000);
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
      description: 'Overview-Update mit Änderungsreport',
      action: () => powerRefreshOverviewFromApi()
    },
    {
      id: 'health-check',
      label: 'Datencheck',
      description: 'Prüft importierte Sets auf API/Sheet-Mismatch',
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
    },
    {
      id: 'pokecode-parity-test',
      label: 'Pokecode-Parity-Test',
      description: 'Vergleicht Adapter/Compat und exportiert einen Parity-Report',
      action: () => runPokecodeParityTest({ skipPrompt: true, maxSets: 10 })
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
  dom.queuePresetSelect.innerHTML = '<option value="">Preset laden…</option>';
  state.queuePresets.forEach((preset, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = preset.name;
    dom.queuePresetSelect.appendChild(option);
  });
}

function saveCurrentQueuePreset() {
  if (!state.queueBuilderSequence.length) {
    showToast('Keine Aktionen für Preset ausgewählt.', 'info');
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
    showToast('Bitte ein Preset auswählen.', 'info');
    return;
  }
  const presetName = state.queuePresets[idx].name;
  const ok = window.confirm(`Preset „${presetName}“ löschen?`);
  if (!ok) return;
  state.queuePresets.splice(idx, 1);
  persistQueuePresets();
  renderQueuePresetSelect();
  if (dom.queuePresetSelect) dom.queuePresetSelect.value = '';
  showToast(`Preset gelöscht: ${presetName}`, 'info', 2500);
}

function renameSelectedQueuePreset() {
  const idx = Number(dom.queuePresetSelect?.value ?? '-1');
  if (!Number.isInteger(idx) || idx < 0 || idx >= state.queuePresets.length) {
    showToast('Bitte ein Preset auswählen.', 'info');
    return;
  }
  const preset = state.queuePresets[idx];
  const newName = window.prompt('Neuer Name:', preset.name);
  if (newName === null) return;
  const trimmedName = newName.trim();
  if (!trimmedName) return;
  const collision = state.queuePresets.findIndex((p, i) => i !== idx && p.name.toLowerCase() === trimmedName.toLowerCase());
  if (collision >= 0) {
    showToast(`Name „${trimmedName}" wird bereits verwendet.`, 'error', 3500);
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
    showToast('Bitte ein Preset auswählen.', 'info');
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
    showToast(`Name „${trimmedName}" wird bereits verwendet.`, 'error', 3500);
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
    empty.textContent = 'Noch keine Aktion ausgewählt.';
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
        showToast('Keine gültigen Presets im Import gefunden.', 'error', 4500);
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
      showToast('Bitte mindestens eine Aktion wählen.', 'info');
      return;
    }

    selected.forEach((item) => enqueueAction(item.label, item.action));
    dom.queueBuilderDialog.close();
    showToast(`${selected.length} Aktion(en) in Reihenfolge zur Queue hinzugefügt.`, 'success', 3000);
  });
}

// ══════════════════════════════════════════════════════════════════════════
// UI-HELFER
// ══════════════════════════════════════════════════════════════════════════
function setGlobalStatus(text) {
  if (dom.globalStatus) dom.globalStatus.textContent = text;
  if (dom.status)       dom.status.textContent = text;
  console.info('[Status]', text);
}

function setLoading(show, text = 'Lade\u2026') {
  dom.loadingText.textContent = text;
  dom.loadingOverlay.classList.toggle('hidden', !show);
}

function showToast(message, type = 'info', durationMs = 3000) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  dom.toastContainer.appendChild(el);
  setTimeout(() => el.remove(), durationMs);
}

function getErrorMessage(err, fallback = 'Unbekannter Fehler') {
  if (!err) return fallback;
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err.trim()) return err.trim();
  if (err?.result?.error?.message) return String(err.result.error.message);
  if (err?.error?.message) return String(err.error.message);
  if (err?.statusText) return String(err.statusText);
  try {
    const serialized = JSON.stringify(err);
    return serialized && serialized !== '{}' ? serialized : fallback;
  } catch {
    return fallback;
  }
}

function isAuthError(err) {
  const status = Number(err?.status || err?.result?.error?.code || 0);
  if (status === 401 || status === 403) return true;
  const message = String(err?.result?.error?.message || err?.message || '').toLowerCase();
  return message.includes('unauthenticated')
    || message.includes('unauthorized')
    || message.includes('auth')
    || message.includes('anmelden');
}

function buildCardImageFallbacks(card, setIdHint = '') {
  const seen = new Set();
  const add = (url) => {
    const value = String(url || '').trim();
    if (!value || seen.has(value)) return;
    seen.add(value);
  };

  const original = String(card?.image || '').trim();
  const localFallbacks = Array.isArray(card?.imageFallbacks) ? card.imageFallbacks : [];
  localFallbacks.forEach((url) => add(url));

  if (/^https?:\/\/assets\.tcgdex\.net\/de\//i.test(original)) {
    add(original.replace('/de/', '/en/'));
  }
  if (/\/low\.webp(\?.*)?$/i.test(original)) {
    add(original.replace(/\/low\.webp(\?.*)?$/i, '/low.jpg$1'));
    if (/^https?:\/\/assets\.tcgdex\.net\/de\//i.test(original)) {
      const enWebp = original.replace('/de/', '/en/');
      add(enWebp.replace(/\/low\.webp(\?.*)?$/i, '/low.jpg$1'));
    }
  }

  const setId = String(setIdHint || '').trim();
  const normalizedNumber = normalizeCardNumber(card?.number || '');
  if (setId && !setId.startsWith('TCGDEX-') && normalizedNumber) {
    add(`https://images.pokemontcg.io/${encodeURIComponent(setId)}/${encodeURIComponent(normalizedNumber)}.png`);
  }

  if (original) seen.delete(original);
  return Array.from(seen);
}

function attachImageFallback(img, card, setIdHint = '') {
  const fallbackQueue = buildCardImageFallbacks(card, setIdHint);
  img.style.display = '';
  img.onerror = () => {
    while (fallbackQueue.length) {
      const next = fallbackQueue.shift();
      if (next && next !== img.src) {
        img.src = next;
        return;
      }
    }
    img.onerror = null;
    img.style.display = 'none';
  };
}

function setEmptyState(show) {
  dom.emptyState.classList.toggle('hidden', !show);
  dom.cards.classList.toggle('hidden', show);
}

// ══════════════════════════════════════════════════════════════════════════
// DARK MODE
// ══════════════════════════════════════════════════════════════════════════
function initDarkMode() {
  const saved = localStorage.getItem(DARK_MODE_STORAGE_KEY);
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (saved === 'true' || (saved === null && prefersDark)) {
    document.body.classList.add('dark');
    dom.darkModeToggle.textContent = '\u2600\uFE0F';
  }
  dom.darkModeToggle.addEventListener('click', () => {
    const isDark = document.body.classList.toggle('dark');
    localStorage.setItem(DARK_MODE_STORAGE_KEY, isDark);
    dom.darkModeToggle.textContent = isDark ? '\u2600\uFE0F' : '\uD83C\uDF19';
  });
}

// ══════════════════════════════════════════════════════════════════════════
// HASH-ROUTER / VIEW-MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════
const VIEWS = ['dashboard', 'set', 'stats', 'search'];

function showView(viewId) {
  VIEWS.forEach((v) => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.classList.toggle('hidden', v !== viewId);
  });
  document.querySelectorAll('.nav-link').forEach((link) => {
    link.classList.toggle('active', link.dataset.view === viewId);
  });
}

function navigate(path) {
  window.location.hash = path;
}

function handleRouteChange() {
  if (!state.loggedIn) return;
  const hash = window.location.hash.replace(/^#\/?/, '') || 'dashboard';
  const [view, ...params] = hash.split('/');
  switch (view) {
    case 'set':
      showView('set');
      if (params[0]) {
        if (dom.selector.value !== params[0]) {
          dom.selector.value = params[0];
        }
        if (!state.currentSet || state.currentSet.setId !== params[0]) {
          loadCurrentSet(false);
        }
      }
      break;
    case 'stats':
      showView('stats');
      renderStats();
      break;
    case 'search':
      showView('search');
      if (params[0]) {
        dom.searchInput.value = decodeURIComponent(params[0]);
        runSearch();
      } else {
        dom.searchInput.focus();
      }
      break;
    default:
      showView('dashboard');
      renderDashboard();
  }
}

// ══════════════════════════════════════════════════════════════════════════
// SPREADSHEET DIALOG
// ══════════════════════════════════════════════════════════════════════════
function extractSpreadsheetId(input) {
  if (!input) return null;
  const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(input.trim())) return input.trim();
  return null;
}

function openSpreadsheetDialog(required = false) {
  dom.dialogError.textContent = '';
  dom.dialogError.classList.add('hidden');
  dom.dialogInput.value = CONFIG.SPREADSHEET_ID || '';
  if (dom.dialogNewNameInput) dom.dialogNewNameInput.value = '';
  dom.btnDialogCancel.disabled = required;
  dom.btnDialogCancel.style.display = required ? 'none' : '';
  dom.dialog.showModal();
  refreshSpreadsheetList();
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
    source: sourceLabel
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
  dom.dialogExistingSelect.innerHTML = '<option value="">Bitte Tabelle auswählen…</option>';

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
    option.textContent = `${item.name} — ${item.source}`;
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
    dom.btnSpreadsheetRefresh && (dom.btnSpreadsheetRefresh.disabled = false);
  }
}

async function applySpreadsheetSelection(id) {
  if (!id) {
    setSpreadsheetDialogError('Bitte eine Tabelle auswählen oder ID/URL eingeben.');
    return;
  }

  const nextId = String(id).trim();
  const previousId = CONFIG.SPREADSHEET_ID;

  try {
    setSpreadsheetDialogError('Prüfe Tabellenzugriff…', false);
    await gapi.client.sheets.spreadsheets.get({
      spreadsheetId: nextId,
      fields: 'spreadsheetId,properties(title)'
    });

    CONFIG.SPREADSHEET_ID = nextId;
    updateSpreadsheetInfoBar();
    await loadSets();
    dom.dialog.close();
    setSpreadsheetDialogError('');
  } catch (err) {
    CONFIG.SPREADSHEET_ID = previousId;
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
    dom.btnSpreadsheetCreate && (dom.btnSpreadsheetCreate.disabled = true);
    setSpreadsheetDialogError('Neue Tabelle wird erstellt…', false);

    const response = await gapi.client.sheets.spreadsheets.create({
      properties: { title }
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
    dom.btnSpreadsheetCreate && (dom.btnSpreadsheetCreate.disabled = false);
  }
}

function updateSpreadsheetInfoBar() {
  const id = CONFIG.SPREADSHEET_ID;
  if (id) {
    dom.spreadsheetLink.href = `https://docs.google.com/spreadsheets/d/${id}/edit`;
    dom.spreadsheetLink.textContent = id.slice(0, 22) + '\u2026';
    dom.spreadsheetInfo.classList.remove('hidden');
  } else {
    dom.spreadsheetInfo.classList.add('hidden');
  }
}

function initSpreadsheetDialog() {
  dom.dialog?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !dom.btnDialogCancel.disabled) dom.dialog.close();
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

// ══════════════════════════════════════════════════════════════════════════
// SETS LADEN
// ══════════════════════════════════════════════════════════════════════════
async function loadSets() {
  setLoading(true, 'Lade Sets\u2026');
  try {
    const [importedSets, overviewSets] = await Promise.all([
      listImportedSets(),
      listSetsOverviewData().catch(() => [])
    ]);

    if (!Array.isArray(importedSets)) throw new Error('Ungültiges Sets-Format');
    state.sets = importedSets;

    const importedById = new Map(importedSets.map((set) => [set.setId, set]));
    const mergedMap = new Map();

    (overviewSets || []).forEach((set) => {
      if (!mergedMap.has(set.setId)) {
        mergedMap.set(set.setId, { ...set, imported: Boolean(set.imported) });
      }
    });

    importedSets.forEach((set) => {
      const current = mergedMap.get(set.setId) || {};
      mergedMap.set(set.setId, {
        ...current,
        ...set,
        // ptcgoCode nicht mit einem leeren Sheets-Wert überschreiben
        ptcgoCode: set.ptcgoCode || current.ptcgoCode || '',
        imported: true
      });
    });

    state.allSets = Array.from(mergedMap.values());
    resetDashboardVirtualization();
    renderRecentSets();

    dom.selector.innerHTML = '<option value="">Bitte w\u00e4hlen\u2026</option>';
    const seriesMap = buildSeriesMap(importedSets);
    seriesMap.forEach((setsArr, seriesName) => {
      const group = document.createElement('optgroup');
      group.label = seriesName;
      setsArr.forEach((set) => {
        const opt = document.createElement('option');
        opt.value = set.setId;
        opt.textContent = set.setName;
        group.appendChild(opt);
      });
      dom.selector.appendChild(group);
    });

    dom.selector.disabled = false;
    dom.load.disabled     = false;
    dom.refresh.disabled  = false;

    dom.dashSeriesFilter.innerHTML = '<option value="">Alle Serien</option>';
    buildSeriesMap(state.allSets).forEach((_, name) => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      dom.dashSeriesFilter.appendChild(opt);
    });

    renderSearchSetFilterOptions();

    const settings = await readSettings();
    if (settings.lastSetId) dom.selector.value = settings.lastSetId;

    setGlobalStatus(`${importedSets.length} von ${state.allSets.length} Sets geladen.`);
    dom.mainNav.classList.remove('hidden');

    if (!window.location.hash || window.location.hash === '#') {
      navigate('dashboard');
    } else {
      handleRouteChange();
    }
  } catch (err) {
    console.error('[loadSets]', err);
    showToast(`Fehler beim Laden der Sets: ${err.message}`, 'error');
    setGlobalStatus('Sets konnten nicht geladen werden.');
    state.sets = [];
    state.allSets = [];
    renderRecentSets();
  } finally {
    setLoading(false);
  }
}

function buildSeriesMap(sets) {
  const map = new Map();
  sets.forEach((set) => {
    const s = set.series || 'Andere';
    if (!map.has(s)) map.set(s, []);
    map.get(s).push(set);
  });
  return map;
}

// ══════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════════════════
async function renderDashboard() {
  dom.dashboardGrid.innerHTML = '<p class="loading-placeholder">Lade \u00dcbersicht\u2026</p>';
  try {
    const activeDashboardView = state.dashboardView || 'all';
    const density = state.dashboardDensity || 'comfortable';
    dom.viewDashboard?.classList.toggle('compact-dashboard', density === 'compact');
    dom.viewDashboard?.classList.toggle('logos-dashboard', density === 'logos');
    document.querySelectorAll('.dashboard-view-tab').forEach((button) => {
      const isActive = button.dataset.dashboardView === activeDashboardView;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-selected', String(isActive));
    });
    if (dom.btnDashboardCompact) {
      const densityLabel = density === 'comfortable' ? 'Komfort' : density === 'compact' ? 'Kompakt' : 'Nur Logos';
      dom.btnDashboardCompact.classList.toggle('active', density !== 'comfortable');
      dom.btnDashboardCompact.setAttribute('aria-pressed', String(density !== 'comfortable'));
      dom.btnDashboardCompact.textContent = densityLabel;
      dom.btnDashboardCompact.title = `Ansichtsdichte: ${densityLabel} (klicken zum Wechseln)`;
    }

    if (!state.summaryData) {
      state.summaryData = await readSummarySheet().catch(() => []);
    }
    const summaryByName = new Map();
    (state.summaryData || []).forEach((row) => summaryByName.set(row.setName, row));

    let sets = [...state.allSets];
    const filterText = dom.dashFilter.value.toLowerCase().trim();
    if (filterText) {
      sets = sets.filter(
        (s) =>
          s.setName.toLowerCase().includes(filterText) ||
          s.setId.toLowerCase().includes(filterText) ||
          (s.series || '').toLowerCase().includes(filterText),
      );
    }
    const seriesFilter = dom.dashSeriesFilter.value;
    if (seriesFilter) sets = sets.filter((s) => (s.series || 'Andere') === seriesFilter);

    if (activeDashboardView === 'imported') {
      sets = sets.filter((set) => Boolean(set.imported));
    } else if (activeDashboardView === 'not-imported') {
      sets = sets.filter((set) => !set.imported);
    } else if (activeDashboardView === 'favorites') {
      sets = sets.filter((set) => isFavorite(set.setId));
    }

    const quickFilters = state.quickFilters || {};
    const hasStatusQuickFilter = Boolean(
      quickFilters.completed || quickFilters.inProgress || quickFilters.notImported
    );

    if (quickFilters.favoritesOnly) {
      sets = sets.filter((set) => isFavorite(set.setId));
    }

    if (hasStatusQuickFilter) {
      sets = sets.filter((set) => {
        if (!set.imported) {
          return Boolean(quickFilters.notImported);
        }

        const summary = summaryByName.get(set.setName) || summaryByName.get(set.setId);
        const total = Number(summary?.total ?? set.totalCards ?? 0);
        const collected = Number(summary?.collected ?? 0);
        const isCompleted = total > 0 && collected >= total;
        const isInProgress = collected > 0 && !isCompleted;

        return (quickFilters.completed && isCompleted)
          || (quickFilters.inProgress && isInProgress)
          || (quickFilters.notImported && !set.imported);
      });
    }

    const sortBy = dom.dashSort.value;
    if (sortBy === 'name') {
      sets.sort((a, b) => a.setName.localeCompare(b.setName));
    } else if (sortBy === 'completion') {
      sets.sort((a, b) => {
        const sa = summaryByName.get(a.setName);
        const sb = summaryByName.get(b.setName);
        const pa = sa && sa.total > 0 ? sa.collected / sa.total : 0;
        const pb = sb && sb.total > 0 ? sb.collected / sb.total : 0;
        return pb - pa;
      });
    }

    if (!sets.length) {
      dom.dashboardGrid.innerHTML = '<p class="empty-state">Keine Sets gefunden.</p>';
      return;
    }

    dom.dashboardGrid.innerHTML = '';

    const shouldVirtualize = sets.length > DASHBOARD_VIRTUAL_THRESHOLD;
    const visibleCount = shouldVirtualize
      ? Math.min(sets.length, Math.max(DASHBOARD_VIRTUAL_PAGE_SIZE, state.dashboardVirtualCount || DASHBOARD_VIRTUAL_PAGE_SIZE))
      : sets.length;
    const visibleSets = shouldVirtualize ? sets.slice(0, visibleCount) : sets;

    if (sortBy === 'series-date') {
      const seriesMap = buildSeriesMap(visibleSets);
      seriesMap.forEach((setsArr, seriesName) => {
        const section = document.createElement('section');
        section.className = 'dash-series-group';
        const h3 = document.createElement('h3');
        h3.textContent = seriesName;
        section.appendChild(h3);
        const grid = document.createElement('div');
        grid.className = 'dash-sets-row';
        setsArr.forEach((set) => {
          const summary = summaryByName.get(set.setName) || summaryByName.get(set.setId);
          grid.appendChild(createDashSetCard(set, summary));
        });
        section.appendChild(grid);
        dom.dashboardGrid.appendChild(section);
      });
    } else {
      const grid = document.createElement('div');
      grid.className = 'dash-sets-row';
      visibleSets.forEach((set) => {
        const summary = summaryByName.get(set.setName) || summaryByName.get(set.setId);
        grid.appendChild(createDashSetCard(set, summary));
      });
      dom.dashboardGrid.appendChild(grid);
    }

    if (shouldVirtualize) {
      dom.dashboardGrid.appendChild(createDashboardVirtualFooter(sets.length, visibleSets.length));
    }

  } catch (err) {
    console.error('[renderDashboard]', err);
    dom.dashboardGrid.innerHTML = `<p class="empty-state">\u2715 Fehler beim Laden der \u00dcbersicht</p>`;
    showToast(`Dashboard: ${err.message}`, 'error');
  }
}

function createDashSetCard(set, summary) {
  const card = document.createElement('div');
  card.className = 'dash-set-card';
  card.classList.toggle('not-imported', !set.imported);
  const total     = summary?.total     ?? 0;
  const collected = summary?.collected ?? 0;
  const rh        = summary?.rh        ?? 0;
  const percent   = total > 0 ? Math.round((collected / total) * 100) : 0;
  if (percent >= 100 && total > 0) card.classList.add('complete');
  else if (percent > 0)            card.classList.add('in-progress');

  card.innerHTML = `
    <div class="dash-set-logo-wrap">
      ${set.logoUrl
        ? `<img src="${set.logoUrl}" alt="${set.setName}" class="dash-set-logo" onerror="this.style.display='none'" loading="lazy"/>`
        : `<span class="dash-set-name-fallback">${set.setName}</span>`}
    </div>
    <div class="dash-set-info">
      <p class="dash-set-name">${set.setName}</p>
      <p class="dash-set-series">${set.series || ''}</p>
      <div class="dash-progress-bar"><div class="dash-progress-fill" style="width:${set.imported ? percent : 0}%"></div></div>
      <p class="dash-progress-text">${set.imported ? `${collected}\u202f/\u202f${total || '?'} (${percent}%)` : `Noch nicht importiert (${set.totalCards || '?' } Karten)`}</p>
      ${rh > 0 ? `<p class="dash-rh-text">RH: ${rh}</p>` : ''}
      <div class="dash-card-actions">
        ${set.imported 
          ? `<button class="btn-secondary dash-view-btn" type="button" title="Ansehen">👁️</button>
             <button class="btn-secondary dash-favorite-btn" type="button" title="Favorit">${isFavorite(set.setId) ? '⭐' : '☆'}</button>
             <button class="btn-secondary dash-delete-btn" type="button" title="Löschen">🗑️</button>`
          : `<button class="btn-primary dash-import-btn" type="button">➕ Importieren</button>`}
      </div>
    </div>`;

  const importButton = card.querySelector('.dash-import-btn');
  if (importButton) {
    importButton.addEventListener('click', async (event) => {
      event.stopPropagation();
      await importSetFromOverview(set);
    });
  }

  const viewButton = card.querySelector('.dash-view-btn');
  if (viewButton) {
    viewButton.addEventListener('click', (event) => {
      event.stopPropagation();
      dom.selector.value = set.setId;
      navigate(`set/${set.setId}`);
    });
  }

  const deleteButton = card.querySelector('.dash-delete-btn');
  if (deleteButton) {
    deleteButton.addEventListener('click', async (event) => {
      event.stopPropagation();
      await deleteSetFromCollection(set);
    });
  }

  const favoriteButton = card.querySelector('.dash-favorite-btn');
  if (favoriteButton) {
    favoriteButton.addEventListener('click', async (event) => {
      event.stopPropagation();
      const isFav = toggleFavorite(set.setId);
      favoriteButton.textContent = isFav ? '⭐' : '☆';
      showToast(isFav ? `${set.setName} zu Favoriten hinzugefügt` : `${set.setName} aus Favoriten entfernt`, 'success', 2000);
    });
  }

  card.addEventListener('click', () => {
    if (!set.imported) return;
    dom.selector.value = set.setId;
    navigate(`set/${set.setId}`);
  });
  return card;
}

async function importSetFromOverview(set) {
  if (!set?.setId) return;
  if (set.imported) {
    dom.selector.value = set.setId;
    navigate(`set/${set.setId}`);
    return;
  }

  setLoading(true, `Importiere ${set.setName}…`);
  setGlobalStatus(`Importiere ${set.setName}…`);
  try {
    const cards = await fetchMergedCards(set.setId);
    await importSetIntoCollection(set, cards);
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
    console.error('[importSetFromOverview]', err);
    const reason = getErrorMessage(err);
    showToast(`Import fehlgeschlagen: ${reason}`, 'error', 5000);
    setGlobalStatus(`Import fehlgeschlagen: ${set.setName}`);
  } finally {
    setLoading(false);
  }
}

async function deleteSetFromCollection(set) {
  if (!set?.setId || !set.imported) {
    showToast('Set kann nicht gelöscht werden.', 'error', 3000);
    return;
  }

  const confirmMsg = `${set.setName} wirklich aus deiner Sammlung löschen? Diese Aktion kann nicht rückgängig gemacht werden.`;
  if (!window.confirm(confirmMsg)) {
    return;
  }

  setLoading(true, `Lösche ${set.setName}…`);
  setGlobalStatus(`Lösche ${set.setName}…`);
  
  try {
    // Auto-Snapshot vor dem Löschen erstellen
    try {
      const currentCollection = state.collection || {};
      const action = `Delete Set: ${set.setName}`;
      await createAutoSnapshot(action, currentCollection);
    } catch (err) {
      console.warn('⚠️ Auto-snapshot vor Löschung fehlgeschlagen:', err);
    }

    // Entferne das Set aus der Sammlung
    const range = await readSetCollectionMap(set.setName).catch(() => new Map());
    if (range && range.size > 0) {
      // Lösche alle Zellen des Sets (setze auf FALSE)
      for (const [cardNum] of range) {
        await updateCellBoolean(set.setName, cardNum, false, false);
      }
    }

    cache.del(`cards_${set.setId}`);
    cache.del(`db_${set.setId}`);
    state.summaryData = null;

    // Aktualisiere die Ansicht
    await loadSets();
    await renderDashboard();
    
    showToast(`${set.setName} wurde gelöscht.`, 'success', 3000);
    setGlobalStatus(`${set.setName} wurde gelöscht.`);
  } catch (err) {
    console.error('[deleteSetFromCollection]', err);
    showToast(`Löschen fehlgeschlagen: ${err.message}`, 'error', 5000);
    setGlobalStatus(`Fehler beim Löschen: ${set.setName}`);
  } finally {
    setLoading(false);
  }
}

function getSetById(setId) {
  return state.allSets.find((set) => set.setId === setId) || state.sets.find((set) => set.setId === setId) || null;
}

async function importSetsSequential(sets, options = {}) {
  const { successMessage = 'Import abgeschlossen.' } = options;
  const validSets = (sets || []).filter((set) => set?.setId && set?.setName);
  if (!validSets.length) {
    showToast('Keine passenden Sets gefunden.', 'info');
    return;
  }

  // Auto-Snapshot vor dem Import erstellen
  try {
    const currentCollection = state.collection || {};
    const snapshotCount = (loadSnapshots() || []).length;
    const action = `Import: ${validSets.map(s => s.setName).join(', ')}${snapshotCount > 15 ? ' (oldest will be removed)' : ''}`;
    await createAutoSnapshot(action, currentCollection);
    console.log('✅ Auto-snapshot vor Import erstellt');
  } catch (err) {
    console.warn('⚠️ Auto-snapshot vor Import fehlgeschlagen:', err);
    // Fehler blockiert nicht den Import
  }

  let done = 0;
  let failed = 0;
  const job = startJob('Import', validSets.length);
  setLoading(true, 'Import läuft…');
  try {
    for (let index = 0; index < validSets.length; index++) {
      assertJobNotCancelled(job);
      const set = validSets[index];
      setGlobalStatus(`Importiere ${index + 1}/${validSets.length}: ${set.setName}`);
      updateJob(job, index, `Importiere ${index + 1}/${validSets.length}: ${set.setName}`);
      try {
        const cards = await fetchMergedCards(set.setId);
        await importSetIntoCollection(set, cards);
        cache.del(`cards_${set.setId}`);
        cache.del(`db_${set.setId}`);
        done++;
      } catch (err) {
        console.warn('[importSetsSequential] import failed for', set.setId, err);
        failed++;
      }
    }
    updateJob(job, validSets.length, `Import abgeschlossen: ${done} erfolgreich, ${failed} Fehler`);
    finishJob(job, `Import abgeschlossen (${done}/${validSets.length})`, failed > 0);
  } catch (err) {
    finishJob(job, getErrorMessage(err, 'Import abgebrochen'), true);
    throw err;
  } finally {
    setLoading(false);
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
  setLoading(true, 'Synchronisiere Overview…');
  try {
    const apiSets = await fetchAllAvailableSets();
    const importedIds = new Set(state.sets.map((set) => set.setId));
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
  setLoading(true, 'Power-Refresh läuft…');
  
  // Auto-Snapshot vor dem Power-Refresh erstellen
  try {
    const currentCollection = state.collection || {};
    const action = `Power-Refresh: Sets Overview aktualisiert`;
    await createAutoSnapshot(action, currentCollection);
    console.log('✅ Auto-snapshot vor Power-Refresh erstellt');
  } catch (err) {
    console.warn('⚠️ Auto-snapshot vor Power-Refresh fehlgeschlagen:', err);
    // Fehler blockiert nicht den Refresh
  }

  try {
    const [oldOverviewSets, apiSets] = await Promise.all([
      listSetsOverviewData().catch(() => []),
      fetchAllAvailableSets()
    ]);

    const report = summarizeOverviewChanges(oldOverviewSets, apiSets);
    const importedIds = new Set(state.sets.map((set) => set.setId));
    await syncOverviewWithApiSets(apiSets, importedIds);
    await loadSets();

    const msg = `Power-Refresh: +${report.added} neu, ${report.changed} geändert, ${report.unchanged} unverändert.`;
    setGlobalStatus(msg);
    showToast(msg, 'success', 5000);

    if (report.changedSets.length) {
      console.group('[PowerRefresh] geänderte Sets');
      report.changedSets.slice(0, 50).forEach((entry) => {
        console.log(`${entry.setId} (${entry.setName}): ${entry.changedFields.join(', ')}`);
      });
      if (report.changedSets.length > 50) {
        console.log(`…und ${report.changedSets.length - 50} weitere`);
      }
      console.groupEnd();
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
  dom.batchInfo.textContent = `${selected} Set${selected === 1 ? '' : 's'} ausgewählt`;
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
    title.textContent = `${set.setId} — ${set.setName}`;

    const sub = document.createElement('span');
    sub.className = 'batch-item-sub';
    sub.textContent = `${set.series || 'Serie unbekannt'} • ${set.totalCards || '?'} Karten`;

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
      const setId = label.split(' — ')[0] || '';
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
      showToast('Bitte mindestens ein Set auswählen.', 'info');
      return;
    }
    dom.batchDialog.close();
    const targetSets = selectedIds.map((id) => getSetById(id)).filter(Boolean);
    await importSetsSequential(targetSets, { successMessage: '{count} Sets per Batch importiert.' });
  });
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
  const rows = state.summaryData && Array.isArray(state.summaryData)
    ? state.summaryData
    : await readSummarySheet().catch(() => []);
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
  if (!state.sets.length) {
    showToast('Keine importierten Sets für Backup vorhanden.', 'info');
    return;
  }

  setLoading(true, 'Erstelle Backup…');
  try {
    const backupSets = [];
    for (let index = 0; index < state.sets.length; index++) {
      const set = state.sets[index];
      setGlobalStatus(`Backup ${index + 1}/${state.sets.length}: ${set.setName}`);
      const dbMap = await readSetCollectionMap(set.setName).catch(() => new Map());
      const cards = [];
      for (const [cardId, db] of dbMap.entries()) {
        if (!db?.g && !db?.rh) continue;
        cards.push({ cardId, g: Boolean(db?.g), rh: Boolean(db?.rh) });
      }
      backupSets.push({ setId: set.setId, setName: set.setName, cards });
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const payload = {
      app: 'poke-tcg-try4',
      version: 1,
      createdAt: new Date().toISOString(),
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      sets: backupSets
    };
    downloadJson(`poke_collection_backup_${stamp}.json`, payload);
    showToast(`Backup exportiert (${backupSets.length} Sets).`, 'success', 4000);
  } catch (err) {
    console.error('[exportCollectionBackup]', err);
    showToast(`Backup-Export fehlgeschlagen: ${err.message}`, 'error', 5000);
  } finally {
    setLoading(false);
  }
}

async function runDataHealthCheck({ autoFix = false } = {}) {
  if (!state.sets.length) {
    showToast('Keine importierten Sets für Datencheck.', 'info');
    return;
  }

  setLoading(true, 'Datencheck läuft…');
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
          readSetCollectionMap(set.setName)
        ]);

        const apiCount = Array.isArray(apiCards) ? apiCards.length : 0;
        const sheetCount = sheetMap instanceof Map ? sheetMap.size : 0;
        if (apiCount !== sheetCount) {
          mismatchSets.push(set);
          report.mismatches.push({
            setId: set.setId,
            setName: set.setName,
            apiCount,
            sheetCount,
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
    showToast(`Datencheck ok: ${report.checkedSets} Sets geprüft, keine Abweichungen.`, 'success', 4500);
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
    console.log('✅ Auto-snapshot vor Auto-Fix erstellt');
  } catch (err) {
    console.warn('⚠️ Auto-snapshot vor Auto-Fix fehlgeschlagen:', err);
    // Fehler blockiert nicht das Auto-Fix
  }

  const uniqueSets = Array.from(new Map(mismatchSets.map((set) => [set.setId, set])).values());
  await importSetsSequential(uniqueSets, { successMessage: '{count} Mismatch-Set(s) automatisch repariert.' });
  finishJob(job, `Auto-Fix ausgeführt (${uniqueSets.length} Sets)`, false);
}

async function runPokecodeParityTest({ skipPrompt = false, maxSets: presetMaxSets = null } = {}) {
  let maxSets = 10;
  if (Number.isFinite(presetMaxSets) && presetMaxSets > 0) {
    maxSets = Math.min(Number(presetMaxSets), 50);
  } else if (!skipPrompt) {
    const input = window.prompt('Wie viele Sets sollen geprüft werden? (Standard: 10)', '10');
    const parsed = Number.parseInt(String(input || '10'), 10);
    maxSets = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 50) : 10;
  }

  setLoading(true, 'Pokecode-Parity-Test läuft…');
  setGlobalStatus(`Parity-Test läuft (max. ${maxSets} Sets)…`);
  const job = startJob('Pokecode-Parity-Test', maxSets);

  try {
    const report = await runPokecodeParityCheck({ maxSets });
    updateJob(job, report.checkedSetCount || 0, `Parity-Test beendet: ${report.ok ? 'OK' : 'Abweichungen gefunden'}`);
    finishJob(job, report.ok ? 'Parity-Test erfolgreich' : 'Parity-Test mit Abweichungen', !report.ok);

    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    downloadJson(`poke_parity_report_${stamp}.json`, report);

    if (report.ok) {
      showToast(`Parity-Test OK (${report.checkedSetCount} Sets, keine Abweichungen). Report exportiert.`, 'success', 5000);
    } else {
      showToast(`Parity-Test fertig: ${report.overviewMismatches.length} Overview- und ${report.cardMismatches.length} Karten-Abweichungen. Report exportiert.`, 'error', 7000);
      console.group('[ParityTest] Abweichungen');
      if (report.overviewMismatches.length) console.table(report.overviewMismatches);
      if (report.cardMismatches.length) console.table(report.cardMismatches);
      console.groupEnd();
    }
  } catch (err) {
    finishJob(job, err?.message || 'Parity-Test fehlgeschlagen', true);
    throw err;
  } finally {
    setLoading(false);
  }
}

function parseBackupPayload(rawText) {
  const parsed = JSON.parse(rawText);
  if (!parsed || typeof parsed !== 'object') throw new Error('Ungültiges Backup-Format.');
  if (!Array.isArray(parsed.sets)) throw new Error('Backup enthält keine Set-Daten.');
  return parsed;
}

async function applyCollectionBackup(payload) {
  const sets = payload.sets || [];
  if (!sets.length) {
    showToast('Backup enthält keine Sets.', 'info');
    return;
  }

  const byId = new Map(state.sets.map((set) => [set.setId, set]));
  let updated = 0;
  let skipped = 0;

  setLoading(true, 'Spiele Backup ein…');
  try {
    for (let setIndex = 0; setIndex < sets.length; setIndex++) {
      const backupSet = sets[setIndex];
      const liveSet = byId.get(backupSet.setId);
      if (!liveSet) {
        skipped++;
        continue;
      }

      setGlobalStatus(`Backup ${setIndex + 1}/${sets.length}: ${liveSet.setName}`);
      const liveMap = await readSetCollectionMap(liveSet.setName).catch(() => new Map());
      const snapshotByCard = new Map((backupSet.cards || []).map((entry) => [normalizeCardNumber(entry.cardId), entry]));

      for (const [cardId, db] of liveMap.entries()) {
        if (!db?.gCell || !db?.rhCell) continue;
        const target = snapshotByCard.get(cardId) || { g: false, rh: false };
        const targetG = Boolean(target.g);
        const targetRh = Boolean(target.g && target.rh);

        if (Boolean(db.g) !== targetG) {
          await updateCellBoolean(liveSet.setName, db.gCell.row, db.gCell.col, targetG);
          db.g = targetG;
          updated++;
        }
        if (Boolean(db.rh) !== targetRh) {
          await updateCellBoolean(liveSet.setName, db.rhCell.row, db.rhCell.col, targetRh);
          db.rh = targetRh;
          updated++;
        }
      }
    }
  } finally {
    setLoading(false);
  }

  state.summaryData = null;
  if (state.currentSet) {
    await loadCurrentSet(true).catch(() => {});
  }
  showToast(`Backup eingespielt. Änderungen: ${updated}, übersprungen: ${skipped}.`, skipped ? 'info' : 'success', 5000);
}

function initBackupImportExport() {
  dom.btnExportBackup?.addEventListener('click', exportCollectionBackup);
  dom.btnImportBackup?.addEventListener('click', () => dom.backupFileInput?.click());

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
}

async function reimportCurrentSetFromApi() {
  if (!state.currentSet) {
    showToast('Kein aktuelles Set geladen.', 'info');
    return;
  }
  const set = getSetById(state.currentSet.setId) || state.currentSet;
  const ok = window.confirm(`Set „${set.setName}“ neu importieren? Vorhandene Sammel-Checks bleiben erhalten.`);
  if (!ok) return;

  await importSetsSequential([set], { successMessage: 'Set erfolgreich reimportiert.' });
  dom.selector.value = set.setId;
  navigate(`set/${set.setId}`);
  await loadCurrentSet(true);
}

function initDashboardControls() {
  let debounce;
  dom.dashFilter.addEventListener('input', () => {
    resetDashboardVirtualization();
    clearTimeout(debounce);
    debounce = setTimeout(renderDashboard, 200);
  });
  dom.dashSeriesFilter.addEventListener('change', () => {
    resetDashboardVirtualization();
    renderDashboard();
  });
  dom.dashSort.addEventListener('change', () => {
    resetDashboardVirtualization();
    renderDashboard();
  });
  document.querySelectorAll('.dashboard-view-tab').forEach((button) => {
    if (!button.dataset.dashboardView) return;
    button.addEventListener('click', () => {
      const view = button.dataset.dashboardView || 'all';
      if (state.dashboardView === view) return;
      state.dashboardView = view;
      resetDashboardVirtualization();
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
  dom.btnOverviewSync?.addEventListener('click', syncOverviewFromApi);
  dom.btnOverviewPowerRefresh?.addEventListener('click', powerRefreshOverviewFromApi);
  dom.btnImportBatch?.addEventListener('click', openBatchImportDialog);
  dom.btnImportAll?.addEventListener('click', importAllMissingSets);
  dom.btnReimportCurrent?.addEventListener('click', reimportCurrentSetFromApi);
  dom.btnReimportAllImported?.addEventListener('click', reimportAllImportedSets);
  dom.btnExportSummaryCsv?.addEventListener('click', exportCollectionSummaryCsv);
  dom.btnDataHealthCheck?.addEventListener('click', () => runDataHealthCheck({ autoFix: false }));
  dom.btnDataHealthAutofix?.addEventListener('click', () => runDataHealthCheck({ autoFix: true }));
  dom.btnParityCheck?.addEventListener('click', () => runPokecodeParityTest().catch((err) => {
    console.error('[runPokecodeParityTest]', err);
    showToast(`Parity-Test fehlgeschlagen: ${err.message}`, 'error', 6000);
  }));
  dom.btnQueueAutofixRefresh?.addEventListener('click', () => {
    enqueueAction('Datencheck + Auto-Fix', () => runDataHealthCheck({ autoFix: true }));
    enqueueAction('Power-Refresh Overview', () => powerRefreshOverviewFromApi());
    showToast('Queue-Preset hinzugefügt (Auto-Fix → Refresh).', 'info', 3000);
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
    if (dom.jobStatusText) dom.jobStatusText.textContent = 'Abbruch angefordert…';
  });

  updateQueueUiState();
}

// ══════════════════════════════════════════════════════════════════════════
// STATISTIKEN
// ══════════════════════════════════════════════════════════════════════════
async function renderStats() {
  dom.statsContent.innerHTML = '<p class="loading-placeholder">Lade Statistiken\u2026</p>';
  try {
    if (!state.summaryData) {
      state.summaryData = await readSummarySheet().catch((err) => {
        console.warn('[renderStats] readSummarySheet error:', err.message);
        return [];
      });
    }
    const data = Array.isArray(state.summaryData) ? state.summaryData : [];

    let totalCards = 0, totalCollected = 0, totalRh = 0, completedSets = 0;
    data.forEach((row) => {
      totalCards     += row.total     || 0;
      totalCollected += row.collected || 0;
      totalRh        += row.rh        || 0;
      if ((row.collected || 0) >= (row.total || 1) && row.total > 0) completedSets++;
    });
    const overallPct = totalCards > 0 ? Math.round((totalCollected / totalCards) * 100) : 0;

    // Serien-Breakdown
    const seriesMap = new Map();
    state.sets.forEach((set) => {
      const row    = data.find((r) => r.setName === set.setName);
      const series = set.series || 'Andere';
      if (!seriesMap.has(series)) seriesMap.set(series, { total: 0, collected: 0, rh: 0, count: 0, completed: 0 });
      const sg = seriesMap.get(series);
      sg.total     += row?.total     || 0;
      sg.collected += row?.collected || 0;
      sg.rh        += row?.rh        || 0;
      sg.count++;
      if ((row?.collected || 0) >= (row?.total || 1) && row?.total > 0) sg.completed++;
    });

    const sorted      = [...data].filter((r) => r.total > 0).sort((a, b) => (b.collected / b.total) - (a.collected / a.total));
    const top5Done    = sorted.slice(0, 5);
    const top5Missing = [...data].filter((r) => r.total > 0 && (r.collected || 0) < r.total)
      .sort((a, b) => (b.total - b.collected) - (a.total - a.collected)).slice(0, 5);

    dom.statsContent.innerHTML = `
      <div class="stats-overview-cards">
        <div class="stat-card"><span class="stat-card-value">${totalCards.toLocaleString('de-DE')}</span><span class="stat-card-label">Karten gesamt</span></div>
        <div class="stat-card collected"><span class="stat-card-value">${totalCollected.toLocaleString('de-DE')}</span><span class="stat-card-label">Normal gesammelt</span></div>
        <div class="stat-card reverse"><span class="stat-card-value">${totalRh.toLocaleString('de-DE')}</span><span class="stat-card-label">Reverse Holos</span></div>
        <div class="stat-card"><span class="stat-card-value">${overallPct}%</span><span class="stat-card-label">Gesamtfortschritt</span></div>
        <div class="stat-card success"><span class="stat-card-value">${completedSets}</span><span class="stat-card-label">Vollst\u00e4ndige Sets</span></div>
        <div class="stat-card"><span class="stat-card-value">${data.length}</span><span class="stat-card-label">Importierte Sets</span></div>
      </div>
      <div class="stats-progress-bar-full"><div class="dash-progress-fill" style="width:${overallPct}%;height:16px;border-radius:8px;"></div></div>
      <p style="text-align:center;color:var(--color-muted);margin:4px 0 28px">${totalCollected.toLocaleString('de-DE')} / ${totalCards.toLocaleString('de-DE')} Karten (${overallPct}%)</p>
      <h3>Serien-\u00dcbersicht</h3>
      <div class="stats-series-table">
        ${Array.from(seriesMap.entries()).map(([name, sg]) => {
          const pct = sg.total > 0 ? Math.round((sg.collected / sg.total) * 100) : 0;
          return `<div class="stats-series-row">
            <div class="stats-series-name">${name}</div>
            <div class="stats-series-bar"><div class="dash-progress-fill" style="width:${pct}%"></div></div>
            <div class="stats-series-numbers">${sg.collected}/${sg.total} (${pct}%) &bull; ${sg.completed}/${sg.count} Sets</div>
          </div>`;
        }).join('')}
      </div>
      <div class="stats-two-col">
        <div>
          <h3>Top 5: Vollst\u00e4ndigste Sets</h3>
          <ol class="stats-top-list">
            ${top5Done.map((r) => `<li><strong>${r.setName}</strong> \u2013 ${r.collected}/${r.total} (${Math.round((r.collected/r.total)*100)}%)</li>`).join('')}
          </ol>
        </div>
        <div>
          <h3>Top 5: Meiste fehlende Karten</h3>
          <ol class="stats-top-list">
            ${top5Missing.map((r) => `<li><strong>${r.setName}</strong> \u2013 ${r.total - r.collected} fehlend</li>`).join('')}
          </ol>
        </div>
      </div>`;
  } catch (err) {
    console.error('[renderStats]', err);
    dom.statsContent.innerHTML = `<p class="empty-state">\u2715 Fehler beim Laden der Statistiken</p>`;
  }
}

// ══════════════════════════════════════════════════════════════════════════
// SUCHE (cross-set)
// ══════════════════════════════════════════════════════════════════════════
const SEARCH_NOISE_TOKENS = new Set([
  'karte', 'karten', 'kartennummer', 'kartennr', 'nummer', 'nr', 'no', 'num',
  'pokemon', 'pokemontcg', 'tcg', 'set', 'im', 'in', 'von', 'die', 'der', 'das'
]);

function sanitizeSearchToken(token) {
  return normalizeSearchText(token).replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
}

function extractMeaningfulNameTokens(tokens = []) {
  return tokens
    .map((token) => sanitizeSearchToken(token))
    .filter((token) => token && token.length >= 2)
    .filter((token) => !SEARCH_NOISE_TOKENS.has(token));
}

function parseStructuredSearchQuery(rawQuery, availableSets = []) {
  const trimmedQuery = String(rawQuery || '').trim();
  if (!trimmedQuery) return null;

  const normalizedQuery = trimmedQuery.replace(/^\(+|\)+$/g, '').trim();
  if (!normalizedQuery) return null;

  const parts = normalizedQuery.split(/\s+/).filter(Boolean);
  if (!parts.length) return null;

  const requestedCode = parts[0].toLowerCase();
  const matchingSet = availableSets.find((set) =>
    (set?.ptcgoCode && String(set.ptcgoCode).toLowerCase() === requestedCode) ||
    String(set?.setId || '').toLowerCase() === requestedCode
  );
  if (!matchingSet) return null;

  // Remaining tokens after set code: separate number from name tokens
  const remaining = parts.slice(1);
  let cardNumber = '';
  const nameTokens = [];
  for (const part of remaining) {
    const token = sanitizeSearchToken(part);
    if (!token) continue;
    if (!cardNumber && /^[a-z._-]*\d+[a-z._-]*$/.test(token)) {
      cardNumber = normalizeCardNumberForSearch(token);
    } else {
      nameTokens.push(token);
    }
  }
  const meaningfulNameTokens = extractMeaningfulNameTokens(nameTokens);
  return {
    set: matchingSet,
    setId: String(matchingSet.setId),
    cardNumber,
    namePart: meaningfulNameTokens.length ? meaningfulNameTokens : null
  };
}

/**
 * Erkennt freie Kombinationen aus Kartennummer + Namenstokens, z.B. "57 Digda" oder "Digda 57".
 * Gibt null zurück, wenn kein sinnvolles gemischtes Muster erkannt wird.
 */
function parseMixedQuery(rawQuery) {
  const normalized = normalizeSearchText(rawQuery).trim();
  if (!normalized) return null;

  const parts = normalized
    .split(/\s+/)
    .map((part) => sanitizeSearchToken(part))
    .filter(Boolean);
  if (parts.length < 2) return null;

  // Tokens die wie eine Kartennummer aussehen: optionale alpha-Präfix + Zahlen + optionales Suffix
  const numberTokens = parts.filter((p) => /^[a-z._-]*\d+[a-z._-]*$/.test(p));
  const nameTokensRaw = parts.filter((p) => !/^[a-z._-]*\d+[a-z._-]*$/.test(p));
  const nameTokens = extractMeaningfulNameTokens(nameTokensRaw);

  // Nur sinnvoll wenn mindestens ein Namentoken UND genau ein Nummerntoken vorhanden ist
  if (!nameTokens.length || !numberTokens.length) return null;

  return {
    cardNumber: normalizeCardNumberForSearch(numberTokens[0]),
    nameTokens
  };
}

function normalizeSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeCardNumberForSearch(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  const withoutTotal = raw.split('/')[0];
  return normalizeCardNumber(withoutTotal).toLowerCase();
}

function cardNumberMatchesQuery(cardNumber, queryNumber) {
  const normalizedCard = normalizeCardNumberForSearch(cardNumber);
  const normalizedQuery = normalizeCardNumberForSearch(queryNumber);
  if (!normalizedCard || !normalizedQuery) return false;
  if (normalizedCard === normalizedQuery) return true;

  const cardDigits = (normalizedCard.match(/\d+/) || [''])[0];
  const queryDigits = (normalizedQuery.match(/\d+/) || [''])[0];
  return Boolean(queryDigits && cardDigits === queryDigits);
}

function computeSearchScore(card, normalizedQuery, structuredQuery, mixedQuery) {
  const name = normalizeSearchText(card.name || '');
  const numberRaw = String(card.number || '').toLowerCase();
  const number = normalizeCardNumberForSearch(card.number);

  if (structuredQuery) {
    const numberMatch = !structuredQuery.cardNumber || cardNumberMatchesQuery(card.number, structuredQuery.cardNumber);
    const nameMatch = !structuredQuery.namePart || structuredQuery.namePart.every((token) => name.includes(token));
    if (!numberMatch || !nameMatch) return -1;

    let score = 1000;
    if (structuredQuery.cardNumber) score += 250;
    if (structuredQuery.namePart?.length) {
      score += structuredQuery.namePart.length * 40;
      score += 80;
    }
    return score;
  }

  if (mixedQuery) {
    const numberMatch = cardNumberMatchesQuery(card.number, mixedQuery.cardNumber);
    const nameMatch = mixedQuery.nameTokens.every((token) => name.includes(token));
    if (!numberMatch || !nameMatch) return -1;

    return 900 + (mixedQuery.nameTokens.length * 45) + 200;
  }

  const normalizedFreeQuery = normalizeSearchText(normalizedQuery).trim();
  const queryTokens = normalizedFreeQuery
    .split(/\s+/)
    .map((token) => sanitizeSearchToken(token))
    .filter(Boolean);
  const meaningfulTokens = extractMeaningfulNameTokens(queryTokens);

  if (!queryTokens.length) return -1;

  let isMatch = false;
  let nameContains = false;
  let numberContains = false;

  if (queryTokens.length === 1) {
    const token = queryTokens[0];
    nameContains = name.includes(token);
    numberContains = number.includes(token) || numberRaw.includes(token);
    isMatch = nameContains || numberContains;
  } else {
    const numberLikeTokens = queryTokens.filter((token) => /^[a-z._-]*\d+[a-z._-]*$/.test(token));
    const nameLikeTokens = meaningfulTokens;

    if (numberLikeTokens.length && nameLikeTokens.length) {
      numberContains = numberLikeTokens.every((token) => cardNumberMatchesQuery(card.number, token));
      nameContains = nameLikeTokens.every((token) => name.includes(token));
      isMatch = numberContains && nameContains;
    } else if (nameLikeTokens.length) {
      nameContains = nameLikeTokens.every((token) => name.includes(token));
      isMatch = nameContains;
    } else if (numberLikeTokens.length) {
      numberContains = numberLikeTokens.every((token) => cardNumberMatchesQuery(card.number, token));
      isMatch = numberContains;
    }
  }

  if (!isMatch) return -1;

  let score = 0;
  if (nameContains) score += 140;
  if (numberContains) score += 120;
  if (nameContains && numberContains) score += 180;
  if (queryTokens.length > 1 && meaningfulTokens.length && meaningfulTokens.every((token) => name.includes(token))) score += 70;

  return score;
}

function matchesCardSearch(card, normalizedQuery, structuredQuery, mixedQuery) {
  return computeSearchScore(card, normalizedQuery, structuredQuery, mixedQuery) >= 0;
}

function mergeSearchCards(dbCards = [], apiCards = []) {
  const byNumber = new Map();
  (Array.isArray(dbCards) ? dbCards : []).forEach((entry) => {
    const cardNumberKey = normalizeCardNumber(entry?.number || '');
    if (!cardNumberKey) return;
    byNumber.set(cardNumberKey, { ...entry, __searchApiOnly: false });
  });
  (Array.isArray(apiCards) ? apiCards : []).forEach((entry) => {
    const cardNumberKey = normalizeCardNumber(entry?.number || '');
    if (!cardNumberKey) return;
    const existing = byNumber.get(cardNumberKey);
    if (existing) {
      byNumber.set(cardNumberKey, { ...existing, ...entry, __searchApiOnly: false });
    } else {
      byNumber.set(cardNumberKey, { ...entry, __searchApiOnly: true });
    }
  });
  return Array.from(byNumber.values());
}

async function runSearch(options = {}) {
  const { force = false } = options;
  const runId = ++state.searchRunId;
  const isStale = () => runId !== state.searchRunId;
  if (state.searchAbortController) {
    state.searchAbortController.abort();
  }
  const abortController = new AbortController();
  state.searchAbortController = abortController;
  const isAborted = () => abortController.signal.aborted;

  const rawQuery = dom.searchInput.value.trim();
  const query = normalizeSearchText(rawQuery);
  const searchScopeMode = getSearchScopeMode();
  if (!query) {
    dom.searchResults.innerHTML = '<p class="empty-state">Suchbegriff eingeben.</p>';
    return;
  }
  const setFilter = dom.searchSetFilter.value;
  const availableSetsForSearch = getSetsForSearchMode(searchScopeMode);
  const baseSetsToSearch = setFilter
    ? availableSetsForSearch.filter((s) => s.setId === setFilter)
    : availableSetsForSearch;
  // Für ptcgoCode-Lookup state.allSets nutzen (hat zuverlässige Daten aus den JSON-Dateien),
  // da state.sets (aus Google Sheets) ptcgoCode leer haben kann.
  const lookupPool = state.allSets?.length ? state.allSets : baseSetsToSearch;
  const structuredQuery = parseStructuredSearchQuery(rawQuery, lookupPool);
  // Freie Kombinations-Suche (z.B. "57 Digda") nur wenn kein Set-Präfix erkannt wurde
  const mixedQuery = !structuredQuery ? parseMixedQuery(rawQuery) : null;
  if (!force && !structuredQuery && !mixedQuery && query.length < 2) {
    dom.searchResults.innerHTML = '<p class="empty-state">Mindestens 2 Zeichen eingeben oder Enter drücken.</p>';
    return;
  }
  // Für die eigentliche Suche das importierte Set bevorzugen (hat Collection-Daten),
  // fallback auf das Set aus allSets falls nicht importiert.
  const setsToSearch = structuredQuery
    ? [baseSetsToSearch.find((s) => s.setId === structuredQuery.setId) ?? structuredQuery.set]
    : baseSetsToSearch;
  if (!setsToSearch.length) {
    dom.searchResults.innerHTML = '<p class="empty-state">Keine passenden Sets verfügbar.</p>';
    return;
  }
  dom.searchResults.innerHTML = '<p class="loading-placeholder">Suche\u2026</p>';
  const results = [];
  for (const set of setsToSearch) {
    if (isStale() || isAborted()) return;
    try {
      const cacheKey = `cards_${set.setId}`;
      const dbCardsCacheKey = `db_cards_${set.setId}`;
      const searchCacheKey = `${set.setId}::${searchScopeMode}`;
      const useApiForSet = shouldUseApiForSearchSet(searchScopeMode, set);
      let cards;
      if (state.searchCache.has(searchCacheKey)) {
        cards = state.searchCache.get(searchCacheKey);
      } else {
        let dbCards = [];
        if (cache.has(dbCardsCacheKey)) {
          dbCards = cache.get(dbCardsCacheKey) || [];
        } else {
          dbCards = await readDbCardsForSet(set.setId).catch(() => []);
          if (Array.isArray(dbCards) && dbCards.length > 0) {
            cache.set(dbCardsCacheKey, dbCards, CONFIG.CACHE_TTL_MS);
          }
        }

        if (useApiForSet) {
          let apiCards = [];
          if (cache.has(cacheKey)) {
            apiCards = cache.get(cacheKey) || [];
          } else {
            apiCards = await fetchMergedCards(set.setId, { signal: abortController.signal }).catch(() => []);
            if (Array.isArray(apiCards) && apiCards.length > 0) {
              cache.set(cacheKey, apiCards, CONFIG.CACHE_TTL_MS);
            }
          }
          cards = searchScopeMode === SEARCH_SCOPE_ALL
            ? mergeSearchCards([], apiCards)
            : mergeSearchCards(dbCards, apiCards);
        } else {
          cards = Array.isArray(dbCards) ? dbCards : [];
        }

        state.searchCache.set(searchCacheKey, cards || []);
      }
      if (!cards || !cards.length) continue;
      if (isStale() || isAborted()) return;
      let dbMap = new Map();
      const dbCacheKey = `db_${set.setId}`;
      if (cache.has(dbCacheKey)) dbMap = cache.get(dbCacheKey);
      else {
        dbMap = await readSetCollectionMap(set.setName).catch(() => new Map());
        cache.set(dbCacheKey, dbMap, CONFIG.CACHE_TTL_MS);
      }
      if (isStale() || isAborted()) return;
      cards.forEach((card) => {
        const score = computeSearchScore(card, query, structuredQuery, mixedQuery);
        if (score >= 0) {
          results.push({ card, set, dbMap, score, apiOnly: Boolean(card?.__searchApiOnly) });
        }
      });
      if (!structuredQuery && !mixedQuery && results.length >= 200 && searchScopeMode === SEARCH_SCOPE_IMPORTED) break;
      // Exakter Set+Nummer-Treffer (ohne Namensfilter) — kann frühzeitig abbrechen
      if (structuredQuery?.cardNumber && !structuredQuery?.namePart && results.length >= 1) break;
    } catch (err) {
      if (err?.name === 'AbortError') {
        return;
      }
      console.warn('[runSearch] error for set', set.setId, err);
    }
  }
  if (!results.length) {
    const modeMeta = getSearchModeMeta(searchScopeMode);
    dom.searchResults.innerHTML = `
      <div class="search-results-head">
        <span class="search-mode-badge ${modeMeta.className}">${modeMeta.label}</span>
      </div>
      <p class="empty-state">Keine Karten f\u00fcr \u201e${rawQuery}\u201c gefunden (durchsucht: ${setsToSearch.length} Sets, ${modeMeta.hint}).</p>
    `;
    return;
  }
  results.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    const setCompare = String(left.set?.setName || '').localeCompare(String(right.set?.setName || ''), 'de', { sensitivity: 'base' });
    if (setCompare !== 0) return setCompare;
    return String(left.card?.number || '').localeCompare(String(right.card?.number || ''), undefined, { numeric: true, sensitivity: 'base' });
  });

  if (isStale() || isAborted()) return;
  const modeMeta = getSearchModeMeta(searchScopeMode);
  dom.searchResults.innerHTML = `
    <div class="search-results-head">
      <p class="search-result-count">${results.length} Ergebnis${results.length !== 1 ? 'se' : ''}</p>
      <span class="search-mode-badge ${modeMeta.className}">${modeMeta.label}</span>
    </div>
  `;
  const frag = document.createDocumentFragment();
  results.forEach(({ card, set, dbMap, apiOnly }) => {
    const key = normalizeCardNumber(card.number);
    frag.appendChild(createSearchResultCard(card, key, dbMap.get(key), set, apiOnly));
  });
  dom.searchResults.appendChild(frag);
}

function createSearchResultCard(card, key, db, set, apiOnly = false) {
  const article = document.createElement('article');
  article.className = 'card';
  if (db?.rh)     article.classList.add('reverse');
  else if (db?.g) article.classList.add('collected');

  const img = document.createElement('img');
  img.src = card.image || ''; img.alt = card.name || key; img.loading = 'lazy';
  attachImageFallback(img, card, set?.setId || '');

  const meta    = document.createElement('div'); meta.className = 'meta';
  const setTag  = document.createElement('span'); setTag.className = 'search-set-tag'; setTag.textContent = set.setName;
  const title   = document.createElement('div'); title.className = 'title'; title.textContent = `${card.number} \u2013 ${card.name || '?'}`;
  const status  = document.createElement('div'); status.className = 'search-status';
  const actions = document.createElement('div'); actions.className = 'search-actions';
  const goToSetBtn = document.createElement('button');
  goToSetBtn.type = 'button';
  goToSetBtn.className = 'btn-secondary';
  goToSetBtn.textContent = 'Zum Set';
  goToSetBtn.title = `${set.setName} öffnen`;
  status.textContent = db?.rh ? '\uD83D\uDD35 RH' : db?.g ? '\u2705 G' : (apiOnly ? '🌐 API' : '\u2610 Fehlend');
  actions.append(goToSetBtn);
  meta.append(setTag, title, status, actions);
  article.append(img, meta);

  article.addEventListener('click', async () => {
    try {
      await openSearchResultLightbox(card, set, { apiOnly });
    } catch (err) {
      showToast(`Karte konnte nicht geöffnet werden: ${err.message}`, 'error');
    }
  });

  goToSetBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    navigateToSearchResultSet(set);
  });

  return article;
}

function navigateToSearchResultSet(set) {
  if (!set?.setId) return;
  dom.selector.value = set.setId;
  navigate(`set/${set.setId}`);
}

async function openSearchResultLightbox(card, set, { apiOnly = false } = {}) {
  if (!set?.setId || !card) return;

  const cardsCacheKey = `db_cards_${set.setId}`;
  const dbCacheKey = `db_${set.setId}`;
  const searchScopeMode = getSearchScopeMode();
  const useApiForSet = shouldUseApiForSearchSet(searchScopeMode, set);
  const searchCacheKey = `${set.setId}::${searchScopeMode}`;

  const [cards, dbMap] = await Promise.all([
    state.searchCache.has(searchCacheKey)
      ? state.searchCache.get(searchCacheKey)
      : readDbCardsForSet(set.setId).then(async (loadedCards) => {
        const dbCards = Array.isArray(loadedCards) ? loadedCards : [];
        if (dbCards.length > 0) {
          cache.set(cardsCacheKey, dbCards, CONFIG.CACHE_TTL_MS);
        }

        if (!useApiForSet) {
          state.searchCache.set(searchCacheKey, dbCards);
          return dbCards;
        }

        const apiCards = cache.has(`cards_${set.setId}`)
          ? (cache.get(`cards_${set.setId}`) || [])
          : await fetchMergedCards(set.setId).catch(() => []);
        if (Array.isArray(apiCards) && apiCards.length > 0) {
          cache.set(`cards_${set.setId}`, apiCards, CONFIG.CACHE_TTL_MS);
        }

        const mergedCards = searchScopeMode === SEARCH_SCOPE_ALL
          ? mergeSearchCards([], apiCards)
          : mergeSearchCards(dbCards, apiCards);
        state.searchCache.set(searchCacheKey, mergedCards);
        return mergedCards;
      }),
    cache.has(dbCacheKey)
      ? cache.get(dbCacheKey)
      : readSetCollectionMap(set.setName).then((loadedDbMap) => {
        const safeDbMap = loadedDbMap instanceof Map ? loadedDbMap : new Map();
        cache.set(dbCacheKey, safeDbMap, CONFIG.CACHE_TTL_MS);
        return safeDbMap;
      }).catch(() => {
        const emptyDbMap = new Map();
        cache.set(dbCacheKey, emptyDbMap, CONFIG.CACHE_TTL_MS);
        return emptyDbMap;
      })
  ]);

  if (!Array.isArray(cards) || cards.length === 0) {
    showToast('Keine Kartendaten für dieses Set gefunden.', 'info', 4500);
    return;
  }

  const targetKey = normalizeCardNumber(card.number);
  const targetIndex = cards.findIndex((item) => normalizeCardNumber(item.number) === targetKey);
  if (targetIndex < 0) return;

  state.currentSet = set;
  state.cards = cards;
  state.dbMap = dbMap;
  state.lightboxIndex = targetIndex;
  state.pendingSearchSetImport = Boolean(apiOnly || !set?.imported);

  openLightbox(targetIndex);
}

function initSearch() {
  let debounce;
  dom.searchInput.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => runSearch(), SEARCH_INPUT_DEBOUNCE_MS);
  });
  dom.searchSetFilter.addEventListener('change', () => runSearch({ force: true }));
  dom.searchScopeMode?.addEventListener('change', () => {
    renderSearchSetFilterOptions();
    state.searchCache.clear();
    runSearch({ force: true });
  });
  dom.searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(debounce);
      runSearch({ force: true });
    }
  });
}

// ══════════════════════════════════════════════════════════════════════════
// SET-DETAIL: STATS & FILTER
// ══════════════════════════════════════════════════════════════════════════
function updateStats() {
  const total = state.cards.length;
  let collected = 0, rh = 0;
  state.cards.forEach((card) => {
    const db = state.dbMap.get(normalizeCardNumber(card.number));
    if (db?.g) collected++;
    if (db?.rh) rh++;
  });
  const missing = total - collected;
  const percent = total > 0 ? Math.round((collected / total) * 100) : 0;
  dom.statTotal.textContent     = total;
  dom.statCollected.textContent = collected;
  dom.statRh.textContent        = rh;
  dom.statMissing.textContent   = missing;
  dom.progressFill.style.width  = `${percent}%`;
  dom.progressFill.closest('.progress-bar').setAttribute('aria-valuenow', percent);
  dom.progressText.innerHTML    = `${collected}\u202f/\u202f${total} (${percent}\u00a0%)`;
  dom.statsSection.classList.remove('hidden');
  dom.filterSection.classList.remove('hidden');
  dom.sortSection.classList.remove('hidden');
}

function applyFilter() {
  dom.cards.querySelectorAll('.card').forEach((article) => {
    const db = state.dbMap.get(article.dataset.cardId);
    let visible = true;
    if (state.filter === 'missing')   visible = !db?.g;
    if (state.filter === 'collected') visible = Boolean(db?.g);
    article.classList.toggle('hidden', !visible);
  });
}

function applySortOrder() {
  const articles = Array.from(dom.cards.querySelectorAll('.card'));
  const sortBy = state.sortOrder;
  articles.sort((a, b) => {
    const ka = a.dataset.cardId, kb = b.dataset.cardId;
    const cardA = state.cards.find((c) => normalizeCardNumber(c.number) === ka);
    const cardB = state.cards.find((c) => normalizeCardNumber(c.number) === kb);
    if (sortBy === 'name')   return (cardA?.name || '').localeCompare(cardB?.name || '');
    if (sortBy === 'status') {
      const ra = state.dbMap.get(ka)?.rh ? 2 : state.dbMap.get(ka)?.g ? 1 : 0;
      const rb = state.dbMap.get(kb)?.rh ? 2 : state.dbMap.get(kb)?.g ? 1 : 0;
      return rb - ra;
    }
    return String(cardA?.number || ka).localeCompare(String(cardB?.number || kb), undefined, { numeric: true, sensitivity: 'base' });
  });
  articles.forEach((a) => dom.cards.appendChild(a));
}

function initFilterButtons() {
  document.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.filter = btn.dataset.filter;
      applyFilter();
    });
  });
}

function initSortControl() {
  dom.cardSort.addEventListener('change', () => {
    state.sortOrder = dom.cardSort.value;
    applySortOrder();
  });
}

// ══════════════════════════════════════════════════════════════════════════
// SET-DETAIL: KARTEN-RENDERING
// ══════════════════════════════════════════════════════════════════════════
function renderCards() {
  dom.cards.innerHTML = '';
  if (!state.cards.length) { setEmptyState(true); return; }
  setEmptyState(false);
  const fragment = document.createDocumentFragment();
  state.cards.forEach((card, index) => {
    const key = normalizeCardNumber(card.number);
    fragment.appendChild(createCardElement(card, key, state.dbMap.get(key), index));
  });
  dom.cards.appendChild(fragment);
  applyFilter();
  updateStats();
}

function createCardElement(card, key, db, index) {
  const dbEntry = db || {
    displayId: card.number,
    g: false,
    rh: false,
    gCell: null,
    rhCell: null
  };
  const isEditable = Boolean(state.currentSet?.setName);
  const article = document.createElement('article');
  article.className = 'card';
  article.dataset.cardId    = key;
  article.dataset.cardIndex = index;
  article.setAttribute('role', 'listitem');
  article.setAttribute('tabindex', '-1');

  if (dbEntry?.rh)     article.classList.add('reverse');
  else if (dbEntry?.g) article.classList.add('collected');

  // Image wrap (click → lightbox)
  const imgWrap = document.createElement('div');
  imgWrap.className = 'card-img-wrap';
  imgWrap.addEventListener('click', () => { if (!state.bulkMode) openLightbox(index); });

  const img = document.createElement('img');
  img.src = card.image || ''; img.alt = card.name || key; img.loading = 'lazy';
  attachImageFallback(img, card, state.currentSet?.setId || '');
  imgWrap.appendChild(img);

  // Bulk overlay
  const overlay = document.createElement('div'); overlay.className = 'bulk-overlay';
  const checkMark = document.createElement('span'); checkMark.className = 'bulk-check'; checkMark.textContent = '\u2713';
  overlay.appendChild(checkMark);
  imgWrap.appendChild(overlay);

  const meta = document.createElement('div'); meta.className = 'meta';
  const titleDiv = document.createElement('div'); titleDiv.className = 'title';
  titleDiv.textContent = `${card.number} \u2013 ${card.name || 'Unbekannt'}`;

  const checksDiv = document.createElement('div'); checksDiv.className = 'checks';
  checksDiv.append(
    makeCheckbox('G', 'g', dbEntry?.g ?? false, !isEditable),
    makeCheckbox('RH', 'rh', dbEntry?.rh ?? false, !isEditable || !dbEntry?.g || !dbEntry?.rhCell)
  );
  meta.append(titleDiv, checksDiv);

  if (card.cardmarketUrl) {
    const isFallbackCardmarket = isGeneratedCardmarketSearchUrl(card.cardmarketUrl);
    const cm = document.createElement('a');
    cm.href = card.cardmarketUrl; cm.target = '_blank'; cm.rel = 'noopener noreferrer';
    cm.className = `card-cm-link${isFallbackCardmarket ? ' card-cm-link-fallback' : ''}`;
    cm.textContent = '\uD83D\uDED2 CM';
    cm.title = isFallbackCardmarket ? 'Generierter Cardmarket-Suchlink' : 'Cardmarket-Produktseite';
    meta.appendChild(cm);
  }

  article.append(imgWrap, meta);
  if (isEditable) attachCheckboxListeners(article, dbEntry, key);

  // Bulk-Klick auf Artikel
  article.addEventListener('click', (e) => {
    if (!state.bulkMode) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'A') return;
    toggleBulkSelect(article, key);
    e.stopPropagation();
  });

  return article;
}

function isGeneratedCardmarketSearchUrl(url) {
  const value = String(url || '').trim().toLowerCase();
  return value.includes('cardmarket.com') && value.includes('/products/search') && value.includes('searchstring=');
}

function makeCheckbox(labelText, type, checked, disabled) {
  const label = document.createElement('label');
  const input = document.createElement('input');
  input.type = 'checkbox'; input.dataset.type = type; input.checked = checked; input.disabled = disabled;
  label.append(input, ` ${labelText}`);
  return label;
}

function attachCheckboxListeners(article, db, key) {
  const gInput  = article.querySelector('input[data-type="g"]');
  const rhInput = article.querySelector('input[data-type="rh"]');

  async function ensureDbEntry() {
    if (db?.gCell && db?.rhCell) return db;
    const ensured = await ensureCollectionEntry(state.currentSet.setName, db?.displayId || key);
    db.g = Boolean(db?.g);
    db.rh = Boolean(db?.rh && db?.g);
    db.gCell = ensured.gCell;
    db.rhCell = ensured.rhCell;
    db.displayId = ensured.displayId || db.displayId || key;
    state.dbMap.set(key, db);
    return db;
  }

  gInput.addEventListener('change', async () => {
    if (state.bulkMode) { gInput.checked = !gInput.checked; return; }
    const checked = gInput.checked;
    try {
      await ensureDbEntry();
      await updateCellBoolean(state.currentSet.setName, db.gCell.row, db.gCell.col, checked);
      db.g = checked;
      if (!checked && db?.rhCell) {
        await updateCellBoolean(state.currentSet.setName, db.rhCell.row, db.rhCell.col, false);
        db.rh = false; rhInput.checked = false; rhInput.disabled = true;
      } else {
        rhInput.disabled = !db?.rhCell;
      }
      updateCardState(article, db);
      updateStats(); applyFilter();
      state.summaryData = null;
      broadcastRealtimeCardUpdate(key, db);
    } catch (err) {
      showToast(`Speichern fehlgeschlagen: ${err.message}`, 'error');
      gInput.checked = !checked;
    }
  });

  rhInput.addEventListener('change', async () => {
    if (state.bulkMode) { rhInput.checked = !rhInput.checked; return; }
    if (!db.g || !db?.rhCell) { rhInput.checked = false; return; }
    const checked = rhInput.checked;
    try {
      await ensureDbEntry();
      await updateCellBoolean(state.currentSet.setName, db.rhCell.row, db.rhCell.col, checked);
      db.rh = checked;
      updateCardState(article, db);
      state.summaryData = null;
      broadcastRealtimeCardUpdate(key, db);
    } catch (err) {
      showToast(`Speichern fehlgeschlagen: ${err.message}`, 'error');
      rhInput.checked = !checked;
    }
  });
}

function updateCardState(article, db) {
  article.classList.toggle('reverse',   Boolean(db?.rh));
  article.classList.toggle('collected', Boolean(db?.g) && !db?.rh);
  if (dom.lightboxDialog.open) {
    const idx = parseInt(article.dataset.cardIndex);
    if (state.lightboxIndex === idx) renderLightbox(idx);
  }
}

function broadcastRealtimeCardUpdate(cardNumber, db) {
  if (!state.realtime || !state.currentSet) return;
  state.realtime.publish(
    buildCollectionUpdateEvent({
      setId: state.currentSet.setId,
      setName: state.currentSet.setName,
      cardNumber,
      g: Boolean(db?.g),
      rh: Boolean(db?.rh),
      actor: 'local-user'
    })
  );
}

function applyIncomingRealtimeUpdate(payload) {
  if (!payload || payload.type !== 'collection-update' || !state.currentSet) return;

  const isSameSet =
    payload.setId === state.currentSet.setId ||
    payload.setName === state.currentSet.setName;
  if (!isSameSet) return;

  const key = normalizeCardNumber(payload.cardNumber);
  const db = state.dbMap.get(key);
  if (!db) return;

  db.g = Boolean(payload.g);
  db.rh = Boolean(payload.g && payload.rh);

  const article = dom.cards.querySelector(`[data-card-id="${key}"]`);
  if (article) updateCardState(article, db);

  if (dom.lightboxDialog.open) {
    const card = state.cards[state.lightboxIndex];
    const lightboxKey = card ? normalizeCardNumber(card.number) : null;
    if (lightboxKey && lightboxKey === key) renderLightbox(state.lightboxIndex);
  }

  updateStats();
  state.summaryData = null;
  showToast(`🔄 Live-Update empfangen: #${payload.cardNumber}`, 'info', 2000);
}

// ══════════════════════════════════════════════════════════════════════════
// LIGHTBOX
// ══════════════════════════════════════════════════════════════════════════
function openLightbox(index) {
  state.lightboxIndex = index;
  renderLightbox(index);
  dom.lightboxDialog.showModal();
}

function closeLightbox() {
  dom.lightboxDialog.close();
  dom.cards.querySelector(`[data-card-index="${state.lightboxIndex}"]`)?.focus();
}

function renderLightbox(index) {
  const card = state.cards[index];
  if (!card) return;
  const key = normalizeCardNumber(card.number);
  const db  = state.dbMap.get(key) || { displayId: card.number, g: false, rh: false, gCell: null, rhCell: null };
  const listToText = (value) => Array.isArray(value) ? value.filter(Boolean).join(', ') : '';
  const rulesText = Array.isArray(card.rules) ? card.rules.filter(Boolean).join('\n') : '';
  const setFact = (node, value, { longText = false } = {}) => {
    if (!node) return;
    const text = String(value ?? '').trim() || '—';
    node.textContent = text;
    node.classList.toggle('lightbox-fact-long', longText && text !== '—');
  };

  dom.lightboxImg.src              = card.image || '';
  attachImageFallback(dom.lightboxImg, card, state.currentSet?.setId || '');
  dom.lightboxImg.alt              = card.name  || key;
  dom.lightboxTitle.textContent    = card.name  || 'Unbekannt';
  dom.lightboxSubtitle.textContent = `#${card.number}`;
  dom.lightboxCounter.textContent  = `${index + 1}\u202f/\u202f${state.cards.length}`;
  setFact(dom.lightboxRarity, card.rarity);
  setFact(dom.lightboxHp, card.hp);
  setFact(dom.lightboxTypes, listToText(card.types));
  setFact(dom.lightboxSupertype, card.supertype);
  setFact(dom.lightboxSubtypes, listToText(card.subtypes));
  setFact(dom.lightboxEvolvesFrom, card.evolvesFrom);
  setFact(dom.lightboxArtist, card.artist);
  setFact(dom.lightboxRegulationMark, card.regulationMark);
  setFact(dom.lightboxRules, rulesText, { longText: true });
  setFact(dom.lightboxFlavorText, card.flavorText, { longText: true });
  if (card.cardmarketUrl) {
    const isFallbackCardmarket = isGeneratedCardmarketSearchUrl(card.cardmarketUrl);
    dom.lightboxCmLink.href = card.cardmarketUrl;
    dom.lightboxCmLink.textContent = '🛒 Cardmarket';
    dom.lightboxCmLink.title = isFallbackCardmarket ? 'Generierter Cardmarket-Suchlink' : 'Cardmarket-Produktseite';
    dom.lightboxCmLink.classList.toggle('lightbox-cm-link-fallback', isFallbackCardmarket);
    dom.lightboxCmLink.classList.remove('hidden');
  } else {
    dom.lightboxCmLink.classList.add('hidden');
    dom.lightboxCmLink.classList.remove('lightbox-cm-link-fallback');
  }
  const hasGCell                = Boolean(db?.gCell);
  const hasRhCell               = Boolean(db?.rhCell);
  dom.lightboxGCheck.checked    = db?.g  ?? false;
  dom.lightboxGCheck.disabled   = !Boolean(state.currentSet?.setName);
  dom.lightboxRhCheck.checked   = db?.rh ?? false;
  dom.lightboxRhCheck.disabled  = !hasRhCell || !db?.g;
  dom.btnLightboxPrev.disabled  = index === 0;
  dom.btnLightboxNext.disabled  = index === state.cards.length - 1;
}

function initLightbox() {
  dom.btnLightboxClose.addEventListener('click', closeLightbox);
  dom.lightboxDialog.addEventListener('click', (e) => { if (e.target === dom.lightboxDialog) closeLightbox(); });

  dom.btnLightboxPrev.addEventListener('click', () => {
    if (state.lightboxIndex > 0) { state.lightboxIndex--; renderLightbox(state.lightboxIndex); }
  });
  dom.btnLightboxNext.addEventListener('click', () => {
    if (state.lightboxIndex < state.cards.length - 1) { state.lightboxIndex++; renderLightbox(state.lightboxIndex); }
  });

  dom.lightboxDialog.addEventListener('keydown', (e) => {
    if (e.key === 'Escape')     closeLightbox();
    if (e.key === 'ArrowLeft')  dom.btnLightboxPrev.click();
    if (e.key === 'ArrowRight') dom.btnLightboxNext.click();
    if (e.key === ' ')          { e.preventDefault(); dom.lightboxGCheck.click(); }
  });

  async function lightboxToggle(isG, checked) {
    const card = state.cards[state.lightboxIndex];
    if (!card) return;
    const key = normalizeCardNumber(card.number);
    let db = state.dbMap.get(key) || { displayId: card.number, g: false, rh: false, gCell: null, rhCell: null };
    const shouldEnsureImportedSet = checked && (Boolean(state.pendingSearchSetImport) || !Boolean(state.currentSet?.imported));
    if (shouldEnsureImportedSet) {
      const setToImport = state.currentSet;
      const setId = setToImport?.setId;
      if (!setId) return;
      setLoading(true, `Importiere ${setToImport.setName}…`);
      try {
        const importCards = await fetchMergedCards(setId).catch(() => []);
        if (!Array.isArray(importCards) || !importCards.length) {
          throw new Error('Keine Kartendaten für den automatischen Set-Import gefunden.');
        }
        await importSetIntoCollection(setToImport, importCards);
        cache.del(`cards_${setId}`);
        cache.del(`db_cards_${setId}`);
        cache.del(`db_${setId}`);
        state.searchCache.clear();
        state.summaryData = null;
        await loadSets();
        const refreshedSet = state.sets.find((entry) => entry.setId === setId)
          || state.allSets.find((entry) => entry.setId === setId)
          || setToImport;
        refreshedSet.imported = true;
        state.currentSet = refreshedSet;
        state.pendingSearchSetImport = false;
        state.dbMap = await readSetCollectionMap(refreshedSet.setName).catch(() => new Map());
        cache.set(`db_${setId}`, state.dbMap, CONFIG.CACHE_TTL_MS);
        db = state.dbMap.get(key) || db;
        showToast(`${refreshedSet.setName} wurde automatisch importiert.`, 'success', 3200);
      } catch (err) {
        showToast(`Automatischer Set-Import fehlgeschlagen: ${err.message || err}`, 'error', 4200);
        renderLightbox(state.lightboxIndex);
        return;
      } finally {
        setLoading(false);
      }
    }
    if (!db?.gCell) {
      const ensured = await ensureCollectionEntry(state.currentSet.setName, card.number || db?.displayId || key);
      db.displayId = ensured.displayId || db.displayId || card.number || key;
      db.gCell = ensured.gCell;
      db.rhCell = ensured.rhCell;
      state.dbMap.set(key, db);
    }
    try {
      if (isG) {
        await updateCellBoolean(state.currentSet.setName, db.gCell.row, db.gCell.col, checked);
        db.g = checked;
        if (!checked && db?.rhCell) {
          await updateCellBoolean(state.currentSet.setName, db.rhCell.row, db.rhCell.col, false);
          db.rh = false;
        }
      } else {
        if (!db.g || !db?.rhCell) return;
        await updateCellBoolean(state.currentSet.setName, db.rhCell.row, db.rhCell.col, checked);
        db.rh = checked;
      }
      renderLightbox(state.lightboxIndex);
      const article = dom.cards.querySelector(`[data-card-index="${state.lightboxIndex}"]`);
      if (article) updateCardState(article, db);
      updateStats();
      state.summaryData = null;
      broadcastRealtimeCardUpdate(key, db);
      runSearch({ force: true });
    } catch (err) {
      showToast(`Fehler: ${err.message}`, 'error');
      renderLightbox(state.lightboxIndex); // revert UI
    }
  }

  dom.lightboxGCheck.addEventListener('change',  () => lightboxToggle(true,  dom.lightboxGCheck.checked));
  dom.lightboxRhCheck.addEventListener('change', () => lightboxToggle(false, dom.lightboxRhCheck.checked));
}

// ══════════════════════════════════════════════════════════════════════════
// BULK-EDIT
// ══════════════════════════════════════════════════════════════════════════
function toggleBulkMode(on) {
  state.bulkMode = on;
  state.bulkSelected.clear();
  dom.bulkToolbar.classList.toggle('hidden', !on);
  dom.btnBulkEdit.textContent = on ? '\u2715 Abbrechen' : '\u2611 Mehrfach-Auswahl';
  dom.cards.classList.toggle('bulk-mode', on);
  updateBulkCount();
  if (!on) dom.cards.querySelectorAll('.card.bulk-selected').forEach((a) => a.classList.remove('bulk-selected'));
}

function toggleBulkSelect(article, key) {
  if (state.bulkSelected.has(key)) { state.bulkSelected.delete(key); article.classList.remove('bulk-selected'); }
  else                              { state.bulkSelected.add(key);    article.classList.add('bulk-selected'); }
  updateBulkCount();
}

function updateBulkCount() {
  dom.bulkCount.textContent = `${state.bulkSelected.size} ausgew\u00e4hlt`;
}

async function bulkUpdate(g, rh) {
  if (!state.bulkSelected.size) { showToast('Keine Karten ausgew\u00e4hlt.', 'info'); return; }
  setLoading(true, 'Massenaktion\u2026');
  let updated = 0, errors = 0;
  try {
    for (const key of state.bulkSelected) {
      const db = state.dbMap.get(key);
      if (!db?.gCell) continue;
      try {
        await updateCellBoolean(state.currentSet.setName, db.gCell.row, db.gCell.col, g);
        db.g = g;
        if (db.rhCell) {
          const newRh = g && rh;
          await updateCellBoolean(state.currentSet.setName, db.rhCell.row, db.rhCell.col, newRh);
          db.rh = newRh;
        }
        const article = dom.cards.querySelector(`[data-card-id="${key}"]`);
        if (article) updateCardState(article, db);
        broadcastRealtimeCardUpdate(key, db);
        updated++;
      } catch (err) {
        console.warn('[bulkUpdate] error for key', key, err);
        errors++;
      }
    }
  } finally {
    setLoading(false);
  }
  updateStats(); applyFilter();
  state.summaryData = null;
  toggleBulkMode(false);
  const msg = errors > 0 ? `${updated} aktualisiert, ${errors} Fehler.` : `${updated} Karten aktualisiert.`;
  showToast(msg, errors > 0 ? 'error' : 'success', errors > 0 ? 5000 : 3000);
}

function initBulkEdit() {
  dom.btnBulkEdit.addEventListener('click', () => toggleBulkMode(!state.bulkMode));
  dom.btnBulkCancel.addEventListener('click', () => toggleBulkMode(false));
  dom.btnBulkMarkG.addEventListener('click',  () => bulkUpdate(true,  false));
  dom.btnBulkMarkRh.addEventListener('click', () => bulkUpdate(true,  true));
  dom.btnBulkUnmark.addEventListener('click', () => bulkUpdate(false, false));
}

// ══════════════════════════════════════════════════════════════════════════
// FEHLENDE KARTEN EXPORTIEREN
// ══════════════════════════════════════════════════════════════════════════
function getMissingCards() {
  return state.cards.filter((card) => !state.dbMap.get(normalizeCardNumber(card.number))?.g);
}

function exportMissingCards() {
  const missing = getMissingCards();
  if (!missing.length) { showToast('Keine fehlenden Karten \u2013 Set vollst\u00e4ndig!', 'success'); return; }
  const setName = state.currentSet?.setName || 'Set';
  const rows = ['Nummer,Name,Set', ...missing.map((c) => `"${c.number}","${(c.name || '').replace(/"/g, '""')}","${setName}"`)];
  const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: `fehlende_${setName.replace(/\s+/g, '-')}.csv` });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`${missing.length} fehlende Karten als CSV exportiert.`, 'success', 4000);
}

// ══════════════════════════════════════════════════════════════════════════
// TASTATURNAVIGATION
// ══════════════════════════════════════════════════════════════════════════
function initKeyboardNav() {
  document.addEventListener('keydown', (e) => {
    if (dom.viewSet.classList.contains('hidden')) return;
    if (dom.lightboxDialog.open) return;
    if (state.bulkMode) return;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;

    const articles = Array.from(dom.cards.querySelectorAll('.card:not(.hidden)'));
    if (!articles.length) return;

    const cols = Math.max(1, Math.floor(dom.cards.offsetWidth / 170));
    let newIndex = focusedCardIndex;
    
    if (e.key === 'ArrowRight') { e.preventDefault(); newIndex = Math.min((focusedCardIndex < 0 ? -1 : focusedCardIndex) + 1, articles.length - 1); }
    else if (e.key === 'ArrowLeft')  { e.preventDefault(); newIndex = Math.max(focusedCardIndex - 1, 0); }
    else if (e.key === 'ArrowDown')  { e.preventDefault(); newIndex = Math.min(focusedCardIndex + cols, articles.length - 1); }
    else if (e.key === 'ArrowUp')    { e.preventDefault(); newIndex = Math.max(focusedCardIndex - cols, 0); }
    else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      articles[focusedCardIndex]?.querySelector('input[data-type="g"]:not(:disabled)')?.click();
      return;
    } else if (e.key === 'i' || e.key === 'I') {
      e.preventDefault();
      const idx = parseInt(articles[focusedCardIndex]?.dataset.cardIndex ?? '-1');
      if (idx >= 0) openLightbox(idx);
      return;
    } else return;

    if (newIndex < 0) newIndex = 0;
    focusedCardIndex = newIndex;
    const target = articles[focusedCardIndex];
    if (target) {
      target.focus();
      target.scrollIntoView({ block: 'nearest' });
    }
  });

  dom.cards.addEventListener('focus', (e) => {
    const article = e.target.closest('.card');
    if (article) {
      const articles = Array.from(dom.cards.querySelectorAll('.card:not(.hidden)'));
      focusedCardIndex = articles.indexOf(article);
    }
  }, true);
}

// ══════════════════════════════════════════════════════════════════════════
// SET LADEN
// ══════════════════════════════════════════════════════════════════════════
async function loadCurrentSet(forceRefresh = false) {
  const setId   = dom.selector.value;
  if (!setId) return;
  const selected = state.sets.find((s) => s.setId === setId);
  if (!selected) return;

  state.currentSet = selected;
  const navSetLink = document.getElementById('nav-set-link');
  if (navSetLink) { navSetLink.textContent = selected.setName; navSetLink.href = `#set/${setId}`; }

  setGlobalStatus(`Lade ${selected.setName}\u2026`);
  setLoading(true, `Lade ${selected.setName}\u2026`);

  if (selected.logoUrl) {
    dom.setLogo.onerror = () => {
      dom.setLogo.style.display = 'none';
    };
    dom.setLogo.style.display = '';
    dom.setLogo.src = selected.logoUrl;

    dom.setSymbol.onerror = () => {
      dom.setSymbol.style.display = 'none';
    };
    if (selected.symbolUrl) {
      dom.setSymbol.style.display = '';
      dom.setSymbol.src = selected.symbolUrl;
    } else {
      dom.setSymbol.style.display = 'none';
      dom.setSymbol.removeAttribute('src');
    }
    dom.setLogoWrap.classList.remove('hidden');
  } else {
    dom.setLogoWrap.classList.add('hidden');
  }

  try {
    const cardsCacheKey = `db_cards_${setId}`, dbCacheKey = `db_${setId}`;
    const allowApiFallback = getSearchScopeMode() === SEARCH_SCOPE_ONLINE;
    if (forceRefresh) { cache.del(cardsCacheKey); cache.del(dbCacheKey); }

    const [cards, dbMap] = await Promise.all([
      cache.has(cardsCacheKey)
        ? cache.get(cardsCacheKey)
        : readDbCardsForSet(setId).then(async (dbCards) => {
          if (Array.isArray(dbCards) && dbCards.length > 0) {
            cache.set(cardsCacheKey, dbCards, CONFIG.CACHE_TTL_MS);
            return dbCards;
          }
          if (allowApiFallback) {
            const apiCards = await fetchMergedCards(setId);
            cache.set(cardsCacheKey, apiCards, CONFIG.CACHE_TTL_MS);
            return apiCards;
          }
          return [];
        }),
      cache.has(dbCacheKey)    ? cache.get(dbCacheKey)    : readSetCollectionMap(selected.setName).then((m) => { cache.set(dbCacheKey, m, CONFIG.CACHE_TTL_MS); return m; }),
    ]);

    if (!Array.isArray(cards) || cards.length === 0) {
      throw new Error('Keine Kartendaten in der Datenbank gefunden. Bitte Set importieren/aktualisieren oder API-Fallback aktivieren.');
    }

    state.cards = cards;
    state.dbMap = dbMap;
    state.pendingSearchSetImport = false;
    focusedCardIndex = -1;
    if (state.bulkMode) toggleBulkMode(false);
    state.filter = 'all';
    dom.cardSort.value = 'number';
    state.sortOrder = 'number';
    document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
    document.querySelector('.filter-btn[data-filter="all"]')?.classList.add('active');

    renderCards();
    await writeSetting('lastSetId', setId);
    markSetAsRecent(selected);
    setGlobalStatus(`${selected.setName}: ${cards.length} Karten.`);
    if (!forceRefresh) showToast(`${selected.setName} geladen`, 'success', 2000);
  } catch (err) {
    console.error('[loadCurrentSet]', err);
    if (isAuthError(err)) {
      showToast('Sitzung abgelaufen. Bitte erneut mit Google anmelden.', 'error', 6000);
      try { signOut(); } catch {}
      resetToLoggedOut();
      return;
    }
    showToast(`Fehler beim Laden: ${err.message}`, 'error');
    setGlobalStatus('Fehler beim Laden.');
    state.cards = [];
    state.dbMap = new Map();
    setEmptyState(true);
  } finally {
    setLoading(false);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// VOICE COMMANDS INITIALIZATION
// ══════════════════════════════════════════════════════════════════════════
function initVoiceCommands() {
  try {
    const voiceRecognizer = new VoiceCommandRecognizer((command) => {
      console.log('✅ Voice command received:', command);
      if (command === 'search-set') {
        dom.search?.focus();
        showToast('🎤 Searching...', 'info', 2000);
      } else if (command === 'show-collection') {
        navigate('dashboard');
        showToast('🎤 Showing collection', 'info', 2000);
      } else if (command === 'show-stats') {
        showToast('🎤 Opening statistics', 'info', 2000);
      } else if (command === 'settings') {
        commandHandlers['settings']();
      } else if (command === 'wishlists') {
        commandHandlers['wishlists']?.();
      }
    });

    // Add voice button to header
    if (!document.getElementById('voice-btn')) {
      const voiceBtn = document.createElement('button');
      voiceBtn.id = 'voice-btn';
      voiceBtn.textContent = '🎤';
      voiceBtn.style.cssText = `
        padding: 8px 12px; 
        background: var(--color-primary); 
        color: white; 
        border: none; 
        border-radius: 4px; 
        cursor: pointer;
        font-size: 14px;
      `;

      if (voiceRecognizer.isSupported()) {
        voiceBtn.addEventListener('click', () => {
          if (voiceRecognizer.isListening) {
            voiceRecognizer.stop();
            voiceBtn.style.background = 'var(--color-primary)';
            showToast('🎤 Stopped listening', 'info', 2000);
          } else {
            voiceRecognizer.start();
            voiceBtn.style.background = '#ff6b6b';
            showToast('🎤 Listening...', 'info', 2000);
          }
        });

        dom.headerActions?.appendChild(voiceBtn);
        console.log('✅ Voice commands enabled');
      } else {
        voiceBtn.disabled = true;
        voiceBtn.title = 'Speech Recognition not supported';
        voiceBtn.style.opacity = '0.5';
      }
    }
  } catch (err) {
    console.warn('⚠️ Voice commands init failed:', err);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// GESTURE CONTROLS INITIALIZATION
// ══════════════════════════════════════════════════════════════════════════
function initGestureControls() {
  try {
    const gestureRecognizer = new GestureRecognizer(document.body, (gesture, data) => {
      console.log('👆 Gesture detected:', gesture, data);

      if (gesture === 'swipe-right') {
        navigate('dashboard');
        showToast('👆 Swiped right', 'info', 1000);
      } else if (gesture === 'swipe-left') {
        // Navigate to next set or next view
        showToast('👆 Swiped left', 'info', 1000);
      } else if (gesture === 'swipe-up') {
        // Scroll up or show last set
        showToast('👆 Swiped up', 'info', 1000);
      } else if (gesture === 'swipe-down') {
        // Pull to refresh
        if (state.currentSet) {
          loadCurrentSet(true);
          showToast('👆 Refreshing...', 'info', 1000);
        }
      } else if (gesture === 'longpress') {
        // Show context menu
        console.log('Long press at:', data);
      } else if (gesture === 'pinch') {
        // Zoom in/out
        console.log('Pinch scale:', data.scale);
      }
    });

    console.log('✅ Gesture controls initialized');
  } catch (err) {
    console.warn('⚠️ Gesture controls init failed:', err);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// BOOTSTRAP
// ══════════════════════════════════════════════════════════════════════════
async function bootstrap() {
  loadDashboardPreferences();
  state.recentSets = loadRecentSets();

  try {
    await initSmartEngine();
  } catch (err) {
    console.warn('Smart Engine init:', err);
  }
  initDarkMode();
  initFilterButtons();
  initSpreadsheetDialog();
  initBatchImportDialog();
  initBackupImportExport();
  initQueueBuilderDialog();
  initLightbox();
  initVoiceCommands();
  initGestureControls();
  initBulkEdit();
  initKeyboardNav();
  initDashboardControls();
  initSheetsWriteFeedback();
  initSortControl();
  initSearch();

  try {
    state.realtimeClientId = localStorage.getItem(REALTIME_CLIENT_STORAGE_KEY) || `client_${Date.now()}`;
    localStorage.setItem(REALTIME_CLIENT_STORAGE_KEY, state.realtimeClientId);
    state.realtime = initRealtimeSync({
      clientId: state.realtimeClientId,
      onEvent: applyIncomingRealtimeUpdate
    });
    console.log('✅ Realtime sync initialized');
  } catch (err) {
    console.warn('⚠️ Realtime sync init failed:', err);
  }
  
  // Initialize Quick Filters
  try {
    initQuickFiltersUI(state.quickFilters);
    window.addEventListener('quick-filters-changed', (e) => {
      state.quickFilters = {
        ...state.quickFilters,
        ...(e?.detail || {})
      };
      resetDashboardVirtualization();
      saveDashboardPreferences();
      renderDashboard();
    });
    console.log('✅ Quick Filters initialized');
  } catch (err) {
    console.warn('⚠️ Quick Filters init failed:', err);
  }

  // Store search history globally
  window.SEARCH_HISTORY = loadSearchHistory();
  
  // Clear search history on event
  window.addEventListener('clear-search-history', () => {
    clearSearchHistory();
    window.SEARCH_HISTORY = [];
    showToast('Suchverlauf gelöscht', 'success', 2000);
  });
  
  // Initialize Shortcuts Overlay
  try {
    const shortcutsOverlay = createShortcutsOverlay();
    document.body.appendChild(shortcutsOverlay);
    
    // ? key to show shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === '?' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        shortcutsOverlay.classList.remove('hidden');
        e.preventDefault();
      }
    });
    console.log('✅ Shortcuts overlay initialized');
  } catch (err) {
    console.warn('⚠️ Shortcuts overlay init failed:', err);
  }
  
  // Initialize Command Palette with handlers
  const commandHandlers = {
    'sync': async () => {
      showToast('Sync-Funktion noch nicht implementiert', 'info');
    },
    'import-batch': () => openBatchImportDialog(),
    'health-check': () => runDataHealthCheck({ autoFix: false }),
    'backup-download': async () => {
      const sets = state.sets.slice(0, 3); // Begrenzt auf 3 Sets zur Demo
      if (!sets.length) {
        showToast('Keine Sets zum Exportieren.', 'info');
        return;
      }
      const backupSets = sets.map((set) => ({
        setId: set.setId,
        setName: set.setName,
        imported: set.imported || true
      }));
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
      const payload = {
        app: 'poke-tcg-try4',
        version: 1,
        createdAt: stamp,
        spreadsheetId: CONFIG.SPREADSHEET_ID,
        sets: backupSets
      };
      downloadJson(`poke_backup_${stamp}.json`, payload);
      showToast(`Backup exportiert (${sets.length} Sets).`, 'success', 4000);
    },
    'parity-test': async () => {
      showToast('Parity-Test wird ausgeführt...', 'info');
      try {
        const result = await runPokecodeParityCheck();
        console.log('Parity-Test Result:', result);
        showToast('Parity-Test abgeschlossen! Siehe Konsole.', 'success', 4000);
      } catch (err) {
        showToast(`Parity-Test fehlgeschlagen: ${err.message}`, 'error', 5000);
      }
    },
    'search': () => {
      dom.search?.focus();
      showToast('Suchfeld aktiviert', 'info', 2000);
    },
    'snapshots': () => {
      showToast('Snapshots: ' + (loadSnapshots() || []).length + ' verfügbar', 'info', 3000);
    },
    'settings': () => {
      const currentSettings = loadSettings();
      const settingsPanel = createSettingsPanel(currentSettings, (updated) => {
        saveSettings(updated);
        showToast('Einstellungen gespeichert', 'success', 2000);
        window.location.reload();
      });
      
      const dialog = document.createElement('dialog');
      dialog.className = 'ss-dialog';
      dialog.style.cssText = 'width: 90vw; max-width: 400px;';
      dialog.innerHTML = '<h2>⚙️ Einstellungen</h2>';
      dialog.appendChild(settingsPanel);
      document.body.appendChild(dialog);
      dialog.showModal();
      
      dialog.addEventListener('close', () => dialog.remove());
    },
    'export-collection': async () => {
      if (!state.collection || !state.sets.length) {
        showToast('Keine Sammlung zum Exportieren', 'error', 3000);
        return;
      }
      
      const report = generateCollectionReport(state.collection, state.sets);
      const dialog = createExportDialog(report);
      document.body.appendChild(dialog);
      dialog.showModal();
      
      dialog.addEventListener('close', () => dialog.remove());
    },
    'help': () => {
      showToast('Verfügbare Befehle: import, health-check, backup, parity, search, snapshots, settings, export', 'info', 5000);
    },
    'wishlists': () => {
      const panel = createWishlistPanel();
      const dialog = document.createElement('dialog');
      dialog.className = 'ss-dialog';
      dialog.style.cssText = 'width: 90vw; max-width: 600px;';
      dialog.appendChild(panel);
      document.body.appendChild(dialog);
      dialog.showModal();
      dialog.addEventListener('close', () => dialog.remove());
    },
    'share-collection': () => {
      if (!state.allSets || state.allSets.length === 0) {
        showToast('Keine Collection zum Teilen', 'error');
        return;
      }
      const collectionData = {}; // Würde hier echte Collection-Daten laden
      const panel = createSharingDialog(collectionData, state.allSets);
      const dialog = document.createElement('dialog');
      dialog.className = 'ss-dialog';
      dialog.style.cssText = 'width: 90vw; max-width: 600px;';
      dialog.appendChild(panel);
      document.body.appendChild(dialog);
      dialog.showModal();
      dialog.addEventListener('close', () => dialog.remove());
    },
    'trading-log': () => {
      const panel = createTradingLogPanel();
      const dialog = document.createElement('dialog');
      dialog.className = 'ss-dialog';
      dialog.style.cssText = 'width: 90vw; max-width: 700px;';
      dialog.appendChild(panel);
      document.body.appendChild(dialog);
      dialog.showModal();
      dialog.addEventListener('close', () => dialog.remove());
    },
    'achievements': async () => {
      const stats = calculateCollectionStats(state.summaryData || []);
      const panel = createAchievementsPanel(stats);
      const dialog = document.createElement('dialog');
      dialog.className = 'ss-dialog';
      dialog.style.cssText = 'width: 90vw; max-width: 600px;';
      dialog.appendChild(panel);
      document.body.appendChild(dialog);
      dialog.showModal();
      dialog.addEventListener('close', () => dialog.remove());
    },
    'csv-export': () => {
      if (!state.allSets || state.allSets.length === 0) {
        showToast('Keine Sets zum Exportieren', 'error');
        return;
      }
      const collectionData = {}; // Würde echte Collection-Daten laden
      const panel = createCSVExportPanel(collectionData, state.allSets);
      const dialog = document.createElement('dialog');
      dialog.className = 'ss-dialog';
      dialog.style.cssText = 'width: 90vw; max-width: 600px;';
      dialog.appendChild(panel);
      document.body.appendChild(dialog);
      dialog.showModal();
      dialog.addEventListener('close', () => dialog.remove());
    },
    'voice': () => {
      showToast('🎤 Sprachsteuerung aktiviert - Sag einen Befehl', 'info', 3000);
    },
    'local-backup': () => {
      try {
        const backupData = {
          sets: state.allSets,
          imported: state.sets,
          timestamp: new Date().toISOString()
        };
        const backupKey = createLocalBackup(backupData, `Backup ${new Date().toLocaleDateString()}`);
        if (backupKey) {
          showToast('💾 Lokale Sicherung erstellt', 'success', 3000);
        } else {
          showToast('Sicherung fehlgeschlagen', 'error');
        }
      } catch (err) {
        showToast(`Sicherungsfehler: ${err.message}`, 'error');
      }
    },
    'show-backups': () => {
      const backups = getLocalBackups();
      if (backups.length === 0) {
        showToast('Keine lokalen Sicherungen gefunden', 'info');
        return;
      }

      const list = document.createElement('div');
      list.style.cssText = 'max-height: 400px; overflow-y: auto;';

      backups.forEach((backup) => {
        const item = document.createElement('div');
        item.style.cssText = 'padding: 12px; border-bottom: 1px solid var(--color-border); display: flex; justify-content: space-between; align-items: center;';
        item.innerHTML = `
          <div>
            <strong>${backup.name}</strong><br/>
            <small style="color: var(--color-muted);">${new Date(backup.timestamp).toLocaleString('de-DE')}</small>
          </div>
          <button style="padding: 6px 12px; background: var(--color-primary); color: white; border: none; border-radius: 4px; cursor: pointer;">
            Wiederherstellen
          </button>
        `;
        list.appendChild(item);
      });

      const dialog = document.createElement('dialog');
      dialog.className = 'ss-dialog';
      dialog.style.cssText = 'width: 90vw; max-width: 500px;';
      dialog.innerHTML = '<h3>💾 Lokale Sicherungen</h3>';
      dialog.appendChild(list);
      document.body.appendChild(dialog);
      dialog.showModal();
      dialog.addEventListener('close', () => dialog.remove());
    },
    'community': () => {
      const container = document.createElement('div');
      container.style.cssText = 'max-height: 80vh; overflow-y: auto; padding: 20px;';

      const banner = createCommunityStatsBanner();
      const trending = createCommunityTrendingPanel();
      const search = createCommunitySearchPanel();

      container.appendChild(banner);
      container.appendChild(trending);
      container.appendChild(search);

      const dialog = document.createElement('dialog');
      dialog.className = 'ss-dialog';
      dialog.style.cssText = 'width: 90vw; max-width: 900px;';
      dialog.appendChild(container);
      document.body.appendChild(dialog);
      dialog.showModal();
      dialog.addEventListener('close', () => dialog.remove());
    },
    'profile': () => {
      // Generate or get current user ID (in real app, from auth)
      const userId = localStorage.getItem(USER_ID_STORAGE_KEY) || 'user_' + Date.now();
      localStorage.setItem(USER_ID_STORAGE_KEY, userId);

      let profile = getUserProfile(userId);
      if (!profile) {
        profile = createUserProfile('collector', 'Pokémon Sammler', 'Meine Pokémon TCG Collection');
        localStorage.setItem(USER_ID_STORAGE_KEY, profile.userId);
      }

      const card = createUserProfileCard(profile.userId, profile.userId);

      const dialog = document.createElement('dialog');
      dialog.className = 'ss-dialog';
      dialog.style.cssText = 'width: 90vw; max-width: 500px;';
      dialog.appendChild(card);
      document.body.appendChild(dialog);
      dialog.showModal();
      dialog.addEventListener('close', () => dialog.remove());
    },
    'publish-collection': () => {
      if (!state.allSets || state.allSets.length === 0) {
        showToast('Keine Sets zum Veröffentlichen', 'error');
        return;
      }

      const userId = localStorage.getItem(USER_ID_STORAGE_KEY) || 'user_' + Date.now();
      const collectionData = {}; // Würde echte Collection laden

      const form = document.createElement('div');
      form.style.cssText = 'padding: 20px;';

      const titleEl = document.createElement('input');
      titleEl.type = 'text';
      titleEl.placeholder = 'Collection-Titel';
      titleEl.value = 'Meine Pokémon Collection';
      titleEl.style.cssText = 'width: 100%; padding: 10px; border: 1px solid var(--color-border); border-radius: 6px; margin-bottom: 12px;';

      const descEl = document.createElement('textarea');
      descEl.placeholder = 'Beschreibung...';
      descEl.style.cssText = 'width: 100%; padding: 10px; border: 1px solid var(--color-border); border-radius: 6px; margin-bottom: 12px; min-height: 100px;';

      const publishBtn = document.createElement('button');
      publishBtn.textContent = '🌍 Veröffentlichen';
      publishBtn.style.cssText = `
        width: 100%;
        padding: 12px;
        background: var(--color-primary);
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-weight: bold;
      `;

      publishBtn.addEventListener('click', () => {
        const share = createPublicShare(userId, collectionData, state.allSets, titleEl.value, descEl.value);
        if (share) {
          showToast('✅ Collection veröffentlicht!', 'success', 3000);
          publishBtn.textContent = '✅ Veröffentlicht!';
          setTimeout(() => dialog.close(), 1500);
        } else {
          showToast('Fehler beim Veröffentlichen', 'error');
        }
      });

      form.appendChild(titleEl);
      form.appendChild(descEl);
      form.appendChild(publishBtn);

      const dialog = document.createElement('dialog');
      dialog.className = 'ss-dialog';
      dialog.style.cssText = 'width: 90vw; max-width: 500px;';
      dialog.innerHTML = '<h3>🌍 Collection veröffentlichen</h3>';
      dialog.appendChild(form);
      document.body.appendChild(dialog);
      dialog.showModal();
      dialog.addEventListener('close', () => dialog.remove());
    },
    'trending': () => {
      const trending = getTrendingCollections(20);

      const container = document.createElement('div');
      container.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; padding: 20px;';

      if (trending.length === 0) {
        container.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--color-muted);">Noch keine Collections veröffentlicht</p>';
      } else {
        trending.forEach((share) => {
          const card = createSharedCollectionCard(share);
          container.appendChild(card);
        });
      }

      const dialog = document.createElement('dialog');
      dialog.className = 'ss-dialog';
      dialog.style.cssText = 'width: 90vw; max-width: 1000px; max-height: 80vh; overflow-y: auto;';
      dialog.innerHTML = '<h3 style="padding: 20px; margin: 0; border-bottom: 1px solid var(--color-border);">🔥 Trending Collections</h3>';
      dialog.appendChild(container);
      document.body.appendChild(dialog);
  
      dialog.showModal();
      dialog.addEventListener('close', () => dialog.remove());
    },
    'marketplace': () => {
      const dialog = document.createElement('dialog');
      dialog.className = 'ss-dialog';
      dialog.style.cssText = 'width: 90vw; max-width: 1200px; max-height: 80vh; overflow-y: auto;';
      
      const container = document.createElement('div');
      container.style.cssText = 'padding: 20px;';
      
      const statsCard = createTradeStatsCard('current-user');
      const marketplace = createTradeMarketplacePanel();
      const suggestions = createTradeSuggestionsPanel('current-user', []);
      
      container.appendChild(statsCard);
      container.appendChild(marketplace);
      container.appendChild(suggestions);
      
      dialog.innerHTML = '<h3 style="padding: 20px 20px 0 20px; margin: 0; border-bottom: 1px solid var(--color-border);">💱 Trading Marketplace</h3>';
      dialog.appendChild(container);
      document.body.appendChild(dialog);
      dialog.showModal();
      dialog.addEventListener('close', () => dialog.remove());
    },
    'wanted': () => {
      const dialog = document.createElement('dialog');
      dialog.className = 'ss-dialog';
      
      const container = document.createElement('div');
      container.style.cssText = 'padding: 20px;';
      container.appendChild(createWantedCardsPanel());
      
      dialog.innerHTML = '<h3 style="padding: 20px 20px 0 20px; margin: 0; border-bottom: 1px solid var(--color-border);">🎯 Gesuchte Karten</h3>';
      dialog.appendChild(container);
      document.body.appendChild(dialog);
      dialog.showModal();
      dialog.addEventListener('close', () => dialog.remove());
    },
    'rarity': () => {
      const dialog = document.createElement('dialog');
      dialog.className = 'ss-dialog';
      
      const availableRarities = getAvailableRarities();
      
      const container = document.createElement('div');
      container.style.cssText = 'padding: 20px;';
      
      const header = document.createElement('div');
      header.style.cssText = 'margin-bottom: 20px;';
      header.innerHTML = '<h4>Verfügbare Raritäten</h4>';
      container.appendChild(header);
      
      const grid = document.createElement('div');
      grid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px;';
      
      availableRarities.forEach((rarity) => {
        const btn = document.createElement('button');
        btn.className = 'btn-secondary';
        btn.style.cssText = 'padding: 12px; cursor: pointer;';
        btn.textContent = `${rarity.emoji} ${rarity.name}`;
        btn.addEventListener('click', () => {
          console.log(`Filtere nach Raritär: ${rarity.id}`);
        });
        grid.appendChild(btn);
      });
      
      container.appendChild(grid);
      
      dialog.innerHTML = '<h3 style="padding: 20px 20px 0 20px; margin: 0; border-bottom: 1px solid var(--color-border);">✨ Raritätsfilter</h3>';
      dialog.appendChild(container);
      document.body.appendChild(dialog);
      dialog.showModal();
      dialog.addEventListener('close', () => dialog.remove());
    },
    'collection-value': () => {
      const dialog = document.createElement('dialog');
      dialog.className = 'ss-dialog';
      
      const container = document.createElement('div');
      container.style.cssText = 'padding: 20px;';
      
      // Placeholder - würde in vollständiger Integration die echten Cards verwenden
      const stats = getCollectionValueStats([]);
      
      const info = document.createElement('div');
      info.style.cssText = 'background: var(--bg-secondary); padding: 16px; border-radius: 8px; text-align: center;';
      info.innerHTML = `
        <h3>Kollektionswert</h3>
        <div style="font-size: 2em; font-weight: bold; color: var(--color-success); margin: 10px 0;">
          €${stats.totalValue?.toFixed(2) || '0.00'}
        </div>
        <div style="color: var(--text-secondary);">
          <p>Karten: ${stats.cardCount || 0}</p>
          <p>Durchschnittswert: €${stats.averageValue?.toFixed(2) || '0.00'}</p>
        </div>
      `;
      
      container.appendChild(info);
      
      dialog.innerHTML = '<h3 style="padding: 20px 20px 0 20px; margin: 0; border-bottom: 1px solid var(--color-border);">💰 Kollektionswert</h3>';
      dialog.appendChild(container);
      document.body.appendChild(dialog);
      dialog.showModal();
      dialog.addEventListener('close', () => dialog.remove());
    },
    'live-dashboard': () => {
      const dialog = document.createElement('dialog');
      dialog.className = 'ss-dialog';
      dialog.style.cssText = 'width: 90vw; max-width: 900px; max-height: 80vh; overflow-y: auto;';

      const body = document.createElement('div');
      body.style.cssText = 'padding: 20px; display: grid; gap: 12px;';

      const headline = document.createElement('div');
      headline.style.cssText = 'padding: 12px; border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-bg-secondary);';
      body.appendChild(headline);

      const metricsGrid = document.createElement('div');
      metricsGrid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px;';
      body.appendChild(metricsGrid);

      const refreshUI = () => {
        const metrics = getEngineMetrics();
        const market = getTradePlaceSummary();
        const summaryRows = state.summaryData || [];
        const totals = summaryRows.reduce((acc, row) => {
          acc.total += Number(row.total || 0);
          acc.collected += Number(row.collected || 0);
          acc.rh += Number(row.rh || 0);
          return acc;
        }, { total: 0, collected: 0, rh: 0 });

        const progress = totals.total > 0 ? Math.round((totals.collected / totals.total) * 100) : 0;

        headline.innerHTML = `
          <div style="font-weight: 700;">📡 Live Dashboard</div>
          <div style="color: var(--color-muted); font-size: 13px;">Aktualisiert: ${new Date().toLocaleTimeString('de-DE')}</div>
        `;

        const cards = [
          ['Status', metrics.status === 'online' ? '🟢 Online' : '🔴 Offline'],
          ['Cache Hit Rate', `${metrics.cacheHitRate}%`],
          ['Gesamtfortschritt', `${progress}%`],
          ['Gesammelt', `${totals.collected} / ${totals.total}`],
          ['Reverse Holos', `${totals.rh}`],
          ['Aktive Angebote', `${market.activeOffers || 0}`],
          ['Gesuchte Karten', `${market.totalWantedCards || 0}`],
          ['Queue', `${(metrics.syncQueue || []).length}`]
        ];

        metricsGrid.innerHTML = cards.map(([label, value]) => `
          <div style="padding: 12px; border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-bg-secondary);">
            <div style="font-size: 12px; color: var(--color-muted);">${label}</div>
            <div style="font-size: 20px; font-weight: 700; margin-top: 4px;">${value}</div>
          </div>
        `).join('');
      };

      refreshUI();
      const timer = setInterval(refreshUI, 3000);

      dialog.innerHTML = '<h3 style="padding: 20px 20px 0 20px; margin: 0; border-bottom: 1px solid var(--color-border);">📊 Advanced Live Dashboard</h3>';
      dialog.appendChild(body);
      document.body.appendChild(dialog);
      dialog.showModal();
      dialog.addEventListener('close', () => {
        clearInterval(timer);
        dialog.remove();
      });
    }
  };
  try {
    initCommandPalette(commandHandlers);
    console.log('✅ Command Palette initialized');
  } catch (err) {
    console.warn('⚠️ Command Palette init failed:', err);
  }

  // Start Smart Engine metrics update loop
  setInterval(() => {
    try {
      const metrics = getEngineMetrics();
      const metricsEl = document.getElementById('engine-metrics');
      if (metricsEl) {
        metricsEl.classList.remove('hidden');
        const rateEl = document.getElementById('metric-cache-rate');
        const statusEl = document.getElementById('metric-api-status');
        if (rateEl) rateEl.textContent = metrics.cacheHitRate;
        if (statusEl) statusEl.textContent = metrics.status === 'online' ? '🟢 online' : '🔴 offline';
      }
    } catch (err) {
      console.warn('[metrics update]', err);
    }
  }, 5000);

  document.querySelectorAll('.nav-link').forEach((link) => {
    link.addEventListener('click', (e) => { e.preventDefault(); navigate(link.dataset.view); });
  });
  window.addEventListener('hashchange', handleRouteChange);

  setLoading(true, 'Initialisiere\u2026');
  setGlobalStatus('Initialisiere Google API\u2026');

  try {
    const autoLoggedIn = await initAuth();

    dom.login.addEventListener('click', async () => {
      dom.login.disabled = true;
      const ok = await signIn();
      if (!ok) { dom.login.disabled = false; showToast('Login fehlgeschlagen.', 'error'); setGlobalStatus('Login fehlgeschlagen.'); return; }
      onLoginSuccess();
    });

    dom.logout.addEventListener('click', () => { signOut(); resetToLoggedOut(); });

    dom.load.addEventListener('click', async () => {
      if (!isSignedIn()) return;
      const setId = dom.selector.value;
      if (setId) navigate(`set/${setId}`);
      await loadCurrentSet(false);
    });

    dom.refresh.addEventListener('click', async () => {
      if (!isSignedIn() || !state.currentSet) return;
      await loadCurrentSet(true);
    });

    dom.selector.addEventListener('change', () => {
      const setId = dom.selector.value;
      if (setId) {
        navigate(`set/${setId}`);
        return;
      }
      state.currentSet = null; state.cards = []; state.dbMap = new Map();
      dom.cards.innerHTML = '';
      dom.statsSection.classList.add('hidden');
      dom.filterSection.classList.add('hidden');
      dom.sortSection.classList.add('hidden');
      dom.setLogoWrap.classList.add('hidden');
      setEmptyState(true);
    });

    dom.btnMissingExport.addEventListener('click', exportMissingCards);

    if (autoLoggedIn) { onLoginSuccess(); }
    else { setLoading(false); setGlobalStatus('Bereit. Bitte anmelden.'); showView('dashboard'); }
  } catch (err) {
    setLoading(false);
    showToast(`Init-Fehler: ${err.message}`, 'error');
    setGlobalStatus(`Fehler: ${err.message}`);
  }
}

async function onLoginSuccess() {
  state.loggedIn = true;
  dom.login.disabled = true; dom.logout.disabled = false;
  renderRecentSets();
  if (!CONFIG.SPREADSHEET_ID) { openSpreadsheetDialog(true); setLoading(false); return; }
  updateSpreadsheetInfoBar();
  await loadSets();
}

function resetToLoggedOut() {
  state.loggedIn = false; state.sets = []; state.allSets = []; state.currentSet = null;
  state.dbMap = new Map(); state.cards = []; state.summaryData = null;
  dom.cards.innerHTML = '';
  dom.selector.innerHTML = '<option value="">Bitte w\u00e4hlen\u2026</option>';
  dom.selector.disabled = true; dom.load.disabled = true; dom.refresh.disabled = true;
  dom.login.disabled = false; dom.logout.disabled = true;
  dom.statsSection.classList.add('hidden');
  dom.filterSection.classList.add('hidden');
  dom.sortSection.classList.add('hidden');
  dom.setLogoWrap.classList.add('hidden');
  dom.spreadsheetInfo.classList.add('hidden');
  dom.mainNav.classList.add('hidden');
  renderRecentSets();
  setEmptyState(true);
  setGlobalStatus('Abgemeldet.');
  showView('dashboard');
  dom.dashboardGrid.innerHTML = '<p class="empty-state">Bitte anmelden.</p>';
}

bootstrap().catch((err) => {
  console.error(err);
  setGlobalStatus(`Fehler: ${err.message}`);
  setLoading(false);
});

// ══════════════════════════════════════════════════════════════════════════
// SERVICE WORKER REGISTRATION
// ══════════════════════════════════════════════════════════════════════════

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('./service-worker.js', {
        scope: './'
      });
      console.log('✅ Service Worker registered:', registration);
      
      // Check for updates periodically
      setInterval(() => {
        registration.update().catch(err => console.warn('SW update check failed:', err));
      }, 60000); // Check every minute
      
      // Handle controller change (new SW ready)
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        showToast('🔄 App wurde aktualisiert', 'success', 3000);
      });
      
      // Listen for messages from Service Worker
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data.type === 'sync-complete') {
          showToast('✅ Daten synchronisiert', 'success', 2000);
        }
      });
    } catch (err) {
      console.warn('Service Worker registration failed:', err);
    }
  });
}

// PWA Install Prompt Handler
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  
  // Show install button
  const installBtn = document.createElement('button');
  installBtn.className = 'btn-primary';
  installBtn.textContent = '📱 App installieren';
  installBtn.style.cssText = 'position: fixed; bottom: 20px; right: 20px; z-index: 100;';
  
  installBtn.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        showToast('✅ App installiert!', 'success', 3000);
      }
      deferredPrompt = null;
    }
  });
  
  // Only show if not already installed
  if (document.body && !navigator.standalone) {
    document.body.appendChild(installBtn);
  }
});

// Handle app installed event
window.addEventListener('appinstalled', () => {
  console.log('✅ PWA installfiert');
  showToast('🎉 App erfolgreich installiert!', 'success', 4000);
});

