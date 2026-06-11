import test from 'node:test';
import assert from 'node:assert/strict';

import { createBootstrapController } from '../js/app/bootstrap-controller.js';

test('bootstrapCore initializes early runtime wiring and quick-filter handlers', async () => {
  const callLog = [];
  const eventHandlers = new Map();

  const state = {
    quickFilters: { completed: false, inProgress: false },
    sets: [],
  };

  const windowRef = {
    SEARCH_HISTORY: null,
    addEventListener: (name, handler) => {
      eventHandlers.set(`window:${name}`, handler);
    },
    setInterval: () => 1,
  };

  const localStorageRef = {
    getItem: () => null,
    setItem: () => {},
  };

  const controller = createBootstrapController({
    state,
    dom: {},
    config: { SPREADSHEET_ID: 'test-sheet' },
    eventBus: {
      on: (name, handler) => eventHandlers.set(`bus:${name}`, handler),
    },
    eventQuickFiltersChanged: 'quick-filters-changed',
    eventClearSearchHistory: 'clear-search-history',
    loadDashboardPreferences: () => callLog.push('loadDashboardPreferences'),
    loadRecentSets: () => {
      callLog.push('loadRecentSets');
      return [{ setId: 'sv1' }];
    },
    initSmartEngine: async () => callLog.push('initSmartEngine'),
    runCardmarketVersioningCheck: async () => {
      callLog.push('runCardmarketVersioningCheck');
      return { changed: false, reason: 'first-sync', previousStamp: '', currentStamp: '', reset: [] };
    },
    initAutoHideTopbar: () => callLog.push('initAutoHideTopbar'),
    initGridZoom: () => callLog.push('initGridZoom'),
    initCustomSelects: () => callLog.push('initCustomSelects'),
    initFilterButtons: () => callLog.push('initFilterButtons'),
    spreadsheetDialogController: { initSpreadsheetDialog: () => callLog.push('initSpreadsheetDialog') },
    initBatchImportDialog: () => callLog.push('initBatchImportDialog'),
    initManageImportedSetsDialog: () => callLog.push('initManageImportedSetsDialog'),
    initBackupImportExport: () => callLog.push('initBackupImportExport'),
    initQueueBuilderDialog: () => callLog.push('initQueueBuilderDialog'),
    initSetViewController: () => callLog.push('initSetViewController'),
    createSetViewInjections: () => ({}),
    createDashboardRenderer: () => ({ render: () => {} }),
    createStatsRenderer: () => ({ render: () => {} }),
    createSettingsController: () => ({ open: () => {} }),
    createStatsPriceViewController: () => ({}),
    dashboardRendererDeps: {},
    statsRendererDeps: {},
    settingsControllerDeps: {},
    assignDashboardRenderer: () => callLog.push('assignDashboardRenderer'),
    assignStatsRenderer: () => callLog.push('assignStatsRenderer'),
    assignSettingsController: () => callLog.push('assignSettingsController'),
    initDashboardControls: () => callLog.push('initDashboardControls'),
    initSheetsWriteFeedback: () => callLog.push('initSheetsWriteFeedback'),
    initAuditAndSaveUi: () => callLog.push('initAuditAndSaveUi'),
    initDevCompletionMode: () => callLog.push('initDevCompletionMode'),
    initSortControl: () => callLog.push('initSortControl'),
    initSearch: () => callLog.push('initSearch'),
    initOfflineIndicator: () => callLog.push('initOfflineIndicator'),
    initDashboardHoverPreview: () => callLog.push('initDashboardHoverPreview'),
    initSearchAutocomplete: () => callLog.push('initSearchAutocomplete'),
    initShareButton: () => callLog.push('initShareButton'),
    initRealtimeSync: () => {
      callLog.push('initRealtimeSync');
      return { connected: true };
    },
    realtimeClientStorageKey: 'realtime-client-id',
    applyIncomingRealtimeUpdate: () => {},
    initQuickFiltersUI: () => callLog.push('initQuickFiltersUI'),
    resetDashboardVirtualization: () => callLog.push('resetDashboardVirtualization'),
    saveDashboardPreferences: () => callLog.push('saveDashboardPreferences'),
    renderDashboard: () => callLog.push('renderDashboard'),
    loadSearchHistory: () => {
      callLog.push('loadSearchHistory');
      return ['pikachu'];
    },
    clearSearchHistory: () => callLog.push('clearSearchHistory'),
    showToast: (...args) => callLog.push(`showToast:${args[0]}`),
    openBatchImportDialog: () => {},
    runDataHealthCheck: () => {},
    downloadJson: () => {},
    runPokecodeParityTest: async () => {},
    loadSnapshots: () => [],
    openSettingsDialog: () => {},
    generateCollectionReport: () => ({}),
    createExportDialog: () => ({}),
    createWishlistPanel: () => ({}),
    createSharingDialog: () => ({}),
    createTradingLogPanel: () => ({}),
    calculateCollectionStats: () => ({}),
    createAchievementsPanel: () => ({}),
    createCSVExportPanel: () => ({}),
    createLocalBackup: () => null,
    getLocalBackups: () => [],
    createCommunityStatsBanner: () => ({}),
    createCommunityTrendingPanel: () => ({}),
    createCommunitySearchPanel: () => ({}),
    createPublicShare: () => ({}),
    getTrendingCollections: () => [],
    createSharedCollectionCard: () => ({}),
    createTradeStatsCard: () => ({}),
    createTradeMarketplacePanel: () => ({}),
    createTradeSuggestionsPanel: () => ({}),
    createWantedCardsPanel: () => ({}),
    getAvailableRarities: () => [],
    getCollectionValueStats: () => ({}),
    getTradePlaceSummary: () => ({}),
    userIdStorageKey: 'user-id',
    getUserProfile: () => null,
    createUserProfile: () => ({ userId: 'u1' }),
    createUserProfileCard: () => ({}),
    initCommandPalette: () => {},
    getEngineMetrics: () => ({ cacheHitRate: 0, status: 'offline' }),
    navigate: () => {},
    setRecentSetsDropdownOpen: () => {},
    setRefreshMenuOpen: () => {},
    positionRecentSetsDropdown: () => {},
    handleRouteChange: () => {},
    setLoading: () => {},
    setGlobalStatus: () => {},
    initAuth: async () => false,
    syncAuthButtonLabel: () => {},
    signIn: async () => false,
    signOut: () => {},
    resetToLoggedOut: () => {},
    isSignedIn: () => false,
    loadCurrentSet: async () => {},
    reimportCurrentSetFromApi: async () => {},
    exportMissingCards: () => {},
    onLoginSuccess: () => {},
    showView: () => {},
    syncRefreshControls: () => {},
    syncSetNavLink: () => {},
    setEmptyState: () => {},
    documentRef: {
      body: { appendChild: () => {} },
      createElement: () => ({
        className: '',
        style: { cssText: '' },
        appendChild: () => {},
        addEventListener: () => {},
        showModal: () => {},
        remove: () => {},
      }),
      getElementById: () => null,
      querySelectorAll: () => [],
      addEventListener: (name, handler) => eventHandlers.set(`document:${name}`, handler),
    },
    windowRef,
    localStorageRef,
  });

  assert.equal(typeof controller.bootstrapCore, 'function');

  await controller.bootstrapCore();

  assert.equal(state.recentSets.length, 1);
  assert.equal(windowRef.SEARCH_HISTORY.length, 1);
  assert.ok(callLog.includes('initSmartEngine'));
  assert.ok(callLog.includes('runCardmarketVersioningCheck'));
  assert.ok(callLog.includes('initRealtimeSync'));
  assert.ok(callLog.includes('initQuickFiltersUI'));

  const quickFiltersHandler = eventHandlers.get('bus:quick-filters-changed');
  assert.equal(typeof quickFiltersHandler, 'function');

  quickFiltersHandler({ completed: true });
  assert.equal(state.quickFilters.completed, true);
  assert.ok(callLog.includes('renderDashboard'));

  const clearHistoryHandler = eventHandlers.get('window:clear-search-history');
  assert.equal(typeof clearHistoryHandler, 'function');

  clearHistoryHandler();
  assert.equal(windowRef.SEARCH_HISTORY.length, 0);
  assert.ok(callLog.some((entry) => entry.startsWith('showToast:Suchverlauf gelöscht')));
});
