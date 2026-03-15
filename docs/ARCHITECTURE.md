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
│  master Branch                                                  │
│  - Empfängt Updates vom Upstream                               │
│  - Upstream-Mirror (keine Feature-Entwicklung)                 │
│                                                                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           │ [2] Update dev
                           │     - Manuell via PR/Merge
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  dev Branch                                                     │
│  - Standard-Entwicklung                                         │
│  - Wird zusätzlich unter /dev veröffentlicht                    │
│                                                                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           │ [3] Merge to Release
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
                           │ [4] Deploy to GitHub Pages
                           │     - Bei Push zu release und dev
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
  1. Checkout master branch
  2. Upstream remote hinzufügen
  3. Upstream changes fetchen
  4. Auf Updates prüfen
  5. Falls Updates: merge in master
  6. Push zu origin/master
- **Bei Fehler:** Erstellt Issue mit Anleitung zur manuellen Konfliktlösung

### [2] Update dev
- **Hinweis:** Erfolgt manuell über PR/Merge (kein eigener Workflow)

### [3] Merge to Release
- **Datei:** `.github/workflows/merge-to-release.yml`
- **Trigger:** 
  - Manual: workflow_dispatch
- **Aktionen:**
  1. Checkout release branch
  2. Fetch dev branch
  3. Merge dev in release
  4. Push zu origin/release
- **Bei Fehler:** Erstellt Issue mit Anleitung zur manuellen Konfliktlösung

### [4] Deploy to GitHub Pages
- **Datei:** `.github/workflows/deploy-pages.yml`
- **Trigger:** 
  - Push zu release branch (Root-Seite)
  - Push zu dev branch (Preview unter `/dev`)
  - Manual: workflow_dispatch
- **Aktionen:**
  1. Checkout release + dev
  2. Build Artifact (`release` nach Root, `dev` nach `/dev`)
  3. Upload artifact
  4. Deploy zu Pages
- **Ergebnis:** Website verfügbar unter GitHub Pages URL

## Feature-Branch Workflow

```
                dev
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
                 │ manuell zu release
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
Upstream ──┬──> master (Konflikt!)
           │
           └──> Issue erstellt
                Manuelle Lösung erforderlich
```

### Szenario 2: Release Merge Konflikt
```
dev ──┬──> release (Konflikt!)
       │
       └──> Issue erstellt
            Manuelle Lösung erforderlich
```

## Zeitplan

| Zeit (UTC) | Ereignis |
|------------|----------|
| 02:00 | Automatischer Upstream Sync Versuch (`master`) |
| Danach | Optionaler manueller Merge `dev` → `release` |
| Bei Push | Pages Deployment (`release` Root, `dev` unter `/dev`) |

## Berechtigungen

Alle Workflows verwenden `GITHUB_TOKEN` mit folgenden Berechtigungen:

| Workflow | Benötigte Permissions |
|----------|----------------------|
| Sync with Upstream | `contents: write` (für Push zu master) |
| Merge to Release | `contents: write` (für Push zu release) |
| Deploy Pages | `contents: read`, `pages: write`, `id-token: write` |

## Sicherheit

- Keine Secrets erforderlich (außer automatischem GITHUB_TOKEN)
- Branch Protection Rules empfohlen für master/dev/release
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
