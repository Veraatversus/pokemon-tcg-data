# API v3: Monolithische statische API aus pokemontcg + TCGdex

Status: Entwurf · 2026-11-11 · Branch-Ziel Build: `master`, Frontend: `dev`

## 1. Ausgangslage und Ziel

Die Pokémon TCG API (pokemontcg.io) wird am **1. März 2027** abgeschaltet. Heute speist sich der Tracker aus:

| Quelle | Weg heute | Nutzung |
|---|---|---|
| `PokemonTCG/pokemon-tcg-data` | täglicher `git merge` in Repo-Root (`cards/`, `sets/`, `decks/`) | „Vera-API“ (statisch, GitHub Pages), Primärquelle |
| `JulienGitHub/pokemon-tcg-data` | täglicher `git merge` in Repo-Root | Übersetzungen (`cards/de`, `fr`, `es`, …) – vom Frontend **nicht** genutzt |
| `api.pokemontcg.io/v2` | Laufzeit-Fallback im Browser | Sets/Karten, wenn Vera-API fehlt |
| `api.tcgdex.net/v2/{de,en}` | Laufzeit im Browser, ~200 Requests beim Overview | DE-Namen, Bilder, TCGdex-only-Sets/Karten |
| Cardmarket-Feeds | `build-cardmarket-data.yml` → `cardmarket/` | Preise, Produkt-Links |

**Ziel:** Eine einzige, im Repo gebaute statische API (`api/v3/`), die

1. die vorhandenen pokemontcg-Daten als **eingefrorenen Legacy-Snapshot** weiterverwendet (Entscheidung: Einfrieren sofort, nicht erst zur Abschaltung),
2. **ab sofort auf TCGdex als einziger aktiver Quelle** läuft,
3. TCGdex-Daten integriert (DE-Texte, DE-Bilder, Varianten, Cardmarket-/TCGplayer-IDs),
4. alle Laufzeit-Aufrufe an pokemontcg.io und api.tcgdex.net im Frontend ersetzt,
5. **bestehende Google-Sheets-Datenbanken ohne Verlust des Sammelstatus** weiter nutzbar lässt.

Nicht-Ziele: `data-asia` (JP/Asien), Preis-Historie. (TCG-Pocket war zunächst ausgeschlossen und ist seit Phase 2 wieder enthalten, siehe §10 Punkt 8.)

## 2. Analyse-Befunde (Stand 2026-11-11, TCGdex `5fbf524a`)

Abgleich mit dem heutigen Frontend-Matcher (`findMatchingTcgdexSet`) und `normalizeCardNumber`:

| Kennzahl | Wert |
|---|---|
| Sets pokemontcg (en) / TCGdex (international) | 177 / 224 |
| pokemontcg-Sets mit TCGdex-Gegenstück | 160 |
| pokemontcg-Karten mit Nummern-Treffer | 20.292 / 20.405 (99,4 %) |
| … davon mit Cardmarket-Produkt-ID | 97,0 % |
| … mit DE-Name / DE-Bild / EN-Bild | 94,8 % / 68,6 % / 95,6 % |
| … Rarity, HP, Illustrator, Dex-Nr., Regulation Mark | 98–100 % |
| … Attacken/Fähigkeiten mit DE-Text | ~95 % |
| … mit detaillierten Varianten (normal/holo/reverse + eigene IDs) | 74 % |
| TCGdex-Bildindex (`assets.tcgdex.net/datas.json`): Karten mit DE-/EN-Bild | 16.295 / 22.857 |

### 2.1 Gefundene Matching-Fehler und -Lücken

| Fall | Ursache | Lösung im Build |
|---|---|---|
| `swsh45sv` → `swsh4.5` (**falsch**, heute im Frontend aktiv) | Teil-Namensmatch schlägt vor ID-Normalisierung `45sv`↔`4.5sv` | ID-Normalisierung `Xpt5`/`X5`/`X.5` vor Namensmatch; Pflicht-Kartenzahl-Plausibilität |
| `mcd11…mcd22` ↔ `2011bw…2022swsh` | völlig andere ID-Schemata | manuelle Set-Mapping-Tabelle |
| `swsh9tg…swsh12tg` | Frontend schließt TG-Sets bewusst aus, TCGdex führt sie separat | direktes ID-Match zulassen |
| `swsh35`↔`swsh3.5`, `fut20`↔`fut2020`, `me55c`↔`30th-c`, `cel25c`↔`cel25cc` | ID-Abweichung | Mapping-Tabelle |
| `ecard2` `H1` ↔ `H01`, `50` ↔ `50a/50b` | Nullpadding mit Präfix; TCGdex splittet Varianten | Präfix-Nummern-Normalisierung; Varianten-Gruppe (1 pt-Karte ↔ n TCGdex-Karten) |
| SM-Sets `101a`, `19a`, … (1–11 je Set), `smp` `SM30a` | pokemontcg-only Alternativ-Prints | bleiben `primary_only` (aus Legacy-Daten) |
| `ex10` Unown `A–Z` | TCGdex führt sie in Extra-Set `exu` | Set-übergreifendes Karten-Mapping |
| `me55c`/`cel25c`: pt-Nummern sind Originalnummern (`15` ×4) | Nummer nicht eindeutig | Matching über Name + Reihenfolge; siehe 5.3 |
| TCGdex-Namen mit Apostroph („McDonald's“) | Regex-Parser in `generate-tcgdex-helpers.mjs` bricht ab | AST-basierter Parser (4.2) |

### 2.2 Weitere Risiken

- **Bilder:** Alte Sets verweisen auf `images.pokemontcg.io`, neue auf `images.scrydex.com`. Beides ist nach dem Wegfall unsicher. Diese URLs stehen auch in Sheets (`vera_images_*`, `tcgdex_image_*`) und in `pokecode.js:821`.
- **ID-Drift:** Ein Set, das heute TCGdex-only ist (`TCGDEX-<id>`), wechselt im heutigen Frontend zur pokemontcg-ID, sobald pokemontcg-Daten erscheinen. Damit ändert sich der Schlüssel in `db_collection`.
- **Julien-Daten:** Das DE-Format weicht stark ab (`id: "sv3-5_6"`, `rarity: "DoubleRare"`, Kosten als String) und wird nicht genutzt. Relevant ist nur `en`: Julien ist der einzige Lieferant der englischen pokemontcg-Daten für `me2pt5`, `me3`, `me4`, `me5` und `mep` (49 Karten). TCGdex deckt diese Sets vollständig ab (`mep`: 112 Karten, durchgehend mit Cardmarket-ID). Die Sheet-Schlüssel dieser Sets (`me2pt5` …) stammen aber aus den Julien-Daten.

  **Entscheidung:** Juliens EN-Daten sind im Repo-Root bereits mit pokemontcg gemergt und gehen im **einmaligen eingefrorenen Snapshot** `sources/pokemontcg/` auf (nur `cards/en`, `sets/en.json`, `decks/en`); es gibt keinen separaten Julien-Ordner und keinen weiteren Sync. Er dient nur dem Befüllen der Registry und als Legacy-EN-Fallback. Der laufende Betrieb braucht ihn nicht.

## 3. Zielarchitektur

```text
                    ┌──────────────── master ────────────────┐
PokemonTCG+Julien ──einmal─▶ sources/pokemontcg/ (gemergter Root-Stand: cards/en, sets/en.json, decks/en; eingefroren)
TCGdex     ──snap──▶ sources/tcgdex/      (data/ ohne Pocket, datas.json)
Cardmarket ──feed──▶ (Build-Input, nicht committet)
                         │
                         ▼
            scripts/api/build-api.mjs
              + api/mappings/*.json   (manuell gepflegt)
              + api/registry/*.json   (eingefrorene Schlüssel)
                         │
                         ▼
                      api/v3/         (generiert)
                    └──────────────────────────────────────────┘
                         │ promote (wie heute)
                         ▼
               dev ──▶ release ──▶ GitHub Pages
```

### 3.1 Verzeichnisse

```text
sources/
  pokemontcg/      eingefrorener Snapshot des heutigen Repo-Roots (Upstream PokemonTCG + Julien bereits gemergt, inkl. Juliens EN-Beiträge für me2pt5, me3, me4, me5, mep), nur cards/en, sets/en.json, decks/en, kein Sync; kein eigener julien/-Ordner
  tcgdex/          Snapshot tcgdex/cards-database: data/ (ohne "Pokémon TCG Pocket"), interfaces.d.ts, LICENSE
                   + assets-index.json (aus assets.tcgdex.net/datas.json, auf en/de/univ reduziert)
                   Hinweis: Die TS-Dateien bleiben unverändert, sie enthalten alle Sprachen. Reduziert wird erst in v3.
  SOURCES.json     je Quelle: repo, ref, commit-SHA, Abrufzeit, Status (active|frozen|unreachable)
api/
  mappings/        manuell gepflegt, reviewbar
    set-map.json          pokemontcg-ID ↔ TCGdex-ID (+ Begründung)
    card-map.json         Nummern-Aliase, set-übergreifende Karten, Varianten-Gruppen
    excludes.json         ausgeschlossene Serien/Sets
  registry/        maschinell fortgeschrieben, nie rückwirkend geändert
    sets.json             canonicalSetId → { pokemontcgId?, tcgdexId?, aliases[], firstSeen }
    cards/<setId>.json    canonicalCardId → { pokemontcgNumber?, tcgdexLocalId?, aliases[] }
  v3/              generierte API
    meta.json
    sets.json             alle Sets, mehrsprachig
    cards/<canonicalSetId>.json
    search-index.json     kompakter Index (Name en/de, Nummer, setId) für die Suche
    cardmarket/           heutiges cardmarket/ (Phase 4 hierher verschoben)
scripts/api/       Build, Parser, Matcher, Tests
```

Die Root-Ordner `cards/`, `sets/`, `decks/` und `cardmarket/` bleiben bis Phase 4 unverändert erhalten. Bis dahin funktioniert das heutige Frontend weiter.

### 3.2 Upstream-Sync neu: Snapshot statt Merge

`git merge` in den Root funktioniert mit Unterordnern nicht. Neuer Ablauf pro Quelle:

1. `git fetch --depth 1 <remote> <branch>` (TCGdex: `git clone --depth 1 --filter=blob:none --sparse` nur `data/`).
2. Inhalt nach `sources/<name>/` spiegeln (`git archive … | tar -x`, danach Pocket-Ordner entfernen).
3. `SOURCES.json` aktualisieren und committen, wenn sich etwas geändert hat.
4. **Ist eine Quelle nicht erreichbar oder archiviert, wird der letzte Snapshot behalten** (`status: frozen`). Ein Issue wird angelegt, der Build läuft weiter.

Damit gibt es keine Merge-Konflikte mehr.

**Entscheidung (Einfrieren):** Der gemergte Stand aus pokemontcg und Julien wird **sofort und einmalig** als ein Snapshot (`sources/pokemontcg/`) eingefroren. Grundlage ist der aktuelle Stand im Repo-Root, inklusive `me6`. Der Commit-SHA wird in `SOURCES.json` festgehalten (`status: frozen`). Danach synchronisiert nur noch TCGdex. Bis zum Snapshot bekannte Sets behalten ihre pokemontcg-ID, jedes spätere Set bekommt `TCGDEX-<id>`.

## 4. Build-Pipeline (`scripts/api/`)

### 4.1 Schritte

1. **Laden:** pokemontcg (en, gemergter eingefrorener Stand inkl. Julien-EN, Legacy), TCGdex (AST-geparst), TCGdex-Assets-Index, Cardmarket-Feeds.
2. **Set-Matching** (4.3) → Set-Paare plus Konfidenz. Sets ohne sicheren Treffer → Report, kein Raten.
3. **Karten-Matching** je Set-Paar (4.4).
4. **Registry fortschreiben** (5): Neue Sets und Karten bekommen einmalig eine kanonische ID, bestehende Einträge bleiben unverändert.
5. **Merge** zum v3-Datensatz (6), Feld für Feld nach Quellen-Priorität.
6. **Cardmarket-Anreicherung:** zuerst über die Produkt-ID aus TCGdex (Varianten-genau), dann über das heutige Heuristik-Matching als Fallback.
7. **Validierung und Reports:** Schema-Check, Registry-Invarianten, Matching-Report (`api/v3/reports/matching.json` + Markdown-Zusammenfassung im Workflow-Summary).
8. **Atomar schreiben** (temp → rename), deterministisch sortiert, damit Diffs minimal bleiben.

### 4.2 TCGdex-Parser

Keine Ausführung von Fremdcode. Pro Datei:

1. `module.stripTypeScriptTypes(source)` (Node ≥ 23, reine Transformation),
2. Parsen mit `acorn` und Auswerten nur von Literal-Knoten (Objekt, Array, String, Zahl, Boolean, `null`),
3. Import der Set-/Serien-Datei per Pfad auflösen (statt auszuführen).

Unbekannte Knoten (Funktionsaufrufe, Template-Ausdrücke) → Build-Fehler mit Dateipfad.

### 4.3 Set-Matching (Reihenfolge, erster sicherer Treffer gewinnt)

1. Eintrag in `api/mappings/set-map.json`,
2. bereits in `api/registry/sets.json` gebunden,
3. exakte ID (case-insensitive),
4. normalisierte ID (`sv3pt5`↔`sv03.5`, `swsh45sv`↔`swsh4.5sv`, führende Nullen),
5. offizielles Kürzel (`ptcgoCode` ↔ `abbreviations.official`) **und** Release-Datum ±7 Tage,
6. normalisierter EN-Name **und** Release-Datum ±31 Tage.

Jeder Treffer muss die Plausibilität bestehen: Kartenzahl-Abweichung ≤ 10 % oder ≥ 90 % Nummern-Überlappung. Sonst Report statt Match. Teil-Namensmatches (heutiger Fehlerfall) entfallen.

### 4.4 Karten-Matching

1. `card-map.json`-Eintrag (Aliase, set-übergreifend wie `ex10`→`exu`),
2. normalisierte Nummer (Schlüsselvertrag `normalizeCardNumber`, zusätzlich Präfix-Padding `H01`↔`H1`),
3. Varianten-Gruppe: pt `50` ↔ TCGdex `50a`+`50b`, gebündelt als Varianten einer Karte,
4. für Sets mit nicht-eindeutigen Nummern: EN-Name + Position in der Liste,
5. Plausibilitäts-Check: EN-Name ähnlich (normalisiert), sonst `suspicious` im Report.

Ergebnis je Karte: `matched` | `primary_only` | `tcgdex_only` (gleiche Werte wie heute).

## 5. Schlüsselvertrag und Sheets-Kompatibilität

### 5.1 Unveränderliche Schlüssel

`db_collection` speichert `(setId, cardId, g, rh, updatedAt)`. Diese Werte entstehen heute so:

- `setId` = pokemontcg-Set-ID, sonst `TCGDEX-<tcgdexId>`,
- `cardId` = `normalizeCardNumber(pokemontcgNumber ‖ tcgdexLocalId)` (führende Nullen entfernt: `006`→`6`, `CC001`→`CC1`).

**Regel:** `canonicalSetId` und `canonicalCardId` in v3 werden **exakt nach dieser Logik** vergeben, beim ersten Auftreten in der Registry eingefroren und **nie wieder geändert**.
- Für alle heute existierenden Sets und Karten wird die Registry beim initialen Build aus dem jetzigen Stand befüllt.
- Neue Sets nach dem Wegfall von pokemontcg erhalten `TCGDEX-<tcgdexId>`.

### 5.2 Aliase gegen ID-Drift

Jedes Registry-Element führt `aliases[]` mit allen IDs, unter denen es je auftreten konnte: pokemontcg-ID, `TCGDEX-<id>`, unnormalisierte Nummer.

- Beim **Lesen** von `db_collection` löst das Frontend jede Zeile über diese Aliase auf.
- Beim **Schreiben** bleibt der Schlüssel erhalten, der in der Zeile schon steht. Es gibt kein automatisches Umschlüsseln und damit auch keine doppelten Zeilen.
- **Generische Alias-Regel** (gilt für alle Nutzer, nicht nur für die Referenz-DB):
  - Set: pokemontcg-ID (falls vorhanden) und `TCGDEX-<tcgdexId>` (falls vorhanden).
  - Karte: `normalizeCardNumber(pokemontcg-Nummer)` und `normalizeCardNumber(TCGdex-localId)`.
- **Galerie-Untersets** (Entscheidung, §10 Punkt 9): Karten aus `swsh9tg`…`swsh12tg`, `swsh12pt5gg` und `swsh45sv` gehören kanonisch zum **Hauptset** (`swsh9`…`swsh12`, `swsh12pt5`, `swsh45`), mit Kartenschlüsseln wie `TG1`, `GG1`, `SV1`. Die Unterset-IDs werden zu Set-Aliasen des Hauptsets.
  - Existieren Zeilen unter beiden Schlüsseln, gilt eine Karte als besessen, wenn sie an mindestens einer Stelle abgehakt ist (`g`/`rh` per ODER).
  - Die Konfiguration liegt in `api/mappings/subset-merge.json`.

### 5.3 Nicht-eindeutige Nummern: eindeutige Schlüssel + Migration (entschieden)

Betroffen sind nach `normalizeCardNumber` genau **11 Karten in 3 Sets**:

| Set | Kollision |
|---|---|
| `cel25c` | `15` ×4 |
| `me55c` | `106` ×3, `11` ×2 |
| `zsv10pt5` | `60` ×2 |

Heute teilen sich diese Karten eine Zeile in `db_collection`. Der Sammelstatus ist dort also nicht pro Karte gespeichert.

**Neue Regel:** Jede Karte bekommt einen eindeutigen `canonicalCardId`. Für die betroffenen Karten liegt er in einem **eigenen Namensraum**, der mit alten Schlüsseln nicht kollidieren kann. Grundlage ist das pokemontcg-ID-Suffix (`15_A1`…`15_A4`), sonst `<nummer>_<tcgdexLocalId>`. Ein reiner Nummernschlüssel wie `4` darf **nie** eine andere Karte bezeichnen als bisher.

**Migration:**
1. Beim Laden erkennt das Frontend Zeilen mit einem alten mehrdeutigen Schlüssel (Registry-Feld `ambiguousLegacyKey`).
2. Ist der Status `g`/`rh` dort `false`, wird die Zeile still auf die neuen Schlüssel umgeschrieben. Es geht nichts verloren.
3. Ist der Status gesetzt, fragt ein einmaliger Dialog, für welche der Karten er gilt (Mehrfachauswahl, mit Bildern). Erst danach werden neue Zeilen geschrieben und die alte Zeile entfernt.
4. Bis zur Antwort bleibt die alte Zeile unverändert, und die Karten zeigen den alten Status gemeinsam an.
5. Vor der Migration wird ein Snapshot angelegt (`features/collection/versioning.js`).

### 5.4 Weitere Sheets

- **Spaltensemantik (Entscheidung):** Text- und Bildspalten werden nach Sprache gedeutet, `vera_*` = **Englisch**, `tcgdex_*` = **Deutsch**. Das entspricht weitgehend dem heutigen Inhalt: `vera_*` kommt aus pokemontcg, `tcgdex_*` aus TCGdex mit Vorrang DE und Fallback EN. Bestehende Zeilen bleiben deshalb gültig.
  - Neue Sets befüllen `vera_*` aus den TCGdex-EN-Werten.
  - ID-Spalten (`vera_id`, `tcgdex_id`, `vera_number`, `tcgdex_localId`) behalten ihre **Quellbedeutung**.
  - DE-Attribute ohne Spalte (Attacken, Fähigkeiten, Regeltexte) werden **nicht** ins Sheet geschrieben, sondern beim Anzeigen aus `api/v3` geladen. `db_cards` bleibt ein schlanker Cache.
- `Sets Overview`, `WebApp Settings` und `Collection Summary` bleiben unverändert.
- `db_sets` und `db_cards` sind Cache-Tabellen. Neue Spalten werden **angehängt**, nie umsortiert. Der Reader erkennt alte Formate wie heute (`isNewCardFormat`, `isCardImageSplitFormat`).
- Gespeicherte Bild-URLs werden beim Lesen ignoriert, wenn v3 eine bessere URL kennt. Das löst das Abschaltungsproblem ohne Schreibzugriff.

### 5.5 Kompatibilitäts-Testsuite (Pflicht vor Phase 3)

- Fixture: Export der echten Produktiv-DB (`db_collection`, `Sets Overview`, als CSV). Sie liegt lokal unter `.local/fixtures/` (gitignored, wird **nicht** committet). Committet wird nur eine daraus abgeleitete, reduzierte Schlüsselliste (`setId`, `cardId`) ohne weitere Inhalte, falls gewünscht.
- Test: Jede Fixture-Zeile wird auf genau eine v3-Karte aufgelöst, 0 verwaiste Zeilen, 0 Doppelbelegungen außer den bekannten Fällen aus 5.3.
- Ergänzend wird jede heute generierbare Schlüsselkombination (alle Sets × Karten aus dem jetzigen Frontend-Pfad) gegen die Registry geprüft.

### 5.6 Befunde aus der Referenz-DB (2026-11-11)

Grundlage: `db_collection` mit 23.424 Zeilen in 213 Sets, davon 4.074 mit `g` und 2.764 mit `rh` abgehakt.

| Befund | Zeilen / Haken | Konsequenz |
|---|---|---|
| 170 pokemontcg-Sets, deren Schlüssel direkt passen | Großteil | keine |
| 14 Pocket-Sets (`TCGDEX-A1a` … `TCGDEX-P-A`) | 1 Haken (`B2a`) | Pocket wieder aufnehmen (§10 Punkt 8) |
| `TCGDEX-me05`, `-me06`, `-30th`, `-fut2020` (inzwischen gepaart) | 0 Haken | Set-Alias `TCGDEX-<id>` |
| `mep` und `TCGDEX-mep` | 0 Haken | Kanonisch `mep`, Alias `TCGDEX-mep`. pokemontcg-Karten liegen nur in `cards/en/mep.json` (fehlt in `sets/en.json`) |
| Galerie-Karten unter dem Hauptset (`swsh12pt5`/`GG1`…, `swsh9`/`TG1`…, `swsh45`/`SV1`…) | 62 Haken (GG), identisch zu `swsh12pt5gg` | Galerien gehören ins Hauptset (§5.2) |
| `ecard2` `50a`/`50b` …, `sve` 17–24, `swshp` `SWSH301` | 0 Haken | TCGdex-only-Karten in gepaarten Sets (Schlüssel = TCGdex-localId) |
| `zsv10pt5`/`80` (pokemontcg nennt die Karte fälschlich `60`) | abgehakt | Kanonischer Schlüssel `80`. Belegt, dass das Frontend die TCGdex-Nummer verwendet hat |
| `cel25c`: 22 Zeilen (`15` einmal statt viermal) | 0 Haken | Migration nach §5.3 bei dieser DB verlustfrei |

## 6. v3-Datenmodell

Ein Set bzw. eine Karte enthält **pokemontcg-kompatible Felder auf oberster Ebene**. So funktioniert vorhandener Code mit `name`, `number`, `images.small` usw. weiter. Dazu kommen die Erweiterungsblöcke:

```jsonc
// api/v3/cards/sv3pt5.json → [ … ]
{
  "id": "sv3pt5-6",                 // kanonisch: <canonicalSetId>-<canonicalCardId>
  "setId": "sv3pt5", "cardId": "6", // Sheet-Schlüssel
  "matchStatus": "matched",
  "number": "6", "name": "Charizard ex",
  "supertype": "Pokémon", "subtypes": ["Stage 2", "ex"], "hp": "330", "types": ["Fire"],
  "rarity": "Double Rare", "artist": "PLANETA Mochizuki", "regulationMark": "G",
  "attacks": [ … ], "weaknesses": [ … ], "retreatCost": [ … ], "rules": [ … ],
  "nationalPokedexNumbers": [6], "legalities": { … },
  "images": { "small": "…", "large": "…" },   // aufgelöst: beste verfügbare Quelle
  "i18n": {
    "de": { "name": "Glurak-ex", "evolvesFrom": "Glutexo", "attacks": [ … ], "flavorText": "…",
            "images": { "small": "https://assets.tcgdex.net/de/sv/sv03.5/006/low.webp", "large": "…/high.webp" } }
  },
  "variants": [ { "type": "holo", "cardmarketId": 733601, "tcgplayerId": 502558 } ],
  "ids": { "pokemontcg": "sv3pt5-6", "tcgdex": "sv03.5-006", "cardmarket": [733601], "tcgplayer": [502558] },
  "sources": { "pokemontcg": "a1b2c3d", "tcgdex": "5fbf524a" }
}
```

**Feld-Priorität** (pro Feld konfigurierbar in `scripts/api/merge-rules.mjs`):

| Feld | 1. | 2. | Hinweis |
|---|---|---|---|
| EN-Texte, `rules`, `subtypes` | pokemontcg-Snapshot | TCGdex-abgeleitet | TCGdex hat kein `rules`: aus `suffix`/`stage`/`trainerType` ableiten |
| `legalities` | TCGdex (`meta/legals.ts`) | – | **immer** aus TCGdex, auch für alte Sets, denn der Snapshot veraltet bei Rotationen |
| DE-Texte | TCGdex | – | Julien-DE wird nicht verwendet |
| Bilder | TCGdex (Sprache, dann EN) | Legacy-URL | Existenz über Assets-Index |
| Varianten, Cardmarket-/TCGplayer-IDs | TCGdex | Cardmarket-Heuristik | |
| Nummer, Set-Zuordnung | Registry | – | nie aus Rohdaten überschreiben |

**TCGdex-only-Betrieb:** Fehlt pokemontcg vollständig, werden alle Felder aus TCGdex abgeleitet. Ein Test baut v3 ohne `sources/pokemontcg` und prüft Schema-Vollständigkeit und Schlüsselstabilität.

## 7. Frontend-Umbau

- `pokemon-api.js` wird ein dünner Client für `api/v3/` (Sets, Karten, Suchindex).
- **Entfällt:** Laufzeit-Matching in `pokecode-compat.js` (`findMatchingTcgdexSet`, `combineSetsForOverviewCompat`, `loadCardsForSetCompat`), `fetchTcgdexSetsDetailed` (~200 Requests), `CONFIG.APIS.POKEMONTCG` und `TCGDEX_*`, `CUSTOM_SET_ID_MAPPINGS`.
- **Neu:** Sprachwahl (DE/EN) für Name, Texte und Bild mit Fallback-Kette; Cardmarket-Links aus `variants[].cardmarketId` (Reverse-Holo direkt adressierbar).
- `schema-contract.js` bleibt die Brücke zu den Sheets. Die `vera_*`/`tcgdex_*`-Spalten werden aus v3 befüllt.
- `pokecode.js` (Apps Script) bekommt einen eigenen, kleineren Umstieg auf `api/v3/`.

## 8. Phasen

| Phase | Inhalt | Branch | Abnahme |
|---|---|---|---|
| 0 | Spec abstimmen, Kompatibilitäts-Fixture beschaffen | – | Entscheidungen in §10 geklärt |
| 1 | `sources/tcgdex/` + Snapshot-Sync, AST-Parser, Set-/Karten-Matcher, Mappings, Matching-Report | master | Report: ≥ 99,5 % Karten-Match, 0 falsche Set-Paare (manuelles Review) |
| 2 | Registry (initial aus heutigem Stand), Merge, `api/v3/` + Workflow; TCGdex-only-Build-Test | master | Kompatibilitäts-Suite grün, deterministischer Build |
| 3 | Frontend auf v3, Laufzeit-API-Aufrufe entfernen, Aufräumen `pokecode-compat.js`/`app.js`-Teile, DE-Sprachwahl | dev | Smoke-Tests grün, echte Sheets geprüft |
| 4 | Gemergten pokemontcg-Snapshot nach `sources/pokemontcg/` verschieben, Root-Ordner entfernen, `cardmarket/` → `api/v3/cardmarket/`, Workflows und Doku anpassen | master → dev | Pages-Pfade geprüft, Promote-Workflows grün |
| 5 | Apps Script `pokecode.js` umstellen | dev | manueller Test im Sheet |

## 9. Workflows (Zielbild)

| Workflow | Änderung |
|---|---|
| `sync-upstream.yml` | wird zu `sync-tcgdex.yml`: nur noch TCGdex-Snapshot nach `sources/tcgdex/`. pokemontcg- und Julien-Remotes entfallen. |
| `build-cardmarket-data.yml` → `build-api.yml` | Tests → `build-api.mjs` (inkl. Cardmarket) → Commit `api/v3/` auf `master` |
| `propagate-master-to-dev-release.yml` | Schutzpfade um `sources/`, `api/` ergänzen (statt Root-Daten) |
| `verify-dev-preview.yml` | Kompatibilitäts-Suite + v3-Schema-Check |

## 10. Entscheidungen (2026-11-11)

1. **Nicht-eindeutige Nummern:** eindeutige Schlüssel mit einmaliger Migration (§5.3).
2. **Julien:** kein separater Snapshot; Juliens EN-Beiträge stecken im gemergten, eingefrorenen `sources/pokemontcg/` (Registry und Legacy-Fallback), kein laufender Sync (§2.2).
3. **Sprachen in v3:** `en` + `de`. TCGdex-Snapshot und Assets-Index werden auf diese beiden Sprachen (plus `univ` für Symbole) reduziert.
4. **Kompatibilitäts-Fixture:** CSV-Export der Produktiv-DB, lokal und gitignored (§5.5).
5. **Sets ohne pokemontcg-Gegenstück:** Alle werden aufgenommen (Trainer Kits, McDonald's, Promos usw.), außer `data-asia`.
6. **pokemontcg sofort einfrieren:** TCGdex ist ab sofort die einzige aktive Quelle (§3.2). Spaltensemantik `vera_*` = EN, `tcgdex_*` = DE (§5.4).
7. **Matching:** Ziel ist ein möglichst korrektes und vollständiges Matching. Alle Hilfsmittel aus §4.3/§4.4 werden umgesetzt, Restfälle landen in den Mappings und nicht im Report-Backlog.
8. **Pocket wieder aufnehmen** (2026-11-11, nach Auswertung der Referenz-DB): Pocket-Sets kommen als `TCGDEX-<id>` in die API. Der Snapshot-Sync spiegelt dafür die Serie `tcgp` mit; `data-asia` bleibt ausgeschlossen.
9. **Galerie-Untersets gehören ins Hauptset** (2026-11-11): siehe §5.2. Unterset-Zeilen werden als Aliase per ODER zusammengeführt.
10. **Phase 1 abgenommen** (2026-11-11): Die Nutzerin hat die Paarliste in `api/v3/reports/matching.md` geprüft und bestätigt.
