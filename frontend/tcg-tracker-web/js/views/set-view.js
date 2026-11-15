// Set-Ansicht: Raster-Zoom, Mehrfach-Auswahl, CSV-Export, Tastaturnavigation, Set laden.
import { signOut } from '../core/auth.js';
import { readSetCollectionMap, readDbCardsForSet, updateCellBooleansBatch, writeSetting } from '../data/sheets-db.js?v=20261115-clean-5';
import { collectionKeyOf, hasEntryCells, stateCellUpdates, applyEntryState, chunkCardUpdates } from '../data/collection-writes.js';
import { needsApiCardEnrichment, describeCardDataFailure, NO_CARD_DATA_MESSAGE } from '../core/card-enrichment.js';
import { fetchMergedCardsWithSetMeta } from '../data/pokemon-api.js?v=20261115-clean-5';
import { bindImageFallback } from '../ui/image-fallback.js';
import * as cache from '../core/cache.js';
import { CONFIG } from '../core/config.js';
import { GRID_ZOOM_STORAGE_KEY } from '../core/storage-keys.js';
import { dom } from '../app/dom.js';
import { state, uiState } from '../app/state.js';
import { actions } from '../app/actions.js';
import {
  setGlobalStatus, setLoading, showToast, beginTrackedWrite, finishTrackedWrite, pushUndoEntry, updateUndoUi,
  isAuthError, setAssetCandidates, setEmptyState, syncRefreshControls
} from '../ui/helpers.js';
import { getSetById, ensureSetSelectorOption } from './dashboard.js';
import { openLightbox } from './lightbox.js';
import {
  updateStats, applyFilter, renderCards, runAmbiguousMigrationFlow, updateCardState, broadcastRealtimeCardUpdate
} from './set-cards.js';

// --------------------------------------------------------------------------
// GRID ZOOM
// --------------------------------------------------------------------------

function applyGridZoom(value) {
  const cssValue = value + 'px';
  document.documentElement.style.setProperty('--grid-min-width', cssValue);
  document.body?.style?.setProperty('--grid-min-width', cssValue);

  const template = `repeat(auto-fit, minmax(${value}px, 1fr))`;
  document.querySelectorAll('.cards, .dash-sets-row').forEach((grid) => {
    grid.style.setProperty('grid-template-columns', template, 'important');
  });
}

export function initGridZoom() {
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


// --------------------------------------------------------------------------
// BULK-EDIT
// --------------------------------------------------------------------------
function toggleBulkMode(on) {
  state.bulkMode = on;
  state.bulkSelected.clear();
  dom.bulkToolbar.classList.toggle('hidden', !on);
  dom.btnBulkEdit.textContent = on ? '\u2715 Abbrechen' : '\u2611 Mehrfach-Auswahl';
  dom.cards.classList.toggle('bulk-mode', on);
  updateBulkCount();
  if (!on) dom.cards.querySelectorAll('.card.bulk-selected').forEach((a) => a.classList.remove('bulk-selected'));
}

export function toggleBulkSelect(article, key) {
  if (state.bulkSelected.has(key)) { state.bulkSelected.delete(key); article.classList.remove('bulk-selected'); }
  else                              { state.bulkSelected.add(key);    article.classList.add('bulk-selected'); }
  updateBulkCount();
}

function updateBulkCount() {
  dom.bulkCount.textContent = `${state.bulkSelected.size} ausgew\u00e4hlt`;
}

async function bulkUpdate(g, rh) {
  if (!state.bulkSelected.size) { showToast('Keine Karten ausgewaehlt.', 'info'); return; }
  beginTrackedWrite('Bulk-Update');
  setLoading(true, 'Massenaktion...');
  let updated = 0, errors = 0;
  const undoChanges = [];
  try {
    // Alle Zeilen jeder Karte (cellsForUpdate) in einem gebuendelten Write.
    const targetState = { g: Boolean(g), rh: Boolean(g && rh) };
    const pending = [];
    for (const key of state.bulkSelected) {
      const db = state.dbMap.get(key);
      if (!hasEntryCells(db)) continue;
      pending.push({ key, db, prevState: { g: Boolean(db?.g), rh: Boolean(db?.rh) }, updates: stateCellUpdates(db, targetState) });
    }
    // Kartenweise Chunks (eine Karte nie ueber zwei Requests verteilt): Status nur fuer erfolgreich
    // geschriebene Chunks uebernehmen, Fehler nur fuer fehlgeschlagene Chunks zaehlen.
    for (const chunk of chunkCardUpdates(pending, 200)) {
      try {
        await updateCellBooleansBatch(state.currentSet.setName, chunk.flatMap((entry) => entry.updates), { chunkSize: 200 });
      } catch (err) {
        console.warn('[bulkUpdate] chunk error', err);
        errors += chunk.length;
        continue;
      }
      for (const { key, db, prevState } of chunk) {
        applyEntryState(db, targetState);
        const article = dom.cards.querySelector(`[data-card-id="${key}"]`);
        if (article) updateCardState(article, db);
        undoChanges.push({ key, prev: prevState, next: { g: Boolean(db.g), rh: Boolean(db.rh) } });
        broadcastRealtimeCardUpdate(key, db);
        updated++;
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
      label: 'Bulk-aenderung',
      changes: undoChanges
    });
    updateUndoUi();
  }
  finishTrackedWrite('Bulk-Update', errors > 0 ? new Error(`${errors} Fehler`) : null);
  const msg = errors > 0 ? `${updated} aktualisiert, ${errors} Fehler.` : `${updated} Karten aktualisiert.`;
  showToast(msg, errors > 0 ? 'error' : 'success', errors > 0 ? 5000 : 3000);
}

export function initBulkEdit() {
  dom.btnBulkEdit.addEventListener('click', () => toggleBulkMode(!state.bulkMode));
  dom.btnBulkCancel.addEventListener('click', () => toggleBulkMode(false));
  dom.btnBulkMarkG.addEventListener('click',  () => bulkUpdate(true,  false));
  dom.btnBulkMarkRh.addEventListener('click', () => bulkUpdate(true,  true));
  dom.btnBulkUnmark.addEventListener('click', () => bulkUpdate(false, false));
}

// --------------------------------------------------------------------------
// FEHLENDE KARTEN EXPORTIEREN
// --------------------------------------------------------------------------
function getMissingCards() {
  return state.cards.filter((card) => !state.dbMap.get(collectionKeyOf(card))?.g);
}

export function exportMissingCards() {
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

// --------------------------------------------------------------------------
// TASTATURNAVIGATION
// --------------------------------------------------------------------------
export function initKeyboardNav() {
  document.addEventListener('keydown', (e) => {
    if (dom.viewSet.classList.contains('hidden')) return;
    if (dom.lightboxDialog.open) return;
    if (state.bulkMode) return;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;

    const articles = Array.from(dom.cards.querySelectorAll('.card:not(.hidden)'));
    if (!articles.length) return;

    const cols = Math.max(1, Math.floor(dom.cards.offsetWidth / 170));
    let newIndex = uiState.focusedCardIndex;
    
    if (e.key === 'ArrowRight') { e.preventDefault(); newIndex = Math.min((uiState.focusedCardIndex < 0 ? -1 : uiState.focusedCardIndex) + 1, articles.length - 1); }
    else if (e.key === 'ArrowLeft')  { e.preventDefault(); newIndex = Math.max(uiState.focusedCardIndex - 1, 0); }
    else if (e.key === 'ArrowDown')  { e.preventDefault(); newIndex = Math.min(uiState.focusedCardIndex + cols, articles.length - 1); }
    else if (e.key === 'ArrowUp')    { e.preventDefault(); newIndex = Math.max(uiState.focusedCardIndex - cols, 0); }
    else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      articles[uiState.focusedCardIndex]?.querySelector('input[data-type="g"]:not(:disabled)')?.click();
      return;
    } else if (e.key === 'i' || e.key === 'I') {
      e.preventDefault();
      const idx = parseInt(articles[uiState.focusedCardIndex]?.dataset.cardIndex ?? '-1');
      if (idx >= 0) openLightbox(idx);
      return;
    } else return;

    if (newIndex < 0) newIndex = 0;
    uiState.focusedCardIndex = newIndex;
    const target = articles[uiState.focusedCardIndex];
    if (target) {
      target.focus();
      target.scrollIntoView({ block: 'nearest' });
    }
  });

  dom.cards.addEventListener('focus', (e) => {
    const article = e.target.closest('.card');
    if (article) {
      const articles = Array.from(dom.cards.querySelectorAll('.card:not(.hidden)'));
      uiState.focusedCardIndex = articles.indexOf(article);
    }
  }, true);
}

// --------------------------------------------------------------------------
// SET LADEN
// --------------------------------------------------------------------------

/**
 * Karten eines Sets: api/v3 ist massgeblich (Spec §7.1), db_cards nur Offline-Fallback.
 * v3-Karten liegen unter `cards_${setId}`, db_cards unter `db_cards_${setId}` im Cache.
 * @returns {Promise<{ cards: Array, source: 'v3'|'db_cards'|'none', error?: Error }>}
 */
export async function loadSetCardsV3First(setId, { signal, forceRefresh = false } = {}) {
  const normalizedSetId = String(setId || '').trim();
  if (!normalizedSetId) return { cards: [], source: 'none' };
  const v3CacheKey = `cards_${normalizedSetId}`;
  const dbCardsCacheKey = `db_cards_${normalizedSetId}`;
  if (forceRefresh) { cache.del(v3CacheKey); cache.del(dbCardsCacheKey); }
  if (cache.has(v3CacheKey)) return { cards: cache.get(v3CacheKey) || [], source: 'v3' };

  try {
    const payload = await fetchMergedCardsWithSetMeta(normalizedSetId, { signal });
    const cards = Array.isArray(payload?.cards) ? payload.cards : [];
    if (cards.length > 0) {
      cache.set(v3CacheKey, cards, CONFIG.CACHE_TTL_MS);
      return { cards, source: 'v3' };
    }
    return { cards: [], source: 'none' };
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    console.warn('[cards] api/v3 nicht verfuegbar, db_cards als Offline-Fallback:', normalizedSetId, error?.message || error);
    let dbCards = cache.has(dbCardsCacheKey) ? cache.get(dbCardsCacheKey) : null;
    if (!Array.isArray(dbCards)) {
      dbCards = await readDbCardsForSet(normalizedSetId).catch(() => []);
      if (dbCards.length > 0) cache.set(dbCardsCacheKey, dbCards, CONFIG.CACHE_TTL_MS);
    }
    return dbCards.length > 0
      ? { cards: dbCards, source: 'db_cards', error }
      : { cards: [], source: 'none', error };
  }
}

/**
 * Lädt die Karten für ein Set. Wird vom Set-View (`loadCurrentSet`, `preferV3`) und vom Stats-View
 * (`buildCollectedCardCandidates`) benutzt. Bereits geladene v3-Karten (`cards_${setId}`) werden von beiden
 * Pfaden geteilt (gleiche Array-Referenz fuer den Cardmarket-Resolver, `setAssignmentMapCache`).
 *
 * - `preferV3` (Set-View): api/v3 zuerst, db_cards nur als Offline-Fallback. Ohne beides wird ein Fehler mit
 *   der v3-Meldung („Kartendaten (api/v3) nicht erreichbar …“) geworfen.
 * - sonst (Gesamt-Leser ueber viele Sets): db_cards zuerst, damit nicht jede v3-Kartendatei geladen wird;
 *   api/v3 nur bei Altdaten (`needsApiCardEnrichment`) oder wenn `allowApiFallback` und keine db_cards.
 *
 * @param {string} setId
 * @param {{ allowApiFallback?: boolean, forceRefresh?: boolean, preferV3?: boolean }} [opts]
 * @returns {Promise<Array>}
 */
export async function loadSetCardsWithHydration(setId, { allowApiFallback = false, forceRefresh = false, preferV3 = false } = {}) {
  const normalizedSetId = String(setId || '').trim();
  if (!normalizedSetId) return [];
  const v3CacheKey = `cards_${normalizedSetId}`;
  const dbCardsCacheKey = `db_cards_${normalizedSetId}`;
  if (forceRefresh) { cache.del(v3CacheKey); cache.del(dbCardsCacheKey); }
  if (cache.has(v3CacheKey)) return cache.get(v3CacheKey);

  if (preferV3) {
    const { cards, error } = await loadSetCardsV3First(normalizedSetId);
    if (!cards.length) {
      const failure = new Error(describeCardDataFailure(error), error ? { cause: error } : undefined);
      if (error?.code) failure.code = error.code;
      throw failure;
    }
    return cards;
  }

  if (cache.has(dbCardsCacheKey)) return cache.get(dbCardsCacheKey);
  const dbCards = await readDbCardsForSet(normalizedSetId).catch(() => []);
  const hasDbCards = Array.isArray(dbCards) && dbCards.length > 0;
  if (hasDbCards && !needsApiCardEnrichment(dbCards)) {
    cache.set(dbCardsCacheKey, dbCards, CONFIG.CACHE_TTL_MS);
    return dbCards;
  }
  if (hasDbCards || allowApiFallback) {
    const { cards } = await loadSetCardsV3First(normalizedSetId).catch(() => ({ cards: [] }));
    if (cards.length > 0) return cards;
  }
  if (hasDbCards) {
    cache.set(dbCardsCacheKey, dbCards, CONFIG.CACHE_TTL_MS);
    return dbCards;
  }
  return [];
}

export async function loadCurrentSet(forceRefresh = false) {
  const requestedSetId = dom.selector.value;
  if (!requestedSetId) return;
  const selected = state.sets.find((s) => s.setId === requestedSetId) || getSetById(requestedSetId);
  if (!selected) return;
  // Alias-ID (z. B. aus lastSetId) -> kanonisches Set.
  const setId = selected.setId;

  ensureSetSelectorOption(selected);
  if (dom.selector.value !== setId) dom.selector.value = setId;

  state.currentSet = selected;
  syncRefreshControls();
  sessionStorage.setItem('tcg_last_set', setId);
  actions.syncSetNavLink(selected);

  setGlobalStatus(`Lade ${selected.setName}\u2026`);
  setLoading(true, `Lade ${selected.setName}\u2026`);

  const setLogoCandidates = setAssetCandidates(selected, 'setLogo');
  const setSymbolCandidates = setAssetCandidates(selected, 'setSymbol');

  if (setLogoCandidates.length) {
    bindImageFallback(dom.setLogo, setLogoCandidates);

    if (setSymbolCandidates.length) {
      bindImageFallback(dom.setSymbol, setSymbolCandidates, { placeholder: '' });
    } else {
      dom.setSymbol.style.display = 'none';
      dom.setSymbol.removeAttribute('src');
    }
    dom.setLogoWrap.classList.remove('hidden');
  } else {
    dom.setLogoWrap.classList.add('hidden');
  }

  try {
    const dbCacheKey = `db_${setId}`;
    if (forceRefresh) { cache.del(`db_cards_${setId}`); cache.del(`cards_${setId}`); cache.del(dbCacheKey); }

    // api/v3 zuerst, db_cards nur Offline-Fallback; ohne beides die v3-Meldung (describeCardDataFailure).
    const [cards, dbMap] = await Promise.all([
      loadSetCardsWithHydration(setId, { preferV3: true, forceRefresh }),
      cache.has(dbCacheKey)
        ? cache.get(dbCacheKey)
        : readSetCollectionMap(selected.setName, { setId: selected.setId }).then((m) => { cache.set(dbCacheKey, m, CONFIG.CACHE_TTL_MS); return m; }),
    ]);

    if (!Array.isArray(cards) || cards.length === 0) {
      throw new Error(NO_CARD_DATA_MESSAGE);
    }

    state.cards = cards;
    state.dbMap = dbMap;
    state.pendingSearchSetImport = false;
    uiState.focusedCardIndex = -1;
    if (state.bulkMode) toggleBulkMode(false);
    state.filter = 'all';
    dom.cardSort.value = 'number';
    state.sortOrder = 'number';
    document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
    document.querySelector('.filter-btn[data-filter="all"]')?.classList.add('active');

    renderCards();
    void runAmbiguousMigrationFlow(selected);
    await writeSetting('lastSetId', setId);
    actions.markSetAsRecent(selected);
    setGlobalStatus(`${selected.setName}: ${cards.length} Karten.`);
    if (!forceRefresh) showToast(`${selected.setName} geladen`, 'success', 2000);
  } catch (err) {
    console.error('[loadCurrentSet]', err);
    if (isAuthError(err)) {
      showToast('Sitzung abgelaufen. Bitte erneut mit Google anmelden.', 'error', 6000);
      try { signOut(); } catch {}
      actions.resetToLoggedOut();
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
