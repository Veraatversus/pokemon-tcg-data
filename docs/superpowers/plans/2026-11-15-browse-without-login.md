# Stöbern ohne Login – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nicht angemeldete Besucher können (per Schalter) alle Sets, Karten, Bilder und Preise ansehen; Sammeln bleibt angemeldeten Nutzern vorbehalten.

**Architecture:** Eine Schalterdatei `app-flags.json` wird beim Start frisch geladen (`js/core/app-flags.js`). Ohne Login und mit Schalter an startet ein Stöbermodus (`js/app/browse-mode.js`), der Sets aus `api/v3` statt aus der Sheet-Overview lädt und `state.browseMode = true` setzt; Ansichten blenden Sammel-Bedienelemente aus. Ein Workflow schaltet die Datei je Branch um; „Promote Dev to Release“ behält den release-Wert.

**Tech Stack:** Vanilla-JS-Module (ES2022), Node-Test-Runner, Playwright-Smoke-Tests, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-15-browse-without-login-design.md`

## Global Constraints

- Nur `frontend/**`, `docs/**` und `.github/workflows/**` auf `dev`; `scripts/**` bleibt master.
- Fehlt `app-flags.json` oder ist sie unlesbar/ungültig: Stöbermodus **aus**.
- Angemeldete Nutzer: Verhalten unverändert (Sets aus der Sheet-Overview, Sammlung, Statistik).
- Schalter aus: nicht angemeldete Besucher laden keine `api/v3`-Daten (Seite „Bitte anmelden“ wie heute).
- Jede Auslieferung hebt `appVersion` (`version.config.json`, `npm run version:sync`); `node --test tests/*.test.mjs` und `npm run check:imports` grün.
- Kommentare/Commits deutsch; Commit-Ende `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Hinweistext exakt: „Zum Sammeln anmelden“.

## Review Focus

1. Login aus dem Stöbermodus heraus: nach erfolgreichem Login muss `state.browseMode` false sein und die Sammlung normal laden (kein Mischzustand mit API-Sets). → Test in Task 2 (`stopBrowseMode` setzt zurück) und Smoke-Prüfung in Task 3.
2. Abmelden (Logout) bei Schalter an: zurück in den Stöbermodus statt „Bitte anmelden“. → Task 2.
3. `app-flags.json` liefert Unsinn (`{"browseWithoutLogin":"yes"}`, HTML-404-Seite, Netzwerkfehler): Modus aus. → Task 1.
4. Direktaufruf einer Set-URL (`#set/sv1`) ohne Login im Stöbermodus: Set lädt aus der API, keine Sheet-Zugriffe, keine Fehlermeldung. → Smoke in Task 3.
5. Erster Promote nach Einführung: release hat noch keine Schalterdatei – sie darf nicht den dev-Wert `true` erben. → Task 4.

---

### Task 1: Schalterdatei und Loader

**Files:**
- Create: `frontend/tcg-tracker-web/app-flags.json` (Inhalt `{ "browseWithoutLogin": true }` – dev-Wert)
- Create: `frontend/tcg-tracker-web/js/core/app-flags.js`
- Test: `frontend/tcg-tracker-web/tests/app-flags.test.mjs`

**Interfaces:**
- Produces: `export async function loadAppFlags({ fetchImpl = globalThis.fetch, url = 'app-flags.json' } = {}): Promise<{ browseWithoutLogin: boolean }>` – lädt mit `cache: 'no-store'` und Parameter `?t=<Date.now()>`; nur ein JSON-Objekt mit `browseWithoutLogin === true` ergibt `true`, alles andere (HTTP-Fehler, kein JSON, Netzwerkfehler, falscher Typ) `{ browseWithoutLogin: false }`.

- [ ] **Step 1: Tests** `loadAppFlags`: (a) `{browseWithoutLogin:true}` → true; (b) `{browseWithoutLogin:"yes"}` → false; (c) HTTP 404 → false; (d) Antwort ist HTML (JSON-Fehler) → false; (e) `fetchImpl` wirft → false; (f) die aufgerufene URL beginnt mit `app-flags.json?t=` und die Optionen enthalten `cache: 'no-store'`.
- [ ] **Step 2:** Tests laufen → FAIL (Modul fehlt).
- [ ] **Step 3:** `app-flags.js` und `app-flags.json` anlegen; `service-worker.js`: `app-flags.json` nie cachen (vor dem allgemeinen Handler durchreichen).
- [ ] **Step 4:** `node --test tests/app-flags.test.mjs` → PASS; Gesamtsuite grün.
- [ ] **Step 5:** Commit `feat(frontend): Schalterdatei app-flags.json fuer den Stoebermodus`.

### Task 2: Stöbermodus starten und beenden

**Files:**
- Create: `frontend/tcg-tracker-web/js/app/browse-mode.js`
- Modify: `frontend/tcg-tracker-web/js/app/state.js` (Feld `browseMode: false`), `js/app/bootstrap-controller.js` (Zweig „nicht angemeldet“ ~Z. 451–455), `js/app.js` (`resetToLoggedOut` ~Z. 327–357, `onLoginSuccess`, `registerActions`)
- Test: `frontend/tcg-tracker-web/tests/browse-mode.test.mjs`

**Interfaces:**
- Consumes: `loadAppFlags` (Task 1); `fetchAllAvailableSets` (`js/data/pokemon-api.js`); `loadExcludedSetPredicate`, `filterExcludedSets` (`js/data/excluded-sets.js`); `resolveDisplaySet` wie in `views/dashboard.js`.
- Produces:
  - `export function buildBrowseSets(apiSets: object[], isExcluded: (set)=>boolean): object[]` – gefiltert, jedes Set mit `imported: false`, Reihenfolge wie `apiSets`.
  - `export async function startBrowseMode(): Promise<boolean>` – lädt Flags; bei `false` → `false` ohne API-Zugriff. Sonst: `state.browseMode = true`, `state.loggedIn = false`, `state.sets = []`, `state.allSets = buildBrowseSets(...)`, Hauptnavigation sichtbar, Statistik-Link ausgeblendet, Set-Auswahl befüllt (`renderSetSelectorOptions`), Statuszeile `Stöbermodus – <n> Sets`, `renderDashboard()`; → `true`.
  - `export function stopBrowseMode(): void` – `state.browseMode = false`, Statistik-Link wieder sichtbar.
  - Registrierung als Actions `startBrowseMode`, `stopBrowseMode`.
- Verdrahtung: Bootstrap-Zweig „nicht angemeldet“ und Ende von `resetToLoggedOut()` rufen `actions.startBrowseMode()`; liefert sie `false`, bleibt das heutige „Bitte anmelden“. `onLoginSuccess()` ruft zuerst `stopBrowseMode()`.

- [ ] **Step 1: Tests** `buildBrowseSets`: filtert ausgeschlossene/leere Sets (Prädikat), setzt `imported:false`, behält Reihenfolge; `startBrowseMode` mit gestubbten Flags `false` → gibt `false` zurück und ruft `fetchAllAvailableSets` nicht auf (Abhängigkeiten per optionalem Parameter-Objekt injizierbar: `startBrowseMode({ loadFlags, loadSets, loadPredicate } = {})`); `stopBrowseMode` setzt `state.browseMode` auf `false`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementieren und verdrahten wie oben.
- [ ] **Step 4:** Gesamtsuite + `check:imports` grün.
- [ ] **Step 5:** Commit `feat(frontend): Stoebermodus ohne Login (Sets aus api/v3)`.

### Task 3: Ansichten im Stöbermodus

**Files:**
- Modify: `js/views/set-cards.js` (Kartenrendering ~Z. 225–250: statt `makeCheckbox` Hinweis), `js/views/set-view.js` (Set laden ohne Sheet-Zugriffe; Bulk-Edit, „Fehlende exportieren“, Audit, Neu laden/Import ausblenden), `js/views/lightbox.js` (Schnellzugriff Sammelstatus ausblenden, Hinweis zeigen), `js/views/search.js` (Häkchen → Hinweis; Sammelstatus-Filter ausblenden), `js/features/settings/settings-actions.js` + `js/ui/components.js` (im Stöbermodus nur Kartensprache und Preisanzeige; Tools/Tabellen-Abschnitte ausgeblendet), passende CSS-Regel für `.browse-login-hint`
- Create: `frontend/tcg-tracker-web/tests/browse-smoke.mjs`; Script `"test:browse": "node tests/browse-smoke.mjs"` in `package.json`

**Interfaces:**
- Consumes: `state.browseMode` (Task 2).
- Produces: `export function makeBrowseLoginHint(): HTMLElement` in `js/views/set-cards.js` – `<button type="button" class="browse-login-hint">Zum Sammeln anmelden</button>`, Klick löst `dom.auth.click()` aus.

- [ ] **Step 1: Smoke-Test** (Playwright, ohne Login, lokaler Server mit `app-flags.json` = true): Dashboard zeigt > 150 `.dash-set-card`; Statistik-Link nicht sichtbar; `#set/sv1` lädt Karten (> 50 `.card`), keine `input[data-type="g"]`, mindestens ein `.browse-login-hint` mit Text „Zum Sammeln anmelden“; Lightbox öffnet ohne Sammelstatus-Kästchen; Suche „Pikachu“ liefert Treffer ohne Häkchen; Konsole ohne Fehler. Zweiter Lauf mit `app-flags.json` = false: „Bitte anmelden.“ und keine Anfrage an `api/v3/cards/`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Umsetzen.
- [ ] **Step 4:** `npm run test:browse`, `npm run test:smoke`, Gesamtsuite, `check:imports` grün.
- [ ] **Step 5:** Commit `feat(frontend): Ansichten im Stoebermodus ohne Sammel-Bedienelemente`.

### Task 4: Schalter-Workflow, Promote-Schutz, Auslieferung

**Files:**
- Create: `.github/workflows/toggle-browse-mode.yml`
- Modify: `.github/workflows/promote-dev-to-release.yml` (nach dem Merge), `frontend/tcg-tracker-web/README.md` (Abschnitt „Stöbermodus“), `frontend/tcg-tracker-web/ARCHITECTURE.md` (Modul `app/browse-mode.js`, `core/app-flags.js`), `version.config.json`

**Interfaces:**
- Workflow „Stöbermodus an/aus“: `workflow_dispatch` mit `enabled` (boolean, Pflicht) und `target` (choice `release` | `dev` | `both`, Standard `release`); je Ziel-Branch Checkout, Datei `frontend/tcg-tracker-web/app-flags.json` auf `{ "browseWithoutLogin": <enabled> }` (mit Zeilenumbruch am Ende) setzen, nur bei Änderung committen (`chore: Stoebermodus <an|aus> (<branch>)`) und pushen; `permissions: contents: write`.
- Promote: nach erfolgreichem Merge die Datei aus `$BEFORE_COMMIT` wiederherstellen; existiert sie dort nicht, `{ "browseWithoutLogin": false }` schreiben – in derselben Logik wie die bestehende `deploy-pages.yml`-Wiederherstellung (Z. 39).

- [ ] **Step 1:** Workflow und Promote-Änderung schreiben; YAML mit `node -e "require('yaml')"`-freier Prüfung: `npx --yes js-yaml .github/workflows/toggle-browse-mode.yml >/dev/null` und für die geänderte Promote-Datei.
- [ ] **Step 2:** Doku ergänzen (README: wie man den Knopf benutzt; was Besucher sehen).
- [ ] **Step 3:** `appVersion` anheben, `npm run version:sync`, Gesamtsuite grün, Commit `feat: Workflow Stoebermodus an/aus, Promote behaelt den release-Schalter`, push dev.
- [ ] **Step 4 (Controller):** /dev ohne Login im Browser prüfen; Workflow einmal mit `target=dev`, `enabled=false` ausführen → /dev zeigt „Bitte anmelden.“; wieder `true`. release bleibt bis zur Freigabe der Nutzerin unverändert (Datei dort fehlt → aus).
