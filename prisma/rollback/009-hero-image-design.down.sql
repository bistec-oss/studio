-- 009 FR-01: the manual rollback, run only to remove the hero-image columns
-- from a database that 20261022120000_hero_composition migrated. It DISCARDS
-- every Brief.imageStyle choice and every Draft/DraftRevision composition
-- stamp. The previous image does not need it: the columns are additive and
-- that image never reads them. It sits outside prisma/migrations/ on purpose:
-- `migrate deploy` never applies it.
--
--   docker exec -i designer-postgres-1 psql -v ON_ERROR_STOP=1 -U bistec -d <db> \
--     < prisma/rollback/009-hero-image-design.down.sql

ALTER TABLE "DraftRevision" DROP COLUMN IF EXISTS "composition";
ALTER TABLE "Draft" DROP COLUMN IF EXISTS "composition";
ALTER TABLE "Brief" DROP COLUMN IF EXISTS "imageStyle";

-- L24: un-record the migration. Without this, a later redeploy sees it as
-- applied and never re-runs it, and the schema no longer matches the
-- migration history. With it, the roll-forward's boot `migrate deploy`
-- re-applies it on its own.
DELETE FROM "_prisma_migrations"
WHERE "migration_name" = '20261022120000_hero_composition';
