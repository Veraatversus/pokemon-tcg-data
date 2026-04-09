---
name: autonomous-browser-fixer
description: This skill should be used when a user wants the agent to try a live browser flow, discover bugs or UX weaknesses autonomously, and then fix, improve, or suggest enhancements using the repository's Playwright-based browser workflow. Trigger phrases include requests like "test this in the browser", "probier das live im Browser", "find the issues yourself", "check this flow and fix what breaks", or "explore this page for improvements".
---

# Autonomous Browser Fixer

## Overview
Use this skill to autonomously exercise a user-selected browser flow, identify issues without waiting for a precise bug report, and then implement focused code changes or propose improvements. Keep the work grounded in live behavior, root-cause analysis, and re-verification.

## When to use
Activate this skill when the request is about:
- trying a UI flow live in the browser
- finding bugs or weak spots without an explicit error description
- reproducing and fixing what breaks
- checking the quality of a page, feature, or user journey
- suggesting low-risk UX improvements after the flow is understood

### Concrete example missions
- Search for a card, click an API-only result, press `Zum Set`, and verify the correct set actually loads.
- Verify that after opening the set from search, the matching card is visible immediately or scrolled into view.
- Benchmark the online-search → set-open flow for persistence: once cards were fetched from the API, confirm the set is auto-imported and then appears as imported in dashboard, statistics, and imported-only card search.
- When validating import-heavy flows, watch for Google Sheets retry/rate-limit signals and prefer a fresh spreadsheet or clean test table instead of reusing a polluted state.
- Explore a settings, dashboard, or filter flow and fix the broken behavior found during the live run.

Do not use this skill for:
- purely backend or data-only changes with no browser behavior to test
- large product planning work without a runnable UI flow
- major new feature builds that need a separate implementation plan first

## Required browser path
- Follow `.claude/rules/25-browser-automation.md` exactly.
- Use the Playwright-based workflow only, especially the `playwright-cli` skill.
- For live/local validation, reuse the same headed persistent browser/profile instead of opening a fresh session.
- If auth or session state is expired, state that clearly and continue only after re-auth within the same persistent profile.

## Core workflow
### 1. Scope the mission
- Extract the exact page, action, or flow the user wants exercised.
- If the ask is broad, choose one concrete high-value path first and state that focus briefly.

### 2. Reproduce live behavior
- Open or attach to the persistent headed session.
- Navigate the flow end-to-end.
- Observe the page, empty states, broken buttons, console errors, network failures, routing problems, and visual weaknesses.

### 3. Gather evidence
- Capture the exact failing steps and visible symptoms.
- Use Playwright snapshots, DOM inspection, and console/network information as proof.
- Avoid guessing from code before the behavior is reproduced.

### 4. Diagnose autonomously
- Read the relevant frontend code and trace the root cause.
- Prefer one clear hypothesis and one focused fix at a time.
- Consult `references/issue-heuristics.md` when looking for common classes of browser defects and weak UX.

### 5. Fix with restraint
- Implement the smallest safe code change that addresses the real issue.
- Add or update a regression smoke/test when practical.
- Avoid large unrelated features unless the user explicitly wants broader product changes.

### 6. Re-verify
- Re-run the same live browser flow.
- Run any relevant smoke or regression script.
- Do not claim success without new evidence.

### 7. Report findings
- Separate clearly:
  - what was broken
  - what was fixed
  - what remains blocked
  - what optional improvements are suggested
- Offer enhancement ideas after the core defect is stabilized.

## Improvement policy
Allow small, low-risk improvements after the main bug is understood, for example:
- clearer empty or error states
- smoother navigation or route fallbacks
- better labels, copy, or user feedback
- small UX polish that directly supports the tested flow

For larger feature additions, first summarize the idea and get explicit confirmation.

## References
- `references/browser-workflow.md` — detailed autonomous browser testing/fixing sequence
- `references/issue-heuristics.md` — checklist for common defects, weaknesses, and prioritization
- `.claude/rules/25-browser-automation.md` — mandatory headed + persistent browser rules
- `.claude/skills/playwright-cli/SKILL.md` — primary browser skill to use for live interaction
