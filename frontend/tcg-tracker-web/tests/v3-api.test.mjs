import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveV3Bases, loadV3Sets, loadV3Cards, loadV3SearchIndex, loadV3Meta,
  loadRegistrySets, loadRegistryCards, resetV3Caches,
} from '../js/data/v3-api.js';

const APP = 'https://x.github.io/pokemon-tcg-data/frontend/tcg-tracker-web/';

function stub(responder) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    return responder(String(url), calls.length);
  };
  return { calls, fetchImpl };
}
const ok = (data) => ({ ok: true, status: 200, json: async () => data });

// APP is the repo layout (app under /frontend/tcg-tracker-web/, e.g. a static server on the repo root):
// these tests keep the ../../api/ semantics for that layout; the GitHub Pages layout is tested below.
test('resolveV3Bases: repo layout with hash', () => {
  const r = resolveV3Bases({ href: APP + '#dashboard', config: { APIS: {} } });
  assert.equal(r.v3, 'https://x.github.io/pokemon-tcg-data/api/v3/');
  assert.equal(r.registry, 'https://x.github.io/pokemon-tcg-data/api/registry/');
});

test('resolveV3Bases: repo layout under dev/, index.html and query', () => {
  const r = resolveV3Bases({
    href: 'https://x.github.io/pokemon-tcg-data/dev/frontend/tcg-tracker-web/index.html?env=dev#a/b',
    config: { APIS: {} },
  });
  assert.equal(r.v3, 'https://x.github.io/pokemon-tcg-data/dev/api/v3/');
  assert.equal(r.registry, 'https://x.github.io/pokemon-tcg-data/dev/api/registry/');
});

test('resolveV3Bases: no trailing slash and localhost', () => {
  const r = resolveV3Bases({ href: 'http://localhost:8080/frontend/tcg-tracker-web', config: {} });
  assert.equal(r.v3, 'http://localhost:8080/api/v3/');
});

test('resolveV3Bases: GitHub Pages release root -> ./api/', () => {
  const r = resolveV3Bases({ href: 'https://x.github.io/pokemon-tcg-data/', config: { APIS: {} } });
  assert.equal(r.v3, 'https://x.github.io/pokemon-tcg-data/api/v3/');
  assert.equal(r.registry, 'https://x.github.io/pokemon-tcg-data/api/registry/');
});

test('resolveV3Bases: GitHub Pages dev preview -> dev/api/', () => {
  for (const href of [
    'https://x.github.io/pokemon-tcg-data/dev/',
    'https://x.github.io/pokemon-tcg-data/dev/index.html#dashboard',
    'https://x.github.io/pokemon-tcg-data/dev',
  ]) {
    const r = resolveV3Bases({ href, config: { APIS: {} } });
    assert.equal(r.v3, 'https://x.github.io/pokemon-tcg-data/dev/api/v3/', href);
    assert.equal(r.registry, 'https://x.github.io/pokemon-tcg-data/dev/api/registry/', href);
  }
});

test('resolveV3Bases: local start:dev:full (repo root served)', () => {
  const r = resolveV3Bases({ href: 'http://localhost:8080/frontend/tcg-tracker-web/', config: { APIS: {} } });
  assert.equal(r.v3, 'http://localhost:8080/api/v3/');
  assert.equal(r.registry, 'http://localhost:8080/api/registry/');
});

test('resolveV3Bases: overrides win on the Pages layout too', () => {
  const r = resolveV3Bases({
    href: 'https://x.github.io/pokemon-tcg-data/dev/',
    config: { APIS: { V3_BASE: 'https://example.org/v3', REGISTRY_BASE: '/reg' } },
  });
  assert.equal(r.v3, 'https://example.org/v3/');
  assert.equal(r.registry, 'https://x.github.io/reg/');
  const partial = resolveV3Bases({ href: 'https://x.github.io/pokemon-tcg-data/', config: { APIS: { V3_BASE: 'https://example.org/v3' } } });
  assert.equal(partial.v3, 'https://example.org/v3/');
  assert.equal(partial.registry, 'https://x.github.io/pokemon-tcg-data/api/registry/');
});

test('resolveV3Bases: config override gets trailing slash', () => {
  const r = resolveV3Bases({
    href: APP,
    config: { APIS: { V3_BASE: 'https://example.org/v3', REGISTRY_BASE: 'https://example.org/reg/' } },
  });
  assert.equal(r.v3, 'https://example.org/v3/');
  assert.equal(r.registry, 'https://example.org/reg/');
});

test('caches one promise per URL', async () => {
  resetV3Caches();
  const { calls, fetchImpl } = stub(() => ok([{ id: 'a' }]));
  const opts = { fetchImpl, href: APP };
  const [a, b] = await Promise.all([loadV3Sets(opts), loadV3Sets(opts)]);
  assert.equal(calls.length, 1);
  assert.deepEqual(a, b);
  assert.match(calls[0], /\/api\/v3\/sets\.json$/);
});

test('failed requests are not cached and error has status and URL', async () => {
  resetV3Caches();
  let n = 0;
  const { calls, fetchImpl } = stub(() => (++n === 1 ? { ok: false, status: 404 } : ok([1])));
  await assert.rejects(loadV3Sets({ fetchImpl, href: APP }), (e) => /404/.test(e.message) && /sets\.json/.test(e.message));
  assert.deepEqual(await loadV3Sets({ fetchImpl, href: APP }), [1]);
  assert.equal(calls.length, 2);
});

test('set ids are URL-encoded in card file names', async () => {
  resetV3Caches();
  const { calls, fetchImpl } = stub(() => ok([]));
  await loadV3Cards('TCGDEX-sv03.5', { fetchImpl, href: APP });
  await loadRegistryCards('TCGDEX-sv03.5', { fetchImpl, href: APP });
  await loadV3Cards('a b/c', { fetchImpl, href: APP });
  assert.ok(calls[0].endsWith('/api/v3/cards/' + encodeURIComponent('TCGDEX-sv03.5') + '.json'));
  assert.ok(calls[1].endsWith('/api/registry/cards/TCGDEX-sv03.5.json'));
  assert.ok(calls[2].endsWith('/cards/a%20b%2Fc.json'));
});

test('other loaders hit expected files', async () => {
  resetV3Caches();
  const { calls, fetchImpl } = stub(() => ok({}));
  await loadV3SearchIndex({ fetchImpl, href: APP });
  await loadV3Meta({ fetchImpl, href: APP });
  await loadRegistrySets({ fetchImpl, href: APP });
  assert.ok(calls[0].endsWith('/api/v3/search-index.json'));
  assert.ok(calls[1].endsWith('/api/v3/meta.json'));
  assert.ok(calls[2].endsWith('/api/registry/sets.json'));
});

test('abort of caller A does not reject caller B; cache still populated', async () => {
  resetV3Caches();
  let release;
  const gate = new Promise((r) => { release = r; });
  const { calls, fetchImpl } = stub(async () => { await gate; return ok([7]); });
  const ca = new AbortController();
  const cb = new AbortController();
  const a = loadV3Sets({ fetchImpl, href: APP, signal: ca.signal });
  const b = loadV3Sets({ fetchImpl, href: APP, signal: cb.signal });
  ca.abort();
  await assert.rejects(a, { name: 'AbortError' });
  release();
  assert.deepEqual(await b, [7]);
  assert.deepEqual(await loadV3Sets({ fetchImpl, href: APP }), [7]);
  assert.equal(calls.length, 1);
});

test('own abort of B rejects only B', async () => {
  resetV3Caches();
  let release;
  const gate = new Promise((r) => { release = r; });
  const { fetchImpl } = stub(async () => { await gate; return ok([1]); });
  const cb = new AbortController();
  const a = loadV3Sets({ fetchImpl, href: APP });
  const b = loadV3Sets({ fetchImpl, href: APP, signal: cb.signal });
  cb.abort();
  await assert.rejects(b, { name: 'AbortError' });
  release();
  assert.deepEqual(await a, [1]);
});

test('override bases are absolutised against href', () => {
  const r = resolveV3Bases({ href: APP, config: { APIS: { V3_BASE: '../../data/v3', REGISTRY_BASE: '/reg' } } });
  assert.equal(r.v3, 'https://x.github.io/pokemon-tcg-data/data/v3/');
  assert.equal(r.registry, 'https://x.github.io/reg/');
});

test('unresolvable bases reject instead of throwing synchronously', async () => {
  const p = loadV3Sets({ href: '', config: { APIS: {} }, fetchImpl: async () => ok([]) });
  assert.ok(p instanceof Promise);
  await assert.rejects(p, /cannot resolve/);
});
