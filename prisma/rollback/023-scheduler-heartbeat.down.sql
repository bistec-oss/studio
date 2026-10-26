-- 023 FR-01: the manual rollback, run only to remove the heartbeat table from
-- a database that 20261021120000_worker_heartbeat migrated. The previous image
-- does not need it: the table is additive and that image never touches it. It
-- sits outside prisma/migrations/ on purpose: `migrate deploy` never applies it.
--
--   docker exec -i designer-postgres-1 psql -v ON_ERROR_STOP=1 -U bistec -d <db> \
--     < prisma/rollback/023-scheduler-heartbeat.down.sql

DROP TABLE IF EXISTS "WorkerHeartbeat";

-- L24: un-record the migration. Without this, a later redeploy sees it as
-- applied and never re-runs it, and the schema no longer matches the
-- migration history. With it, the roll-forward's boot `migrate deploy`
-- re-applies it on its own.
DELETE FROM "_prisma_migrations"
WHERE "migration_name" = '20261021120000_worker_heartbeat';
