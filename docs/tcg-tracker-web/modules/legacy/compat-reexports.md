# legacy/compat-reexports

← [../../README.md](../../README.md)

---

## Zweck

Dokumentiert die Übergangs-Re-Export-Dateien auf Top-Level, die alte Importpfade stabil halten.

## Aktuelle Re-Export-Wrapper

- `js/auth.js` -> `core/auth.js`
- `js/cache.js` -> `core/cache.js`
- `js/config.js` -> `core/config.js`
- `js/utils.js` -> `core/utils.js`
- `js/sheets-db.js` -> `data/sheets-db.js`
- `js/pokemon-api.js` -> `data/pokemon-api.js`
- `js/command-palette.js` -> `ui/command-palette.js`
- `js/ui-components.js` -> `ui/components.js`
- `js/advanced-tools.js` -> `ui/tools.js`
- `js/smart-engine.js` -> `features/search/engine.js`
- `js/collection-versioning.js` -> `features/collection/versioning.js`
- `js/realtime-sync.js` -> `features/community/sync.js`

## Ziel

Schrittweise Entfernen dieser Wrapper nach Umstellung aller Imports.

## Verwandte Seiten

- [../../architecture.md](../../architecture.md)
- [../../migration-validation.md](../../migration-validation.md)
