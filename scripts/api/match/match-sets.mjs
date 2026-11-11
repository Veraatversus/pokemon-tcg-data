import { cardMatchKey } from '../lib/card-key.mjs';
import { setIdCandidates, normalizeTcgdexSetId } from '../lib/set-id.mjs';
import { normalizeName } from '../lib/names.mjs';

const METHODS = ['mapping', 'exactId', 'normalizedId', 'codeAndDate', 'nameAndDate'];
const DAY = 86400000;

function parseDate(value) {
  const m = /^(\d{4})[/-](\d{2})[/-](\d{2})/.exec(String(value ?? ''));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null;
}

function withinDays(a, b, days) {
  const x = parseDate(a);
  const y = parseDate(b);
  return x !== null && y !== null && Math.abs(x - y) <= days * DAY;
}

function bestMethod(pt, td) {
  if (String(pt.id).toLowerCase() === String(td.id).toLowerCase()) return 'exactId';
  if (setIdCandidates(pt.id).includes(normalizeTcgdexSetId(td.id))) return 'normalizedId';
  const code = String(pt.ptcgoCode ?? '').trim().toLowerCase();
  const abbr = String(td.abbreviationOfficial ?? '').trim().toLowerCase();
  if (code && code === abbr && withinDays(pt.releaseDate, td.releaseDate, 7)) return 'codeAndDate';
  const ptName = normalizeName(pt.name ?? '');
  if (ptName && ptName === normalizeName(td.name?.en ?? '') && withinDays(pt.releaseDate, td.releaseDate, 31)) {
    return 'nameAndDate';
  }
  return null;
}

function overlapOf(ptCards, td) {
  if (!ptCards.length) return 0;
  const keys = new Set((td.cards ?? []).map((c) => cardMatchKey(c.localId)));
  return ptCards.filter((c) => keys.has(cardMatchKey(c.number))).length / ptCards.length;
}

function plausibility(ptCards, td) {
  const overlap = overlapOf(ptCards, td);
  const a = ptCards.length;
  const b = (td.cards ?? []).length;
  const max = Math.max(a, b);
  const deviation = max === 0 ? 0 : Math.abs(a - b) / max;
  return { overlap, ok: overlap >= 0.9 || deviation <= 0.1, deviation };
}

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export function matchSets({ ptSets, tcgdexSets, ptCardsBySet, setMap }) {
  const ptById = new Map(ptSets.map((s) => [s.id, s]));
  const tdById = new Map(tcgdexSets.map((s) => [s.id, s]));
  const cardsOf = (id) => ptCardsBySet.get(id) ?? [];

  const rejected = [];
  const candidates = []; // { pt, td, method, overlap }

  // Mapping: Reihenfolge der Datei bleibt fuer 1:1-Konflikte massgeblich.
  for (const m of setMap?.pairs ?? []) {
    const pt = ptById.get(m.pokemontcg);
    const td = tdById.get(m.tcgdex);
    if (!pt || !td) {
      rejected.push({
        pokemontcgId: m.pokemontcg, tcgdexId: m.tcgdex, method: 'mapping',
        reason: `Mapping verweist auf unbekanntes ${!pt ? 'pokemontcg' : 'TCGdex'}-Set`,
      });
      continue;
    }
    candidates.push({ pt, td, method: 'mapping', overlap: overlapOf(cardsOf(pt.id), td) });
  }

  for (const pt of ptSets) {
    for (const td of tcgdexSets) {
      const method = bestMethod(pt, td);
      if (!method) continue;
      const p = plausibility(cardsOf(pt.id), td);
      if (!p.ok) {
        rejected.push({
          pokemontcgId: pt.id, tcgdexId: td.id, method,
          reason: `nicht plausibel: overlap ${p.overlap.toFixed(2)} < 0.9 und Kartenzahl-Abweichung ${(p.deviation * 100).toFixed(0)} % > 10 %`,
        });
        continue;
      }
      candidates.push({ pt, td, method, overlap: p.overlap });
    }
  }

  candidates.forEach((c, i) => { c.order = i; });
  candidates.sort((a, b) => {
    const r = METHODS.indexOf(a.method) - METHODS.indexOf(b.method);
    if (r) return r;
    if (a.method === 'mapping') return a.order - b.order;
    return b.overlap - a.overlap || cmp(a.pt.id, b.pt.id) || cmp(a.td.id, b.td.id);
  });

  const usedPt = new Map();
  const usedTd = new Map();
  const pairs = [];
  for (const c of candidates) {
    const ptHolder = usedPt.get(c.pt.id);
    const tdHolder = usedTd.get(c.td.id);
    if (ptHolder || tdHolder) {
      const other = tdHolder ?? ptHolder;
      rejected.push({
        pokemontcgId: c.pt.id, tcgdexId: c.td.id, method: c.method,
        reason: tdHolder
          ? `1:1-Konflikt: TCGdex-Set bereits ${other.pt.id} zugeordnet (${other.method})`
          : `1:1-Konflikt: pokemontcg-Set bereits ${other.td.id} zugeordnet (${other.method})`,
      });
      continue;
    }
    usedPt.set(c.pt.id, c);
    usedTd.set(c.td.id, c);
    pairs.push({ pokemontcgId: c.pt.id, tcgdexId: c.td.id, method: c.method, overlap: c.overlap });
  }

  const byIds = (a, b) => cmp(a.pokemontcgId, b.pokemontcgId) || cmp(a.tcgdexId, b.tcgdexId);
  pairs.sort(byIds);
  rejected.sort(byIds);
  return {
    pairs,
    rejected,
    unmatchedPokemontcg: ptSets.map((s) => s.id).filter((id) => !usedPt.has(id)).sort(cmp),
    unmatchedTcgdex: tcgdexSets.map((s) => s.id).filter((id) => !usedTd.has(id)).sort(cmp),
  };
}
