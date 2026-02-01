# Setup-Anleitung für GitHub Pages und automatische Synchronisation

Diese Anleitung hilft dir, das Repository nach dem Merge vollständig einzurichten.

## Schritt 1: Branch-Struktur erstellen

Nach dem Merge dieses Pull Requests in den `main` Branch (oder aktuellen Default-Branch):

```bash
# 1. Lokales Repository aktualisieren
git fetch origin
git checkout main  # oder dein aktueller Default-Branch
git pull origin main

# 2. Release Branch erstellen (vom main Branch)
git checkout -b release
git push -u origin release

# 3. Zurück zum main Branch
git checkout main
```

## Schritt 2: GitHub Pages aktivieren

1. Gehe zu deinem Repository auf GitHub
2. Klicke auf **Settings** (Einstellungen)
3. Scrolle im linken Menü zu **Pages**
4. Unter "Build and deployment":
   - **Source:** Wähle "GitHub Actions"
5. Speichern (wird automatisch gespeichert)

## Schritt 3: Default Branch setzen (optional)

Falls dein aktueller Branch nicht `main` heißt:

1. Gehe zu **Settings** → **General**
2. Unter "Default branch":
   - Klicke auf den Umschalter
   - Wähle `main` als Default Branch
   - Bestätige die Änderung

## Schritt 4: Branch Protection Rules einrichten (empfohlen)

Schütze wichtige Branches vor versehentlichen Änderungen:

1. Gehe zu **Settings** → **Branches**
2. Klicke auf **Add rule** unter "Branch protection rules"
3. Für den `main` Branch:
   - Branch name pattern: `main`
   - ✅ Require a pull request before merging
   - ✅ Require status checks to pass before merging (optional)
   - Klicke auf **Create**
4. Wiederhole für den `release` Branch

## Schritt 5: Workflows testen

### Test 1: Manuelle Synchronisation mit Upstream

1. Gehe zu **Actions** im Repository
2. Wähle "Sync with Upstream" aus der Liste
3. Klicke auf **Run workflow**
4. Wähle Branch: `main`
5. Klicke auf **Run workflow**
6. Warte bis der Workflow abgeschlossen ist

### Test 2: Merge to Release

1. Nach erfolgreichem Upstream Sync sollte automatisch der "Merge to Release" Workflow starten
2. Falls nicht, triggere ihn manuell:
   - **Actions** → "Merge to Release"
   - **Run workflow** mit Branch: `main`

### Test 3: GitHub Pages Deployment

1. Nach erfolgreichem Merge to Release sollte automatisch der Pages Deployment starten
2. Nach wenigen Minuten sollte die Website verfügbar sein unter:
   - `https://<dein-username>.github.io/pokemon-tcg-data/`

## Schritt 6: Upstream Repository konfigurieren (optional, lokal)

Falls du lokal mit dem Repository arbeiten möchtest:

```bash
# Upstream Repository hinzufügen
git remote add upstream https://github.com/PokemonTCG/pokemon-tcg-data.git

# Upstream Branches abrufen
git fetch upstream

# Prüfen der Remotes
git remote -v
```

## Fehlerbehebung

### "GitHub Pages is not enabled"

- Gehe zu Settings → Pages
- Stelle sicher, dass Source auf "GitHub Actions" gesetzt ist

### "Workflow failed with: ref does not match ^refs/"

- Der `release` Branch existiert noch nicht
- Führe Schritt 1 nochmal aus

### "Permission denied" bei Workflows

- Gehe zu Settings → Actions → General
- Unter "Workflow permissions":
  - Wähle "Read and write permissions"
  - ✅ Allow GitHub Actions to create and approve pull requests
  - Klicke auf **Save**

### Pages zeigt 404 Error

- Warte ein paar Minuten (Deployment kann bis zu 10 Minuten dauern)
- Prüfe ob `index.html` im `release` Branch vorhanden ist
- Prüfe den Workflow "Deploy to GitHub Pages" auf Fehler

## Zeitplan anpassen

Die automatische Synchronisation läuft standardmäßig täglich um 2:00 UTC.

Um die Zeit zu ändern, bearbeite `.github/workflows/sync-upstream.yml`:

```yaml
on:
  schedule:
    # Format: "Minute Stunde Tag Monat Wochentag" (UTC)
    - cron: '0 2 * * *'  # 2:00 UTC täglich
```

Beispiele:
- `0 */6 * * *` - Alle 6 Stunden
- `0 0 * * 0` - Jeden Sonntag um Mitternacht UTC
- `30 14 * * *` - Täglich um 14:30 UTC

## Nächste Schritte

Nach erfolgreicher Einrichtung:

1. ✅ GitHub Pages ist unter `https://<username>.github.io/pokemon-tcg-data/` erreichbar
2. ✅ Tägliche automatische Synchronisation ist aktiv
3. ✅ Automatisches Deployment zu Pages ist konfiguriert

**Zusätzliche Dokumentation:**
- [WORKFLOW_DOCUMENTATION.md](WORKFLOW_DOCUMENTATION.md) - Ausführliche Workflow-Dokumentation
- [README.md](README.md) - Allgemeine Repository-Information

## Support

Bei Problemen:
1. Prüfe die Workflow-Logs in GitHub Actions
2. Schaue nach automatisch erstellten Issues
3. Erstelle ein neues Issue im Repository

Viel Erfolg! 🎉
