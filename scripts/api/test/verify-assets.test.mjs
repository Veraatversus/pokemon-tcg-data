import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { verifyAssets, verifySetAssets, classifyStatus, updateVerifiedFile, countGroups } from '../sources/verify-assets.mjs';

const NOW = new Date('2026-11-12T02:00:00.000Z');
const now = () => NOW;
const daysAgo = (d) => new Date(NOW.getTime() - d * 86400000).toISOString();
const probeFrom = (map) => {
  const calls = [];
  const probe = async (url) => {
    calls.push(url);
    return map[url];
  };
  return { probe, calls };
};

test('ok and 404 are recorded', async () => {
  const { probe } = probeFrom({ A: 200, B: 404 });
  const r = await verifyAssets({ urls: ['A', 'B'], previous: {}, probe, now });
  assert.deepEqual(r, {
    A: { status: 'ok', checkedAt: NOW.toISOString() },
    B: { status: 'missing', checkedAt: NOW.toISOString() },
  });
});

test('transient errors keep previous status', async () => {
  const { probe } = probeFrom({ A: null, B: 503, C: null });
  const previous = { A: { status: 'missing', checkedAt: daysAgo(30) }, B: { status: 'missing', checkedAt: daysAgo(30) } };
  const r = await verifyAssets({ urls: ['A', 'B', 'C'], previous, probe, now });
  assert.deepEqual(r.A, previous.A);
  assert.deepEqual(r.B, previous.B);
  assert.equal('C' in r, false);
});

test('ok entries are not re-probed; missing re-probed after recheckMissingDays', async () => {
  const { probe, calls } = probeFrom({ OK: 404, FRESH: 200, STALE: 200, NEW: 404 });
  const previous = {
    OK: { status: 'ok', checkedAt: daysAgo(400) },
    FRESH: { status: 'missing', checkedAt: daysAgo(6) },
    STALE: { status: 'missing', checkedAt: daysAgo(7) },
  };
  const r = await verifyAssets({ urls: ['OK', 'FRESH', 'STALE', 'NEW'], previous, probe, now, recheckMissingDays: 7 });
  assert.deepEqual(calls.sort(), ['NEW', 'STALE']);
  assert.equal(calls.length, 2);
  assert.deepEqual(r.OK, previous.OK);
  assert.deepEqual(r.FRESH, previous.FRESH);
  assert.deepEqual(r.STALE, { status: 'ok', checkedAt: NOW.toISOString() });
  assert.deepEqual(r.NEW, { status: 'missing', checkedAt: NOW.toISOString() });
});

test('Nebenlaeufigkeit ist begrenzt', async () => {
  let active = 0;
  let peak = 0;
  const probe = async () => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 2));
    active--;
    return 200;
  };
  const urls = Array.from({ length: 40 }, (_, i) => `U${i}`);
  const r = await verifyAssets({ urls, previous: {}, probe, now, concurrency: 4 });
  assert.equal(Object.keys(r).length, 40);
  assert.ok(peak <= 4, `peak ${peak}`);
});

test('classifyStatus: 2xx ok, 4xx fehlt, 401/403/408/429/5xx/null transient', () => {
  assert.equal(classifyStatus(200), 'ok');
  assert.equal(classifyStatus(404), 'missing');
  assert.equal(classifyStatus(400), 'missing');
  for (const s of [null, 401, 403, 408, 429, 500, 503]) assert.equal(classifyStatus(s), null);
});

test('countGroups: Gruppe fehlt nur, wenn alle Varianten fehlen', () => {
  const m = { status: 'missing', checkedAt: 'x' };
  const o = { status: 'ok', checkedAt: 'x' };
  const verified = { 'a.webp': o, 'b.webp': m, 'b.png': o, 'c.webp': m, 'c.png': m, 'd.webp': m };
  const groups = [['a.webp', 'a.png'], ['b.webp', 'b.png'], ['c.webp', 'c.png'], ['d.webp', 'd.png'], ['e.webp', 'e.png']];
  // a ok, b ok (png), c fehlt, d unbekannt (png ungeprueft), e unbekannt
  assert.deepEqual(countGroups(verified, groups), { ok: 2, missing: 1 });
});

test('verifySetAssets: png nur pruefen, wenn webp fehlt', async () => {
  const groups = [['a.webp', 'a.png'], ['b.webp', 'b.png']];
  const { probe, calls } = probeFrom({ 'a.webp': 200, 'b.webp': 404, 'b.png': 200 });
  const r = await verifySetAssets({ groups, previous: {}, probe, now });
  assert.deepEqual(calls, ['a.webp', 'b.webp', 'b.png']);
  assert.equal(r['a.png'], undefined);
  assert.equal(r['b.png'].status, 'ok');
});

test('updateVerifiedFile: schreibt sortiert, nur bei Aenderung', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-assets-'));
  const f = path.join(dir, 'assets-verified.json');
  const data = { b: { status: 'ok', checkedAt: 'x' }, a: { status: 'missing', checkedAt: 'y' } };
  assert.equal(updateVerifiedFile(f, data), true);
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(f, 'utf8'))), ['a', 'b']);
  assert.equal(updateVerifiedFile(f, { a: data.a, b: data.b }), false);
});
