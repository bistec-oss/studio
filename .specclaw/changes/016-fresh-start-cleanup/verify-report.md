# Verification Report: 016-fresh-start-cleanup

**Verified:** 2026-10-13
**Model:** Claude Opus 5.5 (claude-opus-5-5[1m]), as the orchestrator. Each task had its own `specclaw:code-reviewer` pass.
**Verdict:** PASS

Target: branch `v2`, build HEAD `dc33c663` (T5). The evidence comes from:

- `specclaw-verify collect`, run at `dc33c663` before any 017 code landed;
- the T5 full clean mock E2E;
- the per-task reports and reviews;
- fork CI (below).

## Gates

| Gate                                                                       | Result                                                                                                                                                                                                  |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| tsc                                                                        | clean                                                                                                                                                                                                   |
| lint                                                                       | passed: 0 errors, 7 known warnings                                                                                                                                                                      |
| unit                                                                       | **2538/2538** (91 files)                                                                                                                                                                                |
| build                                                                      | passed                                                                                                                                                                                                  |
| Full clean mock E2E (T5: dropped test DB, `test:e2e:db`, one :3001 server) | **386 passed / 3 skipped / 0 failed / 0 flaky**. That is 391 minus the 5 legacy cases removed on purpose (TC-CAP-11/12/13/19, TC-MODEL-12); the skips are the intentional TC-REG-H11a/b/c.              |
| Fork CI at `dc33c663`                                                      | **green**: [run 38432519271](https://github.com/EnderGuardian25/ai-studio/actions/runs/38432519271). e2e 386 passed / 3 skipped; unit and build (including `docker build` and the render harness) pass. |

## Acceptance criteria

- ✅ **AC-01 (FR-01): the five scripts are deleted** (T1).
  - `git grep` for their names, outside history, finds no code reference.
  - Every live-doc hit is marked as removed or historical (T5 docs report).
- ✅ **AC-02 (FR-02): the migration applies on a fresh DB and refuses a legacy DB.**
  - On a fresh scratch DB, `migrate deploy` applies `20261013120000_drop_legacy_captions`, the four schema items are gone, and `migrate diff` against `schema.prisma` reports no difference.
  - With an unmigrated legacy draft, the migration raises the FR-02 message (P0001) and drops nothing. With one caption row added, it applies cleanly (T2 report, verbatim output).
- ✅ **AC-03 (FR-03): the loader is read-only.** New `captionStore` cases cover:
  - reads rows with no writes;
  - selects only `captions`;
  - fills one or all missing channels.

  `git grep copyText src/` leaves only the kept `{copyText}` PATCH-rejection comments.

- ✅ **AC-04 (FR-03): the backfill is gone from boot and build.** `docker-entrypoint.sh` and the `Dockerfile` no longer reference it, the worker bundle and the migrate step are intact (T2 review), and CI's `docker build` passes (see the CI row).
- ✅ **AC-05 (FR-04/05): the heal and the legacy guards are gone without regressions.**
  - The reshaped `draftRecovery` unit tests pass.
  - TC-ASYNC-10, §Q, the refine suites and regenerate-design pass, both in the T3 targeted E2E (145/145) and in the full gate.
  - The T3 review verified that no fresh-data state reaches the removed branches (the IN_PROGRESS writers; every `htmlContent` writer also sets the pointer).
- ✅ **AC-06 (FR-07): the `copyText` alias is gone.** `mcpGetDraft.test.ts` asserts `copyText` is absent, and `headline` and `captions` are exact, for `get_draft`, `generate_post` and `/api/generate/copy`.
- ✅ **AC-07 (FR-06): the 012 and 008 rollbacks are gone.** Both down scripts, TC-CAP-13 and TC-MODEL-12 are deleted, and `docs/e2e-test-plan.md` §W/§Y and the AC maps are updated.
- ✅ **AC-08 (FR-08): no pre-made team on a fresh DB.**
  - Fresh scratch DB after `migrate deploy`: 0 teams.
  - The default team is kept when it has a member, and also when its only row is an ApiKey.
  - The test DB seeds Bistec, ClientX and NoKitCo by name, and the full E2E passes (T4 report).
- ✅ **AC-09 (FR-09): the zero-team screen.** `noTeamNotice.test.ts`:
  - a super admin gets "No teams yet" and `<a href="/admin/teams">Create a team</a>`;
  - everyone else gets the exact previous markup.
- ✅ **AC-10 (FR-10): the down script works.**
  - It re-adds the enum and columns and un-records both 016 migrations.
  - It is idempotent.
  - Roll-forward re-applies both migrations.
  - `migrate diff` of the rolled-back DB against the pre-016 schema is empty (T4 report).
- ✅ **AC-11: all gates pass.** See the table.
- ✅ **AC-12: the live docs are updated.**
  - `CLAUDE.md`, `docs/handoff.md` (a new 016 runbook, with removed sections bannered), `docs/e2e-test-plan.md`, `docs/mcp-acp-guide.md`, `docs/cold-start.md` and `DESIGN_SYSTEM.md`.
  - Prettier check passes.

## Per-task reviews

- T1: done by the orchestrator directly (a five-file deletion). Gates were green; there was no separate review.
- T2: NOTE. It asked for the FR-03 wording fix (READY, not PENDING), which is applied. One minor WARN: the E2E check of the regenerate-design topic fallback went with TC-CAP-11, but unit tests still cover it.
- T3: NOTE.
- T4: NOTE.
- T5: docs and gate; no code.

## Deviations, all accepted

- **FR-03 wording:** the missing-channel fill creates READY rows, which is the existing behaviour (NFR-02). The spec is corrected.
- **FR-08 is stricter:** the default team is also kept when it holds a team Claude token.
- **The fixed id is gone:** the test DB's "Bistec" team now has a cuid id from `seed-teams`. Nothing depended on the fixed id.

## Known gaps, none blocking

1. No E2E case covers the zero-team dashboard, because the seeded test DB always has teams. The unit test covers it.
2. The regenerate-design topic fallback on a null headline is now covered by unit tests only.
3. **An old database that still holds unmigrated legacy captions fails `migrate deploy` by design.** The fix is a reset (the fresh start). This is documented in the handoff's 016 runbook.

**Code Review:** NOTE. Five tasks: one direct, three NOTE, one docs; 0 BLOCK, 1 minor WARN.
