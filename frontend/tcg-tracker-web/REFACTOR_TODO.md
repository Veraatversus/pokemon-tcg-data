# Offene Punkte

Stand nach dem Clean-Code-Umbau. Die Geschichte steht in git; Modulstruktur siehe `ARCHITECTURE.md`.

## CSS
- 40 doppelte Selektorlisten und ca. 478 `!important` bleiben. Jede ist durch einen gleich spezifischen Konkurrenten auf JS-erzeugten Klassen blockiert und braucht eine Prüfung am Live-DOM. Details: Commit-Nachricht von `ead630595` (git-Historie von Task 9). Messung: `node scripts/css-audit.mjs`.

## Text
- Kaputte Umlaute (Mojibake) in `js/data/sheets-db.js` und `js/data/sheets-client.js`, auch in Kandidaten für Blatttitel wie `'PokÃ©mon TCG Sets Ãœbersicht'`. Die Korrektur braucht eine sorgfältige, getestete Änderung, weil diese Strings die Blatt-Erkennung steuern.

## Modul-Laden
- Viele lokale Module werden an etlichen Stellen ohne `?v=` importiert. Nach einem Deploy können Browser bis zu 10 Minuten alte und neue Module mischen (Pages `max-age` 600; der Service Worker ist für JS network-first).

## Tests
- `test:smoke:full-ui` scheitert in `openSettings`, weil `dialog-share` den Klick abfängt (bereits vor dem Umbau).
- `tests/root-hosting-routing-regression.mjs` scheitert, weil `landingpage.html` im Repo-Root fehlt.
- `test:search` braucht ein angemeldetes Playwright-Profil.
- Playwright steht nicht in `package-lock.json`, `npm ci` installiert es daher nicht.
- `node_modules` in `frontend/tcg-tracker-web` steht nicht in `.gitignore`; `node_modules/.package-lock.json` ist versioniert.
- Der Paritätstest von `stats-price` (`tests/stats-price-render-parity.test.mjs`) prüft keine Klick-/Input-Handler.

## Größe
- Große Module: `js/views/stats-price.js` ca. 1.840 Zeilen, `js/data/sheets-db.js` ca. 2.050, `js/features/collection/import-jobs.js` ca. 690, `js/features/collection/collection-dialogs.js` ca. 690.
- `js/ui/app-extras.js` mischt Zuständigkeiten (Offline-Anzeige, Hover-Preview, Abschluss-Feier, Shortcuts-Overlay, Teilen, Auswahl-Dropdowns, Auto-Hide-Topbar). Bei weiterem Wachstum aufteilen.
- In der Statistik sind `computeAdvancedWorkspace` (108 Zeilen), `computeWatchlistWorkspace` (96) und `initStatsCharts` (84) jeweils länger als 80 Zeilen.

## Toter Code
- Ungenutzte Exporte u. a. in `js/core/storage-keys.js`, `js/features/collection/versioning.js`, `js/core/event-bus.js`, `js/ui/command-palette.js`, `js/core/cache.js` (`clearExpired`), `js/data/v3-cardmarket-ids.js` (z. B. `getV3CardDataMap`, `tcgdexLargeImageUrl`), `js/ui/cardmarket-price.js` (z. B. `getCardmarketPriceValue`) und `js/data/schema-contract.js` (z. B. `normalizeSeriesGroupKey`). Einige davon werden nur noch von Tests benutzt.
- Die Befehle `'export-collection'`, `'local-backup'` und `'show-backups'` in `js/app/bootstrap-controller.js` haben keinen Eintrag in `COMMANDS` (`js/ui/command-palette.js`) und sind damit nicht erreichbar. Das war schon vor dem Umbau so.
- Zwei CSS-Regeln mit toten Basisklassen: `.search-history-dropdown.hidden` und `.auto-backup-indicator.active/.disabled::before`.
- `escapeAutocompleteHtml` (`js/views/search.js`) ist eine Variante von `escapeHtml` ohne Apostroph.

## API (master)
- `scripts/api/merge/cardmarket-ids.mjs`: Die Override-Stufe (ca. 65–90 Zeilen) steht noch inline in `fillCardmarketIds`, und alle Stufen teilen sich ein gemeinsames `ctx`-Objekt. Das ist der verbleibende Aufteilungskandidat. `scripts/` gehört dem master-Zweig.
