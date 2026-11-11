// Liest den eingefrorenen pokemontcg-Snapshot (Rohformat unveraendert).
import fs from 'node:fs';
import path from 'node:path';

// Kartendateien ohne Eintrag in sets/en.json (z. B. mep, aus dem Julien-Upstream) liefern ein
// synthetisiertes Set: name = Set-Id (keine Namensquelle vorhanden), series aus den Karten falls
// vorhanden, Zaehler = Kartenanzahl. `synthesized: true` markiert diese Eintraege.
export function loadPokemontcg(dir) {
  const sets = JSON.parse(fs.readFileSync(path.join(dir, 'sets', 'en.json'), 'utf8'));
  const cardsBySet = new Map();
  const readCards = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const set of sets) {
    const file = path.join(dir, 'cards', 'en', `${set.id}.json`);
    cardsBySet.set(set.id, fs.existsSync(file) ? readCards(file) : []);
  }
  const cardsDir = path.join(dir, 'cards', 'en');
  const known = new Set(sets.map((s) => s.id));
  const orphans = fs.existsSync(cardsDir)
    ? fs.readdirSync(cardsDir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).filter((id) => !known.has(id)).sort()
    : [];
  for (const id of orphans) {
    const cards = readCards(path.join(cardsDir, `${id}.json`));
    cardsBySet.set(id, cards);
    sets.push({
      id, name: id, series: cards.find((c) => c.set?.series)?.set.series ?? null,
      printedTotal: cards.length, total: cards.length, ptcgoCode: null, releaseDate: null, synthesized: true,
    });
  }
  return { sets, cardsBySet };
}
