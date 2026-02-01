# Workflow-Architektur Visualisierung

## Branch- und Workflow-Struktur

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  Upstream Repository                                            │
│  github.com/PokemonTCG/pokemon-tcg-data                        │
│                                                                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           │ [1] Sync with Upstream
                           │     - Täglich 2:00 UTC
                           │     - Manuell triggerbar
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  main Branch                                                    │
│  - Empfängt Updates vom Upstream                               │
│  - Basis für alle Features und PRs                             │
│                                                                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           │ [2] Merge to Release
                           │     - Bei jedem Push zu main
                           │     - Manuell triggerbar
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  release Branch                                                 │
│  - Stabiler Branch für Deployment                              │
│  - Nur via Auto-Merge aktualisiert                             │
│                                                                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           │ [3] Deploy to GitHub Pages
                           │     - Bei jedem Push zu release
                           │     - Manuell triggerbar
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  GitHub Pages                                                   │
│  https://veraatversus.github.io/pokemon-tcg-data/             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Workflow-Details

### [1] Sync with Upstream
- **Datei:** `.github/workflows/sync-upstream.yml`
- **Trigger:** 
  - Schedule: täglich um 2:00 UTC
  - Manual: workflow_dispatch
- **Aktionen:**
  1. Checkout main branch
  2. Upstream remote hinzufügen
  3. Upstream changes fetchen
  4. Auf Updates prüfen
  5. Falls Updates: merge in main
  6. Push zu origin/main
  7. Trigger "Merge to Release" workflow
- **Bei Fehler:** Erstellt Issue mit Anleitung zur manuellen Konfliktlösung

### [2] Merge to Release
- **Datei:** `.github/workflows/merge-to-release.yml`
- **Trigger:** 
  - Push zu main branch
  - Manual: workflow_dispatch
- **Aktionen:**
  1. Checkout release branch
  2. Fetch main branch
  3. Merge main in release
  4. Push zu origin/release
- **Bei Fehler:** Erstellt Issue mit Anleitung zur manuellen Konfliktlösung

### [3] Deploy to GitHub Pages
- **Datei:** `.github/workflows/deploy-pages.yml`
- **Trigger:** 
  - Push zu release branch
  - Manual: workflow_dispatch
- **Aktionen:**
  1. Checkout release branch
  2. Configure GitHub Pages
  3. Upload artifact
  4. Deploy zu Pages
- **Ergebnis:** Website verfügbar unter GitHub Pages URL

## Feature-Branch Workflow

```
                main
                 │
                 │ git checkout -b feature/xyz
                 ├──────────────► feature/xyz
                 │                     │
                 │                     │ Entwicklung
                 │                     │ Commits
                 │                     │
                 │ Pull Request        │
                 ◄────────────────────┘
                 │
                 │ Nach Merge:
                 │ automatisch zu release
                 ▼
              release
                 │
                 │ automatisch deployed
                 ▼
           GitHub Pages
```

## Konfliktbehandlung

### Szenario 1: Upstream Sync Konflikt
```
Upstream ──┬──> main (Konflikt!)
           │
           └──> Issue erstellt
                Manuelle Lösung erforderlich
```

### Szenario 2: Release Merge Konflikt
```
main ──┬──> release (Konflikt!)
       │
       └──> Issue erstellt
            Manuelle Lösung erforderlich
```

## Zeitplan

| Zeit (UTC) | Ereignis |
|------------|----------|
| 02:00 | Automatischer Upstream Sync Versuch |
| ~02:05 | Falls Updates: Auto-Merge zu release |
| ~02:10 | Falls erfolgreich: Pages Deployment |

## Berechtigungen

Alle Workflows verwenden `GITHUB_TOKEN` mit folgenden Berechtigungen:

| Workflow | Benötigte Permissions |
|----------|----------------------|
| Sync with Upstream | `contents: write` (für Push zu main) |
| Merge to Release | `contents: write` (für Push zu release) |
| Deploy Pages | `contents: read`, `pages: write`, `id-token: write` |

## Sicherheit

- Keine Secrets erforderlich (außer automatischem GITHUB_TOKEN)
- Branch Protection Rules empfohlen für main und release
- Pull Request Reviews empfohlen für Contributions
- Automatische Issue-Erstellung bei Workflow-Fehlern

## Monitoring

Überwache die Workflows über:
- **GitHub Actions Tab:** Alle Workflow-Runs
- **Issues:** Automatisch erstellte Fehler-Issues
- **GitHub Pages:** Deployment Status

## Wartung

Regelmäßige Überprüfungen:
- **Wöchentlich:** Failed Workflows prüfen
- **Monatlich:** Issues reviewen und schließen
- **Quartalsweise:** Workflow-Optimierungen evaluieren
