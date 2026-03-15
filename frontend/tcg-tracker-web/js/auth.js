import { CONFIG, scopedStorageKey } from './config.js';

const STORAGE_KEY = scopedStorageKey('tcg_tracker_token');

let tokenClient = null;
let accessToken = null;
let gapiInited = false;
let gisInited = false;

// ── GAPI helpers ──────────────────────────────────────────────────────────────

const GAPI_TIMEOUT_MS = 10000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForGlobal(check, label, timeoutMs = 15000, intervalMs = 100) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (check()) return true;
    await sleep(intervalMs);
  }
  throw new Error(`${label} nicht verfügbar nach ${timeoutMs}ms`);
}

function gapiLoadClient() {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('gapi.load client timeout after ' + GAPI_TIMEOUT_MS + 'ms'));
    }, GAPI_TIMEOUT_MS);

    try {
      const gapiRef = globalThis.gapi;
      if (!gapiRef || !gapiRef.load) {
        clearTimeout(timeout);
        throw new Error('gapi or gapi.load not available');
      }

      console.log('[gapiLoadClient] calling gapi.load...');
      gapiRef.load('client', () => {
        clearTimeout(timeout);
        try {
          console.log('[gapiLoadClient] gapi.load callback fired');
          gapiRef.client.init({}).then(() => {
            console.log('[gapiLoadClient] gapi.client.init success');
            resolve();
          }).catch((error) => {
            console.error('[gapiLoadClient init error]', error);
            reject(error);
          });
        } catch (error) {
          console.error('[gapiLoadClient callback]', error);
          reject(error);
        }
      });
    } catch (err) {
      clearTimeout(timeout);
      console.error('[gapiLoadClient setup]', err);
      reject(err);
    }
  });
}
/** Lädt die Sheets-Discovery-Docs und setzt den gespeicherten Token in den Client. */
export async function loadDiscoveryDocs() {
  try {
    await globalThis.gapi.client.load(CONFIG.DISCOVERY_DOCS[0]);
  } catch (err) {
    console.error('[loadDiscoveryDocs]', err);
    // Falls Discovery fehlschlägt, trotzdem weitermachen – API funktioniert ohne auch
    throw err;
  }
}

// ── Token-Persistenz (localStorage) ──────────────────────────────────────────

function saveToken(tokenResponse) {
  const expiresIn = parseInt(tokenResponse.expires_in ?? 3600, 10);
  const data = {
    token: tokenResponse.access_token,
    expires_at: Date.now() + expiresIn * 1000 - 60_000  // 1 Min. Puffer
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  accessToken = tokenResponse.access_token;
  globalThis.gapi?.client?.setToken(tokenResponse);
}

function clearToken() {
  localStorage.removeItem(STORAGE_KEY);
  accessToken = null;
  globalThis.gapi?.client?.setToken(null);
}

/** Versucht einen gespeicherten Token zu laden. Gibt true zurück wenn erfolgreich. */
async function tryRestoreToken() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data?.token || !data?.expires_at) return false;
    if (Date.now() >= data.expires_at) {
      localStorage.removeItem(STORAGE_KEY);
      return false;
    }
    accessToken = data.token;
    globalThis.gapi?.client?.setToken({ access_token: data.token });
    try {
      await loadDiscoveryDocs();
    } catch (err) {
      console.warn('[tryRestoreToken] Discovery load failed but continuing', err);
    }
    return true;
  } catch (err) {
    console.error('[tryRestoreToken]', err);
    return false;
  }
}

// ── Öffentliche API ───────────────────────────────────────────────────────────

/**
 * Initialisiert GAPI und GIS. Versucht anschließend, den gespeicherten Token
 * automatisch wiederherzustellen (Auto-Login).
 * @returns {Promise<boolean>} true wenn Auto-Login erfolgreich war
 */
export async function initAuth() {
  try {
    console.log('[initAuth] start');
    console.log('[initAuth] checking globals:', {
      gapi: typeof gapi !== 'undefined',
      google: typeof google !== 'undefined'
    });
    
    await waitForGlobal(() => Boolean(globalThis.gapi?.load), 'gapi.load');
    console.log('[initAuth] loading gapi.client...');
    await gapiLoadClient();
    console.log('[initAuth] gapi.client loaded');
    gapiInited = true;

    console.log('[initAuth] initializing gis tokenClient...');
    await waitForGlobal(() => Boolean(globalThis.google?.accounts?.oauth2), 'google.accounts.oauth2');
    tokenClient = globalThis.google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.GOOGLE_CLIENT_ID,
      scope: CONFIG.SCOPES,
      callback: () => {}  // wird pro Request überschrieben
    });
    console.log('[initAuth] tokenClient created');
    gisInited = true;

    console.log('[initAuth] attempting restore from localStorage...');
    const restored = await tryRestoreToken();
    console.log('[initAuth] restore result:', restored);
    console.log('[initAuth] complete');
    return restored;
  } catch (err) {
    console.error('[initAuth] failed:', err);
    throw err;
  }
}
/**
 * Öffnet den OAuth-Consent-Dialog (nur wenn nicht schon angemeldet).
 * @returns {Promise<boolean>}
 */
export function signIn() {
  if (!gapiInited || !gisInited) return Promise.resolve(false);
  return new Promise((resolve) => {
    tokenClient.callback = async (response) => {
      if (response.error) {
        console.error('[signIn callback] error:', response.error);
        resolve(false);
        return;
      }
      try {
        saveToken(response);
        try {
          await loadDiscoveryDocs();
        } catch (discErr) {
          console.warn('[signIn] Discovery load failed, continuing:', discErr);
        }
        resolve(true);
      } catch (err) {
        console.error('[signIn]', err);
        resolve(false);
      }
    };
    tokenClient.requestAccessToken({ prompt: accessToken ? '' : 'consent' });
  });
}

/** Widerruft den Token und löscht alle gespeicherten Daten. */
export function signOut() {
  if (accessToken && globalThis.google?.accounts?.oauth2?.revoke) {
    globalThis.google.accounts.oauth2.revoke(accessToken, () => {});
  }
  clearToken();
}

/** @returns {boolean} */
export function isSignedIn() {
  return Boolean(accessToken);
}
