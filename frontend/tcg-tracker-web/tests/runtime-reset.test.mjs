import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clearCookiesBestEffort,
  clearServiceWorkerRuntimeCaches,
  getResetLocalStorageKeys,
  removeLocalStorageKeys,
} from '../js/features/settings/runtime-reset.js';

function createMemoryStorage(initialEntries = {}) {
  const map = new Map(Object.entries(initialEntries));
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
    key(index) {
      return Array.from(map.keys())[index] ?? null;
    },
    get length() {
      return map.size;
    },
    dump() {
      return Object.fromEntries(map.entries());
    }
  };
}

test('getResetLocalStorageKeys ohne Vollreset behaelt Auth- und Spreadsheet-Keys', () => {
  const scoped = (base) => `scope:${base}`;
  const keys = getResetLocalStorageKeys({
    scopedStorageKeyFn: scoped,
    includeAuthKeys: false,
    includeSpreadsheetKey: false,
  });

  assert.equal(keys.includes('scope:tcg_tracker_token'), false);
  assert.equal(keys.includes('scope:tcg_tracker_auto_login'), false);
  assert.equal(keys.includes('scope:tcg_spreadsheet_id'), false);
  assert.equal(keys.includes('scope:user-settings'), true);
  assert.equal(keys.includes('scope:favorites-sets'), true);
});

test('getResetLocalStorageKeys fuer Vollreset enthaelt Auth- und Spreadsheet-Keys', () => {
  const scoped = (base) => `scope:${base}`;
  const keys = getResetLocalStorageKeys({
    scopedStorageKeyFn: scoped,
    includeAuthKeys: true,
    includeSpreadsheetKey: true,
  });

  assert.equal(keys.includes('scope:tcg_tracker_token'), true);
  assert.equal(keys.includes('scope:tcg_tracker_auto_login'), true);
  assert.equal(keys.includes('scope:tcg_spreadsheet_id'), true);
});

test('removeLocalStorageKeys loescht nur die angeforderten Keys', () => {
  const localStorageRef = createMemoryStorage({
    'scope:user-settings': '{"compact":true}',
    'scope:favorites-sets': '["sv1"]',
    'scope:tcg_tracker_token': '{"token":"abc"}',
  });

  removeLocalStorageKeys(localStorageRef, ['scope:user-settings', 'scope:favorites-sets']);

  const state = localStorageRef.dump();
  assert.equal(state['scope:user-settings'], undefined);
  assert.equal(state['scope:favorites-sets'], undefined);
  assert.equal(state['scope:tcg_tracker_token'], '{"token":"abc"}');
});

test('clearCookiesBestEffort versucht alle sichtbaren Cookies der Domain zu entfernen', () => {
  const writes = [];
  const cookieJar = {
    get cookie() {
      return 'theme=dark; session=abc123; foo=bar';
    },
    set cookie(value) {
      writes.push(value);
    }
  };

  const removed = clearCookiesBestEffort({ documentRef: cookieJar, domain: 'localhost' });

  assert.equal(removed, 3);
  assert.equal(writes.length, 9);
  assert.ok(writes.some((entry) => entry.startsWith('theme=')));
  assert.ok(writes.some((entry) => entry.includes('domain=localhost')));
});

test('clearServiceWorkerRuntimeCaches sendet CLEAR_CACHE und wartet auf Ack', async () => {
  const posted = [];
  let channelRef = null;
  const controller = {
    postMessage(message, ports) {
      posted.push(message);
      assert.equal(ports.length, 1);
      channelRef.port1.onmessage?.({ data: { success: true, cleared: ['runtime', 'shell'] } });
    }
  };

  const result = await clearServiceWorkerRuntimeCaches({
    serviceWorkerController: controller,
    createMessageChannel: () => {
      channelRef = {
        port1: { onmessage: null },
        port2: {},
      };
      return channelRef;
    },
    setTimeoutFn: (fn) => setTimeout(fn, 50),
    clearTimeoutFn: () => {},
  });

  assert.equal(posted.length, 1);
  assert.equal(posted[0].type, 'CLEAR_CACHE');
  assert.equal(result.success, true);
  assert.deepEqual(result.cleared, ['runtime', 'shell']);
});
