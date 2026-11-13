# API-v3-Toolchain (`scripts/api`)

Node 24 (ESM). Tests: `cd scripts/api && npm test`.

## Ueberblick

1. **Sync** (`sources/sync-tcgdex.mjs`, taeglich per `.github/workflows/sync-tcgdex.yml`): spiegelt die TCGdex-Daten nach `sources/tcgdex`. Der pokemontcg-Snapshot in `sources/pokemontcg` ist eingefroren.
2. **Matching** (`build-matching.mjs`): ordnet pokemontcg-Sets/-Karten den TCGdex-Sets/-Karten zu, schreibt `api/v3/reports/matching.{json,md}` und bricht bei Qualitaets- oder Paar-Drift ab (`--min-card-match 0.995 --fail-on-pair-drift`).
3. **Build** (`build-api.mjs`): erzeugt aus Quellen, Matching und der **eingefrorenen Registry** (`api/registry/`) die statische API unter `api/v3/` (`sets.json`, `cards/<set>.json`, `search-index.json`, `meta.json`) und ergaenzt die Registry nur additiv.
4. **Reports** (`api/v3/reports/`): `matching.*`, `learned-tables.json` (aus Paaren gelernte Ableitungstabellen; Aenderungen erscheinen im Diff) und `cardmarket-ids.json` (Cardmarket-Abdeckung je Set).

Cardmarket-IDs (`merge/cardmarket-ids.mjs`): `ids.cardmarket` kommt von TCGdex. Fehlt sie, sucht der Build in `cardmarket/sets/<expansionId>.json` (Expansion = `ids.cardmarket` des Sets bzw. des TCGdex-Untersets; Ausgabe des Workflows "Build Cardmarket Data", hier nur gelesen) ein Pokémon-Single mit gleicher Nummer (ohne fuehrende Nullen, Gross/Klein egal) und gleichem Namen (ohne `[...]`-Zusaetze, Diakritika, Satzzeichen und Cardmarkets `Lv.<n>`; `★` = `Gold Star`). Ohne Nummerntreffer zaehlt nur ein Produkt ohne `collectorNumber`, wenn es das einzige dieses Namens in der Expansion ist. Genau ein Kandidat wird eingetragen (`ids.cardmarket: [id]`, `ids.cardmarketSource: "matched"`); mehrere Kandidaten, ein schon von TCGdex belegtes Produkt oder dasselbe Produkt fuer zwei Karten bleiben leer. Eine eindeutige TCGdex-ID wird nie ueberschrieben. Teilen sich mehrere Karten dieselbe TCGdex-ID (`duplicateTcgdexIds` im Report), nimmt eine Karte den strengen Treffer (genau ein Produkt mit gleicher Nummer und gleichem Namen, nie nur per Name), sofern das Produkt keiner anderen Karte gehoert: `ids.cardmarket` = [Treffer, ...nicht geteilte TCGdex-IDs], `ids.cardmarketSource: "corrected"`, Original in `ids.cardmarketTcgdex`; geteilte `variants[].cardmarketId` werden durch den Treffer ersetzt, nicht geteilte bleiben. Ohne strengen Treffer bleibt die TCGdex-ID. `api/v3/reports/cardmarket-ids.json` fuehrt je Set `cards`, `tcgdex`, `matched`, `missing`, `ambiguous` und die betroffenen `cardId`s; die CLI druckt die Summen. Der Suchindex traegt die primaere Produkt-ID als `cm` (`primaryCardmarketId`, gleiche Regel im Frontend: erste ungestempelte Variante mit `cardmarketId`, sonst erste Variante mit `cardmarketId`, sonst `ids.cardmarket[0]`).

Expansionspruefung (gleiches Modul, Report-Abschnitt `expansionMismatch`, CLI-Zeile "Cardmarket-Expansionspruefung"): `ids.cardmarket` eines Sets muss eine Expansion mit Set-Datei sein (`cardmarket/index/sets.json`). Sonst wird sie nur abgeleitet, wenn >= 80 % der Karten mit IDs ein namensgleiches Produkt in genau einer Expansion haben (`ids.cardmarketSetSource: "derived"`, Original in `ids.cardmarketTcgdexSet`, z. B. tk1a); sonst bleibt der Wert und wird gemeldet. Je Karten-ID wird das Produkt ueber `cardmarket/index/products.json` gesucht und sein Name nachsichtig verglichen (zusaetzlich Kurz-Tags wie `[GL]`/`[G]` als Text, ohne `Basic `, ohne ` - Untertitel`). Passt der Name nicht, ersetzt der Lueckentreffer in der Expansion der Karte die ID (`ids.cardmarketSource: "corrected-expansion"`, Original in `ids.cardmarketTcgdex`, Varianten mit); ohne Treffer wird sie entfernt, wenn das Produkt in einer fremden Expansion liegt (`dropped-mismatch`), sonst bleibt sie (`kept-mismatch`). Namensgleiche Produkte fremder Expansionen (Stempel-, Ball-Varianten) bleiben; Sets ohne gueltige Expansion werden nur gemeldet (`no-set-expansion`).

Kartenbilder: oben in `images` strikt Englisch (TCGdex EN, sonst pokemontcg-Legacy-URL), Deutsch nur in `i18n.de.images`; `warnings.missingImages` zaehlt Karten ohne EN-Bild und ohne `i18n.de.images`.

Set-Logos und -Symbole: `sources/verify-assets.mjs` (im Workflow nach dem Sync, `continue-on-error`) prueft nur Set-Logos (en/de) und -Symbole aus `sources/tcgdex/assets-index.json` gegen assets.tcgdex.net, nie Kartenbilder, und fuehrt das Ergebnis in `sources/tcgdex/assets-verified.json` (`{ url: { status: ok|missing, checkedAt } }`). `ok` wird nie erneut geprueft, `missing` nach 7 Tagen, neue URLs einmal; je Asset erst `.webp`, `.png` nur wenn `.webp` fehlt. Netzwerkfehler, Timeouts sowie HTTP 401/403/408/429/5xx aendern nichts (bekannter Status bleibt, Unbekanntes bleibt unbekannt). Der Build gibt als fehlend verifizierte URLs nicht aus (oben greift die pokemontcg-Legacy-URL, `i18n.de.images.logo` entfaellt) und meldet `Assets: <ok> ok, <missing> fehlen` je Asset-Gruppe. Erneute Pruefung erzwingen: den Eintrag aus `assets-verified.json` loeschen. Etwa woechentlich aendert sich `checkedAt` der fehlenden Eintraege; der Sync committet das mit.

Ausgabeformat: `api/v3/cards/*.json` und `api/v3/search-index.json` sind kompakt (eine Zeile, `toCompactJson`); `api/registry/**`, `api/v3/sets.json`, `api/v3/meta.json`, `api/v3/reports/learned-tables.json` und `api/v3/reports/cardmarket-ids.json` sind eingerueckt (`toJson`). Beide mit sortierten Schluesseln und abschliessendem Zeilenumbruch.

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
