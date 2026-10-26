# Proposal: Draft-page async-action settle race (the red fork CI)

**Created:** 2026-10-12
**Status:** 🟡 Draft

## Problem

**Fork CI on `v2` has been red since 014 wave 1** (run 37974533639, 2026-10-09), on one case: `tests/e2e/surfaces.test.ts` "Draft review (T9) › AC-12 + FR-12: at 375px every control is there, with refine, versions and the inline editor open". On the GitHub runner the refine log row never shows "Applied". The case fails on the first attempt and on the retry. It passes locally every time.

This is a real client bug that the slower runner exposes, not a flaky test. A real user hits it too, on a fast refine or a slow network. It is the same bug as the long-logged 011 follow-up, "a refine row can stay on Applying…".

**Investigation (`/specclaw:debug`, 2026-10-12; hypothesis upheld):**

- **The CI page snapshot at the timeout shows:**
  - the row stuck on "Applying…";
  - the refine input and Send button `[disabled]`;
  - Revision History showing **only v1**;
  - the caption and design buttons **enabled**, which means the client's `draft.pendingAction` is `null`.
- **It reproduces deterministically on a local server.** Delaying only the first draft GET after the refine POST by 3 s gives the same stuck page. Meanwhile the DB shows the refine **finished**: `currentRevisionNumber = 2`, `pendingAction = null`, 2 revisions. The repro spec is parked at the session scratchpad as `refine-race-repro.test.ts`.
- **Root cause.** Two client settles are **edge-triggered**: they fire only on an _observed_ `pendingAction` transition.
  - **`RefinementPanel`** (`src/components/drafts/RefinementPanel.tsx:104-132`) resolves the pending row only on `REFINE` → `null`.
  - **The draft page** (`src/app/(app)/drafts/[id]/page.tsx:122-131`) refreshes the revision list only on non-null → `null`.

  When the in-process refine completes before the post-202 refetch is served, the client sees `null` → `null` and never sees `REFINE`. Neither settle fires. The row hangs on "Applying…" forever, `awaitingResolution` keeps the input disabled, and the version list stays stale.

- **Why only CI.** Locally the post-202 refetch usually wins the race against the mock refine. On the slower runner, where dev-mode route compilation also runs, it loses.
- **Why since 014 wave 1.** 014's diff to `RefinementPanel` was purely presentational, and the test didn't change. 014 shifted the timing; it did not introduce the bug.
- **The same edge also drives the revision list after "Regenerate design".**

## Proposed Solution

**Settle on state, not on an observed edge.**

1. **`RefinementPanel`.** After the 202, await the parent's refetch (`onActionStarted` becomes `() => Promise<unknown>`, as T11 already did for `CaptionPanels`). From then on, resolve the pending row whenever `pendingAction` is `null`, comparing against the baseline captured at send. That baseline is the revision number, the conflict id and the not-applied revision id, exactly as today. The existing outcome branches (conflict → not-applied → error → applied → "finished without a new revision") are unchanged; only the trigger changes.
2. **The draft page.** Refresh the revision list whenever the loaded draft's `currentRevisionNumber` is not in the loaded list, instead of only on an observed transition. This covers refine and Regenerate design, whoever wins the race.
3. **A deterministic E2E** that forces the race by delaying the post-202 draft GET with `page.route`. It covers both refine and Regenerate design. It must fail before the fix, for the stated cause, and pass after.
4. **An audit of the other draft-page settles for the same pattern**, with each result stated in the report, and fixes only where the same bug exists:
   - `HeadlinePanel`'s `wasBusy` edge (`HeadlinePanel.tsx:92-96`);
   - the `CaptionPanels` lock;
   - the design Undo.

**Gate:** the per-change gates (tsc, lint, unit), then a full clean mock E2E (0 failed, 0 flaky), **and fork CI green on `v2`**, which is the point of the change.

## Scope

### In Scope

- `src/components/drafts/RefinementPanel.tsx`: the resolution trigger, and the awaited `onActionStarted`.
- `src/app/(app)/drafts/[id]/page.tsx`: the revision-list refresh condition, and passing an awaitable refetch to `RefinementPanel`.
- One new E2E case, or a small group, that forces the race for refine and Regenerate design.
- The audit of `HeadlinePanel`, `CaptionPanels` and the design Undo. A fix is in scope only where the audit finds the same bug.
- Closing the 011 follow-up and learning L21 in the handoff once CI is green.

### Out of Scope

- **Server-side changes.** The server is correct: the claim, the background run and the settle all behave as designed.
- **A per-claim token for draft actions.** That is a separate follow-up; it addresses stale workers after the 15-minute sweep, not this client race.
- **Weakening, re-timing or retrying the `surfaces` case.** The case is right to fail. It is left unchanged and must pass on CI as it is.
- The other post-012 follow-ups: `import-posts` `teamId`, the ACP manifest schema, 201-on-FAILED, and the FAB overlap.

## Impact

- **Size:** bounded. It alters two existing client settle conditions in the draft page flow, plus a test.
- **Files affected:** about 3–5: `RefinementPanel.tsx`, the draft `page.tsx`, one E2E file, and possibly `HeadlinePanel.tsx` if the audit finds the same bug.
- **Complexity:** small.
- **Risk:** low. The outcome logic is unchanged and only the trigger moves. The risk worth watching is resolving too early, against the pre-202 state. It is avoided by settling only after the awaited post-202 refetch has landed.

## Open Questions

- None blocking. If the audit finds the same edge bug in the caption/headline settles, should it be fixed here? The recommendation is yes, because it's the same cause and the same test technique.

---

**To proceed:** Review this proposal and approve to begin planning.
