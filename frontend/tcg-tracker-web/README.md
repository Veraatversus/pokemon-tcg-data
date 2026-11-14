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
| Cardmarket Preisradar in Statistiken (Lazy Loading) | ✅ |
| Filter: Alle / Fehlend / Gesammelt | ✅ |
| Toast-Benachrichtigungen (Erfolg / Fehler) | ✅ |
| Lade-Overlay mit Spinner | ✅ |
| Responsive Layout (Mobile ≤ 768 px) | ✅ |
| Cardmarket-Links | ✅ |
| Kartensuche über alle Sets (Suchindex, ohne Laden der Kartendateien) | ✅ |

---

## Schnellstart

### 1. Google Cloud Projekt einrichten

1. Gehe zu [console.cloud.google.com](https://console.cloud.google.com) → Neues Projekt
2. **Google Sheets API** aktivieren
3. **OAuth 2.0 Client-ID** anlegen (Typ: Web-Anwendung):
   - Autorisierte JS-Ursprünge: `http://localhost:8080` + deine GitHub-Pages-URL

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
  │    └── v3-api.js → api/v3 (vorberechnet, EN + i18n.de) + api/registry (Set-Aliase)
  │        → [{number, name, image, cardmarketUrl}]
  │
  └─ readSetCollectionMap(sheetName)   sheets-db.js
       └─ gapi.client.sheets → Grid-Werte lesen
            → Map<normalizedNumber, {g, rh, gCell, rhCell}>
```

## Statistik: Cardmarket Preisradar

Die Statistikansicht enthält einen zusätzlichen Preisbereich auf Basis der Preisdaten aus `api/v3/prices` (kein Matching im Browser; Produkt-IDs stammen aus api/v3).

- Die Kern-Statistik rendert zuerst ohne Blockierung.
- Preisdaten werden danach chunk-basiert nachgeladen.
- Der Panel-Status wechselt über `data-state` von `loading` nach `partial` und `final`.
- Request-Guards (`requestId`) verhindern stale DOM-Updates bei View-Wechseln.

### Relevante Parameter

- `STATS_PRICE_CHUNK_SIZE = 25`
- `STATS_PRICE_CONCURRENCY = 4`

### Tests

```bash
node --test frontend/tcg-tracker-web/tests/stats-price-analytics.test.mjs
node --test frontend/tcg-tracker-web/tests/stats-price-lazy-loading-regression.mjs
node --test frontend/tcg-tracker-web/tests/v3-prices.test.mjs
```

---

## Bekannte Einschränkungen

- OAuth-Token läuft nach 1h ab; auto-refresh via GIS beim nächsten Request
- Karten-/Setdaten kommen aus `api/v3`; ist es nicht erreichbar, werden bereits importierte Sets aus `db_cards` angezeigt

3. Lokal testen:
   - z. B. `python -m http.server 8000`
  - `http://localhost:8000/frontend/tcg-tracker-web/`

## Hinweise
- Diese Version ist ein MVP-Startpunkt.
- Der bestehende Grid-Aufbau der Set-Blätter (5x3, Höhe 4) wird für das Lesen/Schreiben der Checkboxen verwendet.
- Kartenbilder, Set-Logos und Set-Symbole: zuerst in der gewählten Kartensprache, dann in der anderen Sprache, zuletzt `https://images.pokemontcg.io/…`; danach erscheint der Pokéball-Platzhalter.
- Die Suche findet Namen (deutsch und englisch), Kartennummer, Künstler, Typ (deutsch oder englisch, z. B. „Feuer“ oder „Fire“), Seltenheit und Set (Name, Kürzel, Serie). Attacken- und Fähigkeitstexte werden nicht durchsucht.
- Cardmarket-Preise kommen aus `api/v3/prices` und werden täglich neu gebaut; die App holt einen neuen Stand automatisch, „Preise neu laden“ in den Einstellungen leert zusätzlich alle Preis-Caches.
- Die Kartensprache (Englisch/Deutsch) wird pro Browser gespeichert (localStorage), nicht im Spreadsheet; auf einem anderen Gerät oder in einem anderen Browser gilt wieder die Voreinstellung.
- Vor der Zuordnung mehrdeutiger Altzeilen wird ein Auto-Snapshot angelegt; eine Rueckgaengig-Funktion fuer diese Migration gibt es in der Oberflaeche noch nicht.
- Noch nicht zugeordnete Kandidaten mehrdeutiger Altzeilen zeigen den gemeinsamen Altstatus mit dem Hinweis „nicht zugeordnet“; ein Klick auf G oeffnet die Zuordnung.
