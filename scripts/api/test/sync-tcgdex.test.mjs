import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mirrorTcgdex, reduceAssetsIndex, shouldUpdate, runSync, classifyEntry } from '../sources/sync-tcgdex.mjs';
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

test('nicht parsebare Serie-Datei bricht den Mirror ab, Ziel bleibt unverändert', () => {
  const target = path.join(tmp(), 'tcgdex');
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, 'marker'), 'alt');
  for (const body of ['this is not ( valid', 'export default { name: "x" }']) {
    const clone = makeClone();
    fs.writeFileSync(path.join(clone, 'data', 'Pokémon TCG Pocket.ts'), body);
    assert.throws(() => mirrorTcgdex({ cloneDir: clone, targetDir: target, excludeSerieIds: ['tcgp'] }), /Serie-Datei/);
    assert.equal(fs.readFileSync(path.join(target, 'marker'), 'utf8'), 'alt');
    assert.ok(!fs.existsSync(`${target}.tmp`));
  }
});

test('shouldUpdate: nur bei geaendertem Commit (oder fehlendem Manifest-Eintrag)', () => {
  assert.equal(shouldUpdate({ tcgdex: { commit: 'abc' } }, 'abc'), false);
  assert.equal(shouldUpdate({ tcgdex: { commit: 'abc' } }, 'def'), true);
  assert.equal(shouldUpdate({}, 'abc'), true);
  assert.equal(shouldUpdate(null, 'abc'), true);
});

test('runSync: unveraenderter Commit -> kein Mirror, SOURCES.json byte-identisch', async () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'sources'));
  const manifestFile = path.join(root, 'sources', 'SOURCES.json');
  updateSourcesManifest(manifestFile, 'tcgdex', { commit: 'abc', fetchedAt: 'alt' });
  const before = fs.readFileSync(manifestFile);
  let fetched = false;
  const r = await runSync({
    repoRoot: root,
    lsRemoteHead: () => 'abc',
    cloneTcgdex: () => ({ commit: 'abc', ref: 'master' }),
    fetchAssets: async () => { fetched = true; return {}; },
  });
  assert.equal(r.updated, false);
  assert.equal(fetched, false);
  assert.ok(fs.readFileSync(manifestFile).equals(before));
  assert.equal(fs.existsSync(path.join(root, 'sources', 'tcgdex')), false);
});

test('runSync: geaenderter Commit -> Mirror und Manifest aktualisiert', async () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'sources'));
  const manifestFile = path.join(root, 'sources', 'SOURCES.json');
  updateSourcesManifest(manifestFile, 'tcgdex', { commit: 'abc', fetchedAt: 'alt' });
  const r = await runSync({
    repoRoot: root,
    lsRemoteHead: () => 'def',
    cloneTcgdex: (dir) => { fs.cpSync(makeClone(), dir, { recursive: true }); return { commit: 'def', ref: 'master' }; },
    fetchAssets: async () => ({ en: { a: 1 }, fr: {} }),
    now: () => new Date('2026-01-02T03:04:05Z'),
  });
  assert.equal(r.updated, true);
  const m = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  assert.equal(m.tcgdex.commit, 'def');
  assert.equal(m.tcgdex.fetchedAt, '2026-01-02T03:04:05.000Z');
  assert.ok(fs.existsSync(path.join(root, 'sources', 'tcgdex', 'data')));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'sources', 'tcgdex', 'assets-index.json'), 'utf8')), { en: { a: 1 } });
});

test('runSync: force spiegelt trotz unveraendertem Commit', async () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'sources'));
  const manifestFile = path.join(root, 'sources', 'SOURCES.json');
  updateSourcesManifest(manifestFile, 'tcgdex', { commit: 'abc', fetchedAt: 'alt' });
  const port = {
    repoRoot: root,
    lsRemoteHead: () => 'abc',
    cloneTcgdex: (dir) => { fs.cpSync(makeClone(), dir, { recursive: true }); return { commit: 'abc', ref: 'master' }; },
    fetchAssets: async () => ({ en: {} }),
  };
  assert.equal((await runSync(port)).updated, false);
  const r = await runSync({ ...port, force: true });
  assert.equal(r.updated, true);
  assert.ok(fs.readdirSync(path.join(root, 'sources', 'tcgdex', 'data')).some((n) => n.startsWith('Pokémon TCG Pocket')));
});

test('classifyEntry: nur Datei und Ordner sind zulaessig', () => {
  const st = (o) => ({ isSymbolicLink: () => false, isDirectory: () => false, isFile: () => false, ...o });
  assert.equal(classifyEntry(st({ isFile: () => true })), 'file');
  assert.equal(classifyEntry(st({ isDirectory: () => true })), 'dir');
  assert.equal(classifyEntry(st({ isSymbolicLink: () => true, isFile: () => true })), 'symlink');
  assert.equal(classifyEntry(st({})), 'other');
});

test('Symlink im Upstream bricht den Mirror ab, Ziel bleibt unveraendert', (t) => {
  const clone = makeClone();
  const target = path.join(tmp(), 'tcgdex');
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, 'marker'), 'alt');
  try {
    fs.symlinkSync(os.tmpdir(), path.join(clone, 'data', 'Mega Evolution', 'link'), 'junction');
  } catch (e) {
    if (e.code === 'EPERM') return t.skip('symlinks not permitted');
    throw e;
  }
  assert.throws(() => mirrorTcgdex({ cloneDir: clone, targetDir: target, excludeSerieIds: ['tcgp'] }), /Unzulaessiger Eintrag/);
  assert.equal(fs.readFileSync(path.join(target, 'marker'), 'utf8'), 'alt');
  assert.ok(!fs.existsSync(`${target}.tmp`));
});

test('runSync: unveraenderter Remote-HEAD -> kein Klon', async () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'sources'));
  const manifestFile = path.join(root, 'sources', 'SOURCES.json');
  updateSourcesManifest(manifestFile, 'tcgdex', { commit: 'abc', fetchedAt: 'alt' });
  const before = fs.readFileSync(manifestFile);
  let cloned = false;
  const r = await runSync({
    repoRoot: root,
    lsRemoteHead: () => 'abc',
    cloneTcgdex: () => { cloned = true; return { commit: 'abc', ref: 'master' }; },
  });
  assert.equal(r.updated, false);
  assert.equal(r.commit, 'abc');
  assert.equal(cloned, false);
  assert.ok(fs.readFileSync(manifestFile).equals(before));
});

test('runSync: geaenderter Remote-HEAD -> Klon; Nachpruefung bleibt als Sicherheitsnetz', async () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'sources'));
  updateSourcesManifest(path.join(root, 'sources', 'SOURCES.json'), 'tcgdex', { commit: 'abc', fetchedAt: 'alt' });
  let cloned = false;
  const r = await runSync({
    repoRoot: root,
    lsRemoteHead: () => 'def',
    // Klon liefert (Race) wieder den bekannten Commit -> kein Mirror
    cloneTcgdex: () => { cloned = true; return { commit: 'abc', ref: 'master' }; },
  });
  assert.equal(cloned, true);
  assert.equal(r.updated, false);
});
