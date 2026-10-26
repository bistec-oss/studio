-- 027 FR-01: the manual rollback, run only to remove the post style columns from
-- a database that 20261025120000_post_styles migrated. WARNING: it discards every
-- stored style key, every post style stamp and every facts-check result. The
-- previous image does not need it: the columns are additive and that image never
-- touches them (reverting the deploy restores the old prompts and the old Goal
-- picker; rows already written with a style are ignored, not broken). It sits
-- outside prisma/migrations/ on purpose: `migrate deploy` never applies it.
--
--   docker exec -i designer-postgres-1 psql -v ON_ERROR_STOP=1 -U bistec -d <db> \
--     < prisma/rollback/027-post-styles.down.sql

ALTER TABLE "DraftRevision" DROP COLUMN IF EXISTS "postStyle";
ALTER TABLE "Draft" DROP COLUMN IF EXISTS "factsCheck";
ALTER TABLE "Draft" DROP COLUMN IF EXISTS "postStyle";
ALTER TABLE "Campaign" DROP COLUMN IF EXISTS "defaultPostStyle";
ALTER TABLE "ScheduledGeneration" DROP COLUMN IF EXISTS "heldReason";
ALTER TABLE "ScheduledGeneration" DROP COLUMN IF EXISTS "postStyle";
ALTER TABLE "Brief" DROP COLUMN IF EXISTS "postStyle";

-- Un-record the migration, so a later redeploy's boot `migrate deploy`
-- re-applies it instead of seeing it as applied.
DELETE FROM "_prisma_migrations"
WHERE "migration_name" = '20261025120000_post_styles';
