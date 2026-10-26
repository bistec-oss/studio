# Spec: A per-claim token for draft actions

**Change:** 019-draft-action-claim-token · **Size:** bounded · **Proposal:** [proposal.md](proposal.md)
**Created:** 2026-10-20
**Status:** 🟡 Draft

## Overview

Draft actions (refine, Regenerate design, Regenerate caption/headline) claim `Draft.pendingAction`. Every later write by the run is keyed on the **action enum**, not on the run. 004 F2 (`5809e24`) and 012 T4/T6 added those enum guards; 015 changed only client code and added no server guard. So a run that the 15-minute sweep cleared, followed by a new claim of the **same** action, still matches every guard. The stale run then:

- refreshes the new claim's heartbeat;
- lands a stale revision through an unguarded content write;
- clears the new claim, or writes its error onto it;
- writes stale text into caption rows the new run marked PENDING.

This change adds a nullable `Draft.pendingActionClaimId`. Each claim writes a fresh token, and every write the run makes later is guarded on it. The proposal's line pointers were re-derived against HEAD `f8ebee2` on 2026-10-20; the corrections are listed under Notes.

## Approach

**One decision: a claim is a value, `DraftClaim { action, claimId }`.** The claim mints it and the run carries it. Every later write by the run puts `{ pendingAction: action, pendingActionClaimId: claimId }` into its WHERE, through one helper (`claimWhere`). The guard goes on the write that the existing lock order already puts last. A miss writes nothing: a settle logs it, and a content write inside a revision transaction throws `DraftClaimLostError`, so the transaction rolls back.

File map:

- **New:** `prisma/migrations/20261020120000_draft_action_claim_id/migration.sql`, `prisma/rollback/019-draft-action-claim-token.down.sql` and `src/lib/drafts/claim.ts`. `claim.ts` holds the type and the helpers; it imports nothing from `draftActions`, `revisions` or `store`, so there is no import cycle.
- **Modified:** `prisma/schema.prisma`, `src/lib/drafts/{draftActions,revisions}.ts`, `src/lib/captions/store.ts`, and `src/app/api/drafts/[id]/route.ts` plus its `refine/`, `regenerate-design/` and `regenerate-copy/` `route.ts`.
- **Tests:** `tests/unit/{draftActions,captionStore,captionRoutes,draftRevisions,draftDetailGet,draftActionModels,modelRequests,captionWriters,renderStamps}.test.ts`. `actionHeartbeats` and `background` change only if their fakes need it.
- **Docs:** `docs/handoff.md` and `CLAUDE.md`.

## Requirements

### Functional Requirements

- **FR-01 — The column, the migration and the down script.**
  - **Schema.** `prisma/schema.prisma`: `Draft` gets `pendingActionClaimId String?`. Its comment says it is set by the claim, nulled by every settle and by the sweep, and that a null alongside a non-null `pendingAction` means an older image took the claim.
  - **The stale comment.** The comment on `pendingActionError` (`schema.prisma:540`, "cleared when the next action starts") is corrected: since 004 T17 fix round 1 the claim keeps the error, and the next settle replaces or clears it (`draftActions.ts:17-27`).
  - **Migration** `20261020120000_draft_action_claim_id`. It sorts after the current head, `20261013130000_drop_empty_default_team`. It runs one `ALTER TABLE "Draft" ADD COLUMN "pendingActionClaimId" TEXT;`, with no default, no backfill and no index. Its header says, as 008's did, that it is additive only, so the previous image keeps working against the migrated schema, and it names the down script.
  - **Down script** `prisma/rollback/019-draft-action-claim-token.down.sql`, following the 016 shape:
    - **Header.** The script is manual and sits outside `prisma/migrations/` on purpose. The previous image does not need it.
    - **Body.** `ALTER TABLE "Draft" DROP COLUMN IF EXISTS "pendingActionClaimId";`
    - **L24.** It deletes the `_prisma_migrations` row for `20261020120000_draft_action_claim_id`, so a later redeploy re-applies the migration on its own.
- **FR-02 — The claim mints a token.**
  - **`src/lib/drafts/claim.ts`** exports:
    - `DraftClaim { action: DraftAction; claimId: string }`;
    - `newClaimId()`, which returns `crypto.randomUUID()`;
    - `claimWhere(claim)`, which returns `{ pendingAction, pendingActionClaimId }`;
    - the released fields `{ pendingAction: null, pendingActionClaimId: null }`.
  - **`claimDraftAction(draftId, action)`** returns `Promise<DraftClaim | null>`. Its WHERE stays `{ id, pendingAction: null }`; it does not care what token is left on the row. Its data writes the action and a fresh token. It still leaves `pendingActionError` alone (`draftActions.ts:17-27`).
  - **`claimCaptionAction(draftId, targets, db?)`** returns `Promise<DraftClaim | null>` in the same way, with its target rows marked PENDING in the same transaction, as today.
  - **The callers.** `refine`, `regenerate-design` and `regenerate-copy` answer 409 on `null`, as they do on `false` today.
- **FR-03 — The lifecycle writes are guarded on the claim.**
  - `touchDraftAction`, `releaseDraftAction`, `completeDraftAction` and `startDraftAction` take a `DraftClaim` in place of the `DraftAction`.
  - **The WHERE.** Each guarded write uses `{ id, ...claimWhere(claim) }`. That covers both statements of `completeDraftAction`'s batch, so `discardNotAppliedRender(client, draftId, claim?)` filters its `notAppliedOn` relation on the claim, not on the action.
  - **The token is cleared.** Release and complete also set `pendingActionClaimId: null`.
  - **A miss.** A miss matches 0 rows and is logged (`logLostClaim`, with the action and the draft ID, never the token). It is never thrown.
  - **The heartbeat.** It keeps its current placement and interval.
- **FR-04 — The caption settles are guarded on the claim.**
  - `settleCaptionAction(draftId, claim, targets, fields, stamp?, db?)` first runs a guarded draft-row write: `{ id, ...claimWhere(claim) }`, touching `updatedAt`. This is the same order `claimCaptionAction` takes its locks in: the draft row first, then the caption rows.
  - **On a miss** it writes no caption row and no headline, logs once, and returns.
  - **On a hit** the row settles and the headline write run as today. The headline write's guard becomes the claim, not `pendingAction: 'REGENERATE_COPY'`.
  - **It covers all three caption settles** in `regenerate-copy/route.ts`: the work's settle, the `onError` settle and the unstarted-run settle, followed by `releaseDraftAction(draftId, claim, message)`.
  - **Unchanged:** `settlePendingCaptions` (the sweep's half) and `saveGenerationCaptions` (generation, not a draft action).
- **FR-05 — The content writes from a claimed run are guarded on the claim** (see OQ-1 for the last item):
  - **`commitDraftRevision`** gains an optional `claim?: DraftClaim`, valid only on the plain commit. Combining it with `expectedRevisionNumber` or `adoptRejectedRevisionId` throws a programming error.
    - With a claim, the final draft write becomes `updateMany({ where: { id, ...claimWhere(claim) } })`.
    - On 0 rows it throws `DraftClaimLostError`, so the revision insert and the not-applied discard roll back. The export it uploaded is then removed, best-effort, as on the CAS miss today (`revisions.ts:383-390`).
    - Without a claim (Override, inline edit, adopt) it is unchanged.
    - The refine route's verified commit passes its claim.
  - **`recordRejectedRender`** takes a required `claim: DraftClaim`. Its only caller is the refine, which holds the claim.
    - In its transaction, `discardNotAppliedRender` and the final draft write are guarded on the claim. The final write uses `updateMany`, and a miss throws `DraftClaimLostError`, which rolls back.
    - The export it uploaded is removed, best-effort.
  - **The refine conflict write** (`refine/route.ts:284-299`) becomes a guarded `updateMany`. On a miss it logs and returns, and `startDraftAction`'s complete then misses too.
  - **Regenerate design's revision write** (`regenerate-design/route.ts:127-155`) guards its final `tx.draft` write on the claim. A miss throws `DraftClaimLostError`, so the revision insert rolls back.
  - **What a lost claim does.** `DraftClaimLostError` propagates to `startDraftAction`'s catch. There, the guarded release misses and logs, so the error never reaches a newer claim's `pendingActionError`.
- **FR-06 — The sweep is guarded on what it observed** (see OQ-2).
  - The draft GET's stale-action clear (`drafts/[id]/route.ts:76-87`) uses `{ id, pendingAction: observedAction, pendingActionClaimId: observedClaimId }` as its WHERE. A null observed token filters `IS NULL`.
  - The clear also sets `pendingActionClaimId: null`.
  - `loadDraft`'s row and `DraftRecoveryRow` gain the column. The pure planner (`src/lib/drafts/recovery.ts`) and the 15-minute window are unchanged.
- **FR-07 — Tolerating a null token (the rolling deploy).** A row whose `pendingAction` is set and whose token is null was claimed by an older image, or seeded by a test. On such a row, the new code behaves exactly as today:
  - it blocks a new claim;
  - GET reads it;
  - the sweep clears it, via FR-06's `IS NULL` match;
  - restore, adopt and the element-edit guard still refuse it.

  No new code path requires a non-null token in order to read or sweep a row. An older image's own writes ignore the column, so its runs settle as before.

- **FR-08 — The prod checklist line.** The "Check before the merge" list in `docs/handoff.md` gets one 019 line:
  - the migration is additive, a nullable column;
  - the previous image runs against it, so an image rollback needs no down script;
  - the existing `in_flight = 0` step covers in-flight claims.

  It adds no blocking step.

### Non-Functional Requirements

- **NFR-01: no API change.** No request or response shape changes. The token never appears in an HTTP response, an MCP or ACP payload, `src/lib/api-types.ts` or a log line.
- **NFR-02: out of scope stays out.**
  - The 15-minute sweep, `STUCK_GENERATION_MS`, the heartbeat placement, `src/lib/models/budget.ts` and the 4 s poll are unchanged.
  - No client code changes: `src/components/**` and `src/app/(app)/**`.
- **NFR-03: applied migrations are never edited.** `git diff --name-only f8ebee2 -- prisma/migrations` lists only the new directory.
- **NFR-04: the lock order is kept.**
  - In a revision transaction, the draft-row guard is folded into the final draft write, which stays last (`revisions.ts:396-408`).
  - The caption settle takes the draft row before the caption rows, the same order as `claimCaptionAction`.
  - No new lock order is introduced.
- **NFR-05: no real model calls,** and no prisma or DB command without an explicit `DATABASE_URL` that points at `bistec_studio_test` or a named scratch database (CLAUDE.md gotchas).
- **NFR-06: existing tests are adapted, never deleted.** Every existing case in the touched unit files still runs, with fixtures updated to the new signatures.

## Acceptance Criteria

- **AC-01 (FR-01, NFR-03): the migration and the down script.**
  - `npx prisma validate` passes.
  - **On a scratch database `bistec_studio_019_scratch`,** with an explicit `DATABASE_URL`, and dropped afterwards:
    1. `migrate deploy` adds the column;
    2. the down script drops it and deletes the migration row (`DELETE 1`);
    3. `migrate deploy` re-applies it (the L24 roll-forward);
    4. `prisma migrate diff --from-url <scratch> --to-schema-datamodel prisma/schema.prisma --exit-code` exits 0.
  - `npm run test:upgrade` prints PASS for all 3 scenarios; it now migrates through the new migration and diffs the schema.
  - `git diff --name-only f8ebee2 -- prisma/migrations` lists only the new directory.
  - Record all of this in `reports/T1.md`.
- **AC-02 (FR-02, FR-03): the late settle is a no-op** (`tests/unit/draftActions.test.ts`).
  - **The claim.** Two claims return different tokens. The claim's WHERE is still `{ id, pendingAction: null }`, and its data carries the token. Touch, release and complete each have a WHERE that carries both the action and the token. Release and complete null the token.
  - **The late-settle case,** on a stateful fake row:
    1. R1 claims REFINE (T1);
    2. the sweep clears the claim;
    3. R2 claims REFINE (T2).

    Then R1's touch, its release with an error, its complete, a `startDraftAction` success and a `startDraftAction` throw each leave the row as R2's claim. The row's `updatedAt`, `pendingActionError` and not-applied fields are unchanged, and a lost-claim line is logged.

  - **The live claim** still settles, and it clears both the claim and the token.
- **AC-03 (FR-04): the late caption settle is a no-op** (`tests/unit/captionStore.test.ts`, `tests/unit/captionRoutes.test.ts`).
  - **The late settle.** R2 re-marks the rows PENDING and holds T2. R1's `settleCaptionAction` with success fields, and again with failure fields, leaves every row PENDING with R2's text and stamps, and leaves the headline unchanged.
  - **The live claim** settles the rows and the headline.
  - **In `captionRoutes`,** the route passes the claim from `claimCaptionAction` to `startDraftAction`, to the `onError` settle, and to both the unstarted settle and its release. On a `null` claim the route answers 409.
- **AC-04 (FR-05): the content writes are guarded** (`tests/unit/draftRevisions.test.ts`, plus `renderStamps` and `draftActionModels` as the routes need).
  - **`commitDraftRevision` with a lost claim** throws `DraftClaimLostError`. Its final write's WHERE carries the claim, and the uploaded export is deleted. Combining `claim` with `expectedRevisionNumber` or `adoptRejectedRevisionId` throws.
  - **`commitDraftRevision` without a claim:** the existing Override, inline-edit and adopt cases pass unchanged.
  - **`recordRejectedRender` with a lost claim** throws `DraftClaimLostError` with no draft write applied, and its discard carries the claim.
  - **Regenerate design's final draft write** carries the claim.
  - **The refine conflict write** carries the claim, and on a miss it does not throw.
- **AC-05 (FR-06, FR-07): the sweep and the null token** (`tests/unit/draftDetailGet.test.ts`).
  - The sweep's clear has a WHERE that carries the observed action and the observed token, and its data nulls the token.
  - A stale row whose token is null is swept.
  - A sweep whose observed token no longer matches writes nothing.
  - `tests/unit/draftRecovery.test.ts` is unchanged (`git diff` is empty), because the planner does not change.
- **AC-06 (FR-02–FR-05, NFR-01): scope, by grep.**
  - `grep -rnE "pendingAction: (action|claimedAction)\b" src` matches nothing.
  - `grep -rn "pendingAction: 'REGENERATE_COPY'" src/lib/captions/store.ts` matches nothing in a WHERE.
  - `grep -rln pendingActionClaimId src` lists only `src/lib/drafts/claim.ts` and `src/app/api/drafts/[id]/route.ts`.
  - `grep -n claimId src/lib/api-types.ts` matches nothing.
- **AC-07 (NFR-02):** `git diff --name-only f8ebee2` shows no file under `src/components/`, `src/app/(app)/` or `src/scheduler/`, and none of `src/lib/drafts/recovery.ts` or `src/lib/models/budget.ts`.
- **AC-08 (FR-08):** a review confirms the 019 line in the handoff checklist, and that it adds no blocking step.
- **AC-09: the gate.**
  - tsc is clean, and `npm run lint` gives 0 errors and no more than the 7-warning baseline.
  - `npm run test:unit` passes in full, with at least the 2652 baseline plus the new cases.
  - `npm run build` passes.
  - A full clean mock E2E gives 0 failed and 0 flaky, against the 397/3/0/0 baseline at 021 T8. It includes:
    - §Q `async-actions.test.ts`, whose stale-sweep case seeds a claim with a null token;
    - §X `settle-race.test.ts`;
    - `rejected-revisions.test.ts`, `refine-not-applied.test.ts`, `agui-refinement.test.ts` and `captions.test.ts`.
  - `gh run list --branch v2` shows CI green at the change's last commit.

## Edge Cases

- **An older image during a rolling deploy.**
  - An old container's GET sweep clears `pendingAction` but leaves the token.
  - If an old container then claims the same action on the same draft, a stalled new-image run holding that token would match it.
  - This needs a run stalled for more than 15 minutes, an overlap between the two images, and the same action on the same draft. It is accepted. The checklist's `in_flight = 0` at deploy makes it unlikely.
- **A claim taken by an older image** (token null). That image settles it with its own enum-only guards. The new code reads it and sweeps it (FR-07).
- **A draft deleted mid-action.** Every guarded write matches 0 rows and logs, as today.
- **A lost-claim Regenerate design.** `runPathBDesign` has already uploaded the export, so the object is orphaned. Today's design failures behave the same way. It is not cleaned up here.
- **A stalled run keeps running after a lost heartbeat.** It spends its remaining model calls before it reaches a guarded write. Cancelling it is out of scope.
- **Override, inline edit, adopt and restore** take no claim. They keep their `pendingAction IS NULL` guards (or none, for the Override and whole-document inline edit), as today.
- **A sweep racing the run's own settle.** The sweep reads {REFINE, T1}, then the run settles (or R2 claims) before the clear. FR-06's observed-token WHERE misses, so nothing is clobbered.
- **The sweep's caption half** (`settlePendingCaptions`) still runs before the clear and stays unguarded. Until the clear, no new run can mark rows PENDING (`drafts/[id]/route.ts:50-58`).

## Assumptions

- **A1:** every draft-action run settles in the process that claimed it. `startDraftAction` is fire-and-forget and in-process, and no worker, MCP or ACP path claims a draft action (verified by grep). So a token never has to cross containers.
- **A2:** Prisma 5 treats `pendingActionClaimId: null` in a WHERE as `IS NULL`. That is what FR-06 and FR-07 rely on.
- **A3:** `crypto.randomUUID()` is available on the Node 22 runtime. The refine route already uses it.
- **A4:** the checklist's migration list comes from `git diff` (022 FR-08), so 019's migration appears in it without a hand edit.
- **A5:** the E2E suites seed `pendingAction` directly, through `tests/helpers/db`, and leave the token null. That is the FR-07 shape, so they need no edit.

## Open Questions

**Resolved 2026-10-20 by the user: both defaults stand.** OQ-1 is included (FR-05, last item) and OQ-2 is included (FR-06).

- **OQ-1 — Guard Regenerate design's own revision write?** The proposal's list of content writes names `commitDraftRevision`, the refine conflict write and `recordRejectedRender`. It omits `regenerate-design/route.ts:127-155`, which is the same class of unguarded write from a claimed run (problem step 3, for Regenerate design). **Default: include it (FR-05, last item).** If the user says no, drop that item, its AC-04 line and the `renderStamps` test edit.
- **OQ-2 — Guard the sweep's clear on the observed token?** The proposal says only that the sweep nulls the token. Guarding it closes the "sweep reads, the run settles, R2 claims, the sweep clears R2" interleaving, and it is how FR-07's null-token match is expressed. **Default: include it (FR-06).** If the user says no, the sweep keeps `{ id, pendingAction }` and only adds the null write.

## Dependencies

- 004 F2 (`5809e24`): the enum guards in `draftActions.ts` and `revisions.ts` that this change replaces.
- 012: the caption claim and settles in `captions/store.ts`.
- 015 (client settle on state): no overlap.
- 022: the migration conventions and `npm run test:upgrade`.
- 020 builds after this change. Merging to `main` is out of scope.

## Notes

**Corrections to the proposal (2026-10-13), re-derived at `f8ebee2`:**

- **The draft actions.** "Adopt" is not a claimed action. The adopt route never claims `pendingAction`; it guards on `pendingAction IS NULL` (`revisions.ts:262-273`, `adopt/route.ts:16`), so it is outside this change.
- **Line pointers.**
  - `draftActions.ts:32-38 / 45-50 / 68-78 / 95-104` and `revisions.ts:603-618` still match.
  - `captions/store.ts:367-448` is now `212-232` (the claim), `244-261` (the row settles) and `273-296` (`settleCaptionAction` and the headline guard).
  - The sweep `drafts/[id]/route.ts:94-105` is now `76-87`, with the caption half at `54-58`.
  - The stale comment `schema.prisma:554` is now `:540`.
- **Clearing the token.** "Claim, release and the sweep null it" is read as: the claim sets the token, and release, complete and the sweep null it.
- **The content writes.** The proposal's list omits Regenerate design's own revision write (OQ-1).
- **Tests.**
  - `draftRecovery.test.ts` tests the pure planner, which does not change. The sweep's guard is tested in `draftDetailGet.test.ts`.
  - "About 77 call sites in 8 unit files" is now about 123 references to the claim and settle API in 8 unit files (`captionRoutes` 34, `draftActions` 31, `captionStore` 19, `modelRequests` 16, `draftActionModels` 7, `captionWriters` 2, `renderStamps` 2, `actionHeartbeats` 1), plus new cases in `draftRevisions` and `draftDetailGet`. That is up to 10 unit files (11 with `background`).
- **Source files.** "About 15 source files" is now 10 code and schema files (3 new), plus 2 docs.
- **015.** It guards none of these writes. It changed client settles only (its NFR-01), so this change builds on 004 F2 and 012, not on 015.
