# API-v3-Toolchain (`scripts/api`)

Node 24 (ESM). Tests: `cd scripts/api && npm test`.

## Ueberblick

1. **Sync** (`sources/sync-tcgdex.mjs`, taeglich per `.github/workflows/sync-tcgdex.yml`): spiegelt die TCGdex-Daten nach `sources/tcgdex`. Der pokemontcg-Snapshot in `sources/pokemontcg` ist eingefroren.
2. **Matching** (`build-matching.mjs`): ordnet pokemontcg-Sets/-Karten den TCGdex-Sets/-Karten zu, schreibt `api/v3/reports/matching.{json,md}` und bricht bei Qualitaets- oder Paar-Drift ab (`--min-card-match 0.995 --fail-on-pair-drift`).
3. **Build** (`build-api.mjs`): erzeugt aus Quellen, Matching und der **eingefrorenen Registry** (`api/registry/`) die statische API unter `api/v3/` (`sets.json`, `cards/<set>.json`, `search-index.json`, `meta.json`) und ergaenzt die Registry nur additiv.
4. **Reports** (`api/v3/reports/`): `matching.*` und `learned-tables.json` (aus Paaren gelernte Ableitungstabellen; Aenderungen erscheinen im Diff).

Die Registry vergibt kanonische Set-IDs und Kartenschluessel. Sie ist die Grundlage der Zeilenschluessel in `db_collection` und darf sich daher nur additiv aendern.

## Registry-Drift beheben

### Was die Fehler bedeuten

- **`RegistryFrozenError`**: Der Build wuerde einen bestehenden Registry-Eintrag aendern oder entfernen (Set/Karte verschwunden, `pokemontcg`/`tcgdex`-Verweis geaendert, Schluessel entfernt, ...). Typische Ursache: TCGdex hat eine Karte/ein Set umbenannt, neu nummeriert oder entfernt. Jede Zeile der Meldung nennt `Set <id>` bzw. `Karte <set>/<cardId>` und das betroffene Feld (`alt -> neu`, `entfernt: <ref>`).
- **`RegistryInvariantError`**: Die Registry verletzt eine Invariante (Schluessel doppelt vergeben, Schluessel nur in Gross-/Kleinschreibung verschieden, TCGdex-Karte oder pokemontcg-ID mehrfach referenziert, Set-ID unzulaessig). Die Meldung nennt Set, Schluessel und beteiligte Karten.
- **`Registry-Karten ohne Quelle`** (Build-Fehler): Eine Registry-Karte hat weder eine pokemontcg- noch eine TCGdex-Karte mehr. Ausgabe: `<set>/<cardId> (pokemontcg ..., tcgdex <set>/<localId>)`.

Beide Fehler stehen in der CLI-Ausgabe von `node scripts/api/build-api.mjs` (`FEHLER: ...`), im CI-Log des Sync-Laufs und im automatisch angelegten Issue (Label `upstream-sync`). Es wird nichts committet, `api/` bleibt unveraendert.

### Korrigieren (reviewte manuelle Aenderung)

Die Registry ist die Wahrheit; ein Build aendert eingefrorene Werte nie selbst. Korrekturen sind bewusste, im PR reviewte Handedits:

1. **TCGdex-Verweis umhaengen** (z. B. Karte hat jetzt eine andere `localId` oder ein anderes Set): in `api/registry/cards/<set>.json` bei der Karte den Eintrag in `tcgdex` (`{ "set": "...", "localId": "..." }`) auf die neue Referenz setzen. Den alten Schluessel in `keys.tcgdex` stehen lassen (alte Schluessel loesen weiter auf dieselbe Karte auf) und den neuen ergaenzen.
2. **Karte stilllegen** (Karte existiert upstream nicht mehr): Eintrag nicht loeschen, sondern `tcgdex` auf `[]` setzen (und `pokemontcg` auf `null`, wenn auch dort weg). Die Karte erscheint dann nicht mehr in der API, der Schluessel bleibt aber reserviert. Ist das nicht moeglich, den Eintrag bewusst entfernen und im PR begruenden.
3. **Set-ID umbenannt** (TCGdex-Set-ID): in `api/registry/sets.json` das Feld `tcgdex` auf die neue ID setzen und die alte ID in `aliases` aufnehmen. Die kanonische Set-ID (Dateiname `cards/<set>.json`) bleibt.

Wirkung auf bestehende Sheet-Zeilen: **Schluessel bleiben unveraendert**, nur die Verweise (Refs) auf die Quellen aendern sich. Bestehende `db_collection`-Zeilen loesen weiter auf dieselbe kanonische Karte auf.

Der Build vergleicht gegen die Registry-Dateien im Arbeitsverzeichnis: Die reviewte Handaenderung wird damit der neue Vergleichsstand. Im PR die Abweichung und ihren Grund ausdruecklich nennen.

### Pruefen

1. `cd scripts/api && npm test` (inkl. Kompatibilitaetstests gegen die Sammlungsschluessel).
2. `node scripts/api/build-api.mjs` aus dem Repo-Root: Exit 0, danach `git status` ansehen.
3. Build ein zweites Mal ausfuehren: `git status` darf sich nicht weiter aendern (sauber/idempotent), `Registry-Aenderungen: 0`.
4. `node scripts/api/build-matching.mjs --min-card-match 0.995 --fail-on-pair-drift` muss mit Exit 0 enden.
