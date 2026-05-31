import { scopedStorageKey } from '../../core/config.js';
import { CACHE_INVALIDATION_KEY_PREFIX } from '../../core/storage-keys.js';

export const SETTINGS_RESET_ACTIONS = {
  SEARCH_HISTORY: 'reset-search-history',
  FAVORITES: 'reset-favorites',
  SETTINGS: 'reset-settings',
  SYNC_STATUS: 'reset-sync-status',
  CACHE: 'reset-cache',
  COOKIES: 'reset-cookies',
  ALL_KEEP_LOGIN: 'reset-all-keep-login',
  ALL_FULL: 'reset-all-full'
};

const BASE_SCOPED_KEYS = [
  'queue_presets_v1',
  'dashboard_prefs_v1',
  'recent_sets_v1',
  'dev_completion_mode',
  'user-settings',
  'search-history',
  'favorites-sets',
  'sync-status'
];

const OPTIONAL_SCOPED_KEYS = {
  authToken: 'tcg_tracker_token',
  authAutoLogin: 'tcg_tracker_auto_login',
  spreadsheetId: 'tcg_spreadsheet_id',
  oauthRedirectState: 'oauth_redirect_state'
};

const BASE_UNSCOPED_KEYS = [
  'gridZoom',
  'runtime_last_write_probe',
  'tcg_tracker:sync:last_sheets_sync',
  'tcg_tracker:sync:last_api_sync'
];

export function getResetLocalStorageKeys({
  scopedStorageKeyFn = scopedStorageKey,
  includeAuthKeys = false,
  includeSpreadsheetKey = false,
} = {}) {
  const scopedKeys = BASE_SCOPED_KEYS.map((key) => scopedStorageKeyFn(key));

  if (includeAuthKeys) {
    scopedKeys.push(scopedStorageKeyFn(OPTIONAL_SCOPED_KEYS.authToken));
    scopedKeys.push(scopedStorageKeyFn(OPTIONAL_SCOPED_KEYS.authAutoLogin));
  }

  if (includeSpreadsheetKey) {
    scopedKeys.push(scopedStorageKeyFn(OPTIONAL_SCOPED_KEYS.spreadsheetId));
  }

  return [...new Set([...scopedKeys, ...BASE_UNSCOPED_KEYS])];
}

export function getOauthRedirectStateKey(scopedStorageKeyFn = scopedStorageKey) {
  return scopedStorageKeyFn(OPTIONAL_SCOPED_KEYS.oauthRedirectState);
}

export function removeLocalStorageKeys(localStorageRef, keys = []) {
  if (!localStorageRef || !Array.isArray(keys) || keys.length === 0) return 0;

  let removed = 0;
  keys.forEach((key) => {
    try {
      localStorageRef.removeItem(String(key));
      removed += 1;
    } catch {
      // Ignore quota/security edge cases during best-effort reset.
    }
  });

  return removed;
}

export function listMatchingLocalStorageKeys(localStorageRef, prefix = CACHE_INVALIDATION_KEY_PREFIX) {
  if (!localStorageRef || typeof localStorageRef.length !== 'number' || !prefix) return [];

  const matches = [];
  for (let i = 0; i < localStorageRef.length; i += 1) {
    const key = localStorageRef.key(i);
    if (!key) continue;
    if (String(key).startsWith(prefix)) {
      matches.push(String(key));
    }
  }
  return matches;
}

export function clearCookiesBestEffort({ documentRef = globalThis.document, domain = globalThis.location?.hostname || '' } = {}) {
  const cookieValue = String(documentRef?.cookie || '').trim();
  if (!cookieValue) return 0;

  const cookieNames = cookieValue
    .split(';')
    .map((entry) => entry.split('=')[0]?.trim())
    .filter(Boolean);

  if (cookieNames.length === 0) return 0;

  const expires = 'Thu, 01 Jan 1970 00:00:00 GMT';
  cookieNames.forEach((name) => {
    const base = `${name}=; expires=${expires}`;
    documentRef.cookie = `${base}; path=/`;
    if (domain) {
      documentRef.cookie = `${base}; path=/; domain=${domain}`;
      documentRef.cookie = `${base}; path=/; domain=.${domain}`;
    }
  });

  return cookieNames.length;
}

export function clearServiceWorkerRuntimeCaches({
  serviceWorkerController,
  createMessageChannel = () => new MessageChannel(),
  setTimeoutFn = (handler, ms) => globalThis.setTimeout(handler, ms),
  clearTimeoutFn = (id) => globalThis.clearTimeout(id),
  timeoutMs = 4000,
} = {}) {
  if (!serviceWorkerController || typeof serviceWorkerController.postMessage !== 'function') {
    return Promise.resolve({ success: false, reason: 'no-controller' });
  }

  return new Promise((resolve) => {
    let timeoutId = null;

    try {
      const channel = createMessageChannel();
      timeoutId = setTimeoutFn(() => {
        resolve({ success: false, reason: 'timeout' });
      }, timeoutMs);

      channel.port1.onmessage = (event) => {
        if (timeoutId != null) clearTimeoutFn(timeoutId);
        const payload = event?.data || {};
        resolve({
          success: Boolean(payload?.success),
          cleared: Array.isArray(payload?.cleared) ? payload.cleared : [],
          reason: payload?.reason || null,
        });
      };

      serviceWorkerController.postMessage({ type: 'CLEAR_CACHE' }, [channel.port2]);
    } catch (error) {
      if (timeoutId != null) clearTimeoutFn(timeoutId);
      resolve({ success: false, reason: 'post-message-failed', error });
    }
  });
}
