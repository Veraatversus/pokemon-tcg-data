// Gleiche ?v=-Version ueberall, und schema-contract.js (haelt den geteilten Serien-/Set-Meta-Zustand) wird
// ueberall versioniert importiert: sonst liefert der Browser-Cache veraltete Module bzw. mehrere Instanzen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const version = JSON.parse(readFileSync(path.join(root, 'version.config.json'), 'utf8')).appVersion;
const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = path.join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

test('alle ?v=-Queries in js/ und index.html entsprechen version.config.json', () => {
  const files = [...walk(path.join(root, 'js')), path.join(root, 'index.html')].filter((f) => /\.(js|html)$/.test(f));
  for (const f of files) {
    for (const m of readFileSync(f, 'utf8').matchAll(/\?v=([A-Za-z0-9._-]+)/g)) {
      assert.equal(m[1], version, `${path.relative(root, f)}: ${m[0]}`);
    }
  }
});

test('schema-contract.js wird in js/ nur versioniert importiert', () => {
  for (const f of walk(path.join(root, 'js')).filter((p) => p.endsWith('.js'))) {
    for (const m of readFileSync(f, 'utf8').matchAll(/from\s+['"]([^'"]*schema-contract\.js[^'"]*)['"]/g)) {
      assert.ok(m[1].endsWith(`?v=${version}`), `${path.relative(root, f)}: ${m[1]}`);
    }
  }
});
