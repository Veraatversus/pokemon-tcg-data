# features/search/engine.js

← [../../../README.md](../../../README.md) | [index.md](index.md)

---

## Zweck

Smart Engine für Offline-Cache, Auto-Healing und Fuzzy-Suche.

## Öffentliche API

| Export |
|---|
| `startAutoHealing(apiCollectionMap, sheetCollectionMap)` |
| `fuzzySearch(query, haystack, fields)` |
| `getEngineMetrics()` |
| `initSmartEngine()` |
| `cacheCardsOffline(setId, cards, metadata)` |
| `getCachedCardsOffline(setId)` |
| `processSyncQueue()` |

## Abhängigkeiten

- `core/config.js` (`STORAGE_SCOPE`)
- IndexedDB

## Datenfluss

Initialisierung über `initSmartEngine()`; Cards/Sets werden in IndexedDB Stores gehalten (`sets`, `cards`, `collection`, `metadata`).

## Verwandte Seiten

- [../../../data-flow.md](../../../data-flow.md)
- [../../../app.md](../../../app.md)
