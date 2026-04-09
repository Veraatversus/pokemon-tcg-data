# Cardmarket + Dual-Upstream Implementation Plan

> Working implementation handoff for the Pokémon tracker daily data pipeline.

## Goal
Keep `master`, `dev`, and `release` updated daily with:
- merged data from `PokemonTCG/pokemon-tcg-data`
- overlay updates from `JulienGitHub/pokemon-tcg-data`
- generated Cardmarket static JSON endpoints for singles and price data

## Branch roles
- `master` — automated integration branch
- `dev` — verified preview branch
- `release` — production deployment branch

## Daily flow
1. Sync `PokemonTCG` into `master`
2. Merge `JulienGitHub` into `master`
3. Build and validate Cardmarket JSON endpoints on `master`
4. Promote verified `master` to `dev`
5. Verify `dev`
6. Promote verified `dev` to `release`
7. Deploy GitHub Pages

## Cardmarket scope
Included for MVP:
- `products_singles_6.json`
- `price_guide_6.json`

Excluded for MVP:
- `products_nonsingles_6.json`
- `products_accessories.json`

## Public output structure
> **Canonical requirement:** the Cardmarket API endpoints should live in a dedicated **project-root folder** alongside `cards/`, `sets/`, and `decks/` — **not** under `frontend/`.

Recommended target structure:
- `cardmarket/meta.json`
- `cardmarket/index/sets.json`
- `cardmarket/index/products.json`
- `cardmarket/index/names.json`
- `cardmarket/index/tracker.json`
- `cardmarket/sets/<setId>.json`

If a `frontend/...` copy is ever needed for localhost convenience, it should be treated as a **temporary dev mirror only**, never as the canonical production location.

## Current implementation status
- ✅ dual-upstream + staged workflow files scaffolded
- ✅ the Cardmarket builder now emits per-expansion payloads plus `index/products.json`, `index/names.json`, and `index/tracker.json`
- ✅ the canonical public output is now the repo-root `cardmarket/` folder, with a local dev mirror at `frontend/tcg-tracker-web/cardmarket/`
- ✅ the frontend lazy resolver now promotes search fallbacks into stable direct product URLs and uses the tracker-aware set index when direct anchors are missing
- ✅ regression coverage is freshly green: `15 pass`, `0 fail`, `EXIT:0`
- ✅ fresh localhost module verification confirms `fetchMergedCards('sv1')` returns direct `idProduct=` Cardmarket URLs and the localized `Tannza`/`Tarountula` matcher now resolves to the exact product entry (`702312`)
- ⚠️ older cached browser sessions can still keep rendering the previous search-fallback UI until the bumped `app.js?v=20260510-cardmarket-ui2` and service-worker cache generation `v39` are picked up

## Current next step
- Re-check a few representative live set pages after the refreshed frontend bundle/service-worker is active, then review/stage the generated root `cardmarket/**` artifacts for commit.
- Keep the plan/docs aligned with the verified root-path rollout, localized-name matcher fix, and cache-busting updates.

## Implementation priorities
1. Workflow refactor
2. Cardmarket build script
3. Static output validation
4. Frontend per-set loader
5. UI + cache integration
6. Regression and smoke verification

## Notes
- Google Sheets remains the collection database, not the storage for daily market-price churn.
- Cardmarket data is delivered through static Pages JSON and joined in-memory in the app.
- This file should be kept aligned with the active session plan in `/memories/session/plan.md`.
