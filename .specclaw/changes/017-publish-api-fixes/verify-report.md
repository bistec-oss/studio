# Verification Report: 017-publish-api-fixes

**Verified:** 2026-10-13
**Model:** Claude Opus 5.5 (claude-opus-5-5[1m]), as the orchestrator. Each task had its own `specclaw:code-reviewer` pass.
**Verdict:** PASS

Target: branch `v2`, build HEAD `e539395d`. `specclaw-verify collect` was run at that commit before any 018 code landed.

## Gates

| Gate                     | Result                                                                                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| tsc                      | clean                                                                                                                                                 |
| lint                     | 0 errors (the 7 known warnings)                                                                                                                       |
| unit                     | **2546/2546**                                                                                                                                         |
| build                    | passed                                                                                                                                                |
| Full clean mock E2E (T3) | **387 passed / 3 skipped / 0 failed / 0 flaky**. That is 386 plus the new TC-PUB-10; the skips are the intentional TC-REG-H11a/b/c.                   |
| Fork CI at `e539395d`    | **green**: [run 38436823300](https://github.com/EnderGuardian25/ai-studio/actions/runs/38436823300). e2e 387 passed / 3 skipped; unit and build pass. |

## Acceptance criteria

- ✅ **AC-01 (FR-01): an immediate failure is a 502.**
  - Unit: an immediate `PublishError` gives 502 `{error, code:'PUBLISH_FAILED', postId, status:'FAILED'}`, the PENDING row is created and the last update is FAILED.
  - E2E: TC-PUB-03 expects 502 with `postId` and `status: 'FAILED'`, and the row's `errorReason` matches.
- ✅ **AC-02 (FR-02): a failed retry is a 502.**
  - Unit: a retry that fails again gives 502 in the same shape, with the row FAILED and `nextRetryAt` null.
  - E2E: TC-PUB-03's retry step gives 502 in the same shape.
- ✅ **AC-03 (FR-03): the dialog shows the failure.** TC-PUB-10 publishes a `__FAIL_ALWAYS__` draft through the real dialog:
  - Instagram shows ✕ failed, with the reason visible and set as its checkbox's accessible description, and stays enabled;
  - LinkedIn shows ✓ published and is disabled;
  - the dialog stays open with its summary.
- ✅ **FR-04: the library Retry shows the failure.** `handleRetry` now catches: an error toast on failure, the drawer row patched to FAILED with the reason, and the library invalidated. The T1 review confirmed one toast per outcome.
- ✅ **AC-04 (FR-05): a live post is 409 before the caption check.** Unit: a live post with a refused caption gives 409 with the existing `postId`, and no row is created.
- ✅ **AC-05 (FR-06): the posts list reads captions in one query.**
  - Unit (route): three posts across two drafts run one `draftCaption.findMany` with `draftId in [d1, d2]`, give the correct per-row captions, read a missing row as `''`, and make no single-draft loads.
  - Unit (store): an empty page runs no query; duplicate ids are de-duplicated; nothing is written.
- ✅ **AC-06: all gates pass** (see the table), and `docs/e2e-test-plan.md` describes the 502 contract (the contract rows, TC-PUB-03 and TC-PUB-10).

## Per-task reviews

- T1: NOTE. NOTE 1 (the draft page didn't refetch when the dialog closed after a partial failure) was **fixed** by the orchestrator, with gates re-run.
- T2: NOTE. Implemented by the orchestrator directly. NOTE 1 (a direct `loadCaptionTexts` unit test) is **added**.
- T3: gate only.

## Deviations, all accepted

- **UI additions beyond the spec text:**
  - a success toast on library Retry;
  - an in-place update of the drawer row;
  - a library refetch when the dialog closes;
  - a draft refetch when the dialog closes.
- **`loadCaptionTexts` doesn't fill missing caption rows.** The single-draft readers still do, and the value returned is the same.

## Known gaps, none blocking

- The duplicate-publish check-then-act race (no unique constraint) is still open. It was out of scope by design.

**Code Review:** NOTE. Three tasks: two NOTE (both acted on) and one gate; 0 BLOCK, 0 WARN.
