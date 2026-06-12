import test from 'node:test';
import assert from 'node:assert/strict';

import { forceRefreshCardmarketPrices } from '../js/data/cardmarket-versioning.js';
import { STORAGE_KEY } from './helpers/cardmarket-storage-helper.js';

function makeStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    has: (key) => store.has(key),
  };
}

test('forceRefreshCardmarketPrices leert Caches auch wenn der Stamp unveraendert ist', async () => {
  const storage = makeStorage({ [STORAGE_KEY]: '2026-06-08T03:17:25.640Z' });
  const fakeFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ generatedAt: '2026-06-08T03:17:25.640Z' }),
  });

  const result = await forceRefreshCardmarketPrices({ fetchImpl: fakeFetch, storageRef: storage });

  assert.equal(result.changed, false, 'Stamp ist identisch, also nicht changed');
  assert.equal(result.forced, true, 'forced-Flag ist immer true');
  assert.equal(result.currentStamp, '2026-06-08T03:17:25.640Z');
  assert.ok(result.reset.includes('cardmarket-data'));
  assert.ok(result.reset.includes('set-view-price-cache'));
});

test('forceRefreshCardmarketPrices leert Caches und meldet changed=true bei neuem Stamp', async () => {
  const storage = makeStorage({ [STORAGE_KEY]: '2026-05-25T00:00:00.000Z' });
  const fakeFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ generatedAt: '2026-06-08T03:17:25.640Z' }),
  });

  const result = await forceRefreshCardmarketPrices({ fetchImpl: fakeFetch, storageRef: storage });

  assert.equal(result.changed, true);
  assert.equal(result.reason, 'updated');
  assert.equal(result.forced, true);
  assert.equal(result.currentStamp, '2026-06-08T03:17:25.640Z');
  assert.equal(result.previousStamp, '2026-05-25T00:00:00.000Z');
  assert.ok(result.reset.includes('cardmarket-data'));
  assert.ok(result.reset.includes('set-view-price-cache'));
});

test('forceRefreshCardmarketPrices behandelt Offline-Fall graceful (Stamp bleibt erhalten)', async () => {
  const storage = makeStorage({ [STORAGE_KEY]: '2026-06-08T03:17:25.640Z' });
  const fakeFetch = async () => {
    throw new Error('offline');
  };

  const result = await forceRefreshCardmarketPrices({ fetchImpl: fakeFetch, storageRef: storage });

  assert.equal(result.reason, 'invalid');
  assert.equal(result.forced, true);
  // Stamp bleibt erhalten – User sieht beim naechsten erfolgreichen Aufruf wieder
  // den gleichen Stand.
  assert.equal(storage.getItem(STORAGE_KEY), '2026-06-08T03:17:25.640Z');
});

test('forceRefreshCardmarketPrices setzt den gespeicherten Stamp bei first-sync', async () => {
  const storage = makeStorage();
  const fakeFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ generatedAt: '2026-06-08T03:17:25.640Z' }),
  });

  const result = await forceRefreshCardmarketPrices({ fetchImpl: fakeFetch, storageRef: storage });

  assert.equal(result.reason, 'first-sync');
  assert.equal(result.forced, true);
  assert.equal(storage.getItem(STORAGE_KEY), '2026-06-08T03:17:25.640Z');
  assert.ok(result.reset.includes('cardmarket-data'));
});

test('forceRefreshCardmarketPrices leert Caches bei rolled-back (aelterer Stamp im Netz)', async () => {
  const storage = makeStorage({ [STORAGE_KEY]: '2026-06-09T03:17:25.000Z' });
  const fakeFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ generatedAt: '2026-06-08T03:17:25.640Z' }),
  });

  const result = await forceRefreshCardmarketPrices({ fetchImpl: fakeFetch, storageRef: storage });

  assert.equal(result.changed, false, 'reason=rolled-back, also kein changed');
  assert.equal(result.reason, 'rolled-back');
  assert.equal(result.forced, true);
  assert.ok(result.reset.includes('cardmarket-data'),
    'force-Modus: Caches werden IMMER geleert, auch bei rolled-back');
});
