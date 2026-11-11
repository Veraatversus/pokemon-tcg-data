// lowercase, "pt" -> ".", fuehrende Nullen jeder Zifferngruppe entfernen (sv03.5 -> sv3.5)
export function normalizeTcgdexSetId(id) {
  return String(id)
    .toLowerCase()
    .replace(/pt/g, '.')
    .replace(/\d+/g, (d) => String(parseInt(d, 10)));
}

// Kandidaten fuer die TCGdex-Set-ID zu einer pokemontcg-Set-ID. Mehrdeutige Faelle
// (z. B. cel25) loest spaeter die Plausibilitaetspruefung auf.
export function setIdCandidates(pokemontcgSetId) {
  const base = normalizeTcgdexSetId(pokemontcgSetId);
  const candidates = [base];
  const halfStep = base.replace(/(?<![\d.])(\d)5(?![\d.])/, '$1.5');
  if (!candidates.includes(halfStep)) candidates.push(halfStep);
  return candidates;
}
