# legacy/compat-reexports

← [../../README.md](../../README.md)

---

## Zweck

Dokumentiert die Übergangs-Re-Export-Dateien auf Top-Level, die alte Importpfade stabil halten.

## Stand

Alle Re-Export-Wrapper sind entfernt; Importe zeigen direkt auf `core/`, `data/`, `ui/` und `features/`.
Zuletzt entfernt (2026-11-13): `js/smart-engine.js` (-> `features/search/engine.js`) und `js/realtime-sync.js` (-> `features/community/sync.js`).

## Verwandte Seiten

- [../../architecture.md](../../architecture.md)
- [../../migration-validation.md](../../migration-validation.md)
