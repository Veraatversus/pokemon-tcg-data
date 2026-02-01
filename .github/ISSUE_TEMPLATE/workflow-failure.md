---
name: Workflow-Fehler
about: Ein GitHub Actions Workflow ist fehlgeschlagen
title: '[WORKFLOW] '
labels: workflow-failure
assignees: ''
---

## Workflow-Informationen

**Workflow-Name:**
<!-- z.B. Sync with Upstream, Merge to Release, Deploy Pages -->

**Workflow-Run-URL:**
<!-- Link zum fehlgeschlagenen Workflow-Run -->

**Branch:**
<!-- z.B. main, release -->

## Fehlerbeschreibung

**Was ist passiert:**
<!-- Kurze Beschreibung des Fehlers -->

**Fehlermeldung:**
```
<!-- Relevante Fehlermeldung aus den Workflow-Logs hier einfügen -->
```

## Umgebung

- **Zeitpunkt:** <!-- z.B. 2024-01-31 14:30 UTC -->
- **Trigger:** <!-- Automatisch (Cron), Manuell, Push -->

## Zusätzliche Informationen

<!-- Weitere relevante Informationen -->

---

## Mögliche Lösungen

### Bei Merge-Konflikten

**Upstream Sync Konflikt:**
```bash
git fetch origin
git checkout main
git pull origin main
git remote add upstream https://github.com/PokemonTCG/pokemon-tcg-data.git
git fetch upstream
git merge upstream/master
# Konflikte lösen
git push origin main
```

**Release Merge Konflikt:**
```bash
git fetch origin
git checkout release
git pull origin release
git merge origin/main
# Konflikte lösen
git push origin release
```

### Bei Permission-Fehlern

- Settings → Actions → General → Workflow permissions
- "Read and write permissions" auswählen
- "Allow GitHub Actions to create and approve pull requests" aktivieren
