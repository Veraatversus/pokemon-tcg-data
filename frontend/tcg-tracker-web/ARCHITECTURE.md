# try4 – Architektur

## Modulabhängigkeiten

```
index.html
└── js/app.js (ES-Modul, Einstiegspunkt; Set-Ansicht, Lightbox, Suche, Statistik, Dialoge)
      ├── js/app/          bootstrap-controller.js (Startreihenfolge), pwa-init.js (Service Worker, Install-Prompt)
      ├── js/core/         config, auth, cache, utils, storage-keys, collection-state, display-text, retry, …
      ├── js/data/         v3-api, v3-records, pokemon-api, schema-contract (resolveFieldValue),
      │                    sheets-db, collection-writes, cardmarket-* (Daten, Matcher, URL/ID, Build-Stamp)
      ├── js/features/     search (Index-Suche, Query-Helfer, Sammlungs-Maps), collection (Import, Backup,
      │                    Legacy-Schluessel), community, settings
      ├── js/ui/           image-fallback, cardmarket-price, stats-*, components, command-palette, tools
      └── js/views/        dashboard-grid.js (Set-Raster des Dashboards)
```

Pruefungen: `npm run check:imports` (tote Imports, Zyklen) und `tests/module-specifier-consistency.test.mjs`.
Module ohne Importer werden geloescht statt als Kopie neben `app.js` gepflegt.

## Datenfluss: Startup → Karten laden → Checkbox ändern

```
bootstrap()
  ↓
initAuth()        ─── localStorage-Token prüfen
  ↓ (auto-login oder manueller Login)
onLoginSuccess()
  ↓
loadSets()
  ↓  gapi.client.sheets → "Sets Overview"!A3:J
listImportedSets()
  ↓  filter: imported=true
sets[] → <select> befüllen
  ↓
[Nutzer wählt Set + klickt "Laden"]
  ↓
loadCurrentSet(setId)
  ├── cache.get("cards_" + setId)  →  Hit: sofort weiter
  │     Miss: fetchMergedCards(setId)
  │             └── v3-api.js: api/v3/sets/<id>.json (+ api/registry für Set-Aliase)
  │           cache.set(...)
  │
  └── cache.get("db_" + setId)     →  Hit: sofort weiter
        Miss: readSetCollectionMap(sheetName)
                ↓  gapi.client.sheets → "SetName"!A3:O2000
              Map<normalizedNumber, {g, rh, gCell, rhCell}>
              cache.set(...)

→ renderCards()   DOM-Fragment aufbauen → einfügen
→ updateStats()   Zähler & Progress-Bar aktualisieren
→ applyFilter()   Karten ein-/ausblenden

[Nutzer klickt Checkbox]
  ↓
updateCellBoolean(sheetName, row, col, value)
  ↓  gapi.client.sheets.spreadsheets.values.update
updateCardState(article, db)   ← nur CSS-Klassen, kein Re-Render
updateStats()
applyFilter()
```

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
  blockStartRow + 2, col+0:  G-Checkbox   ← wird von app.js gelesen/geschrieben
  blockStartRow + 2, col+1:  RH-Checkbox  ← wird von app.js gelesen/geschrieben
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

- Jedes Modul wird ueberall unter demselben Specifier importiert (Test `tests/module-specifier-consistency.test.mjs`), sonst entstehen im Browser zwei Modulinstanzen. `core/config.js`, `core/auth.js`, `core/utils.js`, `data/schema-contract.js` und `data/cardmarket-data.js` sind bewusst unversioniert (Mehrheit des Graphen; Tests importieren unversioniert und teilen so die Modulidentitaet mit der App). `version:sync` aendert nur vorhandene `?v=`.
- Service Worker: JS/CSS und network-first mit `cache: 'no-cache'` (kein veralteter HTTP-Cache nach Deploys); `api/v3`/`api/registry` (aendert sich nur taeglich) cache-first mit 24-h-Frische (Zeitstempel `x-sw-fetched-at`), danach Revalidierung per Netz, veraltete Kopie nur als Offline-Fallback; API-Runtime-Cache auf 60 Kartendateien begrenzt (sets/meta/search-index bleiben).
- API-Basis (`resolveV3Bases` in `js/data/v3-api.js`): GitHub Pages kopiert die App flach in den Site-Root bzw. `dev/` und `api/` daneben, daher `<App-Verzeichnis>/api/v3/` und `/api/registry/`; endet das App-Verzeichnis auf `/frontend/tcg-tracker-web/` (lokal `start:dev:full`, Repo-Root) `../../api/…`. `CONFIG.APIS.V3_BASE`/`REGISTRY_BASE` ueberschreiben beides.

## Anzeige-Felder: Sprachregel statt Resolver-Matrix

`resolveFieldValue(record, scope, field, language)` in `js/data/schema-contract.js` bestimmt jeden Anzeige-Wert:

- Sprachabhaengige Felder (Set: `setName`, `logoUrl`; Karte: `name`, `image`, `imageLarge`, `evolvesFrom`, `rules`, `flavorText`, `attacks`, `abilities`): gewaehlte Kartensprache -> andere Sprache -> legacy.
- Alle anderen Felder: `vera_*` (v3/EN) -> `tcgdex_*` -> legacy.

`resolveDisplaySet`/`resolveDisplayCard` nutzen nur diese Regel; die fruehere konfigurierbare Resolver-Matrix gibt es im Frontend nicht mehr. `scripts/` gehoert dem master-Zweig; die Kopie in `scripts/cardmarket/lib/tracker-regression-helpers.mjs` wird dort gepflegt.

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

- Produkt-ID je Karte: `resolveCardmarketProductId` (`js/data/cardmarket-url-utils.js`) ist die einzige Entscheidung: v3-ID am Record (`cardmarketProductId`, primaere ID nach `primaryCardmarketProductId` bzw. `cm` im Suchindex) -> Legacy-URL mit `idProduct=` -> Treffer des Name-/Nummern-Matchers (`cardmarketMatchedProductId`). Matcher-Treffer landen nie in `cardmarketProductId`. Links baut `resolveItemCardmarketUrl`.
- Preis-Frische: Die Cardmarket-Daten werden taeglich gebaut; `meta.json.generatedAt` ist der Build-Stamp. `js/data/cardmarket-data.js` haengt ihn als `?v=<stamp>` an jede Daten-URL; der Service Worker cacht diese URLs cache-first, ein neuer Stamp ist eine neue URL und kommt beim ersten Laden aus dem Netz, aeltere Stamps werden entfernt.
- Stamp-Wechsel beim Start (`applyCardmarketBuildStampCheck`) und "Preise neu laden" (`forceRefreshCardmarketPrices`) leeren ueber `resetAllCardmarketCaches` die Daten-Caches und die Preis-Zusammenfassungen der Kartenlinks/Lightbox (`cardmarketPriceSummaryCache` in `js/ui/cardmarket-price.js`).

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
