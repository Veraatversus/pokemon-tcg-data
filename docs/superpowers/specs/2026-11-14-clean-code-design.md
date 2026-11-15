# Clean Code – Frontend und API aufräumen – Design

Stand: 2026-11-14 · Status: zur Prüfung durch die Nutzerin

## 1. Ziel und Rahmen

Das Frontend (`frontend/tcg-tracker-web`) funktioniert und ist mit 404 Unit-Tests plus Playwright-Smoke-Tests abgesichert, ist strukturell aber schwer wartbar: `js/app.js` hat 10.134 Zeilen, 78 importierte Funktionen werden nie benutzt, rund 3.200 Zeilen sind Schein-Funktionen, das CSS enthält 148 mehrfach definierte Selektoren und 287 `!important`. Ziel ist eine übersichtliche Struktur, **ohne dass sich das Verhalten der App ändert** (außer dem bewussten Wegfall der Schein-Funktionen).

**Leitregeln**
- Reines Refactoring: gleiche Ausgabe, gleiche Bedienung. Jede Stufe endet mit grünen Tests und einem Browser-Test auf /dev.
- Kleine, einzeln prüfbare Schritte; nach jeder Stufe Commit, Auslieferung mit neuer `appVersion`.
- Keine neuen Funktionen, keine Design-Änderungen.
- Bestehende Tabellen und gespeicherte Einstellungen bleiben gültig (Storage-Keys unverändert).
- `scripts/**` gehört master, alles andere (Frontend, Doku) dev.

## 2. Umfang

### 2.1 Schein-Funktionen entfernen (entschieden: komplett raus)
Module ohne Server-Gegenstück, die nur im eigenen Browser-Speicher eine „Community“ simulieren:
- `js/community-features.js`, `js/community-ui.js` (Profile, Folgen, Trending, Bewertungen, öffentliche Freigaben)
- `js/trading-system.js`, `js/trading-ui.js`, `css/trading-marketplace.css` (Tauschmarkt, Wunschkarten, Tauschvorschläge)
- `js/social-features.js`, `js/social-ui.js` (Wunschlisten, Tauschlog, Erfolge, Set-Bewertungen, Gesten)
- `js/card-filters.js` (geschätzte Werte, Seltenheitsfilter ohne Verwendung)
- ungenutzte Teile von `js/advanced-features.js`, `js/enhanced-features.js`, `js/ui/tools.js`, `js/ui/components.js`, `features/search/index.js`
- die zugehörigen Einträge im Support-Hub, Bootstrap-Abhängigkeiten, CSS-Regeln und Tests

Bleiben (echte, genutzte Funktionen): Backup/Export (`features/collection/backup-export.js`, `downloadJson`, lokale Snapshots), Suchverlauf, Favoriten/Einstellungen soweit verwendet, Datenprüfung, Spreadsheet-Dialog, Legacy-Import. Was genau „verwendet“ ist, ergibt die Importanalyse (jeder Name muss außerhalb seines Imports vorkommen); Grenzfälle werden im Plan einzeln benannt.

Alte localStorage-Einträge der entfernten Funktionen werden nicht aktiv gelöscht (harmlos); der bestehende „Reset“-Dialog darf sie wie bisher entfernen.

### 2.2 `js/app.js` in Module aufteilen
Zielgröße: `app.js` nur noch Einstieg und Verdrahtung (< 1.500 Zeilen). Aufteilung entlang der vorhandenen Abschnitte:

| Modul (neu) | Inhalt (heute in app.js) |
|---|---|
| `js/app/state.js` | App-Zustand als ein Objekt statt verstreuter `let`-Variablen |
| `js/app/dom.js` | DOM-Referenzen |
| `js/app/router.js` | Hash-Router / View-Wechsel |
| `js/views/dashboard.js` | Dashboard (Laden, Filtern, Sortieren, Rendern) |
| `js/views/set-view.js` | Set laden, Kartenraster, Grid-Zoom, Bulk-Edit, Tastatur, Fehlende-Karten-Export |
| `js/views/lightbox.js` | Lightbox |
| `js/views/search.js` | Suche und Autocomplete |
| `js/views/stats.js` (+ `stats-price.js`) | Statistik, Preis-Tab; die Riesenfunktionen (`buildStatsPriceTabContent`, `renderStatsPriceSnapshot`, `renderStats`) in kleine Funktionen zerlegt |
| `js/features/settings/spreadsheet-dialog.js` | Spreadsheet-Dialog |
| `js/ui/helpers.js` | allgemeine UI-Helfer (Toasts, Formatierung …) |

Module bekommen ihre Abhängigkeiten über Import (Zustand, DOM, Helfer) – keine `window.*`-Globals, keine Kopien. `npm run check:imports` (keine Zyklen, keine toten Importe) bleibt grün; ein neuer Test prüft, dass `app.js` keine unbenutzten Importe hat.

### 2.3 `js/data/sheets-db.js` trennen
Reiner Google-Sheets-Zugriff (Lesen/Schreiben/Batch/Retry) getrennt von Fachlogik (Sammlungszeilen, Set-Übersicht, Import). Öffentliche Funktionsnamen bleiben, damit Aufrufer unverändert bleiben (Re-Export).

### 2.4 CSS bereinigen
- Mehrfach definierte Selektoren zusammenführen (eine Regel pro Selektor und Medienabfrage), tote Selektoren (kein Vorkommen in HTML/JS) entfernen, CSS der Schein-Funktionen entfernen.
- `!important` nur dort, wo es gegen Fremdstile nötig ist; sonst über Spezifität/Reihenfolge lösen.
- Prüfung: Screenshots von Dashboard, Set-Ansicht, Lightbox, Suche, Statistik, Dialogen (hell/dunkel, Handy/Desktop) vorher und nachher pixelnah vergleichen (Playwright).

### 2.5 API-Seite (master)
- `scripts/api/merge/cardmarket-ids.mjs` (1.011 Zeilen) in Module je Stufe aufteilen (Normalisierung/Nummern, custom-set inkl. Kit-Kürzel, geteilte TCGdex-IDs, Expansionsprüfung, Regeln, Stabilität, Report); `fillCardmarketIds` bleibt als Einstieg.
- Nummern-Parser in `cardmarket/import-html.mjs` als Regeltabelle (je Format ein Beispiel im Test).
- Prüfung: alle Tests grün **und** ein kompletter Build erzeugt byte-gleich dieselbe `api/v3` (leeres `git status`).

### 2.6 Doku
`ARCHITECTURE.md` auf den echten Stand, `REFACTOR_TODO.md` durch eine kurze Liste offener Punkte ersetzen (Geschichte steht in git), README des Frontends prüfen; API-README: langen Matching-Absatz gliedern.

## 3. Reihenfolge
1. Schein-Funktionen + tote Importe entfernen (schneller Gewinn, risikoarm).
2. `app.js` aufteilen, ein Modul pro Schritt (Zustand/DOM zuerst, dann Ansicht für Ansicht).
3. `sheets-db.js` trennen.
4. CSS bereinigen (mit Screenshot-Vergleich).
5. API-Module (master), unabhängig von 1–4.
6. Doku.

## 4. Tests und Abnahme
- Nach jedem Schritt: `node --test tests/*.test.mjs` (Frontend), `npm run check:imports`, Smoke-Tests (`npm run test:smoke:all`), auf master `npm test` in `scripts/api`.
- Nach jeder Stufe: Browser-Test auf /dev mit der Test-Tabelle (Dashboard, Set öffnen, Karte abhaken, Suche, Statistik, Lightbox, Einstellungen, Support-Hub).
- Abschluss: unabhängiges Review des gesamten Umbaus.

## 5. Nicht enthalten
Neue Funktionen, Design-Änderungen, ein Build-System/Bundler, Umstieg auf ein Framework, Änderungen am Datenmodell der Tabellen.
