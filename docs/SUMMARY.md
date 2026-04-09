# Zusammenfassung: aktueller Automations- und Release-Stand

## ✅ Aktueller Soll-Zustand

Das Repository ist jetzt auf eine klare Pipeline ausgerichtet:

1. **Dual-Upstream-Sync nach `master`**
2. **Neubau der Cardmarket-Endpunkte aus aktuellen Quelldateien**
3. **Automatische Übernahme nach `dev`**
4. **Verifikation der Preview-Version**
5. **Promotion nach `release`**
6. **Deployment zu GitHub Pages**

---

## Zentrale Workflows

| Workflow | Aufgabe |
|----------|---------|
| `sync-upstream.yml` | merged `PokemonTCG` und `JulienGitHub` nach `master` |
| `build-cardmarket-data.yml` | lädt `products_singles_6.json` und `price_guide_6.json`, baut `cardmarket/` neu |
| `propagate-master-to-dev-release.yml` | bringt `master` sauber nach `dev` |
| `verify-dev-preview.yml` | prüft `dev` mit Root- und Frontend-Regressionen |
| `promote-dev-to-release.yml` | promoted verifiziertes `dev` nach `release` |
| `deploy-pages.yml` | veröffentlicht `release` im Root und `dev` unter `/dev` |
| `merge-to-release.yml` | manueller Fallback für `dev -> release` |

---

## Branch-Modell

```text
Upstreams -> master -> dev -> release -> GitHub Pages
```

- **`master`**: Integrations- und Datenkern
- **`dev`**: vollständige Arbeits- und Review-Version
- **`release`**: stabiler Produktionsstand

---

## Cardmarket-Integration

Die Preis-Endpunkte werden aus aktuellen Cardmarket-Quellen neu erzeugt:

- `products_singles_6.json`
- `price_guide_6.json`

Zielartefakte:

- `cardmarket/meta.json`
- `cardmarket/index/products.json`
- `cardmarket/index/names.json`
- `cardmarket/index/sets.json`
- `cardmarket/index/tracker.json`
- `cardmarket/sets/<setId>.json`

---

## Release-Readiness für `dev`

Vor einer Übernahme nach `release` sollte `dev` mindestens diese Punkte erfüllen:

- ✅ `Verify Dev Preview` ist grün
- ✅ Root- und Frontend-Regressionsläufe sind erfolgreich
- ✅ keine versehentlich getrackten Artefakt-/Swap-Dateien
- ✅ aktuelle `master`-Integrationsstände sind übernommen
- ✅ Dokumentation und Workflow-Beschreibung sind aktuell

---

## Monitoring

Im Alltag genügen diese Kontrollpunkte:

- **GitHub Actions**: Status der letzten Sync-, Build- und Promotion-Läufe
- **`cardmarket/meta.json`**: Frische der generierten Daten
- **GitHub Pages**: Release im Root, Preview unter `/dev`
- **Issues**: automatisch erzeugte Konfliktmeldungen

---

## Nächster Schritt

Für einen gezielten Release-Review:

1. `origin/release..origin/dev` prüfen
2. letzte `Verify Dev Preview`-Runs kontrollieren
3. nur dann `Promote Dev to Release` ausführen, wenn keine offenen Blocker mehr bestehen
