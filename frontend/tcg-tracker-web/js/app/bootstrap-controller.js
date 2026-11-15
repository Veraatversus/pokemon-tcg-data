export function createBootstrapController({
  state,
  dom,
  config,
  eventBus,
  eventQuickFiltersChanged,
  eventClearSearchHistory,
  loadDashboardPreferences,
  loadRecentSets,
  initSmartEngine,
  prefetchPriceStamp,
  initAutoHideTopbar,
  initGridZoom,
  initCustomSelects,
  initFilterButtons,
  spreadsheetDialogController,
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
  realtimeClientStorageKey,
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
  documentRef = document,
  windowRef = window,
  localStorageRef = localStorage,
} = {}) {
  async function bootstrapCore() {
    loadDashboardPreferences();
    state.recentSets = loadRecentSets();

    try {
      await initSmartEngine();
    } catch (error) {
      console.warn('Smart Engine init:', error);
    }

    // Preis-Stamp vorab laden (api/v3/prices/meta.json generatedAt, ?v= der
    // Preisdateien). Fire-and-forget, damit
    // der Bootstrap nicht blockiert, falls der Server nicht erreichbar
    // ist (z. B. beim Offline-Start).
    prefetchPriceStamp()?.catch?.((err) => {
      console.warn('Preis-Stamp (api/v3/prices) nicht ladbar:', err);
    });

    initAutoHideTopbar();
    initGridZoom();
    initCustomSelects();
    initFilterButtons();
    spreadsheetDialogController.initSpreadsheetDialog();
    initBatchImportDialog();
    initManageImportedSetsDialog();
    initBackupImportExport();
    initQueueBuilderDialog();

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
      state.realtimeClientId = localStorageRef.getItem(realtimeClientStorageKey) || `client_${Date.now()}`;
      localStorageRef.setItem(realtimeClientStorageKey, state.realtimeClientId);
      state.realtime = initRealtimeSync({
        clientId: state.realtimeClientId,
        onEvent: applyIncomingRealtimeUpdate,
      });
    } catch (error) {
      console.warn('⚠️ Realtime sync init failed:', error);
    }

    try {
      initQuickFiltersUI(state.quickFilters);
      eventBus.on(eventQuickFiltersChanged, (detail) => {
        state.quickFilters = {
          ...state.quickFilters,
          ...(detail || {}),
        };
        saveDashboardPreferences();
        renderDashboard();
      });
    } catch (error) {
      console.warn('⚠️ Quick Filters init failed:', error);
    }

    windowRef.SEARCH_HISTORY = loadSearchHistory();

    windowRef.addEventListener(eventClearSearchHistory, () => {
      clearSearchHistory();
      windowRef.SEARCH_HISTORY = [];
      showToast('Suchverlauf gelöscht', 'success', 2000);
    });
  }

  async function bootstrapPostCore() {

    const commandHandlers = {
      sync: async () => {
        showToast('Sync-Funktion noch nicht implementiert', 'info');
      },
      'import-batch': () => openBatchImportDialog(),
      'health-check': () => runDataHealthCheck({ autoFix: false }),
      'backup-download': async () => {
        const sets = state.sets.slice(0, 3);
        if (!sets.length) {
          showToast('Keine Sets zum Exportieren.', 'info');
          return;
        }
        const backupSets = sets.map((set) => ({
          setId: set.setId,
          setName: set.setName,
          imported: Boolean(set.imported),
        }));
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
        const payload = {
          app: 'poke-tcg-try4',
          version: 1,
          createdAt: stamp,
          spreadsheetId: config.SPREADSHEET_ID,
          sets: backupSets,
        };
        downloadJson(`poke_backup_${stamp}.json`, payload);
        showToast(`Backup exportiert (${sets.length} Sets).`, 'success', 4000);
      },
      search: () => {
        dom.search?.focus();
        showToast('Suchfeld aktiviert', 'info', 2000);
      },
      snapshots: () => {
        showToast(`Snapshots: ${(loadSnapshots() || []).length} verfügbar`, 'info', 3000);
      },
      settings: () => openSettingsDialog(),
      'export-collection': async () => {
        if (!state.collection || !state.sets.length) {
          showToast('Keine Sammlung zum Exportieren', 'error', 3000);
          return;
        }
        const report = generateCollectionReport(state.collection, state.sets);
        const dialog = createExportDialog(report);
        documentRef.body.appendChild(dialog);
        dialog.showModal();
        dialog.addEventListener('close', () => dialog.remove());
      },
      help: () => {
        showToast('Verfügbare Befehle: import, health-check, backup, search, snapshots, settings, export', 'info', 5000);
      },
      'local-backup': () => {
        try {
          const backupData = {
            sets: state.allSets,
            imported: state.sets,
            timestamp: new Date().toISOString(),
          };
          const backupKey = createLocalBackup(backupData, `Backup ${new Date().toLocaleDateString()}`);
          if (backupKey) {
            showToast('💾 Lokale Sicherung erstellt', 'success', 3000);
          } else {
            showToast('Sicherung fehlgeschlagen', 'error');
          }
        } catch (error) {
          showToast(`Sicherungsfehler: ${error.message}`, 'error');
        }
      },
      'show-backups': () => {
        const backups = getLocalBackups();
        if (backups.length === 0) {
          showToast('Keine lokalen Sicherungen gefunden', 'info');
          return;
        }

        const list = documentRef.createElement('div');
        list.style.cssText = 'max-height: 400px; overflow-y: auto;';

        backups.forEach((backup) => {
          const item = documentRef.createElement('div');
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

        const dialog = documentRef.createElement('dialog');
        dialog.className = 'ss-dialog';
        dialog.style.cssText = 'width: 90vw; max-width: 500px;';
        dialog.innerHTML = '<h3>💾 Lokale Sicherungen</h3>';
        dialog.appendChild(list);
        documentRef.body.appendChild(dialog);
        dialog.showModal();
        dialog.addEventListener('close', () => dialog.remove());
      },
      'live-dashboard': () => {
        const dialog = documentRef.createElement('dialog');
        dialog.className = 'ss-dialog';
        dialog.style.cssText = 'width: 90vw; max-width: 900px; max-height: 80vh; overflow-y: auto;';

        const body = documentRef.createElement('div');
        body.style.cssText = 'padding: 20px; display: grid; gap: 12px;';

        const headline = documentRef.createElement('div');
        headline.style.cssText = 'padding: 12px; border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-bg-secondary);';
        body.appendChild(headline);

        const metricsGrid = documentRef.createElement('div');
        metricsGrid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px;';
        body.appendChild(metricsGrid);

        const refreshUI = () => {
          const metrics = getEngineMetrics();
          const summaryRows = state.summaryData || [];
          const totals = summaryRows.reduce((accumulator, row) => {
            accumulator.total += Number(row.total || 0);
            accumulator.collected += Number(row.collected || 0);
            accumulator.rh += Number(row.rh || 0);
            return accumulator;
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
            ['Queue', `${(metrics.syncQueue || []).length}`],
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
        documentRef.body.appendChild(dialog);
        dialog.showModal();
        dialog.addEventListener('close', () => {
          clearInterval(timer);
          dialog.remove();
        });
      },
    };

    try {
      initCommandPalette(commandHandlers);
    } catch (error) {
      console.warn('⚠️ Command Palette init failed:', error);
    }

    setInterval(() => {
      try {
        const metrics = getEngineMetrics();
        const metricsEl = documentRef.getElementById('engine-metrics');
        if (metricsEl) {
          metricsEl.classList.remove('hidden');
          const rateEl = documentRef.getElementById('metric-cache-rate');
          const statusEl = documentRef.getElementById('metric-api-status');
          if (rateEl) rateEl.textContent = metrics.cacheHitRate;
          if (statusEl) statusEl.textContent = metrics.status === 'online' ? '🟢 online' : '🔴 offline';
        }
      } catch (error) {
        console.warn('[metrics update]', error);
      }
    }, 5000);

    documentRef.querySelectorAll('.nav-link').forEach((link) => {
      if (link.dataset.navToggle) return;
      link.addEventListener('click', (event) => {
        event.preventDefault();
        navigate(link.dataset.view);
      });
    });
    dom.btnNavSetToggle?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (dom.btnNavSetToggle.disabled) return;
      setRecentSetsDropdownOpen(!dom.navSetSplit?.classList.contains('open'));
    });
    documentRef.addEventListener('click', (event) => {
      if (!(event.target instanceof Node)) return;
      if (!dom.navSetSplit?.contains(event.target)) {
        setRecentSetsDropdownOpen(false);
      }
      if (!dom.refreshSplit?.contains(event.target)) {
        setRefreshMenuOpen(false);
      }
    });
    documentRef.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        setRecentSetsDropdownOpen(false);
        setRefreshMenuOpen(false);
      }
    });
    windowRef.addEventListener('resize', positionRecentSetsDropdown, { passive: true });
    windowRef.addEventListener('scroll', positionRecentSetsDropdown, { passive: true });
    windowRef.addEventListener('hashchange', handleRouteChange);

    setLoading(true, 'Initialisiere…');
    setGlobalStatus('Initialisiere Google API…');

    try {
      const autoLoggedIn = await initAuth();

      syncAuthButtonLabel();
      windowRef.addEventListener('resize', syncAuthButtonLabel, { passive: true });

      dom.auth.addEventListener('click', async () => {
        if (dom.auth.dataset.state === 'out') {
          signOut();
          resetToLoggedOut();
          return;
        }
        dom.auth.disabled = true;
        setGlobalStatus('Bitte Google-Login im Popup abschließen…');
        showToast('Google-Login im Popup geöffnet.', 'info', 2600);
        const ok = await signIn();
        if (!ok) {
          dom.auth.disabled = false;
          showToast('Login fehlgeschlagen oder abgebrochen.', 'error');
          setGlobalStatus('Login fehlgeschlagen oder abgebrochen.');
          return;
        }
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
        state.currentSet = null;
        state.cards = [];
        state.dbMap = new Map();
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

      if (autoLoggedIn) {
        onLoginSuccess();
      } else {
        setLoading(false);
        setGlobalStatus('Bereit. Bitte anmelden.');
        showView('dashboard');
      }
    } catch (error) {
      setLoading(false);
      showToast(`Init-Fehler: ${error.message}`, 'error');
      setGlobalStatus(`Fehler: ${error.message}`);
    }
  }

  async function bootstrap() {
    await bootstrapCore();
    await bootstrapPostCore();
  }

  return {
    bootstrapCore,
    bootstrapPostCore,
    bootstrap,
  };
}
