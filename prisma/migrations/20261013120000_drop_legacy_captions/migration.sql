-- 016 FR-02: drop the pre-012 caption storage. The system is fresh-start only
-- (016), so the migrate-on-read loader, the boot backfill and these columns go
-- together: "copyText" (the single legacy caption), "captionMigration" (how it
-- was split) and DraftCaption."needsReview" (the fallback review flag).
--
-- The guard runs first. A draft with a legacy caption and no DraftCaption rows
-- was never migrated, and dropping "copyText" would lose its text, so the
-- deploy fails instead. A fresh database never trips it. The rollback is
-- prisma/rollback/016-fresh-start-cleanup.down.sql; it re-adds the columns
-- empty and restores no data.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Draft" d
    WHERE d."copyText" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "DraftCaption" c WHERE c."draftId" = d."id")
  ) THEN
    RAISE EXCEPTION '016 drop_legacy_captions: this system is fresh-start only (change 016), but this database still holds legacy single captions that were never migrated to per-channel captions. Reset the database, or run the 012 caption backfill on a pre-016 build first.';
  END IF;
END $$;

-- AlterTable
ALTER TABLE "Draft" DROP COLUMN "copyText",
DROP COLUMN "captionMigration";

-- AlterTable
ALTER TABLE "DraftCaption" DROP COLUMN "needsReview";

-- DropEnum
DROP TYPE "CaptionMigration";
