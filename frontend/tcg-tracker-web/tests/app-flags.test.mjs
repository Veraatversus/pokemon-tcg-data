// Schalterdatei app-flags.json: nur ein JSON-Objekt mit browseWithoutLogin === true schaltet den Stoebermodus ein.
// Fehler jeder Art (HTTP, kein JSON, Netzwerk, falscher Typ) -> aus (sicherer Zustand).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAppFlags } from '../js/core/app-flags.js';

const respond = (body, { ok = true, status = 200 } = {}) => async () => ({
  ok, status,
  json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
});

test('browseWithoutLogin true -> an', async () => {
  assert.deepEqual(await loadAppFlags({ fetchImpl: respond({ browseWithoutLogin: true }) }), { browseWithoutLogin: true });
});

test('falscher Typ ("yes") -> aus', async () => {
  assert.deepEqual(await loadAppFlags({ fetchImpl: respond({ browseWithoutLogin: 'yes' }) }), { browseWithoutLogin: false });
});

test('HTTP 404 -> aus', async () => {
  assert.deepEqual(await loadAppFlags({ fetchImpl: respond({ browseWithoutLogin: true }, { ok: false, status: 404 }) }), { browseWithoutLogin: false });
});

test('HTML statt JSON -> aus', async () => {
  assert.deepEqual(await loadAppFlags({ fetchImpl: respond('<!doctype html><p>404</p>') }), { browseWithoutLogin: false });
});

test('Netzwerkfehler -> aus', async () => {
  const fetchImpl = async () => { throw new Error('offline'); };
  assert.deepEqual(await loadAppFlags({ fetchImpl }), { browseWithoutLogin: false });
});

test('laedt ohne Cache mit Zeitstempel', async () => {
  let seen;
  const fetchImpl = async (url, opts) => { seen = { url, opts }; return { ok: true, status: 200, json: async () => ({ browseWithoutLogin: true }) }; };
  await loadAppFlags({ fetchImpl });
  assert.match(seen.url, /^app-flags\.json\?t=\d+$/);
  assert.equal(seen.opts.cache, 'no-store');
});
