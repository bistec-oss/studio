# Proposal: A per-claim token for draft actions

**Created:** 2026-10-13
**Status:** 🟡 Draft

## Problem

Draft actions (refine, regenerate design, regenerate caption or headline, adopt) claim `Draft.pendingAction` (`src/lib/drafts/draftActions.ts:32-38`). Every later write keys on the **action enum**, not on a particular run:

- the heartbeat (`:45-50`), release (`:68-78`) and complete (`:95-104`);
- `discardNotAppliedRender` (`revisions.ts:603-618`);
- the caption claim, the headline guard and the row settles (`captions/store.ts:367-448`).

The draft GET sweeps a claim whose `updatedAt` is 15 minutes old (`drafts/[id]/route.ts:94-105`). That leaves a concrete race:

1. Run R1 claims REFINE and stalls past 15 minutes, for example on a hung render or CLI call.
2. A poll sweeps the claim. The user retries, and run R2 claims REFINE.
3. R1 wakes up:
   - its heartbeat refreshes R2's claim;
   - its unguarded `commitDraftRevision` lands a stale revision;
   - its `completeDraftAction` matches and **clears R2's claim** while R2 is still running.
4. The draft now looks idle, so a third action can start alongside R2. If R1 throws instead, its error is written onto R2's claim.
5. For caption regenerates, R1 writes stale text into rows that R2 re-marked PENDING.

## Proposed Solution

- **Add a nullable `Draft.pendingActionClaimId`.** The migration is additive, and it ships with a down script, `prisma/rollback/019-*.down.sql`, as L24 requires.
- `claimDraftAction` and `claimCaptionAction` write a fresh UUID and return it.
- **Guard every write on the claim.** These all filter on `{pendingAction, pendingActionClaimId}`:
  - heartbeat, release, complete and discard;
  - the caption and headline settles;
  - **the content writes:** `commitDraftRevision`'s plain commit, the refine conflict write and `recordRejectedRender`.

  A write whose claim was lost matches 0 rows and logs it.

- **Clearing the token.** Claim, release and the sweep null it. The guards tolerate a null token, so a claim taken by an older container during a rolling deploy still settles.
- Fix the stale comment at `schema.prisma:554`.

**Tests:** unit cases for "a late settle after a sweep and re-claim is a no-op", in `draftActions.test.ts`, `captionStore.test.ts` and `draftRecovery.test.ts`. About 77 call sites in 8 unit files take the new return type.

## Scope

### In Scope

The token, every guarded write above, the migration and its down script, and the tests.

### Out of Scope

Changing the 15-minute sweep or the heartbeat interval.

## Impact

- **Size:** bounded. An existing mechanism gains a column and a guard; there is no new interface.
- **Files affected:** about 15 source files and 8 test files
- **Complexity:** medium
- **Risk:** medium. It touches every draft-action settle path. The full E2E suite is the gate, in particular the §Q async, §X settle-race and rejected-revision suites.

## Open Questions

None.
