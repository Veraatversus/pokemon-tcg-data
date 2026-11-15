# Clean Code – Frontend und API aufräumen – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Frontend (`frontend/tcg-tracker-web`) und zwei gewachsene API-Module übersichtlich machen, ohne das Verhalten zu ändern – außer dem Wegfall der Schein-Funktionen.

**Architecture:** Erst Absicherung (Stil-Fingerabdruck, Prüftests), dann Schein-Funktionen und tote Importe entfernen, dann `js/app.js` abschnittsweise in Module verschieben (gemeinsamer Zustand `state`/`dom` in eigenen Modulen, Querverweise zwischen Ansichten über ein Aktionsregister statt Zyklen), dann `sheets-db.js` trennen, CSS bereinigen und die API-Module auf master aufteilen.

**Tech Stack:** Vanilla-JS-ES-Module ohne Bundler, `node --test`, Playwright (Smoke-Tests), Node ≥ 24 für `scripts/api`.

**Spec:** `docs/superpowers/specs/2026-11-14-clean-code-design.md`

## Global Constraints

- Reines Refactoring: gleiche Ausgabe, gleiche Bedienung; einzige gewollte Änderung ist der Wegfall der Schein-Funktionen (Spec §2.1).
- Keine neuen Funktionen, keine Design-Änderungen, kein Bundler, kein Framework, keine Änderung am Tabellen-Datenmodell.
- Storage-Keys bleiben unverändert; alte localStorage-Einträge entfernter Funktionen werden nicht aktiv gelöscht.
- Keine `window.*`-Globals für Modul-Kommunikation, keine Code-Kopien zwischen Modulen.
- `npm run check:imports` (keine Zyklen, keine toten Importe) bleibt grün.
- Frontend und Doku auf **dev**, `scripts/**` auf **master** (nie `scripts/**` auf dev bearbeiten).
- Jede Auslieferung hebt `appVersion` in `version.config.json` an und läuft `npm run version:sync`; Test auf /dev mit `?nocache=<n>`.
- Nach jedem Task: `node --test tests/*.test.mjs` grün (heute 404 Tests) und `npm run check:imports` grün.
- API-Tasks: `npm test` in `scripts/api` grün **und** `node scripts/api/build-api.mjs` erzeugt byte-gleich dieselbe `api/v3` (`git status --short api` leer).
- Kommentare und Commit-Texte deutsch wie im Bestand; Commit-Ende `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Ein ausgelagertes Modul wird ausgewertet, bevor ein DOM-Element existiert → `dom.x` ist `null`, wo es vorher gesetzt war. Erwartung: gleiche Schlüssel und gleiche Elemente wie vorher (Test in Task 3).
2. Gegenseitige Importe zwischen Ansichten → Zyklus oder TDZ-Fehler beim Start. Erwartung: Querverweise nur über `actions`; ein nicht registrierter Aufruf wirft eine klare Meldung (Test in Task 3).
3. Der Service Worker listet eine gelöschte Datei vor → Installation scheitert, Offline-Betrieb bricht. Erwartung: jede vorgeladene Datei existiert (Test in Task 1).
4. `index.html` oder `*.html` verweisen auf gelöschte CSS/JS-Dateien → 404 beim Laden. Erwartung: jeder lokale `href`/`src` existiert (Test in Task 1).
5. Der Reset-Dialog soll weiterhin alle app-eigenen Schlüssel entfernen, auch die der entfernten Funktionen. Erwartung: `getResetLocalStorageKeys` erfasst `trades`, `trade-offers`, `trade-history`, `wanted-cards` weiterhin (Test in Task 1).

---

## Datei-Struktur (Ziel)

```
js/app.js                         Einstieg, Bootstrap-Verdrahtung, registerActions (< 1.500 Zeilen)
js/app/state.js                   export const state (heute app.js:477), Hilfs-lets
js/app/dom.js                     export const dom (heute app.js:224)
js/app/actions.js                 Aktionsregister für Querverweise zwischen Ansichten
js/app/router.js                  Hash-Router / View-Wechsel (heute „HASH-ROUTER“)
js/ui/helpers.js                  UI-Helfer (heute „UI-HELFER“: Toast, Loading, Format …)
js/features/settings/spreadsheet-dialog.js   (heute „SPREADSHEET DIALOG“)
js/views/dashboard.js             Sets laden + Dashboard (heute „SETS LADEN“, „DASHBOARD“ ohne Suche)
js/views/search.js                Suche + Autocomplete (heute im Abschnitt „DASHBOARD“)
js/views/stats.js                 Statistik (heute „STATISTIKEN“ ohne Preis-Tab)
js/views/stats-price.js           Preis-Tab der Statistik
js/views/lightbox.js              (heute „LIGHTBOX“)
js/views/set-view.js              Set laden, Raster, Grid-Zoom, Bulk-Edit, Tastatur, Fehlende-Karten-Export
js/data/sheets-client.js          reiner Sheets-Zugriff (aus sheets-db.js)
js/data/sheets-db.js              Fachlogik, re-exportiert die bisherigen Namen
tests/helpers/style-fingerprint.mjs   Stil-Fingerabdruck (Playwright)
```

---

### Task 0: Absicherung – Stil-Fingerabdruck und Ausgangsstand

**Files:**
- Create: `frontend/tcg-tracker-web/tests/helpers/style-fingerprint.mjs`
- Create: `frontend/tcg-tracker-web/tests/style-fingerprint.mjs` (CLI)
- Create: `.local/clean-code/baseline/` (gitignored, nie committen)

**Interfaces:**
- Produces: `collectStyleFingerprint(page) -> Promise<Array<{ path: string, styles: Record<string,string> }>>` (für jedes sichtbare Element: CSS-Pfad aus Tag/ID/Klassen/Index, `getComputedStyle` der Eigenschaften `display, position, top, left, width, height, margin, padding, color, background-color, font-size, font-weight, line-height, border, border-radius, gap, grid-template-columns, flex-direction, opacity, visibility, z-index, transform, box-shadow`); CLI `node tests/style-fingerprint.mjs --url <url> --out <file.json> [--width 390|1280] [--theme light|dark]`.

- [ ] **Step 1:** Helper und CLI schreiben (nutzt `withBrowser`/`gotoReady` aus `tests/smoke-utils.mjs`). Ohne Anmeldung erreichbare Ansichten: Startseite, `index-landingpage.html`, `privacy.html`, `kontakt.html`, abgemeldetes Dashboard, Einstellungen-Dialog, Support-Hub.
- [ ] **Step 2:** Ausgangsstand aufnehmen: `npm run start:dev:full` und für jede Ansicht × {390, 1280} × {light, dark} eine Datei in `.local/clean-code/baseline/`.
- [ ] **Step 3:** Angemeldete Ansichten (Dashboard mit Daten, Set-Ansicht, Lightbox, Suche mit Treffern, Statistik inkl. Preis-Tab): Fingerabdruck im angemeldeten Chrome auf /dev über dieselbe Logik (als Snippet aus `collectStyleFingerprint` exportiert: `STYLE_FINGERPRINT_SNIPPET`), Ergebnis ebenfalls nach `.local/clean-code/baseline/`.
- [ ] **Step 4:** `node tests/style-fingerprint.mjs --compare <a.json> <b.json>` meldet abweichende Pfade/Eigenschaften; zwei Aufnahmen desselben Stands → 0 Abweichungen.
- [ ] **Step 5:** Commit (nur Helper + CLI).

### Task 1: Schein-Funktionen entfernen

**Files:**
- Delete: `js/community-features.js`, `js/community-ui.js`, `js/trading-system.js`, `js/trading-ui.js`, `js/social-features.js`, `js/social-ui.js`, `js/card-filters.js`, `css/trading-marketplace.css`
- Modify: `js/app.js` (Importe, Support-Hub-Abschnitte, Bootstrap-Abhängigkeiten ab `createBootstrapController({` ~Z. 9119), `js/app/bootstrap-controller.js` (Parameter der entfernten Funktionen), `index.html` (CSS-Link Z. 35, zugehörige DOM-Elemente), `service-worker.js` (Asset-Liste), CSS-Regeln der Panels in `css/main.css`/`css/views/*`
- Test: `tests/static-asset-references.test.mjs` (neu), `tests/runtime-reset.test.mjs` (ergänzen), betroffene bestehende Tests anpassen/entfernen

**Interfaces:**
- Consumes: nichts
- Produces: Support-Hub ohne Community/Tausch/Wunschliste/Erfolge/Bewertungen; `createBootstrapController` ohne die entsprechenden Parameter.

- [ ] **Step 1: Prüftests schreiben**
  - `static-asset-references.test.mjs`: „jeder lokale href/src in index.html, index-landingpage.html, privacy.html, kontakt.html existiert“ und „jede Datei der Service-Worker-Vorladeliste existiert“.
  - `runtime-reset.test.mjs`: `getResetLocalStorageKeys(<keys>)` enthält bei vorhandenen `scopedStorageKey('trades')`, `('trade-offers')`, `('trade-history')`, `('wanted-cards')` diese Schlüssel.
- [ ] **Step 2:** Tests laufen lassen – die neuen Prüfungen sind grün (Ausgangsstand).
- [ ] **Step 3:** Module, CSS-Datei und alle Verwendungen entfernen (Support-Hub-Kacheln, Bootstrap-Parameter, Panels, Gesten). Was nach Löschung ohne Verwendung bleibt, mit löschen. Grenzfälle, die **bleiben**: `downloadJson`, `createLocalBackup`, `getLocalBackups` (`advanced-features.js`), Suchverlauf und Einstellungen (`enhanced-features.js`), Datenprüfung.
- [ ] **Step 4:** `node --test tests/*.test.mjs`, `npm run check:imports`, `npm run test:smoke:all` grün; Fingerabdruck der abgemeldeten Ansichten gegen Baseline: Abweichungen nur dort, wo Panels entfernt wurden (Liste im Commit).
- [ ] **Step 5:** Commit `refactor(frontend): Schein-Funktionen (Community, Tausch, Wunschlisten, Erfolge, Bewertungen) entfernt`.

### Task 2: Tote Importe und ungenutzte Exporte

**Files:**
- Create: `tests/no-unused-imports.test.mjs`
- Modify: `js/app.js`, `js/enhanced-features.js`, `js/advanced-features.js`, `js/ui/tools.js`, `js/ui/components.js`, `js/features/search/index.js`, `js/features/search/query-utils.js`

**Interfaces:**
- Produces: Test `jedes Modul unter js/ verwendet jeden importierten Namen` (Regel: importierter lokaler Name kommt außerhalb der Importanweisung als Bezeichner vor; Ausnahme nur Re-Exporte `export { … } from`).

- [ ] **Step 1:** Test schreiben; ausführen → FAIL (heute 78 unbenutzte Namen in `app.js`, ggf. weitere).
- [ ] **Step 2:** Unbenutzte Importe entfernen; Exporte, die danach von keinem Modul und keinem Test importiert werden, samt Code löschen (Tests der gelöschten Funktionen mit entfernen).
- [ ] **Step 3:** Alle Tests, `check:imports`, Smoke-Tests grün.
- [ ] **Step 4:** Auslieferung 1: `appVersion` anheben, `npm run version:sync`, Commit, push dev; Browser-Test /dev (Dashboard, Set, Karte abhaken, Suche, Statistik, Lightbox, Einstellungen, Support-Hub) mit Test-Tabelle; Fingerabdrücke angemeldeter Ansichten gegen Baseline – 0 Abweichungen außer entfernten Panels.

### Task 3: Zustand, DOM und Aktionsregister auslagern

**Files:**
- Create: `js/app/state.js`, `js/app/dom.js`, `js/app/actions.js`
- Modify: `js/app.js:222-560` (Abschnitte DOM-REFERENZEN, APP-STATE-Objekt, lose `let`s Z. 557–561)
- Test: `tests/app-actions.test.mjs`, `tests/app-dom-keys.test.mjs`

**Interfaces:**
- Produces:
  - `js/app/state.js`: `export const state` (Objekt aus app.js:477 unverändert), `export const uiState = { focusedCardIndex: -1, spreadsheetDialogReturnFocusEl: null, loadingFailsafeTimer: null }` (ersetzt die losen `let`s).
  - `js/app/dom.js`: `export const dom` (Objekt aus app.js:224 unverändert).
  - `js/app/actions.js`: `export const actions` (Proxy: Zugriff auf nicht registrierten Namen wirft `Error('Aktion "<name>" ist nicht registriert')`), `export function registerActions(map: Record<string, Function>): void` (doppelte Registrierung eines Namens wirft).
- Regel für alle folgenden Tasks: Ein Modul ruft Funktionen einer **anderen Ansicht** nur über `actions.<name>(…)` auf; `app.js` registriert beim Start alle Ansichtsfunktionen mit `registerActions`.

- [ ] **Step 1: Tests**
  - `app-actions.test.mjs`: registrierte Aktion wird aufgerufen und gibt den Rückgabewert zurück; nicht registrierte wirft mit Namen in der Meldung; doppelte Registrierung wirft.
  - `app-dom-keys.test.mjs`: Schlüsselliste von `dom` (statisch aus dem Quelltext gelesen) ist gleich der Liste vor dem Umbau (Liste im Test festgeschrieben).
- [ ] **Step 2:** Tests → FAIL; Module anlegen; app.js importiert `state`, `dom`, `uiState`; die losen `let`s werden zu `uiState.*`.
- [ ] **Step 3:** Alle Tests, `check:imports`, Smoke-Tests grün. Commit.

### Task 4: UI-Helfer, Router und Spreadsheet-Dialog

**Files:**
- Create: `js/ui/helpers.js` (Abschnitt UI-HELFER, app.js ~1582–2093 ohne Grid-Zoom), `js/app/router.js` (HASH-ROUTER ~2441–2505), `js/features/settings/spreadsheet-dialog.js` (SPREADSHEET DIALOG ~2505–2766)
- Modify: `js/app.js`

**Interfaces:**
- Produces: dieselben Funktionsnamen wie heute in app.js (z. B. `showToast`, `setLoading`, `navigate`, `openSpreadsheetDialog`), als benannte Exporte; Aufrufer importieren sie oder nutzen `actions`.

- [ ] **Step 1:** Abschnitte verschieben (Funktionen unverändert, nur Importe/`actions`), app.js importiert/registriert.
- [ ] **Step 2:** Tests, `check:imports`, Smoke-Tests grün; `no-unused-imports` grün. Commit.

### Task 5: Dashboard und Suche

**Files:**
- Create: `js/views/dashboard.js` (SETS LADEN ~2766–2933 + DASHBOARD ohne Suche), `js/views/search.js` (Suche/Autocomplete inkl. `initSearchAutocomplete`, `initSearch`)
- Modify: `js/app.js`, ggf. `js/views/dashboard-grid.js` (bleibt eigenständig)

- [ ] **Step 1:** Verschieben; `initSearchAutocomplete` (308 Zeilen) in benannte Teilfunktionen zerlegen (Eingabe, Vorschlagsliste rendern, Tastatursteuerung, Auswahl übernehmen), Verhalten gleich.
- [ ] **Step 2:** Tests (`dashboard-*`, `search-*`), `check:imports`, Smoke inkl. `npm run test:search` und `npm run test:dashboard-search` grün. Commit.

### Task 6: Statistik und Preis-Tab

**Files:**
- Create: `js/views/stats.js`, `js/views/stats-price.js`
- Modify: `js/app.js` (STATISTIKEN ~5100–8366)

- [ ] **Step 1:** Verschieben; `buildStatsPriceTabContent` (525 Zeilen), `renderStatsPriceSnapshot` (457) und `renderStats` (297) in Teilfunktionen zerlegen (je Funktion höchstens ~80 Zeilen), gleiche DOM-Ausgabe.
- [ ] **Step 2:** Test `tests/stats-price-render-parity.test.mjs`: für ein festes Beispiel (vorhandene Fixtures der `stats-price-*`-Tests) liefert die neue Funktion dasselbe HTML wie die alte (alte Ausgabe vor dem Umbau als Fixture-Datei festgehalten).
- [ ] **Step 3:** Tests, `check:imports`, Smoke grün. Commit.

### Task 7: Lightbox und Set-Ansicht

**Files:**
- Create: `js/views/lightbox.js` (LIGHTBOX ~8366–8786), `js/views/set-view.js` (GRID ZOOM ~2093–2441, BULK-EDIT, FEHLENDE KARTEN EXPORTIEREN, TASTATURNAVIGATION, SET LADEN ~8786–9116)
- Modify: `js/app.js`

- [ ] **Step 1:** Verschieben; `initLightbox` (324 Zeilen) in Teilfunktionen (Öffnen/Schließen, Wischen/Touch, Tastatur, Rendern).
- [ ] **Step 2:** Tests, `check:imports`, Smoke grün; `app.js` < 1.500 Zeilen (`wc -l`).
- [ ] **Step 3:** Auslieferung 2 (appVersion, version:sync, push dev); Browser-Test /dev wie Task 2; Fingerabdrücke angemeldeter Ansichten: 0 Abweichungen. Commit.

### Task 8: `sheets-db.js` trennen

**Files:**
- Create: `js/data/sheets-client.js`
- Modify: `js/data/sheets-db.js`

**Interfaces:**
- Produces: `sheets-client.js` mit Lesen/Schreiben/Batch/Retry gegen die Sheets-API; `sheets-db.js` behält Fachlogik und re-exportiert alle bisher exportierten Namen (Aufrufer unverändert).

- [ ] **Step 1:** Test `tests/sheets-db-exports.test.mjs`: Liste der Exporte von `sheets-db.js` gleich der Liste vor dem Umbau.
- [ ] **Step 2:** Aufteilen; bestehende Tests mit `tests/helpers/fake-sheets.mjs` grün; `check:imports` grün. Commit.

### Task 9: CSS bereinigen

**Files:**
- Modify: `css/main.css`, `css/views/set.css`, `css/views/stats.css`, `css/views/dashboard.css`, `css/layout/core.css`, weitere `css/**`
- Create: `scripts/css-audit.mjs` (Frontend-`scripts/`, gehört dev) – listet mehrfach definierte Selektoren je Medienabfrage, `!important`-Anzahl, Selektoren ohne Vorkommen in HTML/JS

- [ ] **Step 1:** `css-audit.mjs` schreiben; Ausgangswerte festhalten (heute 148 Mehrfach-Selektoren, 287 `!important` in main.css + set.css).
- [ ] **Step 2:** Mehrfach definierte Selektoren je Medienabfrage zu einer Regel zusammenführen (spätere Deklaration gewinnt wie bisher), tote Selektoren entfernen, `!important` abbauen, wo Reihenfolge/Spezifität genügt.
- [ ] **Step 3:** Fingerabdrücke aller Ansichten (abgemeldet lokal, angemeldet auf /dev) gegen Baseline: 0 Abweichungen. Audit: Mehrfach-Selektoren 0, `!important` deutlich reduziert (Zahl im Commit).
- [ ] **Step 4:** Auslieferung 3 (appVersion, push dev), Browser-Test /dev. Commit.

### Task 10: API – `cardmarket-ids.mjs` aufteilen (master)

**Files:**
- Create unter `scripts/api/merge/cardmarket/`: `numbers.mjs` (normalizeCmNumber, Präfix-Logik, cardCmNumber/cardCmNumbers, customSetBase/csBase), `names.mjs` (normalizeCmName, cmAttackKey, cmNameMatches, Energie-Namen), `index-expansion.mjs`, `stage-custom-set.mjs`, `stage-shared-ids.mjs`, `stage-expansion-check.mjs`, `stage-rules.mjs`, `stage-stability.mjs`, `report.mjs`
- Modify: `scripts/api/merge/cardmarket-ids.mjs` (nur noch `fillCardmarketIds`, `primaryCardmarketId`, `previousFromCards`, `cardmarketSearchUrl` und Re-Exporte aller heute exportierten Namen)

- [ ] **Step 1:** Vorher `node scripts/api/build-api.mjs` auf sauberem master; `git status --short api` leer.
- [ ] **Step 2:** Aufteilen ohne Logikänderung; `npm test` grün (heute 341); erneuter Build → `git status --short api` leer.
- [ ] **Step 3:** Commit, push master.

### Task 11: API – Nummern-Parser als Regeltabelle (master)

**Files:**
- Modify: `scripts/api/cardmarket/import-html.mjs` (`numberOfLabel`)
- Test: `scripts/api/test/import-html.test.mjs`

**Interfaces:**
- Produces: `NUMBER_RULES: Array<{ name: string, pattern: RegExp, number: (match) => string, example: [label, expected] }>`; `numberOfLabel(label)` probiert Klammerinhalte (letzter zuerst) und den ganzen Text gegen die Regeln in Reihenfolge.

- [ ] **Step 1:** Test „jede Regel erfüllt ihr eigenes Beispiel“ und alle bisherigen `numberOfLabel`-Fälle (`BW 01`→`1`, `SK H1`→`H1`, `AQ 50a`→`50a`, `RR RT1`→`RT1`, `SM SM30a`→`30a`, `SM SM240`→`240`, `TK6 13N`→`13N`, `TK9 P-1`→`1P`, `TK8 1o`→`1o`, ohne Nummer → `null`).
- [ ] **Step 2:** Umbauen; Tests grün; Import aller `.local/cardmarket-html/*.json` im `--dry-run` liefert für jede Expansion „0 neu, N unverändert, 0 Widerspruch“ (Ausnahme 5241: dieselben 8 Beschriftungsabweichungen wie vorher).
- [ ] **Step 3:** Commit, push master, Weitergabe an dev/release.

### Task 12: Doku

**Files:**
- Modify: `frontend/tcg-tracker-web/ARCHITECTURE.md` (Modulübersicht nach Task 3–8, Regel „Querverweise über actions“), `frontend/tcg-tracker-web/REFACTOR_TODO.md` (ersetzt durch kurze Liste offener Punkte), `frontend/tcg-tracker-web/README.md` (prüfen), `scripts/api/README.md` (master: Matching-Absatz in Unterabschnitte je Stufe gliedern)

- [ ] **Step 1:** Doku schreiben; jede genannte Datei existiert (Prüfskript aus Task 1 auf Markdown-Links anwenden).
- [ ] **Step 2:** Commits (dev bzw. master).

### Task 13: Abschluss

- [ ] **Step 1:** Unabhängiges Review des gesamten Umbaus (dev-Diff seit Spec-Commit `ffdf701ae`, master-Diff der Tasks 10–11).
- [ ] **Step 2:** Befunde beheben, letzte Auslieferung, Browser-Test /dev, Fingerabdrücke 0 Abweichungen.
