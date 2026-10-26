-- 019 FR-01: the draft-action claim token. Additive only: one nullable TEXT
-- column, with no default, no backfill and no index, so the previous image
-- keeps working against the migrated schema (it never reads or writes it; a
-- null token beside a non-null "pendingAction" means that image took the
-- claim). The full removal is prisma/rollback/019-draft-action-claim-token.down.sql.

-- AlterTable
ALTER TABLE "Draft" ADD COLUMN "pendingActionClaimId" TEXT;
