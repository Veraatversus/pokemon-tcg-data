import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// service-worker.js ist kein Modul: isFresh wird aus dem Quelltext extrahiert.
const src = readFileSync(fileURLToPath(new URL('../service-worker.js', import.meta.url)), 'utf8');
const m = src.match(/function isFresh\([^)]*\) \{[\s\S]*?\r?\n\}/);
assert.ok(m, 'isFresh in service-worker.js gefunden');
const isFresh = new Function(`${m[0]}; return isFresh;`)();
const DAY = 24 * 60 * 60 * 1000;

test('isFresh: jung -> frisch, alt/fehlend/Zukunft -> nicht frisch', () => {
  assert.equal(isFresh(1000, 1000 + DAY - 1, DAY), true);
  assert.equal(isFresh(1000, 1000 + DAY, DAY), false);
  assert.equal(isFresh(NaN, 5, DAY), false);
  assert.equal(isFresh(0, 5, DAY), true);
  assert.equal(isFresh(10, 5, DAY), false);
});

// Laufzeit-Cache: Obergrenze 60 api-Eintraege auch bei parallelen puts.
const trimSrc = src.slice(src.indexOf('const API_CACHE_MAX_ENTRIES'), src.indexOf('// Freshness decision'));
const { API_CACHE_MAX_ENTRIES, enqueueApiTrim } = new Function(`${trimSrc}; return { API_CACHE_MAX_ENTRIES, enqueueApiTrim };`)();

function fakeCache() {
  const map = new Map();
  return {
    map,
    async keys() { await Promise.resolve(); return [...map.keys()].map((url) => ({ url })); },
    async delete(req) { return map.delete(req.url); },
    async put(url) { await Promise.resolve(); map.set(url, true); }
  };
}

test('runtime cache stays <= 60 after (parallel) puts, pinned bleiben', async () => {
  assert.equal(API_CACHE_MAX_ENTRIES, 60);
  const cache = fakeCache();
  const base = 'https://x.test/api/';
  for (const p of ['v3/sets.json', 'v3/meta.json', 'v3/search-index.json', 'registry/sets.json']) cache.map.set(base + p, true);
  await Promise.all(Array.from({ length: 70 }, async (_, i) => {
    await cache.put(`${base}v3/cards/c${i}.json`);
    await enqueueApiTrim(cache);
  }));
  const api = [...cache.map.keys()].filter((u) => u.includes('/api/'));
  assert.ok(api.length <= 60, `api entries ${api.length}`);
  for (const p of ['v3/sets.json', 'v3/meta.json', 'v3/search-index.json', 'registry/sets.json']) assert.ok(cache.map.has(base + p));
  assert.ok(cache.map.has(`${base}v3/cards/c69.json`), 'neuester Eintrag bleibt');
});
