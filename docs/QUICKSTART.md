# Quick Reference Guide

## 🚀 Schnellstart nach dem Merge

Nach dem Merge dieses PRs folge diesen Schritten:

### 1. Release Branch erstellen
```bash
git checkout dev
git pull origin dev
git checkout -b release
git push -u origin release
```

### 2. GitHub Pages aktivieren
- Settings → Pages → Source: "GitHub Actions"

### 3. Workflows manuell testen
- Actions → "Sync with Upstream" → Run workflow
- Warte auf automatische Triggers der anderen Workflows

**Fertig!** 🎉 Deine Website ist unter `https://veraatversus.github.io/pokemon-tcg-data/` verfügbar.

---

## 📋 Workflow-Übersicht

| Workflow | Trigger | Zweck |
|----------|---------|-------|
| **Sync with Upstream** | Täglich 2:00 UTC + Manuell | Synchronisiert `master` mit JulienGitHub/pokemon-tcg-data |
| **Merge to Release** | Manuell | Merged `dev` → `release` |
| **Deploy Pages** | Push zu `release`/`dev` + Manuell | Deployt Release (Root) und Dev-Preview (`/dev`) |

---

## 🔄 Typische Workflows

### Manuelles Update erzwingen
```
Actions → "Sync with Upstream" → Run workflow → main
```
→ Aktualisiert `master`, danach manuell `dev` → `release` mergen und deployen

### Bei Merge-Konflikt
Wenn ein Workflow fehlschlägt:
1. Automatisches Issue wird erstellt
2. Folge den Anweisungen im Issue
3. Lokale Konfliktlösung und Push

### Eigene Änderungen hinzufügen
```bash
git checkout dev
git pull origin dev
git checkout -b feature/meine-aenderung
# Änderungen vornehmen
git commit -am "Beschreibung"
git push origin feature/meine-aenderung
# → Pull Request gegen dev erstellen
```

---

## 🌐 URLs und Links

- **GitHub Pages:** https://veraatversus.github.io/pokemon-tcg-data/
- **Dieses Repository:** https://github.com/Veraatversus/pokemon-tcg-data
- **Original Repository:** https://github.com/PokemonTCG/pokemon-tcg-data
- **Pokémon TCG API:** https://pokemontcg.io/

---

## 📚 Dokumentation

- **[SETUP.md](SETUP.md)** - Ausführliche Setup-Anleitung
- **[WORKFLOW_DOCUMENTATION.md](WORKFLOW_DOCUMENTATION.md)** - Detaillierte Workflow-Dokumentation
- **[README.md](../README.md)** - Allgemeine Repository-Information

---

## ⚙️ Workflow-Dateien

- `.github/workflows/sync-upstream.yml` - Upstream Synchronisation
- `.github/workflows/merge-to-release.yml` - Dev → Release Merge (manuell)
- `.github/workflows/deploy-pages.yml` - GitHub Pages Deployment

---

## 🛠️ Anpassungen

### Sync-Zeitplan ändern
Bearbeite `.github/workflows/sync-upstream.yml`:
```yaml
schedule:
  - cron: '0 2 * * *'  # Täglich 2:00 UTC
  # - cron: '0 */6 * * *'  # Alle 6 Stunden
```

### Upstream Repository ändern
Falls das Original umzieht:
```bash
git remote set-url upstream <neue-url>
# Und in sync-upstream.yml die URL anpassen
```

---

## ✅ Checkliste nach Setup

- [ ] Release Branch erstellt und gepusht
- [ ] GitHub Pages aktiviert (Settings → Pages)
- [ ] Workflow "Sync with Upstream" manuell getestet
- [ ] Website erreichbar unter GitHub Pages URL
- [ ] Alle drei Workflows erfolgreich durchgelaufen
- [ ] (Optional) Branch Protection Rules aktiviert
- [ ] (Optional) Workflow Permissions auf "Read and write" gesetzt

---

**Bei Fragen oder Problemen:** Erstelle ein Issue im Repository!
