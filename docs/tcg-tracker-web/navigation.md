# Navigation

← [README.md](README.md)

---

## Konzept

`tcg-tracker-web` ist eine Single-Page-App ohne Router. Die Navigation erfolgt ausschließlich über:

1. **Tab-basierte Panels** – CSS-gesteuerte `show`/`hide`-Klassen auf `<div>`-Sektionen
2. **Command Palette** – CMD+K öffnet `ui/command-palette.js`, von dort aus werden Aktionen dispatcht
3. **Quick-Filter-Toolbar** – `ui/tools.js` rendert Schnellfilter, die per `CustomEvent` an `app.js` kommunizieren

## Tab-Struktur

| Tab-ID | Beschreibung |
|--------|-------------|
| `overview` | Sets-Übersicht mit Fortschrittsanzeige |
| `collection` | Detailansicht einer Sammlung |
| `search` | Karten-/Set-Suche |
| `settings` | App-Einstellungen & Spreadsheet-Konfiguration |
| `community` | Realtime-Sync, Spieleranwesenheit |

## Tastaturkürzel

| Shortcut | Aktion |
|----------|--------|
| `Ctrl+K` / `Cmd+K` | Command Palette öffnen |
| `/` | Suchfeld öffnen |
| `?` | Keyboard-Hilfe anzeigen |
| `Shift+B` | Backup exportieren |

## Event-Bus

Die Module kommunizieren per `window.dispatchEvent(new CustomEvent(...))`:

| Event | Sender | Empfänger | Payload |
|-------|--------|-----------|---------|
| `quick-filters-changed` | `ui/tools.js` | `app.js` | `{ completed, inProgress, notImported, favoritesOnly }` |
| `command-palette-action` | `ui/command-palette.js` | `app.js` | `{ commandId }` |
| `tcg-realtime-event` | `features/community/sync.js` | `app.js` | `{ type, source, timestamp, payload? }` |

## Verwandte Seiten

- [modules/ui/command-palette.md](modules/ui/command-palette.md) – Command Palette Details
- [modules/ui/tools.md](modules/ui/tools.md) – Quick-Filter-Toolbar
- [modules/ui/components.md](modules/ui/components.md) – UI-Komponenten
- [app.md](app.md) – Einstiegspunkt
