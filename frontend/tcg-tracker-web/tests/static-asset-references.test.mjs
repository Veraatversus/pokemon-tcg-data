import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function isLocalReference(value) {
  if (!value) return false;
  return !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#|data:)/i.test(value);
}

function toLocalPath(value) {
  return value.split('#')[0].split('?')[0];
}

function collectReferences(html) {
  const refs = [];
  const pattern = /(?<![-\w])(?:href|src)\s*=\s*"([^"]*)"/g;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    if (isLocalReference(match[1])) refs.push(toLocalPath(match[1]));
  }
  return refs.filter(Boolean);
}

for (const fileName of ['index.html', 'index-landingpage.html', 'privacy.html', 'kontakt.html']) {
  test(`${fileName}: jeder lokale href/src existiert`, () => {
    const html = fs.readFileSync(path.join(ROOT, fileName), 'utf8');
    const missing = collectReferences(html)
      .filter((ref) => !ref.startsWith('/'))
      .filter((ref) => !fs.existsSync(path.resolve(ROOT, ref)));
    assert.deepEqual(missing, []);
  });
}

test('service-worker.js: jede Datei der Vorladeliste existiert', () => {
  const source = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');
  const block = source.match(/const STATIC_ASSETS = \[([\s\S]*?)\];/);
  assert.ok(block, 'STATIC_ASSETS nicht gefunden');
  const entries = [...block[1].matchAll(/'([^']+)'|"([^"]+)"/g)].map((m) => m[1] || m[2]);
  assert.ok(entries.length > 0);
  const missing = entries
    .filter(isLocalReference)
    .map(toLocalPath)
    .filter((ref) => ref && ref !== '/' && ref !== './')
    .filter((ref) => !fs.existsSync(path.resolve(ROOT, ref.replace(/^\//, ''))));
  assert.deepEqual(missing, []);
});
