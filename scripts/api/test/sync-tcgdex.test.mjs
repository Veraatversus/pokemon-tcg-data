import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mirrorTcgdex, reduceAssetsIndex } from '../sources/sync-tcgdex.mjs';
import { updateSourcesManifest } from '../sources/manifest.mjs';

const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'tcgdex');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sync-tcgdex-'));

function makeClone() {
  const clone = tmp();
  fs.cpSync(fixture, clone, { recursive: true });
  fs.writeFileSync(path.join(clone, 'interfaces.d.ts'), 'export {}\n');
  fs.writeFileSync(path.join(clone, 'LICENSE'), 'MIT\n');
  fs.mkdirSync(path.join(clone, 'meta'));
  fs.writeFileSync(path.join(clone, 'meta', 'legals.ts'), 'export default {}\n');
  return clone;
}

test('mirror kopiert ohne Pocket und ersetzt atomar', () => {
  const clone = makeClone();
  const target = path.join(tmp(), 'tcgdex');
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, 'marker'), 'alt');
  const res = mirrorTcgdex({ cloneDir: clone, targetDir: target, excludeSerieIds: ['tcgp'], assetsIndex: { en: {} } });
  assert.equal(res.setCount, 2);
  assert.ok(res.cardCount > 0);
  const names = fs.readdirSync(path.join(target, 'data'));
  assert.ok(names.length > 0);
  assert.ok(!names.some((n) => n.startsWith('Pokémon TCG Pocket')));
  assert.ok(names.includes('Mega Evolution.ts'));
  for (const f of ['interfaces.d.ts', 'LICENSE', 'assets-index.json']) assert.ok(fs.existsSync(path.join(target, f)), f);
  assert.ok(fs.existsSync(path.join(target, 'meta', 'legals.ts')));
  assert.ok(!fs.existsSync(path.join(target, 'marker')));
  assert.ok(!fs.existsSync(target + '.tmp'));
});

test('leeres oder kaputtes cloneDir lässt Ziel unverändert', () => {
  const target = path.join(tmp(), 'tcgdex');
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, 'marker'), 'alt');
  const emptyDir = tmp();
  assert.throws(() => mirrorTcgdex({ cloneDir: emptyDir, targetDir: target, excludeSerieIds: ['tcgp'] }));
  assert.equal(fs.readFileSync(path.join(target, 'marker'), 'utf8'), 'alt');
  assert.ok(!fs.existsSync(target + '.tmp'));

  const broken = makeClone();
  const card = path.join(broken, 'data', 'Mega Evolution', 'Pitch Black');
  fs.writeFileSync(path.join(card, fs.readdirSync(card)[0]), 'import x from "./nope"; throw new Error("x")');
  assert.throws(() => mirrorTcgdex({ cloneDir: broken, targetDir: target, excludeSerieIds: ['tcgp'] }));
  assert.equal(fs.readFileSync(path.join(target, 'marker'), 'utf8'), 'alt');
});

test('reduceAssetsIndex behält nur en/de/univ', () =>
  assert.deepEqual(Object.keys(reduceAssetsIndex({ en: {}, de: {}, fr: {}, univ: {} })).sort(), ['de', 'en', 'univ']));

test('updateSourcesManifest ergänzt und sortiert Einträge stabil', () => {
  const file = path.join(tmp(), 'SOURCES.json');
  const e = (repo) => ({ status: 'active', repo, ref: 'main', fetchedAt: '2026-01-01T00:00:00Z', commit: 'abc' });
  updateSourcesManifest(file, 'tcgdex', e('r1'));
  updateSourcesManifest(file, 'pokemontcg', { ...e('r2'), status: 'frozen' });
  const text = fs.readFileSync(file, 'utf8');
  assert.ok(text.endsWith('}\n'));
  const parsed = JSON.parse(text);
  assert.deepEqual(Object.keys(parsed), ['pokemontcg', 'tcgdex']);
  assert.deepEqual(Object.keys(parsed.tcgdex), ['commit', 'fetchedAt', 'ref', 'repo', 'status']);
  updateSourcesManifest(file, 'tcgdex', e('r3'));
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).tcgdex.repo, 'r3');
});
