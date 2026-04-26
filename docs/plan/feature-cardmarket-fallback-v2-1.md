---
goal: Cardmarket-Fallbacks einheitlich auf searchMode=v2 mit SetTag+originaler Karten-ID umstellen
version: 1.0
date_created: 2026-04-23
last_updated: 2026-04-23
owner: Vera / TCG Tracker Web
status: Planned
tags: [feature, cardmarket, fallback, frontend, tests]
---

# Introduction

![Status: Planned](https://img.shields.io/badge/status-Planned-blue)

Dieser Plan stellt alle generierten Cardmarket-Such-Fallback-Links im Frontend auf ein einheitliches Format um: immer mit searchMode=v2, ohne Kartenname im Suchstring, und mit nicht-normalisierter Karten-ID (Originalwert).

## 1. Requirements & Constraints

- **REQ-001**: Jeder generierte Cardmarket-Fallback-Link muss das Query-Parameter-Paar `searchMode=v2` enthalten.
- **REQ-002**: Der generierte Fallback-Suchstring darf nur aus Set-Tag und Karten-ID bestehen; der Kartenname darf nicht enthalten sein.
- **REQ-003**: Die im Fallback-Suchstring verwendete Karten-ID muss der originale, nicht-normalisierte Wert sein (z. B. `GG03`, nicht aus Normalisierung abgeleitet).
- **REQ-004**: Falls Set-Tag oder Karten-ID fehlen, darf kein Name-basierter Suchstring erzeugt werden; der Fallback muss dann leer sein.
- **SEC-001**: Alle dynamischen Teile in der URL müssen URL-encodiert werden.
- **CON-001**: Direkte Cardmarket-Produktlinks (nicht Suchlinks) müssen weiterhin bevorzugt werden.
- **CON-002**: Erkennung bereits generierter Suchlinks (`isGeneratedCardmarketSearchUrl`) darf durch die Umstellung nicht brechen.
- **GUD-001**: Änderungen müssen auf allen aktiven Pfaden konsistent sein: schema-contract und pokecode-compat.
- **PAT-001**: Bestehende Datenmodell-Struktur und öffentliche Rückgabeobjekte unverändert lassen; nur Fallback-Erzeugung anpassen.

## 2. Implementation Steps

### Implementation Phase 1

- **GOAL-001**: Fallback-URL-Generatoren auf das neue Suchformat festlegen.

| Task | Description | Completed | Date |
| -------- | --------------------- | --------- | ---------- |
| **TASK-001** | In [frontend/tcg-tracker-web/js/data/schema-contract.js](frontend/tcg-tracker-web/js/data/schema-contract.js#L349) die Funktion `buildCardmarketFallback` so ändern, dass nur `setTag + cardNumber` erlaubt ist, immer `?searchMode=v2&searchString=...` verwendet wird und kein Name/SetName-Fallback mehr erzeugt wird. |  |  |
| **TASK-002** | In [frontend/tcg-tracker-web/js/data/schema-contract.js](frontend/tcg-tracker-web/js/data/schema-contract.js#L471) eine neue Variable `originalCardNumber` aus `primaryCard?.number || tcgdexCard?.localId || tcgdexCard?.id || ''` einführen (ohne `normalizeCardNumber`) und diese ausschließlich für `fallbackMeta.cardNumber` nutzen; `normalizedNumber` für bestehende Bild-/Mapping-Logik unverändert beibehalten. |  |  |
| **TASK-003** | In [frontend/tcg-tracker-web/js/pokecode-compat.js](frontend/tcg-tracker-web/js/pokecode-compat.js#L337) die Funktion `buildCardmarketSearchUrl` auf dieselbe Regel umstellen: nur `setTag + cardNumber`, immer `searchMode=v2`, kein Name/SetName-Pfad. |  |  |
| **TASK-004** | In [frontend/tcg-tracker-web/js/pokecode-compat.js](frontend/tcg-tracker-web/js/pokecode-compat.js#L551) und [frontend/tcg-tracker-web/js/pokecode-compat.js](frontend/tcg-tracker-web/js/pokecode-compat.js#L597) und [frontend/tcg-tracker-web/js/pokecode-compat.js](frontend/tcg-tracker-web/js/pokecode-compat.js#L612) bei `resolveCardmarketUrl` für `cardNumber` jeweils den nicht-normalisierten Originalwert übergeben (neue lokale Variable `rawNumber` je Kontext), ohne bestehende Map-Keys auf `normalizeCardNumber` umzustellen. |  |  |

### Implementation Phase 2

- **GOAL-002**: Tests und Regression-Schutz auf neues URL-Schema ausrichten.

| Task | Description | Completed | Date |
| -------- | --------------------- | --------- | ---- |
| **TASK-005** | In [frontend/tcg-tracker-web/tests/cardmarket-data.test.mjs](frontend/tcg-tracker-web/tests/cardmarket-data.test.mjs#L84) und verwandten Assertions alle erwarteten generierten Suchlinks auf `?searchMode=v2&searchString=<SETTAG>+<CARDID>` umstellen. |  |  |
| **TASK-006** | In [frontend/tcg-tracker-web/tests/set-match-regression.mjs](frontend/tcg-tracker-web/tests/set-match-regression.mjs#L214) den Suchfallback in Testdaten auf das neue Format ohne Kartenname umstellen, dabei die bestehende Aussage (Direktlink hat Vorrang) unverändert lassen. |  |  |
| **TASK-007** | Neue Regression-Tests ergänzen: (a) `cardNumber='GG03'` bleibt exakt `GG03`, (b) fehlendes `setTag` oder fehlende `cardNumber` erzeugt keinen Namen-basierten Suchfallback, (c) bestehende Direktlink-Präferenz bleibt aktiv. |  |  |

### Implementation Phase 3

- **GOAL-003**: Verifikation im lokalen Lauf und UI-Funktionssicherheit sicherstellen.

| Task | Description | Completed | Date |
| -------- | --------------------- | --------- | ---- |
| **TASK-008** | Test-Suite lokal ausführen: `node --test frontend/tcg-tracker-web/tests/cardmarket-data.test.mjs frontend/tcg-tracker-web/tests/set-match-regression.mjs`. Erwartung: alle Tests grün. |  |  |
| **TASK-009** | Manuelle Smoke-Validierung im Browser: eine Karte ohne Direktlink öffnen und verifizieren, dass Linkform exakt `https://www.cardmarket.com/de/Pokemon/Products/Search?searchMode=v2&searchString=<SETTAG>+<ORIGINAL_CARD_ID>` ist; Fallback-Badge bleibt sichtbar. |  |  |
| **TASK-010** | Sicherstellen, dass UI-Erkennung generierter Links (`isGeneratedCardmarketSearchUrl`) in [frontend/tcg-tracker-web/js/app.js](frontend/tcg-tracker-web/js/app.js#L6689), [frontend/tcg-tracker-web/js/data/cardmarket-ui-helpers.js](frontend/tcg-tracker-web/js/data/cardmarket-ui-helpers.js#L30), [frontend/tcg-tracker-web/js/data/cardmarket-data.js](frontend/tcg-tracker-web/js/data/cardmarket-data.js#L44) unverändert korrekt greift. |  |  |

## 3. Alternatives

- **ALT-001**: Nur schema-contract anpassen und pokecode-compat unverändert lassen. Nicht gewählt, weil inkonsistentes Verhalten in Legacy-/Compat-Pfaden entstehen kann.
- **ALT-002**: Name-basierten Fallback als sekundären Weg behalten. Nicht gewählt, weil explizit nur SetTag+Karten-ID gewünscht ist.
- **ALT-003**: Karten-ID weiterhin normalisieren und nur Anzeige ändern. Nicht gewählt, weil explizit originale Karten-ID im Suchstring gefordert ist.

## 4. Dependencies

- **DEP-001**: Bestehende Hilfsfunktionen zur URL-Encoding-Logik in schema-contract und pokecode-compat.
- **DEP-002**: Bestehende Test-Runner-Ausführung via Node Test Runner.
- **DEP-003**: Vorhandene UI-Logik für generierte Suchlink-Erkennung und Fallback-Kennzeichnung.

## 5. Files

- **FILE-001**: [frontend/tcg-tracker-web/js/data/schema-contract.js](frontend/tcg-tracker-web/js/data/schema-contract.js) - Primäre Fallback-Erzeugung und Record-Mapping.
- **FILE-002**: [frontend/tcg-tracker-web/js/pokecode-compat.js](frontend/tcg-tracker-web/js/pokecode-compat.js) - Compat-Fallback-Erzeugung und URL-Resolver-Aufrufe.
- **FILE-003**: [frontend/tcg-tracker-web/tests/cardmarket-data.test.mjs](frontend/tcg-tracker-web/tests/cardmarket-data.test.mjs) - erwartete Fallback-Link-Strings und Set-Index-Tests.
- **FILE-004**: [frontend/tcg-tracker-web/tests/set-match-regression.mjs](frontend/tcg-tracker-web/tests/set-match-regression.mjs) - Direktlink-vs-Fallback-Regression.

## 6. Testing

- **TEST-001**: Unit-Test: Fallback-Link enthält immer `searchMode=v2`.
- **TEST-002**: Unit-Test: Fallback-Link enthält keinen Kartenname.
- **TEST-003**: Unit-Test: Karten-ID bleibt unnormalisiert (`GG03` bleibt `GG03`).
- **TEST-004**: Unit-Test: ohne SetTag oder ohne Karten-ID wird kein Name-basierter Fallback erzeugt.
- **TEST-005**: Regression-Test: vorhandener Direktlink wird weiterhin gegenüber Suchfallback bevorzugt.

## 7. Risks & Assumptions

- **RISK-001**: Für Datensätze ohne Set-Tag oder Karten-ID entfällt künftig ein bisher möglicher Name-basierter Fallback-Link.
- **RISK-002**: Externe Prozesse könnten implizit auf normalisierte Karten-IDs in Suchlinks vertrauen; diese Annahme kann brechen.
- **ASSUMPTION-001**: Set-Tag und originale Karten-ID sind in den relevanten Datenpfaden mehrheitlich vorhanden.
- **ASSUMPTION-002**: Cardmarket akzeptiert Suchstrings im Format `<SETTAG> <ORIGINAL_CARD_ID>` stabil mit `searchMode=v2`.

## 8. Related Specifications / Further Reading

[docs/superpowers/plans/2026-04-09-cardmarket-dual-upstream-implementation.md](docs/superpowers/plans/2026-04-09-cardmarket-dual-upstream-implementation.md)
[docs/tcg-tracker-web/field-equivalence-matrix.md](docs/tcg-tracker-web/field-equivalence-matrix.md)