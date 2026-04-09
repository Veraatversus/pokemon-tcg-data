# Repository Context

This repository is a Pokémon TCG data fork of `PokemonTCG/pokemon-tcg-data` and includes both multilingual JSON data and a browser-based tracker frontend.

## Main areas
- `cards/` — card data by language (`en`, `de`, `es`, `fr`, `it`, `la`, `ptbr`)
- `sets/` — consolidated set files by language
- `decks/` — deck data
- `frontend/tcg-tracker-web/` — browser tracker UI with search, routing, collection state, and Google Sheets integration
- `frontend/tcg-tracker-google-sheets/` — supporting Sheets/frontend tooling
- `.github/workflows/` — sync, merge, deploy automation

## Technologies
- JSON with 2-space indentation
- Ruby conversion script(s)
- Vanilla JS modules in the frontend
- Google Sheets API integration
- Playwright/browser smoke checks
- GitHub Pages deployment

## Branches and deployment
- `main` — primary synced branch
- `release` — deployment branch for GitHub Pages
- `dev` / `feature/*` — feature and fix work

Do not push directly to `release`.
