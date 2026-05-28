# core/storage-keys.js

Zentrale Registry fuer alle runtime-relevanten localStorage-Keys und App-Events.

## Ziel

- Keine harten String-Literale fuer Keys/Events in Runtime-Code.
- Einheitliche Benennung mit klaren Praefixen und Scopes.
- Dokumentierte Migrationsbasis fuer Legacy-Handler.

## Storage-Keys

| Konstante | Beispielwert | Zweck |
|---|---|---|
| REALTIME_CLIENT_STORAGE_KEY | tcg_tracker:user:realtime_client_id | Realtime-Client-ID pro Browser |
| USER_ID_STORAGE_KEY | tcg_tracker:user:user_id | User-ID fuer Session/Profile |
| DASHBOARD_PREFS_STORAGE_KEY | tcg_tracker:app:dashboard_prefs_v1 | Dashboard-Filter/Ansicht |
| GRID_ZOOM_STORAGE_KEY | gridZoom | Grid-Zoom (legacy-kompatibel) |
| RECENT_SETS_STORAGE_KEY | tcg_tracker:app:recent_sets_v1 | Zuletzt geoeffnete Sets |
| QUEUE_PRESETS_STORAGE_KEY | tcg_tracker:app:queue_presets_v1 | Queue-Vorlagen |
| DEV_COMPLETION_STORAGE_KEY | tcg_tracker:app:dev_completion_mode | Dev-Completion-Flag |
| LAST_SHEETS_SYNC_KEY | tcg_tracker:sync:last_sheets_sync | Letzter Sheets-Sync |
| LAST_API_SYNC_KEY | tcg_tracker:sync:last_api_sync | Letzter API-Sync |

## Event-Namen

| Konstante | Eventname | Produzent(en) | Konsument(en) |
|---|---|---|---|
| EVENT_QUICK_FILTERS_CHANGED | quick-filters-changed | ui/components.js | app.js |
| EVENT_SPREADSHEET_SWITCHED | spreadsheet-switched | features/settings/spreadsheet-dialog.js | app.js + Legacy-Bridge |
| EVENT_COLLECTION_UPDATED | collection-updated | Collection-Writer | Views/Stats |
| EVENT_CLEAR_SEARCH_HISTORY | clear-search-history | ui/components.js | app.js |
| EVENT_SHEETS_WRITE_RETRY | sheets-write-retry | data/sheets-db.js | ui/sheets-retry-report.js |
| EVENT_SHEETS_WRITE_SUCCESS | sheets-write-success | data/sheets-db.js | ui/sheets-retry-report.js |
| EVENT_SHEETS_WRITE_FAILED | sheets-write-failed | data/sheets-db.js | ui/sheets-retry-report.js |

## Namensregeln

- Storage-Keys: semantische snake_case-Segmente, versionierbar mit _vN.
- Events: kebab-case, praezise und feature-orientiert.
- Neue Runtime-Events immer zuerst in core/storage-keys.js definieren.
- Direkte String-Literale fuer Keys/Events sind in Runtime-Modulen nicht erlaubt.
