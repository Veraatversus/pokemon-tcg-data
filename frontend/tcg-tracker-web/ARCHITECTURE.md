# try4 – Architektur

## Modulstruktur

`index.html` lädt `js/app.js` (ES-Modul). `app.js` (~380 Zeilen) ist nur Einstiegspunkt und Verdrahtung: es importiert die Module, registriert die Ansichtsfunktionen mit `registerActions` und startet den Bootstrap. Fachlogik steht in den Modulen darunter.

```
js/
├── app.js                 Einstieg, Verdrahtung, registerActions
├── enhanced-features.js   Favoriten, Suchverlauf, Einstellungen (localStorage)
├── advanced-features.js   Export/Backup: downloadJson, createLocalBackup, getLocalBackups
├── app/                   Anwendungsgerüst
│   ├── state.js             zentraler App-Zustand (state, uiState)
│   ├── dom.js               DOM-Referenzen
│   ├── actions.js           Aktionsregister (actions, registerActions)
│   ├── router.js            Hash-Router, View-Wechsel
│   ├── recent-sets.js       zuletzt geöffnete Sets, Nav-Chips
│   ├── bootstrap-controller.js  Startreihenfolge, Login/Logout-Ablauf
│   └── pwa-init.js          Service Worker, Install-Prompt
├── views/                 eine Datei je Ansicht (bzw. Teilansicht)
│   ├── dashboard.js, dashboard-grid.js   Set-Übersicht, Serien, Set-Raster
│   ├── set-view.js, set-cards.js         Set-Ansicht: Laden, Zoom, Auswahl; Kartenraster, Checkboxen
│   ├── lightbox.js                       Kartendetail, Wischgesten
│   ├── search.js                         Suche über alle Sets, Autocomplete
│   └── stats.js, stats-price.js          Statistik; Preis-Tab (Cardmarket-Preisradar)
├── features/              fachliche Abläufe
│   ├── collection/          import-jobs, queue-presets, collection-dialogs, legacy-import(-dialog),
│   │                        backup-export, ambiguous-key-migration, delete-set-cells, versioning, …
│   ├── search/              Suchindex-Vorfilter, Query-Helfer, Sammlungs-Maps, engine
│   ├── settings/            settings-actions, spreadsheet-dialog(-helpers), runtime-reset
│   └── community/           sync (BroadcastChannel)
├── ui/                    gemeinsame Oberfläche
│   ├── helpers.js           Status, Toast, Undo, Dialoge, Bild-Helfer
│   ├── sheets-feedback.js, sheets-retry-report.js   Schreib-Feedback, Retry-Report
│   ├── app-extras.js        Offline-Anzeige, Hover-Preview, Teilen, Auswahl-Dropdowns
│   ├── components.js, command-palette.js, image-fallback.js, cardmarket-price.js
│   └── stats-price-analytics.js, stats-series.js
├── data/                  Datenzugriff
│   ├── sheets-client.js     roher Sheets-API-Zugriff (Lesen/Schreiben, Retry, Schreibwarteschlange)
│   ├── sheets-db.js         Fachlogik auf Sheets (Sets, Karten-Grid, Caches); baut auf sheets-client auf
│   ├── v3-api.js, v3-records.js, v3-prices.js, v3-cardmarket-ids.js, v3-collection-keys.js   api/v3
│   ├── pokemon-api.js, schema-contract.js (resolveFieldValue), collection-writes.js, set-aliases.js, …
│   └── cardmarket-url-utils.js, cardmarket-ui-helpers.js
└── core/                  config, auth, cache, utils, storage-keys, event-bus, retry, display-text, …
```

### Regel: Querverweise über `actions`

Ein Modul ruft Funktionen einer anderen Ansicht nur über `actions.<name>(…)` (`js/app/actions.js`) auf. `app.js` registriert diese Funktionen beim Start mit `registerActions`. Kein Modul importiert `app.js`. Direkte Imports sind erlaubt, wo sie zyklenfrei bleiben (z. B. `views/*` → `ui/helpers.js`, `app/state.js`, `app/dom.js`).

### Prüfungen

| Prüfung | Zweck |
|---|---|
| `npm run check:imports` (`scripts/check-import-health.mjs`) | tote Imports, Zyklen |
| `tests/no-unused-imports.test.mjs` | ungenutzte Importe |
| `tests/module-specifier-consistency.test.mjs` | ein Modul überall derselbe Specifier |
| `tests/static-asset-references.test.mjs` | Verweise in den HTML-Dateien |
| `tests/style-fingerprint.mjs` | Stil-Fingerabdruck (berechnete Stile je Ansicht, Breite, Theme) vor/nach CSS-Änderungen vergleichen; Playwright-CLI, kein Unit-Test |
| `scripts/css-audit.mjs` | doppelte Selektoren, `!important` je Datei, ungenutzte Selektoren in `css/**` |

Versionierung: `npm run version:sync` setzt den Wert aus `version.config.json` in allen *vorhandenen* `?v=`-Queries (Module und Assets). Viele lokale Module werden ohne `?v=` importiert und sind davon nicht erfasst (siehe `REFACTOR_TODO.md`, Abschnitt Modul-Laden). Bei jedem Deploy erhöhen.
Module ohne Importer werden gelöscht statt als Kopie gepflegt.

## Datenfluss: Startup → Karten laden → Checkbox ändern

```
app.js: bootstrap()
  ├── bootstrapCore()                     app/bootstrap-controller.js
  └── bootstrapPostCore()                 app/bootstrap-controller.js
        ↓  initAuth()                     core/auth.js  (localStorage-Token prüfen)
        ↓  Auto-Login → onLoginSuccess()  app.js  (auch nach manuellem Login-Klick)
        ↓
      loadSets()                          views/dashboard.js
        ├── fetchV3SetMeta()              data/pokemon-api.js  (api/v3-Set-Meta, DE-Serien)
        ├── listImportedSets()            data/sheets-db.js    (Blatt db_sets, imported=true)
        ├── listSetsOverviewData()        data/sheets-db.js
        └── state.sets / state.allSets füllen, Set-Auswahl + Dashboard rendern
        ↓  navigate('dashboard') bzw. handleRouteChange()   app/router.js
        ↓
[Route set/<id> oder Klick auf "Laden"]
      loadCurrentSet(forceRefresh)        views/set-view.js
        ├── loadSetCardsWithHydration(setId, { preferV3: true })   views/set-view.js
        │     ├── Cache-Treffer `cards_<setId>` → sofort
        │     └── loadSetCardsV3First()   views/set-view.js
        │           ├── fetchMergedCardsWithSetMeta(setId)   data/pokemon-api.js
        │           │     (api/v3 Sets + Karten, Registry für Aliase)
        │           └── Fehler → db_cards-Fallback (readDbCardsForSet, data/sheets-db.js)
        └── readSetCollectionMap(setName, { setId })   data/sheets-db.js
              Map<collectionKey, {g, rh, gCell, rhCell}>, Cache `db_<setId>`
      → state.cards / state.dbMap setzen
      → renderCards()                     views/set-cards.js  (Raster aufbauen, ruft applyFilter() + updateStats())

[Nutzer klickt Checkbox]                  views/set-cards.js  (attachCheckboxListeners)
  ↓  ensureDbEntry()                      legt bei Bedarf Set-Import/Sammlungszeile an
  ↓  writeCollectionEntryState()          views/set-cards.js
  ↓  updateCellBooleansBatch()            data/sheets-db.js   (gebündelter Sheets-Write)
  ↓  updateCardState(article, db)         views/set-cards.js  (nur CSS-Klassen, kein Re-Render)
  ↓  updateStats(); applyFilter()         views/set-cards.js
```

`fetchMergedCardsWithSetMeta` ist in `js/data/pokemon-api.js` definiert und wird von `views/set-view.js` und `views/set-cards.js` importiert. Das einzelne `updateCellBoolean` (`js/data/sheets-db.js`) ist nur noch Rückfall in `writeEntryStateWith` (`js/data/collection-writes.js`), wenn kein Batch-Write verfügbar ist.

## Google Sheets Datenbank-Struktur

### Sheet: `Sets Overview`

```
Zeile 1: Titel (merged A1:I1) + Refresh-Checkbox (J1)
Zeile 2: Zusammenfassung (merged A2:J2)
Zeile 3: Header-Zeile
Zeile 4+: Daten

Spalten:
  A  SetId       =HYPERLINK("...sheet-url...", "sv08")   → FORMULA lesen
  B  SetName     "Obsidian Flames"
  C  Logo        =IMAGE("https://...")
  D  Symbol      =IMAGE("https://...")
  E  Serie       "Scarlet & Violet"
  F  Datum       "2023-08-11"
  G  Gesamt      230
  H  ptcgoCode   "OBF"
  I  Importiert  TRUE/FALSE (Checkbox)
  J  Reimport    TRUE/FALSE (Checkbox)
```

### Sheet: `Collection Summary`

```
Zeile 1: Titel
Zeile 2: Statistik-Zusammenfassung
Zeile 3: Header
Zeile 4+: Daten

Spalten:
  A  SetName (verlinkt auf Set-Sheet)
  B  Gesamt
  C  Gesammelt (Normal)
  D  Gesammelt (RH)
  E  Prozent (0.xx Format)
  F  ptcgoCode
```

### Set-spezifisches Sheet (Karten-Grid)

Jedes importierte Set bekommt ein eigenes Sheet, z.B. `Obsidian Flames`.

```
Zeile 1–2: Header (merged A1:O1, A2:O2)
Ab Zeile 3: 5 Karten/Zeile × (3 Spalten × 4 Zeilen) = 15 Spalten (A–O)

Für Karte i (0-basiert):
  gridRow = floor(i / 5)        → Kartenreihe im Grid
  gridCol = i % 5               → Kartenposition in der Reihe

  blockStartRow = 3 + gridRow * 4
  blockStartCol = 1 + gridCol * 3   (1-basiert)

  blockStartRow + 0, col+0:  Karten-ID (z.B. "1")
  blockStartRow + 0, col+1:  Karten-Name (merged col+1..col+2)
  blockStartRow + 1, col+0:  Karten-Bild =IMAGE(...) (merged über 3 Spalten)
  blockStartRow + 2, col+0:  G-Checkbox   ← wird von der App gelesen/geschrieben
  blockStartRow + 2, col+1:  RH-Checkbox  ← wird von der App gelesen/geschrieben
  blockStartRow + 2, col+2:  Cardmarket-Hyperlink
  blockStartRow + 3:         Spacer (leer)

G-Checkbox Sheet-Adresse:
  row = blockStartRow + 2
  col = blockStartCol        (1-basiert)
  A1  = colToA1(col) + row

RH-Checkbox Sheet-Adresse:
  row = blockStartRow + 2
  col = blockStartCol + 1    (1-basiert)
```

### Sheet: `WebApp Settings`

```
Zeile 1: Header "key" | "value"
Zeile 2+: key-value-Paare

Bekannte Schlüssel:
  lastSetId   →  zuletzt geladene Set-ID (z.B. "sv08")
```

## Import-Specifier und Service-Worker

- Jedes Modul wird ueberall unter demselben Specifier importiert (Test `tests/module-specifier-consistency.test.mjs`), sonst entstehen im Browser zwei Modulinstanzen. `core/config.js`, `core/auth.js` und `core/utils.js` sind bewusst unversioniert (Mehrheit des Graphen; Tests importieren unversioniert und teilen so die Modulidentitaet mit der App). `data/schema-contract.js` dagegen wird in `js/` ausschliesslich mit `?v=<appVersion>` importiert (haelt den geteilten Serien-/Set-Meta-Zustand; Test `tests/version-query-consistency.test.mjs`). `version:sync` aendert nur vorhandene `?v=`.
- Service Worker: JS/CSS und network-first mit `cache: 'no-cache'` (kein veralteter HTTP-Cache nach Deploys); `api/v3`/`api/registry` (aendert sich nur taeglich) cache-first mit 24-h-Frische (Zeitstempel `x-sw-fetched-at`), danach Revalidierung per Netz, veraltete Kopie nur als Offline-Fallback; API-Runtime-Cache auf 60 Kartendateien begrenzt (sets/meta/search-index bleiben).
- API-Basis (`resolveV3Bases` in `js/data/v3-api.js`): GitHub Pages kopiert die App flach in den Site-Root bzw. `dev/` und `api/` daneben, daher `<App-Verzeichnis>/api/v3/` und `/api/registry/`; endet das App-Verzeichnis auf `/frontend/tcg-tracker-web/` (lokal `start:dev:full`, Repo-Root) `../../api/…`. `CONFIG.APIS.V3_BASE`/`REGISTRY_BASE` ueberschreiben beides.

## Anzeige-Felder: Sprachregel statt Resolver-Matrix

`resolveFieldValue(record, scope, field, language)` in `js/data/schema-contract.js` bestimmt jeden Anzeige-Wert:

- Sprachabhaengige Felder (Set: `setName`, `logoUrl`; Karte: `name`, `image`, `imageLarge`, `evolvesFrom`, `rules`, `flavorText`, `attacks`, `abilities`): gewaehlte Kartensprache -> andere Sprache -> legacy.
- Alle anderen Felder: `vera_*` (v3/EN) -> `tcgdex_*` -> legacy.

`resolveDisplaySet`/`resolveDisplayCard` nutzen nur diese Regel; die fruehere konfigurierbare Resolver-Matrix gibt es im Frontend nicht mehr. `scripts/` gehoert dem master-Zweig.

## Bilder: Fallback-Kette

`js/ui/image-fallback.js` liefert mit `imageCandidates(record, kind, language)` die URL-Kette fuer Set-Logos, Set-Symbole und Kartenbilder: bei `de` DE -> EN -> legacy (pokemontcg), bei `en` EN -> DE -> legacy; leere und doppelte Werte entfallen. Gerendert wird mit `data-fallbacks`/`data-placeholder` (`fallbackImgAttrs`, `bindImageFallback`); ein delegierter `error`-Listener rueckt die Kette vor und zeigt am Ende den Pokeball-Platzhalter.

## Dashboard

`renderDashboardSetGrid` (`js/views/dashboard-grid.js`) rendert alle Sets auf einmal, ohne Paging; Bilder laden per `loading="lazy"` nach.

## Suche

- Treffer kommen aus `api/v3/search-index.json` (`js/features/search/search-index-prefilter.js`, einmal je Session geladen, SW-Cache 24 h). Kartendateien je Set werden fuer die Suche nicht geladen; nur die Such-Lightbox laedt das Set der angeklickten Karte.
- Durchsucht werden Name EN und DE, Nummer, Kuenstler, Typ (englische und deutsche Typnamen, z. B. "Feuer"), Seltenheit, Supertyp und die Set-Felder (Name, Kuerzel, Serie, ID). Attacken- und Faehigkeitstexte stehen nicht im Index.
- Gezeichnet werden hoechstens `SEARCH_RESULT_RENDER_LIMIT` Treffer; nur fuer diese entstehen Karten-Objekte (`searchResultsForDisplay`).
- Sammlungs-Maps der Treffer-Sets laedt `readCollectionMapCached` (`js/features/search/search-collection-maps.js`): nur erfolgreiche Lesungen kommen in den Cache `db_<setId>`; bei Fehlern bleiben die Haken der Suchergebnisse gesperrt, die Lightbox zeigt eine leere Sammlung ohne sie zu cachen.

## Cardmarket

- Produkt-ID je Karte: `resolveCardmarketProductId` (`js/data/cardmarket-url-utils.js`) ist die einzige Entscheidung: v3-ID am Record (`cardmarketProductId`, primaere ID nach `primaryCardmarketProductId` bzw. `cm` im Suchindex) -> Legacy-URL mit `idProduct=` -> `cardmarketMatchedProductId` (Rueckfall-Feld; im Frontend gibt es keinen Matcher mehr, der es setzt). Es landet nie in `cardmarketProductId`. Links baut `resolveItemCardmarketUrl`.
- Preise: kommen ausschliesslich aus `api/v3/prices/<setId>.json` (`js/data/v3-prices.js`), je Karte nur wenn die `productId` des Eintrags der Produkt-ID des Records entspricht - kein Matching im Browser (der fruehere Name-/Nummern-Matcher und das Lesen von `cardmarket/` sind entfernt; der Ordner `cardmarket/` bleibt als eingefrorener Altbestand im Repo).
- Preis-Frische: `api/v3/prices/meta.json.generatedAt` ist der Build-Stamp (taeglich). `v3-prices.js` haengt ihn als `?v=<stamp>` an jede Preisdatei-URL; der Service Worker (`handleCardmarketRequest`) cacht diese URLs cache-first, meta.json network-first, aeltere Stamps werden entfernt. "Preise neu laden" (`refreshV3Prices`) liest den Stamp neu und leert die Preis-Zusammenfassungen der Kartenlinks/Lightbox (`cardmarketPriceSummaryCache` in `js/ui/cardmarket-price.js`).

## Cache-Strategie

| Schlüssel | Inhalt | TTL |
|---|---|---|
| `cards_{setId}` | `[{number, name, image, cardmarketUrl}]` | 10 min |
| `db_{setId}` | `Map<normalizedNumber, {g, rh, gCell, rhCell}>` | 10 min |

Bei `btn-refresh` werden beide Cache-Einträge invalidiert (`cache.del()`), damit frische Daten aus Sheets und API geladen werden.

## Token-Lebenszeit

```
OAuth-Ablauf (1h):
  localStorage["poke_tcg_tracker_token"] = {
    token: "ya29...",
    expires_at: Date.now() + 3540_000   // 1h - 1min Puffer
  }

Beim Seitenaufruf:
  initAuth()
    → tryRestoreToken()
      → if Date.now() < expires_at: gapi.client.setToken(token) + loadDiscoveryDocs()
      → andernfalls: localStorage löschen, manueller Login nötig
```

## Fehlerbehandlung

Alle `async`-Operationen sind mit `try/catch` umschlossen:
- API-Fehler → `showToast(message, 'error')`
- Sheets-Schreibfehler → Toast + Checkbox-Wert zurücksetzen
- Init-Fehler → `setStatus()`-Ausgabe + Toast
- Bild-Ladefehler → naechster Kandidat der Fallback-Kette, am Ende Platzhalter (`js/ui/image-fallback.js`)
