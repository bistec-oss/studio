# T6 docs: 009-hero-image-design

The documentation half of T6. No command was run (no npm, test, build, node, DB, prisma or docker), and nothing under `src/`, `tests/` or `prisma/` was touched. Nothing committed, pushed or stashed. The orchestrator fills the literal placeholders `E2E_PENDING`, `CI_PENDING`, `UNIT_PENDING` and `RENDER_PENDING` after the gate.

## Edits

1. `docs/e2e-test-plan.md`
   - Status line: the "Latest full clean mock gate" now reads `E2E_PENDING` (009 T6), with the 023 and 016 counts as the history.
   - A 2026-10-21 update note for change 009: the new suite, the one `a11y` case, the Review-step term count 12 to 13 in `model-selection` and `surfaces`, the new seams.
   - New section AA after Z: the seams (`__MOCK_BG__`, the four `__MOCK_HERO_*__` sentinels, `__MOCK_BG_FAIL__`, `__MOCK_BG_NOT_NEEDED__`) and the refine-sentinel gotcha; TC-HERO-01 to TC-HERO-16, each with its AC; the AC map; a pointer to the unit and render coverage and to OP-1.
   - Coverage table: a row for change 009.
   - The CI-gate line now says "section A to section AA".
2. `docs/handoff.md`
   - Header date line and the "Where things stand" table: a 009 row (BUILT, verify next, OP-1 is the user's).
   - A 009 section above the 023 bullet: what it does, T1 to T5 with commits, the fallback rule, the T5 stamp deviation, the design section 9 evidence query, and the OP-1 steps verbatim from `spec.md`, with the closing "failed bar is a result" line.
   - "Check before the merge": a 009 line (check, not blocking): three additive columns, the previous image runs against it, the down script and what it discards, `IMAGE_QUALITY` optional and off by default, no change for existing or scheduled/MCP/ACP runs.
   - "Next" and "Gates now" lines updated (placeholders).
3. `CLAUDE.md` (top entry)
   - The pick-up line now says 009 is BUILT, verify next, OP-1 is the user's pending step.
   - A 009 bullet in the 023 shape (T1 to T5 commits, CI `CI_PENDING`, OP-1 note, classic-by-default and the scheduled/MCP/ACP note). The migration `20261022120000_hero_composition` is named there; the old "Migrations on `v2` not yet on `main`" list sits in a superseded entry and was left alone.
   - "Gates now": `UNIT_PENDING`, `RENDER_PENDING`, `E2E_PENDING`, with the pre-009 baseline.
4. `.specclaw/ROADMAP.md`: the top status line and the 009 table row (Phase 1 built, verify next, OP-1 pending).
5. `.specclaw/changes/009-hero-image-design/design.md` section 8: the `recordRejectedRender` sentence now says it carries the commit stamp (`refineReplacedStamp(prev)` when the background was replaced, else `prev`), "(amended in build, T5)".
6. `.env.example`: no change. T4 already documents `IMAGE_QUALITY` (optional, commented out, with the OP-1 reasoning).

## Notes for the orchestrator

- The AC-23 greps and `git diff --name-only 2ad7431 -- prisma/migrations` belong to the gate half and are not in this report.
- `docs/e2e-test-plan.md` section 7's "Last green run" paragraph was not edited (it is history); only the status line was.
- Line endings: `CLAUDE.md` and `docs/e2e-test-plan.md` are CRLF and stayed CRLF; the other edited files are LF and stayed LF.
