# Verification Report: 015-draft-action-settle-race

**Verified:** 2026-10-12
**Model:** claude-opus-5-5 (Opus 5.5)
**Verdict:** PASS

HEAD `7498966f`; last code commit T2 `df27ff49`. `git diff --stat df27ff49 HEAD -- src tests prisma` is empty: the later commits (`c4b80522` T3, `7498966f` build-complete) are docs and bookkeeping only.

## Acceptance Criteria

| AC                                              | Status | Evidence                                                                                                                                                                                                                                                                                                                                                                                         | Note                                                                                                                                    |
| ----------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| AC-01 (refine under a forced race)              | ✅ met | `tests/e2e/settle-race.test.ts:48-65` TC-RACE-01: `Applied` visible within `timeout: 15_000`, `ask` `toBeEnabled()` (:61), `Switch to v1` visible (:62), Current item `v2`, `held()` true (:64). Fix: `RefinementPanel.tsx:175-176` `await onActionStarted()` → `setSettleArmed(true)`; `:112` `if (!res \|\| !settleArmed \|\| pendingAction !== null) return`. T2 report: "2 passed (11.5 s)". | Settles on state after the awaited refetch; the `prev !== 'REFINE'` edge is gone.                                                       |
| AC-02 (Regenerate design under a forced race)   | ✅ met | `settle-race.test.ts:68-82` TC-RACE-02: Current item contains `v2` within 15 s, `Switch to v1` visible (:79), `regen` `toBeEnabled()` (:80), `held()` true (:81). Fix: `page.tsx:128-135`, the list is refetched when `currentRevisionNumber` is missing from `revisions`.                                                                                                                       | It checks the Current marker and the "Switch to v1" button, which is the button-count form of the AC.                                   |
| AC-03 (the tests catch the bug)                 | ✅ met | T1 report, unfixed code: `✘ settle-race.test.ts:48` (`'Applied'` not found) and `✘ :68` (`listitem` filtered on `Current`, not found), `2 failed`. T2 report, mutation: reverting only RefinementPanel fails only TC-RACE-01; reverting only page.tsx fails only TC-RACE-02; restored → 2/2. Matches the orchestrator's observed runs.                                                           | Each case fails for its stated cause: the row stays on Applying… and the list stays stale. Both runs are recorded in the build reports. |
| AC-04 (existing refine outcomes unchanged)      | ✅ met | T2 report and orchestrator run: settle-race + `agui-refinement` + `refine-not-applied` → **42 passed, 0 failed**. Outcome branches `RefinementPanel.tsx:115-135` keep their order (conflict → not-applied → error → applied+`onRefined()` → "finished without producing a new revision"); the diff touches only the guard and its deps.                                                          | Only the trigger moved.                                                                                                                 |
| AC-05 (full clean mock E2E, surfaces untouched) | ✅ met | T3 report and orchestrator run at `df27ff49`, after `rm -rf .next`, a DROP and recreate of the test DB and a single fresh :3001 server: **371 passed / 3 skipped / 0 failed / 0 flaky**, exit 0. `git diff a3510b87 HEAD -- tests/e2e/surfaces.test.ts` is empty (re-checked).                                                                                                                   | The 3 skips are the standing TC-REG-H11a/b/c.                                                                                           |
| AC-06 (fork CI green)                           | ✅ met | `gh run view 38195143494`: `"conclusion":"success"`, `"headSha":"df27ff4903994f11b7a250905e54172126a7f413"`, `"headBranch":"v2"`, workflow `E2E (security-fix regression gate)`; jobs e2e / unit / build all `success`. Orchestrator: the E2E job had 371 passed / 3 skipped, including the 375 px `surfaces` "Draft review (T9)" case.                                                          | It runs at the change's last code commit, and it is the first green `v2` run since 2026-10-09.                                          |
| AC-07 (FR-04 audit in the build report)         | ✅ met | `reports/T2.md` § "FR-04 audit": design Undo is not affected (captured before firing, with no settle); the `CaptionPanel.tsx:132-138` and `HeadlinePanel.tsx:92-98` undo-clears share the edge, cosmetic only.                                                                                                                                                                                   | The leftover Undo edge is logged as a follow-up (T3, CLAUDE.md, handoff).                                                               |
| AC-08 (no server change, poll unchanged)        | ✅ met | `git diff --stat a3510b87 HEAD -- src/app/api src/lib src/scheduler prisma` is **empty** (re-checked). `page.tsx:118` `setInterval(fetchDraft, 4000)`; no `4000` line appears in the change's `src` diff.                                                                                                                                                                                        | The only `src` files touched are `RefinementPanel.tsx` and `drafts/[id]/page.tsx`.                                                      |

- ✅ **AC-01:** A refine under a forced race shows "Applied", re-enables the input and shows "Switch to v1" within 15 s. TC-RACE-01 passes, and the panel arms after the awaited refetch (`RefinementPanel.tsx:175-176`, `:112`).
- ✅ **AC-02:** Regenerate design under a forced race lists the new revision and re-enables the button. TC-RACE-02 passes, and the list follows the draft (`page.tsx:128-135`).
- ✅ **AC-03:** The tests catch the bug. Both cases failed on the unfixed code for the stated cause. Each half-revert fails only its own case, and both pass once restored.
- ✅ **AC-04:** The existing refine outcomes are unchanged: 42/0 across settle-race, agui-refinement and refine-not-applied, with the branch order untouched.
- ✅ **AC-05:** The full clean mock E2E gives 371/3/0/0 after the standard reset, and the `surfaces.test.ts` diff is empty.
- ✅ **AC-06:** Fork CI run 38195143494 at `df27ff49` on `v2` concluded success on every job.
- ✅ **AC-07:** The audit of the three other settles is in `reports/T2.md`.
- ✅ **AC-08:** There is no diff under `src/app/api`, `src/lib`, `src/scheduler` or `prisma`, and the 4000 ms poll is unchanged.
  - ⚠️ Edge case: none affects an AC. The T2 review notes are assessed below.

## Gates

| Gate                | Result                                  | Source                                                                                           |
| ------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Lint                | pass: 0 errors, 7 pre-existing warnings | `logs/lint-npm-run-lint-31833.log`: `✖ 7 problems (0 errors, 7 warnings)`                        |
| Build               | pass                                    | `logs/build-npm-run-build-31875.result`: `exit=0` at `7498966f`                                  |
| Unit                | pass: 74 files / 2025 tests             | `logs/test-npm-run-test-unit-31924.log`: `Test Files 74 passed (74)`, `Tests 2025 passed (2025)` |
| Targeted E2E        | 42 passed / 0 failed                    | settle-race + agui-refinement + refine-not-applied (T2, orchestrator)                            |
| Full clean mock E2E | 371 / 3 / 0 / 0                         | T3 report, orchestrator run at `df27ff49`                                                        |
| Fork CI             | success (e2e, unit, build)              | run 38195143494, headSha `df27ff49`                                                              |

## Reviews

- T2 — NOTE
- T1 and T3 were not reviewed separately: T1 is test-only, and T3 is docs.

**The T2 review notes, judged against the ACs:**

1. **A failed `fetchRevisions` is never retried** (`page.tsx:132-133`). The guard sets the number before the fetch, and `fetchRevisions` swallows errors. FR-02 requires "not re-issued … for the same missing number after a refetch that still lacks it", so this is the specified no-loop behaviour. The list recovers through `refreshAfterChange` or a reload. **It does not undermine AC-02,** which tests the success path.
2. **The rare out-of-order poll overwrite** (`RefinementPanel.tsx:170-176`). It needs a poll that is in flight when the refine is sent and answered after the awaited refetch, while the input is disabled. The worst outcome is a false "finished without producing a new revision" error row, never a hang. **It does not undermine AC-01,** which is deterministic under the forced hold.
3. **The race is forced only for the applied outcome.** Conflict, error and not-applied under the race rely on the unchanged branch logic (identical code, same order) plus the non-raced AC-04 suites. The ACs do not require raced coverage of those outcomes, so **no AC is affected**. An optional raced not-applied case would harden it.

## Test Results

```
T1 (unfixed code): settle-race.test.ts --retries=0
✘ 1 settle-race.test.ts:48 › a refine that finishes before the post-202 refetch still resolves to Applied
✘ 2 settle-race.test.ts:68 › a design regenerate that finishes before the post-202 refetch still lists the new revision
2 failed

T2 (fixed): settle-race.test.ts --retries=0 → 2 passed (11.5s)
T2 mutation: RefinementPanel reverted → TC-RACE-01 ✘, TC-RACE-02 ✓; page.tsx reverted → TC-RACE-01 ✓, TC-RACE-02 ✘; restored → 2/2
Targeted: settle-race + agui-refinement + refine-not-applied → 42 passed, 0 failed

T3 full clean mock E2E (df27ff49): 3 skipped, 371 passed (8.0m), 0 failed, 0 flaky
Fork CI 38195143494 (df27ff49, v2): conclusion success; e2e success, unit success, build success
Unit (HEAD): Test Files 74 passed (74); Tests 2025 passed (2025)
```

## Issues Found

No blocking issues found. These non-blocking follow-ups are already logged or optional:

1. **The caption/headline undo-clear uses the same observed edge.** After a regenerate that fails faster than the refetch, a leftover Undo restores identical text. It is out of scope by the spec. **Fix:** the same "armed after the awaited refetch" flag in `CaptionPanels`. It is logged in CLAUDE.md and the handoff.
2. **A transient revision-list failure is not retried** (T2 review NOTE 1). **Fix (optional):** clear `requestedRevisionRef` in `fetchRevisions`' catch.
3. **There is no raced case for not-applied or error** (T2 review NOTE 3). **Fix (optional):** add one raced `__REFINE_*` not-applied case to `settle-race.test.ts`.

## Summary

**Passed:** 8/8 criteria
**Failed:** 0/8 criteria
**Verdict:** PASS
