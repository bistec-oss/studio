# Spec: Draft-page async-action settle race (the red fork CI)

**Change:** 015-draft-action-settle-race · **Size:** bounded · **Created:** 2026-10-12

## Overview

Two draft-page client settles fire only when they _observe_ a `pendingAction` transition. When a background action finishes before the post-202 refetch lands, the client goes from `null` straight to `null`, and neither settle runs. This happens every time on the fork CI runner. The two broken outcomes:

- the refine row hangs on "Applying…" with the input disabled;
- the version list goes stale.

The fix makes both settles state-based. The proposal holds the full investigation, including the CI snapshot, the deterministic local repro and the DB state.

## Approach

**Decision:** settle on observed _state_ after an awaited post-202 refetch, never on an observed _edge_. The resolution logic itself is unchanged; only its trigger moves.

**File map:**

- **`src/components/drafts/RefinementPanel.tsx`:**
  - `onActionStarted` becomes `() => Promise<unknown>` and is awaited.
  - A `settleArmed` flag is set once that refetch lands, either in a ref or in state.
  - The resolution effect runs when `resolutionRef` is set, the flag is armed and `pendingAction === null`. It drops the `prev === 'REFINE'` requirement.
- **`src/app/(app)/drafts/[id]/page.tsx`:**
  - The revision list is refetched whenever `draft.currentRevisionNumber` is non-null and missing from `revisions`. The edge-only effect at lines 122–131 is replaced.
  - `fetchDraft` is passed as the awaitable `onActionStarted`.
- **`tests/e2e/settle-race.test.ts` (new):** forces the race by delaying the first post-202 draft GET.

## Requirements

### Functional Requirements

- **FR-01: refine resolves on state.**
  - After the refine POST returns 202, the panel awaits the parent's draft refetch.
  - From then on, the pending row resolves as soon as the polled `pendingAction` is `null`, whether or not `REFINE` was ever observed.
  - The outcome comes from the existing comparisons against the baseline captured at send, in the existing order:
    1. new conflict → conflict;
    2. new not-applied → not-applied;
    3. `pendingActionError` → error;
    4. moved revision → applied, with `onRefined()`;
    5. otherwise → "finished without producing a new revision".
  - The row never resolves before that refetch has landed, so it is never judged against pre-202 state.
- **FR-02: the revision list follows the draft.**
  - Whenever the loaded draft's `currentRevisionNumber` is non-null and no loaded revision has that number, the page refetches the revision list.
  - This covers refine, Regenerate design and any future action, whoever wins the race.
  - It must not loop: the refetch is not re-issued while one is in flight, nor for the same missing number after a refetch that still lacks it.
- **FR-03: a deterministic test of the race.**
  - New E2E cases force the race by holding the first draft GET after the action POST for about 3 s, using `page.route`. The in-process mock action therefore always finishes first.
  - There is one case each for refine and for Regenerate design.
- **FR-04: the audit is recorded.**
  - The build report states the result for each of the other draft-page settles:
    - the design Undo: not affected, because it is captured before firing and has no settle;
    - the `CaptionPanel` undo-clear (`CaptionPanel.tsx:132-138`);
    - the `HeadlinePanel` undo-clear (`HeadlinePanel.tsx:92-98`).
  - The two undo-clears share the edge pattern. The only effect is that, after a regenerate that _failed_ faster than the refetch, an Undo lingers that restores identical text. That is out of scope here; see Edge Cases.

### Non-Functional Requirements

- **NFR-01: no server change.** No route, worker, schema or migration changes. The investigation showed the server is correct.
- **NFR-02: the failing CI case is untouched.** `tests/e2e/surfaces.test.ts` is not edited (`git diff` on it is empty). It must pass on the CI runner exactly as it stands.
- **NFR-03:** no new polling interval and no change to the existing 4 s poll cadence.

## Acceptance Criteria

- **AC-01 (FR-01, FR-03): a refine under a forced race.**
  - The row shows "Applied".
  - The "Refine Design" input is enabled again.
  - "Switch to v1" is visible, which means v2 is in the version list.
  - All of this happens within 15 s.
- **AC-02 (FR-02, FR-03): Regenerate design under a forced race.**
  - The version list contains the draft's new `currentRevisionNumber`, checked by counting "Switch to v" buttons or by an API comparison.
  - "Regenerate design" is enabled again.
- **AC-03 (FR-03): the tests catch the bug.**
  - With the two production changes reverted (a mutation run), AC-01 and AC-02 both fail, for the stated cause: the row stays on "Applying…" and the list stays stale.
  - Restored, they pass.
  - The build report records both runs.
- **AC-04 (FR-01): existing refine outcomes are unchanged.**
  - `tests/e2e/agui-refinement.test.ts` passes, covering conflict → Override, a crashed run → error, and applied.
  - `tests/e2e/refine-not-applied.test.ts` passes, covering not-applied and "Use anyway".
- **AC-05 (NFR-02):** the full clean mock E2E gives 0 failed and 0 flaky, after the standard reset (drop and recreate the test DB, `rm -rf .next`, one fresh :3001 server). `git diff` on `tests/e2e/surfaces.test.ts` is empty.
- **AC-06 (the point of the change): fork CI is green.** The `E2E` workflow run on `v2` at this change's last code commit concludes `success`, including the 375 px "Draft review (T9)" case.
- **AC-07 (FR-04):** the audit result for the three other settles is in the build report.
- **AC-08 (NFR-01, NFR-03):** `git diff` for the change touches no file under `src/app/api`, `src/lib`, `src/scheduler` or `prisma`, and does not change the `4000` poll interval.

## Edge Cases

- **Refetch failure.** `fetchDraft` never rejects. If the request fails, it sets the page's `error` and the page swaps to its error view (`page.tsx:218`), which unmounts the panel. The panel is therefore never left armed against stale state. Arming straight after the awaited refetch is safe on every path. (Corrected during T2, which read the code; the planned wording assumed the next poll would resolve the row.)
- **Override and "Use anyway"** are synchronous and do not use the resolution path. They stay unchanged.
- **Two refines in a row.** The input is disabled until the first resolves (`awaitingResolution`), so there is never more than one pending resolution. That is unchanged.
- **The caption/headline undo-clear edge, out of scope.** A regenerate that fails faster than the refetch leaves an Undo that restores identical text. This is harmless, so it is logged as a follow-up rather than fixed here. The fix there would need the same "armed after the awaited refetch" flag inside `CaptionPanels`.

## Dependencies

None. The fix builds on 011, 014 and 012 as committed on `v2`.
