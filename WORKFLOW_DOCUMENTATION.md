# Branch-Strategie und Workflow-Dokumentation

## Übersicht

Dieses Repository verwendet eine strukturierte Branch-Strategie, um automatische Updates vom Original-Repository zu ermöglichen und gleichzeitig eine stabile Version über GitHub Pages bereitzustellen.

## Branch-Struktur

### 🔵 `main` Branch
- **Zweck:** Hauptentwicklungsbranch, der mit dem upstream Repository synchronisiert wird
- **Updates:** Erhält automatisch Updates vom Original-Repository (PokemonTCG/pokemon-tcg-data)
- **Verwendung:** Basis für alle Feature-Branches und Pull Requests

### 🟢 `release` Branch
- **Zweck:** Stabiler Branch für GitHub Pages Deployment
- **Updates:** Wird automatisch mit Änderungen aus `main` aktualisiert
- **Verwendung:** Dient als Quelle für GitHub Pages

### 🟡 `feature/*` Branches
- **Zweck:** Entwicklung neuer Features oder Änderungen
- **Verwendung:** Temporäre Branches für Pull Requests gegen `main`

## Workflow-Diagramm

```
┌─────────────────────────────────────────────────────────┐
│  Upstream Repository (PokemonTCG/pokemon-tcg-data)      │
└────────────────────┬────────────────────────────────────┘
                     │ Automatische Synchronisation
                     │ (täglich um 2:00 UTC + manuell)
                     ▼
┌─────────────────────────────────────────────────────────┐
│  main Branch                                             │
│  - Empfängt Updates vom Upstream                        │
│  - Basis für Pull Requests                              │
└────────────────────┬────────────────────────────────────┘
                     │ Automatisches Merge
                     │ (bei jedem Push + manuell)
                     ▼
┌─────────────────────────────────────────────────────────┐
│  release Branch                                          │
│  - Stabiler Branch                                       │
│  - Quelle für GitHub Pages                              │
└────────────────────┬────────────────────────────────────┘
                     │ Automatisches Deployment
                     │ (bei jedem Push)
                     ▼
┌─────────────────────────────────────────────────────────┐
│  GitHub Pages                                            │
│  https://veraatversus.github.io/pokemon-tcg-data/       │
└─────────────────────────────────────────────────────────┘
```

## GitHub Actions Workflows

### 1. 🔄 Sync with Upstream (`sync-upstream.yml`)

**Trigger:**
- Täglich um 2:00 UTC (automatisch)
- Manuell über GitHub Actions UI

**Ablauf:**
1. Checkout des `main` Branches
2. Hinzufügen des upstream Remotes (PokemonTCG/pokemon-tcg-data)
3. Abrufen der neuesten Änderungen vom Upstream
4. Überprüfung auf Updates
5. Merge der upstream Änderungen in `main`
6. Push zu origin/main
7. Triggern des "Merge to Release" Workflows

**Bei Konflikten:**
- Workflow schlägt fehl
- Automatisches Erstellen eines GitHub Issues
- Manuelle Konfliktlösung erforderlich

### 2. 🔀 Merge to Release (`merge-to-release.yml`)

**Trigger:**
- Bei jedem Push zum `main` Branch
- Manuell über GitHub Actions UI

**Ablauf:**
1. Checkout des `release` Branches
2. Merge von `main` in `release`
3. Push zu origin/release
4. Automatisches Triggern des GitHub Pages Deployments

**Bei Konflikten:**
- Workflow schlägt fehl
- Automatisches Erstellen eines GitHub Issues
- Manuelle Konfliktlösung erforderlich

### 3. 🚀 Deploy to GitHub Pages (`deploy-pages.yml`)

**Trigger:**
- Bei jedem Push zum `release` Branch
- Manuell über GitHub Actions UI

**Ablauf:**
1. Checkout des `release` Branches
2. Konfiguration von GitHub Pages
3. Upload aller Dateien als Pages Artifact
4. Deployment zu GitHub Pages

## Verwendung

### Manuelles Triggern von Workflows

1. Gehe zu "Actions" im GitHub Repository
2. Wähle den gewünschten Workflow aus der Liste
3. Klicke auf "Run workflow"
4. Wähle den Branch (meist `main`)
5. Klicke auf "Run workflow"

### Konfliktlösung

#### Upstream Sync Konflikt

```bash
# 1. Lokales Repository aktualisieren
git fetch origin
git checkout main
git pull origin main

# 2. Upstream hinzufügen (falls noch nicht vorhanden)
git remote add upstream https://github.com/PokemonTCG/pokemon-tcg-data.git

# 3. Upstream Änderungen abrufen
git fetch upstream

# 4. Merge und Konflikte lösen
git merge upstream/master
# Konflikte manuell in den betroffenen Dateien lösen

# 5. Commit und Push
git add .
git commit -m "Resolve merge conflict with upstream"
git push origin main
```

#### Release Merge Konflikt

```bash
# 1. Lokales Repository aktualisieren
git fetch origin
git checkout release
git pull origin release

# 2. Main Branch mergen
git merge origin/main
# Konflikte manuell in den betroffenen Dateien lösen

# 3. Commit und Push
git add .
git commit -m "Resolve merge conflict from main"
git push origin release
```

### Eigene Änderungen beitragen

1. **Fork und Clone:**
   ```bash
   git clone https://github.com/Veraatversus/pokemon-tcg-data.git
   cd pokemon-tcg-data
   ```

2. **Feature Branch erstellen:**
   ```bash
   git checkout main
   git pull origin main
   git checkout -b feature/meine-aenderung
   ```

3. **Änderungen vornehmen und committen:**
   ```bash
   git add .
   git commit -m "Beschreibung der Änderung"
   git push origin feature/meine-aenderung
   ```

4. **Pull Request erstellen:**
   - Gehe zu GitHub
   - Erstelle einen Pull Request gegen den `main` Branch
   - Beschreibe deine Änderungen

## Konfiguration

### Erforderliche Repository-Einstellungen

1. **GitHub Pages aktivieren:**
   - Settings → Pages
   - Source: "GitHub Actions"

2. **Branch Protection Rules (empfohlen):**
   - Schütze `main` und `release` Branches
   - Require pull request reviews
   - Require status checks to pass

3. **Secrets (optional):**
   - Keine zusätzlichen Secrets erforderlich
   - `GITHUB_TOKEN` wird automatisch bereitgestellt

### Anpassung der Sync-Zeit

Um die automatische Sync-Zeit zu ändern, bearbeite `.github/workflows/sync-upstream.yml`:

```yaml
on:
  schedule:
    # Format: "Minute Stunde * * *" (UTC)
    - cron: '0 2 * * *'  # 2:00 UTC
    # Beispiele:
    # - cron: '0 */6 * * *'  # Alle 6 Stunden
    # - cron: '0 0 * * 0'    # Jeden Sonntag um Mitternacht
```

## Fehlerbehandlung

### Workflow schlägt fehl

1. Prüfe die Workflow-Logs in GitHub Actions
2. Suche nach automatisch erstellten Issues
3. Folge den Anweisungen im Issue zur Behebung

### Pages werden nicht aktualisiert

1. Prüfe, ob der `release` Branch aktuell ist
2. Prüfe die Logs des "Deploy to GitHub Pages" Workflows
3. Stelle sicher, dass GitHub Pages in den Settings aktiviert ist

### Upstream Repository hat sich geändert

Falls sich die URL oder Struktur des upstream Repositories ändert:

```bash
# Upstream URL aktualisieren
git remote set-url upstream <neue-upstream-url>

# Workflow-Datei anpassen falls nötig
# .github/workflows/sync-upstream.yml
```

## Best Practices

1. **Nie direkt in `release` pushen** - Alle Änderungen sollten über `main` erfolgen
2. **Feature Branches verwenden** - Für alle Änderungen Feature Branches erstellen
3. **Pull Requests nutzen** - Immer Pull Requests für Code Reviews verwenden
4. **Workflows testen** - Workflows manuell triggern um sie zu testen
5. **Issues beobachten** - Automatisch erstellte Issues zeitnah bearbeiten

## Wartung

### Regelmäßige Aufgaben

- **Wöchentlich:** Prüfung auf fehlgeschlagene Workflows
- **Monatlich:** Überprüfung der automatisch erstellten Issues
- **Quartalsweise:** Review der Branch-Strategie und Workflow-Effizienz

### Updates der Actions

GitHub Actions sollten regelmäßig aktualisiert werden:

```yaml
# Von:
uses: actions/checkout@v3
# Zu:
uses: actions/checkout@v4
```

## Support und Dokumentation

- **GitHub Issues:** Für Bugs und Feature Requests
- **Original Repository:** [PokemonTCG/pokemon-tcg-data](https://github.com/PokemonTCG/pokemon-tcg-data)
- **GitHub Pages:** [https://veraatversus.github.io/pokemon-tcg-data/](https://veraatversus.github.io/pokemon-tcg-data/)

## Lizenz

Dieses Repository folgt der Lizenz des Original-Repositories.
