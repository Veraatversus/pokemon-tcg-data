# Branch-Strategie und Workflow-Dokumentation

## Überblick

Dieses Repository nutzt eine feste Automationskette für Datenintegration, Cardmarket-Anreicherung und die Auslieferung der App:

```text
PokemonTCG + JulienGitHub
  -> master
  -> Build Cardmarket Data
  -> dev
  -> Verify Dev Preview
  -> release
  -> GitHub Pages
```

## Branch-Rollen

### 🔵 `master`
- **Zweck:** minimaler Integrations- und Build-Branch
- **Inhalt:** Rohdaten, `cardmarket/` Endpunkte, Build-Skripte, CI-Workflows
- **Updates:** täglicher Dual-Upstream-Sync + automatischer Cardmarket-Rebuild
- **Wichtig:** `frontend/` und `docs/` werden hier bewusst schlank gehalten

### 🟣 `dev`
- **Zweck:** Standard-Entwicklung, Preview und Review-Branch
- **Inhalt:** vollständige App, Tests, Doku und Cardmarket-Integration
- **Updates:** erhält `master` automatisch über den Promote-Workflow; bewahrt dabei `frontend/` und `docs/`

### 🟢 `release`
- **Zweck:** stabile Produktionsversion für GitHub Pages
- **Updates:** wird nach erfolgreicher `dev`-Verifikation automatisch oder manuell aus `dev` aktualisiert
- **Hinweis:** die in GitHub sichtbaren Workflow-Definitionen werden aktuell von diesem Branch registriert

### 🟡 `feature/*`
- **Zweck:** isolierte Entwicklungsarbeit vor dem Merge nach `dev`

---

## Automationskette im Detail

### 1. 🔄 `Daily Sync All Upstreams to Master` (`sync-upstream.yml`)
**Trigger:** täglich 02:00 UTC oder manuell per `workflow_dispatch`

**Ablauf:**
1. Checkout von `master`
2. Merge von `PokemonTCG/pokemon-tcg-data`
3. Merge von `JulienGitHub/pokemon-tcg-data`
4. Push nach `origin/master`
5. Bei Konflikten: automatisches Issue mit Hinweisen zur manuellen Auflösung

### 2. 💸 `Build Cardmarket Data` (`build-cardmarket-data.yml`)
**Trigger:** automatisch nach erfolgreichem Upstream-Sync oder manuell

**Ablauf:**
1. Root-Regressionen für die Cardmarket-Helfer laufen
2. Aktuelle Cardmarket-Feeds werden geladen:
   - `products_singles_6.json`
   - `price_guide_6.json`
3. Die statischen JSON-Endpunkte unter `cardmarket/` werden neu erzeugt
4. Änderungen werden bei Bedarf direkt auf `master` committed

### 3. 🔁 `Promote Master to Dev` (`propagate-master-to-dev-release.yml`)
**Trigger:** automatisch nach erfolgreichem Cardmarket-Build oder manuell

**Ablauf:**
1. Merge von `master` nach `dev`
2. Wiederherstellung von `frontend/` und `docs/` aus dem vorherigen `dev`-Stand
3. Push nach `origin/dev`

### 4. ✅ `Verify Dev Preview` (`verify-dev-preview.yml`)
**Trigger:** bei jedem Push nach `dev` oder manuell

**Prüft:**
- Cardmarket-Builder-Tests
- gemeinsame Cardmarket-Helfer
- Set-/Tracker-Regressionen
- Vorhandensein der generierten `cardmarket`-Metadaten

### 5. 🚀 `Promote Dev to Release` (`promote-dev-to-release.yml`)
**Trigger:** bewusst **nur manuell** nach erfolgreichem `Verify Dev Preview`

**Ablauf:**
1. Merge von `dev` nach `release`
2. Push nach `origin/release`
3. dadurch anschließendes Pages-Deployment

### 6. 🌐 `Deploy Pages (release root + dev preview)` (`deploy-pages.yml`)
**Trigger:** Push nach `release` oder `dev`, zusätzlich manuell triggerbar

**Ergebnis:**
- `release` wird auf GitHub Pages im Root veröffentlicht
- `dev` wird parallel als Vorschau unter `/dev` bereitgestellt

### 7. 🛠️ `Manual Merge Dev to Release` (`merge-to-release.yml`)
**Zweck:** manueller Fallback, falls die automatische Promotion bewusst ersetzt oder erneut ausgeführt werden soll

---

## Empfohlener manueller Testablauf

Wenn die gesamte Pipeline in der richtigen Reihenfolge geprüft werden soll:

1. **Actions → `Daily Sync All Upstreams to Master` → `Run workflow`**
2. Abschluss von `Build Cardmarket Data` abwarten
3. Prüfen, dass `Promote Master to Dev` gelaufen ist
4. Prüfen, dass `Verify Dev Preview` für `dev` grün ist
5. Optional: `Promote Dev to Release` oder `Manual Merge Dev to Release` auslösen
6. `Deploy Pages (release root + dev preview)` kontrollieren

---

## Konfliktlösung

### Upstream-Konflikt auf `master`

```bash
git checkout master
git fetch --all
git merge pokemontcg/master
git merge julien/master
# Konflikte lösen
git add .
git commit -m "Resolve dual-upstream sync conflict"
git push origin master
```

### Promotion-Konflikt `dev -> release`

```bash
git checkout release
git fetch origin dev
git merge -X theirs origin/dev
# Konflikte lösen
git add .
git commit -m "Resolve dev to release promotion conflict"
git push origin release
```

---

## Repository-Einstellungen

### Erforderlich
1. **GitHub Pages** → Source: `GitHub Actions`
2. **Actions permissions** → `Read and write permissions`
3. **Branch Protection Rules** für `dev` und `release` empfohlen

### Anpassung des Sync-Zeitplans

```yaml
on:
  schedule:
    - cron: '0 2 * * *'  # täglich 02:00 UTC
```

---

## Best Practices

1. **Nicht direkt auf `release` entwickeln**
2. **Für neue Arbeit bevorzugt `feature/*` von `dev` abzweigen**
3. **`dev -> release` bewusst manuell auslösen, nicht bei jedem Arbeits-Push**
4. **Kein automatisches `release -> dev` bauen** - das würde unnötige Zyklen und Trigger-Kaskaden erzeugen
5. **Den vollständigen Chain-Test mit dem Upstream-Sync starten**
6. **`master` schlank halten; App-Logik bleibt in `dev`/`release`**
7. **Issues beobachten** - Automatisch erstellte Issues zeitnah bearbeiten

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
- **Primärer Upstream:** [PokemonTCG/pokemon-tcg-data](https://github.com/PokemonTCG/pokemon-tcg-data)
- **Sekundärer Overlay-Upstream:** [JulienGitHub/pokemon-tcg-data](https://github.com/JulienGitHub/pokemon-tcg-data)
- **GitHub Pages:** [https://veraatversus.github.io/pokemon-tcg-data/](https://veraatversus.github.io/pokemon-tcg-data/)

## Lizenz

Dieses Repository folgt der Lizenz des Original-Repositories.
