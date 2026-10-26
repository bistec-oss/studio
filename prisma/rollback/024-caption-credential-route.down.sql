-- 024 FR-01: the manual rollback, run only to remove the caption route columns
-- and type from a database that 20261023120000_caption_route migrated. WARNING:
-- it discards every team's chosen route and every route stamp. The previous
-- image does not need it: the columns are additive and that image never touches
-- them. It sits outside prisma/migrations/ on purpose: `migrate deploy` never
-- applies it.
--
--   docker exec -i designer-postgres-1 psql -v ON_ERROR_STOP=1 -U bistec -d <db> \
--     < prisma/rollback/024-caption-credential-route.down.sql

ALTER TABLE "DraftCaption" DROP COLUMN IF EXISTS "route";
ALTER TABLE "Draft" DROP COLUMN IF EXISTS "headlineRoute";
ALTER TABLE "Team" DROP COLUMN IF EXISTS "captionRoute";

DROP TYPE IF EXISTS "CaptionRoute";

-- L24: un-record the migration. Without this, a later redeploy sees it as
-- applied and never re-runs it, and the schema no longer matches the
-- migration history. With it, the roll-forward's boot `migrate deploy`
-- re-applies it on its own.
DELETE FROM "_prisma_migrations"
WHERE "migration_name" = '20261023120000_caption_route';
