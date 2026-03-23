# Datenfluss

← [README.md](README.md)

---

## Überblick

```
Nutzer-Browser
  │
  ├── Google OAuth2 (auth.js)
  │     └── Token → localStorage (scoped)
  │
  ├── Google Sheets API (sheets-db.js)
  │     ├── Lesen:  db_sets, db_cards, db_collection → JS-Objekte
  │     └── Schreiben: Collection-Updates → Sheets
  │
  ├── Pokémon TCG API / Vera-API (pokemon-api.js)
  │     └── Set-/Karten-Metadaten → In-Memory Cache (cache.js)
  │
  └── IndexedDB Offline Store (features/search/engine.js)
        └── Offline-Fallback für Cards/Sets
```

## Initialisierungsreihenfolge

1. **`config.js`** – `STORAGE_SCOPE` ermitteln (URL-Parameter oder Pfad)
2. **`auth.js`** – GAPI laden, Token aus localStorage wiederherstellen
3. **`sheets-db.js`** – Schemas prüfen (`db_sets`, `db_cards`, `db_collection`)
4. **`features/search/engine.js`** – IndexedDB initialisieren (Offline-Fallback)
5. **`app.js`** – UI rendern, Event-Bindings setzen

## Datenpfade

### Set-Übersicht laden

```
app.js
  → sheets-db.js: listSetsOverviewData()
      → Google Sheets API: 'Sets Overview'
  → pokemon-api.js: fetchAllSets()
      → Vera-API (USE_VERA_API=true) oder PokemonTCG-API
  → cache.js: set('sets', ...)       ← TTL 10 min
```

### Collection aktualisieren

```
app.js (User-Interaktion)
  → sheets-db.js: updateCollectionRow()
      → Google Sheets API: batchUpdate
  → features/collection/versioning.js: createSnapshot()
      → localStorage (scoped, max 20 Snapshots)
  → features/community/sync.js: publishRealtimeEvent()
      → BroadcastChannel + localStorage-Event (andere Tabs)
```

### Offline-Betrieb

```
features/search/engine.js
  → IndexedDB (DB: poke-tcg-offline-<scope>)
      ├── stores: sets, cards, collection, metadata
      └── Auto-Healing: Mismatches werden gemeldet
```

## Storage-Namespacing

Alle Schlüssel nutzen den Scope-Prefix aus `config.js`:

```
poke:<scope>:<key>
poke:dev:tcg_spreadsheet_id
poke:release:collection-snapshots
```

Scope wird aus URL ermittelt: `?env=dev` oder Pfadsegment `/dev/` → `'dev'`, sonst `'release'`.

## Verwandte Seiten

- [architecture.md](architecture.md) – Schichtenmodell
- [modules/core/config.md](modules/core/config.md) – STORAGE_SCOPE
- [modules/data/sheets-db.md](modules/data/sheets-db.md) – Sheets-Datenbankdetails
