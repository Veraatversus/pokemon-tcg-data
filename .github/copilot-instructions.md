# GitHub Copilot Instructions

This file is now a **compatibility bridge**.

The project's primary, tool-agnostic rule system lives in the Claude-native files:
- `CLAUDE.md`
- `.claude/rules/01-core-rules.md`
- `.claude/rules/10-repo-context.md`
- `.claude/rules/20-frontend-tracker.md`

## Intent
- Keep the repository instructions usable outside GitHub/Copilot-specific tooling.
- Centralize project behavior in the Claude-style rules system.
- Let `.github/copilot-instructions.md` remain only as a lightweight pointer for tools that still look here first.

## Core expectations
- Verify before claiming success.
- Debug root cause before fixing.
- Prefer real browser/smoke validation for `frontend/tcg-tracker-web`.
- Keep changes minimal and safe.
- Never push directly to `release`.
