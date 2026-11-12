import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Ein Modul darf im Browser nur unter EINEM Specifier (inkl. ?v=...) importiert werden,
// sonst entstehen zwei Modul-Instanzen mit getrenntem Zustand.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RE = /(?:from\s*|import\s*\(?\s*)['"](\.{1,2}\/[^'"\n]+)['"]/g;

function walk(dir, files = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, files);
    else if (p.endsWith('.js')) files.push(p);
  }
  return files;
}

export function collectSpecifiers() {
  const byModule = new Map();
  for (const file of walk(path.join(root, 'js'))) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(RE)) {
      const [spec, query = ''] = m[1].split('?');
      let target = path.relative(root, path.resolve(path.dirname(file), spec)).split(path.sep).join('/');
      if (!path.extname(target)) target += '.js';
      if (!byModule.has(target)) byModule.set(target, new Map());
      const q = byModule.get(target);
      if (!q.has(query)) q.set(query, []);
      q.get(query).push(path.relative(root, file).split(path.sep).join('/'));
    }
  }
  return byModule;
}

test('jedes Modul wird ueberall mit demselben Specifier importiert', () => {
  const offenders = [];
  for (const [target, queries] of collectSpecifiers()) {
    if (queries.size > 1) {
      offenders.push(`${target}: ${[...queries.keys()].map((q) => q || '(ohne ?v)').join(' | ')}`);
    }
  }
  assert.deepEqual(offenders, [], `Gemischte Specifier:\n${offenders.join('\n')}`);
});
