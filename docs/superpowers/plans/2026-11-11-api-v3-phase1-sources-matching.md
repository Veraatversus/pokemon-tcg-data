# API v3 Phase 1: Quellen-Snapshots, TCGdex-Parser und Matching – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** pokemontcg einfrieren, TCGdex täglich als Rohdaten-Snapshot ins Repo holen, sicher parsen und pokemontcg↔TCGdex auf Set- und Kartenebene möglichst vollständig und korrekt matchen, mit einem reviewbaren Matching-Report.

**Architecture:** Alle neuen Skripte liegen unter `scripts/api/` (ESM, Node-Testrunner). Rohdaten liegen in `sources/`, manuell gepflegte Zuordnungen in `api/mappings/`, Reports in `api/v3/reports/`. Die TCGdex-TS-Dateien werden nie ausgeführt: Typen per `module.stripTypeScriptTypes` entfernen, dann mit `acorn` parsen und nur Literal-Knoten auswerten.

**Tech Stack:** Node.js 24, `node:test`, `acorn@8.14.0` (einzige Abhängigkeit), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-11-api-v3-tcgdex-monolith-design.md` (§2, §3, §4.2–4.4, §9, §10)

## Global Constraints

- Arbeitsbranch `feature/api-v3-phase1` von `origin/master`; Merge nach `master` erst nach Freigabe durch die Nutzerin. Spec und Plan liegen auf `dev` (`master` hat kein `docs/`); Doku-Änderungen immer dort.
- Die Root-Ordner `cards/`, `sets/`, `decks/`, `cardmarket/` und das Frontend werden in Phase 1 **nicht** verändert.
- TCGdex-Code wird nie ausgeführt (kein `import`/`eval` von Dateien aus `sources/tcgdex`).
- Ausgeschlossen: TCGdex-Serie `tcgp` (Pocket) und das gesamte `data-asia`.
- Sprachen: Snapshot enthält die TS-Dateien unverändert; der Assets-Index wird auf `en`, `de`, `univ` reduziert.
- `sources/pokemontcg/` = eingefrorener Stand von Root-`cards/en`, `sets/en.json`, `decks/en` zum Commit `bc4a5871a` (= Tag `pre-api-v3-master`); kein eigener Julien-Ordner (Abweichung von Spec §3.1, in Task 4 in der Spec nachgezogen).
- Kartenschlüssel = exakt `normalizeCardNumber` aus `frontend/tcg-tracker-web/js/core/utils.js` (Spec §5.1).
- Matching-Status-Werte: `matched` | `primary_only` | `tcgdex_only`.
- Abnahme Phase 1 (Spec §8): ≥ 99,5 % der pokemontcg-Karten gematcht, 0 falsche Set-Paare (Sichtprüfung der Paarliste durch die Nutzerin).
- Workflows: Node 24; Trigger greifen erst auf `release` (Default-Branch), die bestehende Promotion übernimmt `.github/workflows` von `master`.

## Review Focus

- Unbekannte Syntax in einer TCGdex-Datei (Spread, Funktionsaufruf, neues TS-Konstrukt) → Build bricht mit Dateipfad ab, statt eine Karte stillschweigend zu verlieren (Test in Task 2).
- TCGdex-Clone schlägt fehl oder liefert leeren `data/`-Ordner → `sources/tcgdex/` bleibt unverändert, Lauf endet mit Fehler (Test in Task 4).
- Zwei pokemontcg-Sets beanspruchen dasselbe TCGdex-Set (`swsh45`/`swsh45sv`) → Zuordnung bleibt 1:1, der schwächere Kandidat landet in `rejected` (Test in Task 5).
- Doppelte Kartennummern auf pokemontcg-Seite (`cel25c` `15` ×4) → alle Karten bleiben einzeln im Ergebnis, nichts wird zusammengefasst (Test in Task 6).
- Ordnernamen mit Apostroph/Umlaut („McDonald's Collection“, „Pokémon TCG Pocket“) → Ausschluss und Zuordnung laufen über Serien-/Set-IDs aus dem Dateiinhalt, nie über Ordnernamen (Test in Task 3).

---

### Task 1: Gerüst und Schlüssel-Helfer

**Files:**
- Create: `scripts/api/package.json`, `scripts/api/package-lock.json` (via `npm install`)
- Create: `scripts/api/lib/card-key.mjs`, `scripts/api/lib/set-id.mjs`, `scripts/api/lib/names.mjs`
- Test: `scripts/api/test/lib.test.mjs`
- Modify: `.gitignore` (`scripts/api/node_modules/`)

**Interfaces:**
- Produces:
  - `normalizeCardNumber(value: string|number|null): string` – identisch zur Frontend-Funktion
  - `cardMatchKey(value): string` – `normalizeCardNumber(value).toLowerCase()`
  - `setIdCandidates(pokemontcgSetId: string): string[]` – normalisierte Kandidaten
  - `normalizeTcgdexSetId(id: string): string`
  - `normalizeName(value: string): string`, `namesSimilar(a: string, b: string): boolean`

`package.json`: `{"name":"tcg-api-build","private":true,"type":"module","engines":{"node":">=24"},"scripts":{"test":"node --test test/"},"dependencies":{"acorn":"8.14.0"}}`

- [ ] **Step 1: Write the failing tests**

```js
// Parität zum Frontend (Schlüsselvertrag)
test('normalizeCardNumber == Frontend für alle pokemontcg-Nummern', async () => {
  const { normalizeCardNumber: fe } = await import('../../../frontend/tcg-tracker-web/js/core/utils.js');
  for (const n of allPokemontcgNumbersFromRoot()) assert.equal(normalizeCardNumber(n), fe(n), n);
});
test('cardMatchKey', () => {
  assert.equal(cardMatchKey('006'), '6'); assert.equal(cardMatchKey('H01'), 'h1');
  assert.equal(cardMatchKey('TG01'), cardMatchKey('tg1')); assert.equal(cardMatchKey('SV001'), 'sv1');
  assert.equal(cardMatchKey('50a'), '50a');
});
test('setIdCandidates', () => {
  assert.ok(setIdCandidates('sv3pt5').includes(normalizeTcgdexSetId('sv03.5')));
  assert.ok(setIdCandidates('swsh45sv').includes(normalizeTcgdexSetId('swsh4.5sv')));
  assert.ok(setIdCandidates('sm35').includes(normalizeTcgdexSetId('sm3.5')));
  assert.ok(setIdCandidates('cel25').includes(normalizeTcgdexSetId('cel25')));
  assert.ok(setIdCandidates('sv1').includes(normalizeTcgdexSetId('sv01')));
});
test('namesSimilar', () => {
  assert.ok(namesSimilar('Charizard ex', 'Charizard-ex'));
  assert.ok(namesSimilar('Pokémon Center', 'Pokemon Center'));
  assert.ok(!namesSimilar('Venusaur', 'Claydol'));
});
```

`allPokemontcgNumbersFromRoot()` liest `cards/en/*.json` des Repos (Test-Helfer in derselben Datei).

- [ ] **Step 2: Run tests, verify they fail** – `cd scripts/api && npm install && npm test` → FAIL (Module fehlen)
- [ ] **Step 3: Implement**
  - `normalizeCardNumber`: wortgleich zur Frontend-Funktion (Kopie mit Kommentar „Schlüsselvertrag, Parität per Test“).
  - `normalizeTcgdexSetId`: lowercase, `pt`→`.`, führende Nullen jeder Zifferngruppe entfernen (`sv03.5`→`sv3.5`).
  - `setIdCandidates`: `normalizeTcgdexSetId(raw)` plus Variante, in der eine zweistellige Zahl mit Endziffer 5 als `X.5` gelesen wird (`swsh45sv`→`swsh4.5sv`, `sm35`→`sm3.5`), ohne Duplikate. Mehrdeutigkeit (`cel25`) wird später durch die Plausibilitätsprüfung aufgelöst.
  - `normalizeName`: NFKD, Diakritika entfernen, lowercase, alles außer `[a-z0-9]` entfernen. `namesSimilar`: gleich oder einer enthält den anderen bei Länge ≥ 4.
- [ ] **Step 4: Run tests, verify they pass** – `npm test` → alle PASS
- [ ] **Step 5: Commit** – `feat(api): Geruest scripts/api mit Schluessel- und Namens-Helfern`

### Task 2: Sicherer TCGdex-Modul-Parser

**Files:**
- Create: `scripts/api/tcgdex/parse-module.mjs`
- Test: `scripts/api/test/parse-module.test.mjs`

**Interfaces:**
- Consumes: `acorn`
- Produces: `parseTcgdexModule(source: string, filePath: string): { imports: Record<string,string>, exports: Record<string, unknown> }`
  - `imports`: lokaler Name → Specifier (nur Default- und Named-Imports)
  - `exports`: `default` und benannte `export const` → ausgewerteter Wert
  - Bezeichner, die auf einen Import zeigen, werden zu `{ $import: '<specifier>' }`; Bezeichner auf lokale `const` werden aufgelöst.
  - Fehler: `TcgdexParseError` (Klasse, exportiert) mit `filePath` und Knotentyp in der Message.

- [ ] **Step 1: Write the failing tests** (Quelltexte inline als Strings)

```js
test('Karte mit Apostroph, Arrays, negativer Zahl, Template ohne Ausdruck', () => {
  const src = `import { Card } from "../../../interfaces"\nimport Set from "../151"\nconst card: Card = { set: Set, name: { en: "McDonald's", de: \`Glurak\` }, hp: 330, x: -1, types: ["Fire"], variants: [{ type: 'holo', thirdParty: { cardmarket: 733601 } }] }\nexport default card`;
  const { imports, exports } = parseTcgdexModule(src, 'x.ts');
  assert.equal(imports.Set, '../151');
  assert.deepEqual(exports.default.set, { $import: '../151' });
  assert.equal(exports.default.name.en, "McDonald's");
  assert.equal(exports.default.name.de, 'Glurak');
  assert.equal(exports.default.x, -1);
  assert.equal(exports.default.variants[0].thirdParty.cardmarket, 733601);
});
test('benannter Export (legals.ts-Form)', () => {
  const { exports } = parseTcgdexModule(`import { Filter } from '../interfaces'\nexport const standard: Filter = { includes: { regulationMark: ['H','I'] } }`, 'legals.ts');
  assert.deepEqual(exports.standard.includes.regulationMark, ['H', 'I']);
});
for (const bad of ['{ ...other }', '{ a: foo() }', '{ a: `x${y}` }', '{ a: b + 1 }']) {
  test(`lehnt ab: ${bad}`, () => assert.throws(() => parseTcgdexModule(`const c = ${bad}\nexport default c`, 'bad.ts'), (e) => e instanceof TcgdexParseError && e.message.includes('bad.ts')));
}
```

- [ ] **Step 2: Run, verify fail** – `npm test` → FAIL
- [ ] **Step 3: Implement** – `stripTypeScriptTypes(source, { mode: 'strip' })` aus `node:module`, danach `acorn.parse(…, { ecmaVersion: 'latest', sourceType: 'module' })`. Erlaubte Knoten: `ObjectExpression` (Property key Identifier/Literal, auch shorthand), `ArrayExpression`, `Literal`, `TemplateLiteral` ohne Ausdrücke, `UnaryExpression` `-`/`+` auf Zahl, `Identifier` (Import-Ref oder lokale `const`). Alles andere → `TcgdexParseError`. Die ExperimentalWarning von `stripTypeScriptTypes` ist harmlos und wird nicht unterdrückt.
- [ ] **Step 4: Run, verify pass** – `npm test` → PASS
- [ ] **Step 5: Commit** – `feat(api): sicherer TCGdex-Parser ohne Code-Ausfuehrung`

### Task 3: TCGdex-Datenbank-Loader und pokemontcg-Loader

**Files:**
- Create: `scripts/api/tcgdex/load-database.mjs`, `scripts/api/sources/load-pokemontcg.mjs`
- Create: Fixture-Baum `scripts/api/test/fixtures/tcgdex/data/…` (siehe Step 1)
- Test: `scripts/api/test/load-database.test.mjs`

**Interfaces:**
- Consumes: `parseTcgdexModule` (Task 2)
- Produces:
  - `loadTcgdexDatabase(rootDir: string, { excludeSerieIds = ['tcgp'] } = {}): { sets: TcgdexSet[], errors: {file: string, message: string}[] }`
  - `TcgdexSet = { id, serieId, serieName: {en,de}, name: {en,de}, abbreviationOfficial: string|null, cardCountOfficial: number|null, releaseDate: string|null, cardmarketId: number|null, tcgplayerId: number|null, cards: TcgdexCard[] }`
  - `TcgdexCard = { localId: string, ...alle Felder der Kartendatei außer set }`, `cards` sortiert mit `sortLocalIds` aus `scripts/cardmarket/tcgdex-helper/generate-tcgdex-helpers.mjs` (wiederverwenden, nicht kopieren).
  - `loadPokemontcg(dir: string): { sets: PtSet[], cardsBySet: Map<string, PtCard[]> }` – liest `sets/en.json` und `cards/en/<id>.json` (Rohformat unverändert).

- [ ] **Step 1: Write the failing tests** – Fixture: Serie `Mega Evolution.ts` (`id: "me"`) mit Set `Pitch Black.ts` (`id: "me05"`, `cardCount: { official: 2 }`, `thirdParty: { cardmarket: 1 }`) und Karten `001.ts`, `002.ts`; Serie `McDonald's Collection.ts` (`id: "mc"`) mit einem Set; Serie `Pokémon TCG Pocket.ts` (`id: "tcgp"`) mit einem Set; eine kaputte Karte `999.ts` mit `foo()`.

```js
const { sets, errors } = loadTcgdexDatabase(FIXTURE);
assert.deepEqual(sets.map((s) => s.id).sort(), ['2011bw', 'me05']);   // tcgp ausgeschlossen
const me05 = sets.find((s) => s.id === 'me05');
assert.equal(me05.serieId, 'me'); assert.equal(me05.cardmarketId, 1);
assert.deepEqual(me05.cards.map((c) => c.localId), ['001', '002']);
assert.equal(errors.length, 1); assert.match(errors[0].file, /999\.ts$/);
```

- [ ] **Step 2: Run, verify fail**
- [ ] **Step 3: Implement** – Serien = `data/<X>.ts` + Ordner `data/<X>/`; Sets = `data/<X>/<Y>.ts`; Karten = `data/<X>/<Y>/<localId>.ts`. Serien-ID aus dem Dateiinhalt; Ausschluss vor dem Laden der Sets. Parse-Fehler sammeln, nicht abbrechen (der Aufrufer entscheidet). `releaseDate`: String direkt, bei Sprach-Objekt `en`.
- [ ] **Step 4: Run, verify pass**
- [ ] **Step 5: Commit** – `feat(api): Loader fuer TCGdex-Datenbank und pokemontcg-Snapshot`

### Task 4: Quellen-Snapshots und TCGdex-Sync

**Files:**
- Create: `scripts/api/sources/freeze-pokemontcg.mjs` (einmaliger CLI-Lauf)
- Create: `scripts/api/sources/sync-tcgdex.mjs` (CLI + exportierte Funktionen)
- Create: `scripts/api/sources/manifest.mjs`
- Test: `scripts/api/test/sync-tcgdex.test.mjs`
- Create (generiert, committet): `sources/pokemontcg/**`, `sources/tcgdex/**`, `sources/SOURCES.json`
- Modify: Spec §3.1/§3.2 (Julien-Ordner entfällt, Hinweis auf merged Snapshot)

**Interfaces:**
- Consumes: `loadTcgdexDatabase` (Task 3) für die Plausibilitätsprüfung nach dem Spiegeln
- Produces:
  - `mirrorTcgdex({ cloneDir: string, targetDir: string, excludeSerieIds: string[] }): { setCount: number, cardCount: number }` – schreibt in `targetDir + '.tmp'`, prüft, ersetzt dann atomar; bei Fehler bleibt `targetDir` unverändert.
  - `reduceAssetsIndex(datas: object, langs = ['en','de','univ']): object`
  - `updateSourcesManifest(file: string, name: string, entry: { repo: string, ref: string, commit: string, fetchedAt: string, status: 'active'|'frozen' }): void`
  - Gespiegelt werden: `data/` (ohne Ordner und `.ts` der ausgeschlossenen Serien), `interfaces.d.ts`, `meta/legals.ts`, `LICENSE`, dazu `assets-index.json`.

- [ ] **Step 1: Write the failing tests**

```js
test('mirror kopiert ohne Pocket und ersetzt atomar', () => { /* clone-Fixture aus Task 3 → targetDir; erwartet kein 'Pokémon TCG Pocket*' im Ziel, setCount 2 */ });
test('leeres oder kaputtes cloneDir lässt Ziel unverändert', () => {
  writeFileSync(join(target, 'marker'), 'alt');
  assert.throws(() => mirrorTcgdex({ cloneDir: emptyDir, targetDir: target, excludeSerieIds: ['tcgp'] }));
  assert.equal(readFileSync(join(target, 'marker'), 'utf8'), 'alt');
});
test('reduceAssetsIndex behält nur en/de/univ', () => assert.deepEqual(Object.keys(reduceAssetsIndex({ en: {}, de: {}, fr: {}, univ: {} })).sort(), ['de', 'en', 'univ']));
test('updateSourcesManifest ergänzt und sortiert Einträge stabil', () => { /* zwei Aufrufe, JSON-Schlüssel sortiert, Datei endet mit \n */ });
```

- [ ] **Step 2: Run, verify fail**
- [ ] **Step 3: Implement** – `mirrorTcgdex` verlangt ≥ 1 geladenes Set und 0 `errors` aus `loadTcgdexDatabase(cloneDir)`, sonst Fehler. CLI `sync-tcgdex.mjs`: `git clone --depth 1 --filter=blob:none --sparse https://github.com/tcgdex/cards-database.git <tmp>`, `git sparse-checkout set data meta interfaces.d.ts LICENSE`, Commit-SHA lesen, `https://assets.tcgdex.net/datas.json` laden und reduzieren, spiegeln, Manifest schreiben (`status: 'active'`). `freeze-pokemontcg.mjs`: kopiert Root-`cards/en`, `sets/en.json`, `decks/en` nach `sources/pokemontcg/` und trägt `{ repo: 'PokemonTCG/pokemon-tcg-data + JulienGitHub/pokemon-tcg-data (gemergt)', commit: 'bc4a5871a…', status: 'frozen' }` ein.
- [ ] **Step 4: Run, verify pass** – `npm test` → PASS
- [ ] **Step 5: Echtlauf** – `node sources/freeze-pokemontcg.mjs` und `node sources/sync-tcgdex.mjs` im Repo-Root-Kontext. Erwartet: `sources/tcgdex/data` ohne Pocket, ≥ 224 Sets abzüglich Pocket, `errors.length === 0`, `SOURCES.json` mit zwei Einträgen.
- [ ] **Step 6: Spec nachziehen (auf `dev`, nicht im Feature-Branch!)** – `docs/` existiert nur auf `dev`, und die Promotion stellt `docs/` immer vom Stand auf `dev` wieder her. §3.1/§3.2: `sources/julien/` entfällt; `sources/pokemontcg/` ist der gemergte Root-Stand.
- [ ] **Step 7: Commit** – erst Code + Tests (`feat(api): Snapshot-Sync fuer TCGdex und eingefrorenes pokemontcg`), dann Daten separat (`chore(sources): initiale Snapshots pokemontcg (frozen) und TCGdex`)

### Task 5: Set-Matcher

**Files:**
- Create: `scripts/api/match/match-sets.mjs`
- Test: `scripts/api/test/match-sets.test.mjs`

**Interfaces:**
- Consumes: `setIdCandidates`, `normalizeTcgdexSetId`, `normalizeName`, `cardMatchKey` (Task 1); `TcgdexSet`, `PtSet`, `PtCard` (Task 3)
- Produces: `matchSets({ ptSets: PtSet[], tcgdexSets: TcgdexSet[], ptCardsBySet: Map<string, PtCard[]>, setMap: { pairs: {pokemontcg: string, tcgdex: string, reason: string}[] } }): SetMatchResult`
  - `SetMatchResult = { pairs: { pokemontcgId, tcgdexId, method: 'mapping'|'exactId'|'normalizedId'|'codeAndDate'|'nameAndDate', overlap: number }[], rejected: { pokemontcgId, tcgdexId, method, reason }[], unmatchedPokemontcg: string[], unmatchedTcgdex: string[] }`
  - `overlap` = Anteil der pokemontcg-Karten, deren `cardMatchKey` im TCGdex-Set vorkommt.

- [ ] **Step 1: Write the failing tests** (kleine Inline-Daten)

```js
test('Reihenfolge der Methoden und Plausibilität', () => {
  // sv3pt5 ↔ sv03.5 per normalizedId; swsh45sv ↔ swsh4.5sv, nicht swsh4.5
  // PHF (ptcgoCode) + Datum ±7 Tage ↔ abbreviationOfficial
  // Name gleich, Datum 40 Tage daneben → kein Paar
});
test('1:1 – zweiter Anspruch auf dasselbe TCGdex-Set landet in rejected', () => { /* swsh45 und swsh45sv zeigen beide auf swsh4.5 */ });
test('mapping schlägt alles und braucht keine Plausibilität', () => { /* mcd11 → 2011bw aus setMap */ });
test('Plausibilität: overlap < 0.9 und Kartenzahl-Abweichung > 10 % → rejected', () => {});
```

- [ ] **Step 2: Run, verify fail**
- [ ] **Step 3: Implement** – Methoden in der Reihenfolge `mapping`, `exactId`, `normalizedId`, `codeAndDate` (±7 Tage), `nameAndDate` (±31 Tage, `normalizeName` gleich). Plausibilität für alle außer `mapping`: `overlap ≥ 0.9` **oder** Kartenzahl-Abweichung ≤ 10 % (pokemontcg `cards.length` vs. TCGdex `cards.length`). Kein Teil-Namensmatch. 1:1: Kandidaten mit höherer Methode, bei Gleichstand höherem `overlap` gewinnen. Daten: pokemontcg `YYYY/MM/DD`, TCGdex `YYYY-MM-DD`.
- [ ] **Step 4: Run, verify pass**
- [ ] **Step 5: Commit** – `feat(api): Set-Matcher mit Plausibilitaetspruefung und 1:1-Zuordnung`

### Task 6: Karten-Matcher

**Files:**
- Create: `scripts/api/match/match-cards.mjs`
- Test: `scripts/api/test/match-cards.test.mjs`

**Interfaces:**
- Consumes: `cardMatchKey`, `namesSimilar` (Task 1); `TcgdexSet`, `PtCard` (Task 3)
- Produces: `matchCards({ ptCards: PtCard[], tcgdexSet: TcgdexSet|null, tcgdexSetsById: Map<string, TcgdexSet>, cardMap: CardMapEntry|undefined }): CardMatchResult`
  - `CardMapEntry = { aliases?: Record<string /*pt number*/, { set?: string, localId: string }>, byNamePosition?: boolean }`
  - `CardMatchResult = { matched: { ptId: string, ptNumber: string, tcgdex: { setId: string, localId: string }[], method: 'mapping'|'number'|'variantGroup'|'namePosition', suspicious: boolean }[], primaryOnly: { ptId, ptNumber }[], tcgdexOnly: { setId, localId }[] }`

- [ ] **Step 1: Write the failing tests**

```js
test('Nummer mit Nullen/Präfix/Groß-Klein', () => { /* pt 6↔006, H1↔H01, TG01↔tg01, SV1↔SV001 → method 'number' */ });
test('Variantengruppe', () => { /* pt 50 ↔ tcgdex 50a+50b, ein Eintrag mit zwei tcgdex-Referenzen */ });
test('set-übergreifendes Alias', () => { /* cardMap { aliases: { A: { set: 'exu', localId: 'A' } } } */ });
test('doppelte pt-Nummern bleiben einzeln (cel25c)', () => {
  // 4× number '15' (ids cel25c-15_A1..A4) + byNamePosition gegen CC001..CC025 nach Namen
  assert.equal(r.matched.filter((m) => m.ptNumber === '15').length, 4);
  assert.equal(new Set(r.matched.map((m) => m.tcgdex[0].localId)).size, r.matched.length);
});
test('Namensabweichung → suspicious', () => {});
test('pokemontcg-only (101a) und TCGdex-only bleiben getrennt gelistet', () => {});
test('tcgdexSet null → alles primaryOnly', () => {});
```

- [ ] **Step 2: Run, verify fail**
- [ ] **Step 3: Implement** – Reihenfolge: `cardMap.aliases` → bei `byNamePosition` Name-und-Reihenfolge-Matching (gleicher `namesSimilar`-Name, sonst Position) → `cardMatchKey` gleich → Variantengruppe (TCGdex-Keys = pt-Key + genau ein Buchstabe, nur wenn kein exakter Treffer) → Rest. Jede TCGdex-Karte wird höchstens einmal vergeben. `suspicious` = `!namesSimilar(pt.name, tcgdex.name.en)`.
- [ ] **Step 4: Run, verify pass**
- [ ] **Step 5: Commit** – `feat(api): Karten-Matcher mit Aliasen, Variantengruppen und Namensabgleich`

### Task 7: Matching-Report und CLI

**Files:**
- Create: `scripts/api/report/matching-report.mjs`, `scripts/api/build-matching.mjs`
- Create: `api/mappings/set-map.json` (`{"pairs": []}`), `api/mappings/card-map.json` (`{}`)
- Test: `scripts/api/test/matching-report.test.mjs`
- Create (generiert): `api/v3/reports/matching.json`, `api/v3/reports/matching.md`

**Interfaces:**
- Consumes: `loadPokemontcg`, `loadTcgdexDatabase`, `matchSets`, `matchCards`
- Produces:
  - `buildMatchingReport({ setResult: SetMatchResult, cardResults: Map<string, CardMatchResult>, sources: object }): MatchingReport`
  - `MatchingReport = { generatedAt, sources, summary: { ptSets, tcgdexSets, pairedSets, ptCards, matchedCards, cardMatchRatio, suspicious, primaryOnly, tcgdexOnlyInPairedSets, unpairedTcgdexSets }, sets: [...pro Paar mit Zählern], rejected, unmatchedPokemontcg, unmatchedTcgdex }`
  - `renderMatchingMarkdown(report): string`
  - CLI: `node build-matching.mjs [--min-card-match 0.995]` → schreibt beide Dateien, Exit-Code 1 bei Unterschreitung oder Parse-Fehlern.

- [ ] **Step 1: Write the failing tests** – Report aus kleinem synthetischem Ergebnis: Summen stimmen, `cardMatchRatio` gerundet auf 4 Stellen, Markdown enthält Tabellenzeile pro Paar und Abschnitt „Nicht zugeordnet“; Ausgabe deterministisch (zweimal gleich, `generatedAt` injizierbar).
- [ ] **Step 2: Run, verify fail**
- [ ] **Step 3: Implement** – deterministisch sortiert (Set-IDs, `sortLocalIds`), JSON mit 2 Leerzeichen + `\n`.
- [ ] **Step 4: Run, verify pass**; danach Echtlauf `node build-matching.mjs` → Report entsteht, Ausgangswert notieren (erwartet ≈ 99,4 %, Gate darf hier noch rot sein).
- [ ] **Step 5: Commit** – `feat(api): Matching-Report und CLI`

### Task 8: Mappings vervollständigen bis zur Abnahme

**Files:**
- Modify: `api/mappings/set-map.json`, `api/mappings/card-map.json`
- Test: `scripts/api/test/matching-regression.test.mjs` (läuft gegen echte `sources/`)
- Modify (generiert): `api/v3/reports/matching.*`

**Interfaces:**
- Consumes: alles aus Task 3–7

- [ ] **Step 1: Write the failing regression test** – erwartete Paare/Karten aus Spec §2.1:

```js
const expectPair = { swsh45sv: 'swsh4.5sv', swsh45: 'swsh4.5', sv3pt5: 'sv03.5', swsh35: 'swsh3.5', mcd11: '2011bw', mcd22: '2022swsh', fut20: 'fut2020', me55c: '30th-c', cel25c: 'cel25cc', swsh9tg: 'swsh9tg', swsh12tg: 'swsh12tg', me2pt5: 'me02.5', me5: 'me05' };
// + ex10 'A' → exu/A; ecard2 'H1' → H01; cel25c alle 25 Karten eindeutig; summary.cardMatchRatio ≥ 0.995; rejected.length === 0
```

- [ ] **Step 2: Run, verify fail**
- [ ] **Step 3: Mappings ergänzen** – je Restfall aus `matching.md` einen Eintrag mit `reason`; keine Matcher-Regeln für Einzelfälle hart codieren. Pro Runde `node build-matching.mjs` laufen lassen.
- [ ] **Step 4: Run, verify pass** – `npm test` und `node build-matching.mjs --min-card-match 0.995` → Exit 0
- [ ] **Step 5: Sichtprüfung** – Paarliste (`matching.md`, Abschnitt Paare + `suspicious`) der Nutzerin vorlegen; Abnahme „0 falsche Set-Paare“ erst nach ihrer Bestätigung.
- [ ] **Step 6: Commit** – `feat(api): Mappings fuer vollstaendiges pokemontcg↔TCGdex-Matching`

### Task 9: Workflow `sync-tcgdex.yml`

**Files:**
- Create: `.github/workflows/sync-tcgdex.yml`
- Delete: `.github/workflows/sync-upstream.yml`
- Modify: `.github/workflows/build-cardmarket-data.yml` (Trigger `workflow_run.workflows` → `Daily Sync TCGdex to Master`)

**Interfaces:**
- Consumes: `scripts/api/sources/sync-tcgdex.mjs`, `scripts/api/build-matching.mjs`

- [ ] **Step 1: Workflow schreiben** – `name: Daily Sync TCGdex to Master`; `schedule: '0 2 * * *'` + `workflow_dispatch`; checkout `master`; `actions/setup-node@v4` mit `node-version: '24'`; `npm ci` in `scripts/api`; `npm test`; `node sources/sync-tcgdex.mjs`; `node build-matching.mjs --min-card-match 0.995`; Commit von `sources/tcgdex`, `sources/SOURCES.json`, `api/v3/reports` nur bei Änderungen; Push nach `master`. Bei Fehler: Issue mit Label `upstream-sync` und Link zum Lauf (Muster aus dem alten `sync-upstream.yml` übernehmen). Ein fehlgeschlagener Sync darf nichts committen.
- [ ] **Step 2: Prüfen** – `npx --yes yaml-lint@1.7.0 .github/workflows/sync-tcgdex.yml .github/workflows/build-cardmarket-data.yml` → keine Fehler; Trigger-Name in `build-cardmarket-data.yml` stimmt exakt mit `name:` überein.
- [ ] **Step 3: Commit** – `ci: TCGdex-Sync ersetzt den pokemontcg/Julien-Upstream-Sync`
- [ ] **Step 4: Übergabe** – Branch-Abschluss mit superpowers:finishing-a-development-branch. Hinweis an die Nutzerin: Der neue Workflow wird erst aktiv, wenn `master` per „Promote Master to Dev and Release“ auf `release` gelangt ist. Bis dahin läuft dort noch der alte Sync und merged pokemontcg in den Root. Das ist harmlos, weil `sources/pokemontcg` eingefroren ist.
