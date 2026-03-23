# legacy/enhanced-features.js

← [../../README.md](../../README.md)

---

## Zweck

Sammelmodul für Favoriten, Suchhistorie, Settings, Bulk-Mode und Collection-Statistiken.

## Öffentliche API (Kurz)

- Favoriten: `loadFavorites`, `saveFavorites`, `toggleFavorite`, `isFavorite`, `getFavoritesList`
- Suchverlauf: `loadSearchHistory`, `saveSearchHistory`, `addSearchHistory`, `clearSearchHistory`
- Reporting: `createCollectionSnapshot`, `generateCollectionReport`, `calculateCollectionStats`
- Settings: `loadSettings`, `saveSettings`, `updateSetting`
- Filter: `applyQuickFilters`
- Sync-Status: `getSyncStatus`, `setSyncStatus`, `resetSyncStatus`
- Bulk-Mode: `initBulkMode`, `toggleBulkSelection`, `getBulkSelection`, `clearBulkSelection`, `selectAllBulk`

## Migrationsstatus

- Aktiv, aber strukturell überladen
- Ziel: Aufteilung in `features/search`, `features/settings`, `features/collection`

## Verwandte Seiten

- [../features/search/index.md](../features/search/index.md)
- [../features/settings/index.md](../features/settings/index.md)
- [../../changelog/removed-code.md](../../changelog/removed-code.md)
