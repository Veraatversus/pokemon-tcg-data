import { initAuth, signIn, signOut, isSignedIn } from './core/auth.js?v=20260506d';
import {
  listImportedSets,
  listSetsOverviewData,
  readSetCollectionMap,
  readDbCardsForSet,
  ensureCollectionEntry,
  updateCellBoolean,
  updateCellBooleansBatch,
  readSummarySheet,
  readSettings,
  writeSetting,
  importSetIntoCollection,
  upsertOverviewSet,
  syncOverviewWithApiSets,
  resetSheetsDataCaches,
} from './data/sheets-db.js?v=20260407-login1';
import { fetchMergedCards, fetchMergedCardsWithSetMeta, fetchAllAvailableSets, runPokecodeParityCheck } from './data/pokemon-api.js?v=20260507a';
import { resolveSeriesGroupInfo } from './data/schema-contract.js?v=20260507a';
import {
  buildCombinedSearchDropdownOptions,
  createSpreadsheetSwitchStatePatch,
  normalizeCardNumber,
  resolveCombinedSearchSelection,
  toBoolean
} from './core/utils.js?v=20260407-searchscope1';
import { getCollectionUiState, resolveCollectionToggleState } from './core/collection-state.js?v=20260507c';
import * as cache from './core/cache.js';
import { CONFIG, scopedStorageKey } from './core/config.js';
import {
  initSmartEngine,
  startAutoHealing,
  fuzzySearch,
  getEngineMetrics,
  cacheCardsOffline,
  getCachedCardsOffline
} from './features/search/index.js';
import {
  createAutoSnapshot,
  loadSnapshots
} from './features/collection/index.js';
import {
  loadLegacyWorkbookFromFile,
  loadLegacyWorkbookFromSpreadsheetInput,
  parseLegacyWorkbook,
  buildLegacyImportPlan,
  summarizeLegacyImportPlan,
  pickCanonicalCardId,
  extractLegacySpreadsheetId
} from './features/collection/legacy-import.js?v=20260508a';
import { initCommandPalette } from './ui/command-palette.js';
import { filterSetsBySeriesKey, getStatsSeriesLabel } from './ui/stats-series.js?v=20260407a';
import {
  loadFavorites, saveFavorites, toggleFavorite, isFavorite,
  loadSearchHistory, addSearchHistory, clearSearchHistory,
  createCollectionSnapshot, generateCollectionReport,
  loadSettings, saveSettings, updateSetting,
  applyQuickFilters, calculateCollectionStats,
  getSyncStatus, setSyncStatus
} from './enhanced-features.js?v=20260506b';

import {
  initQuickFiltersUI, createSearchHistoryWidget, createStatisticsPanel,
  createExportDialog, createSettingsPanel,
  createBulkActionsToolbar
} from './ui/components.js?v=20260506b';
import {
  AdvancedSearch, SyncIndicator, CardCollectionTools,
  generateCollectionInsights, generateSetComparison,
  NotificationManager, PerformanceTracker
} from './ui/tools.js';
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
  downloadJson, downloadCsv,
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
} from './features/community/index.js';
// ══════════════════════════════════════════════════════════════════════════
// DOM-REFERENZEN
// ══════════════════════════════════════════════════════════════════════════
const dom = {
  // Global
  auth:             document.getElementById('btn-auth'),
  btnOpenSettings:  document.getElementById('btn-open-settings'),
  topbar:           document.querySelector('.topbar'),
  mainNav:          document.getElementById('main-nav'),
  navSetLink:       document.getElementById('nav-set-link'),
  navSetSplit:      document.getElementById('nav-set-split'),
  btnNavSetToggle:  document.getElementById('btn-nav-set-toggle'),
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
  btnManageImportedSets: document.getElementById('btn-manage-imported-sets'),
  btnSheetsRetryReport: document.getElementById('btn-sheets-retry-report'),
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
  btnImportLegacyXlsx: document.getElementById('btn-import-legacy-xlsx'),
  btnImportLegacySheet: document.getElementById('btn-import-legacy-sheet'),
  backupFileInput: document.getElementById('input-backup-file'),
  legacyImportFileInput: document.getElementById('input-legacy-import-file'),
  legacySheetDialog: document.getElementById('dialog-legacy-sheet-import'),
  legacySheetInput: document.getElementById('input-legacy-sheet-link'),
  legacySheetError: document.getElementById('legacy-sheet-import-error'),
  btnLegacySheetCancel: document.getElementById('btn-legacy-sheet-cancel'),
  btnLegacySheetImportConfirm: document.getElementById('btn-legacy-sheet-import-confirm'),
  manageSetsDialog: document.getElementById('dialog-manage-sets'),
  manageSetsSearch: document.getElementById('manage-sets-search-input'),
  manageSetsList: document.getElementById('manage-sets-list'),
  manageSetsInfo: document.getElementById('manage-sets-info'),
  btnManageSetsSelectVisible: document.getElementById('btn-manage-sets-select-visible'),
  btnManageSetsClearSelection: document.getElementById('btn-manage-sets-clear-selection'),
  btnManageSetsReimportSelected: document.getElementById('btn-manage-sets-reimport-selected'),
  btnManageSetsDeleteSelected: document.getElementById('btn-manage-sets-delete-selected'),
  btnManageSetsCancel: document.getElementById('btn-manage-sets-cancel'),
  sheetsRetryDialog: document.getElementById('dialog-sheets-retry-report'),
  sheetsRetryStats: document.getElementById('sheets-retry-stats'),
  sheetsRetryHistory: document.getElementById('sheets-retry-history'),
  btnSheetsRetryReset: document.getElementById('btn-sheets-retry-reset'),
  btnSheetsRetryClose: document.getElementById('btn-sheets-retry-close'),
  dashboardGrid:    document.getElementById('dashboard-grid'),
  // Set detail – sidebar
  selector:         document.getElementById('set-selector'),
  load:             document.getElementById('btn-load'),
  refresh:          document.getElementById('btn-refresh'),
  refreshSplit:     document.getElementById('refresh-split'),
  btnRefreshMenu:   document.getElementById('btn-refresh-menu'),
  refreshMenu:      document.getElementById('refresh-menu'),
  btnRefreshReimport: document.getElementById('btn-refresh-reimport'),
  status:           document.getElementById('status'),
  saveStatePill:    document.getElementById('save-state-pill'),
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
  btnUndoLast:      document.getElementById('btn-undo-last'),
  btnAuditPanel:    document.getElementById('btn-audit-panel'),
  btnMissingExport: document.getElementById('btn-missing-export'),
  bulkToolbar:      document.getElementById('bulk-toolbar'),
  bulkCount:        document.getElementById('bulk-count'),
  btnBulkMarkG:     document.getElementById('btn-bulk-mark-g'),
  btnBulkMarkRh:    document.getElementById('btn-bulk-mark-rh'),
  btnBulkUnmark:    document.getElementById('btn-bulk-unmark'),
  btnBulkCancel:    document.getElementById('btn-bulk-cancel'),
  auditPanel:       document.getElementById('audit-panel'),
  auditList:        document.getElementById('audit-list'),
  btnAuditClear:    document.getElementById('btn-audit-clear'),
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
  lightboxImageDialog: document.getElementById('dialog-lightbox-image'),
  lightboxImageStage: document.getElementById('lightbox-image-stage'),
  lightboxImageFull: document.getElementById('lightbox-image-full'),
  btnLightboxImageClose: document.getElementById('btn-lightbox-image-close'),
  // Stats view
  statsContent:     document.getElementById('stats-content'),
  // Search view
  searchInput:      document.getElementById('search-input'),
  searchSetFilter:  document.getElementById('search-set-filter'),
  searchScopeMode:  document.getElementById('search-scope-mode'),
  searchResults:    document.getElementById('search-results'),
  searchToolbarMeta: document.getElementById('search-toolbar-meta'),
};

// ══════════════════════════════════════════════════════════════════════════
// APP-STATE
// ══════════════════════════════════════════════════════════════════════════
const state = {
  loggedIn:     false,
  sets:         [],
  allSets:      [],
  summaryData:  null,
  summaryOverrides: new Map(),
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
  pendingSearchCardFocusKey: null,
  autoImportJobs: new Map(),
  autoImportQueue: Promise.resolve(),
  autoImportQueuedSetIds: [],
  autoImportActiveSetId: null,
  autoImportLastLimitToastAt: 0,
  autoImportRefreshTimer: null,
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
  pendingWrites: 0,
  lastSaveError: null,
  saveStateTimer: null,
  manageSetsSelection: new Set(),
  sheetsRetryMetrics: {
    totalWrites: 0,
    totalRetries: 0,
    totalFailures: 0,
    maxAttemptSeen: 0,
    events: []
  },
  undoStack: [],
  auditEntries: [],
  devCompletionMode: false,
};

let focusedCardIndex = -1;

const LOADING_MAX_BLOCK_MS = 12000;
let loadingFailsafeTimer = null;

const QUEUE_PRESETS_STORAGE_KEY = scopedStorageKey('queue_presets_v1');
const DASHBOARD_PREFS_STORAGE_KEY = scopedStorageKey('dashboard_prefs_v1');
const RECENT_SETS_STORAGE_KEY = scopedStorageKey('recent_sets_v1');
const REALTIME_CLIENT_STORAGE_KEY = scopedStorageKey('realtime_client_id');
const USER_ID_STORAGE_KEY = scopedStorageKey('user_id');
const DEV_COMPLETION_STORAGE_KEY = scopedStorageKey('dev_completion_mode');
const DASHBOARD_VIRTUAL_PAGE_SIZE = 180;
const SEARCH_INPUT_DEBOUNCE_MS = 900;
const DASHBOARD_VIRTUAL_THRESHOLD = 220;
const SEARCH_SCOPE_IMPORTED = 'imported';
const SEARCH_SCOPE_ALL = 'all';
const SEARCH_SCOPE_ONLINE = 'online';
const AUTO_IMPORT_MODE_JUMP = 'jump';
const AUTO_IMPORT_MODE_NEVER = 'never';
const AUTO_IMPORT_MODE_ALWAYS = 'always';
const AUTO_IMPORT_QUEUE_LIMIT = 3;

function normalizeAutoImportMode(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === AUTO_IMPORT_MODE_NEVER || normalized === AUTO_IMPORT_MODE_ALWAYS) return normalized;
  return AUTO_IMPORT_MODE_JUMP;
}

function getAutoImportMode() {
  return normalizeAutoImportMode(loadSettings().autoImportMode);
}

function getAutoImportModeLabel(mode = getAutoImportMode()) {
  if (mode === AUTO_IMPORT_MODE_NEVER) return 'Nie';
  if (mode === AUTO_IMPORT_MODE_ALWAYS) return 'Immer';
  return 'Nur bei „Zum Set“';
}

function shouldAutoImportCurrentSet(set, { fromSearchJump = false } = {}) {
  const mode = getAutoImportMode();
  if (mode === AUTO_IMPORT_MODE_NEVER) return false;
  if (mode === AUTO_IMPORT_MODE_ALWAYS) return !Boolean(set?.imported);
  return Boolean(fromSearchJump);
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
  const waitingLabel = queuedIds.length ? ` • ${queuedIds.length} wartend` : '';
  dom.jobStatusText.textContent = `${activeLabel}${waitingLabel} • Modus: ${getAutoImportModeLabel()}`;
  if (dom.btnJobCancel) dom.btnJobCancel.disabled = true;
}

function getSearchSelectionState() {
  const fallbackValue = `scope:${SEARCH_SCOPE_IMPORTED}`;
  return resolveCombinedSearchSelection(dom.searchSetFilter?.value || fallbackValue, SEARCH_SCOPE_IMPORTED);
}

function getSearchScopeMode() {
  const { mode } = getSearchSelectionState();
  if (mode === SEARCH_SCOPE_ALL || mode === SEARCH_SCOPE_ONLINE) {
    return mode;
  }
  return SEARCH_SCOPE_IMPORTED;
}

function getSearchSetFilterValue() {
  return getSearchSelectionState().setId || '';
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
    return !toBoolean(set?.imported);
  }
  return false;
}

function getSearchModeMeta(mode) {
  if (mode === SEARCH_SCOPE_ONLINE) {
    return {
      label: '⚡ Modus: Online-Suche',
      className: 'online',
      hint: 'Nur API für alle Sets'
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

  const previousValue = String(dom.searchSetFilter.value || `scope:${SEARCH_SCOPE_IMPORTED}`);
  const previousSelection = resolveCombinedSearchSelection(previousValue, SEARCH_SCOPE_IMPORTED);
  const desiredValue = previousSelection.setId || `scope:${previousSelection.mode}`;
  const groups = buildCombinedSearchDropdownOptions(state.sets || []);
  const availableValues = [];

  dom.searchSetFilter.innerHTML = '';
  groups.forEach((group) => {
    const options = Array.isArray(group?.options) ? group.options : [];
    if (!options.length) return;

    const optgroup = document.createElement('optgroup');
    optgroup.label = group.label || '';

    options.forEach((entry) => {
      const opt = document.createElement('option');
      opt.value = entry.value;
      opt.textContent = entry.label;
      if (entry.disabled) opt.disabled = true;
      optgroup.appendChild(opt);
      availableValues.push(entry.value);
    });

    dom.searchSetFilter.appendChild(optgroup);
  });

  const fallbackValue = `scope:${SEARCH_SCOPE_IMPORTED}`;
  dom.searchSetFilter.value = availableValues.includes(desiredValue) ? desiredValue : fallbackValue;

  if (dom.searchScopeMode) {
    dom.searchScopeMode.value = getSearchScopeMode();
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
  const recent = Array.isArray(state.recentSets) ? state.recentSets : [];
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
  const pushRetryEvent = (type, details = {}) => {
    const metrics = state.sheetsRetryMetrics;
    const entry = {
      type,
      at: new Date().toISOString(),
      ...details
    };
    metrics.events.unshift(entry);
    if (metrics.events.length > 120) metrics.events.length = 120;
    renderSheetsRetryReport();
  };

  window.addEventListener('sheets-write-retry', (event) => {
    const details = event?.detail || {};
    state.sheetsRetryMetrics.totalRetries += 1;
    state.sheetsRetryMetrics.maxAttemptSeen = Math.max(
      state.sheetsRetryMetrics.maxAttemptSeen,
      Number(details.attempt || 0)
    );
    pushRetryEvent('retry', {
      range: details.range || '',
      attempt: Number(details.attempt || 0),
      maxRetries: Number(details.maxRetries || 0),
      delayMs: Number(details.delayMs || 0),
      status: details.status || null
    });
    const retryLabel = `${details.attempt || '?'} / ${details.maxRetries || '?'}`;
    const waitSeconds = Math.max(1, Math.ceil((Number(details.delayMs) || 0) / 1000));
    const message = `Sheets-Write Retry ${retryLabel} (warte ${waitSeconds}s)`;
    setGlobalStatus(message);
    if (state.activeJob) {
      updateJob(state.activeJob, state.activeJob.current, message);
    }
  });

  window.addEventListener('sheets-write-success', (event) => {
    const details = event?.detail || {};
    state.sheetsRetryMetrics.totalWrites += 1;
    state.sheetsRetryMetrics.maxAttemptSeen = Math.max(
      state.sheetsRetryMetrics.maxAttemptSeen,
      Number(details.attemptsUsed || 1)
    );
    if (Number(details.attemptsUsed || 1) > 1) {
      pushRetryEvent('recovered', {
        range: details.range || '',
        attemptsUsed: Number(details.attemptsUsed || 1)
      });
    }
  });

  window.addEventListener('sheets-write-failed', (event) => {
    const details = event?.detail || {};
    state.sheetsRetryMetrics.totalFailures += 1;
    pushRetryEvent('failed', {
      range: details.range || '',
      status: details.status || null,
      message: details.message || ''
    });
    const message = `Sheets-Write fehlgeschlagen (${details.status || 'unbekannt'}): ${details.range || 'Range unbekannt'}`;
    setGlobalStatus(message);
    if (state.activeJob) {
      updateJob(state.activeJob, state.activeJob.current, message);
    }
  });
}

function resetSheetsRetryMetrics() {
  state.sheetsRetryMetrics = {
    totalWrites: 0,
    totalRetries: 0,
    totalFailures: 0,
    maxAttemptSeen: 0,
    events: []
  };
  renderSheetsRetryReport();
}

function renderSheetsRetryReport() {
  if (dom.sheetsRetryStats) {
    const metrics = state.sheetsRetryMetrics;
    const retryRate = metrics.totalWrites > 0
      ? Math.round((metrics.totalRetries / metrics.totalWrites) * 100)
      : 0;
    dom.sheetsRetryStats.innerHTML = `
      <li><strong>Writes:</strong> ${metrics.totalWrites}</li>
      <li><strong>Retries:</strong> ${metrics.totalRetries}</li>
      <li><strong>Failures:</strong> ${metrics.totalFailures}</li>
      <li><strong>Retry-Rate:</strong> ${retryRate}%</li>
      <li><strong>Max Attempts:</strong> ${metrics.maxAttemptSeen || 1}</li>
    `;
  }

  if (dom.sheetsRetryHistory) {
    const events = state.sheetsRetryMetrics.events || [];
    if (!events.length) {
      dom.sheetsRetryHistory.innerHTML = '<li class="retry-empty">Noch keine Sheets-Retry-Ereignisse.</li>';
      return;
    }
    dom.sheetsRetryHistory.innerHTML = events.map((entry) => {
      const time = new Date(entry.at).toLocaleTimeString('de-DE');
      const kind = entry.type === 'failed' ? 'Fehler' : entry.type === 'recovered' ? 'Erholt' : 'Retry';
      const detail = entry.type === 'retry'
        ? `Versuch ${entry.attempt || '?'} / ${entry.maxRetries || '?'} · ${(Math.ceil((entry.delayMs || 0) / 1000) || 0)}s`
        : entry.type === 'failed'
          ? `${entry.status || 'unbekannt'} · ${entry.message || 'ohne Fehlermeldung'}`
          : `nach ${entry.attemptsUsed || '?'} Versuchen erfolgreich`;
      return `<li class="retry-entry ${entry.type}"><span class="retry-time">${time}</span><span class="retry-kind">${kind}</span><span class="retry-detail">${detail}</span><span class="retry-range">${entry.range || 'Range unbekannt'}</span></li>`;
    }).join('');
  }
}

function openSheetsRetryReportDialog() {
  if (!dom.sheetsRetryDialog) return;
  renderSheetsRetryReport();
  dom.sheetsRetryDialog.showModal();
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
  if (!dom.loadingOverlay) return;
  // OVERLAY DISABLED: Always hide immediately – start directly on page
  dom.loadingOverlay.classList.add('hidden');
  dom.loadingOverlay.setAttribute('aria-hidden', 'true');
}

function showToast(message, type = 'info', durationMs = 3000) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  dom.toastContainer.appendChild(el);
  setTimeout(() => el.remove(), durationMs);
}

function pushAuditEntry(kind, message) {
  const entry = {
    kind,
    message: String(message || '').trim(),
    at: new Date().toISOString()
  };
  state.auditEntries.unshift(entry);
  if (state.auditEntries.length > 80) state.auditEntries.length = 80;
  renderAuditPanel();
}

function renderAuditPanel() {
  if (!dom.auditList) return;
  const rows = state.auditEntries || [];
  if (!rows.length) {
    dom.auditList.innerHTML = '<li class="audit-empty">Noch keine Einträge.</li>';
    return;
  }
  dom.auditList.innerHTML = rows.map((entry) => {
    const time = new Date(entry.at).toLocaleTimeString('de-DE');
    const safeKind = String(entry.kind || 'info').replace(/[^a-z-]/gi, '').toLowerCase();
    return `<li class="audit-entry ${safeKind}"><span class="audit-time">${time}</span><span class="audit-msg">${entry.message}</span></li>`;
  }).join('');
}

function updateSaveStatePill() {
  if (!dom.saveStatePill) return;
  const pending = Number(state.pendingWrites || 0);
  dom.saveStatePill.classList.remove('is-pending', 'is-error', 'is-saved');

  if (pending > 0) {
    dom.saveStatePill.textContent = `Speichert… (${pending})`;
    dom.saveStatePill.classList.add('is-pending');
    return;
  }

  if (state.lastSaveError) {
    dom.saveStatePill.textContent = 'Speicherfehler';
    dom.saveStatePill.classList.add('is-error');
    return;
  }

  dom.saveStatePill.textContent = 'Gespeichert';
  dom.saveStatePill.classList.add('is-saved');
}

function setCardSaveState(article, mode = '') {
  if (!article) return;
  const checks = article.querySelector('.checks');
  if (!checks) return;
  checks.classList.remove('is-saving', 'is-error', 'is-saved');
  if (mode === 'saving') checks.classList.add('is-saving');
  if (mode === 'error') checks.classList.add('is-error');
  if (mode === 'saved') {
    checks.classList.add('is-saved');
    window.setTimeout(() => {
      checks.classList.remove('is-saved');
    }, 1000);
  }
}

function beginTrackedWrite(label) {
  state.pendingWrites = Math.max(0, Number(state.pendingWrites || 0)) + 1;
  state.lastSaveError = null;
  updateSaveStatePill();
  if (label) pushAuditEntry('info', `Start: ${label}`);
}

function finishTrackedWrite(label, error = null) {
  state.pendingWrites = Math.max(0, Number(state.pendingWrites || 0) - 1);
  if (error) {
    state.lastSaveError = String(error?.message || error || 'Unbekannter Fehler');
    if (label) pushAuditEntry('error', `${label}: ${state.lastSaveError}`);
  } else if (label) {
    pushAuditEntry('success', `${label}: OK`);
  }
  updateSaveStatePill();

  if (!error) {
    window.clearTimeout(state.saveStateTimer);
    state.saveStateTimer = window.setTimeout(() => {
      if (state.pendingWrites === 0 && !state.lastSaveError) updateSaveStatePill();
    }, 800);
  }
}

function pushUndoEntry(entry) {
  if (!entry || !Array.isArray(entry.changes) || entry.changes.length === 0) return;
  state.undoStack.push(entry);
  if (state.undoStack.length > 30) state.undoStack.shift();
  if (dom.btnUndoLast) dom.btnUndoLast.disabled = false;
}

function updateUndoUi() {
  if (!dom.btnUndoLast) return;
  const count = state.undoStack.length;
  dom.btnUndoLast.disabled = count === 0;
  dom.btnUndoLast.title = count > 0 ? `Letzte Änderung rückgängig (${count})` : 'Keine Änderung zum Rückgängigmachen';
}

async function undoLastChange() {
  const entry = state.undoStack.pop();
  updateUndoUi();
  if (!entry) {
    showToast('Keine Änderung zum Rückgängigmachen.', 'info', 2200);
    return;
  }

  if (!state.currentSet || (entry.setId && state.currentSet.setId !== entry.setId)) {
    showToast('Undo ist nur im gleichen Set möglich.', 'info', 2600);
    return;
  }

  beginTrackedWrite('Undo');
  setLoading(true, 'Undo läuft…');
  let reverted = 0;
  try {
    for (const change of entry.changes) {
      const db = state.dbMap.get(change.key);
      if (!db?.gCell) continue;
      const prevG = Boolean(change.prev?.g);
      const prevRh = Boolean(change.prev?.rh && prevG);
      await updateCellBoolean(state.currentSet.setName, db.gCell.row, db.gCell.col, prevG);
      db.g = prevG;
      if (db.rhCell) {
        await updateCellBoolean(state.currentSet.setName, db.rhCell.row, db.rhCell.col, prevRh);
        db.rh = prevRh;
      } else {
        db.rh = false;
      }

      const article = dom.cards.querySelector(`[data-card-id="${change.key}"]`);
      if (article) updateCardState(article, db);
      broadcastRealtimeCardUpdate(change.key, db);
      reverted++;
    }

    updateStats();
    applyFilter();
    state.summaryData = null;
    showToast(`Undo abgeschlossen (${reverted} Karte${reverted === 1 ? '' : 'n'}).`, 'success', 2500);
    finishTrackedWrite('Undo', null);
  } catch (err) {
    showToast(`Undo fehlgeschlagen: ${err.message}`, 'error', 4500);
    finishTrackedWrite('Undo', err);
  } finally {
    setLoading(false);
    updateUndoUi();
  }
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

const brokenSetAssetUrls = new Set();

function sanitizeSetAssetUrl(url, setIdHint = '') {
  const value = String(url || '').trim();
  if (!value) return '';

  if (/^https?:\/\/assets\.tcgdex\.net\/.+\/(logo|symbol)$/i.test(value)) {
    return `${value}.webp`;
  }

  const normalized = value.toLowerCase();
  if (
    normalized === '0'
    || normalized === 'null'
    || normalized === 'undefined'
    || normalized === 'nan'
    || normalized.includes('pokeball-fallback.svg')
  ) {
    return '';
  }

  if (brokenSetAssetUrls.has(value)) return '';

  const setId = String(setIdHint || '').trim();
  if (/^https?:\/\/images\.pokedata\.ovh\//i.test(value)) {
    if (setId && !setId.startsWith('TCGDEX-')) {
      return `https://images.pokemontcg.io/${encodeURIComponent(setId)}/logo.png`;
    }
    return '';
  }

  if (/^https?:\/\//i.test(value) || value.startsWith('/') || value.startsWith('./') || value.startsWith('../')) {
    return value;
  }

  return '';
}

function buildMediaCandidateQueue(currentValue, candidateUrls = []) {
  const current = String(currentValue || '').trim();
  const seen = new Set();
  const queue = [];
  const add = (value) => {
    const text = String(value || '').trim();
    if (!text || /pokeball-fallback\.svg/i.test(text)) return;
    if (current && text === current) return;
    if (seen.has(text)) return;
    seen.add(text);
    queue.push(text);
  };
  (Array.isArray(candidateUrls) ? candidateUrls : []).forEach(add);
  return queue;
}

function attachSetAssetFallback(img, fallbackUrl = './assets/pokeball-fallback.svg', candidateUrls = []) {
  const fallbackQueue = buildMediaCandidateQueue(img?.src || '', candidateUrls);
  img.onerror = () => {
    const failedUrl = String(img?.src || '').trim();
    if (failedUrl) brokenSetAssetUrls.add(failedUrl);

    while (fallbackQueue.length) {
      const next = fallbackQueue.shift();
      if (next && next !== img.src) {
        img.src = next;
        return;
      }
    }

    img.onerror = null;
    if (fallbackUrl) {
      img.src = fallbackUrl;
      img.classList.add('img-fallback');
    } else {
      img.style.display = 'none';
    }
  };
}

function attachImageFallback(img, card, setIdHint = '') {
  void setIdHint;
  const fallbackQueue = buildMediaCandidateQueue(
    img?.src || card?.image || card?.imageUrl || '',
    Array.isArray(card?.imageCandidates) ? card.imageCandidates : []
  );
  const wrap = img.closest('.card-img-wrap');
  const applyVisualFallback = () => {
    if (wrap) {
      wrap.classList.add('missing-image');
      wrap.dataset.placeholder = card?.number
        ? `${card.number} · Kein Kartenbild`
        : 'Kein Kartenbild';
    }
    img.onerror = null;
    img.style.display = '';
    img.src = './assets/pokeball-fallback.svg';
    img.classList.add('img-fallback');
    img.alt = `Kein Kartenbild für ${card?.name || card?.number || 'diese Karte'}`;
  };

  if (wrap) {
    wrap.classList.remove('missing-image');
    delete wrap.dataset.placeholder;
  }
  img.classList.remove('img-fallback');
  img.style.display = '';

  const currentImage = String(card?.image || img?.src || '').trim();
  if (!currentImage || /pokeball-fallback\.svg/i.test(currentImage)) {
    while (fallbackQueue.length) {
      const next = fallbackQueue.shift();
      if (next) {
        img.src = next;
        break;
      }
    }
  }

  const activeImage = String(img?.src || '').trim();
  if (!activeImage || /pokeball-fallback\.svg/i.test(activeImage)) {
    applyVisualFallback();
    return;
  }

  img.onerror = () => {
    while (fallbackQueue.length) {
      const next = fallbackQueue.shift();
      if (next && next !== img.src) {
        img.src = next;
        return;
      }
    }
    applyVisualFallback();
  };
}

function setEmptyState(show) {
  dom.emptyState.classList.toggle('hidden', !show);
  dom.cards.classList.toggle('hidden', show);
}

function setRefreshMenuOpen(isOpen) {
  if (!dom.refreshMenu || !dom.btnRefreshMenu) return;
  const shouldOpen = Boolean(isOpen) && !dom.btnRefreshMenu.disabled;
  dom.refreshMenu.classList.toggle('hidden', !shouldOpen);
  dom.btnRefreshMenu.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
}

function syncRefreshControls() {
  const canRefreshCurrentSet = Boolean(isSignedIn() && state.currentSet?.setId);
  if (dom.refresh) dom.refresh.disabled = !canRefreshCurrentSet;
  if (dom.btnRefreshMenu) dom.btnRefreshMenu.disabled = !canRefreshCurrentSet;
  if (!canRefreshCurrentSet) {
    setRefreshMenuOpen(false);
  }
}

function resetRuntimeUiForSpreadsheetSwitch() {
  try {
    state.searchAbortController?.abort?.();
  } catch (err) {
    console.warn('[resetRuntimeUiForSpreadsheetSwitch] abort search failed:', err);
  }

  if (state.autoImportRefreshTimer) {
    clearTimeout(state.autoImportRefreshTimer);
    state.autoImportRefreshTimer = null;
  }

  Object.assign(state, createSpreadsheetSwitchStatePatch(state));
  cache.clear();
  focusedCardIndex = -1;

  syncSetNavLink(null);
  dom.cards.innerHTML = '';
  dom.searchResults.innerHTML = '<p class="empty-state">Bitte neue Suche starten.</p>';
  dom.setLogoWrap.classList.add('hidden');
  dom.statsSection.classList.add('hidden');
  dom.filterSection.classList.add('hidden');
  dom.sortSection.classList.add('hidden');
  dom.cardSort.value = 'number';

  document.querySelectorAll('.filter-btn').forEach((button) => button.classList.remove('active'));
  document.querySelector('.filter-btn[data-filter="all"]')?.classList.add('active');

  renderAuditPanel();
  updateUndoUi();
  updateSaveStatePill();
  setEmptyState(true);
}

// ══════════════════════════════════════════════════════════════════════════
// GRID ZOOM
// ══════════════════════════════════════════════════════════════════════════
const GRID_ZOOM_STORAGE_KEY = 'gridZoom';

function applyGridZoom(value) {
  const cssValue = value + 'px';
  document.documentElement.style.setProperty('--grid-min-width', cssValue);
  document.body?.style?.setProperty('--grid-min-width', cssValue);

  const template = `repeat(auto-fit, minmax(${value}px, 1fr))`;
  document.querySelectorAll('.cards, .dash-sets-row').forEach((grid) => {
    grid.style.setProperty('grid-template-columns', template, 'important');
  });
}

function initGridZoom() {
  const slider = document.getElementById('grid-zoom-slider');
  if (!slider) return;

  const defaultVal = window.innerWidth >= 1025 ? 200
                   : window.innerWidth >= 641  ? 165
                   : 130;
  const saved = localStorage.getItem(GRID_ZOOM_STORAGE_KEY);
  const rawVal = saved !== null ? parseInt(saved, 10) : defaultVal;
  const val = Number.isFinite(rawVal)
    ? Math.max(parseInt(slider.min, 10), Math.min(parseInt(slider.max, 10), rawVal))
    : defaultVal;

  slider.value = val;
  applyGridZoom(val);

  slider.addEventListener('input', (e) => {
    const v = Math.max(parseInt(slider.min, 10), Math.min(parseInt(slider.max, 10), parseInt(e.target.value, 10)));
    applyGridZoom(v);
    localStorage.setItem(GRID_ZOOM_STORAGE_KEY, v);
  });

  slider.addEventListener('change', (e) => {
    const v = Math.max(parseInt(slider.min, 10), Math.min(parseInt(slider.max, 10), parseInt(e.target.value, 10)));
    applyGridZoom(v);
    localStorage.setItem(GRID_ZOOM_STORAGE_KEY, v);
  });
}

function initCustomSelects() {
  const nativeSelects = Array.from(document.querySelectorAll('select'));
  if (!nativeSelects.length) return;

  const closeAll = (except = null) => {
    document.querySelectorAll('.custom-select.is-open').forEach((node) => {
      if (node !== except) {
        node.classList.remove('is-open');
        node.querySelector('.custom-select-trigger')?.setAttribute('aria-expanded', 'false');
      }
    });
  };

  const createOptionNode = ({ option, select, list, button, root }) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'custom-select-option';
    item.dataset.value = option.value;
    item.textContent = option.textContent?.trim() || '—';
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', String(option.selected));

    if (option.disabled) {
      item.disabled = true;
      item.classList.add('is-disabled');
    }

    if (option.selected) {
      item.classList.add('is-selected');
      button.textContent = item.textContent;
    }

    item.addEventListener('click', () => {
      if (option.disabled) return;
      select.value = option.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      root.classList.remove('is-open');
      button.focus();
    });

    list.appendChild(item);
  };

  nativeSelects.forEach((select) => {
    if (select.closest('.custom-select')) return;
    if (select.dataset.customized === 'true') return;

    select.dataset.customized = 'true';
    select.classList.add('cs-native');

    const root = document.createElement('div');
    root.className = 'custom-select';
    if (select.className) {
      select.className.split(' ').filter(Boolean).forEach((klass) => root.classList.add(`from-${klass}`));
    }
    if (select.id) root.classList.add(`from-id-${select.id}`);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'custom-select-trigger';
    button.setAttribute('aria-haspopup', 'listbox');
    button.setAttribute('aria-expanded', 'false');
    button.disabled = select.disabled;

    const list = document.createElement('div');
    list.className = 'custom-select-list';
    list.setAttribute('role', 'listbox');

    const rebuild = () => {
      list.innerHTML = '';
      button.textContent = '';
      const options = Array.from(select.options);
      options.forEach((option) => createOptionNode({ option, select, list, button, root }));
      if (!button.textContent) {
        const selectedOption = options.find((option) => option.selected) || options[0];
        button.textContent = selectedOption?.textContent?.trim() || 'Auswählen…';
      }
      button.disabled = select.disabled;
      root.classList.toggle('is-disabled', Boolean(select.disabled));
    };

    const syncSelectionState = () => {
      const selectedValue = select.value;
      list.querySelectorAll('.custom-select-option').forEach((optionNode) => {
        const isSelected = optionNode.dataset.value === selectedValue;
        optionNode.classList.toggle('is-selected', isSelected);
        optionNode.setAttribute('aria-selected', String(isSelected));
        if (isSelected) button.textContent = optionNode.textContent || 'Auswählen…';
      });
      button.disabled = select.disabled;
      root.classList.toggle('is-disabled', Boolean(select.disabled));
    };

    button.addEventListener('click', () => {
      if (button.disabled) return;
      const shouldOpen = !root.classList.contains('is-open');
      closeAll(root);
      root.classList.toggle('is-open', shouldOpen);
      button.setAttribute('aria-expanded', String(shouldOpen));
      if (shouldOpen) {
        const selectedNode = list.querySelector('.custom-select-option.is-selected');
        selectedNode?.scrollIntoView({ block: 'nearest' });
      }
    });

    button.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        root.classList.remove('is-open');
        button.setAttribute('aria-expanded', 'false');
      }
      if ((event.key === 'Enter' || event.key === ' ') && !root.classList.contains('is-open')) {
        event.preventDefault();
        button.click();
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const enabled = Array.from(select.options).filter((option) => !option.disabled);
        if (!enabled.length) return;
        const currentIndex = enabled.findIndex((option) => option.value === select.value);
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        const nextIndex = currentIndex < 0
          ? 0
          : (currentIndex + delta + enabled.length) % enabled.length;
        select.value = enabled[nextIndex].value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    select.addEventListener('change', syncSelectionState);

    const observer = new MutationObserver(() => {
      rebuild();
      syncSelectionState();
    });
    observer.observe(select, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['disabled', 'selected', 'label', 'value']
    });

    select.parentNode?.insertBefore(root, select);
    root.appendChild(select);
    root.appendChild(button);
    root.appendChild(list);
    rebuild();
    syncSelectionState();
  });

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) {
      closeAll();
      return;
    }
    if (!event.target.closest('.custom-select')) {
      closeAll();
      document.querySelectorAll('.custom-select-trigger[aria-expanded="true"]').forEach((button) => {
        button.setAttribute('aria-expanded', 'false');
      });
    }
  });

  window.addEventListener('scroll', () => {
    closeAll();
  }, { passive: true });
}

function initAutoHideTopbar() {
  const topbar = dom.topbar || document.querySelector('.topbar');
  if (!topbar) return;

  const root = document.documentElement;
  const body = document.body;
  const hideClass = 'topbar-collapsed';
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const scroller = document.scrollingElement || document.documentElement;
  const getScrollY = () => Math.max(
    window.scrollY || 0,
    scroller?.scrollTop || 0,
    document.documentElement?.scrollTop || 0,
    document.body?.scrollTop || 0
  );

  let lastY = Math.max(getScrollY(), 0);
  let dir = 0;
  let accumulated = 0;
  let ticking = false;
  let visibilityLockedUntil = 0;

  const syncTopbarHeight = () => {
    root.style.setProperty('--topbar-height', `${topbar.offsetHeight}px`);
  };

  const showTopbar = () => {
    body.classList.remove(hideClass);
    visibilityLockedUntil = Date.now() + 180;
  };

  const hideTopbar = () => {
    body.classList.add(hideClass);
    visibilityLockedUntil = Date.now() + 180;
  };

  const onScrollFrame = () => {
    ticking = false;
    const currentY = Math.max(getScrollY(), 0);
    const delta = currentY - lastY;
    const isNearTop = currentY < 88;
    const now = Date.now();

    if (reducedMotion) {
      showTopbar();
      lastY = currentY;
      return;
    }

    if (isNearTop) {
      showTopbar();
      dir = 0;
      accumulated = 0;
      lastY = currentY;
      return;
    }

    if (Math.abs(delta) < 1) {
      lastY = currentY;
      return;
    }

    if (now < visibilityLockedUntil) {
      lastY = currentY;
      return;
    }

    const nextDir = delta > 0 ? 1 : -1;
    if (nextDir === dir) {
      accumulated += Math.abs(delta);
    } else {
      dir = nextDir;
      accumulated = Math.abs(delta);
    }

    if (dir > 0 && accumulated > 36 && currentY > 120) {
      hideTopbar();
      accumulated = 0;
    } else if (dir < 0 && accumulated > 18) {
      showTopbar();
      accumulated = 0;
    }

    lastY = currentY;
  };

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(onScrollFrame);
  };

  syncTopbarHeight();
  showTopbar();
  window.addEventListener('resize', syncTopbarHeight, { passive: true });
  window.addEventListener('orientationchange', syncTopbarHeight, { passive: true });
  window.addEventListener('hashchange', showTopbar, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true });
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
  setRecentSetsDropdownOpen(false);
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
        const targetSet = getSetById(params[0]);
        if (targetSet) {
          ensureSetSelectorOption(targetSet);
        }
        if (dom.selector.value !== params[0]) {
          dom.selector.value = params[0];
        }
        const shouldReloadSet = !state.currentSet
          || state.currentSet.setId !== params[0]
          || !Array.isArray(state.cards)
          || state.cards.length === 0;
        if (shouldReloadSet) {
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
    resetSheetsDataCaches();
    resetRuntimeUiForSpreadsheetSwitch();
    updateSpreadsheetInfoBar();
    await loadSets();
    if (!dom.viewSearch?.classList.contains('hidden') && String(dom.searchInput?.value || '').trim()) {
      await runSearch({ force: true });
    }
    dom.dialog.close();
    setSpreadsheetDialogError('');
  } catch (err) {
    CONFIG.SPREADSHEET_ID = previousId;
    resetSheetsDataCaches();
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
    const [importedSets, initialOverviewSets] = await Promise.all([
      listImportedSets(),
      listSetsOverviewData().catch(() => [])
    ]);

    if (!Array.isArray(importedSets)) throw new Error('Ungültiges Sets-Format');
    state.sets = importedSets;

    let overviewSets = Array.isArray(initialOverviewSets) ? initialOverviewSets : [];
    if (overviewSets.length === 0) {
      const apiSets = await fetchAllAvailableSets();
      const importedIds = new Set(importedSets.map((set) => set.setId));
      await syncOverviewWithApiSets(apiSets, importedIds);
      overviewSets = await listSetsOverviewData().catch(() => []);
    }

    const importedById = new Map(importedSets.map((set) => [set.setId, set]));
    const mergedMap = new Map();

    (overviewSets || []).forEach((set) => {
      if (!mergedMap.has(set.setId)) {
        mergedMap.set(set.setId, { ...set, imported: toBoolean(set.imported) });
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
    seriesMap.forEach((groupInfo) => {
      const group = document.createElement('optgroup');
      group.label = groupInfo.label;
      group.dataset.seriesKey = groupInfo.key;
      groupInfo.sets.forEach((set) => {
        const opt = document.createElement('option');
        opt.value = set.setId;
        opt.textContent = set.setName;
        group.appendChild(opt);
      });
      dom.selector.appendChild(group);
    });

    dom.selector.disabled = false;
    dom.load.disabled     = false;
    syncRefreshControls();

    dom.dashSeriesFilter.innerHTML = '<option value="">Alle Serien</option>';
    buildSeriesMap(state.allSets).forEach((groupInfo) => {
      const opt = document.createElement('option');
      opt.value = groupInfo.key;
      opt.textContent = groupInfo.label;
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

function getSetSeriesGroupInfo(set) {
  return resolveSeriesGroupInfo(set || {});
}

function buildSeriesMap(sets) {
  const map = new Map();
  (sets || []).forEach((set) => {
    const info = getSetSeriesGroupInfo(set);
    const existing = map.get(info.key);
    if (!existing) {
      map.set(info.key, {
        key: info.key,
        label: info.label || 'Andere',
        canonicalName: info.canonicalName || info.label || 'Andere',
        sets: [set],
        labelVotes: new Map([[info.label || 'Andere', 1]])
      });
      return;
    }

    existing.sets.push(set);
    const label = info.label || 'Andere';
    const nextVotes = (existing.labelVotes.get(label) || 0) + 1;
    existing.labelVotes.set(label, nextVotes);
    const currentVotes = existing.labelVotes.get(existing.label) || 0;
    if (nextVotes > currentVotes) {
      existing.label = label;
    }
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
    state.summaryOverrides.forEach((row, key) => {
      summaryByName.set(key, row);
    });

    let sets = [...state.allSets];
    const filterText = dom.dashFilter.value.trim();
    const dashboardSearchScores = new Map();
    const getDashboardSearchKey = (set) => String(set?.setId || set?.setName || '');
    const compareDashboardSearchScore = (left, right) => {
      if (!filterText) return 0;
      const leftScore = dashboardSearchScores.get(getDashboardSearchKey(left)) || 0;
      const rightScore = dashboardSearchScores.get(getDashboardSearchKey(right)) || 0;
      return rightScore - leftScore;
    };

    if (filterText) {
      sets = sets.filter((set) => {
        const score = scoreDashboardSetMatch(set, filterText);
        if (score < 0) return false;
        dashboardSearchScores.set(getDashboardSearchKey(set), score);
        return matchesDashboardSetFilter(set, filterText);
      });

      sets.sort((left, right) => compareDashboardSearchScore(left, right));
    }

    const seriesFilter = dom.dashSeriesFilter.value;
    if (seriesFilter) sets = sets.filter((set) => getSetSeriesGroupInfo(set).key === seriesFilter);

    if (activeDashboardView === 'imported') {
      sets = sets.filter((set) => toBoolean(set.imported));
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
      sets.sort((a, b) => {
        const scoreDiff = compareDashboardSearchScore(a, b);
        if (scoreDiff !== 0) return scoreDiff;
        return a.setName.localeCompare(b.setName);
      });
    } else if (sortBy === 'completion') {
      sets.sort((a, b) => {
        const scoreDiff = compareDashboardSearchScore(a, b);
        if (scoreDiff !== 0) return scoreDiff;
        const sa = summaryByName.get(a.setName) || summaryByName.get(a.setId);
        const sb = summaryByName.get(b.setName) || summaryByName.get(b.setId);
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
      seriesMap.forEach((groupInfo) => {
        const section = document.createElement('section');
        section.className = 'dash-series-group';
        const h3 = document.createElement('h3');
        h3.textContent = groupInfo.label;
        section.appendChild(h3);
        const grid = document.createElement('div');
        grid.className = 'dash-sets-row';
        groupInfo.sets.forEach((set) => {
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

  card.dataset.setId = set.setId || '';
  card.dataset.hoverData = JSON.stringify({
    name: set.setName || set.setId || '',
    series: set.series || '',
    collected,
    total: total || set.totalCards || 0,
    rh,
    percent,
    imported: Boolean(set.imported)
  });

  const safeLogoUrl = sanitizeSetAssetUrl(set.logoUrl, set.setId);
  const placeholderCode = String(set.ptcgoCode || set.setId || 'SET').toUpperCase();

  card.innerHTML = `
    <div class="dash-set-logo-wrap">
      ${safeLogoUrl
        ? `<img src="${safeLogoUrl}" alt="${set.setName}" class="dash-set-logo" loading="lazy" onerror="this.onerror=null;this.src='./assets/pokeball-fallback.svg';this.classList.add('img-fallback')"/>`
        : `<div class="dash-set-placeholder" role="img" aria-label="Kein Setlogo für ${set.setName} verfügbar">
             <img src="./assets/pokeball-fallback.svg" alt="" class="dash-set-placeholder-icon" loading="lazy" />
             <span class="dash-set-placeholder-badge">Kein Setlogo</span>
             <span class="dash-set-placeholder-code">${placeholderCode}</span>
           </div>`}
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

  if (set.imported) {
    checkSetCompletion(set.setId || set.setName, percent, card);
  }

  return card;
}

function syncDashboardCardForSet(setMeta, summary) {
  if (!setMeta?.setId) return;
  const card = dom.dashboardGrid?.querySelector(`.dash-set-card[data-set-id="${setMeta.setId}"]`);
  if (!card) return;

  const total = Number(summary?.total ?? setMeta?.totalCards ?? 0);
  const collected = Number(summary?.collected ?? 0);
  const rh = Number(summary?.rh ?? 0);
  const percent = total > 0 ? Math.round((collected / total) * 100) : 0;

  card.classList.toggle('complete', percent >= 100 && total > 0);
  card.classList.toggle('in-progress', percent > 0 && percent < 100);

  const fill = card.querySelector('.dash-progress-fill');
  if (fill) fill.style.width = `${percent}%`;

  const text = card.querySelector('.dash-progress-text');
  if (text) text.textContent = `${collected}\u202f/\u202f${total || '?'} (${percent}%)`;

  let rhText = card.querySelector('.dash-rh-text');
  if (rh > 0 && !rhText) {
    rhText = document.createElement('p');
    rhText.className = 'dash-rh-text';
    const info = card.querySelector('.dash-set-info');
    info?.insertBefore(rhText, info.querySelector('.dash-card-actions'));
  }
  if (rhText) {
    if (rh > 0) rhText.textContent = `RH: ${rh}`;
    else rhText.remove();
  }

  card.dataset.hoverData = JSON.stringify({
    name: setMeta.setName || setMeta.setId || '',
    series: setMeta.series || '',
    collected,
    total,
    rh,
    percent,
    imported: true
  });

  checkSetCompletion(setMeta.setId || setMeta.setName, percent, card);
}

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
      setGlobalStatus(`Auto-Importiere ${mergedSet.setName || setId}…`);

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

  setLoading(true, `Importiere ${set.setName}…`);
  setGlobalStatus(`Importiere ${set.setName}…`);
  try {
    const { cards, setMetaPatch } = await fetchMergedCardsWithSetMeta(set.setId);
    await importSetIntoCollection({ ...set, ...(setMetaPatch || {}) }, cards);
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

async function deleteSetFromCollection(set, options = {}) {
  const { skipReload = false, skipConfirm = false } = options;
  if (!set?.setId || !set.imported) {
    showToast('Set kann nicht gelöscht werden.', 'error', 3000);
    return;
  }

  const confirmMsg = `${set.setName} wirklich aus deiner Sammlung löschen? Diese Aktion kann nicht rückgängig gemacht werden.`;
  if (!skipConfirm && !window.confirm(confirmMsg)) {
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
      for (const [, db] of range) {
        if (db?.gCell?.row && db?.gCell?.col) {
          await updateCellBoolean(set.setName, db.gCell.row, db.gCell.col, false);
        }
        if (db?.rhCell?.row && db?.rhCell?.col) {
          await updateCellBoolean(set.setName, db.rhCell.row, db.rhCell.col, false);
        }
      }
    }

    await upsertOverviewSet(set, false);

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

function ensureSetSelectorOption(set) {
  if (!dom.selector || !set?.setId) return;

  const existingOption = Array.from(dom.selector.options || []).find((option) => option.value === set.setId);
  if (existingOption) {
    if (set?.setName) existingOption.textContent = set.setName;
    return;
  }

  const groupInfo = getSetSeriesGroupInfo(set);
  const groupLabel = groupInfo.label || 'Weitere Sets';
  const groupKey = groupInfo.key || 'weitere-sets';
  let group = Array.from(dom.selector.querySelectorAll('optgroup')).find((entry) => (entry.dataset.seriesKey || '') === groupKey);
  if (!group) {
    group = document.createElement('optgroup');
    group.label = groupLabel;
    group.dataset.seriesKey = groupKey;
    dom.selector.appendChild(group);
  }

  const option = document.createElement('option');
  option.value = set.setId;
  option.textContent = set.setName || set.setId;
  if (!toBoolean(set.imported)) {
    option.dataset.source = 'search-api';
  }
  group.appendChild(option);
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
        const { cards, setMetaPatch } = await fetchMergedCardsWithSetMeta(set.setId);
        await importSetIntoCollection({ ...set, ...(setMetaPatch || {}) }, cards);
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

function getImportedSetsForManagement() {
  return (state.allSets || []).filter((set) => toBoolean(set.imported));
}

function updateManageSetsInfo(filtered = []) {
  if (!dom.manageSetsInfo) return;
  const selectedCount = state.manageSetsSelection.size;
  dom.manageSetsInfo.textContent = `${selectedCount} ausgewählt • ${filtered.length} sichtbar`;
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
    dom.manageSetsList.innerHTML = '<p class="empty-state">Keine importierten Sets für den aktuellen Filter.</p>';
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
    title.textContent = `${set.setId} — ${set.setName}`;

    const sub = document.createElement('span');
    sub.className = 'batch-item-sub';
    sub.textContent = `${set.series || 'Serie unbekannt'} • ${set.totalCards || '?'} Karten`;

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
    showToast('Bitte mindestens ein Set auswählen.', 'info');
    return;
  }

  const selectedSets = selectedIds.map((id) => getSetById(id)).filter(Boolean);
  dom.manageSetsDialog?.close();
  await importSetsSequential(selectedSets, { successMessage: '{count} ausgewählte Sets aktualisiert.' });
}

async function deleteSelectedImportedSets() {
  const selectedIds = Array.from(state.manageSetsSelection);
  if (!selectedIds.length) {
    showToast('Bitte mindestens ein Set auswählen.', 'info');
    return;
  }

  const selectedSets = selectedIds
    .map((id) => getSetById(id))
    .filter((set) => set && toBoolean(set.imported));

  if (!selectedSets.length) {
    showToast('Keine löschbaren importierten Sets ausgewählt.', 'info');
    return;
  }

  const ok = window.confirm(`${selectedSets.length} importierte Sets wirklich löschen?`);
  if (!ok) return;

  dom.manageSetsDialog?.close();
  setLoading(true, 'Lösche ausgewählte Sets…');
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
  showToast(`${deleted} gelöscht${failed ? `, ${failed} Fehler` : ''}.`, failed ? 'error' : 'success', 4500);
}

function initManageImportedSetsDialog() {
  dom.btnManageImportedSets?.addEventListener('click', openManageImportedSetsDialog);
  dom.manageSetsSearch?.addEventListener('input', () => renderManageImportedSetsList());
  dom.btnManageSetsSelectVisible?.addEventListener('click', () => {
    dom.manageSetsList?.querySelectorAll('.batch-item input[type="checkbox"]').forEach((input) => {
      const label = input.closest('.batch-item')?.querySelector('.batch-item-title')?.textContent || '';
      const setId = label.split(' — ')[0] || '';
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

function buildLegacyImportPreviewText(plan) {
  const summary = summarizeLegacyImportPlan(plan);
  const lines = [
    `Set-Blätter erkannt: ${summary.sheetCount}`,
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
        lines.push(`• ${entry.sheetName}: ${entry.reason}`);
      });
    }

    if (plan.unresolvedCards?.length) {
      lines.push('');
      lines.push('Karten-Probleme:');
      plan.unresolvedCards.slice(0, 8).forEach((entry) => {
        lines.push(`• ${entry.setId} / ${entry.sourceCardId}: ${entry.reason}`);
      });
    }

    lines.push('');
    lines.push('Der Import wurde blockiert, bis alle Konflikte eindeutig gelöst sind.');
    return lines.join('\n');
  }

  lines.push('');
  lines.push('Der Import setzt die betroffenen Sets exakt auf den Altbestand-Stand (G/RH) – inklusive Entfernen nicht markierter Treffer in diesen Sets.');
  return lines.join('\n');
}

async function prepareLegacyWorkbookImport(workbook, sourceLabel = 'Altbestand') {
  if (!workbook) throw new Error('Keine Altbestand-Quelle ausgewählt.');
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
      throw new Error(`Kartenkatalog für ${setMeta?.setName || setId} konnte nicht geladen werden.`);
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

async function applyLegacyImportPlan(plan, cardsBySetId) {
  if (!plan?.ok) {
    throw new Error('Der Dry-Run enthält noch Konflikte.');
  }

  const missingSets = plan.missingSetIds
    .map((setId) => getSetById(setId))
    .filter((set) => set?.setId);

  if (missingSets.length) {
    await importSetsSequential(missingSets, {
      successMessage: '{count} fehlende Sets für den Altbestand-Import importiert.'
    });
    await loadSets();
  }

  try {
    await createAutoSnapshot(`Legacy Altbestand Import (${plan.matchedSets.length} Sets)`, state.collection || {});
  } catch (err) {
    console.warn('[applyLegacyImportPlan] snapshot failed', err);
  }

  let updatedCells = 0;
  setLoading(true, 'Synchronisiere Altbestand…');
  try {
    for (let setIndex = 0; setIndex < plan.matchedSets.length; setIndex++) {
      const matchedSet = plan.matchedSets[setIndex];
      const liveSet = getSetById(matchedSet.setId);
      if (!liveSet?.setName) {
        throw new Error(`Ziel-Set ${matchedSet.setId} ist nach dem Vorimport nicht verfügbar.`);
      }

      setGlobalStatus(`Altbestand-Import ${setIndex + 1}/${plan.matchedSets.length}: ${liveSet.setName}`);
      const liveMap = await readSetCollectionMap(liveSet.setName).catch(() => new Map());
      const targetByCard = new Map(
        (matchedSet.cards || []).map((entry) => [normalizeCardNumber(entry.cardId), entry])
      );
      const setCards = Array.isArray(cardsBySetId?.[matchedSet.setId]) ? cardsBySetId[matchedSet.setId] : [];
      const pendingCellUpdates = [];

      for (const sourceCard of setCards) {
        const cardId = pickCanonicalCardId(sourceCard);
        if (!cardId) continue;

        const normalizedCardId = normalizeCardNumber(cardId);
        const target = targetByCard.get(normalizedCardId) || { g: false, rh: false };
        let entry = liveMap.get(normalizedCardId) || null;

        if (!entry && !target.g && !target.rh) continue;
        if (!entry) {
          entry = await ensureCollectionEntry(liveSet.setName, cardId);
          liveMap.set(normalizedCardId, entry);
        }

        const targetG = Boolean(target.g);
        const targetRh = Boolean(target.g && target.rh);

        if (!targetG && Boolean(entry.rh)) {
          pendingCellUpdates.push({ row: entry.rhCell.row, col: entry.rhCell.col, value: false });
          entry.rh = false;
          updatedCells += 1;
        }
        if (Boolean(entry.g) !== targetG) {
          pendingCellUpdates.push({ row: entry.gCell.row, col: entry.gCell.col, value: targetG });
          entry.g = targetG;
          updatedCells += 1;
        }
        if (targetG && Boolean(entry.rh) !== targetRh) {
          pendingCellUpdates.push({ row: entry.rhCell.row, col: entry.rhCell.col, value: targetRh });
          entry.rh = targetRh;
          updatedCells += 1;
        }
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

  setGlobalStatus(`Altbestand importiert: ${plan.matchedSets.length} Sets, ${updatedCells} Änderungen.`);
  showToast(`Altbestand importiert: ${plan.matchedSets.length} Sets synchronisiert, ${updatedCells} Änderungen geschrieben.`, 'success', 5000);
}

function setLegacySheetDialogError(message = '') {
  if (!dom.legacySheetError) return;
  dom.legacySheetError.textContent = message;
  dom.legacySheetError.classList.toggle('hidden', !message);
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
    setLegacySheetDialogError('Bitte einen gültigen Google-Sheets-Link oder eine Spreadsheet-ID eingeben.');
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

  setLoading(true, 'Analysiere Altbestand…');
  try {
    const workbook = sourceFile
      ? await loadLegacyWorkbookFromFile(sourceFile)
      : await loadLegacyWorkbookFromSpreadsheetInput(spreadsheetInput);
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
      showToast(`Import blockiert: ${summary.unresolvedSheetCount} Set- und ${summary.unresolvedCardCount} Kartenkonflikte. Prüfbericht exportiert.`, 'error', 7000);
      return;
    }

    const ok = window.confirm(`${buildLegacyImportPreviewText(plan)}\n\nImport jetzt anwenden?`);
    if (!ok) {
      setGlobalStatus('Altbestand-Analyse abgeschlossen – Import nicht angewendet.');
      showToast('Altbestand analysiert. Es wurden noch keine Änderungen geschrieben.', 'info', 4500);
      return;
    }

    await applyLegacyImportPlan(plan, cardsBySetId);
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
  const ok = window.confirm(`Set „${set.setName}“ neu importieren? Vorhandene Sammel-Checks bleiben erhalten.`);
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
  });

  const dialog = document.createElement('dialog');
  dialog.className = 'ss-dialog';
  dialog.style.cssText = 'width: min(92vw, 760px); max-height: 88vh;';
  dialog.innerHTML = '<h2>⚙️ Einstellungen</h2>';
  dialog.appendChild(settingsPanel);
  document.body.appendChild(dialog);
  dialog.showModal();
  dialog.addEventListener('close', () => dialog.remove());
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
  dom.btnOpenSettings?.addEventListener('click', openSettingsDialog);
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
    const formatNumber = (value) => Number(value || 0).toLocaleString('de-DE');
    const getSetPct = (row) => {
      const total = Number(row?.total || 0);
      const collected = Number(row?.collected || 0);
      return total > 0 ? Math.round((collected / total) * 100) : 0;
    };
    const summaryByName = new Map(data.map((row) => [row.setName, row]));
    const missingCards = Math.max(0, totalCards - totalCollected);
    const averageSetCompletion = data.length
      ? Math.round(data.reduce((sum, row) => sum + getSetPct(row), 0) / data.length)
      : 0;
    const activeSets = data.filter((row) => Number(row?.collected || 0) > 0).length;
    const rhCoverage = totalCards > 0 ? Math.round((totalRh / totalCards) * 100) : 0;
    const nextMilestone = [80, 85, 90, 95, 100].find((value) => value > overallPct) || null;
    const cardsToNextMilestone = nextMilestone
      ? Math.max(0, Math.ceil((nextMilestone / 100) * totalCards) - totalCollected)
      : 0;
    const collectionPhase = overallPct >= 90
      ? '🔥 Endspurt'
      : overallPct >= 75
        ? '🚀 Sehr starker Ausbau'
        : overallPct >= 50
          ? '📈 Spürbarer Fortschritt'
          : '🌱 Aufbauphase';

    // Serien-Breakdown
    const seriesMap = new Map();
    (state.sets || []).forEach((set) => {
      const row = summaryByName.get(set.setName);
      const groupInfo = getSetSeriesGroupInfo(set);
      if (!seriesMap.has(groupInfo.key)) {
        seriesMap.set(groupInfo.key, {
          label: groupInfo.label || 'Andere',
          total: 0,
          collected: 0,
          rh: 0,
          count: 0,
          completed: 0
        });
      }
      const sg = seriesMap.get(groupInfo.key);
      sg.total += row?.total || 0;
      sg.collected += row?.collected || 0;
      sg.rh += row?.rh || 0;
      sg.count++;
      if ((row?.collected || 0) >= (row?.total || 1) && row?.total > 0) sg.completed++;
    });

    const sorted = [...data]
      .filter((row) => Number(row?.total || 0) > 0)
      .sort((a, b) => getSetPct(b) - getSetPct(a));
    const top5Done = sorted.slice(0, 5);
    const top5Missing = [...data]
      .filter((row) => Number(row?.total || 0) > 0 && Number(row?.collected || 0) < Number(row?.total || 0))
      .sort((a, b) => (Number(b.total || 0) - Number(b.collected || 0)) - (Number(a.total || 0) - Number(a.collected || 0)))
      .slice(0, 5);
    const nextSetTargets = [...data]
      .filter((row) => Number(row?.total || 0) > 0 && Number(row?.collected || 0) > 0 && Number(row?.collected || 0) < Number(row?.total || 0))
      .sort((a, b) => {
        const missingDiff = (Number(a.total || 0) - Number(a.collected || 0)) - (Number(b.total || 0) - Number(b.collected || 0));
        if (missingDiff !== 0) return missingDiff;
        return getSetPct(b) - getSetPct(a);
      })
      .slice(0, 3);

    const leadingSet = top5Done[0] || null;
    const topSeriesEntry = [...seriesMap.entries()]
      .filter(([, group]) => Number(group?.total || 0) > 0)
      .sort((a, b) => {
        const pctDiff = (b[1].collected / Math.max(1, b[1].total)) - (a[1].collected / Math.max(1, a[1].total));
        if (pctDiff !== 0) return pctDiff;
        return Number(b[1].collected || 0) - Number(a[1].collected || 0);
      })[0] || null;
    const largestSeriesEntry = [...seriesMap.entries()]
      .filter(([, group]) => Number(group?.total || 0) > 0)
      .sort((a, b) => Number(b[1].collected || 0) - Number(a[1].collected || 0))[0] || null;

    const seriesRows = Array.from(seriesMap.entries())
      .filter(([, group]) => Number(group?.total || 0) > 0)
      .sort((a, b) => {
        const pctDiff = Math.round((b[1].collected / Math.max(1, b[1].total)) * 100) - Math.round((a[1].collected / Math.max(1, a[1].total)) * 100);
        if (pctDiff !== 0) return pctDiff;
        return Number(b[1].collected || 0) - Number(a[1].collected || 0);
      })
      .map(([key, group]) => {
        const pct = group.total > 0 ? Math.round((group.collected / group.total) * 100) : 0;
        const label = getStatsSeriesLabel(key, group);
        const safeKey = String(key).replace(/"/g, '&quot;');
        const safeLabel = String(label).replace(/"/g, '&quot;');
        return `
          <div class="stats-series-row" data-series="${safeKey}" data-series-label="${safeLabel}">
            <div class="stats-series-name-wrap">
              <div class="stats-series-name">${label}</div>
              <div class="stats-series-meta">${group.completed}/${group.count} Sets komplett</div>
            </div>
            <div class="stats-series-bar"><div class="dash-progress-fill" style="width:${pct}%"></div></div>
            <div class="stats-series-numbers"><strong>${pct}%</strong><span>${formatNumber(group.collected)}/${formatNumber(group.total)}</span></div>
          </div>`;
      }).join('');

    dom.statsContent.innerHTML = `
      <section class="stats-hero" style="--stats-progress:${overallPct};">
        <div class="stats-hero-copy">
          <span class="stats-eyebrow">SAMMLUNGSPULS</span>
          <span class="stats-hero-badge">${collectionPhase}</span>
          <h3>Deine Collection wirkt jetzt wie ein echtes Langzeitprojekt – <strong>${formatNumber(totalCollected)}</strong> von <strong>${formatNumber(totalCards)}</strong> Karten sind bereits gesichert.</h3>
          <p>${overallPct}% Gesamtfortschritt, ${completedSets} ${completedSets === 1 ? 'komplettes Set' : 'komplette Sets'}, ${formatNumber(totalRh)} Reverse Holos und ${activeSets} aktive Sets machen aus der Statistik endlich eine richtige Trophäenwand.</p>
          <div class="stats-pill-row">
            <span class="stats-pill primary">📦 ${formatNumber(data.length)} importierte Sets</span>
            <span class="stats-pill success">🏆 ${completedSets} komplett</span>
            <span class="stats-pill">✨ Ø ${averageSetCompletion}% pro Set</span>
            ${nextMilestone ? `<span class="stats-pill warning">🎯 Noch ${formatNumber(cardsToNextMilestone)} Karten bis ${nextMilestone}%</span>` : '<span class="stats-pill success">✅ 100% erreicht</span>'}
          </div>
        </div>
        <div class="stats-hero-meter">
          <div class="stats-hero-ring">
            <div class="stats-hero-ring-core">
              <strong>${overallPct}%</strong>
              <span>Fortschritt</span>
            </div>
          </div>
          <div class="stats-hero-meter-detail">
            <strong>${formatNumber(missingCards)} Karten fehlen noch</strong>
            <span>${nextMilestone ? `${formatNumber(cardsToNextMilestone)} bis zum nächsten Meilenstein` : 'Die Sammlung ist vollständig.'}</span>
          </div>
        </div>
      </section>

      <div class="stats-overview-cards">
        <article class="stat-card accent">
          <span class="stat-card-value">${formatNumber(totalCards)}</span>
          <span class="stat-card-label">Slots im Tracker</span>
          <span class="stat-card-meta">${seriesMap.size} Serien im Blick</span>
        </article>
        <article class="stat-card collected">
          <span class="stat-card-value">${formatNumber(totalCollected)}</span>
          <span class="stat-card-label">Normals gesammelt</span>
          <span class="stat-card-meta">${overallPct}% der Gesamtmenge</span>
        </article>
        <article class="stat-card reverse">
          <span class="stat-card-value">${formatNumber(totalRh)}</span>
          <span class="stat-card-label">Reverse Holos</span>
          <span class="stat-card-meta">${rhCoverage}% bezogen auf alle Karten</span>
        </article>
        <article class="stat-card success">
          <span class="stat-card-value">${completedSets}</span>
          <span class="stat-card-label">Sets komplett</span>
          <span class="stat-card-meta">${activeSets}/${data.length} Sets mit Fortschritt</span>
        </article>
        <article class="stat-card">
          <span class="stat-card-value">${averageSetCompletion}%</span>
          <span class="stat-card-label">Ø Set-Fortschritt</span>
          <span class="stat-card-meta">${formatNumber(missingCards)} Karten bis 100%</span>
        </article>
        <article class="stat-card">
          <span class="stat-card-value">${activeSets}</span>
          <span class="stat-card-label">Aktive Sets</span>
          <span class="stat-card-meta">${formatNumber(data.length)} importiert</span>
        </article>
      </div>

      <div class="stats-story-grid">
        <section class="stats-spotlight-card">
          <div class="stats-section-kicker">Highlights</div>
          <h3>Was gerade am meisten glänzt</h3>
          <ul class="stats-insight-list">
            <li><span>Bestes Set</span><strong>${leadingSet ? `${leadingSet.setName} · ${getSetPct(leadingSet)}%` : '—'}</strong></li>
            <li><span>Stärkste Serie</span><strong>${topSeriesEntry ? `${getStatsSeriesLabel(topSeriesEntry[0], topSeriesEntry[1])} · ${Math.round((topSeriesEntry[1].collected / Math.max(1, topSeriesEntry[1].total)) * 100)}%` : '—'}</strong></li>
            <li><span>Größter Kartenblock</span><strong>${largestSeriesEntry ? `${getStatsSeriesLabel(largestSeriesEntry[0], largestSeriesEntry[1])} · ${formatNumber(largestSeriesEntry[1].collected)} Karten` : '—'}</strong></li>
          </ul>
        </section>

        <section class="stats-spotlight-card emphasis">
          <div class="stats-section-kicker">Nächste Abschlüsse</div>
          <h3>Diese Sets lohnen sich jetzt besonders</h3>
          <div class="stats-goal-list">
            ${nextSetTargets.length ? nextSetTargets.map((row) => `
              <article class="stats-target-card">
                <div class="stats-target-top">
                  <strong>${row.setName}</strong>
                  <span>${formatNumber((row.total || 0) - (row.collected || 0))} fehlen</span>
                </div>
                <div class="stats-mini-track"><div class="stats-mini-fill" style="width:${getSetPct(row)}%"></div></div>
                <small>${formatNumber(row.collected || 0)}/${formatNumber(row.total || 0)} · ${getSetPct(row)}%</small>
              </article>
            `).join('') : '<p class="stats-empty-note">Sobald ein Set kurz vor dem Abschluss steht, erscheint es hier.</p>'}
          </div>
        </section>

        <section class="stats-spotlight-card">
          <div class="stats-section-kicker">Fokus</div>
          <h3>Was den nächsten Sprung bringt</h3>
          <ul class="stats-insight-list compact">
            <li><span>Bis 100%</span><strong>${formatNumber(missingCards)} Karten</strong></li>
            <li><span>${nextMilestone ? `Bis ${nextMilestone}%` : 'Status'}</span><strong>${nextMilestone ? `${formatNumber(cardsToNextMilestone)} Karten` : 'Meilenstein erreicht'}</strong></li>
            <li><span>Größte Baustelle</span><strong>${top5Missing[0] ? `${top5Missing[0].setName} · ${formatNumber((top5Missing[0].total || 0) - (top5Missing[0].collected || 0))} fehlend` : 'Keine offenen Baustellen'}</strong></li>
          </ul>
        </section>
      </div>

      <section class="stats-series-section">
        <div class="stats-section-head">
          <div>
            <div class="stats-section-kicker">Serienvergleich</div>
            <h3>Wie sich dein Fortschritt verteilt</h3>
          </div>
          <span class="stats-section-note">Klicke eine Reihe für die Set-Details.</span>
        </div>
        <div class="stats-series-table">
          ${seriesRows || '<p class="stats-empty-note">Noch keine Serienstatistiken verfügbar.</p>'}
        </div>
      </section>

      <div class="stats-charts-row">
        <div class="stats-chart-wrap">
          <div class="stats-section-kicker">Visualisierung</div>
          <h3>Gesamtfortschritt</h3>
          <p>Gesammelt gegen fehlend – als schneller Blick auf den gesamten Binder.</p>
          <canvas id="chart-overall" height="220"></canvas>
        </div>
        <div class="stats-chart-wrap">
          <div class="stats-section-kicker">Visualisierung</div>
          <h3>Top-Serien im Vergleich</h3>
          <p>Die stärksten Reihen nach Abschlussquote auf einen Blick.</p>
          <canvas id="chart-series" height="220"></canvas>
        </div>
      </div>

      <div class="stats-two-col">
        <section class="stats-list-card">
          <div class="stats-section-kicker">Trophy Board</div>
          <h3>Top 5 vollständigste Sets</h3>
          <ol class="stats-top-list">
            ${top5Done.length ? top5Done.map((row) => `
              <li>
                <div class="stats-top-main">
                  <strong>${row.setName}</strong>
                  <span>${getSetPct(row)}%</span>
                </div>
                <small>${formatNumber(row.collected || 0)}/${formatNumber(row.total || 0)} Karten</small>
              </li>
            `).join('') : '<li class="stats-empty-note">Noch keine Sets verfügbar.</li>'}
          </ol>
        </section>
        <section class="stats-list-card">
          <div class="stats-section-kicker">Baustellen</div>
          <h3>Top 5 mit den meisten fehlenden Karten</h3>
          <ol class="stats-top-list">
            ${top5Missing.length ? top5Missing.map((row) => `
              <li>
                <div class="stats-top-main">
                  <strong>${row.setName}</strong>
                  <span>${formatNumber((row.total || 0) - (row.collected || 0))} offen</span>
                </div>
                <small>${formatNumber(row.collected || 0)}/${formatNumber(row.total || 0)} Karten</small>
              </li>
            `).join('') : '<li class="stats-empty-note">Keine offenen Sets mehr.</li>'}
          </ol>
        </section>
      </div>`;

    initStatsCharts(totalCollected, totalCards, seriesMap);
    initStatsDrillDown();
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

  const hasSetLikeMarker = parts.some((token) => token === 'set' || token === 'series' || token === 'serie');
  if (hasSetLikeMarker) return null;

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

function collectSearchStrings(values = []) {
  const seen = new Set();
  const result = [];

  const visit = (value) => {
    if (value == null) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value === 'object') {
      Object.values(value).forEach(visit);
      return;
    }

    const raw = String(value || '').trim();
    if (!raw || /^https?:\/\//i.test(raw)) return;
    const normalized = normalizeSearchText(raw).replace(/\s+/g, ' ').trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    result.push(normalized);
  };

  values.forEach(visit);
  return result;
}

function matchesTokensInValues(tokens = [], values = []) {
  if (!tokens.length) return false;
  return tokens.every((token) => values.some((value) => value.includes(token)));
}

function buildSetSearchContext(set = null) {
  const nameValues = collectSearchStrings([
    set?.setName,
    set?.vera_name,
    set?.tcgdex_name
  ]);

  const seriesValues = collectSearchStrings([
    set?.series,
    set?.vera_series,
    set?.tcgdex_serie_name,
    set?.tcgdex_serie_id
  ]);

  const codeValues = collectSearchStrings([
    set?.setId,
    set?.ptcgoCode,
    set?.vera_ptcgoCode,
    set?.tcgdex_abbreviation_official
  ]);

  return {
    nameValues,
    seriesValues,
    codeValues,
    fullText: [...nameValues, ...seriesValues, ...codeValues].join(' ')
  };
}

function scoreDashboardSetMatch(set, rawQuery = '') {
  const normalizedQuery = normalizeSearchText(rawQuery).replace(/\s+/g, ' ').trim();
  if (!normalizedQuery) return 0;

  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const context = buildSetSearchContext(set);
  const weightedGroups = [
    { values: context.codeValues, exact: 280, prefix: 240, includes: 180 },
    { values: context.nameValues, exact: 230, prefix: 180, includes: 125 },
    { values: context.seriesValues, exact: 120, prefix: 90, includes: 70 }
  ];

  let bestScore = -1;

  weightedGroups.forEach(({ values, exact, prefix, includes }) => {
    values.forEach((value) => {
      if (!value) return;
      if (value === normalizedQuery) bestScore = Math.max(bestScore, exact);
      else if (value.startsWith(normalizedQuery)) bestScore = Math.max(bestScore, prefix);
      else if (value.includes(normalizedQuery)) bestScore = Math.max(bestScore, includes);
    });
  });

  if (tokens.length && matchesTokensInValues(tokens, context.codeValues)) {
    bestScore = Math.max(bestScore, 160 + (tokens.length * 12));
  }
  if (tokens.length && matchesTokensInValues(tokens, context.nameValues)) {
    bestScore = Math.max(bestScore, 135 + (tokens.length * 11));
  }
  if (tokens.length && matchesTokensInValues(tokens, context.seriesValues)) {
    bestScore = Math.max(bestScore, 85 + (tokens.length * 8));
  } else if (tokens.length && tokens.every((token) => context.fullText.includes(token))) {
    bestScore = Math.max(bestScore, 50 + (tokens.length * 8));
  }

  return bestScore;
}

function matchesDashboardSetFilter(set, rawQuery = '') {
  return scoreDashboardSetMatch(set, rawQuery) >= 0;
}

function buildCardSearchContext(card, set = null) {
  const nameValues = collectSearchStrings([
    card?.name,
    card?.vera_name,
    card?.tcgdex_name
  ]);

  const setValues = collectSearchStrings([
    set?.setName,
    set?.vera_name,
    set?.tcgdex_name,
    set?.series,
    set?.vera_series,
    set?.tcgdex_serie_name,
    set?.ptcgoCode,
    set?.vera_ptcgoCode,
    set?.tcgdex_abbreviation_official,
    set?.setId
  ]);

  const taxonomyValues = collectSearchStrings([
    card?.rarity,
    card?.hp,
    card?.types,
    card?.vera_types,
    card?.supertype,
    card?.subtypes,
    card?.evolvesFrom,
    card?.vera_evolvesFrom,
    card?.artist,
    card?.regulationMark,
    card?.flavorText,
    card?.vera_flavorText,
    card?.rules,
    card?.abilities,
    card?.attacks,
    card?.weaknesses,
    card?.resistances
  ]);

  const numberValues = collectSearchStrings([
    card?.number,
    card?.vera_number,
    card?.tcgdex_localId
  ]);

  return {
    nameValues,
    setValues,
    taxonomyValues,
    numberValues,
    fullText: [...nameValues, ...setValues, ...taxonomyValues, ...numberValues].join(' ')
  };
}

function computeSearchScore(card, normalizedQuery, structuredQuery, mixedQuery, set = null) {
  const context = buildCardSearchContext(card, set);
  const numberRaw = String(card.number || '').toLowerCase();
  const normalizedCardNumber = normalizeCardNumberForSearch(card.number);

  if (structuredQuery) {
    const numberMatch = !structuredQuery.cardNumber || cardNumberMatchesQuery(card.number, structuredQuery.cardNumber);
    const nameMatch = !structuredQuery.namePart || matchesTokensInValues(structuredQuery.namePart, context.nameValues.length ? context.nameValues : [context.fullText]);
    if (!numberMatch || !nameMatch) return -1;

    let score = 1000;
    if (structuredQuery.cardNumber) score += 250;
    if (structuredQuery.namePart?.length) {
      score += structuredQuery.namePart.length * 45;
      score += 90;
    }
    return score;
  }

  if (mixedQuery) {
    const numberMatch = cardNumberMatchesQuery(card.number, mixedQuery.cardNumber);
    const nameMatch = matchesTokensInValues(mixedQuery.nameTokens, context.nameValues.length ? context.nameValues : [context.fullText]);
    if (!numberMatch || !nameMatch) return -1;

    return 900 + (mixedQuery.nameTokens.length * 45) + 220;
  }

  const normalizedFreeQuery = normalizeSearchText(normalizedQuery).trim();
  const queryTokens = normalizedFreeQuery
    .split(/\s+/)
    .map((token) => sanitizeSearchToken(token))
    .filter(Boolean);
  const meaningfulTokens = extractMeaningfulNameTokens(queryTokens);

  if (!queryTokens.length) return -1;

  const exactNameMatch = context.nameValues.some((value) => value === normalizedFreeQuery);
  const nameStartsWith = context.nameValues.some((value) => value.startsWith(normalizedFreeQuery));
  const nameContains = context.nameValues.some((value) => value.includes(normalizedFreeQuery));
  const setExactMatch = context.setValues.some((value) => value === normalizedFreeQuery);
  const setContains = context.setValues.some((value) => value.includes(normalizedFreeQuery));
  const taxonomyContains = context.taxonomyValues.some((value) => value.includes(normalizedFreeQuery));
  const numberContains = context.numberValues.some((value) => value.includes(normalizedFreeQuery))
    || normalizedCardNumber.includes(normalizedFreeQuery)
    || numberRaw.includes(normalizedFreeQuery)
    || cardNumberMatchesQuery(card.number, normalizedFreeQuery);

  const numberLikeTokens = queryTokens.filter((token) => /^[a-z._-]*\d+[a-z._-]*$/.test(token));
  const nameLikeTokens = meaningfulTokens;
  const nameTokenMatch = nameLikeTokens.length ? matchesTokensInValues(nameLikeTokens, context.nameValues.length ? context.nameValues : [context.fullText]) : false;
  const setTokenMatch = nameLikeTokens.length ? matchesTokensInValues(nameLikeTokens, context.setValues) : false;
  const taxonomyTokenMatch = nameLikeTokens.length ? matchesTokensInValues(nameLikeTokens, context.taxonomyValues) : false;
  const numberTokenMatch = numberLikeTokens.length ? numberLikeTokens.every((token) => cardNumberMatchesQuery(card.number, token)) : false;
  const fullTokenMatch = queryTokens.every((token) => context.fullText.includes(token) || cardNumberMatchesQuery(card.number, token));

  const isMatch = exactNameMatch
    || nameStartsWith
    || nameContains
    || setExactMatch
    || setContains
    || taxonomyContains
    || numberContains
    || nameTokenMatch
    || setTokenMatch
    || taxonomyTokenMatch
    || numberTokenMatch
    || fullTokenMatch;

  if (!isMatch) return -1;

  let score = 0;
  if (exactNameMatch) score += 420;
  else if (nameStartsWith) score += 320;
  else if (nameContains) score += 220;

  if (numberContains) score += 190;
  if (setExactMatch) score += 240;
  else if (setContains) score += 140;
  if (taxonomyContains || taxonomyTokenMatch) score += 60;
  if (nameTokenMatch) score += 110;
  if (setTokenMatch) score += 95;
  if (numberTokenMatch) score += 135;
  if (fullTokenMatch && queryTokens.length > 1) score += 120;
  if (nameTokenMatch && numberTokenMatch) score += 180;

  return score;
}

function matchesCardSearch(card, normalizedQuery, structuredQuery, mixedQuery, set = null) {
  return computeSearchScore(card, normalizedQuery, structuredQuery, mixedQuery, set) >= 0;
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

function hasRichCardDetails(card = {}) {
  return Boolean(
    String(card?.rarity || '').trim()
    || String(card?.hp || '').trim()
    || (Array.isArray(card?.types) && card.types.length)
    || String(card?.supertype || '').trim()
    || String(card?.artist || '').trim()
    || (Array.isArray(card?.rules) && card.rules.length)
    || String(card?.flavorText || '').trim()
  );
}

function needsApiCardEnrichment(cards = []) {
  const sample = (Array.isArray(cards) ? cards : []).filter(Boolean).slice(0, 12);
  if (!sample.length) return false;
  const richCount = sample.filter((card) => hasRichCardDetails(card)).length;
  return richCount < Math.max(1, Math.ceil(sample.length * 0.4));
}

function sortSearchResults(results = []) {
  return results.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    const setCompare = String(left.set?.setName || '').localeCompare(String(right.set?.setName || ''), 'de', { sensitivity: 'base' });
    if (setCompare !== 0) return setCompare;
    return String(left.card?.number || '').localeCompare(String(right.card?.number || ''), undefined, { numeric: true, sensitivity: 'base' });
  });
}

function getSearchResultKey(card = {}, set = null) {
  const setId = String(set?.setId || '').trim();
  const cardNumber = normalizeCardNumber(card?.number || '');
  const fallbackName = normalizeSearchText(card?.name || '');
  return `${setId}::${cardNumber || fallbackName || 'card'}`;
}

function getSearchResultsInOrder(resultsMap, orderedKeys = []) {
  if (!(resultsMap instanceof Map)) return [];
  if (!Array.isArray(orderedKeys) || !orderedKeys.length) {
    return Array.from(resultsMap.values());
  }

  const orderedResults = [];
  const seenKeys = new Set();

  orderedKeys.forEach((key) => {
    if (!resultsMap.has(key)) return;
    orderedResults.push(resultsMap.get(key));
    seenKeys.add(key);
  });

  resultsMap.forEach((value, key) => {
    if (!seenKeys.has(key)) {
      orderedResults.push(value);
    }
  });

  return orderedResults;
}

function renderSearchToolbarMeta({
  rawQuery = '',
  searchScopeMode = SEARCH_SCOPE_IMPORTED,
  resultCount = 0,
  setsProcessed = 0,
  totalSets = 0,
  isSearching = false,
  emptyMessage = '',
} = {}) {
  if (!dom.searchToolbarMeta) return;

  const modeMeta = getSearchModeMeta(searchScopeMode);
  const safeResultCount = Number.isFinite(resultCount) ? Math.max(0, resultCount) : 0;
  const progressSuffix = totalSets > 0
    ? ` · ${Math.min(setsProcessed, totalSets)}/${totalSets} Sets`
    : '';

  let statusText = emptyMessage || 'Suchbegriff oben eingeben.';
  if (!emptyMessage && rawQuery) {
    if (isSearching) {
      statusText = `${safeResultCount || '…'} Ergebnis${safeResultCount === 1 ? '' : 'se'} · Suche läuft${progressSuffix}`;
    } else if (safeResultCount > 0) {
      statusText = `${safeResultCount} Ergebnis${safeResultCount === 1 ? '' : 'se'} gefunden`;
    } else {
      statusText = `Keine Treffer${progressSuffix}`;
    }
  }

  dom.searchToolbarMeta.innerHTML = `
    <span class="search-mode-badge ${modeMeta.className}">${modeMeta.label}</span>
    <span class="search-meta-pill${isSearching ? ' is-live' : ''}">${statusText}</span>
  `;
}

function renderSearchResultsList(results = [], searchScopeMode, options = {}) {
  if (!dom.searchResults) return;

  const {
    rawQuery = '',
    setsProcessed = 0,
    totalSets = 0,
    isSearching = false,
  } = options;

  const safeResults = Array.isArray(results) ? results : [];
  const modeMeta = getSearchModeMeta(searchScopeMode);
  const progressSuffix = totalSets > 0
    ? ` (${Math.min(setsProcessed, totalSets)}/${totalSets} Sets geprüft)`
    : '';

  renderSearchToolbarMeta({
    rawQuery,
    searchScopeMode,
    resultCount: safeResults.length,
    setsProcessed,
    totalSets,
    isSearching,
  });

  if (!safeResults.length) {
    if (isSearching) {
      dom.searchResults.innerHTML = `
        <div class="search-results-head">
          <span class="search-mode-badge ${modeMeta.className}">${modeMeta.label}</span>
        </div>
        <p class="loading-placeholder">Suche läuft…${progressSuffix}</p>
      `;
      return;
    }

    dom.searchResults.innerHTML = `
      <div class="search-results-head">
        <span class="search-mode-badge ${modeMeta.className}">${modeMeta.label}</span>
      </div>
      <p class="empty-state">Keine Karten für „${rawQuery}“ gefunden (durchsucht: ${totalSets} Sets, ${modeMeta.hint}).</p>
    `;
    return;
  }

  dom.searchResults.innerHTML = `
    <div class="search-results-head">
      <p class="search-result-count">${safeResults.length} Ergebnis${safeResults.length !== 1 ? 'se' : ''}${isSearching ? ' · Suche läuft…' : ''}</p>
      <span class="search-mode-badge ${modeMeta.className}">${modeMeta.label}</span>
    </div>
  `;

  const frag = document.createDocumentFragment();
  safeResults.forEach(({ card, set, dbMap, apiOnly }) => {
    const key = normalizeCardNumber(card.number);
    frag.appendChild(createSearchResultCard(card, key, dbMap.get(key), set, apiOnly));
  });

  if (isSearching) {
    const loading = document.createElement('p');
    loading.className = 'loading-placeholder';
    loading.textContent = `Suche läuft…${progressSuffix}`;
    frag.appendChild(loading);
  }

  dom.searchResults.appendChild(frag);
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
    state.lastSearchResults = [];
    renderSearchToolbarMeta({
      searchScopeMode,
      emptyMessage: 'Suchbegriff oben eingeben.'
    });
    dom.searchResults.innerHTML = '<p class="empty-state">Suchbegriff eingeben.</p>';
    return;
  }
  const setFilter = getSearchSetFilterValue();
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
    state.lastSearchResults = [];
    renderSearchToolbarMeta({
      rawQuery,
      searchScopeMode,
      emptyMessage: 'Mindestens 2 Zeichen eingeben oder Enter drücken.'
    });
    dom.searchResults.innerHTML = '<p class="empty-state">Mindestens 2 Zeichen eingeben oder Enter drücken.</p>';
    return;
  }

  if (force || structuredQuery || mixedQuery || rawQuery.length >= 3) {
    window.SEARCH_HISTORY = addSearchHistory(rawQuery);
  }
  // Für die eigentliche Suche das importierte Set bevorzugen (hat Collection-Daten),
  // fallback auf das Set aus allSets falls nicht importiert.
  const setsToSearch = structuredQuery
    ? [baseSetsToSearch.find((s) => s.setId === structuredQuery.setId) ?? structuredQuery.set]
    : baseSetsToSearch;
  if (!setsToSearch.length) {
    renderSearchToolbarMeta({
      rawQuery,
      searchScopeMode,
      emptyMessage: 'Keine passenden Sets verfügbar.'
    });
    dom.searchResults.innerHTML = '<p class="empty-state">Keine passenden Sets verfügbar.</p>';
    return;
  }
  renderSearchResultsList([], searchScopeMode, {
    rawQuery,
    setsProcessed: 0,
    totalSets: setsToSearch.length,
    isSearching: true,
  });

  const resultsMap = new Map();
  const apiPhaseQueue = [];
  let apiRenderOrderKeys = null;
  let searchedSetsCount = 0;
  let shouldStopSearch = false;

  const upsertMatches = (cards, set, dbMap) => {
    (Array.isArray(cards) ? cards : []).forEach((card) => {
      const score = computeSearchScore(card, query, structuredQuery, mixedQuery, set);
      if (score < 0) return;
      const resultKey = getSearchResultKey(card, set);
      const hadKey = resultsMap.has(resultKey);
      resultsMap.set(resultKey, {
        card,
        set,
        dbMap,
        score,
        apiOnly: Boolean(card?.__searchApiOnly),
        resultKey,
      });
      if (!hadKey && Array.isArray(apiRenderOrderKeys) && !apiRenderOrderKeys.includes(resultKey)) {
        apiRenderOrderKeys.push(resultKey);
      }
    });
  };

  const renderCurrentResults = ({ isSearching = false, preserveSortedPrefix = false } = {}) => {
    const currentResults = preserveSortedPrefix
      ? getSearchResultsInOrder(resultsMap, apiRenderOrderKeys)
      : Array.from(resultsMap.values());

    if (!currentResults.length) return;
    state.lastSearchResults = currentResults.slice(0, 60);
    if (isStale() || isAborted()) return;
    renderSearchResultsList(currentResults, searchScopeMode, {
      rawQuery,
      setsProcessed: searchedSetsCount,
      totalSets: setsToSearch.length,
      isSearching,
    });
  };

  for (const set of setsToSearch) {
    if (isStale() || isAborted()) return;
    try {
      const cacheKey = `cards_${set.setId}`;
      const dbCardsCacheKey = `db_cards_${set.setId}`;
      const dbCacheKey = `db_${set.setId}`;
      const searchCacheKey = `${set.setId}::${searchScopeMode}`;
      const useApiForSet = shouldUseApiForSearchSet(searchScopeMode, set);

      let dbCards = [];
      if (cache.has(dbCardsCacheKey)) {
        dbCards = cache.get(dbCardsCacheKey) || [];
      } else {
        dbCards = await readDbCardsForSet(set.setId).catch(() => []);
        if (Array.isArray(dbCards) && dbCards.length > 0) {
          cache.set(dbCardsCacheKey, dbCards, CONFIG.CACHE_TTL_MS);
        }
      }

      let dbMap = new Map();
      if (cache.has(dbCacheKey)) dbMap = cache.get(dbCacheKey);
      else {
        dbMap = await readSetCollectionMap(set.setName).catch(() => new Map());
        cache.set(dbCacheKey, dbMap, CONFIG.CACHE_TTL_MS);
      }

      const hasDbCards = Array.isArray(dbCards) && dbCards.length > 0;
      const shouldFetchApiCards = useApiForSet || (searchScopeMode === SEARCH_SCOPE_ALL && !hasDbCards);
      const dbSearchCards = !useApiForSet && hasDbCards ? dbCards : [];

      if (dbSearchCards.length > 0) {
        upsertMatches(dbSearchCards, set, dbMap);
        state.searchCache.set(searchCacheKey, dbSearchCards);
      }

      if (shouldFetchApiCards) {
        apiPhaseQueue.push({ set, dbCards, dbMap, cacheKey, searchCacheKey });
      }

      if (!structuredQuery && !mixedQuery && resultsMap.size >= 200 && searchScopeMode === SEARCH_SCOPE_IMPORTED) {
        shouldStopSearch = true;
      }
      if (structuredQuery?.cardNumber && !structuredQuery?.namePart && resultsMap.size >= 1 && !shouldFetchApiCards) {
        shouldStopSearch = true;
      }
    } catch (err) {
      if (err?.name === 'AbortError') {
        return;
      }
      console.warn('[runSearch] error for set', set.setId, err);
    }

    searchedSetsCount += 1;

    if (resultsMap.size > 0) {
      renderCurrentResults({
        isSearching: searchedSetsCount < setsToSearch.length || (!shouldStopSearch && apiPhaseQueue.length > 0),
      });
    }

    if (shouldStopSearch) break;
  }

  if (shouldStopSearch) {
    apiPhaseQueue.length = 0;
  }

  const hasPendingApiPhase = apiPhaseQueue.length > 0;
  if (resultsMap.size > 0) {
    const dbSortedResults = sortSearchResults(Array.from(resultsMap.values()));
    apiRenderOrderKeys = hasPendingApiPhase
      ? dbSortedResults.map((entry) => entry.resultKey)
      : null;
    state.lastSearchResults = dbSortedResults.slice(0, 60);

    if (isStale() || isAborted()) return;
    renderSearchResultsList(dbSortedResults, searchScopeMode, {
      rawQuery,
      setsProcessed: searchedSetsCount,
      totalSets: setsToSearch.length,
      isSearching: hasPendingApiPhase,
    });
  }

  if (!shouldStopSearch && hasPendingApiPhase) {
    for (let apiIndex = 0; apiIndex < apiPhaseQueue.length; apiIndex += 1) {
      if (isStale() || isAborted()) return;
      const { set, dbCards, dbMap, cacheKey, searchCacheKey } = apiPhaseQueue[apiIndex];

      try {
        let apiCards = [];
        if (cache.has(cacheKey)) {
          apiCards = cache.get(cacheKey) || [];
        } else {
          const apiPayload = await fetchMergedCardsWithSetMeta(set.setId, { signal: abortController.signal }).catch(() => ({ cards: [], setMetaPatch: null }));
          apiCards = Array.isArray(apiPayload?.cards) ? apiPayload.cards : [];
          if (apiCards.length > 0) {
            cache.set(cacheKey, apiCards, CONFIG.CACHE_TTL_MS);
          }
        }

        const mergedCards = searchScopeMode === SEARCH_SCOPE_ONLINE
          ? mergeSearchCards([], apiCards)
          : mergeSearchCards(dbCards, apiCards);

        state.searchCache.set(searchCacheKey, mergedCards || []);

        if (mergedCards.length > 0) {
          upsertMatches(mergedCards, set, dbMap);
          renderCurrentResults({
            isSearching: apiIndex < apiPhaseQueue.length - 1,
            preserveSortedPrefix: true,
          });
        }

        if (structuredQuery?.cardNumber && !structuredQuery?.namePart && resultsMap.size >= 1) {
          shouldStopSearch = true;
        }
      } catch (err) {
        if (err?.name === 'AbortError') {
          return;
        }
        console.warn('[runSearch] api phase error for set', set.setId, err);
      }

      if (shouldStopSearch) break;
    }
  }

  if (!resultsMap.size) {
    const modeMeta = getSearchModeMeta(searchScopeMode);
    renderSearchToolbarMeta({
      rawQuery,
      searchScopeMode,
      resultCount: 0,
      setsProcessed: setsToSearch.length,
      totalSets: setsToSearch.length,
      emptyMessage: `Keine Treffer · ${setsToSearch.length} Sets geprüft`
    });
    dom.searchResults.innerHTML = `
      <div class="search-results-head">
        <span class="search-mode-badge ${modeMeta.className}">${modeMeta.label}</span>
      </div>
      <p class="empty-state">Keine Karten für „${rawQuery}“ gefunden (durchsucht: ${setsToSearch.length} Sets, ${modeMeta.hint}).</p>
    `;
    return;
  }

  const finalResults = sortSearchResults(Array.from(resultsMap.values()));
  state.lastSearchResults = finalResults.slice(0, 60);

  if (isStale() || isAborted()) return;
  renderSearchResultsList(finalResults, searchScopeMode, {
    rawQuery,
    setsProcessed: setsToSearch.length,
    totalSets: setsToSearch.length,
    isSearching: false,
  });
}

function createSearchResultCard(card, key, db, set, apiOnly = false) {
  const article = document.createElement('article');
  article.className = 'card search-result-card';
  if (db?.rh)     article.classList.add('reverse');
  else if (db?.g) article.classList.add('collected');

  const imgWrap = document.createElement('div');
  imgWrap.className = 'card-img-wrap';
  const img = document.createElement('img');
  img.src = card.image || ''; img.alt = card.name || key; img.loading = 'lazy';
  attachImageFallback(img, card, set?.setId || '');
  imgWrap.appendChild(img);

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
  article.append(imgWrap, meta);

  article.addEventListener('click', async () => {
    try {
      await openSearchResultLightbox(card, set, { apiOnly });
    } catch (err) {
      showToast(`Karte konnte nicht geöffnet werden: ${err.message}`, 'error');
    }
  });

  goToSetBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    navigateToSearchResultSet(set, card);
  });

  return article;
}

function navigateToSearchResultSet(set, card = null) {
  if (!set?.setId) return;
  const resolvedSet = getSetById(set.setId) || set;
  state.pendingSearchSetImport = Boolean(!resolvedSet?.imported);
  state.pendingSearchCardFocusKey = card?.number ? normalizeCardNumber(card.number) : null;
  ensureSetSelectorOption(resolvedSet);
  dom.selector.value = resolvedSet.setId;

  const targetHash = `#set/${resolvedSet.setId}`;
  if (window.location.hash === targetHash) {
    showView('set');
    loadCurrentSet(false);
    return;
  }

  navigate(`set/${resolvedSet.setId}`);
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

        const hasDbCards = Array.isArray(dbCards) && dbCards.length > 0;
        const shouldFetchApiCards = useApiForSet
          || (searchScopeMode === SEARCH_SCOPE_ALL && !hasDbCards)
          || needsApiCardEnrichment(dbCards);

        if (!shouldFetchApiCards) {
          state.searchCache.set(searchCacheKey, dbCards);
          return dbCards;
        }

        let apiCards = [];
        if (cache.has(`cards_${set.setId}`)) {
          apiCards = cache.get(`cards_${set.setId}`) || [];
        } else {
          const apiPayload = await fetchMergedCardsWithSetMeta(set.setId).catch(() => ({ cards: [], setMetaPatch: null }));
          apiCards = Array.isArray(apiPayload?.cards) ? apiPayload.cards : [];
        }
        if (Array.isArray(apiCards) && apiCards.length > 0) {
          cache.set(`cards_${set.setId}`, apiCards, CONFIG.CACHE_TTL_MS);
        }

        const mergedCards = searchScopeMode === SEARCH_SCOPE_ONLINE
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
  syncRefreshControls();
  state.cards = cards;
  state.dbMap = dbMap;
  state.lightboxIndex = targetIndex;
  state.pendingSearchSetImport = Boolean(apiOnly || !set?.imported);

  openLightbox(targetIndex);
}

function shouldDismissMobileSearchKeyboard() {
  try {
    return Boolean(
      window.matchMedia?.('(pointer: coarse)')?.matches
      || /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent || '')
    );
  } catch {
    return false;
  }
}

function dismissSearchAutocomplete({ blurInput = false } = {}) {
  const list = document.getElementById('search-autocomplete');
  if (list) {
    list.classList.add('hidden');
  }

  if (blurInput && dom.searchInput && typeof dom.searchInput.blur === 'function') {
    window.requestAnimationFrame(() => dom.searchInput?.blur());
  }
}

function initSearch() {
  let debounce;
  dom.searchInput.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => runSearch(), SEARCH_INPUT_DEBOUNCE_MS);
  });
  dom.searchSetFilter.addEventListener('change', () => {
    if (dom.searchScopeMode) {
      dom.searchScopeMode.value = getSearchScopeMode();
    }
    state.searchCache.clear();
    runSearch({ force: true });
  });
  dom.searchScopeMode?.addEventListener('change', () => {
    const selectedMode = String(dom.searchScopeMode?.value || SEARCH_SCOPE_IMPORTED);
    renderSearchSetFilterOptions();
    if (dom.searchSetFilter) {
      dom.searchSetFilter.value = `scope:${selectedMode}`;
    }
    state.searchCache.clear();
    runSearch({ force: true });
  });
  dom.searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(debounce);
      dismissSearchAutocomplete({ blurInput: shouldDismissMobileSearchKeyboard() });
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

  if (state.currentSet?.setName) {
    const summaryRow = {
      setName: state.currentSet.setName,
      total,
      collected,
      rh,
      percent
    };
    state.summaryOverrides.set(state.currentSet.setName, summaryRow);
    if (state.currentSet?.setId) {
      state.summaryOverrides.set(state.currentSet.setId, summaryRow);
    }
    if (Array.isArray(state.summaryData)) {
      const rowIndex = state.summaryData.findIndex((row) => row?.setName === state.currentSet.setName);
      if (rowIndex >= 0) {
        state.summaryData[rowIndex] = { ...state.summaryData[rowIndex], ...summaryRow };
      } else {
        state.summaryData.push(summaryRow);
      }
    }
    syncDashboardCardForSet(state.currentSet, summaryRow);
  }
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
  revealPendingSearchCardFocus();
}

function revealPendingSearchCardFocus() {
  const targetKey = String(state.pendingSearchCardFocusKey || '').trim();
  if (!targetKey || !dom.cards) return;

  state.pendingSearchCardFocusKey = null;
  const safeKey = targetKey.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const article = dom.cards.querySelector(`[data-card-id="${safeKey}"]`);
  if (!article) return;

  window.requestAnimationFrame(() => {
    article.scrollIntoView({ block: 'center', behavior: 'smooth' });
    article.focus();
  });
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
  imgWrap.addEventListener('click', (e) => {
    if (state.bulkMode) return;
    e.stopPropagation();
    openLightbox(index);
  });

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
    makeCheckbox('RH', 'rh', dbEntry?.rh ?? false, !isEditable || !dbEntry?.rhCell)
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
    const target = e.target;
    if (target instanceof HTMLElement && target.closest('input, a, label')) return;

    if (!state.bulkMode) {
      openLightbox(index);
      return;
    }

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

function syncCollectionCheckboxUi(gInput, rhInput, db, { isEditable = Boolean(state.currentSet?.setName) } = {}) {
  const uiState = getCollectionUiState(db, { isEditable });
  if (gInput) {
    gInput.checked = uiState.gChecked;
    gInput.disabled = uiState.gDisabled;
  }
  if (rhInput) {
    rhInput.checked = uiState.rhChecked;
    rhInput.disabled = uiState.rhDisabled;
  }
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
    const prevState = { g: Boolean(db?.g), rh: Boolean(db?.rh) };
    setCardSaveState(article, 'saving');
    beginTrackedWrite(`Karte #${db?.displayId || key} speichern`);
    try {
      await ensureDbEntry();
      const nextState = resolveCollectionToggleState(db, { isG: true, checked });
      await updateCellBoolean(state.currentSet.setName, db.gCell.row, db.gCell.col, nextState.g);
      if (db?.rhCell && nextState.rh !== Boolean(db?.rh)) {
        await updateCellBoolean(state.currentSet.setName, db.rhCell.row, db.rhCell.col, nextState.rh);
      }
      db.g = nextState.g;
      db.rh = nextState.rh;
      updateCardState(article, db);
      updateStats(); applyFilter();
      state.summaryData = null;
      pushUndoEntry({
        setId: state.currentSet?.setId,
        setName: state.currentSet?.setName,
        label: 'Kartenstatus geändert',
        changes: [{ key, prev: prevState, next: { g: Boolean(db.g), rh: Boolean(db.rh) } }]
      });
      updateUndoUi();
      broadcastRealtimeCardUpdate(key, db);
      setCardSaveState(article, 'saved');
      finishTrackedWrite(`Karte #${db?.displayId || key} speichern`, null);
    } catch (err) {
      showToast(`Speichern fehlgeschlagen: ${err.message}`, 'error');
      gInput.checked = !checked;
      setCardSaveState(article, 'error');
      finishTrackedWrite(`Karte #${db?.displayId || key} speichern`, err);
    }
  });

  rhInput.addEventListener('change', async () => {
    if (state.bulkMode) { rhInput.checked = !rhInput.checked; return; }
    if (!db?.rhCell) { rhInput.checked = false; return; }
    const checked = rhInput.checked;
    const prevState = { g: Boolean(db?.g), rh: Boolean(db?.rh) };
    setCardSaveState(article, 'saving');
    beginTrackedWrite(`Karte #${db?.displayId || key} RH speichern`);
    try {
      await ensureDbEntry();
      const nextState = resolveCollectionToggleState(db, { isG: false, checked });
      if (nextState.g !== Boolean(db?.g)) {
        await updateCellBoolean(state.currentSet.setName, db.gCell.row, db.gCell.col, nextState.g);
      }
      await updateCellBoolean(state.currentSet.setName, db.rhCell.row, db.rhCell.col, nextState.rh);
      db.g = nextState.g;
      db.rh = nextState.rh;
      updateCardState(article, db);
      updateStats(); applyFilter();
      state.summaryData = null;
      pushUndoEntry({
        setId: state.currentSet?.setId,
        setName: state.currentSet?.setName,
        label: 'RH-Status geändert',
        changes: [{ key, prev: prevState, next: { g: Boolean(db.g), rh: Boolean(db.rh) } }]
      });
      updateUndoUi();
      broadcastRealtimeCardUpdate(key, db);
      setCardSaveState(article, 'saved');
      finishTrackedWrite(`Karte #${db?.displayId || key} RH speichern`, null);
    } catch (err) {
      showToast(`Speichern fehlgeschlagen: ${err.message}`, 'error');
      rhInput.checked = !checked;
      setCardSaveState(article, 'error');
      finishTrackedWrite(`Karte #${db?.displayId || key} RH speichern`, err);
    }
  });
}

function updateCardState(article, db) {
  const gInput = article?.querySelector('input[data-type="g"]');
  const rhInput = article?.querySelector('input[data-type="rh"]');
  syncCollectionCheckboxUi(gInput, rhInput, db);
  article.classList.toggle('reverse',   Boolean(db?.rh));
  article.classList.toggle('collected', Boolean(db?.g) && !db?.rh);
  if (dom.lightboxDialog.open) {
    const idx = parseInt(article.dataset.cardIndex, 10);
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
function syncLightboxModalState() {
  const shouldLockScroll = Boolean(dom.lightboxDialog?.open || dom.lightboxImageDialog?.open);
  document.documentElement.classList.toggle('modal-scroll-locked', shouldLockScroll);
  document.body.classList.toggle('modal-scroll-locked', shouldLockScroll);
}

function openLightbox(index) {
  if (!dom.lightboxDialog) return;
  state.lightboxIndex = index;
  renderLightbox(index);
  if (dom.lightboxImageDialog?.open) {
    dom.lightboxImageDialog.close();
  }
  if (!dom.lightboxDialog.open) {
    dom.lightboxDialog.showModal();
  }
  dom.lightboxDialog.scrollTop = 0;
  dom.lightboxDialog.querySelector('.lightbox-meta')?.scrollTo({ top: 0, behavior: 'auto' });
  syncLightboxModalState();
  dom.btnLightboxClose?.focus({ preventScroll: true });
}

function closeLightbox() {
  if (dom.lightboxImageDialog?.open) {
    dom.lightboxImageDialog.close();
  }
  if (dom.lightboxDialog?.open) {
    dom.lightboxDialog.close();
  }
  syncLightboxModalState();
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

  const lightboxCard = {
    ...card,
    image: card.imageLarge || card.image || '',
    imageCandidates: Array.isArray(card.imageLargeCandidates) && card.imageLargeCandidates.length
      ? card.imageLargeCandidates
      : (Array.isArray(card.imageCandidates) ? card.imageCandidates : [])
  };
  dom.lightboxImg.src              = lightboxCard.image || '';
  attachImageFallback(dom.lightboxImg, lightboxCard, state.currentSet?.setId || '');
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
  syncCollectionCheckboxUi(dom.lightboxGCheck, dom.lightboxRhCheck, db, {
    isEditable: Boolean(state.currentSet?.setName)
  });
  dom.btnLightboxPrev.disabled  = index === 0;
  dom.btnLightboxNext.disabled  = index === state.cards.length - 1;
}

function initLightbox() {
  dom.btnLightboxClose.addEventListener('click', closeLightbox);
  dom.lightboxDialog.addEventListener('click', (e) => { if (e.target === dom.lightboxDialog) closeLightbox(); });
  dom.lightboxDialog.addEventListener('close', syncLightboxModalState);
  dom.lightboxDialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    closeLightbox();
  });

  const goPrevLightboxCard = () => {
    if (state.lightboxIndex > 0) {
      state.lightboxIndex--;
      renderLightbox(state.lightboxIndex);
      return true;
    }
    return false;
  };

  const goNextLightboxCard = () => {
    if (state.lightboxIndex < state.cards.length - 1) {
      state.lightboxIndex++;
      renderLightbox(state.lightboxIndex);
      return true;
    }
    return false;
  };

  dom.btnLightboxPrev.addEventListener('click', goPrevLightboxCard);
  dom.btnLightboxNext.addEventListener('click', goNextLightboxCard);

  dom.lightboxDialog.addEventListener('keydown', (e) => {
    if (e.key === 'Escape')     closeLightbox();
    if (e.key === 'ArrowLeft')  goPrevLightboxCard();
    if (e.key === 'ArrowRight') goNextLightboxCard();
    if (e.key === ' ')          { e.preventDefault(); dom.lightboxGCheck.click(); }
  });

  const lightboxImgWrap = dom.lightboxDialog.querySelector('.lightbox-img-wrap');
  if (lightboxImgWrap) {
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;

    lightboxImgWrap.addEventListener('touchstart', (e) => {
      if (!dom.lightboxDialog.open || e.touches.length !== 1) return;
      const touch = e.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      touchStartTime = Date.now();
    }, { passive: true });

    lightboxImgWrap.addEventListener('touchend', (e) => {
      if (!dom.lightboxDialog.open || !touchStartTime || e.changedTouches.length !== 1) return;
      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchStartX;
      const deltaY = touch.clientY - touchStartY;
      const elapsed = Date.now() - touchStartTime;

      touchStartTime = 0;

      const minDistance = 48;
      const maxVertical = 42;
      const maxDuration = 700;
      const isHorizontalSwipe = Math.abs(deltaX) >= minDistance
        && Math.abs(deltaY) <= maxVertical
        && elapsed <= maxDuration;

      const isSwipeDownToClose = deltaY >= 72
        && Math.abs(deltaX) <= 50
        && elapsed <= maxDuration;

      if (isSwipeDownToClose) {
        closeLightbox();
        return;
      }

      if (!isHorizontalSwipe) return;

      if (deltaX > 0) goPrevLightboxCard();
      else if (deltaX < 0) goNextLightboxCard();
    }, { passive: true });
  }

  if (dom.lightboxImg && dom.lightboxImageDialog && dom.lightboxImageFull && dom.lightboxImageStage && dom.btnLightboxImageClose) {
    let fsScale = 1;
    let fsTranslateX = 0;
    let fsTranslateY = 0;
    let fsStartX = 0;
    let fsStartY = 0;
    let fsStartTime = 0;
    let fsStartTranslateX = 0;
    let fsStartTranslateY = 0;
    let fsPinchStartDistance = 0;
    let fsPinchStartScale = 1;

    const resetFullscreenTransform = () => {
      fsScale = 1;
      fsTranslateX = 0;
      fsTranslateY = 0;
      dom.lightboxImageFull.style.transform = 'translate3d(0, 0, 0) scale(1)';
    };

    const applyFullscreenTransform = () => {
      dom.lightboxImageFull.style.transform = `translate3d(${fsTranslateX}px, ${fsTranslateY}px, 0) scale(${fsScale})`;
    };

    const syncFullscreenImage = (resetTransform = false) => {
      const card = state.cards[state.lightboxIndex];
      if (!card) return;
      const fullscreenCard = {
        ...card,
        image: card.imageLarge || dom.lightboxImg?.currentSrc || card.image || '',
        imageCandidates: Array.isArray(card.imageLargeCandidates) && card.imageLargeCandidates.length
          ? card.imageLargeCandidates
          : (Array.isArray(card.imageCandidates) ? card.imageCandidates : [])
      };
      dom.lightboxImageFull.src = fullscreenCard.image || '';
      attachImageFallback(dom.lightboxImageFull, fullscreenCard, state.currentSet?.setId || '');
      dom.lightboxImageFull.alt = card.name || '';
      if (resetTransform) resetFullscreenTransform();
    };

    const openFullscreenImage = () => {
      syncFullscreenImage(true);
      dom.lightboxImageDialog.showModal();
      syncLightboxModalState();
    };

    const closeFullscreenImage = () => {
      if (!dom.lightboxImageDialog.open) return;
      dom.lightboxImageDialog.close();
      resetFullscreenTransform();
      syncLightboxModalState();
    };

    dom.lightboxImg.addEventListener('click', () => {
      if (!dom.lightboxDialog.open) return;
      openFullscreenImage();
    });

    dom.btnLightboxImageClose.addEventListener('click', closeFullscreenImage);
    dom.lightboxImageDialog.addEventListener('close', syncLightboxModalState);
    dom.lightboxImageDialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      closeFullscreenImage();
    });
    dom.lightboxImageDialog.addEventListener('click', (e) => {
      if (e.target === dom.lightboxImageDialog) closeFullscreenImage();
    });
    dom.lightboxImageDialog.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeFullscreenImage();
      if (e.key === 'ArrowLeft') {
        if (goPrevLightboxCard()) syncFullscreenImage(true);
      }
      if (e.key === 'ArrowRight') {
        if (goNextLightboxCard()) syncFullscreenImage(true);
      }
    });

    const distance = (touchA, touchB) => {
      const dx = touchA.clientX - touchB.clientX;
      const dy = touchA.clientY - touchB.clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    dom.lightboxImageStage.addEventListener('touchstart', (e) => {
      if (!dom.lightboxImageDialog.open) return;
      if (e.touches.length === 2) {
        fsPinchStartDistance = distance(e.touches[0], e.touches[1]);
        fsPinchStartScale = fsScale;
        fsStartTime = 0;
        return;
      }
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      fsStartX = touch.clientX;
      fsStartY = touch.clientY;
      fsStartTime = Date.now();
      fsStartTranslateX = fsTranslateX;
      fsStartTranslateY = fsTranslateY;
    }, { passive: true });

    dom.lightboxImageStage.addEventListener('touchmove', (e) => {
      if (!dom.lightboxImageDialog.open) return;
      if (e.touches.length === 2) {
        const currentDistance = distance(e.touches[0], e.touches[1]);
        if (!fsPinchStartDistance) {
          fsPinchStartDistance = currentDistance;
          fsPinchStartScale = fsScale;
          return;
        }
        const nextScale = fsPinchStartScale * (currentDistance / fsPinchStartDistance);
        fsScale = Math.max(1, Math.min(4, nextScale));
        if (fsScale === 1) {
          fsTranslateX = 0;
          fsTranslateY = 0;
        }
        applyFullscreenTransform();
        e.preventDefault();
        return;
      }

      if (e.touches.length !== 1 || fsScale <= 1) return;
      const touch = e.touches[0];
      fsTranslateX = fsStartTranslateX + (touch.clientX - fsStartX);
      fsTranslateY = fsStartTranslateY + (touch.clientY - fsStartY);
      applyFullscreenTransform();
      e.preventDefault();
    }, { passive: false });

    dom.lightboxImageStage.addEventListener('touchend', (e) => {
      if (!dom.lightboxImageDialog.open) return;

      if (e.touches.length === 0) {
        fsPinchStartDistance = 0;
      }

      if (!fsStartTime || e.changedTouches.length !== 1 || fsScale > 1) return;

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - fsStartX;
      const deltaY = touch.clientY - fsStartY;
      const elapsed = Date.now() - fsStartTime;
      fsStartTime = 0;

      const minHorizontal = 52;
      const maxVertical = 44;
      const isHorizontalSwipe = Math.abs(deltaX) >= minHorizontal
        && Math.abs(deltaY) <= maxVertical
        && elapsed <= 700;

      if (isHorizontalSwipe) {
        if (deltaX > 0) {
          if (goPrevLightboxCard()) syncFullscreenImage(true);
        } else {
          if (goNextLightboxCard()) syncFullscreenImage(true);
        }
        return;
      }

      const isSwipeDownClose = deltaY >= 78
        && Math.abs(deltaX) <= 52
        && elapsed <= 700;
      if (isSwipeDownClose) {
        closeFullscreenImage();
      }
    }, { passive: true });
  }

  async function lightboxToggle(isG, checked) {
    const card = state.cards[state.lightboxIndex];
    if (!card) return;
    const key = normalizeCardNumber(card.number);
    const article = dom.cards.querySelector(`[data-card-index="${state.lightboxIndex}"]`);
    let db = state.dbMap.get(key) || { displayId: card.number, g: false, rh: false, gCell: null, rhCell: null };
    const prevState = { g: Boolean(db?.g), rh: Boolean(db?.rh) };
    const shouldEnsureImportedSet = checked && (Boolean(state.pendingSearchSetImport) || !Boolean(state.currentSet?.imported));
    if (shouldEnsureImportedSet) {
      const setToImport = state.currentSet;
      const setId = setToImport?.setId;
      if (!setId) return;
      setLoading(true, `Importiere ${setToImport.setName}…`);
      try {
        const importPayload = await fetchMergedCardsWithSetMeta(setId).catch(() => ({ cards: [], setMetaPatch: null }));
        const importCards = Array.isArray(importPayload?.cards) ? importPayload.cards : [];
        if (!importCards.length) {
          throw new Error('Keine Kartendaten für den automatischen Set-Import gefunden.');
        }
        const refreshedSet = await ensureSetImportedFromApi(setToImport, importCards, {
          setMetaPatch: importPayload?.setMetaPatch || null,
          showSuccessToast: true,
          successMessage: `${setToImport.setName} wurde automatisch importiert.`,
          source: 'lightbox'
        });
        state.currentSet = refreshedSet || { ...setToImport, imported: true };
        state.pendingSearchSetImport = false;
        state.dbMap = await readSetCollectionMap(state.currentSet.setName).catch(() => new Map());
        cache.set(`db_${setId}`, state.dbMap, CONFIG.CACHE_TTL_MS);
        db = state.dbMap.get(key) || db;
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
    setCardSaveState(article, 'saving');
    beginTrackedWrite(`Lightbox #${db?.displayId || key}`);
    try {
      if (!isG && !db?.rhCell) {
        renderLightbox(state.lightboxIndex);
        return;
      }
      const nextState = resolveCollectionToggleState(db, { isG, checked });
      if (nextState.g !== Boolean(db?.g)) {
        await updateCellBoolean(state.currentSet.setName, db.gCell.row, db.gCell.col, nextState.g);
      }
      if (db?.rhCell && nextState.rh !== Boolean(db?.rh)) {
        await updateCellBoolean(state.currentSet.setName, db.rhCell.row, db.rhCell.col, nextState.rh);
      }
      db.g = nextState.g;
      db.rh = nextState.rh;
      renderLightbox(state.lightboxIndex);
      if (article) updateCardState(article, db);
      updateStats();
      state.summaryData = null;
      pushUndoEntry({
        setId: state.currentSet?.setId,
        setName: state.currentSet?.setName,
        label: 'Lightbox-Änderung',
        changes: [{ key, prev: prevState, next: { g: Boolean(db.g), rh: Boolean(db.rh) } }]
      });
      updateUndoUi();
      broadcastRealtimeCardUpdate(key, db);
      runSearch({ force: true });
      setCardSaveState(article, 'saved');
      finishTrackedWrite(`Lightbox #${db?.displayId || key}`, null);
    } catch (err) {
      showToast(`Fehler: ${err.message}`, 'error');
      renderLightbox(state.lightboxIndex); // revert UI
      setCardSaveState(article, 'error');
      finishTrackedWrite(`Lightbox #${db?.displayId || key}`, err);
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
  if (!state.bulkSelected.size) { showToast('Keine Karten ausgewählt.', 'info'); return; }
  beginTrackedWrite('Bulk-Update');
  setLoading(true, 'Massenaktion…');
  let updated = 0, errors = 0;
  const undoChanges = [];
  try {
    for (const key of state.bulkSelected) {
      const db = state.dbMap.get(key);
      if (!db?.gCell) continue;
      const prevState = { g: Boolean(db?.g), rh: Boolean(db?.rh) };
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
        undoChanges.push({ key, prev: prevState, next: { g: Boolean(db.g), rh: Boolean(db.rh) } });
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
  if (undoChanges.length) {
    pushUndoEntry({
      setId: state.currentSet?.setId,
      setName: state.currentSet?.setName,
      label: 'Bulk-Änderung',
      changes: undoChanges
    });
    updateUndoUi();
  }
  finishTrackedWrite('Bulk-Update', errors > 0 ? new Error(`${errors} Fehler`) : null);
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
  const selected = state.sets.find((s) => s.setId === setId) || getSetById(setId);
  if (!selected) return;

  ensureSetSelectorOption(selected);

  state.currentSet = selected;
  syncRefreshControls();
  sessionStorage.setItem('tcg_last_set', setId);
  syncSetNavLink(selected);

  setGlobalStatus(`Lade ${selected.setName}\u2026`);
  setLoading(true, `Lade ${selected.setName}\u2026`);

  const safeSetLogoUrl = sanitizeSetAssetUrl(selected.logoUrl, selected.setId);
  const safeSetSymbolUrl = sanitizeSetAssetUrl(selected.symbolUrl, selected.setId);

  if (safeSetLogoUrl) {
    attachSetAssetFallback(dom.setLogo, './assets/pokeball-fallback.svg', selected.logoUrlCandidates);
    dom.setLogo.style.display = '';
    dom.setLogo.src = safeSetLogoUrl;

    if (safeSetSymbolUrl) {
      attachSetAssetFallback(dom.setSymbol, '', selected.symbolUrlCandidates);
      dom.setSymbol.style.display = '';
      dom.setSymbol.src = safeSetSymbolUrl;
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
    const shouldAutoImportCurrentView = shouldAutoImportCurrentSet(selected, {
      fromSearchJump: Boolean(state.pendingSearchSetImport)
    });
    const allowApiFallback = getSearchScopeMode() === SEARCH_SCOPE_ONLINE || Boolean(state.pendingSearchSetImport) || !Boolean(selected.imported);
    if (forceRefresh) { cache.del(cardsCacheKey); cache.del(dbCacheKey); }

    const [cards, dbMap] = await Promise.all([
      cache.has(cardsCacheKey)
        ? cache.get(cardsCacheKey)
        : readDbCardsForSet(setId).then(async (dbCards) => {
          if (Array.isArray(dbCards) && dbCards.length > 0) {
            const shouldHydrateFromApi = allowApiFallback || needsApiCardEnrichment(dbCards);
            if (!shouldHydrateFromApi) {
              cache.set(cardsCacheKey, dbCards, CONFIG.CACHE_TTL_MS);
              return dbCards;
            }

            const apiPayload = await fetchMergedCardsWithSetMeta(setId).catch(() => ({ cards: [], setMetaPatch: null }));
            const apiCards = Array.isArray(apiPayload?.cards) ? apiPayload.cards : [];
            const mergedCards = apiCards.length > 0 ? mergeSearchCards(dbCards, apiCards) : dbCards;
            cache.set(cardsCacheKey, mergedCards, CONFIG.CACHE_TTL_MS);

            if (apiCards.length > 0 && shouldAutoImportCurrentView) {
              ensureSetImportedFromApi(selected, apiCards, {
                setMetaPatch: apiPayload?.setMetaPatch || null,
                source: state.pendingSearchSetImport ? 'search-jump' : 'set-view'
              }).catch((autoImportErr) => {
                console.warn('[loadCurrentSet] auto-import failed for set', setId, autoImportErr);
              });
            }

            return mergedCards;
          }
          if (allowApiFallback) {
            const apiPayload = await fetchMergedCardsWithSetMeta(setId).catch(() => ({ cards: [], setMetaPatch: null }));
            const apiCards = Array.isArray(apiPayload?.cards) ? apiPayload.cards : [];
            if (apiCards.length > 0) {
              cache.set(cardsCacheKey, apiCards, CONFIG.CACHE_TTL_MS);
              if (shouldAutoImportCurrentView) {
                ensureSetImportedFromApi(selected, apiCards, {
                  setMetaPatch: apiPayload?.setMetaPatch || null,
                  source: state.pendingSearchSetImport ? 'search-jump' : 'set-view'
                }).catch((autoImportErr) => {
                  console.warn('[loadCurrentSet] auto-import failed for set', setId, autoImportErr);
                });
              }
            }
            return apiCards;
          }
          return [];
        }),
      cache.has(dbCacheKey)    ? cache.get(dbCacheKey)    : readSetCollectionMap(selected.setName).then((m) => { cache.set(dbCacheKey, m, CONFIG.CACHE_TTL_MS); return m; }),
    ]);

    if (!Array.isArray(cards) || cards.length === 0) {
      throw new Error('Keine Kartendaten in der Datenbank gefunden. Bitte Set importieren/aktualisieren oder API-Fallback aktivieren.');
    }

    if (shouldAutoImportCurrentView && allowApiFallback && cards.length > 0) {
      ensureSetImportedFromApi(selected, cards, {
        source: state.pendingSearchSetImport ? 'search-jump-cache' : 'set-view-cache'
      }).catch((autoImportErr) => {
        console.warn('[loadCurrentSet] deferred auto-import failed for set', setId, autoImportErr);
      });
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
  initAutoHideTopbar();
  initGridZoom();
  initCustomSelects();
  initFilterButtons();
  initSpreadsheetDialog();
  initBatchImportDialog();
  initManageImportedSetsDialog();
  initBackupImportExport();
  initQueueBuilderDialog();
  initLightbox();
  initBulkEdit();
  initKeyboardNav();
  initDashboardControls();
  initSheetsWriteFeedback();
  initAuditAndSaveUi();
  initDevCompletionMode();
  initSortControl();
  initSearch();
  initOfflineIndicator();
  initDashboardHoverPreview();
  initSearchAutocomplete();
  initShareButton();

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
  
  // Shortcuts Overlay: wird durch showShortcutsOverlay() bereitgestellt (Feature 8)
  
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
    'settings': () => openSettingsDialog(),
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
    if (link.dataset.navToggle) return;
    link.addEventListener('click', (e) => {
      e.preventDefault();
      navigate(link.dataset.view);
    });
  });
  dom.btnNavSetToggle?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (dom.btnNavSetToggle.disabled) return;
    setRecentSetsDropdownOpen(!dom.navSetSplit?.classList.contains('open'));
  });
  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Node)) return;
    if (!dom.navSetSplit?.contains(event.target)) {
      setRecentSetsDropdownOpen(false);
    }
    if (!dom.refreshSplit?.contains(event.target)) {
      setRefreshMenuOpen(false);
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setRecentSetsDropdownOpen(false);
      setRefreshMenuOpen(false);
    }
  });
  window.addEventListener('resize', positionRecentSetsDropdown, { passive: true });
  window.addEventListener('scroll', positionRecentSetsDropdown, { passive: true });
  window.addEventListener('hashchange', handleRouteChange);

  setLoading(true, 'Initialisiere\u2026');
  setGlobalStatus('Initialisiere Google API\u2026');

  try {
    const autoLoggedIn = await initAuth();

    syncAuthButtonLabel();
    window.addEventListener('resize', syncAuthButtonLabel, { passive: true });

    dom.auth.addEventListener('click', async () => {
      if (dom.auth.dataset.state === 'out') { signOut(); resetToLoggedOut(); return; }
      dom.auth.disabled = true;
      setGlobalStatus('Bitte Google-Login im Popup abschließen…');
      showToast('Google-Login im Popup geöffnet.', 'info', 2600);
      const ok = await signIn();
      if (!ok) { dom.auth.disabled = false; showToast('Login fehlgeschlagen oder abgebrochen.', 'error'); setGlobalStatus('Login fehlgeschlagen oder abgebrochen.'); return; }
      onLoginSuccess();
    });

    dom.load.addEventListener('click', async () => {
      if (!isSignedIn()) return;
      setRefreshMenuOpen(false);
      const setId = dom.selector.value;
      if (setId) navigate(`set/${setId}`);
      await loadCurrentSet(false);
    });

    dom.refresh.addEventListener('click', async () => {
      if (!isSignedIn() || !state.currentSet) return;
      setRefreshMenuOpen(false);
      await loadCurrentSet(true);
    });

    dom.btnRefreshMenu?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!isSignedIn() || dom.btnRefreshMenu.disabled || !state.currentSet) return;
      setRefreshMenuOpen(dom.refreshMenu?.classList.contains('hidden'));
    });

    dom.btnRefreshReimport?.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      setRefreshMenuOpen(false);
      if (!isSignedIn() || !state.currentSet) return;
      await reimportCurrentSetFromApi();
    });

    dom.selector.addEventListener('change', () => {
      setRefreshMenuOpen(false);
      const setId = dom.selector.value;
      if (setId) {
        navigate(`set/${setId}`);
        return;
      }
      state.currentSet = null; state.cards = []; state.dbMap = new Map();
      syncRefreshControls();
      syncSetNavLink(null);
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
  dom.auth.dataset.state = 'out'; dom.auth.disabled = false; syncAuthButtonLabel();
  renderRecentSets();
  if (!CONFIG.SPREADSHEET_ID) { openSpreadsheetDialog(true); setLoading(false); return; }
  updateSpreadsheetInfoBar();
  await loadSets();
}

function resetToLoggedOut() {
  state.loggedIn = false; state.sets = []; state.allSets = []; state.currentSet = null;
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

      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            newWorker.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });
      
      // Check for updates periodically
      setInterval(() => {
        registration.update().catch(err => console.warn('SW update check failed:', err));
      }, 60000); // Check every minute
      
      // Handle controller change (new SW ready)
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        showToast('🔄 App wurde aktualisiert', 'success', 1500);
        window.setTimeout(() => {
          window.location.reload();
        }, 300);
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

const _featureInitFlags = {
  offline: false,
  hoverPreview: false,
  autocomplete: false,
  statsDrilldown: false,
  shortcuts: false,
  share: false,
};

const _connectivityState = {
  browserOnline: navigator.onLine,
  appOnline: null,
  checking: false,
  lastError: null,
  pollTimer: null
};

// ══════════════════════════════════════════════════════════════════════════
// FEATURE 2: Charts in Statistiken (Chart.js)
// ══════════════════════════════════════════════════════════════════════════
const _statsChartInstances = {};

function initStatsCharts(totalCollected, totalCards, seriesMap) {
  if (!window.Chart) return;

  Object.values(_statsChartInstances).forEach((chartInstance) => {
    try { chartInstance.destroy(); } catch (_) { /* noop */ }
  });

  const textColor = '#94a3b8';
  const gridColor = '#1e293b';

  const ctxOverall = document.getElementById('chart-overall')?.getContext('2d');
  if (ctxOverall) {
    _statsChartInstances.overall = new window.Chart(ctxOverall, {
      type: 'doughnut',
      data: {
        labels: ['Gesammelt', 'Fehlend'],
        datasets: [{
          data: [totalCollected, Math.max(0, totalCards - totalCollected)],
          backgroundColor: ['#22c55e', '#1e293b'],
          borderColor: ['#16a34a', '#334155'],
          borderWidth: 2,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        cutout: '68%',
        plugins: {
          legend: { labels: { color: textColor, font: { size: 12 } } },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.label}: ${ctx.parsed.toLocaleString('de-DE')} Karten`
            }
          }
        }
      }
    });
  }

  const ctxSeries = document.getElementById('chart-series')?.getContext('2d');
  if (ctxSeries) {
    const topSeries = [...seriesMap.entries()]
      .filter(([, group]) => (group.total || 0) > 0)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 8);

    _statsChartInstances.series = new window.Chart(ctxSeries, {
      type: 'bar',
      data: {
        labels: topSeries.map(([key, group]) => {
          const label = getStatsSeriesLabel(key, group);
          return label.length > 16 ? `${label.slice(0, 14)}…` : label;
        }),
        datasets: [{
          label: 'Gesammelt %',
          data: topSeries.map(([, group]) => (group.total > 0 ? Math.round((group.collected / group.total) * 100) : 0)),
          backgroundColor: '#0ea5e9',
          borderRadius: 4,
          barThickness: 14
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => ` ${ctx.parsed.x}%` } }
        },
        scales: {
          x: {
            min: 0,
            max: 100,
            grid: { color: gridColor },
            ticks: { color: textColor, callback: (value) => `${value}%` }
          },
          y: {
            grid: { color: gridColor },
            ticks: { color: textColor, font: { size: 11 } }
          }
        }
      }
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// FEATURE 3: Offline-Status-Indikator
// ══════════════════════════════════════════════════════════════════════════
function isOfflineLikeError(err) {
  const status = Number(err?.status || err?.result?.error?.code || 0);
  if (status === 0) return true;

  const message = String(err?.result?.error?.message || err?.message || '').toLowerCase();
  if (!message) return false;

  return message.includes('failed to fetch')
    || message.includes('network')
    || message.includes('offline')
    || message.includes('timeout')
    || message.includes('unreachable')
    || message.includes('load failed');
}

function renderOfflineIndicator() {
  const banner = document.getElementById('offline-banner');

  const offline = _connectivityState.appOnline === false
    || (_connectivityState.appOnline == null && !_connectivityState.browserOnline);

  if (banner) banner.classList.toggle('visible', offline);
  document.body.classList.toggle('is-offline', offline);
}

async function probeAppConnectivity(options = {}) {
  const silent = options.silent !== false;
  _connectivityState.browserOnline = navigator.onLine;

  if (_connectivityState.checking) return _connectivityState.appOnline;
  if (!isSignedIn()) {
    _connectivityState.appOnline = _connectivityState.browserOnline;
    _connectivityState.lastError = null;
    renderOfflineIndicator();
    return _connectivityState.appOnline;
  }

  if (!CONFIG.SPREADSHEET_ID || !globalThis.gapi?.client?.sheets?.spreadsheets?.get) {
    _connectivityState.appOnline = _connectivityState.browserOnline;
    renderOfflineIndicator();
    return _connectivityState.appOnline;
  }

  _connectivityState.checking = true;
  try {
    await globalThis.gapi.client.sheets.spreadsheets.get({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      fields: 'spreadsheetId'
    });
    const wasOffline = _connectivityState.appOnline === false;
    _connectivityState.appOnline = true;
    _connectivityState.lastError = null;
    renderOfflineIndicator();
    if (!silent && wasOffline) {
      showToast('🟢 Verbindung zu Google Sheets wiederhergestellt', 'success', 2500);
    }
  } catch (err) {
    _connectivityState.lastError = err;
    if (isOfflineLikeError(err)) {
      const wasOnline = _connectivityState.appOnline !== false;
      _connectivityState.appOnline = false;
      renderOfflineIndicator();
      if (!silent && wasOnline) {
        showToast('📴 Keine Verbindung zu Google Sheets – gespeicherte Daten werden angezeigt', 'info', 3500);
      }
    } else {
      // Auth/config problems are not the same as offline mode.
      _connectivityState.appOnline = true;
      renderOfflineIndicator();
    }
  } finally {
    _connectivityState.checking = false;
  }

  return _connectivityState.appOnline;
}

function initOfflineIndicator() {
  if (_featureInitFlags.offline) return;
  _featureInitFlags.offline = true;

  window.addEventListener('online', () => {
    _connectivityState.browserOnline = true;
    probeAppConnectivity({ silent: false });
  });

  window.addEventListener('offline', () => {
    _connectivityState.browserOnline = false;
    probeAppConnectivity({ silent: false });
  });

  renderOfflineIndicator();
  probeAppConnectivity({ silent: true });

  clearInterval(_connectivityState.pollTimer);
  _connectivityState.pollTimer = setInterval(() => {
    probeAppConnectivity({ silent: true });
  }, 30000);
}

// ══════════════════════════════════════════════════════════════════════════
// FEATURE 4: Set-Card Hover-Preview
// ══════════════════════════════════════════════════════════════════════════
function initDashboardHoverPreview() {
  if (_featureInitFlags.hoverPreview) return;
  _featureInitFlags.hoverPreview = true;

  if (window.matchMedia('(hover: none)').matches) return;
  const grid = document.getElementById('dashboard-grid');
  if (!grid) return;

  let tip = document.getElementById('dash-hover-tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'dash-hover-tip';
    tip.className = 'dash-hover-tip hidden';
    document.body.appendChild(tip);
  }

  let currentCard = null;

  grid.addEventListener('mouseover', (event) => {
    const card = event.target.closest('.dash-set-card');
    if (!card || card === currentCard) return;
    currentCard = card;

    let data = {};
    try { data = JSON.parse(card.dataset.hoverData || '{}'); } catch (_) { data = {}; }
    if (!data.name) return;

    tip.innerHTML = data.imported
      ? `
        <p class="dhp-name">${data.name}</p>
        <p class="dhp-hint">${data.series || ''}</p>
        <div class="dhp-pct-bar"><div class="dhp-pct-fill" style="width:${data.percent || 0}%"></div></div>
        <div class="dhp-row"><span>Gesammelt</span><strong>${data.collected || 0}/${data.total || 0}</strong></div>
        <div class="dhp-row"><span>Fortschritt</span><strong>${data.percent || 0}%</strong></div>
        ${data.rh > 0 ? `<div class="dhp-row"><span>Reverse Holos</span><strong>${data.rh}</strong></div>` : ''}
      `
      : `
        <p class="dhp-name">${data.name}</p>
        <p class="dhp-hint">Noch nicht importiert · ${data.total || '?'} Karten</p>
      `;

    tip.classList.remove('hidden');
  });

  grid.addEventListener('mousemove', (event) => {
    if (!currentCard || tip.classList.contains('hidden')) return;
    const margin = 12;
    const tipW = tip.offsetWidth || 220;
    const tipH = tip.offsetHeight || 140;
    let left = event.clientX + margin;
    let top = event.clientY + margin;
    if (left + tipW > window.innerWidth) left = event.clientX - tipW - margin;
    if (top + tipH > window.innerHeight) top = event.clientY - tipH - margin;
    tip.style.left = `${Math.max(8, left)}px`;
    tip.style.top = `${Math.max(8, top)}px`;
  });

  const hideTip = () => {
    currentCard = null;
    tip.classList.add('hidden');
  };

  grid.addEventListener('mouseleave', hideTip);
  grid.addEventListener('mouseout', (event) => {
    if (!grid.contains(event.relatedTarget)) hideTip();
  });
}

// ══════════════════════════════════════════════════════════════════════════
// FEATURE 5: Set-Completion Celebration
// ══════════════════════════════════════════════════════════════════════════
function triggerCompletionCelebration(setId, cardEl) {
  const setName = cardEl.querySelector('.dash-set-name')?.textContent || setId;
  showToast(`🎉 ${setName} vollständig gesammelt!`, 'success', 5000);

  if (window.confetti) {
    const rect = cardEl.getBoundingClientRect();
    const x = (rect.left + rect.width / 2) / window.innerWidth;
    const y = (rect.top + rect.height / 2) / window.innerHeight;
    window.confetti({
      particleCount: 120,
      spread: 75,
      origin: { x, y },
      colors: ['#f59e0b', '#ef4444', '#3b82f6', '#22c55e', '#8b5cf6', '#ec4899']
    });
  }

  cardEl.classList.add('complete-celebrate');
  cardEl.addEventListener('animationend', () => cardEl.classList.remove('complete-celebrate'), { once: true });
}

function checkSetCompletion(setId, percent, cardEl) {
  if (!setId) return;
  const storageKey = `completed_set_${setId}`;
  if (percent < 100) {
    localStorage.removeItem(storageKey);
    return;
  }
  if (localStorage.getItem(storageKey)) return;
  localStorage.setItem(storageKey, '1');
  const delay = state.devCompletionMode ? 40 : 450;
  setTimeout(() => triggerCompletionCelebration(setId, cardEl), delay);
}

// ══════════════════════════════════════════════════════════════════════════
// FEATURE 6: Suche-Autocomplete
// ══════════════════════════════════════════════════════════════════════════
function initSearchAutocomplete() {
  if (_featureInitFlags.autocomplete) return;
  _featureInitFlags.autocomplete = true;

  const input = document.getElementById('search-input');
  const list = document.getElementById('search-autocomplete');
  if (!input || !list) return;

  let selectedIndex = -1;
  let activeItems = [];
  let hideTimer = null;

  const escapeHtml = (value) => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const clearHideTimer = () => {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  };

  const hideList = () => {
    clearHideTimer();
    list.classList.add('hidden');
  };

  const scheduleHide = () => {
    clearHideTimer();
    hideTimer = setTimeout(() => {
      list.classList.add('hidden');
    }, 220);
  };

  const pushCandidate = (map, candidate, score = 0) => {
    if (!candidate?.key || !candidate?.label) return;
    const existing = map.get(candidate.key);
    if (!existing || score > existing.score) {
      map.set(candidate.key, { ...candidate, score });
    }
  };

  const buildCandidates = (query) => {
    const normalizedQuery = normalizeSearchText(query).trim();
    const entries = new Map();
    const history = Array.isArray(window.SEARCH_HISTORY) ? window.SEARCH_HISTORY : loadSearchHistory();

    const addHistoryEntries = () => {
      history
        .filter((item) => !normalizedQuery || normalizeSearchText(item).includes(normalizedQuery))
        .slice(0, normalizedQuery ? 4 : 6)
        .forEach((item, idx) => {
          pushCandidate(entries, {
            key: `history:${normalizeSearchText(item)}`,
            label: item,
            value: item,
            badge: 'Zuletzt',
            meta: 'Vorherige Suche',
            type: 'history'
          }, 120 - idx);
        });
    };

    addHistoryEntries();

    const setsPool = getSetsForSearchMode(getSearchScopeMode());
    (Array.isArray(setsPool) ? setsPool : []).forEach((set) => {
      const label = String(set?.setName || set?.tcgdex_name || set?.vera_name || set?.setId || '').trim();
      if (!label) return;

      const haystackValues = collectSearchStrings([
        label,
        set?.setId,
        set?.series,
        set?.vera_series,
        set?.tcgdex_serie_name,
        set?.ptcgoCode,
        set?.vera_ptcgoCode,
        set?.tcgdex_abbreviation_official,
        set?.vera_name,
        set?.tcgdex_name
      ]);
      const haystack = haystackValues.join(' ');
      if (normalizedQuery && !haystack.includes(normalizedQuery)) return;

      const labelNorm = normalizeSearchText(label);
      let score = 70;
      if (labelNorm === normalizedQuery) score += 180;
      else if (labelNorm.startsWith(normalizedQuery)) score += 130;
      else if (labelNorm.includes(normalizedQuery)) score += 95;

      pushCandidate(entries, {
        key: `set:${set?.setId || labelNorm}`,
        label,
        value: label,
        badge: set?.ptcgoCode || set?.setId || 'Set',
        meta: set?.series || set?.tcgdex_serie_name || 'Set',
        type: 'set',
        setId: set?.setId || ''
      }, score);
    });

    const cardBundles = [];
    const pushCardBundle = (card, set) => {
      if (!card) return;
      cardBundles.push({ card, set: set || null });
    };

    (Array.isArray(state.lastSearchResults) ? state.lastSearchResults : []).forEach((entry) => {
      pushCardBundle(entry?.card, entry?.set);
    });

    if (Array.isArray(state.cards) && state.currentSet) {
      state.cards.forEach((card) => pushCardBundle(card, state.currentSet));
    }

    let inspectedCards = 0;
    state.searchCache?.forEach((cards, key) => {
      if (inspectedCards >= 800) return;
      const setId = String(key || '').split('::')[0];
      const setMeta = (state.allSets || state.sets || []).find((entry) => String(entry?.setId || '') === setId) || null;
      (Array.isArray(cards) ? cards : []).slice(0, 40).forEach((card) => {
        if (inspectedCards >= 800) return;
        inspectedCards += 1;
        pushCardBundle(card, setMeta);
      });
    });

    const seenCards = new Set();
    cardBundles.forEach(({ card, set }) => {
      const uniqueKey = `${set?.setId || 'unknown'}::${normalizeCardNumber(card?.number || card?.vera_number || card?.tcgdex_localId || '')}`;
      if (!card?.name || seenCards.has(uniqueKey)) return;
      seenCards.add(uniqueKey);

      const label = String(card?.name || card?.tcgdex_name || card?.vera_name || '').trim();
      if (!label) return;

      const nameValues = collectSearchStrings([card?.name, card?.vera_name, card?.tcgdex_name]);
      const haystack = collectSearchStrings([
        label,
        card?.number,
        card?.vera_number,
        card?.tcgdex_localId,
        nameValues,
        set?.setName,
        set?.series,
        set?.ptcgoCode
      ]).join(' ');
      if (normalizedQuery && !haystack.includes(normalizedQuery)) return;

      const labelNorm = normalizeSearchText(label);
      let score = 60;
      if (labelNorm === normalizedQuery) score += 200;
      else if (labelNorm.startsWith(normalizedQuery)) score += 150;
      else if (labelNorm.includes(normalizedQuery)) score += 105;
      if (cardNumberMatchesQuery(card?.number, normalizedQuery)) score += 120;

      const altNames = nameValues.filter((value) => value !== labelNorm).slice(0, 2);
      const metaParts = [
        set?.setName || set?.series || '',
        altNames.length ? `Alias: ${altNames.join(' · ')}` : ''
      ].filter(Boolean);

      pushCandidate(entries, {
        key: `card:${uniqueKey}`,
        label,
        value: label,
        badge: card?.number || card?.tcgdex_localId || 'Karte',
        meta: metaParts.join(' · '),
        type: 'card',
        setId: set?.setId || ''
      }, score);
    });

    return [...entries.values()]
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        return String(left.label || '').localeCompare(String(right.label || ''), 'de', { sensitivity: 'base' });
      })
      .slice(0, 10);
  };

  const renderList = (items) => {
    activeItems = items;
    selectedIndex = -1;
    if (!items.length) {
      list.classList.add('hidden');
      list.innerHTML = '';
      return;
    }

    list.innerHTML = items.map((item, idx) => `
      <li class="search-ac-item search-ac-item--${escapeHtml(item.type)}" role="option" data-idx="${idx}">
        <span class="ac-main">
          <span class="ac-label">${escapeHtml(item.label)}</span>
          ${item.meta ? `<small class="ac-meta">${escapeHtml(item.meta)}</small>` : ''}
        </span>
        <span class="ac-badge">${escapeHtml(item.badge || '')}</span>
      </li>
    `).join('');
    list.classList.remove('hidden');
  };

  const applySelection = (item) => {
    if (!item) return;
    clearHideTimer();
    if (item.setId && dom.searchSetFilter) {
      const hasOption = [...dom.searchSetFilter.options].some((option) => option.value === item.setId);
      if (hasOption) dom.searchSetFilter.value = item.setId;
    }
    input.value = item.value || item.label || '';
    list.classList.add('hidden');
    window.SEARCH_HISTORY = addSearchHistory(input.value);
    runSearch({ force: true });
    input.focus();
  };

  input.addEventListener('focus', () => {
    clearHideTimer();
    renderList(buildCandidates(input.value));
  });

  input.addEventListener('input', () => {
    clearHideTimer();
    renderList(buildCandidates(input.value));
  });

  input.addEventListener('blur', scheduleHide);
  list.addEventListener('pointerenter', clearHideTimer);
  list.addEventListener('pointerleave', () => {
    if (document.activeElement !== input) scheduleHide();
  });

  input.addEventListener('keydown', (event) => {
    if (list.classList.contains('hidden') && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      renderList(buildCandidates(input.value));
    }

    const items = [...list.querySelectorAll('.search-ac-item')];
    if (!items.length || list.classList.contains('hidden')) {
      if (event.key === 'Escape') hideList();
      if (event.key === 'Enter') dismissSearchAutocomplete({ blurInput: shouldDismissMobileSearchKeyboard() });
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (selectedIndex >= 0) {
        applySelection(activeItems[selectedIndex]);
      } else {
        dismissSearchAutocomplete({ blurInput: shouldDismissMobileSearchKeyboard() });
      }
      return;
    } else if (event.key === 'Escape') {
      hideList();
      return;
    } else {
      return;
    }

    items.forEach((item, idx) => item.classList.toggle('keyboard-focus', idx === selectedIndex));
  });

  list.addEventListener('mousedown', (event) => {
    const item = event.target.closest('.search-ac-item');
    if (!item) return;
    event.preventDefault();
    const idx = Number(item.dataset.idx || '-1');
    applySelection(activeItems[idx]);
  });

  document.addEventListener('pointerdown', (event) => {
    if (!input.contains(event.target) && !list.contains(event.target)) {
      scheduleHide();
    } else {
      clearHideTimer();
    }
  });
}

// ══════════════════════════════════════════════════════════════════════════
// FEATURE 7: Statistiken Drill-Down
// ══════════════════════════════════════════════════════════════════════════
function initStatsDrillDown() {
  const statsContent = document.getElementById('stats-content');
  if (!statsContent || _featureInitFlags.statsDrilldown) return;
  _featureInitFlags.statsDrilldown = true;

  statsContent.addEventListener('click', (event) => {
    const row = event.target.closest('.stats-series-row');
    if (!row) return;

    const seriesKey = row.dataset.series || '';
    const seriesLabel = row.dataset.seriesLabel || row.querySelector('.stats-series-name')?.textContent?.trim() || seriesKey;
    if (!seriesKey) return;

    const existing = document.getElementById('stats-drilldown');
    if (existing) {
      const isSameSeries = existing.dataset.series === seriesKey;
      existing.remove();
      document.querySelectorAll('.stats-series-row.expanded').forEach((el) => el.classList.remove('expanded'));
      if (isSameSeries) return;
    }

    const seriesSets = filterSetsBySeriesKey(state.sets || [], seriesKey);
    const summaryRows = state.summaryData || [];

    const panel = document.createElement('div');
    panel.id = 'stats-drilldown';
    panel.className = 'stats-drilldown';
    panel.dataset.series = seriesKey;

    panel.innerHTML = `
      <h4>📦 ${seriesLabel} – ${seriesSets.length} Sets</h4>
      <div class="stats-drilldown-grid">
        ${seriesSets.map((set) => {
          const summary = summaryRows.find((entry) => entry.setName === set.setName) || {};
          const total = Number(summary.total || set.totalCards || 0);
          const collected = Number(summary.collected || 0);
          const pct = total > 0 ? Math.round((collected / total) * 100) : 0;
          const missing = total > 0 ? Math.max(0, total - collected) : null;
          const statusClass = pct >= 100 ? 'is-complete' : pct >= 75 ? 'is-close' : '';
          return `
            <div class="stats-drill-set ${statusClass}">
              <div class="stats-drill-set-head">
                <strong>${set.setName}</strong>
                <span class="stats-drill-pct">${pct}%</span>
              </div>
              <div class="mini-bar"><div class="mini-fill" style="width:${pct}%"></div></div>
              <span class="drill-nums">
                <span>${collected}/${total || '?'} Karten</span>
                <span>${missing == null ? 'Gesamt unbekannt' : `${missing} fehlend`}</span>
              </span>
            </div>
          `;
        }).join('')}
      </div>
    `;

    row.classList.add('expanded');
    row.insertAdjacentElement('afterend', panel);
  });
}

// ══════════════════════════════════════════════════════════════════════════
// FEATURE 8: Keyboard-Shortcuts Overlay
// ══════════════════════════════════════════════════════════════════════════
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

function showShortcutsOverlay() {
  const existing = document.getElementById('shortcuts-overlay');
  if (existing) {
    existing.remove();
    return;
  }

  const overlay = document.createElement('div');
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

  document.body.appendChild(overlay);
}

function initShortcutsOverlay() {
  if (_featureInitFlags.shortcuts) return;
  _featureInitFlags.shortcuts = true;

  window.addEventListener('keydown', (event) => {
    if (event.target?.matches?.('input, textarea, select, [contenteditable]')) return;
    const isQuestionShortcut = event.key === '?' || (event.key === '/' && event.shiftKey) || (event.code === 'Slash' && event.shiftKey);
    if (isQuestionShortcut) {
      event.preventDefault();
      showShortcutsOverlay();
      return;
    }
    if (event.key === 'Escape') {
      document.getElementById('shortcuts-overlay')?.remove();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    switch (event.key.toLowerCase()) {
      case 'd':
        event.preventDefault();
        location.hash = '#dashboard';
        break;
      case 's': {
        event.preventDefault();
        const lastSet = state?.currentSet?.setId || sessionStorage.getItem('tcg_last_set');
        location.hash = lastSet ? `#set/${lastSet}` : '#dashboard';
        break;
      }
      case 't':
        event.preventDefault();
        location.hash = '#stats';
        break;
      case '/':
        event.preventDefault();
        location.hash = '#search';
        // Route-Render kann asynchron sein: mehrfach versuchen, dann sinnvollen Fallback nutzen.
        {
          const focusSearchInput = () => {
            const searchInput = document.getElementById('search-input');
            const viewSearch = document.getElementById('view-search');
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
            document.getElementById('dash-filter')?.focus();
          };
          setTimeout(tick, 0);
        }
        break;
    }
  });
}

initShortcutsOverlay();

// ══════════════════════════════════════════════════════════════════════════
// FEATURE 9: Sammlung teilen (ShareURL)
// ══════════════════════════════════════════════════════════════════════════
function initShareButton() {
  if (_featureInitFlags.share) return;
  _featureInitFlags.share = true;

  const btn = document.getElementById('btn-share');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const ssid = CONFIG.SPREADSHEET_ID || '';
    const shareUrl = new URL(location.href);
    shareUrl.hash = '#dashboard';
    shareUrl.searchParams.delete('ssid');
    shareUrl.searchParams.delete('share');
    shareUrl.searchParams.delete('nocache');
    shareUrl.searchParams.delete('t');
    if (ssid) shareUrl.searchParams.set('ssid', ssid);
    showShareDialog(shareUrl.toString());
  });

  const ssidFromUrl = new URLSearchParams(location.search).get('ssid');
  if (ssidFromUrl && ssidFromUrl.length > 10 && !CONFIG.SPREADSHEET_ID) {
    sessionStorage.setItem('tcg_pending_ssid', ssidFromUrl);
  }
}

function showShareDialog(url) {
  const existing = document.getElementById('dialog-share');
  if (existing) {
    existing.showModal();
    return;
  }

  const dialog = document.createElement('dialog');
  dialog.id = 'dialog-share';
  dialog.className = 'ss-dialog share-dialog';
  dialog.innerHTML = `
    <h2>🔗 Sammlung teilen</h2>
    <p>Der Link enthält deine Spreadsheet-ID und funktioniert für Personen mit Zugriff auf dein Sheet.</p>
    <div class="share-url-wrap">
      <input class="share-url-input" type="text" readonly value="${url.replace(/"/g, '&quot;')}" />
      <button class="share-copy-btn" type="button">📋 Kopieren</button>
    </div>
    <div class="dialog-actions">
      <button class="btn-secondary" type="button" onclick="this.closest('dialog').close()">Schließen</button>
    </div>
  `;

  dialog.querySelector('.share-copy-btn').addEventListener('click', async () => {
    const input = dialog.querySelector('.share-url-input');
    try {
      await navigator.clipboard.writeText(input.value);
    } catch (_) {
      input.select();
      document.execCommand('copy');
    }
    showToast('📋 Link kopiert!', 'success', 2500);
  });

  dialog.addEventListener('close', () => dialog.remove());
  document.body.appendChild(dialog);
  dialog.showModal();
}

