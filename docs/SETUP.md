# Setup-Anleitung für Branches, GitHub Pages und Automatisierung

Diese Anleitung beschreibt den aktuellen Soll-Zustand des Repositories nach der Cardmarket- und Workflow-Konsolidierung.

## 1. Branch-Struktur prüfen

```bash
git fetch origin
git checkout dev
git pull origin dev

git checkout release
git pull origin release

git checkout master
git pull origin master
```

**Rollen:**
- `master` = minimaler Integrationskern
- `dev` = vollständige Entwicklungs-/Preview-Version
- `release` = stabile Produktionsversion

## 2. GitHub Pages und Actions aktivieren

### GitHub Pages
1. **Settings → Pages**
2. **Source:** `GitHub Actions`

### Actions Permissions
1. **Settings → Actions → General**
2. **Workflow permissions:** `Read and write permissions`
3. optional: `Allow GitHub Actions to create and approve pull requests`

## 3. End-to-End-Smoke-Test der Pipeline

Der empfohlene Test erfolgt in dieser Reihenfolge:

1. **Actions → `Daily Sync All Upstreams to Master` → `Run workflow`**
2. erfolgreichen Lauf von **`Build Cardmarket Data`** abwarten
3. erfolgreichen Lauf von **`Promote Master to Dev`** prüfen
4. erfolgreichen Lauf von **`Verify Dev Preview`** prüfen
5. bei Freigabe **`Promote Dev to Release`** manuell ausführen
6. **`Deploy Pages (release root + dev preview)`** kontrollieren

## 4. Lokale Upstream-Remotes (optional)

```bash
git remote add pokemontcg https://github.com/PokemonTCG/pokemon-tcg-data.git
git remote add julien https://github.com/JulienGitHub/pokemon-tcg-data.git
git fetch pokemontcg
git fetch julien
git remote -v
```

## 5. Fehlerbehebung

### Workflow sichtbar, startet aber nicht automatisch
- Prüfen, ob die registrierten Workflow-Dateien auf `release` vorhanden sind
- Prüfen, ob `workflow_run` auf den **exakten** Workflow-Namen zeigt

### Cardmarket-Build schlägt fehl
- Workflow-Logs von `Build Cardmarket Data` öffnen
- prüfen, ob die externen Feeds erreichbar waren
- kontrollieren, ob `cardmarket/meta.json` und `cardmarket/index/*.json` erzeugt wurden

### `dev` oder `release` bleibt hinterher
- `Promote Master to Dev` bzw. `Promote Dev to Release` manuell auslösen
- bei Konflikten dem automatisch erzeugten Issue folgen

### Pages zeigt 404 oder alten Stand
- `Deploy Pages (release root + dev preview)` prüfen
- ein paar Minuten auf das Deployment warten
- sicherstellen, dass `release` bzw. `dev` erfolgreich gepusht wurden

## 6. Zeitplan anpassen

```yaml
on:
  schedule:
    - cron: '0 2 * * *'  # täglich 02:00 UTC
```

## Abschlusszustand

Nach erfolgreichem Setup gilt:

- ✅ täglicher Dual-Upstream-Sync nach `master`
- ✅ automatischer Cardmarket-Rebuild mit aktuellen Quelldateien
- ✅ verifizierter `dev`-Preview-Stand
- ✅ `release` als stabiler Deploy-Branch
- ✅ GitHub Pages mit Root + `/dev` Preview
