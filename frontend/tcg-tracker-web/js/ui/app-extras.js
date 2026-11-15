// Zusatzfunktionen der App-Oberflaeche: Offline-Indikator, Hover-Preview, Set-Completion-Feier,
// Shortcut-Uebersicht, Sammlung teilen sowie Auswahl-Dropdowns und automatisch einklappende Topbar.
import { isSignedIn } from '../core/auth.js';
import { CONFIG } from '../core/config.js';
import { dom } from '../app/dom.js';
import { state } from '../app/state.js';
import { showToast, closeOtherOpenDialogs } from './helpers.js';

const _featureInitFlags = {
  offline: false,
  hoverPreview: false,
  shortcuts: false,
  share: false,
};

const _connectivityState = {
  browserOnline: navigator.onLine,
  appOnline: null,
  checking: false,
  lastError: null,
  pollTimer: null
};

// --------------------------------------------------------------------------
// FEATURE 3: Offline-Status-Indikator
// --------------------------------------------------------------------------
function isOfflineLikeError(err) {
  const status = Number(err?.status || err?.result?.error?.code || 0);
  if (status === 0) return true;

  const message = String(err?.result?.error?.message || err?.message || '').toLowerCase();
  if (!message) return false;

  return message.includes('failed to fetch')
    || message.includes('network')
    || message.includes('offline')
    || message.includes('timeout')
    || message.includes('unreachable')
    || message.includes('load failed');
}

function renderOfflineIndicator() {
  const banner = document.getElementById('offline-banner');

  const offline = _connectivityState.appOnline === false
    || (_connectivityState.appOnline == null && !_connectivityState.browserOnline);

  if (banner) banner.classList.toggle('visible', offline);
  document.body.classList.toggle('is-offline', offline);
}

async function probeAppConnectivity(options = {}) {
  const silent = options.silent !== false;
  _connectivityState.browserOnline = navigator.onLine;

  if (_connectivityState.checking) return _connectivityState.appOnline;
  if (!isSignedIn()) {
    _connectivityState.appOnline = _connectivityState.browserOnline;
    _connectivityState.lastError = null;
    renderOfflineIndicator();
    return _connectivityState.appOnline;
  }

  if (!CONFIG.SPREADSHEET_ID || !globalThis.gapi?.client?.sheets?.spreadsheets?.get) {
    _connectivityState.appOnline = _connectivityState.browserOnline;
    renderOfflineIndicator();
    return _connectivityState.appOnline;
  }

  _connectivityState.checking = true;
  try {
    await globalThis.gapi.client.sheets.spreadsheets.get({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      fields: 'spreadsheetId'
    });
    const wasOffline = _connectivityState.appOnline === false;
    _connectivityState.appOnline = true;
    _connectivityState.lastError = null;
    renderOfflineIndicator();
    if (!silent && wasOffline) {
      showToast('Verbindung zu Google Sheets wiederhergestellt', 'success', 2500);
    }
  } catch (err) {
    _connectivityState.lastError = err;
    if (isOfflineLikeError(err)) {
      const wasOnline = _connectivityState.appOnline !== false;
      _connectivityState.appOnline = false;
      renderOfflineIndicator();
      if (!silent && wasOnline) {
        showToast('Keine Verbindung zu Google Sheets - gespeicherte Daten werden angezeigt', 'info', 3500);
      }
    } else {
      // Auth/config problems are not the same as offline mode.
      _connectivityState.appOnline = true;
      renderOfflineIndicator();
    }
  } finally {
    _connectivityState.checking = false;
  }

  return _connectivityState.appOnline;
}

export function initOfflineIndicator() {
  if (_featureInitFlags.offline) return;
  _featureInitFlags.offline = true;

  window.addEventListener('online', () => {
    _connectivityState.browserOnline = true;
    probeAppConnectivity({ silent: false });
  });

  window.addEventListener('offline', () => {
    _connectivityState.browserOnline = false;
    probeAppConnectivity({ silent: false });
  });

  renderOfflineIndicator();
  probeAppConnectivity({ silent: true });

  clearInterval(_connectivityState.pollTimer);
  _connectivityState.pollTimer = setInterval(() => {
    probeAppConnectivity({ silent: true });
  }, 30000);
}

// --------------------------------------------------------------------------
// FEATURE 4: Set-Card Hover-Preview
// --------------------------------------------------------------------------
export function initDashboardHoverPreview() {
  if (_featureInitFlags.hoverPreview) return;
  _featureInitFlags.hoverPreview = true;

  const tip = document.getElementById('dash-hover-tip');
  if (tip) {
    tip.classList.add('hidden');
    tip.remove();
  }
}

// --------------------------------------------------------------------------
// FEATURE 5: Set-Completion Celebration
// --------------------------------------------------------------------------
function triggerCompletionCelebration(setId, cardEl) {
  const setName = cardEl.querySelector('.dash-set-name')?.textContent || setId;
  showToast(`${setName} vollstaendig gesammelt!`, 'success', 5000);

  if (window.confetti) {
    const rect = cardEl.getBoundingClientRect();
    const x = (rect.left + rect.width / 2) / window.innerWidth;
    const y = (rect.top + rect.height / 2) / window.innerHeight;
    window.confetti({
      particleCount: 120,
      spread: 75,
      origin: { x, y },
      colors: ['#f59e0b', '#ef4444', '#3b82f6', '#22c55e', '#8b5cf6', '#ec4899']
    });
  }

  cardEl.classList.add('complete-celebrate');
  cardEl.addEventListener('animationend', () => cardEl.classList.remove('complete-celebrate'), { once: true });
}

export function checkSetCompletion(setId, percent, cardEl) {
  if (!setId) return;
  const storageKey = `completed_set_${setId}`;
  if (percent < 100) {
    localStorage.removeItem(storageKey);
    return;
  }
  if (localStorage.getItem(storageKey)) return;
  localStorage.setItem(storageKey, '1');
  const delay = state.devCompletionMode ? 40 : 450;
  setTimeout(() => triggerCompletionCelebration(setId, cardEl), delay);
}

// --------------------------------------------------------------------------
// FEATURE 8: Keyboard-Shortcuts Overlay
// --------------------------------------------------------------------------
const KEYBOARD_SHORTCUTS = [
  ['D', 'Dashboard oeffnen'],
  ['S', 'Set-Ansicht oeffnen'],
  ['T', 'Statistiken oeffnen'],
  ['/', 'Suche fokussieren'],
  ['? / ?', 'Karte navigieren'],
  ['Leertaste', 'Normal (G) togglen'],
  ['R', 'Reverse Holo (RH) togglen'],
  ['I', 'Kartendetails / Bild-Zoom'],
  ['Cmd/Strg K', 'Command Palette oeffnen'],
  ['?', 'Diese Shortcut-Uebersicht'],
  ['Esc', 'Dialog / Overlay schliessen'],
];

function showShortcutsOverlay() {
  const existing = document.getElementById('shortcuts-overlay');
  if (existing) {
    existing.remove();
    return;
  }

  const overlay = document.createElement('div');
  overlay.id = 'shortcuts-overlay';
  overlay.className = 'shortcuts-overlay';
  overlay.innerHTML = `
    <div class="shortcuts-panel" role="dialog" aria-modal="true" aria-label="Keyboard Shortcuts">
      <h2>Keyboard Shortcuts</h2>
      <p>Tippe ausserhalb von Eingabefeldern</p>
      <table class="shortcut-table">
        <tbody>
          ${KEYBOARD_SHORTCUTS.map(([key, desc]) => `
            <tr>
              <td><span class="shortcut-key">${key}</span></td>
              <td class="shortcut-desc">${desc}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <p class="shortcuts-close-hint">Esc oder ? oder Klick ausserhalb zum Schliessen</p>
    </div>
  `;

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) overlay.remove();
  });

  document.body.appendChild(overlay);
}

export function initShortcutsOverlay() {
  if (_featureInitFlags.shortcuts) return;
  _featureInitFlags.shortcuts = true;

  window.addEventListener('keydown', (event) => {
    if (event.target?.matches?.('input, textarea, select, [contenteditable]')) return;
    const isQuestionShortcut = event.key === '?' || (event.key === '/' && event.shiftKey) || (event.code === 'Slash' && event.shiftKey);
    if (isQuestionShortcut) {
      event.preventDefault();
      showShortcutsOverlay();
      return;
    }
    if (event.key === 'Escape') {
      document.getElementById('shortcuts-overlay')?.remove();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    switch (event.key.toLowerCase()) {
      case 'd':
        event.preventDefault();
        location.hash = '#dashboard';
        break;
      case 's': {
        event.preventDefault();
        const lastSet = state?.currentSet?.setId || sessionStorage.getItem('tcg_last_set');
        location.hash = lastSet ? `#set/${lastSet}` : '#dashboard';
        break;
      }
      case 't':
        event.preventDefault();
        location.hash = '#stats';
        break;
      case '/':
        event.preventDefault();
        location.hash = '#search';
        // Route-Render kann asynchron sein: mehrfach versuchen, dann sinnvollen Fallback nutzen.
        {
          const focusSearchInput = () => {
            const searchInput = document.getElementById('search-input');
            const viewSearch = document.getElementById('view-search');
            const searchVisible = !!(viewSearch && !viewSearch.classList.contains('hidden'));
            if (searchInput && searchVisible) {
              searchInput.focus();
              return true;
            }
            return false;
          };

          let tries = 0;
          const maxTries = 8;
          const tick = () => {
            if (focusSearchInput()) return;
            tries += 1;
            if (tries < maxTries) {
              setTimeout(tick, 80);
              return;
            }
            // Fallback (z.B. nicht eingeloggt): Dashboard-Suche fokussieren.
            document.getElementById('dash-filter')?.focus();
          };
          setTimeout(tick, 0);
        }
        break;
    }
  });
}

// --------------------------------------------------------------------------
// FEATURE 9: Sammlung teilen (ShareURL)
// --------------------------------------------------------------------------
export function initShareButton() {
  if (_featureInitFlags.share) return;
  _featureInitFlags.share = true;

  const btn = document.getElementById('btn-share');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const ssid = CONFIG.SPREADSHEET_ID || '';
    const shareUrl = new URL(location.href);
    shareUrl.hash = '#dashboard';
    shareUrl.searchParams.delete('ssid');
    shareUrl.searchParams.delete('share');
    shareUrl.searchParams.delete('nocache');
    shareUrl.searchParams.delete('t');
    if (ssid) shareUrl.searchParams.set('ssid', ssid);
    showShareDialog(shareUrl.toString());
  });

  const ssidFromUrl = new URLSearchParams(location.search).get('ssid');
  if (ssidFromUrl && ssidFromUrl.length > 10 && !CONFIG.SPREADSHEET_ID) {
    sessionStorage.setItem('tcg_pending_ssid', ssidFromUrl);
  }
}

function showShareDialog(url) {
  const existing = document.getElementById('dialog-share');
  if (existing) {
    closeOtherOpenDialogs([existing]);
    existing.showModal();
    return;
  }

  const dialog = document.createElement('dialog');
  dialog.id = 'dialog-share';
  dialog.className = 'ss-dialog share-dialog';
  dialog.innerHTML = `
    <h2>Sammlung teilen</h2>
    <p>Der Link enthält deine Spreadsheet-ID und funktioniert für Personen mit Zugriff auf dein Sheet.</p>
    <div class="share-url-wrap">
      <input class="share-url-input" type="text" readonly value="${url.replace(/"/g, '&quot;')}" />
      <button class="share-copy-btn" type="button">Link kopieren</button>
    </div>
    <div class="dialog-actions">
      <button class="btn-secondary" type="button" onclick="this.closest('dialog').close()">Schließen</button>
    </div>
  `;

  dialog.querySelector('.share-copy-btn').addEventListener('click', async () => {
    const input = dialog.querySelector('.share-url-input');
    try {
      await navigator.clipboard.writeText(input.value);
    } catch (_) {
      input.select();
      document.execCommand('copy');
    }
    showToast('Link kopiert!', 'success', 2500);
  });

  dialog.addEventListener('close', () => dialog.remove());
  document.body.appendChild(dialog);
  closeOtherOpenDialogs([dialog]);
  dialog.showModal();
}

// --------------------------------------------------------------------------
// AUSWAHL-DROPDOWNS UND TOPBAR (frueher js/views/set-view.js)
// --------------------------------------------------------------------------
export function initCustomSelects() {
  const nativeSelects = Array.from(document.querySelectorAll('select'));
  if (!nativeSelects.length) return;

  const closeAll = (except = null) => {
    document.querySelectorAll('.custom-select.is-open').forEach((node) => {
      if (node !== except) {
        node.classList.remove('is-open');
        node.querySelector('.custom-select-trigger')?.setAttribute('aria-expanded', 'false');
      }
    });
  };

  const applyTriggerSelectionState = (button, selectedNode = null) => {
    const isNotImported = selectedNode?.dataset.imported === 'false';
    button.classList.toggle('is-not-imported', isNotImported);
    if (isNotImported) button.dataset.imported = 'false';
    else button.removeAttribute('data-imported');
  };

  const createOptionNode = ({ option, select, list, button, root }) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'custom-select-option';
    item.dataset.value = option.value;
    const isNotImported = option.dataset.imported === 'false';
    const rawLabel = option.textContent?.trim() || '';
    const visibleLabel = isNotImported
      ? rawLabel.replace(/\s*[-]\s*noch nicht importiert$/i, '').trim()
      : rawLabel;
    item.textContent = visibleLabel || rawLabel;
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', String(option.selected));

    if (option.dataset.imported) item.dataset.imported = option.dataset.imported;
    if (isNotImported) {
      item.classList.add('is-not-imported');
      item.title = 'Noch nicht importiert';
    }

    if (option.disabled) {
      item.disabled = true;
      item.classList.add('is-disabled');
    }

    if (option.selected) {
      item.classList.add('is-selected');
      button.textContent = item.textContent;
      applyTriggerSelectionState(button, item);
    }

    item.addEventListener('click', () => {
      if (option.disabled) return;
      select.value = option.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      root.classList.remove('is-open');
      button.focus();
    });

    list.appendChild(item);
  };

  nativeSelects.forEach((select) => {
    if (select.closest('.custom-select')) return;
    if (select.dataset.customized === 'true') return;

    select.dataset.customized = 'true';
    select.classList.add('cs-native');

    const root = document.createElement('div');
    root.className = 'custom-select';
    if (select.className) {
      select.className.split(' ').filter(Boolean).forEach((klass) => root.classList.add(`from-${klass}`));
    }
    if (select.id) root.classList.add(`from-id-${select.id}`);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'custom-select-trigger';
    button.setAttribute('aria-haspopup', 'listbox');
    button.setAttribute('aria-expanded', 'false');
    button.disabled = select.disabled;

    const list = document.createElement('div');
    list.className = 'custom-select-list';
    list.setAttribute('role', 'listbox');

    const rebuild = () => {
      list.innerHTML = '';
      button.textContent = '';
      const options = Array.from(select.options);
      options.forEach((option) => createOptionNode({ option, select, list, button, root }));
      if (!button.textContent) {
        const selectedOption = options.find((option) => option.selected) || options[0];
        button.textContent = selectedOption?.textContent?.trim() || 'Auswaehlen...';
      }
      button.disabled = select.disabled;
      root.classList.toggle('is-disabled', Boolean(select.disabled));
    };

    const syncSelectionState = () => {
      const selectedValue = select.value;
      let selectedNode = null;
      list.querySelectorAll('.custom-select-option').forEach((optionNode) => {
        const isSelected = optionNode.dataset.value === selectedValue;
        optionNode.classList.toggle('is-selected', isSelected);
        optionNode.setAttribute('aria-selected', String(isSelected));
        if (isSelected) {
          selectedNode = optionNode;
          button.textContent = optionNode.textContent || 'Auswaehlen...';
        }
      });
      applyTriggerSelectionState(button, selectedNode);
      button.disabled = select.disabled;
      root.classList.toggle('is-disabled', Boolean(select.disabled));
    };

    const toggleDropdownOpen = () => {
      if (button.disabled) return;
      const shouldOpen = !root.classList.contains('is-open');
      closeAll(root);
      root.classList.toggle('is-open', shouldOpen);
      button.setAttribute('aria-expanded', String(shouldOpen));
      if (shouldOpen) {
        const selectedNode = list.querySelector('.custom-select-option.is-selected');
        if (selectedNode) {
          const optionTop = selectedNode.offsetTop;
          const optionBottom = optionTop + selectedNode.offsetHeight;
          const viewTop = list.scrollTop;
          const viewBottom = viewTop + list.clientHeight;
          if (optionTop < viewTop) list.scrollTop = optionTop;
          else if (optionBottom > viewBottom) list.scrollTop = optionBottom - list.clientHeight;
        }
      }
    };

    button.addEventListener('click', (event) => {
      if (button.disabled) return;
      event.preventDefault();
      toggleDropdownOpen();
    });

    button.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        root.classList.remove('is-open');
        button.setAttribute('aria-expanded', 'false');
      }
      if ((event.key === 'Enter' || event.key === ' ') && !root.classList.contains('is-open')) {
        event.preventDefault();
        toggleDropdownOpen();
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const enabled = Array.from(select.options).filter((option) => !option.disabled);
        if (!enabled.length) return;
        const currentIndex = enabled.findIndex((option) => option.value === select.value);
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        const nextIndex = currentIndex < 0
          ? 0
          : (currentIndex + delta + enabled.length) % enabled.length;
        select.value = enabled[nextIndex].value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    select.addEventListener('change', syncSelectionState);

    const observer = new MutationObserver(() => {
      rebuild();
      syncSelectionState();
    });
    observer.observe(select, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['disabled', 'selected', 'label', 'value']
    });

    select.parentNode?.insertBefore(root, select);
    root.appendChild(select);
    root.appendChild(button);
    root.appendChild(list);
    rebuild();
    syncSelectionState();
  });

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) {
      closeAll();
      return;
    }
    if (!event.target.closest('.custom-select')) {
      closeAll();
      document.querySelectorAll('.custom-select-trigger[aria-expanded="true"]').forEach((button) => {
        button.setAttribute('aria-expanded', 'false');
      });
    }
  });

  window.addEventListener('scroll', () => {
    closeAll();
  }, { passive: true });
}

export function initAutoHideTopbar() {
  const topbar = dom.topbar || document.querySelector('.topbar');
  if (!topbar) return;

  const root = document.documentElement;
  const body = document.body;
  const hideClass = 'topbar-collapsed';
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const scroller = document.scrollingElement || document.documentElement;
  const getScrollY = () => Math.max(
    window.scrollY || 0,
    scroller?.scrollTop || 0,
    document.documentElement?.scrollTop || 0,
    document.body?.scrollTop || 0
  );

  let lastY = Math.max(getScrollY(), 0);
  let dir = 0;
  let accumulated = 0;
  let ticking = false;
  let visibilityLockedUntil = 0;

  const syncTopbarHeight = () => {
    root.style.setProperty('--topbar-height', `${topbar.offsetHeight}px`);
  };

  const showTopbar = () => {
    body.classList.remove(hideClass);
    visibilityLockedUntil = Date.now() + 180;
  };

  const hideTopbar = () => {
    body.classList.add(hideClass);
    visibilityLockedUntil = Date.now() + 180;
  };

  const onScrollFrame = () => {
    ticking = false;
    const currentY = Math.max(getScrollY(), 0);
    const delta = currentY - lastY;
    const isNearTop = currentY < 88;
    const now = Date.now();

    if (reducedMotion) {
      showTopbar();
      lastY = currentY;
      return;
    }

    if (isNearTop) {
      showTopbar();
      dir = 0;
      accumulated = 0;
      lastY = currentY;
      return;
    }

    if (Math.abs(delta) < 1) {
      lastY = currentY;
      return;
    }

    if (now < visibilityLockedUntil) {
      lastY = currentY;
      return;
    }

    const nextDir = delta > 0 ? 1 : -1;
    if (nextDir === dir) {
      accumulated += Math.abs(delta);
    } else {
      dir = nextDir;
      accumulated = Math.abs(delta);
    }

    if (dir > 0 && accumulated > 36 && currentY > 120) {
      hideTopbar();
      accumulated = 0;
    } else if (dir < 0 && accumulated > 18) {
      showTopbar();
      accumulated = 0;
    }

    lastY = currentY;
  };

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(onScrollFrame);
  };

  syncTopbarHeight();
  showTopbar();
  window.addEventListener('resize', syncTopbarHeight, { passive: true });
  window.addEventListener('orientationchange', syncTopbarHeight, { passive: true });
  window.addEventListener('hashchange', showTopbar, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true });
}
