import { sortLocalIds } from '../../cardmarket/tcgdex-helper/generate-tcgdex-helpers.mjs';

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const key = (setId, localId) => `${setId}\u0000${localId}`;
const SHOW = 20;

// Absolute Pfade (Windows oder POSIX) bis vor 'sources/' entfernen, Trenner vereinheitlichen.
export function relativizePaths(text) {
  const str = String(text ?? '');
  const abs = /(?:[A-Za-z]:[\\/]|\/)[^\n]*?(?=sources[\\/])/g;
  return abs.test(str) ? str.replace(abs, '').replace(/\\/g, '/') : str;
}
const formatWarning = (w) => (typeof w === 'string'
  ? relativizePaths(w)
  : `${relativizePaths(w.file)}: ${relativizePaths(w.message)}`);

export function buildMatchingReport({
  setResult, cardResults, sources, ptSets = [], tcgdexSets = [], ptCardsBySet = null,
  warnings = [], generatedAt = new Date().toISOString(),
}) {
  const ptName = new Map(ptSets.map((s) => [s.id, s.name]));
  const tdById = new Map(tcgdexSets.map((s) => [s.id, s]));

  // Globale Abstimmung: jede ueber irgendein Paar zugeordnete TCGdex-Karte.
  const assigned = new Map(); // key -> { setId, localId, ptIds:Set }
  for (const result of cardResults.values()) {
    for (const m of result.matched) {
      for (const t of m.tcgdex) {
        const k = key(t.setId, t.localId);
        if (!assigned.has(k)) assigned.set(k, { setId: t.setId, localId: t.localId, ptIds: new Set() });
        assigned.get(k).ptIds.add(m.ptId);
      }
    }
  }
  const doubleAssigned = [...assigned.values()]
    .filter((a) => a.ptIds.size > 1)
    .map((a) => ({ setId: a.setId, localId: a.localId, ptIds: [...a.ptIds].sort(cmp) }))
    .sort((a, b) => cmp(a.setId, b.setId) || sortLocalIds(a.localId, b.localId));

  const sortNums = (arr) => [...arr].sort(sortLocalIds);
  const sets = [...setResult.pairs]
    .sort((a, b) => cmp(a.pokemontcgId, b.pokemontcgId) || cmp(a.tcgdexId, b.tcgdexId))
    .map((p) => {
      const r = cardResults.get(p.pokemontcgId) ?? { matched: [], primaryOnly: [], tcgdexOnly: [] };
      const tdOnly = r.tcgdexOnly.filter((t) => !assigned.has(key(t.setId, t.localId)));
      return {
        pokemontcgId: p.pokemontcgId,
        pokemontcgName: ptName.get(p.pokemontcgId) ?? null,
        tcgdexId: p.tcgdexId,
        tcgdexName: tdById.get(p.tcgdexId)?.name?.en ?? null,
        method: p.method,
        overlap: p.overlap,
        lowOverlap: p.method !== 'mapping' && p.overlap < 0.9,
        matched: r.matched.length,
        total: r.matched.length + r.primaryOnly.length,
        suspicious: sortNums(r.matched.filter((m) => m.suspicious).map((m) => m.ptNumber)),
        primaryOnly: sortNums(r.primaryOnly.map((c) => c.ptNumber)),
        tcgdexOnly: [...tdOnly]
          .sort((a, b) => cmp(a.setId, b.setId) || sortLocalIds(a.localId, b.localId))
          .map((t) => (t.setId === p.tcgdexId ? t.localId : `${t.setId}/${t.localId}`)),
      };
    });

  const sum = (f) => sets.reduce((n, s) => n + f(s), 0);
  const matchedCards = sum((s) => s.matched);
  const ptCards = ptCardsBySet
    ? [...ptCardsBySet.values()].reduce((n, c) => n + c.length, 0)
    : sum((s) => s.total);
  const unpaired = setResult.unmatchedTcgdex;
  const unpairedCards = unpaired.reduce((n, id) => {
    const cards = tdById.get(id)?.cards ?? [];
    return n + cards.filter((c) => !assigned.has(key(id, c.localId))).length;
  }, 0);

  return {
    generatedAt,
    sources,
    summary: {
      ptSets: ptSets.length || setResult.pairs.length + setResult.unmatchedPokemontcg.length,
      tcgdexSets: tcgdexSets.length || setResult.pairs.length + setResult.unmatchedTcgdex.length,
      pairedSets: setResult.pairs.length,
      ptCards,
      matchedCards,
      cardMatchRatio: ptCards === 0 ? 1 : Math.round((matchedCards / ptCards) * 10000) / 10000,
      suspicious: sum((s) => s.suspicious.length),
      primaryOnly: sum((s) => s.primaryOnly.length),
      tcgdexOnlyInPairedSets: sum((s) => s.tcgdexOnly.length),
      unpairedTcgdexSets: { sets: unpaired.length, cards: unpairedCards },
    },
    sets,
    rejected: setResult.rejected,
    unmatchedPokemontcg: setResult.unmatchedPokemontcg,
    unmatchedTcgdex: setResult.unmatchedTcgdex,
    doubleAssigned,
    warnings: warnings.map(formatWarning),
  };
}

const compact = (arr) => (arr.length <= SHOW
  ? arr.join(', ')
  : `${arr.slice(0, SHOW).join(', ')}, …(+${arr.length - SHOW})`);
const esc = (v) => String(v ?? '').replace(/\|/g, '\\|');

export function renderMatchingMarkdown(report) {
  const s = report.summary;
  const out = [];
  out.push('# Matching-Report', '');
  out.push(`Erzeugt: ${report.generatedAt}`, '');
  out.push('## Zusammenfassung', '');
  out.push(`- pokemontcg-Sets: ${s.ptSets}`);
  out.push(`- TCGdex-Sets: ${s.tcgdexSets}`);
  out.push(`- Gepaarte Sets: ${s.pairedSets}`);
  out.push(`- pokemontcg-Karten: ${s.ptCards}`);
  out.push(`- Zugeordnete Karten: ${s.matchedCards}`);
  out.push(`- cardMatchRatio: ${s.cardMatchRatio}`);
  out.push(`- Verdaechtige Zuordnungen: ${s.suspicious}`);
  out.push(`- Nur in pokemontcg (primaryOnly): ${s.primaryOnly}`);
  out.push(`- Nur in TCGdex (in gepaarten Sets): ${s.tcgdexOnlyInPairedSets}`);
  out.push(`- Ungepaarte TCGdex-Sets: ${s.unpairedTcgdexSets.sets} (${s.unpairedTcgdexSets.cards} Karten)`);
  out.push(`- Doppelt zugeordnet: ${report.doubleAssigned.length}`, '');

  out.push('## Quellen', '', '```json', JSON.stringify(report.sources, null, 2), '```', '');

  if (report.doubleAssigned.length) {
    out.push('## Doppelt zugeordnet (Fehler)', '');
    for (const d of report.doubleAssigned) out.push(`- ${d.setId}/${d.localId}: ${d.ptIds.join(', ')}`);
    out.push('');
  }
  if (report.warnings.length) {
    out.push('## Warnungen', '');
    for (const w of report.warnings) out.push(`- ${w}`);
    out.push('');
  }

  out.push('## Set-Paare', '');
  out.push('| pokemontcg | Name | TCGdex | Name (en) | Methode | Overlap | Karten | Verdaechtig | primaryOnly |');
  out.push('|---|---|---|---|---|---|---|---|---|');
  for (const p of report.sets) {
    out.push(`| ${esc(p.pokemontcgId)} | ${esc(p.pokemontcgName)} | ${esc(p.tcgdexId)} | ${esc(p.tcgdexName)} | ${p.method} | ${p.overlap.toFixed(2)} | ${p.matched}/${p.total} | ${p.suspicious.length} | ${p.primaryOnly.length} |`);
  }
  out.push('');

  const low = report.sets.filter((p) => p.lowOverlap);
  out.push('## Paare mit geringer Nummern-Ueberdeckung (Sichtpruefung)', '');
  if (!low.length) out.push('Keine.');
  for (const p of low) {
    out.push(`- ${p.pokemontcgId} (${p.pokemontcgName}) <-> ${p.tcgdexId} (${p.tcgdexName}): ${p.method}, Overlap ${p.overlap.toFixed(2)}`);
  }
  out.push('');

  out.push('## Details pro Paar', '');
  for (const p of report.sets) {
    if (!p.suspicious.length && !p.primaryOnly.length) continue;
    out.push(`### ${p.pokemontcgId} <-> ${p.tcgdexId}`, '');
    if (p.suspicious.length) out.push(`- Verdaechtig: ${compact(p.suspicious)}`);
    if (p.primaryOnly.length) out.push(`- primaryOnly: ${compact(p.primaryOnly)}`);
    out.push('');
  }

  out.push('## Nicht zugeordnet', '');
  out.push(`### pokemontcg-Sets (${report.unmatchedPokemontcg.length})`, '');
  for (const id of report.unmatchedPokemontcg) out.push(`- ${id}`);
  out.push('', `### TCGdex-Sets (${report.unmatchedTcgdex.length})`, '');
  for (const id of report.unmatchedTcgdex) out.push(`- ${id}`);
  out.push('', `### Abgelehnte Kandidaten (${report.rejected.length})`, '');
  for (const r of report.rejected) out.push(`- ${r.pokemontcgId} <-> ${r.tcgdexId} (${r.method}): ${r.reason}`);
  out.push('');
  return out.join('\n');
}
