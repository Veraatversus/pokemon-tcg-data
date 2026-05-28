# Full E2E Liveflow Audit + Improvement Plan (2026-05-25)

## Goal
Run a logged-in end-to-end test over the whole app (not only set view), capture real defects, and convert them into a prioritized execution plan.

## Scope Executed (Live)
- Core app flow with active Google login and active spreadsheet
- Dashboard: filter/search and card-to-set navigation
- Set view: card interactions and write flow (G/RH and save state)
- Search: query flow and result action navigation
- Stats: view load and price insight tab switching
- Global dialogs: share dialog, settings dialog, spreadsheet dialog state behavior
- Public pages: landing page, privacy page, contact page

## Validated Working Paths
- Logged-in state persisted and usable for writes
- New spreadsheet is active and writes complete with save-state transitions
- Dashboard filter works (result count changed from 225 to 9 on filter input)
- Dashboard card action navigates into set view
- Search returns results and action button navigates to target set hash (example: #set/TCGDEX-A3)
- Stats price tabs switch active state correctly
- Public pages (landing/privacy/contact) are reachable and render cleanly

## Findings (ordered by severity)

### High: Widespread mojibake/static text corruption in runtime UI
Evidence from source indicates corrupted literals in many user-visible strings:
- frontend/tcg-tracker-web/js/app.js:517
- frontend/tcg-tracker-web/js/app.js:597
- frontend/tcg-tracker-web/js/app.js:1532
- frontend/tcg-tracker-web/js/app.js:2463
- frontend/tcg-tracker-web/js/app.js:2871
- frontend/tcg-tracker-web/js/app.js:4735

Impact:
- App shows ? and replacement glyphs in key flows (search mode badges, save labels, stats copy, dashboard action buttons, spreadsheet dialogs)
- Trust and readability are significantly reduced across almost all views

### High: Search result and dashboard action labels are visually broken
Evidence:
- Search result action button is rendered as "?" but still navigates
- Dashboard action controls contain placeholders like "???" and "? Importieren"
- frontend/tcg-tracker-web/js/app.js:2871

Impact:
- Action discoverability is low
- UX appears broken even when behavior works

### Medium: Multiple modal dialogs can remain open concurrently
Observed:
- Share dialog and settings dialog open at same time (two open dialogs)

Impact:
- Focus/keyboard behavior can become inconsistent
- Accessibility and user control degrade

### Medium: Repeated 404 resource errors during app usage
Observed in browser console events while using search/set flow.
Likely contributors:
- broken/empty image sources in DOM samples
- one image source resolved to app root URL
- set symbol source empty on some set contexts

Impact:
- noisy console and possible UI artifacts
- unnecessary network overhead

### Medium: Broken image fallback consistency issues
Observed in live DOM scan:
- broken image source to app root URL
- empty set symbol source

Impact:
- visual defects in card/set areas
- contributes to 404 noise and inconsistent card tiles

## Root Cause Clusters
1. **Source-string corruption inside monolithic app.js**
   Corruption is not only remote-data-based; many literals are already broken in code.
2. **Fragmented rendering responsibilities**
   UI text is generated in multiple legacy/new modules, increasing drift and inconsistencies.
3. **Dialog lifecycle not globally coordinated**
   No strict single-modal policy in global UI layer.
4. **Asset fallback policy is incomplete**
   Empty/invalid logo/symbol/image URLs can still leak into DOM.

## Execution Plan

### Phase 1 - Stop the visible bleeding (quick wins, 1 wave)
- Build a "text repair map" and replace corrupted literals in frontend/tcg-tracker-web/js/app.js for top-priority surfaces:
  - save state, search mode labels, search status, dashboard action labels, dialog titles/buttons, stats hero copy
- Replace symbolic placeholders with stable explicit labels/icons in dashboard/search action buttons
- Add a small guard utility for button labels to block "?"/"???" fallbacks in interactive controls
- Add a smoke assertion in UI tests: no critical controls may render as single "?"

Exit criteria:
- No broken control labels in Dashboard/Search/Stats/Dialogs
- Save/search/status copy is readable in all tested routes

### Phase 2 - Fix modal and navigation UX integrity
- Enforce single-open-dialog policy in UI shell:
  - opening one app modal must close or suspend others
  - Esc and close actions always resolve top-most modal deterministically
- Add regression tests for overlapping dialog prevention

Exit criteria:
- share/settings/spreadsheet dialogs cannot overlap in open state

### Phase 3 - Asset and 404 hardening
- Normalize set symbol/logo/image fallback chain before DOM render
- Block empty src assignment for images at render boundaries
- Add diagnostics around failed asset resolution by set/card context

Exit criteria:
- 404 console noise reduced for routine dashboard/search/set navigation
- broken image count in E2E scan equals 0 for tested route sample

### Phase 4 - Monolith reduction for sustainable quality
Priority split candidates in app.js:
1. search mode/status + result action label pipeline
2. stats narrative/copy rendering
3. dashboard card action rendering
4. dialog orchestration (share/settings/spreadsheet)

For each split:
- move to dedicated module
- keep one owner for display text constants
- add focused unit tests per module

Exit criteria:
- app.js no longer owns the above text-critical blocks
- new modules have dedicated tests

### Phase 5 - Extension opportunities (after stabilization)
- Add i18n-ready text catalog (de/en) and strict key-based rendering
- Add in-app "encoding health" debug panel for broken-string detection in CI and runtime diagnostics
- Add proactive icon-label accessibility checks for all action buttons

## Test Strategy for the Plan
- Manual live E2E checkpoints: dashboard -> set -> search -> stats -> dialogs -> public pages
- Automated smoke checks:
  - no critical "?" labels on actionable buttons
  - no replacement glyphs in key status labels
  - no multi-open modal state
  - no empty image src in rendered card/set controls

## Recommended Order of Work
1. Phase 1
2. Phase 2
3. Phase 3
4. Phase 4
5. Phase 5
