# .claude System Layout

This repository uses a **Claude-native, rules-first** setup.

## Recommended structure
- `CLAUDE.md` — short, root-level entry point with the most important rules and links
- `.claude/rules/` — modular rule files, ordered from general to specific
- `.claude/skills/` — optional task-specific workflows or reusable guidance
- `.github/copilot-instructions.md` — compatibility bridge only for tools that still read GitHub/Copilot instructions first

## Best-practice maintenance rules
1. Keep the **authoritative behavior** in `CLAUDE.md` and `.claude/rules/`.
2. Avoid duplicating the same repo rules in multiple places.
3. If a rule grows large, move it into a dedicated file under `.claude/rules/`.
4. Keep rule filenames ordered and readable, for example:
   - `01-core-rules.md`
   - `10-repo-context.md`
   - `20-frontend-tracker.md`
   - `30-data-editing.md`
   - `40-git-workflow.md`
5. Leave `.github/copilot-instructions.md` as a pointer/bridge instead of a second rule source.

## Intent
This makes the project less tool-dependent and easier to reuse across Claude-native and other agent systems.
