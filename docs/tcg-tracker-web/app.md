# app.js – Einstiegspunkt

← [README.md](README.md)

---

## Zweck

`js/app.js` ist der einzige direkte Einstiegspunkt der Single-Page-App. Er koordiniert die Initialisierung aller Module und setzt die Event-Bindungen für die gesamte UI.

## Öffentliche API (Exports)

`app.js` exportiert nichts – es ist kein Modul, das von anderen importiert wird. Es wird per `<script type="module" src="js/app.js">` in `index.html` eingebunden.

## Abhängigkeiten

```
app.js
  ├── core/auth.js          – Google-Authentifizierung
  ├── core/cache.js         – In-Memory Cache
  ├── core/config.js        – Konfiguration, STORAGE_SCOPE
  ├── core/utils.js         – Hilfsfunktionen
  ├── data/sheets-db.js     – Sheets-Datenbankabstraktion
  ├── data/pokemon-api.js   – Pokémon-API-Adapter
  ├── ui/command-palette.js – CMD+K Palette
  ├── ui/components.js      – UI-Komponenten
  ├── ui/tools.js           – Schnellfilter-Toolbar
  ├── features/search/index.js     – Search-Feature
  ├── features/collection/index.js – Collection-Feature
  └── features/community/index.js  – Community/Realtime-Feature
```

## Datenfluss / Aufrufkontext

Initialisierungsreihenfolge beim Laden der Seite:

1. DOM-Ready-Event abwarten
2. `initAuth()` → GAPI laden, Token prüfen
3. `initOfflineDb()` (über Search-Feature)
4. `loadSets()` → Sheets-Overview + Pokémon-API
5. `renderUI()` → Sets-Grid und Filter aufbauen
6. `initCommandPalette()` → Keyboard-Handler registrieren
7. `initRealtimeSync()` → BroadcastChannel öffnen

## Fehlerfälle / Grenzen

- Wenn GAPI nicht lädt (Netzwerk-Fehler), wird der Auth-Flow übersprungen und ein Fehlerbanner angezeigt.
- Wenn `SPREADSHEET_ID` fehlt, zeigt die App einen Setup-Wizard.
- Feature-Module, die nicht geladen werden können, lösen einen Console-Error aus, blockieren aber nicht den Start anderer Features.

## Änderungshinweise

- Import-Regel: `app.js` darf **nur** `features/<feature>/index.js` für Feature-Code importieren (Spec §7, Regel 8).
- Direkte Imports von `features/*/engine.js` o.ä. sind verboten.

## Verlinkungen

- [architecture.md](architecture.md) – Importregeln
- [data-flow.md](data-flow.md) – Initialisierungsreihenfolge
- [modules/core/auth.md](modules/core/auth.md) – Auth-Modul
- [modules/features/search/index.md](modules/features/search/index.md) – Search-Feature
- [modules/features/collection/index.md](modules/features/collection/index.md) – Collection-Feature
- [modules/features/community/index.md](modules/features/community/index.md) – Community-Feature

## Validierungsstatus

| Feld | Wert |
|------|------|
| Letzte Prüfung | 2026-03-22 |
| Prüfumfang | Statischer Import-Check (alle relativen Importe auflösbar) |
| Offene Risiken | Phase-2-Module (social, trading, card-filters) noch nicht als Feature-Slice refaktoriert |
| Verantwortliche Rolle | Entwickler/Copilot |
