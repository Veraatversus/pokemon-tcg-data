// Import-Jobs: Job-Anzeige, Aktions-Warteschlange, Import-Backoff und -Preflight, Auto-Import-Warteschlange,
// Import ueber die Uebersicht, Sequenz-Import und Overview-Abgleich mit der API.
import { isSignedIn } from '../../core/auth.js';
import { writeSetting, importSetIntoCollection, listSetsOverviewData, syncOverviewWithApiSets } from '../../data/sheets-db.js?v=20261115-clean-3';
import { fetchMergedCardsWithSetMeta, fetchAllAvailableSets } from '../../data/pokemon-api.js?v=20261115-clean-3';
import { toBoolean } from '../../core/utils.js';
import * as cache from '../../core/cache.js';
import { runWithRetry, isRetryableError } from '../../core/retry.js';
import { createAutoSnapshot, loadSnapshots } from './index.js';
import { isSheetsQuotaError, getImportCooldownMs } from './import-rate-limit.js';
import { isAuthReloginRequiredError, getAuthReloginImportMessage } from './import-auth-guard.js';
import { dom } from '../../app/dom.js';
import { state } from '../../app/state.js';
import { navigate } from '../../app/router.js';
import { markSetAsRecent } from '../../app/recent-sets.js';
import { setGlobalStatus, setLoading, showToast, normalizeUiText, getErrorMessage } from '../../ui/helpers.js';
import {
  allImportedSets, loadSets, renderDashboard, syncDashboardCardForSet, getSetById, ensureSetSelectorOption,
  renderSetSelectorOptions
} from '../../views/dashboard.js';
import { renderSearchSetFilterOptions, runSearch } from '../../views/search.js';
import { renderStats } from '../../views/stats.js';

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

export function startJob(title, totalSteps = 0) {
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

export function updateJob(job, current, text) {
  if (!job || state.activeJob?.id !== job.id) return;
  job.current = Math.max(0, Number(current) || 0);
  const pct = job.totalSteps > 0 ? Math.min(100, Math.round((job.current / job.totalSteps) * 100)) : 0;
  if (dom.jobProgressFill) dom.jobProgressFill.style.width = `${pct}%`;
  if (dom.jobStatusText) dom.jobStatusText.textContent = normalizeUiText(text || `${job.current}/${job.totalSteps}`);
}

export function finishJob(job, summary, isError = false) {
  if (!job || state.activeJob?.id !== job.id) return;
  if (dom.jobStatusText) dom.jobStatusText.textContent = normalizeUiText(summary);
  if (dom.btnJobCancel) dom.btnJobCancel.disabled = true;
  if (dom.jobProgressFill && job.totalSteps > 0) {
    dom.jobProgressFill.style.width = isError ? dom.jobProgressFill.style.width : '100%';
  }
  pushJobHistory(`${new Date().toLocaleTimeString('de-DE')} - ${job.title}: ${summary}`);
  state.activeJob = null;
}

export function assertJobNotCancelled(job) {
  if (job?.cancelled) {
    throw new Error('Vorgang abgebrochen.');
  }
}

export function updateQueueUiState() {
  const queued = state.queuedActions.length;
  if (dom.btnQueueRun) dom.btnQueueRun.disabled = state.queueRunning || queued === 0;
  if (dom.btnQueueClear) dom.btnQueueClear.disabled = state.queueRunning || queued === 0;
}

export function enqueueAction(label, action) {
  state.queuedActions.push({ id: Date.now() + Math.random(), label, action });
  pushJobHistory(`${new Date().toLocaleTimeString('de-DE')} - Queue hinzugefuegt: ${label}`);
  updateQueueUiState();
}

export function clearQueuedActions() {
  const count = state.queuedActions.length;
  state.queuedActions = [];
  updateQueueUiState();
  if (count > 0) showToast(`Queue geleert (${count} entfernt).`, 'info');
}

export async function runQueuedActions() {
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

export async function ensureSetImportedFromApi(setMeta, cards, options = {}) {
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

export async function importSetFromOverview(set) {
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

export async function importSetsSequential(sets, options = {}) {
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

export async function syncOverviewFromApi() {
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

export async function powerRefreshOverviewFromApi() {
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

export async function importAllMissingSets() {
  const missing = state.allSets.filter((set) => !set.imported);
  if (!missing.length) {
    showToast('Alle Sets sind bereits importiert.', 'info');
    return;
  }
  const ok = window.confirm(`${missing.length} Sets importieren? Dieser Vorgang kann einige Minuten dauern.`);
  if (!ok) return;
  await importSetsSequential(missing, { successMessage: '{count} Sets importiert.' });
}
