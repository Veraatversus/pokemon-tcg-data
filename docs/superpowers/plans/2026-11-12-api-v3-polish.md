# API v3 Polish (Bilder, Serien, Suche, Dashboard, Clean Code) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the defects found in the /dev browser test of Phase 3 (empty DE series after import, broken image/logo URLs, slow search, partial dashboard) and continue the clean-up.

**Architecture:** Two branches, in order. Part A (Tasks 1–3) runs on a worktree off `master` and changes only `scripts/api/**`, `sources/tcgdex/**` (generated), `api/**` (generated) and `.github/workflows/sync-tcgdex.yml`; it is merged to master and promoted before Part B starts. Part B (Tasks 4–9) runs on a worktree off `dev` (after promotion, so `api/` carries the Part A data) and changes only `frontend/tcg-tracker-web/**`.

**Tech Stack:** Node ESM scripts with `node --test` (scripts/api, 177 tests); vanilla ES-module frontend with `node --test tests/*.test.mjs` (332 tests); GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-11-api-v3-tcgdex-monolith-design.md` (unchanged rules: §5 keys/aliases, vera_* = EN, tcgdex_* = DE preferred, top-level v3 `images` strictly EN, DE only in `i18n.de`). Findings that drive this plan: the browser test report in the ledger of this plan.

## Global Constraints

- Never execute TCGdex TS files; parse as text (`scripts/api/tcgdex/parse-module.mjs`).
- Frozen registry keys are additive-only; never rename/delete sheet rows; legacy rows are set false, never deleted.
- Top-level v3 `images` = EN only; DE images/names/series only under `i18n.de`.
- `.local/` holds private fixtures: never commit, never print row contents.
- API JSON is refreshed at most once per day in the client (SW cache-first, 24 h) — keep.
- Part A must keep the daily workflow green: a network failure during asset checks must never fail the build or drop a previously known-good URL.
- Bump `appVersion` in `frontend/tcg-tracker-web/version.config.json` and the SW cache version once in Part B (Task 9).

## Review Focus

1. Asset check hits a transient network error/timeout → URL status stays as last known (not "missing"); build still succeeds. (Task 1 test `transient errors keep previous status`.)
2. A set has a DE logo in the index but the DE URL 404s while EN works → app shows EN logo, never the Pokéball. (Task 1 + Task 5 tests.)
3. A set that was imported before (has a canonical db_sets row with empty `tcgdex_serie_name`) is re-imported → row gets the DE series filled, no duplicate row. (Task 4 test.)
4. Search for a name when no set file is cached → results render from the index alone, no per-set JSON fetch. (Task 7 test.)
5. Dashboard with more than 180 sets → all set cards render, newest series first, no "Mehr laden" button. (Task 6 test.)

---

## Part A — master (`scripts/api`)

### Task 1: Verified asset URLs

**Scope decision (user, 2026-11-12):** keep the GitHub Actions load minimal. Verify **only set logos and symbols** (~600 URLs), incrementally: `ok` is never re-probed, `missing` is re-probed after 7 days, unknown/new URLs are probed once. Card images are **not** probed in the workflow; missing card images are handled by the frontend fallback (Task 5). `resolveImages` for cards keeps today's behaviour (no `verified` filter).

**Problem (measured 2026-11-12):** `sources/tcgdex/assets-index.json` lists assets that the CDN does not serve: e.g. `https://assets.tcgdex.net/de/me/me05/logo.webp` → 404 (EN works), `https://assets.tcgdex.net/univ/<serie>/<set>/symbol.webp` → 400 for every set tried (sv01, me05, A1, A3), `mep`/`TCGDEX-B1a` have no logo at all. The frontend then shows the Pokéball placeholder.

**Files:**
- Create: `scripts/api/sources/verify-assets.mjs`
- Modify: `scripts/api/merge/images.mjs`, `scripts/api/merge/merge-set.mjs`, `scripts/api/merge/merge-card.mjs`, `scripts/api/build-api.mjs`, `.github/workflows/sync-tcgdex.yml`
- Generated: `sources/tcgdex/assets-verified.json`
- Test: `scripts/api/test/verify-assets.test.mjs`, extend `scripts/api/test/images.test.mjs` (or the existing merge-set/merge-card tests)

**Interfaces:**
- Produces: `verifyAssets({ urls: string[], previous: Record<string, {status:'ok'|'missing', checkedAt:string}>, probe: (url) => Promise<number|null>, now: () => Date, recheckMissingDays = 7, concurrency = 16 }) => Promise<Record<string, {status, checkedAt}>>`. `probe` returns the HTTP status or `null` on network error/timeout.
- Produces: `resolveSetImages(index, verified, {...})` — same as today but only emit a URL whose `verified[url]?.status !== 'missing'` (unknown = emit, so a first run without verification behaves as today). Try `.webp` then `.png` per asset; emit the first not-missing.
- Consumes: the candidate URL list the build already derives from `assets-index.json`.

- [ ] **Step 1: Find the real URL scheme.** Probe a handful of assets by hand (`curl -s -o /dev/null -w '%{http_code}' -A 'Mozilla/5.0' URL`) for logo/symbol/card in en/de/univ with `.webp`, `.png`, no extension, and compare with what `https://api.tcgdex.net/v2/de/sets/me05` returns. Record the findings (which schemes work, whether univ symbols are served at all) in the task report. Adjust the candidate list accordingly.
- [ ] **Step 2: Write failing tests** in `verify-assets.test.mjs`:
  - `ok and 404 are recorded` — probe returns 200 for A, 404 for B → `{A:{status:'ok'}, B:{status:'missing'}}`.
  - `transient errors keep previous status` — previous `{A:{status:'ok'}}`, probe returns `null` for A → A stays `ok`; unknown C with `null` → C absent from result.
  - `ok entries are not re-probed; missing re-probed after recheckMissingDays` — probe call count asserted.
  - In the images test: `missing DE logo is not emitted, EN logo kept`; `png chosen when webp missing`.
- [ ] **Step 3: Run** `cd scripts/api && node --test test/verify-assets.test.mjs` → FAIL.
- [ ] **Step 4: Implement** `verify-assets.mjs` (HEAD with `GET` fallback when HEAD is rejected, 10 s timeout, CLI entry that reads candidate URLs from the build's candidate list, merges into `sources/tcgdex/assets-verified.json`, writes only if changed) and wire `verified` into images/merge-set/merge-card. Add a summary line to the build output: `Assets: <ok> ok, <missing> fehlen`.
- [ ] **Step 5: Workflow:** add step `node scripts/api/sources/verify-assets.mjs` between "Sync TCGdex" and "Build API v3 and registry" with `continue-on-error: true`.
- [ ] **Step 6: Run** the full suite `cd scripts/api && npm test` → all pass; run the verifier once locally and `node scripts/api/build-api.mjs`; report how many set logos/symbols/card images are missing per language before/after.
- [ ] **Step 7: Commit** (code, tests, workflow, regenerated `sources/tcgdex/assets-verified.json` and `api/**`).

### Task 2: German series and counts in v3 sets

**Files:**
- Modify: `scripts/api/merge/merge-set.mjs`; test next to existing merge-set tests.

**Interfaces:**
- Produces in every v3 set with a TCGdex counterpart: `i18n.de.series` (TCGdex serie name in German, e.g. `"Mega-Entwicklung"` for `me6`, `"Karmesin & Purpur"` for sv sets) and `i18n.de.cardCount = { official, total }` from the TCGdex set data (omit fields that are absent). Sets without TCGdex counterpart: no change.

- [ ] **Step 1: Failing test** `merge-set adds DE series and cardCount` — fixture TCGdex set with serie `{name:{de:'Mega-Entwicklung',en:'Mega Evolution'}}` and cardCount `{official:103,total:141}` → `i18n.de.series === 'Mega-Entwicklung'`, `i18n.de.cardCount` deep-equals `{official:103,total:141}`, top-level `series` unchanged (EN).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** full suite → PASS; rebuild API; spot-check `me6`, `sv1`, `TCGDEX-A1` in `api/v3/sets.json`.
- [ ] **Step 5: Commit.**

### Task 3: Search index with display fields

**Files:**
- Modify: `scripts/api/build-api.mjs` (search index push at ~line 178); test in the build-api tests.

**Interfaces:**
- Produces `api/v3/search-index.json` entries: `{ setId, cardId, number, name, nameDe?, img?, imgDe?, types?, rarity?, artist?, supertype? }` — `img` = top-level `images.small` (EN), `imgDe` = `i18n.de.images.small`; omit absent keys. Keep the array shape (frontend reads an array).

- [ ] **Step 1: Failing test** `search index carries display fields` — built entry for a fixture card contains `img`, `types`, `rarity`, `artist`; a card without DE image has no `imgDe` key.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** full suite → PASS; rebuild; report raw and gzip size of `search-index.json` (must stay < 8 MB raw).
- [ ] **Step 5: Commit.** Then (controller) merge to master, push, run "Promote Master to Dev and Release".

---

## Part B — dev (`frontend/tcg-tracker-web`)

### Task 4: DE series and counts in set records; consistent dashboard grouping

**Files:**
- Modify: `js/data/v3-records.js` (`toSetRecord`), the import path that writes `db_sets` rows (find via `toSetRecord` callers), dashboard series label resolver (`js/views/dashboard-rendering.js` / wherever series grouping is computed).
- Test: `tests/v3-records.test.mjs`, new `tests/dashboard-series-grouping.test.mjs`.

**Interfaces:**
- `toSetRecord(v3Set, opts)` fills `tcgdex_serie_name ← i18n.de.series`, `tcgdex_name ← i18n.de.name`, `tcgdex_cardCount_official ← i18n.de.cardCount.official ?? printedTotal`, `tcgdex_cardCount_total ← i18n.de.cardCount.total ?? total`.
- Produces `resolveSetSeriesLabel(set, language) => string` (DE: `tcgdex_serie_name` → registry/v3 `i18n.de.series` → `vera_series`; EN: `vera_series` → `series`) used for every dashboard group heading, imported or not.
- Re-import of a set whose canonical row exists updates empty `tcgdex_*` set fields in place (no new row).

- [ ] **Step 1: Failing tests:** `toSetRecord fills DE series and counts` (me6 fixture → `tcgdex_serie_name === 'Mega-Entwicklung'`, official 103, total 141); `resolveSetSeriesLabel prefers DE series in de, EN in en`; `imported and not-imported sets of one series share one group`; `re-import fills empty tcgdex_serie_name without appending a row` (mock sheets layer as in existing sheets-db tests).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** Also make the not-imported card text use the same total as the imported progress (`total`, i.e. 141 for me6, not `printedTotal`).
- [ ] **Step 4: Run** `node --test tests/*.test.mjs` → PASS. **Step 5: Commit.**

### Task 5: Image fallback chain

**Files:**
- Create: `js/ui/image-fallback.js`
- Modify: every place that renders set logos, set symbols, card images (grep `logo`, `symbol`, `images.small`, `card-img` in `js/views/**`, `js/app.js`, `js/features/**`).
- Test: `tests/image-fallback.test.mjs`

**Interfaces:**
- Produces `imageCandidates(record, kind, language) => string[]` with `kind ∈ 'setLogo' | 'setSymbol' | 'cardSmall' | 'cardLarge'`; order for `de`: DE (`i18n.de.images` / `tcgdex_*`) → EN (top-level / `vera_*`) → legacy pokemontcg URL; for `en`: EN → DE → legacy; duplicates/empties removed.
- Produces `bindImageFallback(img: HTMLImageElement, candidates: string[], { placeholder })` — sets `src` to the first, on `error` advances; after the last shows the existing placeholder. Rendered markup uses `data-fallbacks` so it also works for HTML strings (one delegated `error` listener, capture phase, on `document`).

- [ ] **Step 1: Failing tests:** candidate order for de/en; dedupe; delegated handler advances `src` through `data-fallbacks` and finally sets the placeholder class (use a minimal fake element).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement and wire** into all render sites. **Step 4: Run** → PASS. **Step 5: Commit.**

### Task 6: Dashboard shows all sets

**Files:**
- Modify: `js/app.js` (remove `DASHBOARD_VIRTUAL_PAGE_SIZE`, `state.dashboardVirtualCount`, "Mehr laden"/"Alle laden" markup and handlers), `js/views/dashboard-rendering.js`, `js/views/dashboard-view.js` — keep exactly one dashboard render implementation (the one `app.js` actually calls; delete the duplicate copy in the other file after an importer check).
- Test: `tests/dashboard-rendering.test.mjs` (new or extend).

- [ ] **Step 1: Failing test** `renders all sets without virtual paging` — 230 fake sets → 230 cards, no `[data-action="more"]` / `[data-action="all"]`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS. **Step 5: Commit.**

### Task 7: Search renders from the index

**Files:**
- Modify: `js/features/search/search-index-prefilter.js`, `js/features/search/engine.js`, search result rendering.
- Test: `tests/search-index-prefilter.test.mjs`, new `tests/search-from-index.test.mjs`.

**Interfaces:**
- Consumes Task 3 index fields. Produces `searchIndexEntries(index, query, { language, setFilter }) => entry[]` matching name/nameDe/number/artist/types/rarity (case- and diacritic-insensitive, all query words must match some field).
- Results render from index entries (image via Task 5 candidates from `imgDe`/`img`; collection status via `collectionKey` = `cardId` + canonical `setId`). Per-set JSON is fetched only when a result needs data the index lacks (card detail view).

- [ ] **Step 1: Failing tests:** `artist query matches from index without set fetch` (fetch spy count 0); `name query matches DE and EN names`; `results carry img and collection key`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** Remove the full-scan path; text in attacks/abilities is no longer searched (accepted trade-off). **Step 4: Run** → PASS. **Step 5: Commit.**

### Task 8: Restore reads fresh; runtime cache cap

**Files:**
- Modify: backup restore path in `js/app.js` (~`applyCollectionBackup` / `planBackupRestore` caller) to read `db_collection` with the strict, uncached read before planning; `service-worker.js` cap enforcement so the runtime cache never exceeds 60 entries after a put.
- Test: extend `tests/legacy-key-resolution.test.mjs` or the restore test; `tests/service-worker*.test.mjs`.

- [ ] **Step 1: Failing tests:** `restore plans against a fresh read, not the cached map` (cached says g=true, fresh says false → card gets written); `runtime cache stays <= 60 after puts`.
- [ ] **Step 2–4:** Run → FAIL, implement, run → PASS. Also address the three deferred minors from the Phase 3 ledger: v2 backup keys under an alias setId are collectionKeys (do not reinterpret as localIds); `markAliasSetRowsNotImported` must not clear the canonical when an unmerged alias set is deleted; strict `listCollectionSetIds` must propagate a registry failure. One test each.
- [ ] **Step 5: Commit.**

### Task 8b: Replace the resolver matrix by a language rule

**Decision (2026-11-12, after user question):** since v3 is one build, `tcgdex_*` = DE and `vera_*` = EN; German exists only for name, images, attacks/abilities/rules, flavorText. The per-field resolver matrix (sources tcgdex/vera/legacy, dev-only cardmarket) and its expert mode no longer express a real choice and conflict with the language setting.

**Files:**
- Modify: `js/data/schema-contract.js` (remove `getResolverMatrix`, `DEFAULT_RESOLVER_MATRIX`, `normalizeResolverMatrix`, expert-mode branch, dev-only `cardmarket` source; keep `getCardLanguage`), every caller of the matrix, `js/ui/components.js` (remove matrix editor + expert toggle from settings), `js/enhanced-features.js` (drop `expertResolverMode`/`resolverMatrix` defaults; ignore stored values).
- Test: replace matrix tests with `tests/field-resolution.test.mjs`.

**Interfaces:**
- Produces `resolveFieldValue(record, scope, field, language) => value` — language-dependent fields (set: setName, logoUrl; card: name, image, imageLarge, evolvesFrom, rules, flavorText, attacks, abilities): chosen language source → other language → legacy; all other fields: v3/EN value (`vera_*`) → `tcgdex_*` → legacy. Images still go through Task 5 `imageCandidates`.

- [ ] **Step 1: Failing tests:** DE prefers tcgdex_ name, EN prefers vera_ name, both fall back; neutral field (rarity) identical in both languages; stored `resolverMatrix`/`expertResolverMode` in user-settings has no effect; settings panel renders without matrix editor.
- [ ] **Step 2–4:** Run → FAIL, implement (callers switch to `resolveFieldValue`), run full suite + `check:imports` → PASS.
- [ ] **Step 5: Commit.**

### Task 9: Clean code pass and release prep

**Files:**
- Modify: `js/app.js` and modules it duplicates.
- Test: existing suite + `npm run check:imports`.

- [ ] **Step 1:** List functions in `js/app.js` that have a twin in `js/views/**` or `js/features/**` (same name or near-identical body). For each pair keep the module version, import it in `app.js`, delete the copy. No behaviour change; tests must stay green after each removal. Also delete modules with no importer (re-check with `check:imports` + grep).
- [ ] **Step 2:** Report line count of `app.js` before/after and the list of removed duplicates.
- [ ] **Step 3:** Bump `appVersion` (`20261113-api-v3-polish`) and the SW cache version (v59); update ARCHITECTURE.md for Tasks 5–7 (image fallback, index search, no dashboard paging).
- [ ] **Step 4: Run** `node --test tests/*.test.mjs` and `npm run check:imports` → green. **Step 5: Commit.**
