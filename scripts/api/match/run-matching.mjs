// Gemeinsame Verdrahtung von Set- und Karten-Matching (build-matching.mjs und build-api.mjs).
import { matchSets } from './match-sets.mjs';
import { matchCards } from './match-cards.mjs';

export function runMatching({ ptSets, ptCardsBySet, tcgdexSets, setMap, cardMap }) {
  const setResult = matchSets({ ptSets, tcgdexSets, ptCardsBySet, setMap });
  const tcgdexSetsById = new Map(tcgdexSets.map((s) => [s.id, s]));
  const cardResults = new Map();
  for (const pair of setResult.pairs) {
    cardResults.set(pair.pokemontcgId, matchCards({
      ptCards: ptCardsBySet.get(pair.pokemontcgId) ?? [],
      tcgdexSet: tcgdexSetsById.get(pair.tcgdexId),
      tcgdexSetsById,
      cardMap: cardMap?.[pair.pokemontcgId],
    }));
  }
  return { setResult, cardResults, tcgdexSetsById };
}
