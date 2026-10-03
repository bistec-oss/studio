-- T15 (change 004 Phase 2, FR-12/13/14/14a): a refine that fails verification
-- twice commits nothing (the revision pointer does not move) but its render is
-- retained OUT OF CHAIN for diagnosis and a possible "Use anyway" adoption.
-- Kept separate from Phase 1's 20260927120000_draft_font_set so each phase
-- reverts independently (NFR-06). All columns nullable, no backfill: every
-- existing row is a committed chain row and satisfies the constraints below.
--
-- ── DOWN PATH (manual; Prisma has no down migrations) — ORDER MATTERS ───────
-- Pre-Phase-2 code does not know about rejected rows. Its next-number query
-- (withNextRevisionNumber: newest-first, unfiltered) sorts NULLs FIRST under
-- DESC, so a single rejected row makes it compute 1 → P2002 on every retry →
-- every refine / inline-edit / regenerate-design fails for that draft. So
-- step 2 below MUST run before, or together with, any revert of Phase 2 code —
-- including a Coolify rollback to a pre-Phase-2 image. Steps 1+2 on their own
-- are enough to make pre-Phase-2 code safe again (the extra nullable columns
-- are harmless to it); steps 3-4 restore the schema itself.
--
--   -- 1. detach drafts from the rejected rows about to be deleted
--   UPDATE "Draft" SET "notAppliedReason" = NULL, "notAppliedRevisionId" = NULL;
--   -- 2. delete every rejected (out-of-chain) render. An adopted render's
--   --    committed copy is an ordinary numbered row and is kept.
--   DELETE FROM "DraftRevision" WHERE "revisionNumber" IS NULL;
--   -- 3. drop the FK, its index and the three CHECK constraints
--   ALTER TABLE "Draft" DROP CONSTRAINT "Draft_notAppliedRevisionId_fkey";
--   DROP INDEX "Draft_notAppliedRevisionId_idx";
--   ALTER TABLE "DraftRevision" DROP CONSTRAINT "DraftRevision_rejected_iff_unnumbered";
--   ALTER TABLE "DraftRevision" DROP CONSTRAINT "DraftRevision_rejection_fields_only_when_rejected";
--   ALTER TABLE "DraftRevision" DROP CONSTRAINT "DraftRevision_adoption_complete";
--   -- 4. restore NOT NULL, then drop the added columns
--   ALTER TABLE "DraftRevision" ALTER COLUMN "revisionNumber" SET NOT NULL;
--   ALTER TABLE "DraftRevision" DROP COLUMN "rejectedAt", DROP COLUMN "rejection",
--     DROP COLUMN "adoptedAt", DROP COLUMN "adoptedRevisionNumber", DROP COLUMN "discardedAt";
--   ALTER TABLE "Draft" DROP COLUMN "notAppliedReason", DROP COLUMN "notAppliedRevisionId";
--   -- then: DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260927130000_refine_not_applied';

-- Draft: the "couldn't apply" outcome, distinct from pendingActionError (the
-- crashed-run channel), plus the rejected render it refers to.
ALTER TABLE "Draft" ADD COLUMN     "notAppliedReason" TEXT,
ADD COLUMN     "notAppliedRevisionId" TEXT;

-- DraftRevision: a rejected row has NO chain position (revisionNumber NULL) and
-- a rejectedAt stamp; "rejection" holds its free-form diagnostics (classes +
-- the verifier's miss — FR-13, the only place classes are ever persisted);
-- adoptedAt/adoptedRevisionNumber/discardedAt are T19's adoption bookkeeping.
ALTER TABLE "DraftRevision" ADD COLUMN     "adoptedAt" TIMESTAMP(3),
ADD COLUMN     "adoptedRevisionNumber" INTEGER,
ADD COLUMN     "discardedAt" TIMESTAMP(3),
ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "rejection" JSONB,
ALTER COLUMN "revisionNumber" DROP NOT NULL;

-- The chain invariant, enforced by the database rather than by callers:
-- a row is rejected exactly when it has no revision number. So a rejected row
-- can never collide with, be counted as, or be pointed at as a chain position.
-- (Postgres UNIQUE treats NULLs as distinct, so any number of rejected rows
-- coexist under @@unique([draftId, revisionNumber]).)
ALTER TABLE "DraftRevision" ADD CONSTRAINT "DraftRevision_rejected_iff_unnumbered"
  CHECK (("revisionNumber" IS NULL) = ("rejectedAt" IS NOT NULL));

-- Rejection diagnostics and adoption bookkeeping exist only on rejected rows
-- (FR-02: a committed row never carries the instruction's classes).
ALTER TABLE "DraftRevision" ADD CONSTRAINT "DraftRevision_rejection_fields_only_when_rejected"
  CHECK (
    "rejectedAt" IS NOT NULL
    OR ("rejection" IS NULL AND "adoptedAt" IS NULL AND "adoptedRevisionNumber" IS NULL AND "discardedAt" IS NULL)
  );

-- An adoption records both when and which committed revision it became.
ALTER TABLE "DraftRevision" ADD CONSTRAINT "DraftRevision_adoption_complete"
  CHECK (("adoptedAt" IS NULL) = ("adoptedRevisionNumber" IS NULL));

-- CreateIndex (FK lookup side for ON DELETE SET NULL)
CREATE INDEX "Draft_notAppliedRevisionId_idx" ON "Draft"("notAppliedRevisionId");

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_notAppliedRevisionId_fkey" FOREIGN KEY ("notAppliedRevisionId") REFERENCES "DraftRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;
