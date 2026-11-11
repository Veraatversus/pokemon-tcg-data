// Spiegelt das TCGdex-Repo (nur Text, nichts wird ausgefuehrt) nach sources/tcgdex/.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadTcgdexDatabase } from '../tcgdex/load-database.mjs';
import { parseTcgdexModule } from '../tcgdex/parse-module.mjs';
import { updateSourcesManifest } from './manifest.mjs';

const REPO = 'https://github.com/tcgdex/cards-database.git';
const ASSETS_URL = 'https://assets.tcgdex.net/datas.json';

export function reduceAssetsIndex(datas, langs = ['en', 'de', 'univ']) {
  return Object.fromEntries(langs.filter((l) => l in datas).map((l) => [l, datas[l]]));
}

// Nur bei geaendertem TCGdex-Commit wird gespiegelt. Folge: der Assets-Index (datas.json)
// wird nur zusammen mit einem Commit-Wechsel aktualisiert, nicht allein bei eigener Aenderung.
export function shouldUpdate(manifest, newCommit) {
  return manifest?.tcgdex?.commit !== newCommit;
}

function serieIdOf(file) {
  let id;
  try {
    id = parseTcgdexModule(fs.readFileSync(file, 'utf8'), file).exports.default?.id;
  } catch (e) {
    throw new Error(`Serie-Datei nicht parsebar (${file}): ${e.message}`);
  }
  if (typeof id !== 'string') throw new Error(`Serie-Datei ohne id (${file})`);
  return id;
}

// Nur regulaere Dateien und Ordner duerfen aus dem (nicht vertrauenswuerdigen) Upstream kommen.
export function classifyEntry(stat) {
  if (stat.isSymbolicLink()) return 'symlink';
  if (stat.isDirectory()) return 'dir';
  if (stat.isFile()) return 'file';
  return 'other';
}

function copyTree(src, dst) {
  const kind = classifyEntry(fs.lstatSync(src));
  if (kind === 'dir') {
    fs.mkdirSync(dst, { recursive: true });
    for (const name of fs.readdirSync(src)) copyTree(path.join(src, name), path.join(dst, name));
  } else if (kind === 'file') {
    fs.copyFileSync(src, dst);
  } else {
    throw new Error(`Unzulaessiger Eintrag im Upstream (${kind}): ${src}`);
  }
}

function copyData(srcData, dstData, excludeSerieIds) {
  fs.mkdirSync(dstData, { recursive: true });
  const entries = fs.readdirSync(srcData, { withFileTypes: true });
  const skip = new Set();
  for (const e of entries) {
    if (e.isFile() && e.name.endsWith('.ts') && excludeSerieIds.includes(serieIdOf(path.join(srcData, e.name)))) {
      skip.add(e.name);
      skip.add(e.name.slice(0, -3));
    }
  }
  for (const e of entries) {
    if (skip.has(e.name)) continue;
    copyTree(path.join(srcData, e.name), path.join(dstData, e.name));
  }
}

export function mirrorTcgdex({ cloneDir, targetDir, excludeSerieIds, assetsIndex }) {
  const tmpDir = `${targetDir}.tmp`;
  const oldDir = `${targetDir}.old`;
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.rmSync(oldDir, { recursive: true, force: true });
  try {
    if (!fs.existsSync(path.join(cloneDir, 'data'))) throw new Error(`Kein data/-Ordner in ${cloneDir}`);
    copyData(path.join(cloneDir, 'data'), path.join(tmpDir, 'data'), excludeSerieIds);
    for (const f of ['interfaces.d.ts', 'LICENSE', path.join('meta', 'legals.ts')]) {
      const src = path.join(cloneDir, f);
      if (!fs.existsSync(src)) continue;
      fs.mkdirSync(path.dirname(path.join(tmpDir, f)), { recursive: true });
      copyTree(src, path.join(tmpDir, f));
    }
    if (assetsIndex) fs.writeFileSync(path.join(tmpDir, 'assets-index.json'), `${JSON.stringify(assetsIndex)}\n`);

    const { sets, errors } = loadTcgdexDatabase(tmpDir, { excludeSerieIds });
    if (sets.length < 1) throw new Error('Plausibilitaetspruefung: kein Set geladen');
    if (errors.length > 0) throw new Error(`Plausibilitaetspruefung: ${errors.length} Fehler, z. B. ${errors[0].file}: ${errors[0].message}`);
    const result = { setCount: sets.length, cardCount: sets.reduce((n, s) => n + s.cards.length, 0) };

    const hadTarget = fs.existsSync(targetDir);
    if (hadTarget) fs.renameSync(targetDir, oldDir);
    try {
      fs.renameSync(tmpDir, targetDir);
    } catch (e) {
      if (hadTarget) fs.renameSync(oldDir, targetDir);
      throw e;
    }
    fs.rmSync(oldDir, { recursive: true, force: true });
    return result;
  } catch (e) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw e;
  }
}

// Klont TCGdex (sparse) nach cloneDir und liefert Commit und Branch.
// Liefert den HEAD-Commit des Remote ohne zu klonen.
function lsRemoteHead() {
  const out = execFileSync('git', ['ls-remote', REPO, 'HEAD'], { encoding: 'utf8' }).trim();
  const sha = out.split(/\s+/)[0];
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`git ls-remote: unerwartete Ausgabe: ${out}`);
  return sha;
}

function cloneTcgdex(cloneDir) {
  const git = (...args) => execFileSync('git', args, { cwd: cloneDir, encoding: 'utf8' }).trim();
  execFileSync('git', ['clone', '--depth', '1', '--filter=blob:none', '--sparse', REPO, cloneDir], { stdio: 'inherit' });
  git('sparse-checkout', 'set', '--no-cone', '/data/', '/meta/', '/interfaces.d.ts', '/LICENSE');
  return { commit: git('rev-parse', 'HEAD'), ref: git('rev-parse', '--abbrev-ref', 'HEAD') };
}

async function fetchAssets() {
  const res = await fetch(ASSETS_URL);
  if (!res.ok) throw new Error(`${ASSETS_URL}: HTTP ${res.status}`);
  return res.json();
}

// Abhaengigkeiten injizierbar (Tests); main() verdrahtet die echten.
export async function runSync({ repoRoot, cloneTcgdex: clonePort = cloneTcgdex, lsRemoteHead: headPort = lsRemoteHead, fetchAssets: assetsPort = fetchAssets, now = () => new Date() }) {
  const sourcesDir = path.join(repoRoot, 'sources');
  const manifestFile = path.join(sourcesDir, 'SOURCES.json');
  const manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : {};
  const remoteHead = headPort();
  if (!shouldUpdate(manifest, remoteHead)) {
    console.log(`TCGdex unveraendert (${remoteHead})`);
    return { updated: false, commit: remoteHead };
  }
  const clone = fs.mkdtempSync(path.join(os.tmpdir(), 'tcgdex-clone-'));
  try {
    const { commit, ref } = clonePort(clone);
    if (!shouldUpdate(manifest, commit)) {
      console.log(`TCGdex unveraendert (${commit})`);
      return { updated: false, commit };
    }
    const assetsIndex = reduceAssetsIndex(await assetsPort());
    const result = mirrorTcgdex({ cloneDir: clone, targetDir: path.join(sourcesDir, 'tcgdex'), excludeSerieIds: ['tcgp'], assetsIndex });
    updateSourcesManifest(manifestFile, 'tcgdex', {
      repo: 'tcgdex/cards-database', ref, commit, fetchedAt: now().toISOString(), status: 'active',
    });
    console.log(`TCGdex ${commit}: ${result.setCount} Sets, ${result.cardCount} Karten`);
    return { updated: true, commit, ...result };
  } finally {
    fs.rmSync(clone, { recursive: true, force: true });
  }
}

async function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  await runSync({ repoRoot });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
