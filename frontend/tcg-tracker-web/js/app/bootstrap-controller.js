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
  runCardmarketVersioningCheck,
  initAutoHideTopbar,
  initGridZoom,
  initCustomSelects,
  initFilterButtons,
  spreadsheetDialogController,
  initBatchImportDialog,
  initManageImportedSetsDialog,
  initBackupImportExport,
  initQueueBuilderDialog,
  initSetViewController,
  createSetViewInjections,
  createDashboardRenderer,
  createStatsRenderer,
  createSettingsController,
  createStatsPriceViewController,
  dashboardRendererDeps,
  statsRendererDeps,
  settingsControllerDeps,
  assignDashboardRenderer,
  assignStatsRenderer,
  assignSettingsController,
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
  resetDashboardVirtualization,
  saveDashboardPreferences,
  renderDashboard,
  loadSearchHistory,
  clearSearchHistory,
  showToast,
  openBatchImportDialog,
  runDataHealthCheck,
  downloadJson,
  runPokecodeParityTest,
  loadSnapshots,
  openSettingsDialog,
  generateCollectionReport,
  createExportDialog,
  createWishlistPanel,
  createSharingDialog,
  createTradingLogPanel,
  calculateCollectionStats,
  createAchievementsPanel,
  createCSVExportPanel,
  createLocalBackup,
  getLocalBackups,
  createCommunityStatsBanner,
  createCommunityTrendingPanel,
  createCommunitySearchPanel,
  createPublicShare,
  getTrendingCollections,
  createSharedCollectionCard,
  createTradeStatsCard,
  createTradeMarketplacePanel,
  createTradeSuggestionsPanel,
  createWantedCardsPanel,
  getAvailableRarities,
  getCollectionValueStats,
  getTradePlaceSummary,
  userIdStorageKey,
  getUserProfile,
  createUserProfile,
  createUserProfileCard,
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

    // Cardmarket-Build-Stamp-Check: lädt meta.json, vergleicht mit
    // dem letzten bekannten generatedAt und invalidiert bei einem
    // Versionswechsel die In-Memory-Preiscaches. Fire-and-forget, damit
    // der Bootstrap nicht blockiert, falls der Server nicht erreichbar
    // ist (z. B. beim Offline-Start).
    runCardmarketVersioningCheck()?.catch?.((err) => {
      console.warn('Cardmarket versioning check failed:', err);
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

    try {
      initSetViewController(createSetViewInjections());
    } catch (error) {
      console.warn('Set-View-Controller init failed:', error);
    }

    try {
      assignDashboardRenderer(createDashboardRenderer({
        ...dashboardRendererDeps,
      }));
    } catch (error) {
      console.warn('Dashboard-Renderer init failed:', error);
    }

    try {
      assignStatsRenderer(createStatsRenderer({
        ...statsRendererDeps,
        createStatsPriceViewController,
      }));
    } catch (error) {
      console.warn('Stats-Renderer init failed:', error);
    }

    try {
      assignSettingsController(createSettingsController(settingsControllerDeps));
    } catch (error) {
      console.warn('Settings-Controller init failed:', error);
    }

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
        resetDashboardVirtualization();
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
      'parity-test': async () => {
        showToast('Parity-Test wird ausgeführt...', 'info');
        try {
          await runPokecodeParityTest({ skipPrompt: true, maxSets: 10 });
          showToast('Parity-Test abgeschlossen.', 'success', 4000);
        } catch (error) {
          showToast(`Parity-Test fehlgeschlagen: ${error.message}`, 'error', 5000);
        }
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
        showToast('Verfügbare Befehle: import, health-check, backup, parity, search, snapshots, settings, export', 'info', 5000);
      },
      wishlists: () => {
        const panel = createWishlistPanel();
        const dialog = documentRef.createElement('dialog');
        dialog.className = 'ss-dialog';
        dialog.style.cssText = 'width: 90vw; max-width: 600px;';
        dialog.appendChild(panel);
        documentRef.body.appendChild(dialog);
        dialog.showModal();
        dialog.addEventListener('close', () => dialog.remove());
      },
      'share-collection': () => {
        if (!state.allSets || state.allSets.length === 0) {
          showToast('Keine Collection zum Teilen', 'error');
          return;
        }
        const collectionData = {};
        const panel = createSharingDialog(collectionData, state.allSets);
        const dialog = documentRef.createElement('dialog');
        dialog.className = 'ss-dialog';
        dialog.style.cssText = 'width: 90vw; max-width: 600px;';
        dialog.appendChild(panel);
        documentRef.body.appendChild(dialog);
        dialog.showModal();
        dialog.addEventListener('close', () => dialog.remove());
      },
      'trading-log': () => {
        const panel = createTradingLogPanel();
        const dialog = documentRef.createElement('dialog');
        dialog.className = 'ss-dialog';
        dialog.style.cssText = 'width: 90vw; max-width: 700px;';
        dialog.appendChild(panel);
        documentRef.body.appendChild(dialog);
        dialog.showModal();
        dialog.addEventListener('close', () => dialog.remove());
      },
      achievements: async () => {
        const stats = calculateCollectionStats(state.summaryData || []);
        const panel = createAchievementsPanel(stats);
        const dialog = documentRef.createElement('dialog');
        dialog.className = 'ss-dialog';
        dialog.style.cssText = 'width: 90vw; max-width: 600px;';
        dialog.appendChild(panel);
        documentRef.body.appendChild(dialog);
        dialog.showModal();
        dialog.addEventListener('close', () => dialog.remove());
      },
      'csv-export': () => {
        if (!state.allSets || state.allSets.length === 0) {
          showToast('Keine Sets zum Exportieren', 'error');
          return;
        }
        const collectionData = {};
        const panel = createCSVExportPanel(collectionData, state.allSets);
        const dialog = documentRef.createElement('dialog');
        dialog.className = 'ss-dialog';
        dialog.style.cssText = 'width: 90vw; max-width: 600px;';
        dialog.appendChild(panel);
        documentRef.body.appendChild(dialog);
        dialog.showModal();
        dialog.addEventListener('close', () => dialog.remove());
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
      community: () => {
        const container = documentRef.createElement('div');
        container.style.cssText = 'max-height: 80vh; overflow-y: auto; padding: 20px;';

        const banner = createCommunityStatsBanner();
        const trending = createCommunityTrendingPanel();
        const search = createCommunitySearchPanel();

        container.appendChild(banner);
        container.appendChild(trending);
        container.appendChild(search);

        const dialog = documentRef.createElement('dialog');
        dialog.className = 'ss-dialog';
        dialog.style.cssText = 'width: 90vw; max-width: 900px;';
        dialog.appendChild(container);
        documentRef.body.appendChild(dialog);
        dialog.showModal();
        dialog.addEventListener('close', () => dialog.remove());
      },
      profile: () => {
        const userId = localStorageRef.getItem(userIdStorageKey) || `user_${Date.now()}`;
        localStorageRef.setItem(userIdStorageKey, userId);

        let profile = getUserProfile(userId);
        if (!profile) {
          profile = createUserProfile('collector', 'Pokémon Sammler', 'Meine Pokémon TCG Collection');
          localStorageRef.setItem(userIdStorageKey, profile.userId);
        }

        const card = createUserProfileCard(profile.userId, profile.userId);

        const dialog = documentRef.createElement('dialog');
        dialog.className = 'ss-dialog';
        dialog.style.cssText = 'width: 90vw; max-width: 500px;';
        dialog.appendChild(card);
        documentRef.body.appendChild(dialog);
        dialog.showModal();
        dialog.addEventListener('close', () => dialog.remove());
      },
      'publish-collection': () => {
        if (!state.allSets || state.allSets.length === 0) {
          showToast('Keine Sets zum Veröffentlichen', 'error');
          return;
        }
        const userId = localStorageRef.getItem(userIdStorageKey) || `user_${Date.now()}`;
        const collectionData = {};

        const form = documentRef.createElement('div');
        form.style.cssText = 'padding: 20px;';

        const titleEl = documentRef.createElement('input');
        titleEl.type = 'text';
        titleEl.placeholder = 'Collection-Titel';
        titleEl.value = 'Meine Pokémon Collection';
        titleEl.style.cssText = 'width: 100%; padding: 10px; border: 1px solid var(--color-border); border-radius: 6px; margin-bottom: 12px;';

        const descEl = documentRef.createElement('textarea');
        descEl.placeholder = 'Beschreibung...';
        descEl.style.cssText = 'width: 100%; padding: 10px; border: 1px solid var(--color-border); border-radius: 6px; margin-bottom: 12px; min-height: 100px;';

        const publishBtn = documentRef.createElement('button');
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

        let dialog;
        publishBtn.addEventListener('click', () => {
          const share = createPublicShare(userId, collectionData, state.allSets, titleEl.value, descEl.value);
          if (share) {
            showToast('✅ Collection veröffentlicht!', 'success', 3000);
            publishBtn.textContent = '✅ Veröffentlicht!';
            setTimeout(() => dialog?.close(), 1500);
          } else {
            showToast('Fehler beim Veröffentlichen', 'error');
          }
        });

        form.appendChild(titleEl);
        form.appendChild(descEl);
        form.appendChild(publishBtn);

        dialog = documentRef.createElement('dialog');
        dialog.className = 'ss-dialog';
        dialog.style.cssText = 'width: 90vw; max-width: 500px;';
        dialog.innerHTML = '<h3>🌍 Collection veröffentlichen</h3>';
        dialog.appendChild(form);
        documentRef.body.appendChild(dialog);
        dialog.showModal();
        dialog.addEventListener('close', () => dialog.remove());
      },
      trending: () => {
        const trending = getTrendingCollections(20);

        const container = documentRef.createElement('div');
        container.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; padding: 20px;';

        if (trending.length === 0) {
          container.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--color-muted);">Noch keine Collections veröffentlicht</p>';
        } else {
          trending.forEach((share) => {
            const card = createSharedCollectionCard(share);
            container.appendChild(card);
          });
        }

        const dialog = documentRef.createElement('dialog');
        dialog.className = 'ss-dialog';
        dialog.style.cssText = 'width: 90vw; max-width: 1000px; max-height: 80vh; overflow-y: auto;';
        dialog.innerHTML = '<h3 style="padding: 20px; margin: 0; border-bottom: 1px solid var(--color-border);">🔥 Trending Collections</h3>';
        dialog.appendChild(container);
        documentRef.body.appendChild(dialog);
        dialog.showModal();
        dialog.addEventListener('close', () => dialog.remove());
      },
      marketplace: () => {
        const dialog = documentRef.createElement('dialog');
        dialog.className = 'ss-dialog';
        dialog.style.cssText = 'width: 90vw; max-width: 1200px; max-height: 80vh; overflow-y: auto;';

        const container = documentRef.createElement('div');
        container.style.cssText = 'padding: 20px;';

        const statsCard = createTradeStatsCard('current-user');
        const marketplace = createTradeMarketplacePanel();
        const suggestions = createTradeSuggestionsPanel('current-user', []);

        container.appendChild(statsCard);
        container.appendChild(marketplace);
        container.appendChild(suggestions);

        dialog.innerHTML = '<h3 style="padding: 20px 20px 0 20px; margin: 0; border-bottom: 1px solid var(--color-border);">💱 Trading Marketplace</h3>';
        dialog.appendChild(container);
        documentRef.body.appendChild(dialog);
        dialog.showModal();
        dialog.addEventListener('close', () => dialog.remove());
      },
      wanted: () => {
        const dialog = documentRef.createElement('dialog');
        dialog.className = 'ss-dialog';

        const container = documentRef.createElement('div');
        container.style.cssText = 'padding: 20px;';
        container.appendChild(createWantedCardsPanel());

        dialog.innerHTML = '<h3 style="padding: 20px 20px 0 20px; margin: 0; border-bottom: 1px solid var(--color-border);">🎯 Gesuchte Karten</h3>';
        dialog.appendChild(container);
        documentRef.body.appendChild(dialog);
        dialog.showModal();
        dialog.addEventListener('close', () => dialog.remove());
      },
      rarity: () => {
        const dialog = documentRef.createElement('dialog');
        dialog.className = 'ss-dialog';

        const availableRarities = getAvailableRarities();

        const container = documentRef.createElement('div');
        container.style.cssText = 'padding: 20px;';

        const header = documentRef.createElement('div');
        header.style.cssText = 'margin-bottom: 20px;';
        header.innerHTML = '<h4>Verfügbare Raritäten</h4>';
        container.appendChild(header);

        const grid = documentRef.createElement('div');
        grid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px;';

        availableRarities.forEach((rarity) => {
          const button = documentRef.createElement('button');
          button.className = 'btn-secondary';
          button.style.cssText = 'padding: 12px; cursor: pointer;';
          button.textContent = `${rarity.emoji} ${rarity.name}`;
          button.addEventListener('click', () => {
            showToast(`Raritätsfilter ausgewählt: ${rarity.name}`, 'info', 2000);
          });
          grid.appendChild(button);
        });

        container.appendChild(grid);

        dialog.innerHTML = '<h3 style="padding: 20px 20px 0 20px; margin: 0; border-bottom: 1px solid var(--color-border);">✨ Raritätsfilter</h3>';
        dialog.appendChild(container);
        documentRef.body.appendChild(dialog);
        dialog.showModal();
        dialog.addEventListener('close', () => dialog.remove());
      },
      'collection-value': () => {
        const dialog = documentRef.createElement('dialog');
        dialog.className = 'ss-dialog';

        const container = documentRef.createElement('div');
        container.style.cssText = 'padding: 20px;';

        const stats = getCollectionValueStats([]);

        const info = documentRef.createElement('div');
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
          const market = getTradePlaceSummary();
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
            ['Aktive Angebote', `${market.activeOffers || 0}`],
            ['Gesuchte Karten', `${market.totalWantedCards || 0}`],
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
