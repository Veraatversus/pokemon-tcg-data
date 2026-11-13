import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { syncCardmarket, SINGLES_URL, PRICE_GUIDE_URL } from '../sources/sync-cardmarket.mjs';
import { extractProductsList, extractPriceGuideList } from '../sources/cardmarket-feeds.mjs';

const NOW = new Date('2026-11-13T05:00:00.000Z');
const tmpRepo = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sync-cardmarket-'));
const cmDir = (repo) => path.join(repo, 'sources', 'cardmarket');
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

function product(id, extra = {}) {
  return { idProduct: id, name: `Card ${id}`, idCategory: 51, categoryName: 'Pokémon Single', idExpansion: 10, idMetacard: 900 + id, dateAdded: '2026-01-01 00:00:00', ...extra };
}

function singles(products) {
  return { version: 1, createdAt: '2026-11-12T15:13:35+0100', products };
}

function priceGuide(count) {
  return {
    version: 1,
    createdAt: '2026-11-13T02:44:11+0100',
    priceGuides: Array.from({ length: count }, (_, i) => ({ idProduct: i + 1, idCategory: 51, trend: 1 })),
  };
}

function stubFetch(map) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    const v = map[url];
    if (v instanceof Error) throw v;
    if (typeof v === 'function') return v();
    return structuredClone(v);
  };
  fn.calls = calls;
  return fn;
}

function snapshot(dir) {
  if (!fs.existsSync(dir)) return {};
  return Object.fromEntries(fs.readdirSync(dir).sort().map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')]));
}

async function seed(repo, prices = 10) {
  const fetchJson = stubFetch({ [SINGLES_URL]: singles([product(3), product(1), product(2, { idExpansion: 11 })]), [PRICE_GUIDE_URL]: priceGuide(prices) });
  const res = await syncCardmarket({ repoRoot: repo, fetchJson, now: () => NOW, retryDelayMs: 0 });
  assert.equal(res.status, 'ok');
  return res;
}

test('writes sorted catalog jsonl and meta', async () => {
  const repo = tmpRepo();
  const res = await seed(repo, 10);
  assert.equal(res.catalogChanged, true);
  assert.equal(res.priceGuidePath, path.join(repo, '.cache', 'cardmarket', 'price-guide.json'));

  const lines = fs.readFileSync(path.join(cmDir(repo), 'catalog.jsonl'), 'utf8').split('\n');
  assert.equal(lines.at(-1), '', 'abschliessender Zeilenumbruch');
  const rows = lines.slice(0, -1).map((l) => JSON.parse(l));
  assert.deepEqual(rows.map((r) => r.id), [1, 2, 3]);
  assert.deepEqual(rows[0], { id: 1, name: 'Card 1', expansionId: 10, collectorNumber: null, metacardId: 901, dateAdded: '2026-01-01 00:00:00' });
  assert.deepEqual(Object.keys(rows[0]), ['id', 'name', 'expansionId', 'collectorNumber', 'metacardId', 'dateAdded']);

  assert.deepEqual(readJson(path.join(cmDir(repo), 'expansions.json')), [
    { id: 10, name: null, products: 2 },
    { id: 11, name: null, products: 1 },
  ]);
  assert.deepEqual(readJson(path.join(cmDir(repo), 'meta.json')), {
    singlesCreatedAt: '2026-11-12T15:13:35+0100',
    priceGuideCreatedAt: '2026-11-13T02:44:11+0100',
    products: 3,
    prices: 10,
    lastSuccess: NOW.toISOString(),
    consecutiveFailures: 0,
  });
  assert.equal(extractPriceGuideList(readJson(res.priceGuidePath)).length, 10);

  // Zweiter Lauf mit gleichem Katalog: catalogChanged false.
  const again = await seed(repo, 10);
  assert.equal(again.catalogChanged, false);
});

test('only category 51 products', async () => {
  const repo = tmpRepo();
  const fetchJson = stubFetch({
    [SINGLES_URL]: singles([product(1), product(2, { idCategory: 52, categoryName: 'Pokémon Sealed' }), product(3, { idCategory: '51' })]),
    [PRICE_GUIDE_URL]: priceGuide(5),
  });
  const res = await syncCardmarket({ repoRoot: repo, fetchJson, now: () => NOW, retryDelayMs: 0 });
  assert.equal(res.status, 'ok');
  const ids = fs.readFileSync(path.join(cmDir(repo), 'catalog.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l).id);
  assert.deepEqual(ids, [1, 3]);
  assert.equal(readJson(path.join(cmDir(repo), 'meta.json')).products, 2);
});

test('defective price guide keeps previous state', async () => {
  const repo = tmpRepo();
  await seed(repo, 10);
  const before = snapshot(cmDir(repo));

  // 7 statt 10 Eintraege (< 80 %): defekt.
  const fetchJson = stubFetch({ [SINGLES_URL]: singles([product(1), product(4)]), [PRICE_GUIDE_URL]: priceGuide(7) });
  const res = await syncCardmarket({ repoRoot: repo, fetchJson, now: () => new Date('2026-11-14T05:00:00Z'), retryDelayMs: 0 });
  assert.deepEqual(res, { status: 'defective', catalogChanged: false, priceGuidePath: null });

  const after = snapshot(cmDir(repo));
  assert.equal(after['catalog.jsonl'], before['catalog.jsonl']);
  assert.equal(after['expansions.json'], before['expansions.json']);
  assert.deepEqual(readJson(path.join(cmDir(repo), 'meta.json')), { ...JSON.parse(before['meta.json']), consecutiveFailures: 1 });

  // Genau 80 % ist noch in Ordnung.
  const ok = await syncCardmarket({ repoRoot: repo, fetchJson: stubFetch({ [SINGLES_URL]: singles([product(1)]), [PRICE_GUIDE_URL]: priceGuide(8) }), now: () => NOW, retryDelayMs: 0 });
  assert.equal(ok.status, 'ok');
  assert.equal(readJson(path.join(cmDir(repo), 'meta.json')).consecutiveFailures, 0);
});

test('zero products is defective', async () => {
  const repo = tmpRepo();
  await seed(repo, 10);
  const before = snapshot(cmDir(repo));
  const res = await syncCardmarket({ repoRoot: repo, fetchJson: stubFetch({ [SINGLES_URL]: singles([]), [PRICE_GUIDE_URL]: priceGuide(10) }), now: () => NOW, retryDelayMs: 0 });
  assert.equal(res.status, 'defective');
  assert.equal(snapshot(cmDir(repo))['catalog.jsonl'], before['catalog.jsonl']);
});

test('network failure increments consecutiveFailures and exits ok', async () => {
  const repo = tmpRepo();
  await seed(repo, 10);
  const before = snapshot(cmDir(repo));
  const cacheFile = path.join(repo, '.cache', 'cardmarket', 'price-guide.json');
  const cacheBefore = fs.readFileSync(cacheFile, 'utf8');

  const fetchJson = stubFetch({ [SINGLES_URL]: singles([product(1)]), [PRICE_GUIDE_URL]: new Error('ETIMEDOUT') });
  const res = await syncCardmarket({ repoRoot: repo, fetchJson, now: () => NOW, retryDelayMs: 0 });
  assert.deepEqual(res, { status: 'failed', catalogChanged: false, priceGuidePath: null });
  // Eine Wiederholung: Preisguide zweimal versucht.
  assert.equal(fetchJson.calls.filter((u) => u === PRICE_GUIDE_URL).length, 2);

  const res2 = await syncCardmarket({ repoRoot: repo, fetchJson, now: () => NOW, retryDelayMs: 0 });
  assert.equal(res2.status, 'failed');
  const after = snapshot(cmDir(repo));
  assert.equal(after['catalog.jsonl'], before['catalog.jsonl']);
  assert.equal(after['expansions.json'], before['expansions.json']);
  assert.deepEqual(readJson(path.join(cmDir(repo), 'meta.json')), { ...JSON.parse(before['meta.json']), consecutiveFailures: 2 });
  assert.equal(fs.readFileSync(cacheFile, 'utf8'), cacheBefore);
});

test('failure before any success writes meta with counter only', async () => {
  const repo = tmpRepo();
  const res = await syncCardmarket({ repoRoot: repo, fetchJson: stubFetch({ [SINGLES_URL]: new Error('HTTP 503') }), now: () => NOW, retryDelayMs: 0 });
  assert.equal(res.status, 'failed');
  assert.deepEqual(snapshot(cmDir(repo)).hasOwnProperty('catalog.jsonl'), false);
  assert.deepEqual(readJson(path.join(cmDir(repo), 'meta.json')), {
    singlesCreatedAt: null, priceGuideCreatedAt: null, products: 0, prices: 0, lastSuccess: null, consecutiveFailures: 1,
  });
});

test('retry succeeds on second attempt', async () => {
  const repo = tmpRepo();
  let n = 0;
  const fetchJson = stubFetch({
    [SINGLES_URL]: () => { n += 1; if (n === 1) throw new Error('reset'); return singles([product(1)]); },
    [PRICE_GUIDE_URL]: priceGuide(3),
  });
  const res = await syncCardmarket({ repoRoot: repo, fetchJson, now: () => NOW, retryDelayMs: 0 });
  assert.equal(res.status, 'ok');
  assert.equal(n, 2);
});

test('feed extractors accept object and array payloads', () => {
  assert.equal(extractProductsList({ products: [1, 2] }).length, 2);
  assert.equal(extractProductsList([1]).length, 1);
  assert.deepEqual(extractProductsList({}), []);
  assert.equal(extractPriceGuideList({ priceGuides: [1] }).length, 1);
  assert.deepEqual(extractPriceGuideList(null), []);
});
