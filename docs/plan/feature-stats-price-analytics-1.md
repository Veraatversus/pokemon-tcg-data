---
goal: Statistikseite um Preis-Zusammenfassung und Preis-Analysen erweitern (Cardmarket API, Lazy Loading)
version: 1.1
date_created: 2026-04-23
last_updated: 2026-04-23
owner: Vera / tcg-tracker-web
status: Completed
tags: [feature, stats, cardmarket, lazy-loading, frontend, design]
---

# Introduction

![Status: Completed](https://img.shields.io/badge/status-Completed-brightgreen)

Dieser Plan erweitert die Statistik-Ansicht im Web-Tracker um einen neuen Preisbereich fuer gesammelte Karten und Sets. Die Daten werden ueber die bestehende eigene Cardmarket API geladen und muessen dem vorhandenen Lazy-Loading-Ansatz folgen, sodass die Statistik zuerst sofort sichtbar ist und Preisanalysen schrittweise nachgeladen werden.

## 1. Requirements & Constraints

- **REQ-001**: Die Statistikseite in frontend/tcg-tracker-web muss einen neuen Abschnitt fuer Preis-Zusammenfassungen enthalten.
- **REQ-002**: Die Preis-Zusammenfassung muss mindestens Gesamtwert der Sammlung, Durchschnitt pro gesammelter Karte, Top-Set nach Wert, Top-Karte nach Wert und Anzahl Karten mit Preis enthalten.
- **REQ-003**: Der Preisbereich muss Daten aus der bestehenden eigenen Cardmarket API verwenden (siehe Resolver in frontend/tcg-tracker-web/js/data/cardmarket-data.js).
- **REQ-004**: Der Preisbereich darf das initiale Rendern von renderStats in frontend/tcg-tracker-web/js/app.js (aktuell ab ca. Zeile 4680) nicht blockieren.
- **REQ-005**: Nachladen muss lazy erfolgen: initial Placeholder/Status, danach inkrementelle Aktualisierung der Preiskennzahlen ohne Voll-Reload des Stats-Views.
- **REQ-006**: Bestehende Caches fuer Cardmarket-Preisauflosung in frontend/tcg-tracker-web/js/app.js (cardmarketPriceSummaryCache, cardmarketPriceSummaryPending ab ca. Zeile 6348) muessen weiterverwendet oder kompatibel erweitert werden.
- **REQ-007**: Bei fehlenden/ungueltigen Preisen muss die UI stabile Fallback-Werte anzeigen (0, n/a) und darf keine Exceptions werfen.
- **DES-001**: Der neue Preisbereich folgt einer klaren gestalterischen Richtung: editorial data-board mit hoher Kontrastfuehrung, markanter Display-Typografie und technisch-praeziser Kennzahlenanmutung.
- **DES-002**: Schriftwahl fuer den Preisbereich darf keine generischen Systemfonts verwenden; es wird die im Projekt bereits geladene Kombination Fraunces (Display) und IBM Plex Sans (UI/Text) strikt fuer Headline/KPI-Trennung genutzt.
- **DES-003**: Der Preisbereich nutzt eigene CSS-Variablen in frontend/tcg-tracker-web/css/main.css mit Prefix --stats-price-*, damit Farb- und Bewegungslogik isoliert wartbar bleibt.
- **DES-004**: Das Layout muss asymmetrisch sein: KPI-Cluster links, Set-Heatlist rechts, Top-Karte als ueberlappender Highlight-Block. Keine rein symmetrische 2x2-Kachelwand als Endzustand.
- **DES-005**: Es gibt genau eine orchestrierte Entry-Animation fuer den Preisbereich (Stagger ueber KPI-Karten), Dauer pro Element 220ms bis 300ms, ohne permanente Loop-Animationen.
- **DES-006**: Mobile Darstellung unter 768px reduziert visuelle Dichte (weniger Dekor, gleiche Informationsstruktur), ohne Datenverlust.
- **SEC-001**: Es werden keine zusaetzlichen Geheimnisse oder Tokens im Frontend gespeichert; es werden nur bestehende API-Routen und bestehende OAuth-Mechanismen genutzt.
- **SEC-002**: Externe URLs aus Kartendaten duerfen nicht ungeprueft in HTML injiziert werden; nur bestehende Link-Builder/Funktionen verwenden.
- **PER-001**: Preis-Nachladen muss parallel begrenzt werden (maximal 4 gleichzeitige Price-Jobs), um UI-Jank und Netzwerkspitzen zu vermeiden.
- **PER-002**: Bei erneutem Oeffnen der Statistikseite muessen Cache-Treffer genutzt werden, um Nachladezeit zu reduzieren.
- **CON-001**: Architektur bleibt ohne Build-Step; ES-Module direkt im Browser, keine zusaetzliche Build-Pipeline.
- **CON-002**: Bestehendes Markup in frontend/tcg-tracker-web/index.html und Styling in frontend/tcg-tracker-web/css/main.css werden erweitert, nicht neu strukturiert.
- **CON-003**: Keine neuen externen Font- oder Animationsbibliotheken einfuehren; vorhandene Ressourcen nutzen.
- **GUD-001**: Wiederverwendung bestehender Preis-Helfer (getCardmarketPriceValue, formatEuroPrice, loadCardmarketPriceSummary) statt doppelter Logik.
- **PAT-001**: UI-Pattern fuer Ladezustaende folgt bestehendem Muster loading-placeholder in frontend/tcg-tracker-web/js/app.js.
- **PAT-002**: Animationen respektieren reduced-motion: bei prefers-reduced-motion werden Stagger und Transform-Transition deaktiviert.

## 2. Implementation Steps

### Implementation Phase 1

- GOAL-001: Stabile Datenbasis fuer Preisaggregation und lazy orchestrierte Nachladung definieren.

| Task | Description | Completed | Date |
| -------- | --------------------- | --------- | ---------- |
| TASK-001 | In frontend/tcg-tracker-web/js/app.js einen neuen Stats-Price-State einfuehren: state.statsPrice = { requestId, status, totals, bySet, topCards, loadedCards, totalCards, errors }. requestId wird bei jedem renderStats-Instantiiert und dient als Abbruchschutz fuer veraltete Async-Updates. |  |  |
| TASK-002 | In frontend/tcg-tracker-web/js/app.js neue reine Aggregationsfunktion implementieren: computePriceAnalyticsFromSummaries(items). Input-Format: [{ cardKey, setId, setName, isCollected, isReverseHolo, summary }]. Output-Felder exakt: totalValue, avgCollectedCardValue, pricedCollectedCards, topSet { setId, setName, value }, topCard { cardKey, cardName, value }, setBreakdown[]. |  |  |
| TASK-003 | In frontend/tcg-tracker-web/js/app.js Helfer fuer sammlungsrelevante Kartenliste implementieren: buildCollectedCardCandidates(). Quelle: state.cards + state.dbMap fuer aktive Set-Ansicht und readDbCardsForSet fuer importierte Sets falls Stats-View ohne aktive Setdaten geoeffnet wird. Nur G/RH gesetzte Karten aufnehmen. |  |  |
| TASK-004 | In frontend/tcg-tracker-web/js/app.js Lazy-Loader-Orchestrator implementieren: loadStatsPriceAnalyticsLazy({ requestId }). Ablauf: in Chunks von 25 Karten iterieren, pro Chunk Promise-Pool mit Concurrency 4, pro Karte loadCardmarketPriceSummary(card) aufrufen, nach jedem Chunk Teilaggregation berechnen und UI aktualisieren. |  |  |
| TASK-005 | Cancel/Ignore-Mechanismus implementieren: Jede Async-Antwort prueft state.statsPrice.requestId === requestId; bei Mismatch keine DOM-Aenderung. Das verhindert Race Conditions bei Routewechseln und erneutem renderStats-Aufruf. |  |  |

### Implementation Phase 2

- GOAL-002: Stats-UI erweitern und Lazy-Loading-Preisanalysen sichtbar machen.

| Task | Description | Completed | Date |
| -------- | --------------------- | --------- | ---------- |
| TASK-006 | In frontend/tcg-tracker-web/index.html innerhalb von #view-stats (ab ca. Zeile 476) einen dedizierten Container fuer Preisanalysen vorbereiten: section id="stats-price-analytics" mit initialem Skeleton/Placeholder und aria-live="polite" fuer Statusupdates. |  |  |
| TASK-007 | In frontend/tcg-tracker-web/css/main.css neue Styles fuer Preisbereich ergaenzen: stats-price-panel, stats-price-grid, stats-price-card, stats-price-loading, stats-price-error, stats-price-list. Pflichtvariablen definieren: --stats-price-bg, --stats-price-surface, --stats-price-accent, --stats-price-warn, --stats-price-text, --stats-price-muted, --stats-price-shadow. Mobile Breakpoints an vorhandene Stats-Regeln anpassen. |  |  |
| TASK-008 | In frontend/tcg-tracker-web/js/app.js renderStats so erweitern, dass zuerst bestehende Statistik sofort gerendert wird, danach initStatsPricePanel() aufgerufen wird und anschliessend loadStatsPriceAnalyticsLazy({ requestId }) asynchron startet ohne await im initialen Renderpfad. |  |  |
| TASK-009 | In frontend/tcg-tracker-web/js/app.js render-Funktionen fuer Preisbereich implementieren: renderStatsPriceLoading(state), renderStatsPricePartial(analytics, progress), renderStatsPriceFinal(analytics), renderStatsPriceError(message). Alle Funktionen schreiben ausschliesslich in #stats-price-analytics und setzen data-state Attribute (loading, partial, final, error) fuer testbare Zustandspruefung. |  |  |
| TASK-010 | In frontend/tcg-tracker-web/js/app.js Serien/Set-Verknuepfung fuer Preislisten herstellen: setBreakdown-Eintraege sortieren nach value desc, top 5 anzeigen, bei Klick optional zu #/set/:id navigieren (falls setId bekannt). Top-Karte visuell separat als highlighted overlap tile rendern (Klasse stats-price-featured-card). |  |  |
| TASK-016 | In frontend/tcg-tracker-web/css/main.css Entry-Motion implementieren: Klasse stats-price-enter mit gestaffelten child-Animationen via animation-delay fuer .stats-price-card:nth-child(n). In @media (prefers-reduced-motion: reduce) alle Animationen im Preisbereich deaktivieren. |  |  |

### Implementation Phase 3

- GOAL-003: Regression-Schutz, deterministische Tests und Dokumentation abschliessen.

| Task | Description | Completed | Date |
| -------- | --------------------- | --------- | ---------- |
| TASK-011 | Neue Unit-Tests fuer Preisaggregation erstellen in frontend/tcg-tracker-web/tests/stats-price-analytics.test.mjs: (a) summiert trend/avg korrekt, (b) reverse-holo Priorisierung, (c) fehlende Preise werden ignoriert, (d) topSet/topCard korrekt. |  |  |
| TASK-012 | Neuen UI-Regressionstest erstellen in frontend/tcg-tracker-web/tests/stats-price-lazy-loading-regression.mjs: Route #/stats oeffnen, initial loading-placeholder verifizieren, nach Async-Lauf Preiskennzahlen sichtbar, keine uncaught errors in console. |  |  |
| TASK-013 | Bestehende Cardmarket-Tests erweitern in frontend/tcg-tracker-web/tests/cardmarket-data.test.mjs, damit Preisfeld-Mapping fuer trend/average/low und Reverse-Holo-Felder reproduzierbar bleibt. |  |  |
| TASK-014 | README-Dokumentation aktualisieren in frontend/tcg-tracker-web/README.md: neuer Statistikbereich, Lazy-Loading-Verhalten, bekannte Limits (API-Latenz, unvollstaendige Preisdaten), Testkommando fuer neue Regressionstests. |  |  |
| TASK-015 | Manuelle Verifikation dokumentieren: localhost Start, #/stats mehrfach oeffnen, Wechsel zwischen Views waehrend Nachladen, validieren dass Request-Guard stale Updates unterdrueckt. Ergebnis in docs/WORKFLOW_DOCUMENTATION.md als Kurzabschnitt eintragen. |  |  |

## 3. Alternatives

- **ALT-001**: Komplettes Vorladen aller Preisdaten vor renderStats. Nicht gewaehlt, weil dies Time-to-First-Render stark erhoeht und explizit dem Lazy-Loading-Ziel widerspricht.
- **ALT-002**: Preisaggregation serverseitig als fertigen Snapshot bereitstellen. Nicht gewaehlt, weil aktuelle App als statisches Frontend ohne zusaetzlichen Backend-Prozess betrieben wird.
- **ALT-003**: Preisdaten nur fuer aktuell geoeffnetes Set anzeigen. Nicht gewaehlt, weil gefordert ist eine Zusammenfassung ueber gesammelte Karten und Sets in der Statistikseite.

## 4. Dependencies

- **DEP-001**: Bestehende Cardmarket-Datenmodule in frontend/tcg-tracker-web/js/data/cardmarket-data.js.
- **DEP-002**: Bestehende Preis-Helfer und Cache in frontend/tcg-tracker-web/js/app.js (loadCardmarketPriceSummary und cardmarketPriceSummaryCache).
- **DEP-003**: Bestehende Summary-Datenquelle readSummarySheet aus frontend/tcg-tracker-web/js/data/sheets-db.js.
- **DEP-004**: Bestehende CSS-Variablen und Stats-Layout in frontend/tcg-tracker-web/css/main.css.
- **DEP-005**: Bereits geladene Fonts in frontend/tcg-tracker-web/index.html (Fraunces, IBM Plex Sans).

## 5. Files

- **FILE-001**: frontend/tcg-tracker-web/js/app.js - Hauptintegration: Datenaufbereitung, Lazy-Orchestrierung, UI-Rendering fuer Preisanalysen.
- **FILE-002**: frontend/tcg-tracker-web/index.html - Markup-Erweiterung fuer Preisanalysebereich in der Stats-View.
- **FILE-003**: frontend/tcg-tracker-web/css/main.css - Styling fuer Price-Panel, Loading, Error, Partial Results.
- **FILE-004**: frontend/tcg-tracker-web/tests/stats-price-analytics.test.mjs - neue Aggregations-Unit-Tests.
- **FILE-005**: frontend/tcg-tracker-web/tests/stats-price-lazy-loading-regression.mjs - neuer End-to-End-naher Regressionstest fuer Lazy Loading.
- **FILE-006**: frontend/tcg-tracker-web/tests/cardmarket-data.test.mjs - Erweiterung bestehender Preis-Mapping-Tests.
- **FILE-007**: frontend/tcg-tracker-web/README.md - Dokumentation der neuen Statistikfunktion.
- **FILE-008**: docs/WORKFLOW_DOCUMENTATION.md - kurzer Verifikations- und Betriebsablauf fuer Stats-Preis-Lazy-Loading.

## 6. Testing

- **TEST-001**: Unit-Test computePriceAnalyticsFromSummaries mit synthetischen Summaries und erwarteten exakten Summenwerten.
- **TEST-002**: Unit-Test fuer Reverse-Holo-Modus: Wenn reverse-Holo aktiv ist und reverse Preise vorhanden sind, wird reverse Preis priorisiert.
- **TEST-003**: Unit-Test fuer Null-/Fehlpreise: keine NaN-Werte im Ergebnis, pricedCollectedCards zaehlt nur gueltige Preise.
- **TEST-004**: Regressionstest fuer renderStats initial: Hero/Overview sofort sichtbar bevor Price-Load abgeschlossen ist.
- **TEST-005**: Regressionstest fuer Lazy Fortschritt: progress steigt chunk-basiert bis 100 Prozent, Finalzustand ersetzt Loading.
- **TEST-006**: Regressionstest fuer Race Condition: Routewechsel waehrend Price-Load fuehrt zu keinem DOM-Update aus stale Request.
- **TEST-007**: Manuell: Browser auf http://localhost:8080/frontend/tcg-tracker-web/#stats, DevTools Console ohne Fehler, Preisbereich mit plausiblen Zahlen.
- **TEST-008**: Visual Regression Check: Preisbereich enthaelt asymmetrisches Layout (featured top card + KPI cluster + set list) in Desktop-Breite >= 1024px.
- **TEST-009**: Accessibility Check: prefers-reduced-motion deaktiviert alle stats-price-enter Animationen.
- **TEST-010**: Responsive Check: Unter 768px sind alle KPI-Werte, Top-Karte und Top-Set-Liste weiterhin sichtbar und ohne horizontalen Overflow.

## 7. Risks & Assumptions

- **RISK-001**: Bei grossen Sammlungen kann selbst lazy Nachladen viele Requests erzeugen; ohne Concurrency-Limit entstehen API-Spitzen.
- **RISK-002**: Uneinheitliche Cardmarket-Preisdaten (fehlende trend/avg Felder) koennen Teilanalysen verfalschen.
- **RISK-003**: Wenn summaryData und reale Kartenbasis divergieren, koennen Set-Werte temporaer inkonsistent erscheinen.
- **RISK-004**: Monolithische app.js-Datei erhoeht Merge-Konflikt-Risiko bei parallelen Features.
- **RISK-005**: Zu starke visuelle Effekte koennen Lesbarkeit fuer KPI-Werte reduzieren, falls Kontrastverhaeltnisse nicht validiert werden.
- **ASSUMPTION-001**: Die eigene Cardmarket API bleibt unter /cardmarket erreichbar (lokal und deployte Umgebung).
- **ASSUMPTION-002**: loadCardmarketPriceSummary liefert fuer einen Teil der gesammelten Karten resolvierbare Preise.
- **ASSUMPTION-003**: Bestehende Stats-View bleibt der richtige Ort fuer collectionweite Preisanalyse (kein separater View erforderlich).

## 8. Related Specifications / Further Reading

docs/ARCHITECTURE.md
frontend/tcg-tracker-web/ARCHITECTURE.md
frontend/tcg-tracker-web/README.md
frontend/tcg-tracker-web/js/data/cardmarket-data.js
frontend/tcg-tracker-web/tests/cardmarket-data.test.mjs