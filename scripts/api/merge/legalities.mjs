import fs from 'node:fs';
import { parseTcgdexModule } from '../tcgdex/parse-module.mjs';

// Liest meta/legals.ts (wird nie ausgefuehrt) -> { standard, expanded }.
export function loadLegals(filePath) {
  const { exports } = parseTcgdexModule(fs.readFileSync(filePath, 'utf8'), filePath);
  return { standard: exports.standard, expanded: exports.expanded };
}

function legalIn(filter, { tcgdexSetId, serieId, localId, regulationMark }) {
  if (!filter) return false;
  const inc = filter.includes ?? {};
  const exc = filter.excludes ?? {};
  const included = (inc.series ?? []).includes(serieId)
    || (inc.sets ?? []).includes(tcgdexSetId)
    || (regulationMark != null && (inc.regulationMark ?? []).includes(regulationMark));
  if (!included) return false;
  if ((exc.sets ?? []).includes(tcgdexSetId)) return false;
  if ((exc.cards ?? []).includes(`${tcgdexSetId}-${localId}`)) return false;
  return true;
}

export function deriveLegalities(card, legals) {
  const out = { unlimited: 'Legal' };
  if (legalIn(legals.standard, card)) out.standard = 'Legal';
  if (legalIn(legals.expanded, card)) out.expanded = 'Legal';
  return out;
}
