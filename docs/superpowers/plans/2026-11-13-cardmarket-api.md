# Cardmarket als Teil der API – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Cardmarket a self-maintaining source of the static API: one daily workflow downloads the catalog and price guide, the API build assigns one product per card (single matching stage with stability) and writes per-set price files; the frontend reads prices per v3 set and no longer matches anything itself.

**Architecture:** Part A (master, `scripts/api/**`, `sources/cardmarket/**`, `api/**`, `.github/workflows/**`) is merged and promoted before Part B (dev, `frontend/tcg-tracker-web/**`). The frozen `cardmarket/` folder stays untouched (release keeps reading it until the later release switch).

**Tech Stack:** Node ESM + `node --test` (scripts/api, currently 246 pass / 1 skip); vanilla ES-module frontend + `node --test tests/*.test.mjs` (448 pass); GitHub Actions on a free account.

**Spec:** `docs/superpowers/specs/2026-11-13-cardmarket-api-design.md`

## Global Constraints

- A wrong link is worse than no link: ambiguous → no id + report entry.
- Never execute TCGdex TS files. Registry is frozen/additive-only.
- Card files, search index and `api/v3/prices/*.json` are compact JSON; reports, mappings, `sources/cardmarket/expansions.json`/`meta.json` pretty; `sources/cardmarket/catalog.jsonl` one product per line sorted by id.
- Price guide is never committed raw.
- `cardmarket/` is not regenerated and not deleted in this plan.
- `scripts/**` is master-owned; Part B never edits `scripts/**`.
- Daily workflow must stay light and green: a Cardmarket outage must not fail the TCGdex part.
- Every frontend deploy bumps `appVersion` (`version.config.json` + `npm run version:sync`).
- Primary product rule (build and frontend identical): unstamped non-jumbo → non-jumbo → unstamped → any variant → `ids.cardmarket[0]`.

## Review Focus

1. Cardmarket download fails or returns a truncated price guide (> 20 % fewer entries) → previous prices stay, nothing is deleted, TCGdex part still commits. (A1/A3 tests.)
2. A product id assigned by rules yesterday becomes ambiguous today (new same-name product) → card keeps its id, report hint. (A2 test.)
3. A custom-set entry with a version suffix (`4V2`, `224a`, `H1`) never becomes the normal card's product. (A2 test.)
4. A set whose expansion cannot be determined → no prices, issue raised; other sets unaffected. (A2/A4 tests.)
5. The first app load after a new price build shows new prices; offline uses cached prices. (B1 test.)

---

## Part A — master

### Task A1: `sources/cardmarket/` – download, catalog, outage protection

**Files:** Create `scripts/api/sources/sync-cardmarket.mjs` (+ test). Reuse `extractProductsList`/`extractPriceGuideList` logic from `scripts/cardmarket/lib/build-helpers.mjs` by moving the two pure functions into `scripts/api/sources/cardmarket-feeds.mjs` (keep the old file importing them from there so the frozen pipeline code still parses). `.gitignore`: `.cache/`.

**Interfaces (produces):**
- `syncCardmarket({ repoRoot, fetchJson, now }) → { status: 'ok'|'failed'|'defective', catalogChanged: boolean, priceGuidePath: string|null }`
- Writes `sources/cardmarket/catalog.jsonl` (`{"id":…,"name":…,"expansionId":…,"collectorNumber":…|null,"metacardId":…|null,"dateAdded":…}` per line, category 51 only, sorted by id), `sources/cardmarket/expansions.json` (`[{id, name, products}]` from the catalog), `sources/cardmarket/meta.json` (`{singlesCreatedAt, priceGuideCreatedAt, products, prices, lastSuccess, consecutiveFailures}`), and the price guide to `.cache/cardmarket/price-guide.json` (gitignored) for the build step.
- URLs: `https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_6.json`, `…/priceGuide/price_guide_6.json`; 30 s timeout, one retry; generic User-Agent `veraatversus-cardmarket-builder/1.0`.
- Defective: price entries < 80 % of `meta.prices` from the previous success, or 0 products → status `defective`, nothing in `sources/cardmarket/` changes except `consecutiveFailures++`. Failed (network/HTTP/parse) → same with status `failed`. Exit code 0 in both cases.

- [ ] Step 1: failing tests: `writes sorted catalog jsonl and meta`, `defective price guide keeps previous state`, `network failure increments consecutiveFailures and exits ok`, `only category 51 products`.
- [ ] Step 2–4: RED → implement → full suite GREEN; run once for real and commit the generated `sources/cardmarket/*` (report sizes).
- [ ] Step 5: Commit code+tests, then generated sources separately.

### Task A2: Matching on catalog + custom-sets + stability

**Files:** Modify `scripts/api/merge/cardmarket-ids.mjs`, `scripts/api/build-api.mjs`, `scripts/api/merge/merge-set.mjs` (set-level cardmarket id); create `scripts/api/sources/cardmarket-catalog.mjs` (loader: catalog → `byId`, `byExpansion`, expansions) and `sources/cardmarket/custom-sets/<id>.json` (converted from `scripts/cardmarket/custom-sets/1536|1537|1538|5241.mjs`; format `{expansionId, name, cards:[{productId, collectorNumber}]}`); move `sortLocalIds` used by build-api out of `scripts/cardmarket/tcgdex-helper/` into `scripts/api/lib/` (old location re-exports).

**Interfaces:**
- Consumes A1 catalog. build-api must no longer read `cardmarket/index/*`, `cardmarket/sets/*` or `tracker.json`.
- Set expansion order (spec §3.1): override (`api/mappings/cardmarket-overrides.json` key `"<setId>"` → expansionId, optional) → v3 `ids.cardmarket` if present in catalog expansions → majority (≥ 80 %) of card product ids; gallery subsets may use their own expansion.
- Card stage order (spec §3.2): override → custom-set (exact collectorNumber incl. suffix; base number = normal card) → TCGdex id (expansion-checked, unshared) → existing rules → empty. New source value `custom-set`.
- Stability (spec §3.4): `fillCardmarketIds({..., previous})` where `previous` = map `"<setId>/<cardId>"` → `{productId, source}` read from the currently committed `api/v3/cards/*.json`; if a card had a stage-3/4 id and today no stage yields one, keep it if the product still exists in the catalog; report `stabilityKept`.

- [ ] Step 1: failing tests: `custom-set suffix never matches base card`, `custom-set beats tcgdex id`, `stability keeps yesterday's rule id`, `stability drops id whose product vanished`, `expansion by majority`, `no expansion → no ids and flagged`; regression test over real data: every card with an id at master HEAD keeps it unless a stage 1–2 entry decides otherwise (list exceptions explicitly in the test); conversion test: the four converted custom-sets yield exactly the collector numbers the old scripts produced.
- [ ] Step 2–4: RED → implement → full suite GREEN; rebuild; report coverage before/after.
- [ ] Step 5: Commit code+tests+custom-set JSON, then regenerated api/** separately.

### Task A3: Price files

**Files:** Create `scripts/api/merge/cardmarket-prices.mjs` (+ test); wire into build-api.

**Interfaces:**
- `buildPriceFiles({ cardsBySet, priceGuide, primaryCardmarketId }) → { files: Map<setId, object>, meta }`
- `api/v3/prices/<setId>.json`: `{ "<cardId>": { productId, trend, avg1, avg7, avg30, low, trendHolo, avg1Holo, avg7Holo, avg30Holo, lowHolo } }` – only present numeric fields; only cards with a primary id and a price-guide entry. Price-guide field names: `idProduct`, `avg`, `low`, `trend`, `avg1`, `avg7`, `avg30`, `avg-holo`, `low-holo`, `trend-holo`, `avg1-holo`, `avg7-holo`, `avg30-holo`.
- `api/v3/prices/meta.json` (pretty): `{generatedAt, priceGuideCreatedAt, cardsWithId, cardsWithPrice}`.
- If A1 status ≠ ok (no `.cache` price guide): leave existing price files and meta untouched.
- Size guard: total < 8 MB raw (test).

- [ ] Steps: failing tests (`writes only priced cards`, `untouched when no price guide`, `holo fields mapped`) → implement → rebuild → commit code/tests then data.

### Task A4: Report, search URLs, issue

**Files:** Modify report writer in `scripts/api/merge/cardmarket-ids.mjs`/build-api; create `scripts/api/report/cardmarket-issue.mjs` (+ test).

**Interfaces:**
- `api/v3/reports/cardmarket-ids.json` adds per set: `coverage {cards, withId, bySource}`, `expansionId`, `searchUrl` = `https://www.cardmarket.com/en/Pokemon/Products/Search?searchMode=v2&idCategory=51&idExpansion=<id>&sortBy=collectorsnumber_asc&perSite=100&site=1`, `stillMissing` (existing), `stabilityKept`. Plus `api/v3/reports/cardmarket-ids.md` (pretty table, sets sorted by missing count desc).
- `evaluateCardmarketIssue({ report, meta, previousSetIds }) → { open: boolean, title: 'Cardmarket-Zuordnung prüfen', body: string }`. Triggers: new set (not in `previousSetIds`) with coverage < 80 %; set without expansion; override/custom-set entry whose product is missing in the catalog; `meta.consecutiveFailures >= 3`.

- [ ] Steps: failing tests for each trigger and for `open:false` when clean → implement → rebuild → commit.

### Task A5: HTML import tool

**Files:** Create `scripts/api/cardmarket/import-html.mjs` (+ test with a saved minimal HTML fixture under `scripts/api/test/fixtures/`), based on `scripts/cardmarket/custom-sets/generate-custom-set.mjs` parsing (expansion id, product ids, collector numbers with V-/letter-/H-suffixes).

**Interfaces:** CLI `node scripts/api/cardmarket/import-html.mjs <page.html…> [--dry-run]` → writes/merges `sources/cardmarket/custom-sets/<expansionId>.json`, rebuilds only the affected v3 set(s) in memory and prints before/after (closed gaps, remaining gaps, conflicts with existing assignments). Inputs are expected in `.local/cardmarket-html/` (gitignored; document in README).

- [ ] Steps: failing tests (parse fixture → entries incl. `4V2`/`224a`; merge keeps existing entries; before/after summary) → implement → README section → commit.

### Task A6: One daily workflow

**Files:** Modify `.github/workflows/sync-tcgdex.yml` (name "Daily Sync"), delete `.github/workflows/build-cardmarket-data.yml`, remove the dispatch step added in Task 10; README/runbook.

**Steps order (spec §4):** tests → TCGdex sync → verify set assets → `node scripts/api/sources/sync-cardmarket.mjs` (continue-on-error not needed: it exits 0) → matching gate → regression tests → build-api → commit (`sources/tcgdex sources/cardmarket sources/SOURCES.json api/v3 api/registry`) + push with 2-try retry → promote (existing chain) → issue step: run `evaluateCardmarketIssue`, create/update/close a single issue labelled `cardmarket-mapping` via `actions/github-script` (update body, never comment daily; close when `open:false`).
Keep the existing TCGdex failure issue. Concurrency group stays.

- [ ] Steps: YAML by hand + parse with a YAML parser if available in node_modules; dry-run `node scripts/api/sources/sync-cardmarket.mjs` and build locally; commit. Controller merges Part A, pushes, promotes, triggers one manual run and checks it.

---

## Part B — dev

### Task B1: Frontend prices from `api/v3/prices`

**Files:** Create `frontend/tcg-tracker-web/js/data/v3-prices.js` (+ tests); modify set view / search / stats price lookups (`js/data/cardmarket-data.js` callers in app.js and features), service-worker routing for `api/v3/prices/` (meta network-first; files `?v=<generatedAt>` cache-first with old-stamp pruning — reuse the existing cardmarket `?v=` handling).

**Interfaces:** `loadPriceStamp() → string` (meta.generatedAt; offline → cached), `loadSetPrices(setId) → Map<cardId, price>`, `getCardPrice(card) → price|null` (by canonical setId + cardId/collectionKey). Product id for links stays `resolveCardmarketProductId`; price must carry the same `productId` (if the record's product id differs from the price file's productId → no price, avoid mismatch).

- [ ] Steps: failing tests (`set view price from set file`, `search loads price files only for shown sets`, `stats price for db_cards record`, `day-2 stamp fetches new file`, `offline uses cached`, `productId mismatch → no price`) → implement → full suite + check:imports → commit.

### Task B2: Remove legacy Cardmarket code, release prep

**Files:** Remove frontend reads of `cardmarket/` (index/products/tracker/sets), the remaining frontend matcher (`promoteCardmarketUrlsForCards` etc. in `js/data/cardmarket-ui-helpers.js` if unused), dead parts of `js/data/cardmarket-data.js`; update ARCHITECTURE.md/README; bump `appVersion`.

- [ ] Steps: importer check per removed export → remove → full suite + check:imports → browser smoke via local Pages-layout server → commit.
