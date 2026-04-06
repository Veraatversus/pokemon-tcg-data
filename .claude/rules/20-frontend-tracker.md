# Frontend Tracker Rules

When touching `frontend/tcg-tracker-web`:

## Validation
- Validate locally on `http://localhost:8080`.
- Prefer the existing scripts in `frontend/tcg-tracker-web/tests/` for search, routing, dashboard, and regression checks.
- Search/routing changes must keep working for:
  - imported DB-backed sets
  - API-only / non-imported sets
  - mixed DE/EN search queries

## Auth note
- Some browser smokes depend on a fresh Google login session.
- If auth is expired, skip/fail clearly and say so instead of claiming success.
- Follow `.claude/rules/25-browser-automation.md` for browser startup and session handling.

## Change style
- Favor small targeted changes in `js/app.js` and related test files.
- Keep cache-busting/version updates aligned when needed so the browser loads new code.
- Preserve Sheets-related data behavior and fallback logic.
