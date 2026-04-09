# CLAUDE.md

This repository uses a Claude-native, rules-first instruction setup.

This file is the primary Claude entrypoint. The detailed, authoritative project rules live in `.claude/rules/`.

## Primary operating rules
1. **Verify before claiming success** — do not claim fixes, tests, or completion without fresh evidence.
2. **Debug root cause first** — reproduce issues, trace the failing path, then make one focused fix.
3. **Test real behavior** — prefer browser/smoke validation for `frontend/tcg-tracker-web` over mock-only reasoning.
4. **Keep changes minimal and safe** — preserve JSON and Sheets data integrity and avoid unrelated churn.
5. **Respect repository workflow** — never push directly to `release`; use `dev`, `main`, or feature branches as appropriate.

## Project layout
- Card data: `cards/`
- Set metadata: `sets/`
- Deck data: `decks/`
- Tracker frontend: `frontend/tcg-tracker-web/`
- Sheets/frontend tooling: `frontend/tcg-tracker-google-sheets/`
- Workflow automation: `.github/workflows/`

## Validation expectations
- Validate frontend work locally on `http://localhost:8080`.
- Prefer existing smoke checks in `frontend/tcg-tracker-web/tests/`.
- Search/routing changes must keep working for imported DB-backed sets, API-only/non-imported sets, and mixed DE/EN queries.
- If Google auth is expired, report that clearly instead of guessing.

## Modular rule files
Detailed repo rules are kept in `.claude/rules/`:
- `.claude/rules/01-core-rules.md`
- `.claude/rules/10-repo-context.md`
- `.claude/rules/20-frontend-tracker.md`
- `.claude/rules/25-browser-automation.md`

## Best-practice note
Use `.claude/CLAUDE.md` + modular rule files as the canonical project instruction system so the repository stays tool-agnostic and does not depend on GitHub-specific instruction files.
