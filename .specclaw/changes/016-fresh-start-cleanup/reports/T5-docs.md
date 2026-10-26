# T5 (docs half) report — live docs updated for 016

**Implemented by:** docs subagent; condensed by the orchestrator.

- **`docs/handoff.md`:**
  - a new **016 runbook** section (what was removed; the deploy rule "fresh systems only", with the RAISE message quoted and its fix; the zero-team first run; `db:seed` being a demo seed; the rollback);
  - "Removed by 016" banners and strikethroughs on the 008 rollback, the 012 runbook (backfill, report, rollback, roll-forward), the 012 decisions and gotchas, the L22 follow-up, the 2026-07-28 heal part 3, `migrate-to-teams`, the Part B `fix-data-uri-logos` and Machine-1 TODO, and the 2026-07-17 transfer section.
- **`CLAUDE.md`:**
  - "(removed by 016)" notes on the matching history bullets;
  - the Testing bullet now lists §W less 11/12/13/19 and §Y less 12.
- **`docs/e2e-test-plan.md`:**
  - a 016 update block;
  - §W cases TC-CAP-11/12/13/19 struck through as removed by 016; TC-CAP-16 rewritten;
  - §Y TC-MODEL-12 struck through; AC-23 rows marked removed;
  - the stale PATCH route row fixed.
- **`docs/mcp-acp-guide.md`:**
  - `captions`: missing channels are filled with an empty READY entry;
  - `headline`: null only until it is written, and the design then falls back to the topic.
- **`docs/cold-start.md` §5:** the migrations create no team; on a fresh system, run only `seed-admin`, then create the first team at `/admin/teams`.
- **`docs/ui-reference/DESIGN_SYSTEM.md`:** the caption "Review" notice row is marked removed by 016.
- **Final grep** for the removed script, rollback and helper names in `*.md`, excluding history: every remaining hit is a 016 decision line, struck through, or under a "Removed by 016" banner.

## Verification

Command: npx prettier --check CLAUDE.md docs/handoff.md docs/e2e-test-plan.md docs/mcp-acp-guide.md docs/cold-start.md docs/ui-reference/DESIGN_SYSTEM.md
Exit: 0
