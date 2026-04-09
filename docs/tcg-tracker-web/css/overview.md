# CSS Overview

← [../README.md](../README.md)

---

## Zweck

Beschreibt die Zielstruktur für Styles und die Lade-/Prioritätsreihenfolge.

## Aktueller Stand

- Primärdatei: `frontend/tcg-tracker-web/css/main.css`
- Zusätzlich: `trading-marketplace.css`
- Aktuell noch monolithisch, schrittweise Aufteilung geplant

## Ziel-Layer

1. `base/` (Reset, Variablen)
2. `layout/` (Topbar, Grid, Sidebar, Modal)
3. `components/` (Cards, Buttons, Dropdowns, Toast/Spinner)
4. `views/` (Dashboard, Set, Search, Stats)
5. `features/` (Community/Trading-spezifisch)
6. `themes/` (Dark/Light Overrides)

## Importregeln

- `main.css` dient als zentraler Import-Entry
- Keine zirkulären `@import`
- Deprecated-Styles nicht aus aktivem Bundle importieren

## Verwandte Seiten

- [variables.md](variables.md)
- [../architecture.md](../architecture.md)
