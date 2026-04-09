# data/sheets-db.js

← [../../README.md](../../README.md) | [pokemon-api.md](pokemon-api.md) | [../core/config.md](../core/config.md)

---

## Zweck

Datenbankabstraktion für Google Sheets (Lesen/Schreiben von Sets, Karten, Collection, Settings).

## Öffentliche API

| Export |
|---|
| `listImportedSets()` |
| `readDbCardsForSet(setId)` |
| `listSetsOverviewData()` |
| `readSummarySheet()` |
| `upsertOverviewSet(setMeta, imported)` |
| `syncOverviewWithApiSets(sets, importedSetIds)` |
| `importSetIntoCollection(setMeta, cards)` |
| `readSetCollectionMap(setSheetName)` |
| `ensureCollectionEntry(setSheetName, cardNumber)` |
| `updateCellBoolean(sheetName, row, col, value)` |
| `ensureSettingsSheet()` |
| `readSettings()` |
| `writeSetting(key, value)` |

## Abhängigkeiten

- `core/config.js`
- `core/utils.js`
- `gapi.client.sheets`

## Datenfluss

`app.js` ruft dieses Modul für Set-Overview, Collection-Toggles und Settings auf. Das Modul kapselt Range-Building, Retry-Strategien und Schema-Initialisierung.

## Fehlerfälle

- Nicht initialisierte GAPI-Clients
- 429/5xx mit Retry-Backoff
- ungültige Ranges bei inkonsistenten Sheet-Strukturen

## Verwandte Seiten

- [pokemon-api.md](pokemon-api.md)
- [../../data-flow.md](../../data-flow.md)
- [../../migration-validation.md](../../migration-validation.md)
