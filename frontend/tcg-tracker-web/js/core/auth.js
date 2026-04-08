import { CONFIG, scopedStorageKey } from './config.js';

const STORAGE_KEY = scopedStorageKey('tcg_tracker_token');
const REDIRECT_STATE_KEY = scopedStorageKey('oauth_redirect_state');
const AUTO_LOGIN_KEY = scopedStorageKey('tcg_tracker_auto_login');

let tokenClient = null;
let accessToken = null;
let gapiInited = false;
let gisInited = false;
let signInPromise = null;

// ── GAPI helpers ──────────────────────────────────────────────────────────────

const GAPI_TIMEOUT_MS = 10000;
const SIGN_IN_TIMEOUT_MS = 180000;

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
    for (const doc of CONFIG.DISCOVERY_DOCS) {
      await globalThis.gapi.client.load(doc);
    }
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
  localStorage.setItem(AUTO_LOGIN_KEY, '1');
  accessToken = tokenResponse.access_token;
  globalThis.gapi?.client?.setToken(tokenResponse);
}

function clearToken(options = {}) {
  const clearPersistentLogin = Boolean(options?.clearPersistentLogin);
  localStorage.removeItem(STORAGE_KEY);
  if (clearPersistentLogin) localStorage.removeItem(AUTO_LOGIN_KEY);
  accessToken = null;
  globalThis.gapi?.client?.setToken(null);
}

function shouldAttemptAutoLogin() {
  return localStorage.getItem(AUTO_LOGIN_KEY) === '1';
}

function buildRedirectOAuthUrl(forceConsent = false) {
  const redirectUri = `${location.origin}${location.pathname}`;
  const state = `oauth-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  sessionStorage.setItem(REDIRECT_STATE_KEY, state);

  const prompt = forceConsent
    ? 'consent'
    : (shouldAttemptAutoLogin() || accessToken ? '' : 'select_account');

  const params = new URLSearchParams({
    client_id: CONFIG.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'token',
    scope: CONFIG.SCOPES,
    include_granted_scopes: 'true',
    state,
    prompt
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

function consumeRedirectTokenIfPresent() {
  if (!location.hash || !location.hash.includes('access_token=')) return null;

  const hashParams = new URLSearchParams(location.hash.slice(1));
  const token = hashParams.get('access_token');
  const expiresIn = Number(hashParams.get('expires_in') || '3600');
  const returnedState = hashParams.get('state');
  const expectedState = sessionStorage.getItem(REDIRECT_STATE_KEY);

  // OAuth-Hash aus URL entfernen, damit Reloads sauber bleiben.
  history.replaceState({}, document.title, `${location.pathname}${location.search}`);

  if (!token) return null;
  if (expectedState && returnedState && expectedState !== returnedState) {
    console.warn('[auth redirect] state mismatch, continue with token');
  }

  sessionStorage.removeItem(REDIRECT_STATE_KEY);
  return {
    access_token: token,
    expires_in: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600
  };
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

async function trySilentSignIn() {
  if (!gapiInited || !gisInited || !tokenClient || !shouldAttemptAutoLogin()) return false;

  return new Promise((resolve) => {
    let finished = false;
    const finish = (result) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      tokenClient.callback = () => {};
      tokenClient.error_callback = undefined;
      resolve(Boolean(result));
    };

    const timeout = setTimeout(() => {
      console.warn('[trySilentSignIn] timed out');
      finish(false);
    }, 12000);

    tokenClient.callback = async (response) => {
      if (response?.error) {
        console.warn('[trySilentSignIn] callback error:', response.error);
        finish(false);
        return;
      }
      try {
        saveToken(response);
        try {
          await loadDiscoveryDocs();
        } catch (discErr) {
          console.warn('[trySilentSignIn] Discovery load failed, continuing:', discErr);
        }
        finish(true);
      } catch (err) {
        console.error('[trySilentSignIn]', err);
        finish(false);
      }
    };

    tokenClient.error_callback = (error) => {
      console.warn('[trySilentSignIn] error_callback:', error);
      finish(false);
    };

    try {
      tokenClient.requestAccessToken({ prompt: '' });
    } catch (err) {
      console.warn('[trySilentSignIn requestAccessToken]', err);
      finish(false);
    }
  });
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
      ux_mode: 'popup',
      callback: () => {}  // wird pro Request überschrieben
    });
    console.log('[initAuth] tokenClient created');
    gisInited = true;

    const redirectToken = consumeRedirectTokenIfPresent();
    if (redirectToken) {
      console.log('[initAuth] consumed redirect token');
      saveToken(redirectToken);
      try {
        await loadDiscoveryDocs();
      } catch (discErr) {
        console.warn('[initAuth] Discovery load failed after redirect token:', discErr);
      }
      return true;
    }

    console.log('[initAuth] attempting restore from localStorage...');
    const restored = await tryRestoreToken();
    console.log('[initAuth] restore result:', restored);
    if (restored) {
      console.log('[initAuth] complete');
      return true;
    }

    if (shouldAttemptAutoLogin()) {
      console.log('[initAuth] attempting silent reauth...');
      const silentlyReauthed = await trySilentSignIn();
      console.log('[initAuth] silent reauth result:', silentlyReauthed);
      console.log('[initAuth] complete');
      return silentlyReauthed;
    }

    console.log('[initAuth] complete');
    return false;
  } catch (err) {
    console.error('[initAuth] failed:', err);
    throw err;
  }
}
/**
 * Öffnet den OAuth-Consent-Dialog (nur wenn nicht schon angemeldet).
 * @returns {Promise<boolean>}
 */
export function signIn(options = {}) {
  const forceConsent = Boolean(options?.forceConsent);
  if (!gapiInited || !gisInited || !tokenClient) return Promise.resolve(false);
  if (signInPromise) return signInPromise;

  signInPromise = new Promise((resolve) => {
    let finished = false;
    const finish = (result) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      signInPromise = null;
      tokenClient.callback = () => {};
      tokenClient.error_callback = undefined;
      resolve(Boolean(result));
    };

    const timeout = setTimeout(() => {
      console.warn(`[signIn] popup flow timed out after ${SIGN_IN_TIMEOUT_MS}ms; same-window fallback remains disabled`);
      finish(false);
    }, SIGN_IN_TIMEOUT_MS);

    tokenClient.callback = async (response) => {
      if (response?.error) {
        console.error('[signIn callback] error:', response.error);
        finish(false);
        return;
      }
      try {
        saveToken(response);
        try {
          await loadDiscoveryDocs();
        } catch (discErr) {
          console.warn('[signIn] Discovery load failed, continuing:', discErr);
        }
        finish(true);
      } catch (err) {
        console.error('[signIn]', err);
        finish(false);
      }
    };

    tokenClient.error_callback = (error) => {
      const reason = error?.type || 'error_callback';
      console.error('[signIn error_callback]', error);
      console.warn('[signIn] popup-only flow aborted:', reason);
      finish(false);
    };

    try {
      const prompt = forceConsent
        ? 'consent'
        : (shouldAttemptAutoLogin() || accessToken ? '' : 'select_account');
      tokenClient.requestAccessToken({ prompt });
    } catch (err) {
      console.error('[signIn requestAccessToken]', err);
      finish(false);
    }
  });

  return signInPromise;
}

/** Widerruft den Token und löscht alle gespeicherten Daten. */
export function signOut() {
  if (accessToken && globalThis.google?.accounts?.oauth2?.revoke) {
    globalThis.google.accounts.oauth2.revoke(accessToken, () => {});
  }
  clearToken({ clearPersistentLogin: true });
}

/** @returns {boolean} */
export function isSignedIn() {
  return Boolean(accessToken);
}
