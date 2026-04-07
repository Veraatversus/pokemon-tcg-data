# core/config.js

← [README.md](../../README.md) | [modules/core/auth.md](auth.md) | [modules/core/cache.md](cache.md)

---

## Zweck

Zentrale Konfigurationsdatei der App. Stellt Konstanten, API-Schlüssel, Sheet-Namen, Grid-Parameter und das `STORAGE_SCOPE`-System bereit. Wird von nahezu allen anderen Modulen importiert.

## Öffentliche API (Exports)

| Export | Typ | Beschreibung |
|--------|-----|-------------|
| `STORAGE_SCOPE` | `string` | `'dev'` oder `'release'`, ermittelt aus URL |
| `scopedStorageKey(baseKey)` | `(string) => string` | Gibt `poke:<scope>:<baseKey>` zurück |
| `scopedStoragePrefix(basePrefix?)` | `(string?) => string` | Gibt `poke:<scope>:<basePrefix>` zurück |
| `CONFIG` | `object` | Vollständiges Konfigurationsobjekt (siehe unten) |

### `CONFIG`-Felder

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| `GOOGLE_CLIENT_ID` | `string` | OAuth2-Client-ID |
| `GOOGLE_API_KEY` | `string` | Google-API-Schlüssel |
| `SPREADSHEET_ID` | `string` (get/set) | Aktive Spreadsheet-ID, scope-aware in localStorage |
| `DISCOVERY_DOCS` | `string[]` | GAPI Discovery-Dokumente |
| `SCOPES` | `string` | OAuth2-Scopes (Sheets + Drive) |
| `SHEETS.OVERVIEW` | `string` | `'Sets Overview'` |
| `SHEETS.SETTINGS` | `string` | `'WebApp Settings'` |
| `SHEETS.SUMMARY` | `string` | `'Collection Summary'` |
| `GRID.CARDS_PER_ROW` | `number` | 5 |
| `GRID.BLOCK_WIDTH` | `number` | 3 |
| `GRID.BLOCK_HEIGHT` | `number` | 4 |
| `GRID.HEADER_ROWS` | `number` | 2 |
| `GRID.IMPORTED_COL_INDEX` | `number` | 9 (1-basiert, Spalte I) |
| `APIS.POKEMONTCG` | `string` | `https://api.pokemontcg.io/v2` |
| `APIS.TCGDEX_DE` | `string` | `https://api.tcgdex.net/v2/de` |
| `APIS.VERA_BASE` | `string` | `https://veraatversus.github.io/pokemon-tcg-data` |
| `USE_VERA_API` | `boolean` | Vera-API bevorzugen (default: `true`) |
| `VERA_API_LANGUAGE` | `string` | `'en'` |
| `CACHE_TTL_MS` | `number` | 10 Min (600 000 ms) |

## Abhängigkeiten

Keine – dieses Modul importiert nichts.

## Datenfluss / Aufrufkontext

`STORAGE_SCOPE` wird beim Modul-Load einmalig durch `detectStorageScope()` ermittelt:

1. URL-Query `?env=dev` oder `?scope=dev` → `'dev'`
2. URL-Query `?env=release` oder `?scope=release` → `'release'`
3. URL-Pfadsegment enthält `'dev'` → `'dev'`
4. Sonst → `'release'`

## Fehlerfälle / Grenzen

- `SPREADSHEET_ID` leert sich, wenn `localStorage.removeItem` aufgerufen wird (z.B. beim Logout).
- `STORAGE_SCOPE` ist unveränderlich zur Laufzeit – ein Reload ist nötig, um den Scope zu wechseln.

## Änderungshinweise

- API-Schlüssel sind öffentlich sichtbar (Client-seitige App). Absicherung erfolgt über API-Key-Beschränkungen in der Google Cloud Console.
- Neue Sheets-Namen im `SHEETS`-Objekt anhängen; `sheets-db.js` verweist per Name darauf.

## Verlinkungen

- [modules/core/auth.md](auth.md) – verwendet `CONFIG`, `scopedStorageKey`
- [modules/data/sheets-db.md](../data/sheets-db.md) – verwendet `CONFIG`
- [modules/data/pokemon-api.md](../data/pokemon-api.md) – verwendet `CONFIG.APIS`
- [data-flow.md](../../data-flow.md) – Scope-System erklärt

## Validierungsstatus

| Feld | Wert |
|------|------|
| Letzte Prüfung | 2026-03-22 |
| Prüfumfang | Import-Check, kein Lint-Fehler |
| Offene Risiken | Keine |
| Verantwortliche Rolle | Entwickler/Copilot |
