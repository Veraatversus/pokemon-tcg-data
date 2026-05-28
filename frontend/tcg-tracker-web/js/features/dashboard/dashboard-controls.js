export function initDashboardControlsFeature({
  dom,
  state,
  resetDashboardVirtualization,
  renderDashboard,
  saveDashboardPreferences,
  openSettingsDialog,
  openSupportHubDialog,
  openSupportChannel,
  syncOverviewFromApi,
  powerRefreshOverviewFromApi,
  openBatchImportDialog,
  importAllMissingSets,
  reimportCurrentSetFromApi,
  reimportAllImportedSets,
  exportCollectionSummaryCsv,
  runDataHealthCheck,
  runPokecodeParityTest,
  enqueueAction,
  runQueuedActions,
  clearQueuedActions,
  updateQueueUiState,
  showToast,
} = {}) {
  let debounce;

  dom.dashFilter?.addEventListener('input', () => {
    resetDashboardVirtualization();
    clearTimeout(debounce);
    debounce = setTimeout(renderDashboard, 200);
  });

  dom.dashSeriesFilter?.addEventListener('change', () => {
    resetDashboardVirtualization();
    renderDashboard();
  });

  dom.dashSort?.addEventListener('change', () => {
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

  dom.btnParityCheck?.addEventListener('click', () => runPokecodeParityTest().catch((err) => {
    console.error('[runPokecodeParityTest]', err);
    showToast(`Parity-Test fehlgeschlagen: ${err.message}`, 'error', 6000);
  }));

  dom.btnQueueAutofixRefresh?.addEventListener('click', () => {
    enqueueAction('Datencheck + Auto-Fix', () => runDataHealthCheck({ autoFix: true }));
    enqueueAction('Power-Refresh Overview', () => powerRefreshOverviewFromApi());
    showToast('Queue-Preset hinzugefugt (Auto-Fix -> Refresh).', 'info', 3000);
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
