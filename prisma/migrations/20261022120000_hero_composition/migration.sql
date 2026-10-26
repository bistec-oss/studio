-- 009 FR-01: the hero-image composition columns. Additive only: one TEXT
-- column with a constant default and two nullable JSONB columns, with no
-- backfill and no index, so the previous image keeps working against the
-- migrated schema (it never reads the new columns, and its brief.create omits
-- "imageStyle", so the default 'classic' applies). The full removal is
-- prisma/rollback/009-hero-image-design.down.sql.

-- AlterTable
ALTER TABLE "Brief" ADD COLUMN "imageStyle" TEXT NOT NULL DEFAULT 'classic';

-- AlterTable
ALTER TABLE "Draft" ADD COLUMN "composition" JSONB;

-- AlterTable
ALTER TABLE "DraftRevision" ADD COLUMN "composition" JSONB;
