# Workflow-Architektur Visualisierung

## End-to-End-Fluss

```text
PokemonTCG/pokemon-tcg-data
JulienGitHub/pokemon-tcg-data
            │
            ▼
Daily Sync All Upstreams to Master
            │
            ▼
master (minimaler Integrations-Branch)
            │
            ▼
Build Cardmarket Data
  - lädt aktuelle Singles- und Preis-Feeds
  - generiert `cardmarket/` neu
            │
            ▼
Promote Master to Dev
  - übernimmt Daten / Skripte aus `master`
  - bewahrt `frontend/` und `docs/` aus `dev`
            │
            ▼
dev (vollständige App + Preview)
            │
            ▼
Verify Dev Preview
            │
            ▼
Promote Dev to Release
            │
            ▼
release (stabile Produktionsbasis)
            │
            ▼
Deploy Pages (release root + dev preview)
```

---

## Branch-Rollen in der Architektur

| Branch | Rolle | Enthält |
|--------|------|---------|
| `master` | Integrationskern | Daten, Cardmarket-Artefakte, Build-Skripte, schlanke CI |
| `dev` | Entwicklungs- und Preview-Branch | App, Doku, Tests, aktuelle Integrationsstände |
| `release` | Produktions-/Pages-Branch | stabiler Stand für Deployment und Workflow-Registrierung |

---

## Wichtige Workflows

### 1. `sync-upstream.yml`
- **Name:** `Daily Sync All Upstreams to Master`
- **Quelle:** `PokemonTCG` + `JulienGitHub`
- **Ziel:** `master`

### 2. `build-cardmarket-data.yml`
- **Name:** `Build Cardmarket Data`
- **Quelle:** aktuelle Cardmarket-Feeds
- **Ziel:** statische JSON-Endpunkte unter `cardmarket/`

### 3. `propagate-master-to-dev-release.yml`
- **Name:** `Promote Master to Dev`
- **Ziel:** `master` sauber nach `dev` übernehmen, ohne `frontend/` und `docs/` zu verlieren

### 4. `verify-dev-preview.yml`
- **Name:** `Verify Dev Preview`
- **Ziel:** Release-Blocker früh erkennen, bevor `dev` promoted wird

### 5. `promote-dev-to-release.yml`
- **Name:** `Promote Dev to Release`
- **Ziel:** verifiziertes `dev` automatisch nach `release` bringen

### 6. `deploy-pages.yml`
- **Name:** `Deploy Pages (release root + dev preview)`
- **Ziel:** `release` im Root und `dev` unter `/dev` veröffentlichen

---

## Datenfluss für Cardmarket

```text
products_singles_6.json
price_guide_6.json
        │
        ▼
scripts/cardmarket/build-cardmarket-data.mjs
        │
        ▼
cardmarket/meta.json
cardmarket/index/*.json
cardmarket/sets/*.json
```

Damit bleibt Cardmarket ein **statischer Enrichment-Layer** über den vorhandenen Tracker-Daten.

---

## Konflikt- und Fallback-Szenarien

### Upstream-Konflikt
```text
Upstreams -> master (Konflikt)
          -> automatisches Issue
          -> manuelle Auflösung auf `master`
```

### Release-Promotion-Konflikt
```text
dev -> release (Konflikt)
     -> automatisches Issue
     -> optional manueller Fallback per `merge-to-release.yml`
```

---

## Monitoring

Beobachte regelmäßig:
- **GitHub Actions** für fehlgeschlagene Sync-/Promotion-Läufe
- **`cardmarket/meta.json`** für die letzte erfolgreiche Aktualisierung
- **GitHub Pages** für Root (`release`) und `/dev` Preview
- **Issues** für automatisch erzeugte Konfliktmeldungen
