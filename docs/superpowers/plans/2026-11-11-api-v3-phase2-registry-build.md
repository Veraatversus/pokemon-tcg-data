# API v3 Phase 2: Registry, Merge und statische v3-API – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aus pokemontcg-Snapshot + TCGdex eine deterministische statische API `api/v3/` bauen, deren Set-/Kartenschlüssel in einer eingefrorenen Registry (`api/registry/`) stehen und alle bestehenden `db_collection`-Zeilen auflösen.

**Architecture:** Phase-1-Bausteine (Loader, Matcher, Report) bleiben unverändert in Gebrauch. Neu: `scripts/api/registry/` (kanonische Schlüssel + Aliase + Einfrier-Prüfung), `scripts/api/merge/` (Feldzusammenführung, aus gematchten Paaren gelernte Ableitungstabellen, Legalitäten, Bilder), `scripts/api/build-api.mjs` (CLI, schreibt `api/v3/` und `api/registry/`). Der tägliche Workflow ruft den Build nach dem Matching auf.

**Tech Stack:** Node.js 24, `node:test`, `acorn@8.14.0`, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-11-api-v3-tcgdex-monolith-design.md` (§5, §5.6, §6, §10 Punkte 8–10)

## Global Constraints

- Arbeitsbranch `feature/api-v3-phase2` von `origin/master`; Merge nach `master` erst nach Freigabe durch die Nutzerin. Doku nur auf `dev`.
- TCGdex-Code wird nie ausgeführt (nur `parseTcgdexModule`).
- Pocket (Serie `tcgp`) ist wieder **enthalten**; `data-asia` bleibt ausgeschlossen.
- Sprachen in v3: `en` + `de`.
- Kartenschlüssel-Basis = `normalizeCardNumber` aus `scripts/api/lib/card-key.mjs`.
- Kanonische Set-ID: pokemontcg-ID, wenn das Set ein pokemontcg-Gegenstück hat (auch `mep`), sonst `TCGDEX-<tcgdexId>`.
- Registry-Einträge werden **nie** geändert oder entfernt; ein Build, der das täte, bricht mit Exit 1 ab.
- Galerie-Untersets → Hauptset: `swsh9tg→swsh9`, `swsh10tg→swsh10`, `swsh11tg→swsh11`, `swsh12tg→swsh12`, `swsh12pt5gg→swsh12pt5`, `swsh45sv→swsh45`.
- Kanonischer Schlüssel per Override: `zsv10pt5-80 → "80"` (Grund: Referenz-DB enthält `zsv10pt5`/`80` abgehakt).
- Ausgabe deterministisch (sortierte Schlüssel, 2 Leerzeichen, `\n` am Ende), relative Pfade mit `/`, keine Zeitstempel außer `sources.tcgdex.fetchedAt`.
- Die Referenz-DB (`.local/fixtures/*.csv`) wird nie committet; Tests, die sie lesen, überspringen sich ohne sie.
- Root-Ordner `cards/`, `sets/`, `decks/`, `cardmarket/` und das Frontend bleiben unverändert.

## Review Focus

- Ein neuer TCGdex-Commit ändert eine Karte, die schon in der Registry steht (andere localId, umbenannt) → der Registry-Eintrag bleibt, der Build meldet die Abweichung und bricht ab, statt den Schlüssel still zu ändern (Test in Task 2).
- Eine Karte existiert unter Hauptset- **und** Unterset-Schlüssel → genau eine kanonische Karte, beide Schlüssel als Aliase, keine Doppelkarte in `api/v3/cards` (Test in Task 2).
- Build ohne `sources/pokemontcg` → identische Menge `(setId, cardId)` wie mit, alle Pflichtfelder gefüllt (Test in Task 5).
- `db_collection`-Zeile mit Leerzeilen, Großschreibung (`TRUE`/`true`), führenden Nullen oder `TCGDEX-`-Präfix → wird über Aliase aufgelöst, nicht verworfen (Test in Task 5).
- Pocket-Sets kommen hinzu → bestehende Set-Paare bleiben gleich (Pair-Drift-Gate grün) (Prüfung in Task 1).
- Derselbe Kartenschlüssel bedeutet unter `TCGDEX-<id>` und unter der pt-ID unterschiedliche Karten (me55c/30th-c) → Auflösung nach Namensraum des Set-Schlüssels, nie über einen gemeinsamen Alias (Test in Task 2).

---

### Task 1: Pocket wieder aufnehmen

**Files:**
- Modify: `scripts/api/tcgdex/load-database.mjs` (Default `excludeSerieIds = []`)
- Modify: `scripts/api/sources/sync-tcgdex.mjs` (keine Pocket-Ausnahme mehr; neues CLI-Flag `--force` erzwingt Mirror trotz unverändertem Commit)
- Modify: `scripts/api/build-matching.mjs` und betroffene Tests (alle Stellen, die `['tcgp']` übergeben)
- Create (generiert): Pocket-Dateien unter `sources/tcgdex/data/Pokémon TCG Pocket*`, aktualisierte `api/v3/reports/matching.*`

**Interfaces:**
- Produces: `loadTcgdexDatabase(rootDir, { excludeSerieIds = [] })`; `runSync({ …, force = false })`

- [ ] **Step 1: Tests anpassen/ergänzen (rot)** – Loader-Test: Default lädt die `tcgp`-Fixture-Serie; `excludeSerieIds: ['tcgp']` schließt sie weiterhin aus. Sync-Test: `force: true` spiegelt trotz gleichem Commit.
- [ ] **Step 2: Implementieren, `npm test` grün**
- [ ] **Step 3: Echtlauf** – `node scripts/api/sources/sync-tcgdex.mjs --force` (gleicher TCGdex-Commit), danach `node scripts/api/build-matching.mjs --min-card-match 0.995 --fail-on-pair-drift` → Exit 0. Erwartet: zusätzliche unpaired TCGdex-Sets (Pocket), Paare unverändert 177.
- [ ] **Step 4: Commits** – Code (`feat(api): Pocket wieder in den TCGdex-Snapshot aufnehmen`), Daten separat (`chore(sources): Pocket-Serie im TCGdex-Snapshot`), Report separat.

### Task 2: Registry – kanonische Schlüssel, Aliase, Einfrieren

**Files:**
- Create: `scripts/api/registry/build-registry.mjs`, `scripts/api/registry/registry-io.mjs`
- Create: `api/mappings/subset-merge.json`, `api/mappings/canonical-keys.json`
- Test: `scripts/api/test/registry.test.mjs`

**Interfaces:**
- Consumes: `SetMatchResult` (`matchSets`), `CardMatchResult` je Paar (`matchCards`), `loadPokemontcg`, `loadTcgdexDatabase`
- Produces:
  - `buildRegistry({ ptSets, ptCardsBySet, tcgdexSets, setPairs, cardResults, subsetMerge, canonicalKeyOverrides, previous }): Registry`
  - `Registry = { sets: Record<canonicalSetId, RegistrySet>, cards: Record<canonicalSetId, Record<canonicalCardId, RegistryCard>> }`
  - `RegistrySet = { pokemontcg: string|null, tcgdex: string|null, mergedSubsets: string[], aliases: string[] }` (aliases sortiert, enthalten die eigene ID nicht)
  - `RegistryCard = { pokemontcg: string|null /* pt card id */, tcgdex: { set: string, localId: string }[], keys: { pokemontcg: string[], tcgdex: string[] }, ambiguousLegacyKey?: string }`
    - `keys.pokemontcg`: Schlüssel, unter denen die Karte bei einem **pokemontcg-Set-Schlüssel** (kanonische pt-ID oder pt-Unterset-ID) stehen kann: `normalizeCardNumber(ptNumber)`; bei Karten ohne pt-Gegenstück der kanonische Schlüssel (TCGdex-Union, so hat das Frontend sie geschrieben).
    - `keys.tcgdex`: Schlüssel bei einem **`TCGDEX-<id>`-Set-Schlüssel**: `normalizeCardNumber(localId)` jeder TCGdex-Referenz.
    - Kollidierende Nummern stehen nur in `ambiguousLegacyKey`, nicht in `keys`.
  - `assertFrozen(previous: Registry, next: Registry): void` – wirft `RegistryFrozenError` mit Liste geänderter/entfernter Einträge; neue Einträge sind erlaubt.
  - `readRegistry(dir): Registry|null`, `writeRegistry(dir, registry): void` → `api/registry/sets.json`, `api/registry/cards/<canonicalSetId>.json` (Dateiname: Set-ID unverändert, `TCGDEX-` inklusive)
  - `resolveCollectionKey(registry, setId, cardId): { setId, cardId } | null` – Set über ID/Aliase (case-insensitive). **Namensraum aus dem Set-Schlüssel:** beginnt er mit `TCGDEX-`, wird `normalizeCardNumber(cardId)` gegen `keys.tcgdex` der Karten des Sets gesucht, sonst gegen den kanonischen Schlüssel und `keys.pokemontcg`. Bei Unterset-Aliasen nur Karten aus diesem Unterset.
- `subset-merge.json`: `{ "merges": [ { "main": "swsh12pt5", "subset": "swsh12pt5gg", "reason": "…" }, … ] }` (die sechs Paare aus den Global Constraints)
- `canonical-keys.json`: `{ "zsv10pt5-80": { "key": "80", "reason": "Referenz-DB: zsv10pt5/80 abgehakt; pokemontcg-Nummer 60 ist ein Datenfehler" } }`

Regeln (Spec §5.1–5.3):
1. Set: kanonisch pt-ID, sonst `TCGDEX-<tcgdexId>`; Aliase = pt-ID, `TCGDEX-<tcgdexId>`, Unterset-IDs (pt) und deren `TCGDEX-<id>`. `mep`: pokemontcg-Karten aus `cards/en/mep.json` ohne Eintrag in `sets/en.json` zählen als pt-Set `mep`, gepaart mit TCGdex `mep`.
2. Karte: Overrides zuerst. Sonst `normalizeCardNumber(ptNumber)`; bei `tcgdex_only` `normalizeCardNumber(localId)`. Kollidieren mehrere Karten eines Sets auf denselben Schlüssel N: jede bekommt `ambiguousLegacyKey: N` und Schlüssel `normalizeCardNumber(ptId-Suffix)`, falls ≠ N und eindeutig (z. B. `15_A1`, `106p`), sonst `N_<normalizeCardNumber(tcgdexLocalId)>`.
3. Karten-Schlüssel je Namensraum wie im Interface `RegistryCard.keys` beschrieben. Begründung (Referenz-DB 2): Unter `TCGDEX-30th-c` meinen `11`, `25`, `26` die TCGdex-Karten `011`/`025`/`026`, unter `me55c` meint `11` eine andere Karte (Original-Druck-Nummer). Ein namensraumloser Alias wäre mehrdeutig.
4. Untersets: Karten des Untersets werden Karten des Hauptsets (Schlüssel wie oben, z. B. `GG1`); ein bereits existierender gleicher Schlüssel im Hauptset aus TCGdex-Union bleibt **eine** Karte mit beiden Referenzen.
5. `previous` gegeben → bestehende Einträge werden 1:1 übernommen (auch wenn die Rohdaten heute anders ableiten würden), nur fehlende ergänzt.

- [ ] **Step 1: Failing tests** (synthetische Daten): kanonische Set-IDs (pt vs. `TCGDEX-`), Aliase; Unterset-Merge `swsh12pt5gg/GG01` → `swsh12pt5`/`GG1` mit Alias-Set `swsh12pt5gg`; Kollision `15` ×4 → `15_A1…15_A4` + `ambiguousLegacyKey: '15'`; `me55c-106`/`106p`/`106m` → `106_<localId>`, `106p`, `106m`; Override `zsv10pt5-80 → 80`, `zsv10pt5-60` bleibt `60` ohne ambiguousLegacyKey; `previous` mit abweichendem Schlüssel → bleibt; `assertFrozen` wirft bei geändertem und entferntem Eintrag, nicht bei neuem; `resolveCollectionKey(reg, 'TCGDEX-me05', '001')` → `{ setId: 'me5', cardId: '1' }`; `resolveCollectionKey(reg, 'swsh12pt5gg', 'GG1')` → `{ setId: 'swsh12pt5', cardId: 'GG1' }`; Namensraum-Fall nach me55c-Muster (pt-Nummer `4` = Karte X mit TCGdex `014`, TCGdex `004` = Karte Y): `resolve('me55c','4')` → X, `resolve('TCGDEX-30th-c','4')` → Y; TCGdex-Union-Karte im gepaarten Set (`svp`/`166`) über pt-Set-Schlüssel auflösbar; Determinismus von `writeRegistry` (zweimal gleich).
- [ ] **Step 2: Run, verify fail**
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run, verify pass**
- [ ] **Step 5: Commit** – `feat(api): Registry mit eingefrorenen Sheet-Schluesseln und Aliasen`

### Task 3: Ableitungen aus TCGdex (gelernte Tabellen, Legalitäten, Bilder)

**Files:**
- Create: `scripts/api/merge/learn-tables.mjs`, `scripts/api/merge/legalities.mjs`, `scripts/api/merge/images.mjs`
- Test: `scripts/api/test/merge-derive.test.mjs`

**Interfaces:**
- Produces:
  - `learnTables(matchedPairs: { ptCard, tcgdexCard }[]): { rarity: Record<string,string>, subtypes: Record<string,string[]>, supertype: Record<string,string>, rules: Record<string,string[]> }` – Mehrheitsentscheidung je Schlüssel: `rarity[tcgdex.rarity]`, `subtypes[stage|suffix|trainerType|energyType]`, `supertype[category]`, `rules[suffix|stage|rarity]` (nur Einträge mit ≥ 3 Belegen); sortierte Ausgabe.
  - `deriveLegalities(card: { tcgdexSetId, serieId, localId, regulationMark }, legals: { standard, expanded }): { unlimited: 'Legal', standard?: 'Legal', expanded?: 'Legal' }` – Filter-Logik aus `meta/legals.ts`: enthalten, wenn Serie ∈ `includes.series` oder Set ∈ `includes.sets` oder `regulationMark` ∈ `includes.regulationMark`; ausgeschlossen über `excludes.sets` / `excludes.cards` (`<tcgdexSetId>-<localId>`). `legals.ts` wird mit `parseTcgdexModule` gelesen.
  - `resolveImages(assetsIndex, { lang, serieId, setId, localId }): { small, large } | null` – `https://assets.tcgdex.net/<lang>/<serieId>/<setId>/<localId>/low.webp` bzw. `high.webp`, nur wenn im Index vorhanden; `resolveSetImages(assetsIndex, { lang, serieId, setId }): { logo?, symbol? }` (`symbol` aus `univ`).

- [ ] **Step 1: Failing tests** – Mehrheits-Lernen inkl. Schwelle 3; `deriveLegalities` für Regulation Mark `H` (standard+expanded), Serie `swsh` ohne Mark `F` (nur expanded), Ausschlusskarte `swsh2-22` (kein expanded), Serie `base` (nur unlimited); Bild vorhanden/nicht vorhanden; Set-Logo DE fehlt → `null`-Feld weggelassen.
- [ ] **Step 2–4: fail → implement → pass**
- [ ] **Step 5: Commit** – `feat(api): Ableitungen fuer Rarity, Subtypes, Regeln, Legalitaeten und Bilder`

### Task 4: Merge zu v3-Datensätzen und Build-CLI

**Files:**
- Create: `scripts/api/merge/merge-card.mjs`, `scripts/api/merge/merge-set.mjs`, `scripts/api/build-api.mjs`
- Test: `scripts/api/test/merge-card.test.mjs`, `scripts/api/test/build-api.test.mjs`
- Create (generiert): `api/v3/meta.json`, `api/v3/sets.json`, `api/v3/cards/<canonicalSetId>.json`, `api/v3/search-index.json`, `api/registry/**`

**Interfaces:**
- Consumes: Registry (Task 2), Tabellen/Legalitäten/Bilder (Task 3), Loader und Matcher (Phase 1)
- Produces:
  - `mergeCard({ canonicalSetId, canonicalCardId, registryCard, ptCard|null, tcgdexCards: TcgdexCard[], tcgdexSet, tables, legals, assetsIndex }): V3Card` – Felder exakt nach Spec §6 (`id`, `setId`, `cardId`, `matchStatus`, pokemontcg-kompatible Oberfelder, `i18n.de`, `variants`, `ids`, `sources`); Feld-Priorität laut Spec-Tabelle §6; `legalities` immer aus `deriveLegalities`; `images` = TCGdex EN, sonst pt-Legacy-URL; `i18n.de.images` nur wenn DE-Bild existiert.
  - `mergeSet({ canonicalSetId, registrySet, ptSet|null, tcgdexSet|null, cardCount, assetsIndex, cardmarketTracker }): V3Set` – pokemontcg-kompatibel (`id`, `name`, `series`, `printedTotal`, `total`, `releaseDate`, `ptcgoCode`, `images.logo/symbol`) + `i18n.de.name`, `i18n.de.images`, `ids` (`pokemontcg`, `tcgdex`, `cardmarket`, `tcgplayer`), `aliases`. `ids.cardmarket`: TCGdex-Set-ID, sonst Fallback `cardmarket/index/tracker.json` → `bySetId[ptSetId]` (vorhandener Cardmarket-Build; Preise bleiben in Phase 2 dort).
  - `runBuild({ repoRoot, tcgdexOnly = false, outDir = 'api/v3', registryDir = 'api/registry', writeRegistry = true }): { sets: number, cards: number }` – lädt Quellen (bei `tcgdexOnly` ohne pokemontcg), matcht (Phase-1-Funktionen + Mappings), baut/prüft Registry (`assertFrozen` gegen vorhandene), merged, schreibt deterministisch (alte `api/v3/cards/*.json` ohne Registry-Set werden entfernt). Bei `tcgdexOnly` werden Registry-Einträge **gelesen, nicht geschrieben**.
  - CLI: `node scripts/api/build-api.mjs [--tcgdex-only] [--out <dir>]`; Exit 1 bei `RegistryFrozenError`, Parse-Fehlern oder Karten ohne Pflichtfelder (`id`, `name`, `number`, `images` oder Legacy-Bild).
  - `search-index.json`: `[{ setId, cardId, name, nameDe?, number }]`, sortiert.

- [ ] **Step 1: Failing tests** – `mergeCard` für gematchte Karte (EN-Text aus pt, DE aus TCGdex, Legalitäten aus TCGdex, Varianten mit Cardmarket-IDs), TCGdex-only-Karte (subtypes/rarity/rules aus gelernten Tabellen), Unterset-Karte im Hauptset; `mergeSet` für pt-Set, `TCGDEX-`-Set, Pocket-Set; `runBuild` auf Mini-Fixture (Repo-Struktur im Temp-Dir) schreibt identische Dateien bei zwei Läufen.
- [ ] **Step 2–4: fail → implement → pass**
- [ ] **Step 5: Echtlauf** – `node scripts/api/build-api.mjs` → Exit 0; zweiter Lauf → `git status` sauber; Größe von `api/v3` und Kartenzahl im Bericht festhalten.
- [ ] **Step 6: Commits** – Code (`feat(api): v3-Build mit Feldzusammenfuehrung`), generierte `api/v3/**` + `api/registry/**` separat (`chore(api): initiale v3-API und Registry`).

### Task 5: Kompatibilitäts-Suite und TCGdex-only-Test

**Files:**
- Create: `scripts/api/test/compat-collection.test.mjs`, `scripts/api/test/tcgdex-only.test.mjs`, `scripts/api/lib/csv.mjs`

**Interfaces:**
- Consumes: `readRegistry`, `resolveCollectionKey`, `runBuild`
- Produces: `parseCsv(text): string[][]` (RFC-4180, `\r\n`/`\n`, Quotes)

- [ ] **Step 1: Tests schreiben**
  - `compat-collection`: liest **jede** Datei `.local/fixtures/*db_collection.csv` als eigenen Testfall (keine Datei → `t.skip`). Für jede nicht-leere Zeile: `resolveCollectionKey` liefert genau eine Karte; erlaubt sind nur Zeilen, deren Schlüssel ein `ambiguousLegacyKey` ist (werden separat gezählt). Erwartung je DB: 0 verwaiste Zeilen; jede Zeile mit `g` oder `rh` löst auf (Referenz-DB 1: 4.074 `g`; Referenz-DB 2 „Ja hier die Tabelle im Format“: 5.108 `g` / 3.581 `rh`, inkl. `TCGDEX-30th` 142, `TCGDEX-me05` 94, `TCGDEX-30th-c` 3, `svp` 166–218, `TCGDEX-mep` 26); Zeilen, die auf dieselbe kanonische Karte fallen (Unterset + Hauptset, `TCGDEX-<id>` + pt-ID), werden gezählt und im Testlog ausgegeben.
  - Generischer Teil (immer aktiv): für jeden Registry-Eintrag lösen kanonischer Schlüssel und jeder Alias auf genau diesen Eintrag auf; kein Alias zeigt auf zwei Karten.
  - `tcgdex-only`: `runBuild({ tcgdexOnly: true, outDir: <tmp> })`. Erwartung: Menge `(setId, cardId)` == Menge des normalen Builds **minus** genau den Registry-Karten mit `pokemontcg != null` und leerer `tcgdex`-Liste (pokemontcg-only, z. B. SM-`a`-Alternativen; im Normalbetrieb liefert sie der eingefrorene Snapshot weiter). Jede gebaute Karte hat `name`, `number`, `supertype`, `legalities`, `images`. Set-IDs und Kartenschlüssel sind identisch zum normalen Build.
- [ ] **Step 2: Laufen lassen; Abweichungen in Task-2/4-Code beheben, nicht in den Tests aufweichen**
- [ ] **Step 3: Commit** – `test(api): Kompatibilitaets-Suite und TCGdex-only-Build`

### Task 6: Workflow-Integration

**Files:**
- Modify: `.github/workflows/sync-tcgdex.yml`

- [ ] **Step 1** – Nach „Regression tests against synced sources“: `node scripts/api/build-api.mjs`; Commit-Schritt nimmt `api/v3` und `api/registry` mit auf; Lauf ohne TCGdex-Änderung bleibt commit-frei (Build-Ausgabe deterministisch).
- [ ] **Step 2** – `npx --yes yaml-lint@1.7.0 .github/workflows/sync-tcgdex.yml` grün; `npm test` grün.
- [ ] **Step 3: Commit** – `ci: v3-Build im taeglichen TCGdex-Sync`
- [ ] **Step 4: Übergabe** – Branch-Abschluss mit superpowers:finishing-a-development-branch; Hinweis: Promotion nach dev/release wie in Phase 1 manuell oder über die Workflow-Kette.
