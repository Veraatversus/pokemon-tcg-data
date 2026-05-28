# TCG Tracker Web – Dokumentations-Wiki

Zentrale Landing-Page für die technische Dokumentation der `frontend/tcg-tracker-web`-App.

---

## Bereiche

| Bereich | Beschreibung |
|---------|-------------|
| [architecture.md](architecture.md) | Schichtenarchitektur, Modul-Abhängigkeitsregeln |
| [data-flow.md](data-flow.md) | Datenfluss: Google Sheets ↔ App ↔ API |
| [field-equivalence-matrix.md](field-equivalence-matrix.md) | Feldzuordnung Vera ↔ TCGDex und Resolver-Defaults |
| [app.md](app.md) | Einstiegspunkt `app.js` |
| [navigation.md](navigation.md) | Seitennavigation und UI-Routingkonzept |
| [migration-validation.md](migration-validation.md) | Testmatrix, Protokoll, Abnahmeregeln |
| [changelog/removed-code.md](changelog/removed-code.md) | Entfernte Module und Dead-Code-Protokoll |

---

## Module

### core/
Fundament-Schicht – keine Abhängigkeiten zu anderen Modulen.

| Seite | Zweck |
|-------|-------|
| [modules/core/config.md](modules/core/config.md) | Konfigurationskonstanten, STORAGE_SCOPE, scopedStorageKey |
| [modules/core/auth.md](modules/core/auth.md) | Google OAuth2 / GAPI-Authentifizierung |
| [modules/core/cache.md](modules/core/cache.md) | In-Memory TTL-Cache |
| [modules/core/storage-keys.md](modules/core/storage-keys.md) | Storage-Key- und Event-Registry |
| [modules/core/utils.md](modules/core/utils.md) | Gemeinsame Hilfsfunktionen |

### data/
Datenzugriffsschicht – importiert nur aus `core/`.

| Seite | Zweck |
|-------|-------|
| [modules/data/sheets-db.md](modules/data/sheets-db.md) | Google-Sheets-Datenbankabstraktion |
| [modules/data/pokemon-api.md](modules/data/pokemon-api.md) | Pokémon-TCG-API-Adapter |

### features/
Feature-Slices – je nach Feature, importiert aus `core/`, `data/` oder dem eigenen Slice.

| Seite | Zweck |
|-------|-------|
| [modules/features/collection/index.md](modules/features/collection/index.md) | Collection-Feature: Übersicht |
| [modules/features/collection/versioning.md](modules/features/collection/versioning.md) | Snapshot/Rollback-System |
| [modules/features/search/index.md](modules/features/search/index.md) | Search-Feature: Übersicht |
| [modules/features/search/engine.md](modules/features/search/engine.md) | Smart Engine (IndexedDB, Offline-Mode) |
| [modules/features/community/index.md](modules/features/community/index.md) | Community-Feature: Übersicht |
| [modules/features/community/sync.md](modules/features/community/sync.md) | Realtime-Sync via BroadcastChannel |
| [modules/features/settings/index.md](modules/features/settings/index.md) | Settings-Feature: Übersicht |

### ui/
Präsentationsschicht – rendert DOM, kennt keine Feature-Interna.

| Seite | Zweck |
|-------|-------|
| [modules/ui/command-palette.md](modules/ui/command-palette.md) | CMD+K Command Palette |
| [modules/ui/components.md](modules/ui/components.md) | Wiederverwendbare UI-Komponenten |
| [modules/ui/tools.md](modules/ui/tools.md) | Advanced Search & Filter Toolbar |
| [modules/ui/panels.md](modules/ui/panels.md) | Seitliche Panel-Verwaltung |

### css/

| Seite | Zweck |
|-------|-------|
| [css/overview.md](css/overview.md) | CSS-Struktur, Themes, Imports |
| [css/variables.md](css/variables.md) | CSS Custom Properties |

### legacy/
Historische bzw. Übergangs-Module, die noch nicht vollständig in die Zielarchitektur überführt sind.

| Seite | Zweck |
|-------|-------|
| [modules/legacy/advanced-features.md](modules/legacy/advanced-features.md) | Backup/Export/Gesten/Statistik (Legacy) |
| [modules/legacy/enhanced-features.md](modules/legacy/enhanced-features.md) | Favoriten/Settings/Bulk/Reports (Legacy) |
| [modules/legacy/card-filters.md](modules/legacy/card-filters.md) | Kartenfilter- und Wertlogik (Legacy) |
| [modules/legacy/pokecode-compat.md](modules/legacy/pokecode-compat.md) | Kompatibilitätsadapter für API-Migration |
| [modules/legacy/community-features.md](modules/legacy/community-features.md) | Community-Domainlogik (Legacy) |
| [modules/legacy/community-ui.md](modules/legacy/community-ui.md) | Community-UI-Bausteine (Legacy) |
| [modules/legacy/social-features.md](modules/legacy/social-features.md) | Social/Wishlist/Achievement-Funktionen (Legacy) |
| [modules/legacy/social-ui.md](modules/legacy/social-ui.md) | Social-UI-Komponenten (Legacy) |
| [modules/legacy/trading-system.md](modules/legacy/trading-system.md) | Handelslogik (Legacy) |
| [modules/legacy/trading-ui.md](modules/legacy/trading-ui.md) | Trading-UI (Legacy) |
| [modules/legacy/compat-reexports.md](modules/legacy/compat-reexports.md) | Übergangs-Re-Export-Wrapper |
