# legacy/advanced-features.js

← [../../README.md](../../README.md)

---

## Zweck

Legacy-Helfer für Backup/Export, Gesten/Voice und Statistik-Hilfsfunktionen. Wird schrittweise in Feature-Slices überführt.

## Öffentliche API

- `VoiceCommandRecognizer`
- `GestureRecognizer`
- `downloadJson(filename, data)`
- `downloadCsv(filename, data)`
- `createLocalBackup(data, name)`
- `getLocalBackups()`
- `restoreLocalBackup(key)`
- `deleteLocalBackup(key)`
- `getLocalBackupSize()`
- `detectDuplicateCards(collection, setName)`
- `mergeImportedCollections(collectionA, collectionB)`
- `generateAdvancedStatistics(collection, sets)`
- `generateCollectionInsights(collection, sets)`

## Migrationsstatus

- Teilweise aktiv
- Ziel: Aufteilung in `features/collection/*` und `ui/tools.js`

## Verwandte Seiten

- [../ui/tools.md](../ui/tools.md)
- [../features/collection/index.md](../features/collection/index.md)
- [../../changelog/removed-code.md](../../changelog/removed-code.md)
