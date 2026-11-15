import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'js');

function listJsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listJsFiles(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

// Liefert die lokalen Namen aller Importe, die ausserhalb der Importanweisung nie vorkommen.
function findUnusedImports(source) {
  const code = stripComments(source);
  const importRe = /import\s+([^'";]*?)\s*from\s*['"][^'"]+['"]\s*;?/g;
  const locals = [];
  for (const match of code.matchAll(importRe)) {
    const clause = match[1];
    const named = clause.match(/\{([^}]*)\}/);
    if (named) {
      for (const part of named[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/).pop().trim();
        if (name) locals.push(name);
      }
    }
    const rest = clause.replace(/\{[^}]*\}/, '');
    const star = rest.match(/\*\s*as\s+([\w$]+)/);
    if (star) locals.push(star[1]);
    const def = rest.replace(/\*\s*as\s+[\w$]+/, '').replace(/,/g, ' ').trim();
    if (def) locals.push(def.split(/\s+/)[0]);
  }
  const body = code.replace(importRe, '');
  return locals.filter((name) => {
    const escaped = name.replace(/\$/g, '\\$');
    return !new RegExp(`(^|[^\\w$.]|\\.\\.\\.)${escaped}(?![\\w$])`).test(body);
  });
}

test('jedes Modul unter js/ verwendet jeden importierten Namen', () => {
  const problems = [];
  for (const file of listJsFiles(jsRoot)) {
    const unused = findUnusedImports(fs.readFileSync(file, 'utf8'));
    if (unused.length) problems.push(`${path.relative(jsRoot, file)}: ${unused.join(', ')}`);
  }
  assert.deepEqual(problems, []);
});
