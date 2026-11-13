// Meldung "Cardmarket-Zuordnung prüfen" (Spec §4): ein selbstpflegendes Issue nur bei groben Problemen.
// Der Workflow legt es an, aktualisiert es bei jedem Lauf (kein Kommentar pro Tag) und schliesst es, wenn open=false.
// Ausloeser: neues Set < 80 % Abdeckung, neues Set ohne ermittelbare Erweiterung, Zuordnungsdatei-/custom-set-
// Eintrag mit nicht mehr vorhandenem Produkt, 3 Cardmarket-Ausfaelle in Folge. Kleine Luecken stehen nur im Report.
export const CARDMARKET_ISSUE_TITLE = 'Cardmarket-Zuordnung prüfen';
export const COVERAGE_THRESHOLD = 0.8;
export const FAILURE_THRESHOLD = 3;

const REPORT_PATH = 'api/v3/reports/cardmarket-ids.md';

export function evaluateCardmarketIssue({ report, meta, previousSetIds, excludedSetIds = [] }) {
  const excluded = new Set(excludedSetIds);
  // Ohne bekannte Vorgaenger-Sets ist jedes Set "neu" -> Neu-Regeln aussetzen statt Fehlalarm
  const known = Array.isArray(previousSetIds) ? new Set(previousSetIds) : null;
  const isNew = (setId) => known !== null && !known.has(setId) && !excluded.has(setId);
  const sections = [];

  const lowCoverage = Object.entries(report?.bySet ?? {})
    .filter(([setId, r]) => isNew(setId) && (r.coverage?.cards ?? 0) > 0 && r.coverage.withId / r.coverage.cards < COVERAGE_THRESHOLD)
    .map(([setId, r]) => {
      const c = r.coverage;
      const pct = Math.floor((c.withId / c.cards) * 100);
      return `- \`${setId}\`: ${c.withId} von ${c.cards} Karten (${pct} %)${r.searchUrl ? `, [Cardmarket-Suche](${r.searchUrl})` : ' (keine Erweiterung bekannt)'}`;
    });
  if (lowCoverage.length) sections.push(['Neue Sets mit weniger als 80 % Abdeckung', lowCoverage]);

  const noExpansion = (report?.setsWithoutExpansion ?? [])
    .filter((s) => isNew(s.setId) && (s.cards ?? 0) > 0)
    .map((s) => `- \`${s.setId}\`: ${s.cards} Karten, Hinweis ${s.evidence ?? '-'}${s.evidenceSource ? ` (${s.evidenceSource})` : ''}`);
  if (noExpansion.length) sections.push(['Ohne Cardmarket-Erweiterung (neue Sets)', noExpansion]);

  const gone = [
    ...(report?.customSets?.missingProducts ?? []).map((m) => `- custom-sets/${m.expansionId}.json: Produkt ${m.productId} (Nummer ${m.collectorNumber}) ist nicht im Katalog${m.actualExpansion ? ` (gehört jetzt zu Erweiterung ${m.actualExpansion})` : ''}`),
    ...(report?.overrides?.warnings ?? []).filter((w) => /nicht im Cardmarket-Katalog/.test(w)).map((w) => `- cardmarket-overrides.json: ${w}`),
  ];
  if (gone.length) sections.push(['Einträge mit Produkt nicht mehr im Katalog', gone]);

  const failures = meta?.consecutiveFailures ?? 0;
  if (failures >= FAILURE_THRESHOLD) {
    sections.push(['Cardmarket-Download', [`- ${failures} Läufe in Folge fehlgeschlagen oder defekt${meta?.lastSuccess ? `, letzter Erfolg ${meta.lastSuccess}` : ''}. Katalog und Preise bleiben auf altem Stand.`]]);
  }

  if (!sections.length) return { open: false, title: CARDMARKET_ISSUE_TITLE, body: '' };
  const body = [
    'Dieses Issue wird bei jedem Lauf aktualisiert und schließt sich selbst, sobald nichts mehr auffällt.',
    '',
    ...sections.flatMap(([heading, lines]) => [`## ${heading}`, '', ...lines, '']),
    `Alle Sets: \`${REPORT_PATH}\` (Details: \`api/v3/reports/cardmarket-ids.json\`).`,
    '',
  ].join('\n');
  return { open: true, title: CARDMARKET_ISSUE_TITLE, body };
}
