# features/collection/versioning.js

← [../../../README.md](../../../README.md) | [index.md](index.md)

---

## Zweck

Snapshot- und Rollback-Funktionen für Collection-Daten in localStorage.

## Öffentliche API

| Export |
|---|
| `CollectionSnapshot` |
| `createSnapshot(name, collectionData, metadata)` |
| `loadSnapshots()` |
| `restoreFromSnapshot(snapshotId)` |
| `deleteSnapshot(snapshotId)` |
| `getSnapshotsSize()` |
| `createAutoSnapshot(actionName, collectionData)` |
| `getSnapshotsSummary()` |

## Abhängigkeiten

- `core/config.js` (`scopedStorageKey`)

## Grenzen

- Maximal 20 Snapshots
- LocalStorage-Limits browserabhängig

## Verwandte Seiten

- [../../../data-flow.md](../../../data-flow.md)
- [../../../app.md](../../../app.md)
