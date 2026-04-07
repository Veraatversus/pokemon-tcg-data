# Autonomous Browser Workflow

Use this reference when the task is: “try this live in the browser, find what is wrong, and fix it.”

## Step 1 — Define the target flow
Turn the request into one concrete browser mission.

Examples:
- “Open the search page, try a query, and see what breaks.”
- “Go through the login or settings flow and identify weaknesses.”
- “Try the action I described and fix the problem you discover.”
- “Search for an API-only card result, click `Zum Set`, and verify the set loads and the matching card is visible immediately.”

If the user asks for a broad review, start with one important journey first:
1. landing/opening flow
2. primary search/filter flow
3. form submission or settings flow
4. navigation/routing flow

## Step 2 — Reuse the persistent headed browser
Follow `.claude/rules/25-browser-automation.md`:
- keep the browser visible
- keep the same profile/session
- prefer the existing Playwright workflow
- do not switch to a fresh headless session for live validation unless unavoidable

## Step 3 — Observe before editing
Collect evidence from the live system first:
- visual breakage
- no-op clicks
- wrong navigation or routing
- empty result states that should not be empty
- console errors
- failed network requests
- stale cache or version mismatches
- auth/session expiry behavior

## Step 4 — Prioritize findings
Fix issues in this order:
1. blockers / broken core behavior
2. incorrect data or dangerous behavior
3. clear regressions
4. weak UX/error messaging
5. optional polish and ideas

## Step 5 — Make one focused fix
After reproduction:
- inspect the relevant files
- form one root-cause hypothesis
- make one focused change
- add a regression check or smoke when practical

Avoid stacking many speculative fixes at once.

## Step 6 — Re-run the exact flow
Verify with the same path used for reproduction.

Minimum verification should include:
- the user-facing flow now behaves correctly
- no new obvious console or navigation failure appears
- any relevant smoke/test command still passes or fails only for a clearly stated external reason

## Example validation: search result to set view
For search/navigation regressions, explicitly verify:
1. a query returns an API-only result
2. clicking `Zum Set` opens the correct `#set/<id>` route
3. the set selector and card grid actually load
4. the matching card is visible immediately or scrolled into view
5. the user is not left at the top of a large set with no clue where the searched card is

## Step 7 — Offer improvement ideas responsibly
Once the core issue is stabilized, suggest nearby improvements such as:
- stronger empty/error states
- clearer button labels or guidance text
- better fallback behavior
- small accessibility or feedback enhancements

Do not silently add major product features without confirmation.
