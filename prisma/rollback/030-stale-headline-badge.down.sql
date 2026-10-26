-- 030 NFR-03: the manual rollback, run only to remove the rendered-text columns
-- from a database that 20261027120000_rendered_text migrated. WARNING: it
-- discards every draft's and revision's stored rendered-text stamp. The previous
-- image does not need them: the columns are additive and that image never
-- touches them. It sits outside prisma/migrations/ on purpose: `migrate deploy`
-- never applies it.
--
--   docker exec -i designer-postgres-1 psql -v ON_ERROR_STOP=1 -U bistec -d <db> \
--     < prisma/rollback/030-stale-headline-badge.down.sql

ALTER TABLE "Draft" DROP COLUMN IF EXISTS "renderedText";
ALTER TABLE "DraftRevision" DROP COLUMN IF EXISTS "renderedText";

-- Un-record the migration, so a later redeploy's boot `migrate deploy`
-- re-applies it instead of seeing it as applied.
DELETE FROM "_prisma_migrations"
WHERE "migration_name" = '20261027120000_rendered_text';
