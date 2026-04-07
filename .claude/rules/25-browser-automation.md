# Browser Automation Rules

Use this rule whenever browser interaction or web-app validation is needed.

## Required browser mode for live-system checks
- Always start the browser in **headed mode** for live/local validation.
- Always use **persistent mode** with the **same profile directory** so login/session data is reused across runs.
- Reuse the existing session/profile instead of creating fresh ephemeral browser contexts unless there is a strong reason not to.

## Required tooling
- Browser usage should go **exclusively through the Playwright-based workflow/skills**, especially the `playwright-cli` skill.
- Prefer `/playwright-cli` style workflows and commands over ad-hoc browser approaches.
- Use the `autonomous-browser-fixer` skill when the task is to explore a live flow, discover issues autonomously, and then fix or improve the code.
- For this repository, keep browser validation aligned with the existing persistent tracker session/profile pattern.

## Practical expectations
- For `frontend/tcg-tracker-web`, use the persistent headed browser against `http://localhost:8080`.
- Preserve the same profile so Google login state and other auth/session data survive between checks.
- If the stored session is no longer valid, state that clearly and re-auth only within the persistent headed browser flow.

## Do / Don't
### Do
- Reuse the same persistent browser profile.
- Keep testing visible in headed mode.
- Use Playwright/browser smoke checks for verification.

### Don't
- Do not use one-off headless browser sessions for live-system validation by default.
- Do not switch to a different browser automation path when the Playwright skill/workflow is available.
- Do not silently discard session state by using temporary fresh profiles for auth-dependent checks.
