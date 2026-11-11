// Lernt Zuordnungstabellen (TCGdex-Wert -> pokemontcg-Wert) per Mehrheitsentscheidung
// aus bereits zugeordneten Kartenpaaren. Eintraege mit weniger als MIN_SUPPORT
// Belegen werden verworfen; bei Gleichstand gewinnt der kleinere JSON-String.
// Schluesselformate (leere Teile bleiben leer, Trenner '|'):
//   rarity:    tcgdex.rarity
//   subtypes:  stage|suffix|trainerType|energyType
//   supertype: category
//   rules:     suffix|stage|rarity
export const MIN_SUPPORT = 3;

export const subtypesKey = (c) => [c.stage, c.suffix, c.trainerType, c.energyType].map((v) => v ?? '').join('|');
export const rulesKey = (c) => [c.suffix, c.stage, c.rarity].map((v) => v ?? '').join('|');

function tally() {
  const m = new Map(); // key -> Map(json -> {n, value})
  return {
    add(key, value) {
      const json = JSON.stringify(value);
      if (!m.has(key)) m.set(key, new Map());
      const inner = m.get(key);
      const e = inner.get(json) ?? { n: 0, value };
      e.n++;
      inner.set(json, e);
    },
    result() {
      const out = {};
      for (const key of [...m.keys()].sort()) {
        const inner = m.get(key);
        const total = [...inner.values()].reduce((a, e) => a + e.n, 0);
        if (total < MIN_SUPPORT) continue;
        const [, best] = [...inner.entries()].sort((a, b) => b[1].n - a[1].n || (a[0] < b[0] ? -1 : 1))[0];
        out[key] = best.value;
      }
      return out;
    },
  };
}

export function learnTables(matchedPairs) {
  const rarity = tally();
  const subtypes = tally();
  const supertype = tally();
  const rules = tally();
  for (const { ptCard, tcgdexCard: td } of matchedPairs) {
    if (td.rarity && ptCard.rarity) rarity.add(td.rarity, ptCard.rarity);
    if (td.category && ptCard.supertype) supertype.add(td.category, ptCard.supertype);
    if (Array.isArray(ptCard.subtypes)) subtypes.add(subtypesKey(td), ptCard.subtypes);
    rules.add(rulesKey(td), Array.isArray(ptCard.rules) ? ptCard.rules : []);
  }
  return { rarity: rarity.result(), subtypes: subtypes.result(), supertype: supertype.result(), rules: rules.result() };
}
