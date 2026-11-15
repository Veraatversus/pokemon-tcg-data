// Sammlungs-Maps fuer Suche und Such-Lightbox: nur erfolgreiche Lesungen landen im Cache.
import test from 'node:test';
import assert from 'node:assert/strict';

import { readCollectionMapCached } from '../js/features/search/search-collection-maps.js';

function makeCache() {
  const store = new Map();
  return {
    store,
    has: (key) => store.has(key),
    get: (key) => store.get(key),
    set: (key, value, ttl) => store.set(key, { value, ttl }) && undefined,
  };
}
const SET = { setId: 'sv1', setName: 'Karmesin & Purpur' };

test('Lesefehler wird nicht als leere Map gecacht', async () => {
  const cache = makeCache();
  const errors = [];
  const result = await readCollectionMapCached(SET, {
    cache,
    ttlMs: 1000,
    read: async () => { throw new Error('quota'); },
    onError: (err) => errors.push(err.message),
  });
  assert.equal(result, null);
  assert.equal(cache.store.size, 0);
  assert.deepEqual(errors, ['quota']);
});

test('erfolgreiche Lesung wird mit TTL gecacht', async () => {
  const cache = makeCache();
  const calls = [];
  const map = new Map([['1', { g: true }]]);
  const result = await readCollectionMapCached(SET, {
    cache,
    ttlMs: 1000,
    read: async (setName, opts) => { calls.push([setName, opts.setId]); return map; },
  });
  assert.equal(result, map);
  assert.deepEqual(calls, [['Karmesin & Purpur', 'sv1']]);
  assert.deepEqual(cache.store.get('db_sv1'), { value: map, ttl: 1000 });
});

test('vorhandener Cache-Eintrag wird ohne Lesen genutzt', async () => {
  const map = new Map();
  const cache = { has: () => true, get: () => map, set: () => assert.fail('kein set erwartet') };
  const result = await readCollectionMapCached(SET, { cache, ttlMs: 1, read: async () => assert.fail('kein read erwartet') });
  assert.equal(result, map);
});
