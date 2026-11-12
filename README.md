# pokemon-tcg-data (Veraatversus)

Statische Daten-API **v3** für Veras Pokémon-TCG-Tracker (Web-App), ausgeliefert über GitHub Pages.

Die Pokémon TCG API (pokemontcg.io) wird am 1. März 2027 abgeschaltet. Dieses Repo baut die Daten deshalb aus dem täglich gespiegelten [TCGdex cards-database](https://github.com/tcgdex/cards-database). Der eingefrorene pokemontcg-Datenstand dient als Legacy-Schicht (Feldformat, Schlüssel, Bild-Fallback). Felder auf oberster Ebene sind Englisch, deutsche Texte und Bilder stehen unter `i18n.de`.

## Ordnerstruktur

| Pfad | Inhalt |
|---|---|
| `api/v3/` | Generierte API: `sets.json`, `cards/<set>.json`, `search-index.json`, `meta.json` (Zähler, Quell-Commits, Warnungen), `reports/` (Matching-Report, gelernte Tabellen) |
| `api/registry/` | Eingefrorene Registry: kanonische Set-IDs und Kartenschlüssel, ändert sich nur additiv |
| `api/mappings/` | Handgepflegte Zuordnungen (Set-/Kartenpaare, Subset-Merges, kanonische Schlüssel) |
| `sources/pokemontcg/` | Eingefrorener pokemontcg-Snapshot (`cards/`, `sets/`, `decks/`) |
| `sources/tcgdex/` | Täglicher TCGdex-Spiegel (nur Daten-/Textdateien), dazu `assets-index.json` (Asset-Liste von assets.tcgdex.net) und `assets-verified.json` (Prüfstand der Set-Logos und -Symbole) |
| `sources/SOURCES.json` | Quell-Commits und Abrufzeitpunkte |
| `cardmarket/` | Generierte Cardmarket-Daten (`index/`, `sets/`, `meta.json`) |
| `scripts/api/` | Build-Toolchain der v3-API (Node, Tests) |
| `cards/`, `sets/`, `decks/`, `v2_to_v1.rb` | Alte pokemontcg-Struktur im Wurzelverzeichnis. Bleibt aus Kompatibilitätsgründen bis zu einer späteren Umstrukturierung erhalten. |

## Automatisierung

- **Daily Sync TCGdex to Master** (`sync-tcgdex.yml`, täglich 02:00 UTC, auf `master`): Tests → TCGdex spiegeln → Set-Assets prüfen (inkrementell, darf fehlschlagen) → Matching mit Qualitätsschwelle → Regressionstests → v3-API und Registry bauen → committen. Bei einem Fehler wird nichts committet, und es entsteht ein Issue mit dem Label `upstream-sync`.
- **Build Cardmarket Data** startet nach dem Sync und zusätzlich täglich um 03:30 UTC (falls der Auslöser über den Sync ausbleibt; zwei Läufe am Tag laufen nacheinander) und erzeugt `cardmarket/` mit den Tagespreisen. Der v3-Build liest daraus fehlende Cardmarket-IDs nach (`api/v3/reports/cardmarket-ids.json`).
- **Promote Master to Dev and Release** startet danach und führt `master` in `dev` und `release` zusammen. Die App-Dateien dieser Branches bleiben dabei erhalten.
- **Promote Dev to Release** / **Manual Merge Dev to Release** (manuell) übernehmen `dev` nach `release`.
- **Deploy Pages** veröffentlicht `release` im Wurzelverzeichnis und `dev` als Vorschau unter `/dev`.

## Lokal

```bash
cd scripts/api
npm ci
npm test
cd ../..
node scripts/api/sources/verify-assets.mjs   # optional, prüft Set-Logos/-Symbole (Netzwerk)
node scripts/api/build-api.mjs               # baut api/v3 und api/registry
```

Runbook (Registry-Drift, Asset-Prüfung, Ausgabeformate): [scripts/api/README.md](scripts/api/README.md).

## Quellen und Lizenzen

- **pokemontcg-Daten**: aus [PokemonTCG/pokemon-tcg-data](https://github.com/PokemonTCG/pokemon-tcg-data), zusammengeführt mit [JulienGitHub/pokemon-tcg-data](https://github.com/JulienGitHub/pokemon-tcg-data). Der Stand ist in `sources/pokemontcg/` eingefroren, der Commit steht in `sources/SOURCES.json`. Eine eigene Lizenzdatei liegt dafür nicht vor.
- **TCGdex**: [tcgdex/cards-database](https://github.com/tcgdex/cards-database), MIT-Lizenz (Copyright (c) 2021 TCGdex), siehe `sources/tcgdex/LICENSE`. Die Bilder werden von assets.tcgdex.net verlinkt, nicht kopiert.
- Dieses Repo selbst hat keine eigene Lizenzdatei.

Pokémon und alle zugehörigen Namen, Kartentexte und Bilder sind Eigentum ihrer jeweiligen Rechteinhaber (Nintendo, Creatures Inc., GAME FREAK inc., The Pokémon Company). Dies ist ein nicht-kommerzielles Fanprojekt ohne Verbindung zu diesen Unternehmen.
