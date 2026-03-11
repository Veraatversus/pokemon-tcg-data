import { initAuth, signIn, signOut, isSignedIn } from './auth.js';
import {
  listImportedSets,
  listSetsOverviewData,
  readSetCollectionMap,
  updateCellBoolean,
  readSummarySheet,
  readSettings,
  writeSetting,
  importSetIntoCollection,
  syncOverviewWithApiSets,
} from './sheets-db.js';
import { fetchMergedCards, fetchAllAvailableSets } from './pokemon-api.js';
import { normalizeCardNumber } from './utils.js';
import * as cache from './cache.js';
import { CONFIG } from './config.js';

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
  dialogError:      document.getElementById('dialog-error'),
  btnDialogSave:    document.getElementById('btn-dialog-save'),
  btnDialogCancel:  document.getElementById('btn-dialog-cancel'),
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
  btnOverviewSync:  document.getElementById('btn-overview-sync'),
  btnOverviewPowerRefresh: document.getElementById('btn-overview-power-refresh'),
  btnImportBatch:   document.getElementById('btn-import-batch'),
  btnImportAll:     document.getElementById('btn-import-all-missing'),
  btnReimportCurrent: document.getElementById('btn-reimport-current'),
  btnReimportAllImported: document.getElementById('btn-reimport-all-imported'),
  btnExportSummaryCsv: document.getElementById('btn-export-summary-csv'),
  btnDataHealthCheck: document.getElementById('btn-data-health-check'),
  btnDataHealthAutofix: document.getElementById('btn-data-health-autofix'),
  btnQueueAutofixRefresh: document.getElementById('btn-queue-autofix-refresh'),
  btnQueueRun: document.getElementById('btn-queue-run'),
  btnQueueClear: document.getElementById('btn-queue-clear'),
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
  batchSelection: new Set(),
  activeJob: null,
  queuedActions: [],
  queueRunning: false,
  queueCancelRequested: false,
};

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

function setEmptyState(show) {
  dom.emptyState.classList.toggle('hidden', !show);
  dom.cards.classList.toggle('hidden', show);
}

// ══════════════════════════════════════════════════════════════════════════
// DARK MODE
// ══════════════════════════════════════════════════════════════════════════
function initDarkMode() {
  const saved = localStorage.getItem('poke_dark_mode');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (saved === 'true' || (saved === null && prefersDark)) {
    document.body.classList.add('dark');
    dom.darkModeToggle.textContent = '\u2600\uFE0F';
  }
  dom.darkModeToggle.addEventListener('click', () => {
    const isDark = document.body.classList.toggle('dark');
    localStorage.setItem('poke_dark_mode', isDark);
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
      if (params[0] && dom.selector.value !== params[0]) {
        dom.selector.value = params[0];
        loadCurrentSet(false);
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
  dom.btnDialogCancel.disabled = required;
  dom.btnDialogCancel.style.display = required ? 'none' : '';
  dom.dialog.showModal();
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
  dom.dialog?.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !dom.btnDialogCancel.hidden) dom.dialog.close(); });
  dom.btnDialogSave?.addEventListener('click', () => {
    const id = extractSpreadsheetId(dom.dialogInput?.value?.trim());
    if (!id) {
      if (dom.dialogError) { dom.dialogError.textContent = 'Ung\u00fcltige Spreadsheet-ID oder URL.'; dom.dialogError.classList.remove('hidden'); }
      return;
    }
    CONFIG.SPREADSHEET_ID = id;
    dom.dialog.close();
    updateSpreadsheetInfoBar();
    loadSets();
  });
  dom.btnDialogCancel?.addEventListener('click', () => dom.dialog?.close());
  dom.btnChangeSheet?.addEventListener('click', () => openSpreadsheetDialog(false));
}

// ══════════════════════════════════════════════════════════════════════════
// SETS LADEN
// ══════════════════════════════════════════════════════════════════════════
async function loadSets() {
  setLoading(true, 'Lade Sets\u2026');
  try {
    const [importedSets, overviewSets, apiSets] = await Promise.all([
      listImportedSets(),
      listSetsOverviewData().catch(() => []),
      fetchAllAvailableSets().catch(() => [])
    ]);

    if (!Array.isArray(importedSets)) throw new Error('Ungültiges Sets-Format');
    state.sets = importedSets;

    const importedById = new Map(importedSets.map((set) => [set.setId, set]));
    const overviewById = new Map((overviewSets || []).map((set) => [set.setId, set]));
    const mergedMap = new Map();

    (apiSets || []).forEach((set) => {
      mergedMap.set(set.setId, {
        ...set,
        imported: Boolean(importedById.get(set.setId)?.imported || overviewById.get(set.setId)?.imported)
      });
    });

    (overviewSets || []).forEach((set) => {
      if (!mergedMap.has(set.setId)) {
        mergedMap.set(set.setId, { ...set, imported: Boolean(set.imported) });
      }
    });

    importedSets.forEach((set) => {
      const current = mergedMap.get(set.setId) || {};
      mergedMap.set(set.setId, { ...current, ...set, imported: true });
    });

    state.allSets = Array.from(mergedMap.values());

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

    dom.searchSetFilter.innerHTML = '<option value="">Alle Sets</option>';
    importedSets.forEach((set) => {
      const opt = document.createElement('option');
      opt.value = set.setId;
      opt.textContent = set.setName;
      dom.searchSetFilter.appendChild(opt);
    });

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

    if (sortBy === 'series-date') {
      const seriesMap = buildSeriesMap(sets);
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
      sets.forEach((set) => {
        const summary = summaryByName.get(set.setName) || summaryByName.get(set.setId);
        grid.appendChild(createDashSetCard(set, summary));
      });
      dom.dashboardGrid.appendChild(grid);
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
      ${set.imported ? '' : '<button class="btn-secondary dash-import-btn" type="button">➕ In Sammlung importieren</button>'}
    </div>`;

  const importButton = card.querySelector('.dash-import-btn');
  if (importButton) {
    importButton.addEventListener('click', async (event) => {
      event.stopPropagation();
      await importSetFromOverview(set);
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
    cache.del(`db_${set.setId}`);
    state.summaryData = null;

    await loadSets();
    dom.selector.value = set.setId;
    navigate(`set/${set.setId}`);
    await loadCurrentSet(true);
    showToast(`${set.setName} wurde importiert.`, 'success', 3000);
  } catch (err) {
    console.error('[importSetFromOverview]', err);
    showToast(`Import fehlgeschlagen: ${err.message}`, 'error', 5000);
    setGlobalStatus(`Import fehlgeschlagen: ${set.setName}`);
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
    finishJob(job, err.message || 'Import abgebrochen', true);
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

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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

  const uniqueSets = Array.from(new Map(mismatchSets.map((set) => [set.setId, set])).values());
  await importSetsSequential(uniqueSets, { successMessage: '{count} Mismatch-Set(s) automatisch repariert.' });
  finishJob(job, `Auto-Fix ausgeführt (${uniqueSets.length} Sets)`, false);
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
  dom.dashFilter.addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(renderDashboard, 200); });
  dom.dashSeriesFilter.addEventListener('change', renderDashboard);
  dom.dashSort.addEventListener('change', renderDashboard);
  dom.btnOverviewSync?.addEventListener('click', syncOverviewFromApi);
  dom.btnOverviewPowerRefresh?.addEventListener('click', powerRefreshOverviewFromApi);
  dom.btnImportBatch?.addEventListener('click', openBatchImportDialog);
  dom.btnImportAll?.addEventListener('click', importAllMissingSets);
  dom.btnReimportCurrent?.addEventListener('click', reimportCurrentSetFromApi);
  dom.btnReimportAllImported?.addEventListener('click', reimportAllImportedSets);
  dom.btnExportSummaryCsv?.addEventListener('click', exportCollectionSummaryCsv);
  dom.btnDataHealthCheck?.addEventListener('click', () => runDataHealthCheck({ autoFix: false }));
  dom.btnDataHealthAutofix?.addEventListener('click', () => runDataHealthCheck({ autoFix: true }));
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
async function runSearch() {
  const query = dom.searchInput.value.trim().toLowerCase();
  if (!query) {
    dom.searchResults.innerHTML = '<p class="empty-state">Suchbegriff eingeben.</p>';
    return;
  }
  const setFilter    = dom.searchSetFilter.value;
  const setsToSearch = setFilter ? state.sets.filter((s) => s.setId === setFilter) : state.sets;
  if (!setsToSearch.length) {
    dom.searchResults.innerHTML = '<p class="empty-state">Keine Sets importiert.</p>';
    return;
  }
  dom.searchResults.innerHTML = '<p class="loading-placeholder">Suche\u2026</p>';
  const results = [];
  for (const set of setsToSearch) {
    try {
      const cacheKey = `cards_${set.setId}`;
      let cards;
      if (state.searchCache.has(set.setId))  cards = state.searchCache.get(set.setId);
      else if (cache.has(cacheKey))          cards = cache.get(cacheKey), state.searchCache.set(set.setId, cards);
      else {
        cards = await fetchMergedCards(set.setId);
        cache.set(cacheKey, cards, CONFIG.CACHE_TTL_MS);
        state.searchCache.set(set.setId, cards);
      }
      let dbMap = new Map();
      const dbCacheKey = `db_${set.setId}`;
      if (cache.has(dbCacheKey)) dbMap = cache.get(dbCacheKey);
      else {
        dbMap = await readSetCollectionMap(set.setName);
        cache.set(dbCacheKey, dbMap, CONFIG.CACHE_TTL_MS);
      }
      cards.forEach((card) => {
        if ((card.name || '').toLowerCase().includes(query) || (card.number || '').toLowerCase().includes(query)) {
          results.push({ card, set, dbMap });
        }
      });
      if (results.length >= 200) break;
    } catch (err) {
      console.warn('[runSearch] error for set', set.setId, err);
    }
  }
  if (!results.length) {
    dom.searchResults.innerHTML = `<p class="empty-state">Keine Karten f\u00fcr \u201e${query}\u201c gefunden (durchsucht: ${setsToSearch.length} Sets).</p>`;
    return;
  }
  dom.searchResults.innerHTML = `<p class="search-result-count">${results.length} Ergebnis${results.length !== 1 ? 'se' : ''}</p>`;
  const frag = document.createDocumentFragment();
  results.forEach(({ card, set, dbMap }) => {
    const key = normalizeCardNumber(card.number);
    frag.appendChild(createSearchResultCard(card, key, dbMap.get(key), set));
  });
  dom.searchResults.appendChild(frag);
}

function createSearchResultCard(card, key, db, set) {
  const article = document.createElement('article');
  article.className = 'card';
  if (db?.rh)     article.classList.add('reverse');
  else if (db?.g) article.classList.add('collected');

  const img = document.createElement('img');
  img.src = card.image || ''; img.alt = card.name || key; img.loading = 'lazy';
  img.onerror = () => { img.style.display = 'none'; };

  const meta    = document.createElement('div'); meta.className = 'meta';
  const setTag  = document.createElement('span'); setTag.className = 'search-set-tag'; setTag.textContent = set.setName;
  const title   = document.createElement('div'); title.className = 'title'; title.textContent = `${card.number} \u2013 ${card.name || '?'}`;
  const status  = document.createElement('div'); status.className = 'search-status';
  status.textContent = db?.rh ? '\uD83D\uDD35 RH' : db?.g ? '\u2705 G' : '\u2610 Fehlend';
  meta.append(setTag, title, status);
  article.append(img, meta);

  article.addEventListener('click', () => {
    dom.selector.value = set.setId;
    navigate(`set/${set.setId}`);
  });
  return article;
}

function initSearch() {
  let debounce;
  dom.searchInput.addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(runSearch, 400); });
  dom.searchSetFilter.addEventListener('change', runSearch);
  dom.searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { clearTimeout(debounce); runSearch(); } });
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
  const isEditable = Boolean(db?.gCell && db?.rhCell);
  const article = document.createElement('article');
  article.className = 'card';
  article.dataset.cardId    = key;
  article.dataset.cardIndex = index;
  article.setAttribute('role', 'listitem');
  article.setAttribute('tabindex', '-1');

  if (db?.rh)     article.classList.add('reverse');
  else if (db?.g) article.classList.add('collected');

  // Image wrap (click → lightbox)
  const imgWrap = document.createElement('div');
  imgWrap.className = 'card-img-wrap';
  imgWrap.addEventListener('click', () => { if (!state.bulkMode) openLightbox(index); });

  const img = document.createElement('img');
  img.src = card.image || ''; img.alt = card.name || key; img.loading = 'lazy';
  img.onerror = () => { img.style.display = 'none'; };
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
  checksDiv.append(makeCheckbox('G', 'g', db?.g ?? false, !isEditable), makeCheckbox('RH', 'rh', db?.rh ?? false, !isEditable || !db?.g));
  meta.append(titleDiv, checksDiv);

  if (card.cardmarketUrl) {
    const cm = document.createElement('a');
    cm.href = card.cardmarketUrl; cm.target = '_blank'; cm.rel = 'noopener noreferrer';
    cm.className = 'card-cm-link'; cm.textContent = '\uD83D\uDED2 CM';
    meta.appendChild(cm);
  }

  article.append(imgWrap, meta);
  if (isEditable) attachCheckboxListeners(article, db, key);

  // Bulk-Klick auf Artikel
  article.addEventListener('click', (e) => {
    if (!state.bulkMode) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'A') return;
    toggleBulkSelect(article, key);
    e.stopPropagation();
  });

  return article;
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

  gInput.addEventListener('change', async () => {
    if (state.bulkMode) { gInput.checked = !gInput.checked; return; }
    const checked = gInput.checked;
    try {
      await updateCellBoolean(state.currentSet.setName, db.gCell.row, db.gCell.col, checked);
      db.g = checked;
      if (!checked) {
        await updateCellBoolean(state.currentSet.setName, db.rhCell.row, db.rhCell.col, false);
        db.rh = false; rhInput.checked = false; rhInput.disabled = true;
      } else {
        rhInput.disabled = false;
      }
      updateCardState(article, db);
      updateStats(); applyFilter();
      state.summaryData = null;
    } catch (err) {
      showToast(`Speichern fehlgeschlagen: ${err.message}`, 'error');
      gInput.checked = !checked;
    }
  });

  rhInput.addEventListener('change', async () => {
    if (state.bulkMode) { rhInput.checked = !rhInput.checked; return; }
    if (!db.g) { rhInput.checked = false; return; }
    const checked = rhInput.checked;
    try {
      await updateCellBoolean(state.currentSet.setName, db.rhCell.row, db.rhCell.col, checked);
      db.rh = checked;
      updateCardState(article, db);
      state.summaryData = null;
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
  const db  = state.dbMap.get(key);
  dom.lightboxImg.src              = card.image || '';
  dom.lightboxImg.alt              = card.name  || key;
  dom.lightboxTitle.textContent    = card.name  || 'Unbekannt';
  dom.lightboxSubtitle.textContent = `#${card.number}`;
  dom.lightboxCounter.textContent  = `${index + 1}\u202f/\u202f${state.cards.length}`;
  if (card.cardmarketUrl) { dom.lightboxCmLink.href = card.cardmarketUrl; dom.lightboxCmLink.classList.remove('hidden'); }
  else dom.lightboxCmLink.classList.add('hidden');
  const isEditable              = Boolean(db?.gCell && db?.rhCell);
  dom.lightboxGCheck.checked    = db?.g  ?? false;
  dom.lightboxGCheck.disabled   = !isEditable;
  dom.lightboxRhCheck.checked   = db?.rh ?? false;
  dom.lightboxRhCheck.disabled  = !isEditable || !db?.g;
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
    const db  = state.dbMap.get(key);
    if (!db?.gCell) return;
    try {
      if (isG) {
        await updateCellBoolean(state.currentSet.setName, db.gCell.row, db.gCell.col, checked);
        db.g = checked;
        if (!checked) {
          await updateCellBoolean(state.currentSet.setName, db.rhCell.row, db.rhCell.col, false);
          db.rh = false;
        }
      } else {
        if (!db.g) return;
        await updateCellBoolean(state.currentSet.setName, db.rhCell.row, db.rhCell.col, checked);
        db.rh = checked;
      }
      renderLightbox(state.lightboxIndex);
      const article = dom.cards.querySelector(`[data-card-index="${state.lightboxIndex}"]`);
      if (article) updateCardState(article, db);
      updateStats();
      state.summaryData = null;
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
    dom.setLogo.src = selected.logoUrl; dom.setSymbol.src = selected.symbolUrl || '';
    dom.setLogoWrap.classList.remove('hidden');
  } else {
    dom.setLogoWrap.classList.add('hidden');
  }

  try {
    const cardsCacheKey = `cards_${setId}`, dbCacheKey = `db_${setId}`;
    if (forceRefresh) { cache.del(cardsCacheKey); cache.del(dbCacheKey); }

    const [cards, dbMap] = await Promise.all([
      cache.has(cardsCacheKey) ? cache.get(cardsCacheKey) : fetchMergedCards(setId).then((c) => { cache.set(cardsCacheKey, c, CONFIG.CACHE_TTL_MS); return c; }),
      cache.has(dbCacheKey)    ? cache.get(dbCacheKey)    : readSetCollectionMap(selected.setName).then((m) => { cache.set(dbCacheKey, m, CONFIG.CACHE_TTL_MS); return m; }),
    ]);

    state.cards = cards;
    state.dbMap = dbMap;
    focusedCardIndex = -1;
    if (state.bulkMode) toggleBulkMode(false);
    state.filter = 'all';
    dom.cardSort.value = 'number';
    state.sortOrder = 'number';
    document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
    document.querySelector('.filter-btn[data-filter="all"]')?.classList.add('active');

    renderCards();
    await writeSetting('lastSetId', setId);
    setGlobalStatus(`${selected.setName}: ${cards.length} Karten.`);
    if (!forceRefresh) showToast(`${selected.setName} geladen`, 'success', 2000);
  } catch (err) {
    console.error('[loadCurrentSet]', err);
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
  initDarkMode();
  initFilterButtons();
  initSpreadsheetDialog();
  initBatchImportDialog();
  initBackupImportExport();
  initLightbox();
  initBulkEdit();
  initKeyboardNav();
  initDashboardControls();
  initSortControl();
  initSearch();

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

