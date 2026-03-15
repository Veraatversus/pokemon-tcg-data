# Pokémon TCG Tracker – tcg-tracker-web

Statische Web-App (HTML/CSS/ES-Module), die **Google Sheets als Datenbank** nutzt.  
Kein Server, kein Build-Schritt – direkt auf GitHub Pages deploybar.

---

## Funktionsumfang

| Feature | Status |
|---|---|
| Google OAuth 2.0 Login (GAPI + GIS) | ✅ |
| Token-Persistenz (localStorage, Auto-Login) | ✅ |
| Sets aus Google Sheets laden | ✅ |
| Karten von Vera-API / pokemontcg.io laden | ✅ |
| Deutsche Kartennamen & Bilder via TCGDex DE | ✅ |
| TCGDex-only Sets (DE-exklusiv, TCGDEX-Präfix) | ✅ |
| G / RH Checkboxen direkt in Sheets schreiben | ✅ |
| Inkrementelle Karten-Updates (kein Full-Rerender) | ✅ |
| In-Memory TTL-Cache (kein unnötiger Netzwerk-Traffic) | ✅ |
| Sammlungsfortschritt & Statistiken | ✅ |
| Filter: Alle / Fehlend / Gesammelt | ✅ |
| Toast-Benachrichtigungen (Erfolg / Fehler) | ✅ |
| Lade-Overlay mit Spinner | ✅ |
| Responsive Layout (Mobile ≤ 768 px) | ✅ |
| Cardmarket-Links | ✅ |

---

## Schnellstart

### 1. Google Cloud Projekt einrichten

1. Gehe zu [console.cloud.google.com](https://console.cloud.google.com) → Neues Projekt
2. **Google Sheets API** aktivieren
3. **OAuth 2.0 Client-ID** anlegen (Typ: Web-Anwendung):
   - Autorisierte JS-Ursprünge: `http://localhost:8080` + deine GitHub-Pages-URL
4. **API-Schlüssel** anlegen → Einschränken auf Google Sheets API

### 2. Google Spreadsheet

Das Spreadsheet braucht folgende Sheets (exakte Namen):

| Sheet-Name | Zweck |
|---|---|
| `Sets Overview` | Set-Metadaten; ab Zeile 3, Spalte A = SetId (HYPERLINK), I = Importiert-Checkbox |
| `Collection Summary` | Sammelstatistik; Daten ab Zeile 4, Spalten A–F |
| `WebApp Settings` | Key-Value-Paare; wird automatisch angelegt |
| `{Set-Name}` | Karten-Grid für jedes importierte Set |

> Die Set-Sheets folgen dem Grid-Layout aus `pokecode.js`:  
> 5 Karten/Zeile × 3 Spalten/Block × 4 Zeilen/Block, 2 Header-Zeilen.

### 3. config.js befüllen

```js
// frontend/tcg-tracker-web/js/config.js
GOOGLE_CLIENT_ID: 'DEINE_CLIENT_ID.apps.googleusercontent.com',
GOOGLE_API_KEY:   'REDACTED_PLACEHOLDER',
SPREADSHEET_ID:   'AUS_DER_SHEETS-URL',
```

### 4. Lokal starten

```bash
npx serve frontend/tcg-tracker-web          # empfohlen
# oder:
cd frontend/tcg-tracker-web && python -m http.server 8080
```

Öffne: `http://localhost:8080`

> Muss über HTTP(S) laufen, nicht als `file://` (OAuth benötigt einen validen Ursprung).

---

## Modulübersicht

| Datei | Verantwortung |
|---|---|
| `js/utils.js` | Shared-Utilities: `normalizeCardNumber`, `naturalSort`, `toBoolean`, `colToA1`, `extractDisplayTextFromHyperlink` |
| `js/cache.js` | In-Memory TTL-Cache (RAM only, kein localStorage) |
| `js/config.js` | Alle Konstanten: Credentials, Grid, API-URLs, Farben, ID-Mappings |
| `js/auth.js` | Google OAuth 2.0 mit Auto-Login & Token-Persistenz |
| `js/sheets-db.js` | Sheets-Zugriff: Sets lesen, Karten-Grid lesen, Checkboxen schreiben |
| `js/pokemon-api.js` | Karten-Daten: Vera-API/pokemontcg.io + TCGDex DE merge/union |
| `js/app.js` | Hauptlogik: Bootstrap, UI-Events, Rendering, Stats, Filter, Toast |

---

## Grid-Layout (Google Sheets)

```
Zeilen 1–2: Header
Ab Zeile 3: Karten-Grid (5 Karten/Zeile)

Pro Karte: Block aus 3 Spalten × 4 Zeilen:
  Zeile +0 (ID/Name):   Sp.1=ID,  Sp.2–3=Name (gemerged)
  Zeile +1 (Bild):      Sp.1–3=IMAGE()-Formel (gemerged)
  Zeile +2 (Checkboxen):Sp.1=G,   Sp.2=RH,    Sp.3=CM-Link
  Zeile +3 (Spacer):    leer

Absolute Sheet-Zeile für Karte i (0-basiert):
  blockStartRow = 3 + floor(i / 5) * 4
```

---

## API-Datenfluss

```
loadCurrentSet(setId)
  ├─ fetchMergedCards(setId)           pokemon-api.js
  │    ├─ fetchVeraCards()             → Vera GitHub Pages (schnell)
  │    │    └── Fallback: fetchPokemontcgCards()
  │    ├─ fetchTcgdexSet(tcgdexId)     → api.tcgdex.net/v2/de
  │    └─ merge + union → [{number, name, image, cardmarketUrl}]
  │
  └─ readSetCollectionMap(sheetName)   sheets-db.js
       └─ gapi.client.sheets → Grid-Werte lesen
            → Map<normalizedNumber, {g, rh, gCell, rhCell}>
```

---

## Bekannte Einschränkungen

- OAuth-Token läuft nach 1h ab; auto-refresh via GIS beim nächsten Request
- pokemontcg.io Rate-Limit: 1000/Tag → mit `USE_VERA_API: true` umgehen
- TCGDex-Bilder fehlen für ältere Sets → Fallback auf pokemontcg.io CDN
- TCGDex-ID-Mappings (`CUSTOM_SET_ID_MAPPINGS`) ggf. bei neuen Sets ergänzen

3. Lokal testen:
   - z. B. `python -m http.server 8000`
  - `http://localhost:8000/frontend/tcg-tracker-web/`

## Hinweise
- Diese Version ist ein MVP-Startpunkt.
- Der bestehende Grid-Aufbau der Set-Blätter (5x3, Höhe 4) wird für das Lesen/Schreiben der Checkboxen verwendet.
- Für Karten ohne TCGDex-Bild wird auf `https://images.pokemontcg.io/{setId}/{cardNumber}.png` zurückgefallen.
