# Verification Report: 019-draft-action-claim-token

**Verified:** 2026-10-20
**Model:** Sonnet 5.5 (claude-sonnet-5-5)
**Verdict:** PASS

## Quotes (key evidence)

- `src/lib/drafts/claim.ts`: `export function claimWhere(claim) { return { pendingAction: claim.action, pendingActionClaimId: claim.claimId } }`, `CLAIM_RELEASED = { pendingAction: null, pendingActionClaimId: null }`, `class DraftClaimLostError`.
- `draftActions.ts` claim: `where: { id: draftId, pendingAction: null }, data: claimData(claim)`. Touch, release and complete use `where: { id: draftId, ...claimWhere(claim) }`. Complete also passes `discardNotAppliedRender(prisma, draftId, claim)`. A miss calls `logLostClaim`.
- `captions/store.ts settleCaptionAction`: it opens with `tx.draft.updateMany({ where: { id: draftId, ...claimWhere(claim) }, data: { updatedAt } })`. On `count === 0` it calls `logLostClaim` and returns. The headline write is guarded with `...claimWhere(claim)`.
- `revisions.ts`: `if (claim && (cas || adoptRejectedRevisionId)) throw new Error('commitDraftRevision: claim cannot be combined ...')`. The final write has `...(claim ? claimWhere(claim) : { pendingAction: null })`, and a miss runs `if (claim) throw new DraftClaimLostError()`. The upload is removed on `DraftClaimLostError`. `recordRejectedRender` takes a required `claim`, and its discard and final write are guarded, with `if (count !== 1) throw new DraftClaimLostError()`.
- `refine/route.ts:292-306`: `where: { id: draft.id, ...claimWhere(claim) }` … `if (count !== 1) logLostClaim(draft.id, claim)`. `regenerate-design/route.ts:143-158`: `...claimWhere(claim)` … `if (count !== 1) throw new DraftClaimLostError()`.
- `drafts/[id]/route.ts:83-84`: `where: { id, pendingAction, pendingActionClaimId }, data: { pendingAction: null, pendingActionClaimId: null, ... }`.
- Migration: `ALTER TABLE "Draft" ADD COLUMN "pendingActionClaimId" TEXT;`. Down script: `DROP COLUMN IF EXISTS` plus `DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261020120000_draft_action_claim_id'`.

## Acceptance Criteria

- ✅ **AC-01: the migration and the down script.**
  - The migration is additive: a nullable TEXT column with no default, backfill or index.
  - The down script drops the column and deletes the migration row (L24).
  - `git diff --name-only f8ebee2 -- prisma/migrations` lists only `prisma/migrations/20261020120000_draft_action_claim_id/migration.sql`.
  - The DB proof is in `reports/T1.md`:
    - deploy;
    - the down script printed `ALTER TABLE` and `DELETE 1`, and the column count afterwards was 0;
    - redeploy;
    - `migrate diff ... --exit-code` printed "No difference detected." with exit 0;
    - `prisma validate` reported the schema valid;
    - `npm run test:upgrade` passed scenarios 1–3 ("ALL PASS"), re-cited in `T4-gate.md`.
  - The verifier ran no DB commands, so the DB steps rest on the reports.
- ✅ **AC-02: the late settle is a no-op.**
  - Source: the claim's WHERE is `{ id, pendingAction: null }`, and its data carries the token. Touch, release and complete carry the action and the token. Release and complete null the token.
  - `tests/unit/draftActions.test.ts` has these cases:
    - "two claims carry different tokens";
    - "touch, release with an error, and complete each leave R2 untouched and log a lost claim";
    - "a startDraftAction success from the swept run leaves R2 alone";
    - "a startDraftAction throw ... never writes its error onto R2";
    - "a not-applied completion from the swept run leaves R2 alone";
    - "the live claim still settles, and clears both the claim and the token".
  - The unit suite passes 2681/2681.
- ✅ **AC-03: the late caption settle is a no-op.**
  - Source: `settleCaptionAction(draftId, claim, ...)` opens with the guarded draft-row write. A miss writes nothing and logs. The headline write is guarded on the claim.
  - `captionStore.test.ts` has the block "settleCaptionAction: a late settle is a no-op (019 AC-03)" and the case "the live claim settles the rows and the headline".
  - `captionRoutes.test.ts` has "carries the claim from claimCaptionAction to startDraftAction and the unstarted settle (019)" and "a lost claim is 409 and releases nothing it does not hold".
  - `regenerate-copy/route.ts` passes `claim` to `startDraftAction`, the `onError` settle, the unstarted settle and `releaseDraftAction`.
- ✅ **AC-04: the content writes are guarded.**
  - Source:
    - `commitDraftRevision` throws `DraftClaimLostError` on a miss and removes the upload. Combining `claim` with `expectedRevisionNumber` or `adoptRejectedRevisionId` throws.
    - `recordRejectedRender` takes the claim and throws on a miss.
    - The refine conflict write is a guarded `updateMany` that logs on a miss and never throws.
    - Regenerate design's final write carries the claim.
  - Tests:
    - `draftRevisions.test.ts`, about lines 1494–1584: "throws DraftClaimLostError, writes no row ... removes the render it uploaded" and "a claim cannot be combined with ...".
    - `draftActionModels.test.ts:184`: the verified commit, the rejected render and the conflict write all carry the claim.
    - `renderStamps.test.ts:180`: Regenerate design's write is guarded, and a lost claim lands no revision.
  - The non-claim cases (Override, inline edit, adopt) are still in the file and pass.
- ✅ **AC-05: the sweep and the null token.**
  - Source: the sweep's WHERE is `{ id, pendingAction, pendingActionClaimId }`, and its data nulls the token. Prisma treats a null observed token as IS NULL (A2).
  - `draftDetailGet.test.ts` has these cases:
    - "clears with a WHERE carrying the observed action and token, and nulls the token";
    - "sweeps a stale row whose token is null";
    - "a sweep whose observed token no longer matches writes nothing";
    - "never puts the token in the response".
  - `git diff f8ebee2 -- tests/unit/draftRecovery.test.ts` is empty, and `recovery.ts` is not in the diff.
- ✅ **AC-06: scope, by grep (run by the verifier).**
  - `grep -rnE "pendingAction: (action|claimedAction)\b" src` matches nothing.
  - `grep -n "pendingAction: 'REGENERATE_COPY'" src/lib/captions/store.ts` matches nothing.
  - `grep -rln pendingActionClaimId src` lists exactly `src/app/api/drafts/[id]/route.ts` and `src/lib/drafts/claim.ts`.
  - `grep -n claimId src/lib/api-types.ts` matches nothing.
  - No log line carries the token: `logLostClaim` logs only the action.
- ✅ **AC-07: out-of-scope files untouched.** `git diff --name-only f8ebee2 | grep -E "src/components/|src/app/\(app\)/|src/scheduler/|recovery.ts|budget.ts"` returns nothing. The changed `src` and `prisma` files are exactly the planned ten.
- ✅ **AC-08: the handoff checklist line.** The 019 line in "Check before the merge" of `docs/handoff.md` reads "**019 claim token (FR-08).** This is a check, not a blocking step." It states:
  - the migration is additive, one nullable column, and appears in the generated migration list;
  - the previous image runs against it, so an image rollback needs no down script;
  - the `in_flight = 0` step covers in-flight claims.

  It adds no blocking step.

- ✅ **AC-09: the gate.**
  - Collected at verify:
    - lint: 0 errors, 7 warnings (the baseline);
    - build: passed;
    - unit: 2681/2681 (the 2652 baseline plus 29 new cases).
  - tsc: clean in each task report (`npx tsc --noEmit`, exit 0).
  - **E2E provenance:** no `e2e_command` is configured, so `collect` did not run E2E. The evidence is the T4 full clean mock run at `7e86b96`, recorded in `reports/T4-gate.md`: 397 passed / 3 skipped / 0 failed / 0 flaky, the same as the 021 T8 baseline. The orchestrator confirmed the counts in the run log. The targeted T2 and T3 suites are in `reports/T2.md` and `reports/T3.md`.
  - **CI:** both GitHub Actions runs at `7e86b96` succeeded (39445592883 push, 39445602043 pull_request). The commits after it, `0b7608a` and `b21d71c`, change only docs and specclaw files.

## Test Results

- **Unit:** 2681/2681 passed.
- **Lint:** 0 errors, 7 warnings (the baseline, unchanged).
- **Build:** passed.
- **`npm run test:upgrade`:** 3/3 PASS.
- **E2E:** 397/3/0/0 at `7e86b96` (the T4 gate run; not re-run at verify).
- **CI:** green at `7e86b96`.

## Issues Found

No blocking issues. Notes:

1. **NOTEs from the per-task reviews (T1, T2).** They are non-blocking and recorded in `reviews/`.
2. **E2E and CI provenance is by report and log.** Verify did not re-execute them: there is no `e2e_command`, and the run was read-only.
3. **Accepted edge case (rolling deploy).** An older container's sweep leaves the token. A run stalled for more than 15 minutes could then match a same-action claim that the older container took on the same draft. The handoff checklist documents this, and `in_flight = 0` makes it unlikely.
4. **Known leftover (T3 review).** When Regenerate design loses its claim, the revision rolls back but the PNG it already uploaded is orphaned. The spec puts this out of scope, the same as a design failure today.

## Per-task reviews

- T1 — NOTE
- T2 — NOTE
- T3 — PASS
- T4 — no review (docs and gate)

## Summary

**Passed:** 9/9 criteria
**Failed:** 0/9 criteria
**Verdict:** PASS
