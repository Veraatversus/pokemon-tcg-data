// Liest den eingefrorenen pokemontcg-Snapshot (Rohformat unveraendert).
import fs from 'node:fs';
import path from 'node:path';

export function loadPokemontcg(dir) {
  const sets = JSON.parse(fs.readFileSync(path.join(dir, 'sets', 'en.json'), 'utf8'));
  const cardsBySet = new Map();
  for (const set of sets) {
    const file = path.join(dir, 'cards', 'en', `${set.id}.json`);
    cardsBySet.set(set.id, fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : []);
  }
  return { sets, cardsBySet };
}
