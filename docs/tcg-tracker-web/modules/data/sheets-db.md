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
| `readSetCollectionMap(setSheetName, { setId?, resolver? })` |
| `ensureCollectionEntry(setSheetName, collectionKey, { setId?, resolver? })` |
| `cellsForUpdate(entry, field, value)` |
| `updateCellBoolean(sheetName, row, col, value)` |
| `updateCellBooleansBatch(sheetName, updates, { chunkSize })` |
| `ensureSettingsSheet()` |
| `readSettings()` |
| `writeSetting(key, value)` |

## Sammlung über Registry-Aliase

- `readSetCollectionMap` liest `db_collection`-Zeilen unter **allen** Aliasen des kanonischen Sets (`TCGDEX-<id>`, Unterset-IDs wie `swsh12pt5gg`) und ordnet sie über `data/collection-aliases.js` (Resolver aus `v3-collection-keys.js`) dem `collectionKey` zu. Ein Eintrag hat `cells` (alle Zeilen der Karte); `g`/`rh` = ODER, `gCell`/`rhCell` = erste Zelle.
- Mehrdeutige Altzeilen (z. B. `cel25c`/`15`) werden nicht zugeordnet, sondern je Kandidat unter `ambiguous` vermerkt.
- Schreiben: `cellsForUpdate(entry, 'g'|'rh', value)` liefert alle Zellen einer Karte (Regel rh ⇒ g). Neue Zeilen nur unter der kanonischen Set-ID mit `collectionKey`. Zeilen werden nie umbenannt oder gelöscht; `clearMissing` leert nur kanonische Zeilen ohne Haken.
- Ohne erreichbare Registry gilt der exakte Set-ID-Pfad wie bisher.
- `db_cards`/`db_sets` werden nur bei `CONFIG.WRITE_DB_CARDS` geschrieben, die Overview-Zeile immer.

## Abhängigkeiten

- `core/config.js`
- `data/collection-aliases.js`, `data/v3-api.js` (Registry)
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
