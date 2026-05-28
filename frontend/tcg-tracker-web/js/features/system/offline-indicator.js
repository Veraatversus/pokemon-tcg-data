export function createOfflineIndicatorController({
  CONFIG,
  isSignedIn,
  showToast,
  documentRef = document,
  windowRef = window,
} = {}) {
  let initialized = false;

  const connectivityState = {
    browserOnline: navigator.onLine,
    appOnline: null,
    checking: false,
    lastError: null,
    pollTimer: null,
  };

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
    const banner = documentRef.getElementById('offline-banner');

    const offline = connectivityState.appOnline === false
      || (connectivityState.appOnline == null && !connectivityState.browserOnline);

    if (banner) banner.classList.toggle('visible', offline);
    documentRef.body.classList.toggle('is-offline', offline);
  }

  async function probeAppConnectivity(options = {}) {
    const silent = options.silent !== false;
    connectivityState.browserOnline = navigator.onLine;

    if (connectivityState.checking) return connectivityState.appOnline;
    if (!isSignedIn()) {
      connectivityState.appOnline = connectivityState.browserOnline;
      connectivityState.lastError = null;
      renderOfflineIndicator();
      return connectivityState.appOnline;
    }

    const sheetsGet = globalThis.gapi?.client?.sheets?.spreadsheets?.get;
    if (!CONFIG.SPREADSHEET_ID || !sheetsGet) {
      connectivityState.appOnline = connectivityState.browserOnline;
      renderOfflineIndicator();
      return connectivityState.appOnline;
    }

    connectivityState.checking = true;
    try {
      await sheetsGet({
        spreadsheetId: CONFIG.SPREADSHEET_ID,
        fields: 'spreadsheetId',
      });
      const wasOffline = connectivityState.appOnline === false;
      connectivityState.appOnline = true;
      connectivityState.lastError = null;
      renderOfflineIndicator();
      if (!silent && wasOffline) {
        showToast('Verbindung zu Google Sheets wiederhergestellt', 'success', 2500);
      }
    } catch (err) {
      connectivityState.lastError = err;
      if (isOfflineLikeError(err)) {
        const wasOnline = connectivityState.appOnline !== false;
        connectivityState.appOnline = false;
        renderOfflineIndicator();
        if (!silent && wasOnline) {
          showToast('Keine Verbindung zu Google Sheets. Gespeicherte Daten werden angezeigt.', 'info', 3500);
        }
      } else {
        connectivityState.appOnline = true;
        renderOfflineIndicator();
      }
    } finally {
      connectivityState.checking = false;
    }

    return connectivityState.appOnline;
  }

  function initOfflineIndicator() {
    if (initialized) return;
    initialized = true;

    windowRef.addEventListener('online', () => {
      connectivityState.browserOnline = true;
      probeAppConnectivity({ silent: false });
    });

    windowRef.addEventListener('offline', () => {
      connectivityState.browserOnline = false;
      probeAppConnectivity({ silent: false });
    });

    renderOfflineIndicator();
    probeAppConnectivity({ silent: true });

    clearInterval(connectivityState.pollTimer);
    connectivityState.pollTimer = setInterval(() => {
      probeAppConnectivity({ silent: true });
    }, 30000);
  }

  return {
    initOfflineIndicator,
  };
}
