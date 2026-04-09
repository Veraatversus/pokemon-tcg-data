# Quick Reference Guide

## 🚀 Aktueller Standardablauf

Wenn die komplette Pipeline in der korrekten Reihenfolge getestet oder ausgeführt werden soll:

1. **Actions → `Daily Sync All Upstreams to Master` → `Run workflow`**
2. Den automatischen Lauf von **`Build Cardmarket Data`** abwarten
3. Prüfen, dass **`Promote Master to Dev`** erfolgreich war
4. Prüfen, dass **`Verify Dev Preview`** grün ist
5. Für Produktion: **`Promote Dev to Release`** ausführen oder den manuellen Fallback nutzen
6. Das Ergebnis in **`Deploy Pages (release root + dev preview)`** kontrollieren

---

## 📋 Workflow-Übersicht

| Workflow | Trigger | Zweck |
|----------|---------|-------|
| **Daily Sync All Upstreams to Master** | täglich 02:00 UTC + manuell | merged `PokemonTCG` und `JulienGitHub` nach `master` |
| **Build Cardmarket Data** | nach erfolgreichem Sync + manuell | lädt aktuelle Cardmarket-Feeds und baut `cardmarket/` neu |
| **Promote Master to Dev** | nach erfolgreichem Cardmarket-Build + manuell | übernimmt neue Integrationsstände nach `dev` |
| **Verify Dev Preview** | bei jedem Push nach `dev` + manuell | überprüft die Preview-/Regressionstests |
| **Promote Dev to Release** | nach erfolgreicher `dev`-Verifikation + manuell | bringt `dev` nach `release` |
| **Deploy Pages (release root + dev preview)** | Push zu `release`/`dev` + manuell | veröffentlicht Root + `/dev` Preview |

---

## Branch-Merksatz

- **`master`** = täglicher, schlanker Integrationskern
- **`dev`** = vollständige App und Review-Stand
- **`release`** = stabiler Produktionsstand

---

## Typische Aufgaben

### Upstream- und Cardmarket-Refresh testen
```text
Actions -> Daily Sync All Upstreams to Master -> Run workflow
```
Danach sollten die Folge-Workflows automatisch anlaufen.

### Release-Vorbereitung prüfen
```bash
git checkout dev
git pull origin dev
node --test scripts/cardmarket/build-cardmarket-data.test.mjs \
  scripts/cardmarket/cardmarket-ui-helpers.test.mjs \
  scripts/cardmarket/set-match-regression.test.mjs \
  frontend/tcg-tracker-web/tests/cardmarket-data.test.mjs
node frontend/tcg-tracker-web/tests/set-match-regression.mjs
```

### Eigene Änderungen entwickeln
```bash
git checkout dev
git pull origin dev
git checkout -b feature/meine-aenderung
# Änderungen vornehmen
git commit -am "Beschreibung"
git push origin feature/meine-aenderung
```

---

## Wichtige Links

- **GitHub Pages:** https://veraatversus.github.io/pokemon-tcg-data/
- **Repository:** https://github.com/Veraatversus/pokemon-tcg-data
- **Originaldaten:** https://github.com/PokemonTCG/pokemon-tcg-data
- **Dokumentation:** [SETUP.md](SETUP.md), [WORKFLOW_DOCUMENTATION.md](WORKFLOW_DOCUMENTATION.md), [ARCHITECTURE.md](ARCHITECTURE.md)

---

## Kurze Checkliste

- [ ] Upstream-Sync erfolgreich
- [ ] Cardmarket-Build erfolgreich
- [ ] `dev`-Verifikation grün
- [ ] Release-Promotion geprüft oder ausgelöst
- [ ] Pages-Deployment kontrolliert
