# Verification Report: 018-post-008-small-fixes

**Verdict:** PASS (CI half of AC-08 pending, the orchestrator appends it)
**Verified:** 2026-10-18
**Model:** Claude Sonnet 5.5 (claude-sonnet-5-5), as the verify agent, read-only.

Target: branch `v2`, HEAD `432a036`. Build commits: `8546451` (T1 WIP), `18b611d` (T1), `a3ea167` (T2), `ef1475a` (T3), `9a9a6b2` (T4). `.specclaw/context.md` does not exist, so there are no context rules to check.

## Gates

| Gate                | Result                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| tsc                 | clean (T4 report)                                                                                                              |
| lint                | 0 errors, the 7 known warnings (collect: `lint_passed: true`)                                                                  |
| unit                | **2556/2556**, 91 files (collect `test_output`; `tests_passed: true`)                                                          |
| build               | passed (collect: `build_passed: true`)                                                                                         |
| Full clean mock E2E | **390 passed / 3 skipped / 0 failed / 0 flaky** (T4 report). That is 387 plus TC-RACE-03/04/05; the skips are TC-REG-H11a/b/c. |
| CI at `432a036`     | pending, the orchestrator appends                                                                                              |

## Acceptance criteria

- MET **AC-01 (FR-01).**
  - The `generate_post` output schema at `src/acp/agent.ts:44` lists `headline` and `captions`.
  - The handler returns them at `src/mcp/tools/generate.ts:95`.
  - The drift guard is `tests/unit/mcpGetDraft.test.ts:231`.
  - `reports/T1.md` ("AC-01 mutation proof") mutates each side in turn, shows the guard failing, and restores both files (`git diff` empty, 18/18 pass).
- MET **AC-02 (FR-02).**
  - Unit: `src/lib/models/policyForm.ts:68-91` builds "Sonnet 5.5; Haiku 4.5 on template drafts". `tests/unit/modelPolicyForm.test.ts:118,121,165` cover the dual label for REFINE. The same file covers the unchanged label for other surfaces and for matching paths.
  - E2E: `tests/e2e/model-selection.test.ts:664` asserts the Refine row reads the new text. The full run is green.
- MET **AC-03 (FR-03).**
  - The "Known edge case" comment now sits at `src/lib/agent/claudeCli.ts:347`, directly above `withAuthRetry`.
  - `src/mcp/tools/generate.ts:24` reads "the team's model policy and system defaults (src/lib/models)".
- MET **AC-04 (FR-04).** `tests/unit/draftDetailGet.test.ts:132` has two cases: one asserts `select: { providerName: true }` on both `findFirst` tiers, the other proves the lookup runs concurrently with `resolveBrandKit`. T1 mutated the second (awaited `resolveBrandKit` first) and it went red. `findCopyProviderRecord` in `src/providers/registry.ts:54` now takes a typed `select`.
- MET **AC-05 (FR-05).**
  - TC-RACE-03 (caption) and TC-RACE-04 (headline) are in `tests/e2e/settle-race.test.ts`. They hold the first post-202 GET for 3 s and assert no Undo for an identical result.
  - `reports/T2.md` records the mutation run: with the arm removed (CaptionPanel:228, HeadlinePanel:170) both cases went RED, then the fix was restored and the targeted run was 21/21.
  - `reviews/T2.md` confirms the match to the RefinementPanel `settleArmed` pattern.
- MET **AC-06 (FR-06).** TC-RACE-05 forces one 500 on `/revisions` after a regenerate-design 202 and expects `v2` with no reload. It passed in the full run. T2 also ran a no-retry mutation (pre-T2 `page.tsx`), which turned the case RED. The review confirms the backoff (2, 4, 8 s), the cap at 3 tries, and that a success lacking the number is never retried.
- MET **AC-07 (FR-07).**
  - `tests/helpers/axe.ts` exists. a11y, captions and model-selection (and surfaces) import `expectNoAxeViolations` from it, and a grep finds no local axe copies.
  - TC-MODEL-14 has the new asserts: the Sonnet caption pick, the autosave payloads, the resume, `captionModel: 'SONNET'` in the brief body and the stored row, the stamps, and the CAPTION `request` run. A mutation run (removing `captionModel` from `useBriefWizard.ts`) went red, then the file was restored. All of it passed in the full run.
  - `uiTokenGuard` has the digit-suffixed flag cases. With the old regex put back, exactly those 2 cases failed.
  - The wave-2 `afterEach` early return is in T3 scope, and the full run is green.
- MET **FR-08 (no AC of its own).** `BriefingAssistantPanel.tsx` imports and uses `EYEBROW` (lines 14, 278, 351). DESIGN_SYSTEM line 444 lists `COMPACT_TEXTAREA` (also added to the guard's `SHARED_NAME`).
- PARTIAL **AC-08.**
  - Local half: MET. tsc is clean, lint has 0 errors, unit is 2556/2556, build passes, and the full clean mock E2E has 0 failures (T4 report: clean DB, `rm -rf .next`, a single server).
  - CI half: pending, the orchestrator appends the result for `432a036`.

## Per-task reviews

- T1 — NOTE
- T2 — WARN(1) (resolved): two set-state-in-effect lint warnings, which the orchestrator suppressed with targeted eslint-disable comments. Lint is back at the 7-warning baseline.
- T3 — NOTE
- T4 — no review (gate task)

## Deviations, all accepted

- T3 also added `COMPACT_TEXTAREA` to `SHARED_NAME` in `uiTokenGuard.test.ts:61`, so the documented list and the guard stay identical. This is a small addition beyond the doc line.
- The top "PICK UP HERE" section of `docs/handoff.md` still says 018 T1 WIP. T4 left it for the orchestrator's close-out.

## Known gaps, none blocking

- The CI result for `432a036` is not yet known.

**Code Review:** NOTE. Three reviewed tasks: two NOTE, one WARN (resolved); 0 BLOCK.

## CI (orchestrator, appended)

CI run 39150018642 (bistec-oss/studio, `E2E (security-fix regression gate)`, push to v2) at HEAD `432a036f`: **success**. AC-08 is fully MET.
