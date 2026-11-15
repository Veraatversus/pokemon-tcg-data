// UI-Helfer: Status, Toast, Undo, Dialoge, Mojibake-Bereinigung und kleine Anzeige-Helfer.
import { isSignedIn } from '../core/auth.js';
import { updateCellBooleansBatch } from '../data/sheets-db.js?v=20261115-umlaute';
import { hasEntryCells, stateCellUpdates, applyEntryState } from '../data/collection-writes.js';
import { getCardLanguage } from '../data/schema-contract.js?v=20261115-umlaute';
import { imageCandidates, bindImageFallback } from '../ui/image-fallback.js';
import { createSpreadsheetSwitchStatePatch } from '../core/utils.js';
import * as cache from '../core/cache.js';
import { CONFIG } from '../core/config.js';
import { dom } from '../app/dom.js';
import { state, uiState } from '../app/state.js';
import { actions } from '../app/actions.js';

export function setGlobalStatus(text) {
  const safeText = normalizeUiText(text);
  if (dom.globalStatus) dom.globalStatus.textContent = safeText;
  if (dom.status)       dom.status.textContent = safeText;
  console.info('[Status]', safeText);
}

export function setLoading(show, text = 'Lade\u2026') {
  if (!dom.loadingOverlay) return;
  const safeText = normalizeUiText(text);
  if (dom.loadingText) dom.loadingText.textContent = safeText;
  // OVERLAY DISABLED: Always hide immediately - start directly on page
  dom.loadingOverlay.classList.add('hidden');
  dom.loadingOverlay.setAttribute('aria-hidden', 'true');
}

export function showToast(message, type = 'info', durationMs = 3000) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = normalizeUiText(message);
  dom.toastContainer.appendChild(el);
  setTimeout(() => el.remove(), durationMs);
}

export function escapeHtml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function normalizeUiText(value) {
  let text = String(value ?? '');
  if (!text) return '';

  const wordFixes = [
    [/f\uFFFDr/g, 'fuer'],
    [/ausgew\uFFFDhlt/g, 'ausgewaehlt'],
    [/gel\uFFFDscht/g, 'geloescht'],
    [/l\uFFFDschen/g, 'loeschen'],
    [/m\uFFFDglich/g, 'moeglich'],
    [/w\uFFFDhlen/g, 'waehlen'],
    [/g\uFFFDltig/g, 'gueltig'],
    [/r\uFFFDckg\uFFFDngig/g, 'rueckgaengig'],
    [/l\uFFFDuft/g, 'laeuft'],
    [/verf\uFFFDgbar/g, 'verfuegbar'],
    [/enth\uFFFDlt/g, 'enthaelt'],
    [/\uFFFDffnen/g, 'oeffnen'],
    [/\uFFFDffnet/g, 'oeffnet'],
    [/\uFFFDffne/g, 'oeffne'],
    [/\uFFFDbersicht/g, 'Uebersicht'],
    [/\uFFFDnderung/g, 'aenderung'],
    [/\uFFFDnderungen/g, 'aenderungen']
  ];

  const replacements = [
    [/\?\?\s+/g, ''],
    ...wordFixes,
    [/\s+\uFFFD\s+/g, ' - '],
    [/\uFFFD([\w])/g, '$1'],
    [/([\w])\uFFFD/g, '$1'],
    [/\uFFFD/g, ''],
    [/\s{2,}/g, ' ']
  ];

  for (const [pattern, replacement] of replacements) {
    text = text.replace(pattern, replacement);
  }

  return text.trim();
}

function sanitizeMojibakeTextNode(node) {
  if (!node || node.nodeType !== Node.TEXT_NODE) return;
  const current = String(node.nodeValue ?? '');
  if (!current || (!current.includes('\uFFFD') && !current.includes('??'))) return;
  const normalized = normalizeUiText(current);
  if (normalized !== current) node.nodeValue = normalized;
}

function sanitizeMojibakeAttributes(el) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return;
  const attrNames = ['title', 'aria-label', 'placeholder'];
  for (const attr of attrNames) {
    const raw = el.getAttribute(attr);
    if (!raw || (!raw.includes('\uFFFD') && !raw.includes('??'))) continue;
    el.setAttribute(attr, normalizeUiText(raw));
  }
}

function sanitizeMojibakeInDom(root = document.body) {
  if (!root) return;

  if (root.nodeType === Node.TEXT_NODE) {
    sanitizeMojibakeTextNode(root);
    return;
  }

  sanitizeMojibakeAttributes(root);

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let textNode = walker.nextNode();
  while (textNode) {
    sanitizeMojibakeTextNode(textNode);
    textNode = walker.nextNode();
  }

  if (root.querySelectorAll) {
    root.querySelectorAll('*').forEach((el) => sanitizeMojibakeAttributes(el));
  }
}

let _mojibakeObserver = null;
let _dialogNormalizerInstalled = false;

export function installMojibakeSanitizer() {
  if (!_dialogNormalizerInstalled) {
    _dialogNormalizerInstalled = true;
    const nativeConfirm = window.confirm.bind(window);
    const nativePrompt = window.prompt.bind(window);
    const nativeAlert = window.alert.bind(window);

    window.confirm = (message) => nativeConfirm(normalizeUiText(message));
    window.prompt = (message, defaultValue = '') => nativePrompt(normalizeUiText(message), normalizeUiText(defaultValue));
    window.alert = (message) => nativeAlert(normalizeUiText(message));
  }

  sanitizeMojibakeInDom(document.body);

  if (_mojibakeObserver) return;
  _mojibakeObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') {
        sanitizeMojibakeTextNode(mutation.target);
        continue;
      }
      if (mutation.type === 'attributes') {
        sanitizeMojibakeAttributes(mutation.target);
        continue;
      }
      for (const node of mutation.addedNodes || []) {
        sanitizeMojibakeInDom(node);
      }
    }
  });

  _mojibakeObserver.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['title', 'aria-label', 'placeholder']
  });
}

export function closeOtherOpenDialogs(except = []) {
  const keep = new Set(except.filter(Boolean));
  document.querySelectorAll('dialog[open]').forEach((dialog) => {
    if (keep.has(dialog)) return;
    try {
      dialog.close();
    } catch {
      // ignore dialogs that cannot be closed in the current state
    }
  });
}

const SUPPORT_CHANNEL_META = Object.freeze({
  bug: {
    title: 'Bug melden',
    fallbackMessage: 'Bug-Formular noch nicht hinterlegt - ich oeffne vorerst die Kontaktseite.'
  },
  feature: {
    title: 'Feature wuenschen',
    fallbackMessage: 'Feature-Formular noch nicht hinterlegt - ich oeffne vorerst die Kontaktseite.'
  },
  access: {
    title: 'Zugang beantragen',
    fallbackMessage: 'Access-Formular noch nicht hinterlegt - ich oeffne vorerst die Kontaktseite.'
  }
});

function isConfiguredSupportUrl(url) {
  return Boolean(url) && !/replace|todo|example/i.test(String(url));
}

function resolveSupportTarget(kind) {
  const supportConfig = CONFIG.SUPPORT || {};
  const directUrl = String(supportConfig.channels?.[kind] || '').trim();
  const fallbackUrl = String(supportConfig.fallbackUrls?.[kind] || '../kontakt.html#projektkontakt').trim();
  return {
    directUrl,
    fallbackUrl: new URL(fallbackUrl, window.location.href).toString()
  };
}

export function openSupportHubDialog() {
  closeOtherOpenDialogs([dom.supportHubDialog]);
  dom.supportHubDialog?.showModal();
}

export function openSupportChannel(kind) {
  const safeKind = SUPPORT_CHANNEL_META[kind] ? kind : 'feature';
  const meta = SUPPORT_CHANNEL_META[safeKind];
  const { directUrl, fallbackUrl } = resolveSupportTarget(safeKind);
  const targetUrl = isConfiguredSupportUrl(directUrl) ? directUrl : fallbackUrl;

  dom.supportHubDialog?.close();
  window.open(targetUrl, '_blank', 'noopener,noreferrer');

  if (!isConfiguredSupportUrl(directUrl)) {
    showToast(meta.fallbackMessage, 'info', 5200);
  }
}

export function pushAuditEntry(kind, message) {
  const entry = {
    kind,
    message: String(message || '').trim(),
    at: new Date().toISOString()
  };
  state.auditEntries.unshift(entry);
  if (state.auditEntries.length > 80) state.auditEntries.length = 80;
  renderAuditPanel();
}

export function renderAuditPanel() {
  if (!dom.auditList) return;
  const rows = state.auditEntries || [];
  if (!rows.length) {
    dom.auditList.innerHTML = '<li class="audit-empty">Noch keine Einträge.</li>';
    return;
  }
  dom.auditList.innerHTML = rows.map((entry) => {
    const time = new Date(entry.at).toLocaleTimeString('de-DE');
    const safeKind = String(entry.kind || 'info').replace(/[^a-z-]/gi, '').toLowerCase();
    return `<li class="audit-entry ${safeKind}"><span class="audit-time">${time}</span><span class="audit-msg">${entry.message}</span></li>`;
  }).join('');
}

export function updateSaveStatePill() {
  if (!dom.saveStatePill) return;
  const pending = Number(state.pendingWrites || 0);
  dom.saveStatePill.classList.remove('is-pending', 'is-error', 'is-saved');

  if (pending > 0) {
    dom.saveStatePill.textContent = `Speichert... (${pending})`;
    dom.saveStatePill.classList.add('is-pending');
    return;
  }

  if (state.lastSaveError) {
    dom.saveStatePill.textContent = 'Speicherfehler';
    dom.saveStatePill.classList.add('is-error');
    return;
  }

  dom.saveStatePill.textContent = 'Gespeichert';
  dom.saveStatePill.classList.add('is-saved');
}

export function setCardSaveState(article, mode = '') {
  if (!article) return;
  const checks = article.querySelector('.checks');
  if (!checks) return;
  checks.classList.remove('is-saving', 'is-error', 'is-saved');
  if (mode === 'saving') checks.classList.add('is-saving');
  if (mode === 'error') checks.classList.add('is-error');
  if (mode === 'saved') {
    checks.classList.add('is-saved');
    window.setTimeout(() => {
      checks.classList.remove('is-saved');
    }, 1000);
  }
}

export function beginTrackedWrite(label) {
  state.pendingWrites = Math.max(0, Number(state.pendingWrites || 0)) + 1;
  state.lastSaveError = null;
  updateSaveStatePill();
  if (label) pushAuditEntry('info', `Start: ${label}`);
}

export function finishTrackedWrite(label, error = null) {
  state.pendingWrites = Math.max(0, Number(state.pendingWrites || 0) - 1);
  if (error) {
    state.lastSaveError = String(error?.message || error || 'Unbekannter Fehler');
    if (label) pushAuditEntry('error', `${label}: ${state.lastSaveError}`);
  } else if (label) {
    pushAuditEntry('success', `${label}: OK`);
  }
  updateSaveStatePill();

  if (!error) {
    window.clearTimeout(state.saveStateTimer);
    state.saveStateTimer = window.setTimeout(() => {
      if (state.pendingWrites === 0 && !state.lastSaveError) updateSaveStatePill();
    }, 800);
  }
}

export function pushUndoEntry(entry) {
  if (!entry || !Array.isArray(entry.changes) || entry.changes.length === 0) return;
  state.undoStack.push(entry);
  if (state.undoStack.length > 30) state.undoStack.shift();
  if (dom.btnUndoLast) dom.btnUndoLast.disabled = false;
}

export function updateUndoUi() {
  if (!dom.btnUndoLast) return;
  const count = state.undoStack.length;
  dom.btnUndoLast.disabled = count === 0;
  dom.btnUndoLast.title = count > 0 ? `Letzte aenderung rueckgaengig (${count})` : 'Keine aenderung zum Rckgngigmachen';
}

export async function undoLastChange() {
  const entry = state.undoStack.pop();
  updateUndoUi();
  if (!entry) {
    showToast('Keine aenderung zum Rckgngigmachen.', 'info', 2200);
    return;
  }

  if (!state.currentSet || (entry.setId && state.currentSet.setId !== entry.setId)) {
    showToast('Undo ist nur im gleichen Set moeglich.', 'info', 2600);
    return;
  }

  beginTrackedWrite('Undo');
  setLoading(true, 'Undo laeuft');
  let reverted = 0;
  try {
    // Alle Zeilen jeder Karte (Aliase) in einem gebuendelten Write zuruecksetzen.
    const reverts = [];
    for (const change of entry.changes) {
      const db = state.dbMap.get(change.key);
      if (!hasEntryCells(db)) continue;
      const prevState = { g: Boolean(change.prev?.g), rh: Boolean(change.prev?.rh && change.prev?.g) };
      reverts.push({ change, db, prevState, updates: stateCellUpdates(db, prevState) });
    }
    const revertUpdates = reverts.flatMap((item) => item.updates);
    if (revertUpdates.length) await updateCellBooleansBatch(state.currentSet.setName, revertUpdates, { chunkSize: 200 });
    for (const { change, db, prevState } of reverts) {
      applyEntryState(db, prevState);

      const article = dom.cards.querySelector(`[data-card-id="${change.key}"]`);
      if (article) actions.updateCardState(article, db);
      actions.broadcastRealtimeCardUpdate(change.key, db);
      reverted++;
    }

    actions.updateStats();
    actions.applyFilter();
    state.summaryData = null;
    showToast(`Undo abgeschlossen (${reverted} Karte${reverted === 1 ? '' : 'n'}).`, 'success', 2500);
    finishTrackedWrite('Undo', null);
  } catch (err) {
    showToast(`Undo fehlgeschlagen: ${err.message}`, 'error', 4500);
    finishTrackedWrite('Undo', err);
  } finally {
    setLoading(false);
    updateUndoUi();
  }
}

export function getErrorMessage(err, fallback = 'Unbekannter Fehler') {
  if (!err) return fallback;
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err.trim()) return err.trim();
  if (err?.result?.error?.message) return String(err.result.error.message);
  if (err?.error?.message) return String(err.error.message);
  if (err?.statusText) return String(err.statusText);
  try {
    const serialized = JSON.stringify(err);
    return serialized && serialized !== '{}' ? serialized : fallback;
  } catch {
    return fallback;
  }
}

export function isAuthError(err) {
  const status = Number(err?.status || err?.result?.error?.code || 0);
  if (status === 401 || status === 403) return true;
  const message = String(err?.result?.error?.message || err?.message || '').toLowerCase();
  return message.includes('unauthenticated')
    || message.includes('unauthorized')
    || message.includes('auth')
    || message.includes('anmelden');
}

function sanitizeSetAssetUrl(url, setIdHint = '') {
  const value = String(url || '').trim();
  if (!value) return '';

  const normalized = value.toLowerCase();
  if (
    normalized === '0'
    || normalized === 'null'
    || normalized === 'undefined'
    || normalized === 'nan'
    || normalized.includes('pokeball-fallback.svg')
  ) {
    return '';
  }

  const withTcgdexExtension = (() => {
    if (/\.(?:webp|png|jpe?g|svg)(?:[?#]|$)/i.test(value)) return value;
    if (!/^https?:\/\/assets\.tcgdex\.net\//i.test(value)) return value;
    if (!/\/(?:logo|symbol)(?:[?#].*)?$/i.test(value)) return value;
    const match = value.match(/^([^?#]+)([?#].*)?$/);
    return match ? `${match[1]}.webp${match[2] || ''}` : value;
  })();

  const setId = String(setIdHint || '').trim();
  if (/^https?:\/\/images\.pokedata\.ovh\//i.test(value)) {
    if (setId && !setId.startsWith('TCGDEX-')) {
      return `https://images.pokemontcg.io/${encodeURIComponent(setId)}/logo.png`;
    }
    return '';
  }

  if (
    /^https?:\/\//i.test(withTcgdexExtension)
    || withTcgdexExtension.startsWith('/')
    || withTcgdexExtension.startsWith('./')
    || withTcgdexExtension.startsWith('../')
  ) {
    return withTcgdexExtension;
  }

  return '';
}

// Set-Logo/-Symbol-Kandidaten in Sprachreihenfolge (image-fallback.js), ueber sanitizeSetAssetUrl normalisiert.
export function setAssetCandidates(set, kind) {
  const seen = new Set();
  return imageCandidates(set, kind, getCardLanguage())
    .map((url) => sanitizeSetAssetUrl(url, set?.setId))
    .filter((url) => url && !seen.has(url) && seen.add(url));
}

// Kartenbild mit Fallback-Kette (DE -> EN -> legacy bzw. EN -> DE -> legacy), am Ende Platzhalter.
// `preferred` (z. B. das bereits geladene Lightbox-Bild) wird vorangestellt.
export function attachImageFallback(img, card, { kind = 'cardSmall', preferred = '' } = {}) {
  const candidates = imageCandidates(card, kind, getCardLanguage());
  const pref = String(preferred || '').trim();
  const wrap = img.closest('.card-img-wrap');
  if (wrap) {
    wrap.dataset.placeholder = card?.number
      ? `${card.number} - Kein Kartenbild`
      : 'Kein Kartenbild';
  }
  bindImageFallback(img, pref && pref !== window.location.href
    ? [pref, ...candidates.filter((url) => url !== pref)]
    : candidates);
  if (!candidates.length && !pref) {
    img.alt = `Kein Kartenbild fuer ${card?.name || card?.number || 'diese Karte'}`;
  }
}

export function setEmptyState(show) {
  dom.emptyState.classList.toggle('hidden', !show);
  dom.cards.classList.toggle('hidden', show);
}

export function setRefreshMenuOpen(isOpen) {
  if (!dom.refreshMenu || !dom.btnRefreshMenu) return;
  const shouldOpen = Boolean(isOpen) && !dom.btnRefreshMenu.disabled;
  dom.refreshMenu.classList.toggle('hidden', !shouldOpen);
  dom.btnRefreshMenu.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
}

export function syncRefreshControls() {
  const canRefreshCurrentSet = Boolean(isSignedIn() && state.currentSet?.setId);
  if (dom.refresh) dom.refresh.disabled = !canRefreshCurrentSet;
  if (dom.btnRefreshMenu) dom.btnRefreshMenu.disabled = !canRefreshCurrentSet;
  if (!canRefreshCurrentSet) {
    setRefreshMenuOpen(false);
  }
}

export function resetRuntimeUiForSpreadsheetSwitch() {
  try {
    state.searchAbortController?.abort?.();
  } catch (err) {
    console.warn('[resetRuntimeUiForSpreadsheetSwitch] abort search failed:', err);
  }

  if (state.autoImportRefreshTimer) {
    clearTimeout(state.autoImportRefreshTimer);
    state.autoImportRefreshTimer = null;
  }

  Object.assign(state, createSpreadsheetSwitchStatePatch(state));
  cache.clear();
  uiState.focusedCardIndex = -1;

  actions.syncSetNavLink(null);
  dom.cards.innerHTML = '';
  dom.searchResults.innerHTML = '<p class="empty-state">Bitte neue Suche starten.</p>';
  dom.setLogoWrap.classList.add('hidden');
  dom.statsSection.classList.add('hidden');
  dom.filterSection.classList.add('hidden');
  dom.sortSection.classList.add('hidden');
  dom.cardSort.value = 'number';

  document.querySelectorAll('.filter-btn').forEach((button) => button.classList.remove('active'));
  document.querySelector('.filter-btn[data-filter="all"]')?.classList.add('active');

  renderAuditPanel();
  updateUndoUi();
  updateSaveStatePill();
  setEmptyState(true);
}
