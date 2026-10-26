-- 019 FR-01: the manual rollback, run only to remove the claim-token column
-- from a database that 20261020120000_draft_action_claim_id migrated. The
-- previous image does not need it: the column is additive and nullable, and
-- that image never reads it. It sits outside prisma/migrations/ on purpose:
-- `migrate deploy` never applies it.
--
--   docker exec -i designer-postgres-1 psql -v ON_ERROR_STOP=1 -U bistec -d <db> \
--     < prisma/rollback/019-draft-action-claim-token.down.sql

ALTER TABLE "Draft" DROP COLUMN IF EXISTS "pendingActionClaimId";

-- L24: un-record the migration. Without this, a later redeploy sees it as
-- applied and never re-runs it, and the schema no longer matches the
-- migration history. With it, the roll-forward's boot `migrate deploy`
-- re-applies it on its own.
DELETE FROM "_prisma_migrations"
WHERE "migration_name" = '20261020120000_draft_action_claim_id';
