import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// service-worker.js ist kein Modul: isFresh wird aus dem Quelltext extrahiert.
const src = readFileSync(fileURLToPath(new URL('../service-worker.js', import.meta.url)), 'utf8');
const m = src.match(/function isFresh\([^)]*\) \{[\s\S]*?\r?\n\}/);
assert.ok(m, 'isFresh in service-worker.js gefunden');
const isFresh = new Function(`${m[0]}; return isFresh;`)();
const DAY = 24 * 60 * 60 * 1000;

test('isFresh: jung -> frisch, alt/fehlend/Zukunft -> nicht frisch', () => {
  assert.equal(isFresh(1000, 1000 + DAY - 1, DAY), true);
  assert.equal(isFresh(1000, 1000 + DAY, DAY), false);
  assert.equal(isFresh(NaN, 5, DAY), false);
  assert.equal(isFresh(0, 5, DAY), true);
  assert.equal(isFresh(10, 5, DAY), false);
});
