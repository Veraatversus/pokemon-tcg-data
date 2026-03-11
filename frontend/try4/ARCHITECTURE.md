# try4 – Architektur

## Modulabhängigkeiten

```
index.html
└── js/app.js (ES-Modul, Einstiegspunkt)
      ├── js/auth.js          ← js/config.js
      ├── js/sheets-db.js     ← js/config.js + js/utils.js
      ├── js/pokemon-api.js   ← js/config.js + js/utils.js
      ├── js/cache.js         (keine Abhängigkeiten)
      ├── js/utils.js         (keine Abhängigkeiten)
      └── js/config.js        (keine Abhängigkeiten)
```

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
  │             ├── fetchVeraCards()         Vera GitHub Pages
  │             │     ↓ 404/Fehler → fetchPokemontcgCards()
  │             ├── fetchTcgdexSet(tcgdexId) api.tcgdex.net/v2/de
  │             └── merge + TCGDex-Union
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
- Bild-Ladefehler → `img.onerror`: Bild ausblenden
