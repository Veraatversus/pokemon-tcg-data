# Migration & Validierung

← [README.md](README.md)

---

## Zweck

Diese Seite protokolliert die technische Abnahme der Restrukturierung (Importregeln, Laufzeitchecks, Dead-Code-Quarantäne).

## Testmatrix

| Kategorie | Check | Sollzustand |
|-----------|-------|-------------|
| ESM-Imports | Relative `.js`-Pfade auflösbar | 0 fehlende Module |
| App-Start | `index.html` lädt `js/app.js` | Kein Startfehler |
| Core-Flows | Login, Set laden, Toggle, Suche | Funktional |
| Browser-Konsole | Fehler beim Start/Flow | 0 `TypeError`/`404`/`Failed to resolve module specifier` |
| Quarantäne | `deprecated/` nicht produktiv importiert | 0 produktive Imports |

## Protokollvorlage

```md
### YYYY-MM-DD – Phase X
- Commit: <sha>
- Prüfer: <name/rolle>
- Import-Check: PASS|FAIL
- Konsolencheck: PASS|FAIL
- Kernflows: PASS|FAIL
- Offene Risiken: ...
- Entscheidung: GO|NO-GO
```

## Aktueller Stand

### 2026-03-23 – Phase 1/2 (Struktur + sichere Moves)
- Commit: lokaler Arbeitsstand
- Prüfer: Copilot
- Import-Check: PASS
- Konsolencheck: Nicht automatisiert (Tool-Policy blockiert lokalen HTTP-Request)
- Kernflows: Teilvalidiert (statisch + Editordiagnostik)
- Offene Risiken: Laufzeitcheck im Browser manuell nachziehen
- Entscheidung: GO für nächste Refactor-Phase

## Verwandte Seiten

- [architecture.md](architecture.md)
- [app.md](app.md)
- [changelog/removed-code.md](changelog/removed-code.md)
