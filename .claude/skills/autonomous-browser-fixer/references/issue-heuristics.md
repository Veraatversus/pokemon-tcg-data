# Browser Issue Heuristics

Use this checklist to decide what to inspect while autonomously testing a live browser flow.

## 1. Functional breakages
Look for:
- buttons or links that do nothing
- actions that change the hash/URL but do not update the view correctly
- forms that submit with no visible result
- filters/search controls that show empty or wrong results
- loading states that never resolve
- cross-view navigation that lands in the right route but fails to reveal the intended record/card/item

## 2. Console and network signals
Inspect for:
- uncaught exceptions
- failed module/resource loads
- 401/403 auth failures
- 404 or broken asset paths
- CORS/session-related browser errors

## 3. Data/state mismatches
Look for:
- state says success but UI remains empty
- selector values not matching the active route
- stale cached data after code changes
- imported/local data and API/live data behaving differently

## 4. UX weaknesses
Notice:
- unclear feedback after actions
- hidden failure states with no message
- weak empty-state wording
- awkward flows with too many clicks or unclear navigation
- inconsistent labels in DE/EN contexts

## 5. Auth/session problems
Check whether:
- the flow only fails because login is expired
- the persistent profile has been replaced or lost
- the app needs a graceful message instead of silently failing

## 6. Prioritization rubric
### P0 — immediate fix
- broken primary flow
- data loss risk
- navigation dead-end
- repeated crash or hard failure

### P1 — strong candidate for autonomous fix
- confusing but reproducible UX problem
- missing fallback or error message
- routing/search inconsistency
- stale asset/cache issue after deployment or update

### P2 — suggestion/polish
- wording improvements
- layout polish
- minor discoverability improvement
- optional convenience enhancement

## 7. Reporting format
After exploration, structure the result as:
1. Observed issue
2. Evidence from the live browser
3. Root cause
4. Fix applied or recommended
5. Verification result
6. Optional improvement ideas
