import test from 'node:test';
import assert from 'node:assert/strict';

import { initPwaFeatures } from '../js/app/pwa-init.js';

test('initPwaFeatures wires listeners using injected browser refs', async () => {
  const listeners = new Map();
  const swListeners = new Map();
  const toasts = [];
  let registerCalls = 0;
  let updateCalls = 0;

  const registration = {
    waiting: null,
    installing: null,
    addEventListener() {},
    update: async () => {
      updateCalls += 1;
    },
  };

  const windowRef = {
    addEventListener: (name, fn) => {
      listeners.set(name, fn);
    },
    setTimeout: (fn) => fn(),
    location: { reload: () => {} },
  };

  const documentRef = {
    body: {
      appendChild: () => {},
    },
    createElement: () => ({
      className: '',
      textContent: '',
      style: { cssText: '' },
      addEventListener: () => {},
    }),
  };

  const navigatorRef = {
    standalone: false,
    serviceWorker: {
      controller: null,
      addEventListener: (name, fn) => {
        swListeners.set(name, fn);
      },
      register: async () => {
        registerCalls += 1;
        return registration;
      },
    },
  };

  const intervals = [];
  const setIntervalRef = (fn, ms) => {
    intervals.push({ fn, ms });
    return 1;
  };

  initPwaFeatures({
    showToast: (...args) => toasts.push(args),
    windowRef,
    navigatorRef,
    documentRef,
    setIntervalRef,
  });

  assert.equal(typeof listeners.get('load'), 'function');
  assert.equal(typeof listeners.get('beforeinstallprompt'), 'function');
  assert.equal(typeof listeners.get('appinstalled'), 'function');

  await listeners.get('load')();

  assert.equal(registerCalls, 1);
  assert.equal(typeof swListeners.get('controllerchange'), 'function');
  assert.equal(typeof swListeners.get('message'), 'function');
  assert.equal(intervals.length, 1);
  assert.equal(intervals[0].ms, 60000);
  assert.equal(updateCalls, 0);
  assert.equal(toasts.length, 0);
});
