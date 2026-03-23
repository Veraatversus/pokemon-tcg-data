# Removed / Deprecated Code

← [../README.md](../README.md) | [../migration-validation.md](../migration-validation.md)

---

## Zweck

Dokumentiert entfernte oder in Quarantäne verschobene Dateien/Funktionsblöcke inklusive Begründung.

## Statuskategorien

- `deprecated` – außer Betrieb, noch vorhanden (Release N)
- `removed` – endgültig gelöscht (Release N+1)

## Einträge

| Modul | Status | Grund | Remove-by |
|------|--------|-------|-----------|
| `js/pokecode-compat.js` | candidate | laut Spec als Dead-Code-Kandidat | N+1 |
| `js/trading-system.js` | candidate | nicht Teil der Zielarchitektur, geringe aktive Nutzung | N+1 |
| `js/community-ui.js` | candidate | überlappende UI-Verantwortung | N+1 |
| Teile aus `social-*`, `advanced-features`, `card-filters` | candidate | werden in Feature-Slices aufgeteilt oder entfernt | N+1 |

## Regeln

1. Vor Löschung: statischer Import-/Aufrufcheck
2. Vor Löschung: Kernflows bestanden
3. Keine produktiven Imports auf `deprecated/`
4. Finale Löschung erst im Folge-Release

## Verwandte Seiten

- [../architecture.md](../architecture.md)
- [../migration-validation.md](../migration-validation.md)
