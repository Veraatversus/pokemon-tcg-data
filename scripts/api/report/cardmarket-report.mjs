// Menschenlesbarer Cardmarket-Report (api/v3/reports/cardmarket-ids.md) aus dem JSON-Report.
const pct = (c) => (c.cards ? `${Math.round((c.withId / c.cards) * 1000) / 10} %` : '-');

export function renderCardmarketReportMd(report) {
  const t = report.totals ?? {};
  const rows = Object.entries(report.bySet ?? {})
    .map(([setId, r]) => ({ setId, ...r }))
    .sort((a, b) => (b.missing ?? 0) - (a.missing ?? 0) || (a.setId < b.setId ? -1 : a.setId > b.setId ? 1 : 0));
  const lines = [
    '# Cardmarket-Zuordnung',
    '',
    `${t.cards ?? 0} Karten, ${t.missing ?? 0} ohne Cardmarket-ID (Sets nach fehlenden Karten absteigend; Details in cardmarket-ids.json).`,
    '',
    '| Set | Erweiterung | Karten | mit ID | fehlen | Abdeckung | Herkunft | Suche |',
    '| --- | --- | ---: | ---: | ---: | ---: | --- | --- |',
  ];
  for (const r of rows) {
    const c = r.coverage ?? { cards: r.cards, withId: r.cards - (r.missing ?? 0), bySource: {} };
    const sources = Object.entries(c.bySource ?? {}).map(([k, v]) => `${k} ${v}`).join(', ');
    lines.push(`| ${r.setId} | ${r.expansionId ?? '-'} | ${c.cards} | ${c.withId} | ${r.missing ?? 0} | ${pct(c)} | ${sources || '-'} | ${r.searchUrl ? `[Suche](${r.searchUrl})` : '-'} |`);
  }
  return `${lines.join('\n')}\n`;
}
