-- 016 FR-10: the manual rollback, run only to put a pre-016 image back on a
-- database that 016 migrated. Run it BEFORE the old image boots: the pre-016
-- Prisma client selects Draft."copyText", Draft."captionMigration" and
-- DraftCaption."needsReview", so every draft read fails without them. It sits
-- outside prisma/migrations/ on purpose: `migrate deploy` never applies it.
--
-- It re-adds what 20261013120000_drop_legacy_captions dropped, empty and with
-- the pre-016 types, nullability and defaults. Not destructive, and it
-- restores nothing: the legacy caption text that migration guarded is not
-- brought back, and neither is the default team that
-- 20261013130000_drop_empty_default_team deleted (it was empty by its guard).
--
--   docker exec -i designer-postgres-1 psql -U bistec -d <db> \
--     < prisma/rollback/016-fresh-start-cleanup.down.sql

-- First: both columns below use this type (values as in 20261011130000_draft_captions).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CaptionMigration') THEN
    CREATE TYPE "CaptionMigration" AS ENUM ('SPLIT', 'UNSPLIT_FALLBACK', 'EMPTY');
  END IF;
END $$;

-- Nullable since 20261011140000_legacy_caption_text; new drafts left it null.
ALTER TABLE "Draft" ADD COLUMN IF NOT EXISTS "copyText" TEXT,
                    ADD COLUMN IF NOT EXISTS "captionMigration" "CaptionMigration";
ALTER TABLE "DraftCaption" ADD COLUMN IF NOT EXISTS "needsReview" BOOLEAN NOT NULL DEFAULT false;

-- L24: un-record both 016 migrations. Without this, a later 016 redeploy sees
-- them as applied and never re-runs them: the columns stay, and the schema no
-- longer matches the migration history. With it, the roll-forward's boot
-- `migrate deploy` re-applies both on its own.
DELETE FROM "_prisma_migrations"
WHERE "migration_name" IN ('20261013120000_drop_legacy_captions',
                           '20261013130000_drop_empty_default_team');
