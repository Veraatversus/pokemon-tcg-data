// Reine Pruefungen auf dem Matching-Report (vom CLI und von Tests genutzt).

// Unrundung: der Report zeigt die gerundete Quote, geprueft wird gegen matched/ptCards.
export function belowMinCardMatch(summary, min) {
  const ratio = summary.ptCards === 0 ? 1 : summary.matchedCards / summary.ptCards;
  return ratio < min;
}

const pairMap = (report) => new Map((report?.sets ?? []).map((s) => [s.pokemontcgId, s.tcgdexId]));

// Vergleicht den neuen Report mit dem zuletzt committeten (Paarliste, Ungepaarte, abgelehnte Mappings).
export function comparePairDrift(prev, next) {
  const before = pairMap(prev);
  const after = pairMap(next);
  const added = [];
  const removed = [];
  const changed = [];
  for (const [pt, td] of after) {
    if (!before.has(pt)) added.push({ pokemontcgId: pt, tcgdexId: td });
    else if (before.get(pt) !== td) changed.push({ pokemontcgId: pt, from: before.get(pt), to: td });
  }
  for (const [pt, td] of before) if (!after.has(pt)) removed.push({ pokemontcgId: pt, tcgdexId: td });
  const unmatchedPokemontcg = [...(next.unmatchedPokemontcg ?? [])];
  const rejectedMapping = (next.rejected ?? []).filter((r) => r.method === 'mapping');
  const messages = [
    ...added.map((a) => `Neues Paar: ${a.pokemontcgId} -> ${a.tcgdexId}`),
    ...removed.map((r) => `Entferntes Paar: ${r.pokemontcgId} -> ${r.tcgdexId}`),
    ...changed.map((c) => `Geaendertes Paar: ${c.pokemontcgId}: ${c.from} -> ${c.to}`),
    ...unmatchedPokemontcg.map((id) => `Ungepaartes pokemontcg-Set: ${id}`),
    ...rejectedMapping.map((r) => `Abgelehntes Mapping: ${r.pokemontcgId} <-> ${r.tcgdexId}: ${r.reason}`),
  ];
  return { drift: messages.length > 0, added, removed, changed, unmatchedPokemontcg, rejectedMapping, messages };
}
