# TCG Tracker Web Refactor TODOs

Status: 2026-05-07 final (Waves 1-11 abgeschlossen: Entkopplung + Domain-Haertung + Betriebs-Checks + Search/Collection/Layout/App-Orchestrierung extrahiert, Verifikation gruen)

## Masterplan (alle 4 Prioritaeten)

- [x] Wave 1 (Basis ueber alle 4 Bereiche):
  - [x] Architektur: Data-Quality-Logik aus `js/app.js` in `js/features/collection/data-quality.js` extrahiert
  - [x] API/Domain: Data-Health/Parity-Orchestrierung als dedizierter Controller mit DI-Dependencies gekapselt
  - [x] Frontend: Runtime-Hardening-Styles aus `css/main.css` nach `css/components/runtime-hardening.css` verschoben
  - [x] Qualitaet: erweiterte Regression-Suite (Legacy-Import, Support-Hub, Module-Import) gemeinsam mit Cardmarket-Tests gruen
- [x] Wave 2 (Monolith-Abbau `app.js`):
  - [x] Settings-/Dialog-Flow in dedizierten Controller extrahieren
  - [x] Dashboard-Actions und Queue-Aktionen weiter entkoppeln
- [x] Wave 3 (Domain- und API-Haertung):
  - [x] Event-/Storage-Key-Normalisierung und zentrale Konstanten
    - [x] zentrale Storage-Key Registry in `js/core/storage-keys.js`
    - [x] zentraler EventBus in `js/core/event-bus.js`
    - [x] Quick-Filter-Events auf EventBus + Legacy-Bridge umgestellt
    - [x] Spreadsheet-Switch Event zentralisiert
  - [x] Version-Query-Parameter zentralisieren
    - [x] zentrale Version in `version.config.json`
    - [x] Sync-Skript `scripts/sync-version-query.mjs`
    - [x] NPM-Shortcut `npm run version:sync`
- [x] Wave 4 (Frontend-/Betriebshaertung):
  - [x] `service-worker.js` Asset-Liste auf Runtime-Minimum reduzieren
  - [x] Browser-Quickcheck-Playbook fuer Dashboard/Set/Suche standardisieren

## Bereits umgesetzt in diesem Durchlauf

- [x] **Wave 5 (27. Apr 2026): Set-View-Controller Extraktion**
  - [x] Card-Rendering-Logik (`renderCards`, `createCardElement`, `renderLightbox`) aus `js/app.js` in `js/views/set-view-controller.js` extrahiert (~1.100 Zeilen)
  - [x] Lightbox-Steuerung (`openLightbox`, `closeLightbox`, Swipe/Touch/Keyboard) in Set-View-Controller gekapselt
  - [x] Bulk-Edit-Logik (`toggleBulkMode`, `toggleBulkSelect`, `bulkUpdate`) in Set-View-Controller zentralisiert
  - [x] Keyboard-Navigation (Arrow-Keys, Grid-Nav) in Set-View-Controller implementiert
  - [x] Cardmarket-Price-Integration (Cache + Hydration + Panel-Rendering) in Set-View-Controller
  - [x] Collection-Toggles + Checkbox-Listeners mit Auto-Import-Guard in Set-View-Controller
  - [x] Set-View-Controller mit vollständigem Dependency-Injection-Pattern verdrahtet
  - [x] Import-Health-Check + Regression-Suite (26/26 cardmarket-ui-helpers + 20/20 cardmarket-data) **gruen**
  - [x] REFACTOR_TODO.md aktualisiert (Status 2026-05-06d)

- [x] **Wave 6 (2026-05-07): Dashboard-Rendering-Extraktion**
  - [x] `renderDashboard`, `createDashSetCard`, `syncDashboardCardForSet`, `mergeImportedSetIntoLocalState`, `scheduleAutoImportUiRefresh` aus `app.js` in `js/views/dashboard-rendering.js` extrahiert (Factory-Pattern)
  - [x] `scoreDashboardSetMatch`, `matchesDashboardSetFilter`, `createDashboardVirtualFooter`, `resetDashboardVirtualization` ebenfalls in Modul gekapselt
  - [x] `_dashRenderer` in Bootstrap initialisiert; Wrapper in app.js delegieren dorthin
  - [x] app.js: 6805 → 6413 Zeilen (−392 Zeilen in dieser Wave)
  - [x] Import-Health-Check + Regression-Suite (46/46) **gruen**

- [x] **Wave 7 (2026-05-07): App.js-Recovery + Stats/Settings-Delegation stabilisiert**
  - [x] Beschädigten `app.js`-Präfix nicht-destruktiv repariert (Prefix aus Stage bis stabiler Anchor `getSearchSelectionState`, aktueller Suffix behalten)
  - [x] Fehlende Modul-Imports für extrahierte Controller/Renderer in `app.js` ergänzt (`dashboard-rendering`, `stats-rendering`, `settings-controller`, Queue/Support/Spreadsheet/Legacy/Backup/Data-Quality, Search-Orchestrierung)
  - [x] Stats-Funktionen delegieren wieder auf `_statsRenderer` mit Fallback-Guards (`renderStats`, `loadStatsPriceAnalyticsLazy`, `updateStats`, `initStatsCharts`, `initStatsDrillDown`)
  - [x] `openSettingsDialog` delegiert robust auf `_settingsController` (Guard statt Hard-Crash bei Init-Fehler)
  - [x] Verifikation: Import-Health **gruen** + Cardmarket-Regression **46/46 gruen**
  - [x] app.js stabil bei 6418 Zeilen

- [x] **Wave 8 (2026-04-27): Stats-Legacy-Blöcke in app.js weiter reduziert**
  - [x] großer Legacy-Renderblock in `renderStats()` entfernt; Funktion delegiert jetzt schlank auf `_statsRenderer`
  - [x] Legacy-Stats-Preis-Fallback (`statsPriceView`-Lokalfunktionen, `mapWithConcurrency`, `buildCollectedCardCandidates`, lokales `loadStatsPriceAnalyticsLazy`) aus `app.js` entfernt
  - [x] `initStatsCharts()` und `initStatsDrillDown()` auf reine Delegation reduziert
  - [x] bei Refactor verursachte Strukturkorruption im `state`-Block sofort repariert
  - [x] Verifikation: Import-Health **gruen** + Cardmarket-Regression **46/46 gruen**
  - [x] app.js: 6418 -> 5795 Zeilen

- [x] **Wave 9 (2026-05-07): Offline-Indicator aus app.js extrahiert**
  - [x] Offline-Status-Logik (`isOfflineLikeError`, `renderOfflineIndicator`, `probeAppConnectivity`, `initOfflineIndicator`) aus `js/app.js` in `js/features/system/offline-indicator.js` verschoben
  - [x] neues Factory-Modul `createOfflineIndicatorController(...)` mit DI fuer `CONFIG`, `isSignedIn` und `showToast` eingefuehrt
  - [x] `app.js` behaelt nur noch den delegierenden Wrapper `initOfflineIndicator()`
  - [x] Verifikation: Import-Health **gruen** + Cardmarket-Regression **46/46 gruen**
  - [x] app.js: 5795 -> 5081 Zeilen

- [x] **Wave 10 (2026-04-28): Shortcuts-Overlay aus app.js extrahiert**
  - [x] Shortcut-Overlay-Logik (`showShortcutsOverlay`, `initShortcutsOverlay`, Shortcut-Definitionen) aus `js/app.js` in `js/features/system/shortcuts-overlay.js` verschoben
  - [x] neues Factory-Modul `createShortcutsOverlayController(...)` mit DI fuer `state`/DOM-Globals eingefuehrt
  - [x] `app.js` behaelt nur noch den delegierenden Wrapper `initShortcutsOverlay()`
  - [x] Verifikation: Import-Health **gruen** + Cardmarket-Regression **46/46 gruen**
- [x] **Wave 11 (2026-05-07): Abschluss verbleibender P0/P1/P2 Blöcke in app.js**
  - [x] Router/Bootstrap in `js/app/router.js` + `js/app/bootstrap-controller.js` verdrahtet
  - [x] Collection-Dialog-/Import-Orchestrierung in `js/features/collection/*` verdrahtet
  - [x] Search-Autocomplete/Result-Actions/Orchestrierung in `js/features/search/*` verdrahtet
  - [x] Layout/System/Share-Controller in `js/features/layout/*`, `js/features/system/*`, `js/features/share/share-dialog.js` verdrahtet
  - [x] app.js auf 3514 Zeilen reduziert
  - [x] Verifikation: Import-Health **gruen** + Tests **50/50 gruen**
- [x] Sheets-Retry-Logik aus `js/app.js` in `js/ui/sheets-retry-report.js` extrahiert.
- [x] Runtime-Debug-Logs in `js/app.js`, `js/core/auth.js` und `service-worker.js` stark reduziert.
- [x] Legacy-Reexport-Dateien in `js/` klar als Kompatibilitaets-Shims markiert.
- [x] Bootstrap-Event/Auth-Flow aus `js/app.js` in `js/app/bootstrap-init.js` ausgelagert.
- [x] PWA-/Service-Worker-Init aus `js/app.js` in `js/app/pwa-init.js` ausgelagert.
- [x] Cardmarket-Preisdarstellung aus `js/app.js` in `js/ui/cardmarket-price.js` ausgelagert.
- [x] Search-Input-Init aus `js/app.js` in `js/views/search-view.js` ausgelagert.
- [x] Search-Results-Rendering aus `js/app.js` in `js/views/search-results-view.js` ausgelagert.
- [x] Search-Query-Helfer in `js/features/search/query-utils.js` ausgelagert.
- [x] Search-Result-Helper (Sortierung/Schluessel/Enrichment-Heuristik) in `js/features/search/search-results-utils.js` ausgelagert.
- [x] Set-View Stats/Filter-Helfer in `js/views/set-view.js` ausgelagert.
- [x] Lightbox-Steuerung (`open/close/syncModal`) aus `js/app.js` in `js/views/set-view.js` ausgelagert.
- [x] Fullscreen-Lightbox-Interaktionen aus `js/app.js` in `js/views/set-view.js` ausgelagert.
- [x] Dashboard-Set-Card-Rendering und Dashboard-Card-Sync aus `js/app.js` in `js/views/dashboard-view.js` ausgelagert.
- [x] Dashboard-View-Controls (Tab/Density-UI) aus `js/app.js` in `js/views/dashboard-view.js` ausgelagert.
- [x] Dashboard-Rendering (`selectDashboardSetsView`, `renderDashboardSetsView`) aus `js/views/dashboard-view.js` ausgelagert.
- [x] Set-Rendering (`renderSetCardsView`, `revealPendingSearchCardFocusView`) aus `js/views/set-view.js` ausgelagert.
- [x] RunSearch-Orchestration (`runSearchOrchestrated`) aus `js/app.js` in `js/features/search/orchestration.js` ausgelagert.
- [x] CSS modularisiert und in `index.html` verdrahtet: `css/layout/core.css`, `css/components/panels.css`, `css/views/stats.css`, `css/views/search.css`, `css/views/set.css`.
- [x] Dashboard-spezifische Discovery-/Filter-/Tooltip-Styles aus `css/main.css` nach `css/views/dashboard.css` ausgelagert.
- [x] Generische Tracker-Menu-/Filter-Utility-Styles aus `css/main.css` nach `css/components/tracker-menu.css` ausgelagert.
- [x] Allgemeine Theme-/Button-/Custom-Select-Overrides aus `css/main.css` nach `css/components/theme-overrides.css` ausgelagert.
- [x] Queue-Builder-/Preset-Dialoglogik aus `js/app.js` nach `js/features/queue/queue-builder-dialog.js` ausgelagert.
- [x] Support-Hub-Flow aus `js/app.js` nach `js/features/support/support-hub.js` ausgelagert.
- [x] Backup-Import/Export-Flow aus `js/app.js` nach `js/features/collection/backup-import-export.js` ausgelagert.
- [x] Keyboard-Shortcuts-/Share-Styles aus `css/main.css` nach `css/components/shortcuts-share.css` ausgelagert.
- [x] Search-Set-Filter-Stabilisierung aus `css/main.css` nach `css/views/search-enhancements.css` verschoben.
- [x] Data-Health/Parity-Logik aus `js/app.js` nach `js/features/collection/data-quality.js` ausgelagert.
- [x] Spreadsheet-/Settings-Dialogflow aus `js/app.js` nach `js/features/settings/spreadsheet-dialog.js` ausgelagert.
- [x] Runtime-Hardening-Styles (Loading-Overlay/Brand-Logo) aus `css/main.css` nach `css/components/runtime-hardening.css` ausgelagert.
- [x] EventBus-Basis in `js/core/event-bus.js` und Storage-Key-Registry in `js/core/storage-keys.js` eingefuehrt.
- [x] API-Transient-Retry Utility in `js/core/retry.js` eingefuehrt und bei Overview-Sync/Power-Refresh verdrahtet.
- [x] Retry-Regressions in `tests/retry-utils.test.mjs` ergänzt.
- [x] Version-Query-Parameter in HTML/JS auf zentrale `appVersion` umgestellt (`version.config.json` + `scripts/sync-version-query.mjs`).
- [x] Service-Worker-Precache auf Runtime-Minimum reduziert (`service-worker.js`, Cache-Bump auf `v52`).
- [x] Browser-Quickcheck-Playbook standardisiert: `docs/tcg-tracker-web/browser-quickcheck-playbook.md`.
- [x] Dashboard-/Queue-Control-Wiring aus `js/app.js` nach `js/features/dashboard/dashboard-controls.js` ausgelagert.
- [x] Runtime-Events weiter normalisiert (`clear-search-history`, `sheets-write-*`) via `js/core/storage-keys.js`.
- [x] Event-/Storage-Doku ergänzt: `docs/tcg-tracker-web/modules/core/storage-keys.md`.
- [x] Import-Health-Check ergänzt: `scripts/check-import-health.mjs` + NPM-Script `check:imports`.

## Prioritaet P0 (naechster Schritt)

- [x] `runSearch()` Ablauf zerlegt:
  - `runSearchOrchestrated()` lebt in `js/features/search/orchestration.js`
  - `js/app.js` enthält nur noch den delegierenden Wrapper
  - DB-Phase, API-Phase und Ergebnis-Rendering sind aus dem Monolithen herausgelöst
- [x] `css/main.css` weiter zerlegen (aktuell ~115 KB):
  - [x] `css/layout/core.css`
  - [x] `css/views/set.css`
  - [x] `css/views/stats.css`
  - [x] `css/views/search.css`
  - [x] `css/components/panels.css`
  - [x] `css/components/tracker-menu.css`
  - [x] `css/components/theme-overrides.css`
  - [x] `css/views/dashboard.css`
  - [x] restliche Utility-/Feature-Styles auf weitere Module verteilt (`css/components/card-media-utilities.css`, `css/components/offline-banner.css`, `css/components/shortcuts-share.css`, `css/components/runtime-hardening.css`, `css/views/stats-features.css`, `css/views/search-enhancements.css`)

- [x] `js/app.js` weiter zerlegen (weiterhin Monolith):
  - [x] Queue-Builder-Preset-Dialog in `js/features/queue/queue-builder-dialog.js`
  - [x] Support-Hub-Flow in `js/features/support/support-hub.js`
  - [x] Job-/Queue-Basisfunktionen in `js/features/queue/queue-runtime.js`
  - [x] Legacy-Import-Dialogstate+Renderer in `js/features/collection/legacy-import-dialog.js`
  - [x] Backup-Import/Export in `js/features/collection/backup-import-export.js`
  - [x] Data-Health/Parity in `js/features/collection/data-quality.js`
  - [x] Stats-Price-Renderingblock in `js/views/stats-price-view.js`

## Umsetzungsplan (direkt in Arbeit)

- [x] Cardmarket-Resolver Root-Cause fixen (Hints/Collector/Rarity-Profil).
- [x] Gemeinsame Cardmarket-Suite grünziehen (`scripts/...` + `frontend/...`).
- [x] Theme-/Button-Overrides aus `main.css` in `css/components/theme-overrides.css` extrahieren.
- [x] Queue-Builder/Preset aus `app.js` in `js/features/queue/queue-builder-dialog.js` extrahieren.
- [x] Support-Hub aus `app.js` extrahieren.
- [x] Danach erneut fokussiert validieren (`get_errors` + Cardmarket-Suite).
- [x] EventBus-Integration (Quick-Filter + Spreadsheet-Switch) umsetzen.
- [x] API-Haertung via zentralem Retry-Wrapper fuer Overview-Sync/Power-Refresh umsetzen.
- [x] Plan/Reviewlauf aktualisieren und mit Tests absichern.

## Prioritaet P1

- [x] Namenskonventionen vereinheitlichen:
  - [x] keine gemischten Begriffe wie `ui-components.js` vs `ui/components.js`
  - [x] Dateinamen nach Domain statt nach Technik gruppieren
- [x] Version-Query-Parameter (`?v=...`) zentral verwalten statt pro Import hart zu codieren.
- [x] Event- und LocalStorage-Key-Namen dokumentieren und normalisieren.

## Prioritaet P2

- [x] Service-Worker Asset-Liste auf reale Runtime-Abhaengigkeiten reduzieren.
- [x] `test-sync-fix.mjs` als manuelles Debug-Tool nach `scripts/manual/` verschoben.
- [x] Legacy-Shims (`js/*.js` Reexports) nach Migrationsphase entfernen.
  - [x] entfernt: `js/advanced-tools.js`, `js/ui-components.js`, `js/collection-versioning.js`, `js/auth.js`, `js/cache.js`, `js/command-palette.js`, `js/config.js`, `js/pokemon-api.js`, `js/sheets-db.js`, `js/utils.js`

## Test- und Sicherheits-Checkliste pro Refactor-Schritt

- [x] `node --test scripts/cardmarket/cardmarket-ui-helpers.test.mjs frontend/tcg-tracker-web/tests/cardmarket-data.test.mjs`
- [x] relevante Frontend-Regressionstests aus `frontend/tcg-tracker-web/tests/` (u. a. `legacy-import-regression.mjs`, `support-hub-regression.mjs`, `module-import-extension-regression.mjs`)
- [x] Browser-Quickcheck fuer Dashboard, Set-Ansicht, Suche
- [x] keine neuen `console.log`-Debugausgaben in Runtime-Dateien
- [x] keine toten Imports / keine zyklischen Abhaengigkeiten
