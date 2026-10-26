# Tasks: A per-claim token for draft actions

**Change:** 019-draft-action-claim-token · **Size:** bounded
**Created:** 2026-10-20
**Total Tasks:** 4

## Summary

This change has **4 tasks in 3 waves**:

1. the column, its migration and its down script;
2. the token and the lifecycle and caption guards;
3. the content-write guards;
4. the gate.

## Process / Gates

- **One task at a time:**
  1. an implementer subagent does the task;
  2. `specclaw:code-reviewer` reviews it;
  3. the orchestrator re-runs tsc, `npm run lint` and `npm run test:unit`, then commits.

  Never run two implementers in this checkout.

- **No real model calls.**
- **The databases are shared.** Never run a prisma or DB command without an explicit `DATABASE_URL` that points at `bistec_studio_test` or a named scratch database. `bistec_studio` is never touched. Use `export MSYS_NO_PATHCONV=1` before any docker command that takes a container path.
- **Baselines (021 T8, 2026-10-20):**
  - unit 2652/2652;
  - lint 0 errors / 7 warnings;
  - full clean mock E2E 397/3/0/0.

  A task may add unit cases; it may not lower the pass count or add a lint warning.

- **Open questions.** OQ-1 and OQ-2 in `spec.md` default to "include". If the user rules otherwise before T2 or T3, drop the matching item (see the task notes).

## Tasks

### Wave 1 — Migration

- [x] `T1` — The claim-token column, its migration, the down script and the schema comment
  - Files: `prisma/schema.prisma`, `prisma/migrations/20261020120000_draft_action_claim_id/migration.sql` (new), `prisma/rollback/019-draft-action-claim-token.down.sql` (new)
  - Estimate: small
  - Kind: migration
  - Depends: none
  - Notes:
    - **Covers:** FR-01; AC-01.
    - **Write the migration by hand.** Follow the 008 migration header style (additive only; the previous image keeps working), and the 016 down script's shape: a manual header, `IF EXISTS`, and the L24 `DELETE FROM "_prisma_migrations"` for its own row.
    - **Fix the stale `pendingActionError` comment** (`schema.prisma:540`).
    - **Prove it on `bistec_studio_019_scratch` only,** created and dropped through `docker exec designer-postgres-1 psql -U bistec -d postgres`:
      1. `migrate deploy`;
      2. the down script (`psql -v ON_ERROR_STOP=1`);
      3. `migrate deploy` again, which re-applies the migration;
      4. `prisma migrate diff … --exit-code`.
    - **Then:** `npx prisma generate`, `npx prisma validate` and `npm run test:upgrade` (3/3 PASS).
    - **Report:** paste the outputs into `reports/T1.md`, with the scratch database's `pg_database` check showing it is gone.
    - The app does not use the column yet, so tsc and unit stay green.

### Wave 2 — The token and its guards

- [x] `T2` — The claim mints a token; heartbeat, release, complete, the caption settles and the sweep are guarded on it
  - Files: `src/lib/drafts/claim.ts` (new), `src/lib/drafts/draftActions.ts`, `src/lib/drafts/revisions.ts` (only `discardNotAppliedRender`'s claim filter), `src/lib/captions/store.ts`, `src/app/api/drafts/[id]/route.ts`, `src/app/api/drafts/[id]/refine/route.ts`, `src/app/api/drafts/[id]/regenerate-design/route.ts`, `src/app/api/drafts/[id]/regenerate-copy/route.ts`, `tests/unit/draftActions.test.ts`, `tests/unit/captionStore.test.ts`, `tests/unit/captionRoutes.test.ts`, `tests/unit/draftDetailGet.test.ts`, `tests/unit/modelRequests.test.ts`, `tests/unit/draftActionModels.test.ts`, `tests/unit/captionWriters.test.ts`, `tests/unit/renderStamps.test.ts`, `tests/unit/actionHeartbeats.test.ts` (only if its fake needs it)
  - Estimate: large
  - Kind: impl
  - Depends: T1
  - Notes:
    - **Covers:** FR-02, FR-03, FR-04, FR-06 and FR-07; AC-02, AC-03, AC-05, and the T2 half of AC-06.
    - **`claim.ts`** holds `DraftClaim`, `newClaimId`, `claimWhere` and the released fields. It must not import `draftActions`, `revisions` or `store`.
    - **The routes** carry the claim value from the claim into every touch, `startDraftAction` and the caption settles. A `null` claim answers 409.
    - **The content writes** (`commitDraftRevision`, `recordRejectedRender`, the conflict write and Regenerate design's revision write) are **T3's**. Leave them unguarded here, so T2 compiles and passes alone.
    - **The caption settle** takes its guarded draft-row write first, in the same transaction, before the caption rows (NFR-04).
    - **The late-settle cases** (AC-02, AC-03) use a stateful fake row, like the existing "settling is guarded on the claimed action" block in `draftActions.test.ts`. Extend that block; do not replace it.
    - **The sweep (FR-06).** If OQ-2 is ruled out, keep the sweep's WHERE as `{ id, pendingAction }` and only add the null write.
    - **Before you start,** run `grep -rlE "claimDraftAction|claimCaptionAction|touchDraftAction|releaseDraftAction|completeDraftAction|startDraftAction|settleCaptionAction" tests/unit` to confirm the file list. Report any file that is not listed above.
    - **Run the targeted E2E suites** against a fresh `:3001` server: `async-actions.test.ts` and `captions.test.ts`.

- [x] `T3` — The content writes from a claimed run are guarded on the claim
  - Files: `src/lib/drafts/claim.ts` (`DraftClaimLostError`, if T2 did not add it), `src/lib/drafts/revisions.ts`, `src/app/api/drafts/[id]/refine/route.ts`, `src/app/api/drafts/[id]/regenerate-design/route.ts`, `tests/unit/draftRevisions.test.ts`, `tests/unit/draftActionModels.test.ts`, `tests/unit/renderStamps.test.ts`, `tests/unit/actionHeartbeats.test.ts` (added in build: its fake needed the `updateMany`), `tests/unit/background.test.ts` (only if its fake needs it)
  - Estimate: medium
  - Kind: impl
  - Depends: T2
  - Notes:
    - **Covers:** FR-05; AC-04, and the rest of AC-06.
    - **`commitDraftRevision`'s `claim` is optional** and valid on the plain commit only. **`recordRejectedRender`'s `claim` is required:** update its 22 test calls with a shared `CLAIM` fixture.
    - **Fold every guard into the final draft write** (`revisions.ts:396-408` LOCK ORDER). Never add a leading touch of the draft row.
    - **On a `DraftClaimLostError`,** remove the export this call uploaded, best-effort. Extend the existing CAS-miss cleanup condition; do not write a second cleanup path.
    - **Regenerate design's write (OQ-1).** If OQ-1 is ruled out, skip it and its `renderStamps` edit.
    - **Run the targeted E2E suites** against a fresh `:3001` server: `rejected-revisions.test.ts`, `refine-not-applied.test.ts`, `agui-refinement.test.ts` and `settle-race.test.ts`.

### Wave 3 — Gate

- [x] `T4` — The checklist line, the full gate and CI
  - Files: `docs/handoff.md`, `CLAUDE.md`
  - Estimate: small
  - Kind: test
  - Depends: T3
  - Notes:
    - **Covers:** FR-08; AC-06 (the full grep set), AC-07, AC-08 and AC-09.
    - **Add the 019 line** to "Check before the merge" in the handoff's pre-merge prod checklist. It adds no blocking step.
    - **Prepare for the full run:**
      - stop stray node processes;
      - `rm -rf .next`;
      - `docker exec designer-postgres-1 psql -U bistec -d postgres -c "DROP DATABASE IF EXISTS bistec_studio_test WITH (FORCE);"`, then `npm run test:e2e:db`.
    - **Then run:**
      - `npm run test:e2e:serve` and `npm run test:e2e:mock`, for 0 failed and 0 flaky against the 397/3/0/0 baseline;
      - tsc, `npm run lint`, `npm run test:unit`, `npm run build` and `npm run test:upgrade`;
      - `rm -rf .next` after the build.
    - **Run the AC-06 and AC-07 greps** and paste them into `reports/T4.md`.
    - **Push `v2` to `origin`** (never `main`), then watch `gh run list --branch v2` until CI is green.
    - **Record the run ID and the gate numbers** in `CLAUDE.md`'s top entry and the handoff's "Where things stand" table.
