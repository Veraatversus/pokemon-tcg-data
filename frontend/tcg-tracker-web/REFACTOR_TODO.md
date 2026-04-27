# TCG Tracker Web Refactor TODOs

Status: 2026-04-27

## Bereits umgesetzt in diesem Durchlauf

- [x] Sheets-Retry-Logik aus `js/app.js` in `js/ui/sheets-retry-report.js` extrahiert.
- [x] Runtime-Debug-Logs in `js/app.js`, `js/core/auth.js` und `service-worker.js` stark reduziert.
- [x] Legacy-Reexport-Dateien in `js/` klar als Kompatibilitaets-Shims markiert.

## Prioritaet P0 (naechster Schritt)

- [ ] `js/app.js` weiter zerlegen (aktuell groesster Monolith, ~385 KB):
  - [ ] `bootstrap` + Feature-Initialisierung in `js/app/bootstrap.js`
  - [ ] Dashboard-Rendering in `js/views/dashboard.js`
  - [ ] Set-Ansicht/Lightbox in `js/views/set-view.js`
  - [ ] Search-View in `js/views/search-view.js`
- [ ] `css/main.css` modularisieren (aktuell ~224 KB):
  - [ ] `css/layout.css`
  - [ ] `css/views/dashboard.css`
  - [ ] `css/views/set.css`
  - [ ] `css/views/search.css`
  - [ ] `css/components/*.css`

## Prioritaet P1

- [ ] Namenskonventionen vereinheitlichen:
  - [ ] keine gemischten Begriffe wie `ui-components.js` vs `ui/components.js`
  - [ ] Dateinamen nach Domain statt nach Technik gruppieren
- [ ] Version-Query-Parameter (`?v=...`) zentral verwalten statt pro Import hart zu codieren.
- [ ] Event- und LocalStorage-Key-Namen dokumentieren und normalisieren.

## Prioritaet P2

- [ ] Service-Worker Asset-Liste auf reale Runtime-Abhaengigkeiten reduzieren.
- [ ] Pruefen, ob `test-sync-fix.mjs` als manuelles Debug-Tool nach `scripts/manual/` verschoben wird.
- [ ] Legacy-Shims (`js/*.js` Reexports) nach Migrationsphase entfernen.

## Test- und Sicherheits-Checkliste pro Refactor-Schritt

- [ ] `node --test scripts/cardmarket/cardmarket-ui-helpers.test.mjs frontend/tcg-tracker-web/tests/cardmarket-data.test.mjs`
- [ ] relevante Frontend-Regressionstests aus `frontend/tcg-tracker-web/tests/`
- [ ] Browser-Quickcheck fuer Dashboard, Set-Ansicht, Suche
- [ ] keine neuen `console.log`-Debugausgaben in Runtime-Dateien
- [ ] keine toten Imports / keine zyklischen Abhaengigkeiten
