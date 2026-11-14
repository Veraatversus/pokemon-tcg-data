// Einmaliger Lauf: friert cards/en, sets/en.json, decks/en des Commits FREEZE_COMMIT nach
// sources/pokemontcg/ ein. Inhalte kommen aus den Git-Blobs (nicht aus dem Working Tree),
// damit sie auf jeder Plattform byte-identisch sind (kein autocrlf).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { updateSourcesManifest } from './manifest.mjs';

export const FREEZE_COMMIT = 'bc4a5871a2468e9f3fb8aaf0916c72255ed90d99';
export const FREEZE_PATHS = ['cards/en', 'sets/en.json', 'decks/en'];

export function freezePokemontcg({ repoRoot, commit = FREEZE_COMMIT, targetDir, paths = FREEZE_PATHS }) {
  const git = (args) => execFileSync('git', args, { cwd: repoRoot, maxBuffer: 1 << 28 });
  const listing = git(['ls-tree', '-r', '-z', commit, '--', ...paths]).toString('utf8').split('\0').filter(Boolean);
  if (listing.length === 0) throw new Error(`Keine Dateien in ${commit} fuer ${paths.join(', ')}`);
  const files = [];
  for (const line of listing) {
    const tab = line.indexOf('\t');
    const [, type, oid] = line.slice(0, tab).split(' ');
    if (type !== 'blob') continue;
    files.push({ rel: line.slice(tab + 1), oid });
  }
  fs.rmSync(targetDir, { recursive: true, force: true });
  for (const { rel, oid } of files) {
    const dst = path.join(targetDir, ...rel.split('/'));
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, git(['cat-file', 'blob', oid]));
  }
  return { fileCount: files.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // --commit <sha>: anderer (gemergter) Stand, z. B. aus .github/workflows/update-pokemontcg.yml.
  const { values } = parseArgs({ options: { commit: { type: 'string' } } });
  const commit = values.commit ?? FREEZE_COMMIT;
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error(`--commit braucht einen vollen Commit-Hash: ${commit}`);
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const { fileCount } = freezePokemontcg({ repoRoot, commit, targetDir: path.join(repoRoot, 'sources', 'pokemontcg') });
  updateSourcesManifest(path.join(repoRoot, 'sources', 'SOURCES.json'), 'pokemontcg', {
    repo: 'PokemonTCG/pokemon-tcg-data + JulienGitHub/pokemon-tcg-data (gemergt)',
    ref: 'master',
    commit,
    fetchedAt: new Date().toISOString(),
    status: 'frozen',
  });
  console.log(`pokemontcg eingefroren bei ${commit} (${fileCount} Dateien)`);
}
