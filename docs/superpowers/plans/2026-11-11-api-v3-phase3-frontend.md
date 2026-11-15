# API v3 Phase 3: Frontend auf v3 umstellen – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der TCG Tracker Web lädt Sets und Karten ausschließlich aus der statischen API `api/v3/` und löst Sammlungszeilen über die Registry `api/registry/` auf. Bestehende Google-Sheets-Sammlungen funktionieren unverändert weiter.

**Architecture:** Drei neue, reine Datenmodule unter `frontend/tcg-tracker-web/js/data/`:
- `v3-api.js` lädt die statischen Dateien.
- `v3-collection-keys.js` löst Schlüssel auf (gleiche Semantik wie `scripts/api/registry`).
- `v3-records.js` bildet v3 auf die bestehenden internen Datensätze (`vera_*` / `tcgdex_*`) ab.

`pokemon-api.js` behält seine öffentlichen Funktionen, holt die Daten aber nur noch aus diesen Modulen. `sheets-db.js` wird alias-fähig, und die Views nutzen `collectionKey`.

**Tech Stack:** Vanilla-JS (ESM, Browser), `node:test` für Unit-Tests, vorhandene Playwright-Smoke-Tests, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-11-11-api-v3-tcgdex-monolith-design.md` (§5, §5.6, §6, §7, §7.1)

## Global Constraints

- Arbeitsbranch `feature/api-v3-phase3` von `origin/dev`. Merge nach `dev` erst nach Freigabe durch die Nutzerin. `master` wird in dieser Phase nicht verändert.
- Keine Laufzeit-Aufrufe an `api.pokemontcg.io` oder `api.tcgdex.net`. Nach Abschluss findet `grep -rn "api.pokemontcg.io\|api.tcgdex.net" frontend/tcg-tracker-web/js` nichts mehr.
- Datenbasis: `api/v3/` und `api/registry/`, relativ zur App geladen: `new URL('../../api/v3/', location.href)` ab `frontend/tcg-tracker-web/`. Überschreibbar über `CONFIG.APIS.V3_BASE` und `CONFIG.APIS.REGISTRY_BASE`.
- Sammlungslogik:
  - Lesen über alle Set-Aliase, Kartenschlüssel im Namensraum des Set-Schlüssels (`TCGDEX-<id>` → TCGdex-localId, sonst pokemontcg-Nummer bzw. kanonischer Schlüssel).
  - Schreiben in **alle** bestehenden Zeilen einer Karte.
  - Neue Zeilen unter kanonischer Set-ID mit `collectionKey`.
  - In den Sheets wird nichts umbenannt oder gelöscht.
- `collectionKey` (= v3 `cardId`) ist der einzige Sammlungsschlüssel im Frontend. Internes `cardId` = v3 `id`.
- Spaltensemantik: `vera_*` = EN (v3-Oberfelder), `tcgdex_*` = DE (`i18n.de`, nur echte DE-Werte). Die Resolver-Matrix bleibt die Quelle der Anzeige-Priorität.
- `db_cards`-Schreiben bleibt aktiv, gekapselt hinter `CONFIG.WRITE_DB_CARDS = true`.
- Bei geänderten Modulen `version.config.json` → `appVersion` erhöhen und `npm run version:sync` ausführen; neue Module in `service-worker.js` aufnehmen, falls die Asset-Liste Module führt.
- Die Referenz-DBs (`.local/fixtures/*db_collection.csv`) werden nie committet. Tests, die sie lesen, überspringen sich ohne sie.

## Review Focus

- Eine Zeile `TCGDEX-30th-c`/`11` und eine Zeile `me55c`/`11` → zwei **verschiedene** Karten (Namensraum). Test in Task 2.
- Die GG-Karte unter `swsh12pt5`/`GG1` und unter `swsh12pt5gg`/`GG1` → eine Karte. Ein Haken-Klick schreibt beide Zeilen, Abwählen bleibt nicht durch die zweite Zeile „hängen“. Test in Task 5.
- `cel25c`/`15` (mehrdeutig) → kein Haken wird einer falschen Karte zugeordnet; die Migration läuft nach §5.3. Test in Task 7.
- Ein Set ohne v3-Daten (z. B. alte Overview-Zeile eines Untersets wie `swsh12pt5gg`) → wird nicht als eigenes Set angezeigt, sein `imported`-Status überträgt sich aufs Hauptset. Test in Task 6.
- Offline bzw. `api/v3` nicht erreichbar → verständliche Fehlermeldung, `db_cards` als Fallback für bereits importierte Sets, keine leeren Sammlungen. Test in Task 4.

---

### Task 1: v3-Datenclient

**Files:**
- Create: `frontend/tcg-tracker-web/js/data/v3-api.js`
- Modify: `frontend/tcg-tracker-web/js/core/config.js` (`APIS.V3_BASE`, `APIS.REGISTRY_BASE` optional, `WRITE_DB_CARDS: true`)
- Test: `frontend/tcg-tracker-web/tests/v3-api.test.mjs`

**Interfaces:**
- Produces:
  - `resolveV3Bases({ href = globalThis.location?.href, config = CONFIG } = {}): { v3: string, registry: string }` (absolute URLs mit `/` am Ende)
  - `loadV3Sets({ signal, fetchImpl } = {}): Promise<V3Set[]>`
  - `loadV3Cards(setId, { signal, fetchImpl } = {}): Promise<V3Card[]>`
  - `loadV3SearchIndex(…)`, `loadV3Meta(…)`
  - `loadRegistrySets(…): Promise<Record<string, RegistrySet>>`
  - `loadRegistryCards(setId, …): Promise<Record<string, RegistryCard>>`
  - `resetV3Caches(): void`
  - Pro URL ein Promise im Speicher-Cache (Session). Fehlgeschlagene Requests werden nicht gecacht. HTTP-Fehler → `Error` mit Status und URL.

- [ ] **Step 1: Failing tests**
  - Basis-URL aus `https://x.github.io/pokemon-tcg-data/frontend/tcg-tracker-web/#dashboard` → `…/pokemon-tcg-data/api/v3/`.
  - Gleiches unter `/dev/frontend/…` → `…/dev/api/v3/`.
  - Override per Config.
  - Gestubbtes `fetchImpl`: Caching (ein Aufruf bei zwei Loads), kein Caching nach Fehler.
  - Set-IDs mit `.` und `TCGDEX-` werden URL-kodiert (`TCGDEX-sv03.5` → Dateiname unverändert, `encodeURIComponent`).
- [ ] **Step 2–4: fail → implement → pass** (`node --test tests/v3-api.test.mjs`)
- [ ] **Step 5: Commit** – `feat(frontend): v3-Datenclient fuer api/v3 und Registry`

### Task 2: Schlüssel-Auflösung im Browser + Paritätstest

**Files:**
- Create: `frontend/tcg-tracker-web/js/data/v3-collection-keys.js`
- Test: `frontend/tcg-tracker-web/tests/v3-collection-keys.test.mjs`, `frontend/tcg-tracker-web/tests/v3-collection-keys-parity.test.mjs`

**Interfaces:**
- Consumes: `loadRegistrySets`, `loadRegistryCards` (Task 1); `normalizeCardNumber` aus `js/core/utils.js`
- Produces:
  - `createCollectionKeyResolver(registrySets, cardsBySet)`. Die Karten pro Set werden nachgeladen (`cardsBySet: Map<setId, Record<cardKey, RegistryCard>>`). Rückgabe:
    - `resolveSetKey(setKey) → canonicalSetId | null`
    - `resolve(setKey, cardKey) → { setId, collectionKey } | null`
    - `ambiguous(setKey, cardKey) → { setId, legacyKey, collectionKeys: string[] } | null`
    - `aliasesOf(canonicalSetId) → string[]` (inkl. eigener ID)
  - Semantik **identisch** zu `resolveCollectionKey` / `findAmbiguousKey` aus `scripts/api/registry/build-registry.mjs`: Namensraum aus dem Set-Schlüssel, Unterset-Aliase nur mit Karten aus dem Unterset, case-insensitiv mit exakter Priorität, mehrdeutig → `null`.

- [ ] **Step 1: Failing unit tests** auf synthetischer Mini-Registry:
  - `me55c`/`4` vs. `TCGDEX-30th-c`/`4` → verschiedene Karten.
  - `swsh12pt5gg`/`GG1` → `swsh12pt5`/`GG1`.
  - `TCGDEX-me05`/`001` → `me5`/`1`.
  - `cel25c`/`15` → `ambiguous` liefert vier Schlüssel.
  - Groß-/Kleinschreibung bei Set-Aliasen.
- [ ] **Step 2: Paritätstest** (Node, liest die echten Dateien `api/registry/**` des Branches und importiert `../../../scripts/api/registry/build-registry.mjs`):
  - Für **jede** Kombination aus Set-ID bzw. Alias × (kanonischer Schlüssel ∪ `keys.pokemontcg` ∪ `keys.tcgdex` ∪ `ambiguousLegacyKey`) liefern beide Implementierungen dasselbe.
  - Dazu jede Zeile jeder `.local/fixtures/*db_collection.csv` (ohne Fixtures → `t.skip`).
- [ ] **Step 3–4: implement → pass**
- [ ] **Step 5: Commit** – `feat(frontend): Sammlungsschluessel-Aufloesung ueber Registry-Aliase`

### Task 3: Abbildung v3 → interne Datensätze

**Files:**
- Create: `frontend/tcg-tracker-web/js/data/v3-records.js`
- Test: `frontend/tcg-tracker-web/tests/v3-records.test.mjs`

**Interfaces:**
- Consumes: v3-Karten und -Sets (Schema Spec §6); `buildCardmarketProductUrl` aus `js/data/cardmarket-data.js`
- Produces:
  - `toSetRecord(v3Set, { imported = false } = {}): SetRecord` – exakt die Felder von `buildSetRecordFromSources` (`schema-contract.js`):
    - `setId` = v3 `id`
    - `vera_*` aus den Oberfeldern (EN)
    - `tcgdex_*` aus `i18n.de` (Name, Logo) und `ids.tcgdex`
    - `matchStatus` aus `ids.pokemontcg` / `ids.tcgdex`
    - `isTcgdexOnly` = `id.startsWith('TCGDEX-')`
  - `toCardRecord(v3Card, v3Set): CardRecord` – exakt die Felder von `buildCardRecordFromSources`, zusätzlich `collectionKey` (= v3 `cardId`) und `number` (= v3 `number`):
    - `cardId` = v3 `id`
    - `vera_*` aus den Oberfeldern; `vera_cardmarket_url` aus `variants[0].cardmarketId` via `buildCardmarketProductUrl`, sonst leer
    - `tcgdex_name` / `tcgdex_image_*` / `tcgdex_evolvesFrom` / `tcgdex_description` aus `i18n.de`, nur echte DE-Werte, sonst leer
    - `tcgdex_localId` aus `ids.tcgdex` (Teil nach dem letzten `-`, URL-dekodiert)
    - `matchStatus` aus v3

- [ ] **Step 1: Failing tests** mit echten Beispielkarten aus `api/v3/cards/` (im Test aus dem Branch gelesen):
  - `sv3pt5-6`: matched, DE-Name `Glurak-ex`.
  - `svp`-Karte `166`: tcgdex_only.
  - Eine `swsh12pt5`-GG-Karte.
  - `cel25c` `15_A1`: `collectionKey` `15_A1`, `number` `15`.
  - `TCGDEX-A1` Karte `1`: Pocket.
  - Eine Karte ohne Oberfeld-`images`, aber mit `i18n.de.images`: `vera_images_*` leer, `tcgdex_image_*` gesetzt.
  - Danach `resolveDisplayCard(toCardRecord(…))` → Name/Bild nach Matrix (DE bevorzugt).
- [ ] **Step 2–4: fail → implement → pass**
- [ ] **Step 5: Commit** – `feat(frontend): v3-Datensaetze auf bestehende Record-Felder abbilden`

### Task 4: `pokemon-api.js` auf v3 umstellen, Laufzeit-APIs entfernen

**Files:**
- Modify: `frontend/tcg-tracker-web/js/data/pokemon-api.js` (öffentliche Signaturen beibehalten)
- Modify: `frontend/tcg-tracker-web/js/core/config.js` (entfernen: `APIS.POKEMONTCG`, `APIS.TCGDEX_DE`, `APIS.TCGDEX_EN`, `USE_VERA_API`, `VERA_API_LANGUAGE`, `CUSTOM_SET_ID_MAPPINGS`)
- Modify/Delete: `frontend/tcg-tracker-web/js/pokecode-compat.js`. Nicht mehr benötigte Funktionen entfernen. Was `features/collection/legacy-import.js` braucht (`normalizeSetId`, `buildSetIdAliasCandidates`), wird auf Registry-Aliase umgestellt oder in ein kleines Hilfsmodul verschoben.
- Modify: Aufrufer von `runPokecodeParityCheck` (Data-Quality/Health-UI) → Funktion und UI-Eintrag entfernen
- Test: `frontend/tcg-tracker-web/tests/pokemon-api-v3.test.mjs`; betroffene bestehende Tests anpassen

**Interfaces:**
- Produces (unverändert benannt):
  - `fetchAllAvailableSets(): Promise<DisplaySet[]>`
    - Alle v3-Sets via `toSetRecord` → `resolveDisplaySet`.
    - Gleiche Sortierung wie heute (TCGdex-only zuletzt, dann Datum absteigend).
    - Sets, die Alias eines anderen Sets sind, erscheinen nicht.
  - `fetchMergedCardsWithSetMeta(setId, { signal }): Promise<{ cards: DisplayCard[], setMetaPatch }>`
    - `setId` darf ein Alias sein (über den Resolver auf kanonisch abbilden).
    - Karten via `toCardRecord` → `resolveDisplayCard`; jede Karte trägt `collectionKey`.
    - `setMetaPatch` aus `toSetRecord`.
    - Sortierung `naturalSort` nach `number`, bei Gleichstand nach `collectionKey`.
  - `fetchMergedCards(setId)` → `.cards`
  - Fehlerfall (v3 nicht erreichbar): Fehler mit klarer Meldung „Kartendaten (api/v3) nicht erreichbar“. Aufrufer mit `readDbCardsForSet`-Fallback behalten ihn.

- [ ] **Step 1: Failing tests** mit gestubbtem v3-Client:
  - Alias-Set-ID `TCGDEX-me05` lädt `me5`.
  - `collectionKey` vorhanden.
  - Alias-Sets fehlen in `fetchAllAvailableSets`.
  - Fehlermeldung bei 404.
  - `grep`-Test: keine `api.pokemontcg.io` / `api.tcgdex.net` in `js/**`.
- [ ] **Step 2–4: fail → implement → pass**; alle bestehenden Frontend-Unit-Tests (`node --test tests/*.test.mjs`) grün.
- [ ] **Step 5: Commit** – `refactor(frontend): Karten- und Setdaten nur noch aus api/v3`

### Task 5: Alias-fähige Sammlung in `sheets-db.js`

**Files:**
- Modify: `frontend/tcg-tracker-web/js/data/sheets-db.js` (`readSetCollectionMap`, `ensureCollectionEntry`, `writeDbCollectionForSet`, `importSetIntoCollection`, `writeDbCardsForSet`, `upsertDbSet`)
- Test: `frontend/tcg-tracker-web/tests/collection-aliases.test.mjs` (gestubbte Sheets-Zeilen)

**Interfaces:**
- Consumes: Resolver (Task 2), `toCardRecord` (Task 3)
- Produces:
  - `readSetCollectionMap(setSheetName, { setId, resolver })`
    - Rückgabe: `Map<collectionKey, { displayId, g, rh, cells: { gCell, rhCell }[], gCell, rhCell, ambiguous?: { legacyKey, collectionKeys } }>`
    - Berücksichtigt Zeilen unter **allen** Aliasen des kanonischen Sets.
    - `g` = ODER über alle Zeilen der Karte, `rh` = ODER && `g`.
    - `gCell`/`rhCell` = erste Zelle (Kompatibilität).
    - Mehrdeutige Zeilen werden nicht zugeordnet, sondern unter `ambiguous` je betroffener Karte vermerkt (für Task 7).
  - `ensureCollectionEntry(setSheetName, collectionKey, { setId, resolver })` – existiert eine Zeile (über Aliase), wird sie zurückgegeben (mit `cells`); sonst neue Zeile `[canonicalSetId, collectionKey, false, false, now]`.
  - Schreibpfad: Alle Aufrufer, die heute `gCell`/`rhCell` an `updateCellBoolean(s)` übergeben, schreiben künftig alle `cells` einer Karte (Hilfsfunktion `cellsForUpdate(entry, field, value)` in `sheets-db.js` exportieren).
  - `writeDbCollectionForSet(setId, cards, existingMap)` schreibt Zeilen für `card.collectionKey`. Zeilen unter Alias-Set-IDs bleiben unangetastet. `clearMissing` gilt nur für Zeilen unter der kanonischen Set-ID.
  - `writeDbCardsForSet` / `upsertDbSet` nur wenn `CONFIG.WRITE_DB_CARDS`; Datensätze aus `toCardRecord` / `toSetRecord`.

- [ ] **Step 1: Failing tests:**
  - Zeilen `TCGDEX-me05`/`1` (g) und `me5`/`1` (nicht g) → Karte `1` g = true, zwei Zellen.
  - `swsh12pt5`/`GG1` + `swsh12pt5gg`/`GG1` → eine Karte, zwei Zellen.
  - `cellsForUpdate` liefert beide.
  - `TCGDEX-30th-c`/`11` und `me55c`/`11` landen bei verschiedenen Karten.
  - `cel25c`/`15` → `ambiguous`.
  - Neue Karte → Zeile unter kanonischer ID.
  - `writeDbCollectionForSet` löscht keine Alias-Zeilen.
  - `WRITE_DB_CARDS=false` → kein `db_cards`-Write.
- [ ] **Step 2–4: fail → implement → pass**
- [ ] **Step 5: Commit** – `feat(frontend): Sammlung liest und schreibt ueber Registry-Aliase`

### Task 6: Aufrufer auf `collectionKey` umstellen, Alias-Sets in der Übersicht

**Files:**
- Modify: `frontend/tcg-tracker-web/js/views/set-view-controller.js`, `js/app.js` und alle weiteren Stellen, die die Sammlung per `normalizeCardNumber(card.number)` abfragen. Inventur per `grep -rn "dbMap.get\|normalizeCardNumber(card.number)\|readSetCollectionMap\|ensureCollectionEntry" js`, vollständige Liste in den Report.
- Modify: `js/data/sheets-db.js` `listSetsOverviewData` / `syncOverviewWithApiSets`: Overview-Zeilen, deren Set-ID ein Alias ist (z. B. `swsh12pt5gg`, `TCGDEX-me05`), werden in der UI dem kanonischen Set zugeordnet (`imported` per ODER). In der Overview-Tabelle wird nichts gelöscht.
- Modify: Suche (`features/search/orchestration.js`, `result-actions.js`) liest Karten aus v3 (`fetchMergedCardsWithSetMeta`), `readDbCardsForSet` nur als Offline-Fallback.
- Test: bestehende Smoke-/Regressionstests anpassen; neuer Unit-Test für die Overview-Zuordnung

- [ ] **Step 1** – Inventur aller Stellen (Liste im Report).
- [ ] **Step 2** – Umstellen. Kartenklick, Bulk-Edit, Statistik, Dashboard-Zähler, „fehlende Karten“-Filter und Suche nutzen `card.collectionKey`. Schreiben über `cellsForUpdate`.
- [ ] **Step 3** – Tests:
  - Unit: Overview-Zuordnung (`swsh12pt5gg` imported → `swsh12pt5` imported, `swsh12pt5gg` nicht gelistet).
  - Alle Frontend-Unit-Tests grün.
  - Smoke-Tests, soweit lokal lauffähig (`npm run test:smoke`), Ergebnis im Report.
- [ ] **Step 4: Commit** – `refactor(frontend): Sammlung ueber collectionKey, Alias-Sets in Uebersicht zusammengefuehrt`

### Task 7: Migrationsdialog für mehrdeutige Altschlüssel (Spec §5.3)

**Files:**
- Create: `frontend/tcg-tracker-web/js/features/collection/ambiguous-key-migration.js`
- Modify: Set-Ansicht (Hinweis und Dialog-Trigger)
- Test: `frontend/tcg-tracker-web/tests/ambiguous-key-migration.test.mjs`

**Interfaces:**
- Produces: `planAmbiguousMigration(ambiguousEntries): { silent: Row[], needsDialog: { legacyKey, row, candidates: Card[] }[] }`; `applyAmbiguousMigration(plan, choices, { sheets })`

- [ ] **Step 1: Failing tests:**
  - Zeile ohne Haken → stille Umschreibung auf alle Kandidaten-Schlüssel (neue Zeilen `false`), alte Zeile bleibt (Spec 7.1: nichts löschen).
  - Zeile mit Haken → Dialog-Eintrag. Nach Auswahl bekommen die gewählten Karten neue Zeilen mit dem Haken, die alte Zeile wird auf `false` gesetzt.
  - Vor jeder Migration wird ein Snapshot angelegt (vorhandenes `features/collection/versioning.js`).
- [ ] **Step 2–4: fail → implement → pass**; Dialog mit Kartenbildern, Mehrfachauswahl, „Später“-Option (Zeile bleibt, Karten zeigen den gemeinsamen Status).
- [ ] **Step 5: Commit** – `feat(frontend): Migrationsdialog fuer mehrdeutige Altschluessel`

### Task 8: Sprachwahl DE/EN

**Files:**
- Modify: `js/data/schema-contract.js` (Resolver-Matrix: Reihenfolge `tcgdex`/`vera` abhängig von der Sprachwahl für Name, Bilder, Texte; Standard DE wie heute)
- Modify: Einstellungen (`features/settings/settings-controller.js`, UI) – Auswahl „Kartensprache: Deutsch (Standard) / Englisch“, gespeichert in den WebApp-Settings
- Test: `tests/language-preference.test.mjs`

- [ ] **Step 1: Failing tests** – Standard DE → `tcgdex` zuerst; EN → `vera` zuerst; fehlender Wert fällt auf die jeweils andere Sprache zurück.
- [ ] **Step 2–4: fail → implement → pass**
- [ ] **Step 5: Commit** – `feat(frontend): Kartensprache waehlbar (DE/EN)`

### Task 9: Gesamtprüfung und Versions-Bump

- [ ] **Step 1** – `appVersion` in `version.config.json` erhöhen (Format wie bisher, z. B. `20261111-api-v3`), `npm run version:sync`, Service-Worker-Assets prüfen.
- [ ] **Step 2** – Alle Frontend-Unit-Tests, `scripts/api`-Tests, `grep` auf Fremd-APIs, lokaler Start `npm run start:dev:full` + `test:smoke` (soweit ohne Google-Login möglich). Ergebnis im Report.
- [ ] **Step 3: Commit** – `chore(frontend): Version fuer API-v3-Umstellung`
- [ ] **Step 4: Übergabe an die Nutzerin** – Branch-Abschluss mit superpowers:finishing-a-development-branch. Vor dem Merge testet die Nutzerin in der `/dev`-Vorschau mit **Kopien** ihrer beiden Referenz-Sheets. Checkliste:
  - Haken sichtbar wie vorher (inkl. `TCGDEX-30th`, `TCGDEX-me05`, GG-Karten).
  - Haken setzen und entfernen.
  - Neues Set importieren.
  - Migrationsdialog bei `cel25c`.
  - Sprachwahl.
