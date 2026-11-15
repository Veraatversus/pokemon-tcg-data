// Set-Ansicht: Statistik/Filter, Kartenraster, Checkboxen und Schreibpfad einer Karte.
import { isGeneratedCardmarketSearchUrl, resolveCardmarketLink } from '../data/cardmarket-url-utils.js';
import {
  readSetCollectionMap,
  ensureCollectionEntry,
  updateCellBooleansBatch,
  appendCollectionRows
} from '../data/sheets-db.js?v=20261115-browse-2';
import {
  collectionKeyOf,
  emptyCollectionEntry,
  hasEntryCells,
  stateCellUpdates,
  applyEntryState,
  adoptEnsuredEntry,
  pendingAmbiguityError,
  isAmbiguousLegacyKeyError,
  describeAmbiguousLegacyKey
} from '../data/collection-writes.js';
import { fetchMergedCardsWithSetMeta } from '../data/pokemon-api.js?v=20261115-browse-2';
import { getCardLanguage } from '../data/schema-contract.js?v=20261115-browse-2';
import { getCardPrice } from '../data/v3-prices.js?v=20261115-browse-2';
import { getCollectionUiState, resolveCollectionToggleState, shouldAutoImportForCollectionToggle, effectiveCollectionStatus } from '../core/collection-state.js?v=20261115-browse-2';
import * as cache from '../core/cache.js';
import { CONFIG } from '../core/config.js';
import { createAutoSnapshot } from '../features/collection/index.js';
import { ensureResolverForSet } from '../data/collection-aliases.js';
import {
  planAmbiguousMigration,
  applyAmbiguousMigration,
  showAmbiguousMigrationDialog
} from '../features/collection/ambiguous-key-migration.js';
import {
  applyCardmarketPriceSummary as applyCardmarketPriceSummaryUi,
  cardmarketPriceSummaryCache,
  cardmarketPriceSummaryPending,
  getCardmarketPriceCacheKey,
  normalizeCardmarketBasePriceType,
  renderLightboxCardmarketPrices as renderLightboxCardmarketPricesUi,
  CARDMARKET_BASE_PRICE_DEFAULT,
} from '../ui/cardmarket-price.js?v=20261115-browse-2';
import { loadSettings } from '../enhanced-features.js?v=20261115-browse-2';
import { buildCollectionUpdateEvent } from '../features/community/index.js';
import { dom } from '../app/dom.js';
import { state } from '../app/state.js';
import { actions } from '../app/actions.js';
import {
  setLoading, showToast, setCardSaveState, beginTrackedWrite, finishTrackedWrite, pushUndoEntry, updateUndoUi,
  attachImageFallback, setEmptyState
} from '../ui/helpers.js';
import { syncDashboardCardForSet } from './dashboard.js';
import { refreshStatsPriceItem } from './stats-price.js';

// --------------------------------------------------------------------------
// SET-DETAIL: STATS & FILTER
// --------------------------------------------------------------------------
export function updateStats() {
  const total = state.cards.length;
  let collected = 0, rh = 0;
  state.cards.forEach((card) => {
    // Geteilter Altstatus mehrdeutiger Altzeilen zaehlt als gesammelt (effectiveCollectionStatus).
    const status = effectiveCollectionStatus(state.dbMap.get(collectionKeyOf(card)));
    if (status.g) collected++;
    if (status.rh) rh++;
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

export function applyFilter() {
  dom.cards.querySelectorAll('.card').forEach((article) => {
    const db = state.dbMap.get(article.dataset.cardId);
    const status = effectiveCollectionStatus(db);
    let visible = true;
    if (state.filter === 'missing')   visible = !status.g;
    if (state.filter === 'missing-rh') {
      const isMissingCard = !status.g;
      const isMissingReverse = Boolean(status.g && db?.rhCell && !status.rh);
      visible = isMissingCard || isMissingReverse;
    }
    if (state.filter === 'collected') visible = status.g;
    article.classList.toggle('hidden', !visible);
  });
}

function applySortOrder() {
  const articles = Array.from(dom.cards.querySelectorAll('.card'));
  const sortBy = state.sortOrder;
  articles.sort((a, b) => {
    const ka = a.dataset.cardId, kb = b.dataset.cardId;
    const cardA = state.cards.find((c) => collectionKeyOf(c) === ka);
    const cardB = state.cards.find((c) => collectionKeyOf(c) === kb);
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

export function initFilterButtons() {
  document.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.filter = btn.dataset.filter;
      applyFilter();
    });
  });
}

export function initSortControl() {
  dom.cardSort.addEventListener('change', () => {
    state.sortOrder = dom.cardSort.value;
    applySortOrder();
  });
}


// --------------------------------------------------------------------------
// SET-DETAIL: KARTEN-RENDERING
// --------------------------------------------------------------------------
export function renderCards() {
  dom.cards.innerHTML = '';
  if (!state.cards.length) { setEmptyState(true); return; }
  setEmptyState(false);
  const fragment = document.createDocumentFragment();
  state.cards.forEach((card, index) => {
    const key = collectionKeyOf(card);
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
  const dbEntry = db || emptyCollectionEntry(card, key);
  const isEditable = Boolean(state.currentSet?.setName);
  const article = document.createElement('article');
  article.className = 'card';
  article.dataset.cardId    = key;
  article.dataset.cardIndex = index;
  article.setAttribute('role', 'listitem');
  article.setAttribute('tabindex', '-1');

  const shownStatus = effectiveCollectionStatus(dbEntry);
  if (shownStatus.rh)     article.classList.add('reverse');
  else if (shownStatus.g) article.classList.add('collected');

  // Image wrap (click ? lightbox)
  const imgWrap = document.createElement('div');
  imgWrap.className = 'card-img-wrap';
  imgWrap.addEventListener('click', (e) => {
    if (state.bulkMode) return;
    e.stopPropagation();
    actions.openLightbox(index);
  });

  const img = document.createElement('img');
  img.alt = card.name || key;
  img.loading = 'lazy';
  imgWrap.appendChild(img);
  attachImageFallback(img, card);

  // Bulk overlay
  const overlay = document.createElement('div'); overlay.className = 'bulk-overlay';
  const checkMark = document.createElement('span'); checkMark.className = 'bulk-check'; checkMark.textContent = '\u2713';
  overlay.appendChild(checkMark);
  imgWrap.appendChild(overlay);

  const meta = document.createElement('div'); meta.className = 'meta';
  const titleDiv = document.createElement('div'); titleDiv.className = 'title';
  titleDiv.textContent = `${card.number} \u2013 ${card.name || 'Unbekannt'}`;

  const checksDiv = document.createElement('div'); checksDiv.className = 'checks';
  if (state.browseMode) {
    // Stoebermodus ohne Login: kein Sammelstatus, nur der Hinweis zum Anmelden.
    checksDiv.append(makeBrowseLoginHint());
  } else {
    checksDiv.append(
      makeCheckbox('G', 'g', shownStatus.g, !isEditable),
      makeCheckbox('RH', 'rh', shownStatus.rh, getCollectionUiState(dbEntry, { isEditable }).rhDisabled)
    );
    syncSharedLegacyBadge(checksDiv, dbEntry);
  }
  meta.append(titleDiv, checksDiv);

  if (card.cardmarketUrl) {
    const isFallbackCardmarket = isGeneratedCardmarketSearchUrl(card.cardmarketUrl);
    const cm = document.createElement('a');
    cm.href = card.cardmarketUrl; cm.target = '_blank'; cm.rel = 'noopener noreferrer';
    cm.className = `card-cm-link${isFallbackCardmarket ? ' card-cm-link-fallback' : ''}`;
    cm.textContent = '\uD83D\uDED2 CM';
    cm.title = isFallbackCardmarket ? 'Generierter Cardmarket-Suchlink' : 'Cardmarket-Produktseite';
    meta.appendChild(cm);
    hydrateCardmarketLink(cm, card, { compact: true, preferReverseHolo: Boolean(dbEntry?.rh) });
  }

  article.append(imgWrap, meta);
  if (isEditable && !state.browseMode) attachCheckboxListeners(article, dbEntry, key);

  // Bulk-Klick auf Artikel
  article.addEventListener('click', (e) => {
    const target = e.target;
    if (target instanceof HTMLElement && target.closest('input, a, label')) return;

    if (!state.bulkMode) {
      actions.openLightbox(index);
      return;
    }

    actions.toggleBulkSelect(article, key);
    e.stopPropagation();
  });

  return article;
}

// cardmarketPriceSummaryCache/-Pending kommen aus js/ui/cardmarket-price.js;
// "Preise neu laden" (reloadCardmarketPricesManually) leert sie.

// Aktueller Basis-Preistyp aus den User-Settings. Wird an den kanonischen
// Picker in `js/ui/cardmarket-price.js` durchgereicht.
export function getCurrentCardmarketBasePriceType() {
  try {
    return normalizeCardmarketBasePriceType(loadSettings()?.cardmarketBasePriceType);
  } catch {
    return CARDMARKET_BASE_PRICE_DEFAULT;
  }
}

// Duenne Wrapper, die den globalen `dom`-State + aktuellen `basePriceType`
// injizieren, damit die App-internen Call-Sites ihre Signaturen beibehalten
// koennen. Die eigentliche Logik lebt in `js/ui/cardmarket-price.js`.
function applyCardmarketPriceSummary(linkEl, summary, opts = {}) {
  return applyCardmarketPriceSummaryUi(linkEl, summary, {
    ...opts,
    basePriceType: opts.basePriceType || getCurrentCardmarketBasePriceType(),
    showPriceRange: opts.showPriceRange ?? readPriceRangeSetting('cardmarketPriceRange'),
    showPriceRangeBase: opts.showPriceRangeBase ?? readPriceRangeSetting('cardmarketPriceRangeShowBase')
  });
}

// Einstellungen "Preisspanne unter den Karten" / "... mit Grundpreis" (nur Anzeige; Berechnungen nutzen den Grundpreis).
function readPriceRangeSetting(key) {
  try {
    return loadSettings()?.[key] === true;
  } catch {
    return false;
  }
}

export function renderLightboxCardmarketPrices(summary, opts = {}) {
  return renderLightboxCardmarketPricesUi(
    { priceMode: dom.lightboxPriceMode, priceGrid: dom.lightboxPriceGrid },
    summary,
    opts
  );
}

export async function loadCardmarketPriceSummary(card = {}) {
  const cacheKey = getCardmarketPriceCacheKey(card);
  if (!cacheKey.trim()) return null;

  if (cardmarketPriceSummaryCache.has(cacheKey)) {
    return cardmarketPriceSummaryCache.get(cacheKey);
  }

  if (cardmarketPriceSummaryPending.has(cacheKey)) {
    return cardmarketPriceSummaryPending.get(cacheKey);
  }

  // Preis aus api/v3/prices/<setId>.json (js/data/v3-prices.js): Set der Karte zuerst (Watchlist/Statistik
  // ueber mehrere Sets), sonst das aktuelle Set (Lightbox). Preis nur bei gleicher Produkt-ID wie der Link.
  const cardSetId = String(card?.setId || '').trim();
  const currentSetId = cardSetId || state?.currentSet?.setId || '';

  const pending = getCardPrice(card, { setId: currentSetId })
    .then((price) => (price ? { cardmarketProductId: price.productId, prices: price } : null))
    .then((entry) => {
      // Produkt der Karte (v3/Legacy-URL), Link in Kartensprache.
      const directUrl = resolveCardmarketLink(card, { language: getCardLanguage() });
      const summary = entry ? { entry, url: directUrl } : null;
      cardmarketPriceSummaryCache.set(cacheKey, summary);
      cardmarketPriceSummaryPending.delete(cacheKey);
      return summary;
    })
    .catch((error) => {
      cardmarketPriceSummaryPending.delete(cacheKey);
      throw error;
    });

  cardmarketPriceSummaryPending.set(cacheKey, pending);
  return pending;
}

export function hydrateCardmarketLink(linkEl, card, { compact = false, preferReverseHolo = false } = {}) {
  const cardmarketUrl = String(card?.cardmarketUrl || '').trim();
  if (!(linkEl instanceof HTMLElement) || !cardmarketUrl) {
    return;
  }

  const cacheKey = getCardmarketPriceCacheKey(card);
  linkEl.dataset.cardmarketUrl = cardmarketUrl;
  if (cardmarketPriceSummaryCache.has(cacheKey)) {
    applyCardmarketPriceSummary(linkEl, cardmarketPriceSummaryCache.get(cacheKey), { compact, preferReverseHolo });
    return;
  }

  loadCardmarketPriceSummary(card)
    .then((summary) => {
      if (linkEl.dataset.cardmarketUrl !== cardmarketUrl) return;
      applyCardmarketPriceSummary(linkEl, summary, { compact, preferReverseHolo });
    })
    .catch((error) => {
      console.warn('[cardmarket] price lookup failed', error);
    });
}

/** Stoebermodus: Knopf statt Sammel-Haekchen; Klick startet den Google-Login. */
export function makeBrowseLoginHint() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'browse-login-hint';
  button.textContent = 'Zum Sammeln anmelden';
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    dom.auth?.click();
  });
  return button;
}

export function makeCheckbox(labelText, type, checked, disabled) {
  const label = document.createElement('label');
  const input = document.createElement('input');
  input.type = 'checkbox'; input.dataset.type = type; input.checked = checked; input.disabled = disabled;
  label.append(input, ` ${labelText}`);
  return label;
}

export function syncCollectionCheckboxUi(gInput, rhInput, db, { isEditable = Boolean(state.currentSet?.setName) } = {}) {
  const cellUiState = getCollectionUiState(db, { isEditable });
  if (gInput) {
    gInput.checked = cellUiState.gChecked;
    gInput.disabled = cellUiState.gDisabled;
  }
  if (rhInput) {
    rhInput.checked = cellUiState.rhChecked;
    rhInput.disabled = cellUiState.rhDisabled;
  }
}

/** Badge "nicht zugeordnet" fuer Karten, die nur den geteilten Altstatus einer mehrdeutigen Altzeile zeigen. */
export function syncSharedLegacyBadge(container, db) {
  if (!container) return;
  const shared = effectiveCollectionStatus(db).shared;
  let badge = container.querySelector('.legacy-shared-badge');
  if (shared && !badge) {
    badge = document.createElement('span');
    badge.className = 'legacy-shared-badge';
    badge.textContent = 'nicht zugeordnet';
    badge.title = 'Status aus einer alten Sammlungszeile, die mehreren Karten entspricht. Klick auf G ordnet sie zu.';
    container.appendChild(badge);
  } else if (!shared && badge) {
    badge.remove();
  }
}

// Migrationsdialog (Task 7, Spec §5.3): mehrdeutige Altzeile mit gesetztem Status. Ohne Dialog-Ergebnis
// ("Spaeter") wird nichts geschrieben. Kandidaten ohne eigene Zeile zeigen den gemeinsamen Altstatus als
// besessen (nur lesend, Badge "nicht zugeordnet", zaehlt in Statistik/Fehlend-Filter, effectiveCollectionStatus);
// ein Klick auf G loest ueber pendingAmbiguityError erneut diesen Dialog aus.
export function onAmbiguousLegacyKey(err) {
  showToast(describeAmbiguousLegacyKey(err), 'info', 8000);
  const set = state.currentSet;
  if (set?.setId) void runAmbiguousMigrationFlow(set, { force: true });
}

const ambiguousMigrationRunning = new Set();
const ambiguousMigrationDeclined = new Set();

async function reloadDbMapForSet(set) {
  const map = await readSetCollectionMap(set.setName, { setId: set.setId });
  cache.set(`db_${set.setId}`, map, CONFIG.CACHE_TTL_MS);
  if (state.currentSet?.setId === set.setId) state.dbMap = map;
  return map;
}

/** Stille Migration automatisch, danach Dialog fuer Altzeilen mit Haken. force: auch nach "Spaeter". */
export async function runAmbiguousMigrationFlow(set, { force = false } = {}) {
  if (!set?.setId || ambiguousMigrationRunning.has(set.setId)) return;
  if (!force && ambiguousMigrationDeclined.has(set.setId)) return;
  const ambiguousIn = (map) => [...(map?.values?.() || [])].filter((entry) => entry.ambiguous);
  if (!ambiguousIn(state.dbMap).length) return;
  ambiguousMigrationRunning.add(set.setId);
  try {
    const resolver = await ensureResolverForSet(set.setId);
    const canonicalSetId = resolver.resolveSetKey(set.setId) || set.setId;
    const deps = {
      createSnapshot: (name, data) => createAutoSnapshot(name, data),
      appendRows: (rows) => appendCollectionRows(rows),
      updateCells: (updates) => updateCellBooleansBatch(set.setName, updates, { chunkSize: 200 }),
      readMap: () => readSetCollectionMap(set.setName, { setId: set.setId })
    };
    const planFor = (map) => planAmbiguousMigration(ambiguousIn(map), { setId: canonicalSetId, cards: state.cards });
    let map = state.dbMap;
    const silentPlan = planFor(map);
    if (silentPlan.silent.length) {
      // Stille Migration: Fehler nur loggen, kein Toast (Quota/Netz); naechstes Oeffnen versucht es erneut.
      try {
        await applyAmbiguousMigration(silentPlan, new Map(), deps);
        map = await reloadDbMapForSet(set);
      } catch (silentErr) {
        console.warn('[ambiguous-migration] stille Migration uebersprungen:', silentErr);
        return;
      }
    }
    const plan = planFor(map);
    if (!plan.needsDialog.length) return;
    const { action, choices } = await showAmbiguousMigrationDialog(plan);
    if (action !== 'apply') {
      ambiguousMigrationDeclined.add(set.setId);
      return;
    }
    const result = await applyAmbiguousMigration(plan, choices, deps);
    await reloadDbMapForSet(set);
    if (state.currentSet?.setId === set.setId) renderCards();
    showToast(`${result.migrated.length} alte Einträge zugeordnet.`, 'success', 4000);
  } catch (err) {
    console.error('[ambiguous-migration]', err);
    showToast(`Zuordnung fehlgeschlagen: ${err?.message || err}`, 'error');
  } finally {
    ambiguousMigrationRunning.delete(set.setId);
  }
}

export function reportCollectionWriteError(err, prefix = 'Speichern fehlgeschlagen') {
  if (isAmbiguousLegacyKeyError(err)) {
    onAmbiguousLegacyKey(err);
    return;
  }
  showToast(`${prefix}: ${err?.message || err}`, 'error');
}

/**
 * Sorgt dafuer, dass `db` mindestens eine Sammlungszeile hat (Schluessel = collectionKey, Zeilen ueber alle
 * Aliase). Mehrdeutige Altzeilen mit gesetztem Status -> Fehler AMBIGUOUS_LEGACY_KEY, kein Write.
 */
export async function ensureWritableCollectionEntry(set, db, key) {
  if (hasEntryCells(db)) return db;
  const pending = pendingAmbiguityError(db, { setId: set?.setId });
  if (pending) throw pending;
  const ensured = await ensureCollectionEntry(set.setName, key, { setId: set.setId });
  return adoptEnsuredEntry(db, ensured);
}

/** Schreibt {g, rh} in alle Zeilen der Karte (ein gebuendelter Write) und uebernimmt den Status. */
export async function writeCollectionEntryState(setName, db, nextState) {
  const updates = stateCellUpdates(db, nextState);
  if (!updates.length) throw new Error('Keine Sammlungszeile fuer diese Karte gefunden.');
  await updateCellBooleansBatch(setName, updates, { chunkSize: 200 });
  applyEntryState(db, nextState);
  return db;
}

function attachCheckboxListeners(article, db, key) {
  const gInput  = article.querySelector('input[data-type="g"]');
  const rhInput = article.querySelector('input[data-type="rh"]');

  async function ensureDbEntry({ checked = false, source = 'set-view' } = {}) {
    const shouldAutoImport = shouldAutoImportForCollectionToggle({
      checked,
      pendingSearchSetImport: state.pendingSearchSetImport,
      currentSetImported: state.currentSet?.imported
    });

    if (shouldAutoImport) {
      const setToImport = state.currentSet;
      const setId = String(setToImport?.setId || '').trim();
      if (!setId) {
        throw new Error('Set-ID fuer den automatischen Import fehlt.');
      }

      setLoading(true, `Importiere ${setToImport.setName}`);
      try {
        const importPayload = await fetchMergedCardsWithSetMeta(setId).catch(() => ({ cards: [], setMetaPatch: null }));
        const importCards = Array.isArray(importPayload?.cards) ? importPayload.cards : [];
        if (!importCards.length) {
          throw new Error('Keine Kartendaten fuer den automatischen Set-Import gefunden.');
        }

        const refreshedSet = await actions.ensureSetImportedFromApi(setToImport, importCards, {
          setMetaPatch: importPayload?.setMetaPatch || null,
          showSuccessToast: true,
          successMessage: `${setToImport.setName} wurde automatisch importiert.`,
          source
        });

        state.currentSet = refreshedSet || { ...setToImport, imported: true };
        state.pendingSearchSetImport = false;
        state.dbMap = await readSetCollectionMap(state.currentSet.setName, { setId: state.currentSet.setId }).catch(() => new Map());
        cache.set(`db_${state.currentSet.setId}`, state.dbMap, CONFIG.CACHE_TTL_MS);
        db = state.dbMap.get(key) || db;
      } finally {
        setLoading(false);
      }
    }

    await ensureWritableCollectionEntry(state.currentSet, db, key);
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
      await ensureDbEntry({ checked, source: 'set-grid' });
      const nextState = resolveCollectionToggleState(db, { isG: true, checked });
      await writeCollectionEntryState(state.currentSet.setName, db, nextState);
      updateCardState(article, db);
      updateStats(); applyFilter();
      state.summaryData = null;
      pushUndoEntry({
        setId: state.currentSet?.setId,
        setName: state.currentSet?.setName,
        label: 'Kartenstatus geaendert',
        changes: [{ key, prev: prevState, next: { g: Boolean(db.g), rh: Boolean(db.rh) } }]
      });
      updateUndoUi();
      broadcastRealtimeCardUpdate(key, db);
      setCardSaveState(article, 'saved');
      finishTrackedWrite(`Karte #${db?.displayId || key} speichern`, null);
    } catch (err) {
      reportCollectionWriteError(err);
      gInput.checked = !checked;
      setCardSaveState(article, 'error');
      finishTrackedWrite(`Karte #${db?.displayId || key} speichern`, err);
    }
  });

  rhInput.addEventListener('change', async () => {
    if (state.bulkMode) { rhInput.checked = !rhInput.checked; return; }
    const checked = rhInput.checked;
    const prevState = { g: Boolean(db?.g), rh: Boolean(db?.rh) };
    setCardSaveState(article, 'saving');
    beginTrackedWrite(`Karte #${db?.displayId || key} RH speichern`);
    try {
      await ensureDbEntry({ checked, source: 'set-grid-rh' });
      if (!db?.rhCell) { rhInput.checked = false; setCardSaveState(article, ''); finishTrackedWrite(`Karte #${db?.displayId || key} RH speichern`, null); return; }
      const nextState = resolveCollectionToggleState(db, { isG: false, checked });
      await writeCollectionEntryState(state.currentSet.setName, db, nextState);
      updateCardState(article, db);
      updateStats(); applyFilter();
      state.summaryData = null;
      pushUndoEntry({
        setId: state.currentSet?.setId,
        setName: state.currentSet?.setName,
        label: 'RH-Status geaendert',
        changes: [{ key, prev: prevState, next: { g: Boolean(db.g), rh: Boolean(db.rh) } }]
      });
      updateUndoUi();
      broadcastRealtimeCardUpdate(key, db);
      setCardSaveState(article, 'saved');
      finishTrackedWrite(`Karte #${db?.displayId || key} RH speichern`, null);
    } catch (err) {
      reportCollectionWriteError(err);
      rhInput.checked = !checked;
      setCardSaveState(article, 'error');
      finishTrackedWrite(`Karte #${db?.displayId || key} RH speichern`, err);
    }
  });
}

export function updateCardState(article, db) {
  const gInput = article?.querySelector('input[data-type="g"]');
  const rhInput = article?.querySelector('input[data-type="rh"]');
  syncCollectionCheckboxUi(gInput, rhInput, db);
  const status = effectiveCollectionStatus(db);
  article.classList.toggle('reverse',   status.rh);
  article.classList.toggle('collected', status.g && !status.rh);
  syncSharedLegacyBadge(article?.querySelector('.checks'), db);
  const cardmarketLink = article?.querySelector('.card-cm-link');
  const cardIndex = Number.parseInt(article?.dataset?.cardIndex || '-1', 10);
  const card = Number.isFinite(cardIndex) && cardIndex >= 0 ? state.cards[cardIndex] : null;
  if (card && cardmarketLink) {
    hydrateCardmarketLink(cardmarketLink, card, { compact: true, preferReverseHolo: Boolean(db?.rh) });
  }
  if (dom.lightboxDialog.open) {
    const idx = parseInt(article.dataset.cardIndex, 10);
    if (state.lightboxIndex === idx) actions.renderLightbox(idx);
  }
  // Live-Update der Stats-View: wenn die Karte in den analytics enthalten ist,
  // müssen die Cardmarket-URL (mit `?isReverseHolo=Y`-Suffix) und der
  // Sortier-/Filter-Status im Item aktualisiert werden. Sonst zeigt die
  // Stats-View erst nach dem nächsten Analytics-Refresh den neuen Status.
  if (card && state?.currentSet?.setId) {
    refreshStatsPriceItem({
      setId: state.currentSet.setId,
      collectionKey: collectionKeyOf(card),
      number: card?.number,
      rh: Boolean(db?.rh),
    });
  }
}

export function broadcastRealtimeCardUpdate(cardNumber, db) {
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

export function applyIncomingRealtimeUpdate(payload) {
  if (!payload || payload.type !== 'collection-update' || !state.currentSet) return;

  const isSameSet =
    payload.setId === state.currentSet.setId ||
    payload.setName === state.currentSet.setName;
  if (!isSameSet) return;

  // cardNumber traegt seit v3 den collectionKey (broadcastRealtimeCardUpdate(key, …)).
  const key = String(payload.cardNumber ?? '').trim();
  const db = state.dbMap.get(key);
  if (!db) return;

  applyEntryState(db, { g: payload.g, rh: payload.rh });

  const article = dom.cards.querySelector(`[data-card-id="${key}"]`);
  if (article) updateCardState(article, db);

  if (dom.lightboxDialog.open) {
    const card = state.cards[state.lightboxIndex];
    const lightboxKey = card ? collectionKeyOf(card) : null;
    if (lightboxKey && lightboxKey === key) actions.renderLightbox(state.lightboxIndex);
  }

  updateStats();
  state.summaryData = null;
  showToast(`Live-Update empfangen: #${payload.cardNumber}`, 'info', 2000);
}
