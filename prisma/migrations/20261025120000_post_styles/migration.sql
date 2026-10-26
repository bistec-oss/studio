-- 027 FR-01: post styles. Additive only: seven nullable columns with no default
-- and nothing else, so Postgres rewrites no table and the previous image keeps
-- working against the migrated schema (it never reads or writes them, and its
-- brief.create and scheduledGeneration.create omit them). The key columns are
-- TEXT, validated in code, so a retired style needs no migration.
-- The manual removal is prisma/rollback/027-post-styles.down.sql.

-- AlterTable
ALTER TABLE "Brief" ADD COLUMN "postStyle" TEXT;

-- AlterTable
ALTER TABLE "ScheduledGeneration" ADD COLUMN "postStyle" TEXT;
ALTER TABLE "ScheduledGeneration" ADD COLUMN "heldReason" TEXT;

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN "defaultPostStyle" TEXT;

-- AlterTable
ALTER TABLE "Draft" ADD COLUMN "postStyle" JSONB;
ALTER TABLE "Draft" ADD COLUMN "factsCheck" JSONB;

-- AlterTable
ALTER TABLE "DraftRevision" ADD COLUMN "postStyle" JSONB;
