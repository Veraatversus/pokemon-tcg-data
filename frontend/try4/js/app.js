import { initAuth, signIn, signOut, isSignedIn } from './auth.js';
import {
  listImportedSets,
  readSetCollectionMap,
  updateCellBoolean,
  readSettings,
  writeSetting
} from './sheets-db.js';
import { fetchMergedCards } from './pokemon-api.js';
import { normalizeCardNumber } from './utils.js';
import * as cache from './cache.js';
import { CONFIG } from './config.js';

// ── DOM-Referenzen ────────────────────────────────────────────────────────────
const dom = {
  login:              document.getElementById('btn-login'),
  logout:             document.getElementById('btn-logout'),
  selector:           document.getElementById('set-selector'),
  load:               document.getElementById('btn-load'),
  refresh:            document.getElementById('btn-refresh'),
  status:             document.getElementById('status'),
  cards:              document.getElementById('cards'),
  loadingOverlay:     document.getElementById('loading-overlay'),
  loadingText:        document.getElementById('loading-text'),
  emptyState:         document.getElementById('empty-state'),
  statsSection:       document.getElementById('stats-section'),
  filterSection:      document.getElementById('filter-section'),
  progressFill:       document.getElementById('progress-fill'),
  progressText:       document.getElementById('progress-text'),
  statTotal:          document.getElementById('stat-total'),
  statCollected:      document.getElementById('stat-collected'),
  statRh:             document.getElementById('stat-rh'),
  statMissing:        document.getElementById('stat-missing'),
  toastContainer:     document.getElementById('toast-container'),
  setLogoWrap:        document.getElementById('set-logo-wrap'),
  setLogo:            document.getElementById('set-logo'),
  setSymbol:          document.getElementById('set-symbol'),
  // Spreadsheet-Dialog
  dialog:             document.getElementById('dialog-spreadsheet'),
  dialogInput:        document.getElementById('input-spreadsheet-id'),
  dialogError:        document.getElementById('dialog-error'),
  btnDialogSave:      document.getElementById('btn-dialog-save'),
  btnDialogCancel:    document.getElementById('btn-dialog-cancel'),
  // Spreadsheet-Info
  spreadsheetInfo:    document.getElementById('spreadsheet-info'),
  spreadsheetLink:    document.getElementById('spreadsheet-link'),
  btnChangeSheet:     document.getElementById('btn-change-spreadsheet'),
};

// ── App-State ─────────────────────────────────────────────────────────────────
const state = {
  sets:        [],     // { setId, setName, logoUrl, symbolUrl, series, ... }
  currentSet:  null,
  dbMap:       new Map(),  // normalizedNumber -> { g, rh, gCell, rhCell }
  cards:       [],     // { number, name, image, cardmarketUrl }
  filter:      'all'   // 'all' | 'missing' | 'collected'
};

// ── UI-Helfer ─────────────────────────────────────────────────────────────────

function setStatus(text) {
  dom.status.textContent = text;
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

// ── Stats & Progress ──────────────────────────────────────────────────────────

function updateStats() {
  const total = state.cards.length;
  let collected = 0;
  let rh = 0;

  state.cards.forEach((card) => {
    const db = state.dbMap.get(normalizeCardNumber(card.number));
    if (db?.g) collected++;
    if (db?.rh) rh++;
  });

  const missing  = total - collected;
  const percent  = total > 0 ? Math.round((collected / total) * 100) : 0;

  dom.statTotal.textContent     = total;
  dom.statCollected.textContent = collected;
  dom.statRh.textContent        = rh;
  dom.statMissing.textContent   = missing;
  dom.progressFill.style.width  = `${percent}%`;
  dom.progressFill.closest('.progress-bar').setAttribute('aria-valuenow', percent);
  dom.progressText.innerHTML    = `${collected}\u202f/\u202f${total} (${percent}\u00a0%)`;

  dom.statsSection.classList.remove('hidden');
  dom.filterSection.classList.remove('hidden');
}

// ── Filter ────────────────────────────────────────────────────────────────────

function applyFilter() {
  const articles = dom.cards.querySelectorAll('.card');
  articles.forEach((article) => {
    const cardId = article.dataset.cardId;
    const db = state.dbMap.get(cardId);
    const isCollected = db?.g === true;

    let visible = true;
    if (state.filter === 'missing')   visible = !isCollected;
    if (state.filter === 'collected') visible = isCollected;

    article.classList.toggle('hidden', !visible);
  });
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

// ── Karten-Rendering ─────────────────────────────────────────────────────────

/**
 * Baut alle Karten-DOM-Elemente neu auf.
 * Wird nur beim Set-Wechsel aufgerufen.
 */
function renderCards() {
  dom.cards.innerHTML = '';

  if (!state.cards.length) {
    setEmptyState(true);
    return;
  }
  setEmptyState(false);

  const fragment = document.createDocumentFragment();

  state.cards.forEach((card) => {
    const key = normalizeCardNumber(card.number);
    const db  = state.dbMap.get(key);
    fragment.appendChild(createCardElement(card, key, db));
  });

  dom.cards.appendChild(fragment);
  applyFilter();
  updateStats();
}

/**
 * Erstellt ein einzelnes <article>-Element.
 */
function createCardElement(card, key, db) {
  const isEditable = Boolean(db?.gCell && db?.rhCell);

  const article = document.createElement('article');
  article.className = 'card';
  article.dataset.cardId = key;
  article.setAttribute('role', 'listitem');

  if (db?.rh)      article.classList.add('reverse');
  else if (db?.g)  article.classList.add('collected');

  const imageUrl = card.image || '';
  const img = document.createElement('img');
  img.src     = imageUrl;
  img.alt     = card.name || key;
  img.loading = 'lazy';
  img.onerror = () => { img.style.display = 'none'; };

  const meta = document.createElement('div');
  meta.className = 'meta';

  const titleDiv = document.createElement('div');
  titleDiv.className = 'title';
  titleDiv.textContent = `${card.number} \u2013 ${card.name || 'Unbekannt'}`;

  const checksDiv = document.createElement('div');
  checksDiv.className = 'checks';

  const gLabel  = makeCheckbox('G',  'g',  db?.g  ?? false, !isEditable, false);
  const rhLabel = makeCheckbox('RH', 'rh', db?.rh ?? false, !isEditable || !db?.g, false);
  checksDiv.append(gLabel, rhLabel);

  meta.append(titleDiv, checksDiv);

  if (card.cardmarketUrl) {
    const cmLink = document.createElement('a');
    cmLink.href      = card.cardmarketUrl;
    cmLink.target    = '_blank';
    cmLink.rel       = 'noopener noreferrer';
    cmLink.className = 'card-cm-link';
    cmLink.textContent = 'Cardmarket';
    meta.appendChild(cmLink);
  }

  article.append(img, meta);

  if (isEditable) {
    attachCheckboxListeners(article, db, key);
  }

  return article;
}

function makeCheckbox(labelText, type, checked, disabled) {
  const label = document.createElement('label');
  const input = document.createElement('input');
  input.type     = 'checkbox';
  input.dataset.type = type;
  input.checked  = checked;
  input.disabled = disabled;
  label.append(input, ` ${labelText}`);
  return label;
}

/**
 * Hängt Event-Listener an die Checkboxen eines Karten-Elements.
 * Schreibt nach Sheets, updated dann NUR das betroffene Element (kein Full-Render).
 */
function attachCheckboxListeners(article, db, key) {
  const gInput  = article.querySelector('input[data-type="g"]');
  const rhInput = article.querySelector('input[data-type="rh"]');

  gInput.addEventListener('change', async () => {
    const checked = gInput.checked;
    try {
      await updateCellBoolean(state.currentSet.setName, db.gCell.row, db.gCell.col, checked);
      db.g = checked;

      if (!checked) {
        await updateCellBoolean(state.currentSet.setName, db.rhCell.row, db.rhCell.col, false);
        db.rh          = false;
        rhInput.checked  = false;
        rhInput.disabled = true;
      } else {
        rhInput.disabled = false;
      }

      updateCardState(article, db);
      updateStats();
      applyFilter();
    } catch (err) {
      showToast(`Speichern fehlgeschlagen: ${err.message}`, 'error');
      gInput.checked = !checked;  // Rückgängig machen
    }
  });

  rhInput.addEventListener('change', async () => {
    if (!db.g) { rhInput.checked = false; return; }
    const checked = rhInput.checked;
    try {
      await updateCellBoolean(state.currentSet.setName, db.rhCell.row, db.rhCell.col, checked);
      db.rh = checked;
      updateCardState(article, db);
    } catch (err) {
      showToast(`Speichern fehlgeschlagen: ${err.message}`, 'error');
      rhInput.checked = !checked;
    }
  });
}

/**
 * Aktualisiert die Klasse eines Karten-Elements inkrementell
 * (ohne Full-Rerender, Scroll-Position bleibt erhalten).
 */
function updateCardState(article, db) {
  article.classList.toggle('reverse',   Boolean(db?.rh));
  article.classList.toggle('collected', Boolean(db?.g) && !db?.rh);
}

// ── Set laden ─────────────────────────────────────────────────────────────────

async function loadSets() {
  setLoading(true, 'Lade Sets\u2026');
  try {
    const sets = await listImportedSets();
    state.sets = sets;

    dom.selector.innerHTML = '<option value="">Bitte w\u00e4hlen\u2026</option>';
    sets.forEach((set) => {
      const option = document.createElement('option');
      option.value       = set.setId;
      option.textContent = `${set.setName} (${set.setId})`;
      dom.selector.appendChild(option);
    });

    dom.selector.disabled = false;
    dom.load.disabled     = false;
    dom.refresh.disabled  = false;

    const settings = await readSettings();
    if (settings.lastSetId) {
      dom.selector.value = settings.lastSetId;
    }
    setStatus(`${sets.length} Sets geladen.`);
  } catch (err) {
    showToast(`Fehler beim Laden der Sets: ${err.message}`, 'error');
    setStatus('Sets konnten nicht geladen werden.');
  } finally {
    setLoading(false);
  }
}

async function loadCurrentSet(forceRefresh = false) {
  const setId = dom.selector.value;
  if (!setId) return;

  const selected = state.sets.find((s) => s.setId === setId);
  if (!selected) return;

  state.currentSet = selected;
  setStatus(`Lade ${selected.setName}\u2026`);
  setLoading(true, `Lade ${selected.setName}\u2026`);

  // Set-Logo anzeigen
  if (selected.logoUrl) {
    dom.setLogo.src   = selected.logoUrl;
    dom.setSymbol.src = selected.symbolUrl || '';
    dom.setLogoWrap.classList.remove('hidden');
  } else {
    dom.setLogoWrap.classList.add('hidden');
  }

  try {
    const cardsCacheKey = `cards_${setId}`;
    const dbCacheKey    = `db_${setId}`;

    // Cache zeigt veraltete Daten bei Force-Refresh nicht an
    if (forceRefresh) {
      cache.del(cardsCacheKey);
      cache.del(dbCacheKey);
    }

    const [cards, dbMap] = await Promise.all([
      cache.has(cardsCacheKey)
        ? Promise.resolve(cache.get(cardsCacheKey))
        : fetchMergedCards(setId).then((c) => { cache.set(cardsCacheKey, c, CONFIG.CACHE_TTL_MS); return c; }),
      cache.has(dbCacheKey)
        ? Promise.resolve(cache.get(dbCacheKey))
        : readSetCollectionMap(selected.setName).then((m) => { cache.set(dbCacheKey, m, CONFIG.CACHE_TTL_MS); return m; })
    ]);

    state.cards = cards;
    state.dbMap = dbMap;

    renderCards();
    await writeSetting('lastSetId', setId);
    setStatus(`${selected.setName}: ${cards.length} Karten.`);
    if (!forceRefresh) showToast(`${selected.setName} geladen`, 'success', 2000);
  } catch (err) {
    showToast(`Fehler: ${err.message}`, 'error');
    setStatus('Fehler beim Laden.');
  } finally {
    setLoading(false);
  }
}

// ── Bootstrap ──────────────────────────────────────────────────────────────────

async function bootstrap() {
  initFilterButtons();
  setLoading(true, 'Initialisiere\u2026');
  setStatus('Initialisiere Google API\u2026');

  try {
    const autoLoggedIn = await initAuth();

    dom.login.addEventListener('click', async () => {
      dom.login.disabled = true;
      const ok = await signIn();
      if (!ok) {
        dom.login.disabled = false;
        showToast('Login fehlgeschlagen.', 'error');
        setStatus('Login fehlgeschlagen.');
        return;
      }
      onLoginSuccess();
    });

    dom.logout.addEventListener('click', () => {
      signOut();
      resetToLoggedOut();
    });

    dom.load.addEventListener('click', async () => {
      if (!isSignedIn()) return;
      await loadCurrentSet(false);
    });

    dom.refresh.addEventListener('click', async () => {
      if (!isSignedIn() || !state.currentSet) return;
      await loadCurrentSet(true);
    });

    dom.selector.addEventListener('change', () => {
      // Beim Wechsel des Sets State zurücksetzen
      state.currentSet = null;
      state.cards = [];
      state.dbMap = new Map();
      dom.cards.innerHTML = '';
      dom.statsSection.classList.add('hidden');
      dom.filterSection.classList.add('hidden');
      dom.setLogoWrap.classList.add('hidden');
      setEmptyState(true);
    });

    if (autoLoggedIn) {
      onLoginSuccess();
    } else {
      setLoading(false);
      setStatus('Bereit. Bitte anmelden.');
      setEmptyState(true);
    }
  } catch (err) {
    setLoading(false);
    showToast(`Init-Fehler: ${err.message}`, 'error');
    setStatus(`Fehler: ${err.message}`);
  }
}

function onLoginSuccess() {
  dom.login.disabled  = true;
  dom.logout.disabled = false;
  loadSets();
}

function resetToLoggedOut() {
  state.sets        = [];
  state.currentSet  = null;
  state.dbMap       = new Map();
  state.cards       = [];

  dom.cards.innerHTML = '';
  dom.selector.innerHTML = '<option value="">Bitte w\u00e4hlen\u2026</option>';
  dom.selector.disabled = true;
  dom.load.disabled     = true;
  dom.refresh.disabled  = true;
  dom.login.disabled    = false;
  dom.logout.disabled   = true;

  dom.statsSection.classList.add('hidden');
  dom.filterSection.classList.add('hidden');
  dom.setLogoWrap.classList.add('hidden');
  dom.spreadsheetInfo.classList.add('hidden');
  setEmptyState(true);
  setStatus('Abgemeldet.');
}

bootstrap().catch((err) => {
  console.error(err);
  setStatus(`Fehler: ${err.message}`);
  setLoading(false);
});

