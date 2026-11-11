// Einmaliger Lauf: friert den Root-Stand (cards/en, sets/en.json, decks/en) nach sources/pokemontcg/ ein.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { updateSourcesManifest } from './manifest.mjs';

const FREEZE_COMMIT = 'bc4a5871a2468e9f3fb8aaf0916c72255ed90d99';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const target = path.join(repoRoot, 'sources', 'pokemontcg');
fs.rmSync(target, { recursive: true, force: true });
for (const rel of [['cards', 'en'], ['sets', 'en.json'], ['decks', 'en']]) {
  const src = path.join(repoRoot, ...rel);
  const dst = path.join(target, ...rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.cpSync(src, dst, { recursive: true });
}
updateSourcesManifest(path.join(repoRoot, 'sources', 'SOURCES.json'), 'pokemontcg', {
  repo: 'PokemonTCG/pokemon-tcg-data + JulienGitHub/pokemon-tcg-data (gemergt)',
  ref: 'master',
  commit: FREEZE_COMMIT,
  fetchedAt: new Date().toISOString(),
  status: 'frozen',
});
console.log(`pokemontcg eingefroren bei ${FREEZE_COMMIT}`);
