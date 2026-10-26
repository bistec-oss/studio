-- 025 NFR-03: the manual rollback, run only to remove the product screenshot
-- column from a database that 20261026120000_composite_source migrated. WARNING:
-- it discards every brief's stored screenshot reference (the private objects in
-- the docs bucket stay). The previous image does not need it: the column is
-- additive and that image never touches it. It sits outside prisma/migrations/
-- on purpose: `migrate deploy` never applies it.
--
--   docker exec -i designer-postgres-1 psql -v ON_ERROR_STOP=1 -U bistec -d <db> \
--     < prisma/rollback/025-hero-product-screenshots.down.sql

ALTER TABLE "Brief" DROP COLUMN IF EXISTS "compositeSource";

-- Un-record the migration, so a later redeploy's boot `migrate deploy`
-- re-applies it instead of seeing it as applied.
DELETE FROM "_prisma_migrations"
WHERE "migration_name" = '20261026120000_composite_source';
