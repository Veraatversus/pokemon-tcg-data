import fs from 'node:fs';
import { parseTcgdexModule } from '../tcgdex/parse-module.mjs';

// Liest meta/legals.ts (wird nie ausgefuehrt) -> { standard, expanded }.
export function loadLegals(filePath) {
  const { exports } = parseTcgdexModule(fs.readFileSync(filePath, 'utf8'), filePath);
  return { standard: exports.standard, expanded: exports.expanded };
}

// legals.ts nutzt TCGdex-Compiler-Set-Ids ohne Punkte (z. B. "sm35-45"), unsere
// TCGdex-Set-Ids haben sie ("sm3.5"). Vergleich daher exakt ODER ohne Punkte.
const undot = (s) => String(s).replaceAll(".", "");
const has = (list, v) => (list ?? []).some((x) => x === v || undot(x) === undot(v));

function legalIn(filter, { tcgdexSetId, serieId, localId, regulationMark }) {
  if (!filter) return false;
  const inc = filter.includes ?? {};
  const exc = filter.excludes ?? {};
  const included = (inc.series ?? []).includes(serieId)
    || has(inc.sets, tcgdexSetId)
    || (regulationMark != null && (inc.regulationMark ?? []).includes(regulationMark));
  if (!included) return false;
  if (has(exc.sets, tcgdexSetId)) return false;
  if (has(exc.cards, `${tcgdexSetId}-${localId}`)) return false;
  return true;
}

export function deriveLegalities(card, legals) {
  const out = { unlimited: 'Legal' };
  if (legalIn(legals.standard, card)) out.standard = 'Legal';
  if (legalIn(legals.expanded, card)) out.expanded = 'Legal';
  return out;
}
