export function createImportOrchestrator({
  state,
  dom,
  cache,
  autoImportQueueLimit,
  setLoading,
  showToast,
  setGlobalStatus,
  listImportedSets,
  listSetsOverviewData,
  fetchAllAvailableSets,
  syncOverviewWithApiSets,
  recoverImportedIdsFromOverview,
  toBoolean,
  resetDashboardVirtualization,
  renderRecentSets,
  renderSetSelectorOptions,
  syncRefreshControls,
  buildSeriesMap,
  renderSearchSetFilterOptions,
  readSettings,
  navigate,
  handleRouteChange,
  mergeImportedSetIntoLocalState,
  updateAutoImportQueueUi,
  importSetIntoCollection,
  scheduleAutoImportUiRefresh,
  loadSnapshots,
  createAutoSnapshot,
  startJob,
  assertJobNotCancelled,
  updateJob,
  finishJob,
  fetchMergedCardsWithSetMeta,
  getErrorMessage,
} = {}) {
  async function loadSets() {
    setLoading(true, 'Lade Sets…');
    try {
      let [importedSets, initialOverviewSets] = await Promise.all([
        listImportedSets(),
        listSetsOverviewData().catch(() => []),
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

      if (importedSets.length === 0 && overviewSets.length > 0) {
        try {
          const legacyIds = await recoverImportedIdsFromOverview();
          if (legacyIds.size > 0) {
            const apiSets = await fetchAllAvailableSets();
            await syncOverviewWithApiSets(apiSets, legacyIds);
            overviewSets = await listSetsOverviewData().catch(() => []);
            importedSets = overviewSets.filter((set) => toBoolean(set.imported));
            state.sets = importedSets;
          }
        } catch (error) {
          console.warn('[loadSets] Migration fehlgeschlagen:', error);
        }
      }

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
          ptcgoCode: set.ptcgoCode || current.ptcgoCode || '',
          imported: true,
        });
      });

      state.allSets = Array.from(mergedMap.values());
      resetDashboardVirtualization();
      renderRecentSets();
      renderSetSelectorOptions();

      dom.selector.disabled = false;
      dom.load.disabled = false;
      syncRefreshControls();

      dom.dashSeriesFilter.innerHTML = '<option value="">Alle Serien</option>';
      buildSeriesMap(state.allSets).forEach((groupInfo) => {
        const option = document.createElement('option');
        option.value = groupInfo.key;
        option.textContent = groupInfo.label;
        dom.dashSeriesFilter.appendChild(option);
      });

      renderSearchSetFilterOptions();

      const settings = await readSettings();
      if (settings.lastSetId) dom.selector.value = settings.lastSetId;

      setGlobalStatus(`${state.sets.length} von ${state.allSets.length} Sets geladen.`);
      dom.mainNav.classList.remove('hidden');

      if (!window.location.hash || window.location.hash === '#') {
        navigate('dashboard');
      } else {
        handleRouteChange();
      }
    } catch (error) {
      console.error('[loadSets]', error);
      showToast(`Fehler beim Laden der Sets: ${error.message}`, 'error');
      setGlobalStatus('Sets konnten nicht geladen werden.');
      state.sets = [];
      state.allSets = [];
      renderRecentSets();
    } finally {
      setLoading(false);
    }
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
    const alreadyImported = toBoolean(setMeta?.imported) || toBoolean(existingSetState?.imported);

    if (alreadyImported) {
      return mergeImportedSetIntoLocalState(mergedSet) || mergedSet;
    }

    if (state.autoImportJobs.has(setId)) {
      return state.autoImportJobs.get(setId);
    }

    const pendingCount = (state.autoImportActiveSetId ? 1 : 0) + state.autoImportQueuedSetIds.length;
    if (pendingCount >= autoImportQueueLimit) {
      const now = Date.now();
      if (now - Number(state.autoImportLastLimitToastAt || 0) > 2500) {
        state.autoImportLastLimitToastAt = now;
        showToast(`Auto-Import-Warteschlange voll (${autoImportQueueLimit}). ${mergedSet.setName || setId} wird vorerst nicht automatisch importiert.`, 'info', 4500);
      }
      setGlobalStatus(`Auto-Import pausiert: Warteschlange voll (${autoImportQueueLimit}).`);
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

    const job = queuedJob.catch((error) => {
      console.warn(`[ensureSetImportedFromApi:${source}]`, error);
      throw error;
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

  async function importSetsSequential(sets, options = {}) {
    const { successMessage = 'Import abgeschlossen.' } = options;
    const validSets = (sets || []).filter((set) => set?.setId && set?.setName);
    if (!validSets.length) {
      showToast('Keine passenden Sets gefunden.', 'info');
      return;
    }

    try {
      const currentCollection = state.collection || {};
      const snapshotCount = (loadSnapshots() || []).length;
      const action = `Import: ${validSets.map((set) => set.setName).join(', ')}${snapshotCount > 15 ? ' (oldest will be removed)' : ''}`;
      await createAutoSnapshot(action, currentCollection);
    } catch (error) {
      console.warn('⚠️ Auto-snapshot vor Import fehlgeschlagen:', error);
    }

    let done = 0;
    let failed = 0;
    const job = startJob('Import', validSets.length);
    setLoading(true, 'Import läuft…');
    try {
      for (let index = 0; index < validSets.length; index += 1) {
        assertJobNotCancelled(job);
        const set = validSets[index];
        setGlobalStatus(`Importiere ${index + 1}/${validSets.length}: ${set.setName}`);
        updateJob(job, index, `Importiere ${index + 1}/${validSets.length}: ${set.setName}`);
        try {
          const { cards, setMetaPatch } = await fetchMergedCardsWithSetMeta(set.setId);
          await importSetIntoCollection({ ...set, ...(setMetaPatch || {}) }, cards);
          cache.del(`cards_${set.setId}`);
          cache.del(`db_${set.setId}`);
          done += 1;
        } catch (error) {
          console.warn('[importSetsSequential] import failed for', set.setId, error);
          failed += 1;
        }
      }
      updateJob(job, validSets.length, `Import abgeschlossen: ${done} erfolgreich, ${failed} Fehler`);
      finishJob(job, `Import abgeschlossen (${done}/${validSets.length})`, failed > 0);
    } catch (error) {
      finishJob(job, getErrorMessage(error, 'Import abgebrochen'), true);
      throw error;
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

  return {
    loadSets,
    ensureSetImportedFromApi,
    importSetsSequential,
  };
}
