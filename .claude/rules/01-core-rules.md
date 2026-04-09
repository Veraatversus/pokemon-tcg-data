# Core Operating Rules

## 1. Verify before completion
- Do not say a fix works, tests pass, or a task is done without fresh verification output.
- Run the relevant command, browser check, or validation step first.
- If verification is blocked, state the blocker clearly.

## 2. Debug root cause first
- Reproduce the issue before editing code.
- Read the actual error/output and trace the failing path.
- Prefer one focused fix over stacked guess-fixes.

## 3. Test real behavior
- For UI, search, and routing changes, prefer real browser/smoke validation.
- Add or update regression checks when practical.

## 4. Keep changes minimal and safe
- Preserve data integrity.
- Follow existing patterns and naming.
- Avoid unrelated refactors unless required.

## 5. Respect workflow
- Never push directly to `release`.
- Use `dev`, `main`, or feature branches according to the repo workflow.
- Document meaningful workflow or validation changes.
