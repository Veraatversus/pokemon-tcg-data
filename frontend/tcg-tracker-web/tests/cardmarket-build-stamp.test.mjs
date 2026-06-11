import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractCardmarketBuildStamp,
  evaluateCardmarketBuildStamp,
  fetchCardmarketBuildStamp,
  persistCardmarketBuildStamp,
  syncCardmarketBuildStamp,
} from '../js/data/cardmarket-build-stamp.js';
import { scopedStorageKey } from '../js/core/config.js';

const STORAGE_KEY = scopedStorageKey('cardmarket-build-stamp');

function makeStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    has: (key) => store.has(key),
  };
}

test('extractCardmarketBuildStamp liest generatedAt aus meta.json', () => {
  assert.equal(
    extractCardmarketBuildStamp({ generatedAt: '2026-06-08T03:17:25.640Z' }),
    '2026-06-08T03:17:25.640Z'
  );
});

test('extractCardmarktBuildStamp fällt auf singlesSourceCreatedAt zurück', () => {
  assert.equal(
    extractCardmarketBuildStamp({ singlesSourceCreatedAt: '2026-06-07T12:39:36+0200' }),
    '2026-06-07T12:39:36+0200'
  );
});

test('extractCardmarketBuildStamp liefert leeren String bei fehlendem Feld', () => {
  assert.equal(extractCardmarketBuildStamp({}), '');
  assert.equal(extractCardmarketBuildStamp(null), '');
});

test('evaluateCardmarketBuildStamp meldet first-sync, wenn noch nichts persistiert ist', () => {
  const storage = makeStorage();
  const result = evaluateCardmarketBuildStamp({
    currentStamp: '2026-06-08T03:17:25.640Z',
    storageRef: storage,
  });
  assert.equal(result.changed, false);
  assert.equal(result.reason, 'first-sync');
  assert.equal(result.previousStamp, '');
  assert.equal(result.currentStamp, '2026-06-08T03:17:25.640Z');
});

test('evaluateCardmarketBuildStamp meldet unchanged bei identischem Stamp', () => {
  const storage = makeStorage({ [STORAGE_KEY]: '2026-06-08T03:17:25.640Z' });
  const result = evaluateCardmarketBuildStamp({
    currentStamp: '2026-06-08T03:17:25.640Z',
    storageRef: storage,
  });
  assert.equal(result.changed, false);
  assert.equal(result.reason, 'unchanged');
});

test('evaluateCardmarketBuildStamp meldet updated mit changed=true bei neuerem Stamp', () => {
  const storage = makeStorage({ [STORAGE_KEY]: '2026-06-07T03:17:25.000Z' });
  const result = evaluateCardmarketBuildStamp({
    currentStamp: '2026-06-08T03:17:25.640Z',
    storageRef: storage,
  });
  assert.equal(result.changed, true);
  assert.equal(result.reason, 'updated');
  assert.equal(result.previousStamp, '2026-06-07T03:17:25.000Z');
  assert.equal(result.currentStamp, '2026-06-08T03:17:25.640Z');
});

test('evaluateCardmarketBuildStamp meldet rolled-back ohne changed=true bei älterem Stamp', () => {
  const storage = makeStorage({ [STORAGE_KEY]: '2026-06-09T03:17:25.000Z' });
  const result = evaluateCardmarketBuildStamp({
    currentStamp: '2026-06-08T03:17:25.640Z',
    storageRef: storage,
  });
  assert.equal(result.changed, false);
  assert.equal(result.reason, 'rolled-back');
});

test('evaluateCardmarketBuildStamp meldet invalid bei leerem currentStamp', () => {
  const storage = makeStorage({ [STORAGE_KEY]: '2026-06-08T03:17:25.640Z' });
  const result = evaluateCardmarketBuildStamp({
    currentStamp: '',
    storageRef: storage,
  });
  assert.equal(result.changed, false);
  assert.equal(result.reason, 'invalid');
});

test('persistCardmarketBuildStamp schreibt den neuen Stamp', () => {
  const storage = makeStorage();
  persistCardmarketBuildStamp({
    currentStamp: '2026-06-08T03:17:25.640Z',
    storageRef: storage,
  });
  assert.equal(storage.getItem(STORAGE_KEY), '2026-06-08T03:17:25.640Z');
});

test('persistCardmarketBuildStamp ignoriert leere Stamps', () => {
  const storage = makeStorage({ existing: '1' });
  persistCardmarketBuildStamp({ currentStamp: '', storageRef: storage });
  assert.equal(storage.has(STORAGE_KEY), false);
});

test('fetchCardmarketBuildStamp ruft meta.json ab und gibt generatedAt zurück', async () => {
  const fakeFetch = async (url) => {
    assert.ok(url.endsWith('/cardmarket/meta.json'));
    return {
      ok: true,
      status: 200,
      json: async () => ({ generatedAt: '2026-06-08T03:17:25.640Z' }),
    };
  };
  const stamp = await fetchCardmarketBuildStamp({ fetchImpl: fakeFetch });
  assert.equal(stamp, '2026-06-08T03:17:25.640Z');
});

test('fetchCardmarketBuildStamp liefert null bei HTTP-Fehler', async () => {
  const fakeFetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
  const stamp = await fetchCardmarketBuildStamp({ fetchImpl: fakeFetch });
  assert.equal(stamp, null);
});

test('fetchCardmarketBuildStamp liefert null bei Netzwerkfehler', async () => {
  const fakeFetch = async () => {
    throw new Error('network down');
  };
  const stamp = await fetchCardmarketBuildStamp({ fetchImpl: fakeFetch });
  assert.equal(stamp, null);
});

test('fetchCardmarketBuildStamp respektiert AbortSignal', async () => {
  const fakeFetch = async () => {
    const err = new Error('aborted');
    err.name = 'AbortError';
    throw err;
  };
  const stamp = await fetchCardmarketBuildStamp({ fetchImpl: fakeFetch });
  assert.equal(stamp, null);
});

test('syncCardmarketBuildStamp lädt, vergleicht und persistiert beim ersten Aufruf', async () => {
  const storage = makeStorage();
  const fakeFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ generatedAt: '2026-06-08T03:17:25.640Z' }),
  });

  const result = await syncCardmarketBuildStamp({ fetchImpl: fakeFetch, storageRef: storage });
  assert.equal(result.changed, false);
  assert.equal(result.reason, 'first-sync');
  assert.equal(storage.getItem(STORAGE_KEY), '2026-06-08T03:17:25.640Z');
});

test('syncCardmarketBuildStamp erkennt neuen Drop nach Tageswechsel', async () => {
  const storage = makeStorage({ [STORAGE_KEY]: '2026-06-07T03:17:25.000Z' });
  const fakeFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ generatedAt: '2026-06-08T03:17:25.640Z' }),
  });

  const result = await syncCardmarketBuildStamp({ fetchImpl: fakeFetch, storageRef: storage });
  assert.equal(result.changed, true);
  assert.equal(result.reason, 'updated');
  assert.equal(storage.getItem(STORAGE_KEY), '2026-06-08T03:17:25.640Z');
});

test('syncCardmarketBuildStamp bleibt bei Offline unverändert', async () => {
  const storage = makeStorage({ [STORAGE_KEY]: '2026-06-07T03:17:25.000Z' });
  const fakeFetch = async () => {
    throw new Error('offline');
  };

  const result = await syncCardmarketBuildStamp({ fetchImpl: fakeFetch, storageRef: storage });
  assert.equal(result.changed, false);
  assert.equal(result.reason, 'invalid');
  // Bisherigen Stamp NICHT überschreiben
  assert.equal(storage.getItem(STORAGE_KEY), '2026-06-07T03:17:25.000Z');
});
