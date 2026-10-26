-- 006 FR-01: the manual rollback, run only to remove the analytics tables from
-- a database that 20261024120000_analytics_events migrated. The previous image
-- does not need it: the tables are additive and that image never touches them.
-- It sits outside prisma/migrations/ on purpose: `migrate deploy` never applies it.
--
--   docker exec -i designer-postgres-1 psql -v ON_ERROR_STOP=1 -U bistec -d <db> \
--     < prisma/rollback/006-product-observability.down.sql

DROP TABLE IF EXISTS "AnalyticsEvent";
DROP TABLE IF EXISTS "AnalyticsDrop";
DROP TYPE IF EXISTS "AnalyticsSource";

-- L24: un-record the migration. Without this, a later redeploy sees it as
-- applied and never re-runs it, and the schema no longer matches the
-- migration history. With it, the roll-forward's boot `migrate deploy`
-- re-applies it on its own.
DELETE FROM "_prisma_migrations"
WHERE "migration_name" = '20261024120000_analytics_events';
