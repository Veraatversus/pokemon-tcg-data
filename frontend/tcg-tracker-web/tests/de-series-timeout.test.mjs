// DE-Serien-Map fuer das Dashboard: ein haengendes api/v3 darf loadSets nicht blockieren.
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const { fetchDeSeriesBySetId, DE_SERIES_TIMEOUT_MS } = await import('../js/data/pokemon-api.js');

test('fetchDeSeriesBySetId: haengendes sets.json -> leere Map nach dem Zeitlimit', async () => {
  const started = Date.now();
  const map = await fetchDeSeriesBySetId({ timeoutMs: 30, loadSets: () => new Promise(() => {}) });
  assert.equal(map.size, 0);
  assert.ok(Date.now() - started < 2_000);
});

test('fetchDeSeriesBySetId: Antwort innerhalb des Limits -> DE-Serien je Set', async () => {
  const map = await fetchDeSeriesBySetId({
    timeoutMs: 1_000,
    loadSets: async () => [{ id: 'sv1', i18n: { de: { series: 'Karmesin & Purpur' } } }, { id: 'base1' }]
  });
  assert.deepEqual([...map], [['sv1', 'Karmesin & Purpur']]);
});

test('fetchDeSeriesBySetId: Standard-Zeitlimit ist begrenzt', () => {
  assert.ok(DE_SERIES_TIMEOUT_MS > 0 && DE_SERIES_TIMEOUT_MS <= 10_000);
});
