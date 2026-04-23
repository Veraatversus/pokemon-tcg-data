import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appPath = path.join(__dirname, '..', 'js', 'app.js');

async function readAppSource() {
  return readFile(appPath, 'utf8');
}

test('stats view keeps a dedicated lazy-loading container for price analytics', async () => {
  const source = await readAppSource();

  assert.match(source, /id="stats-price-analytics"/);
  assert.match(source, /data-state="loading"/);
  assert.match(source, /renderStatsPriceLoading\(/);
  assert.match(source, /loadStatsPriceAnalyticsLazy\(\{ requestId:/);
});

test('lazy loading uses bounded chunk and concurrency constants', async () => {
  const source = await readAppSource();

  assert.match(source, /const STATS_PRICE_CHUNK_SIZE = 25;/);
  assert.match(source, /const STATS_PRICE_CONCURRENCY = 4;/);
  assert.match(source, /offset \+= STATS_PRICE_CHUNK_SIZE/);
  assert.match(source, /mapWithConcurrency\(chunk, STATS_PRICE_CONCURRENCY/);
});

test('request guard protects against stale async updates', async () => {
  const source = await readAppSource();

  assert.match(source, /state\.statsPrice\.requestId !== statsPriceRequestId/);
  assert.match(source, /if \(!isActiveStatsPriceRequest\(requestId\)\) return;/);
  assert.match(source, /if \(!isActiveStatsPriceRequest\(normalizedRequestId\)\) return;/);
});
