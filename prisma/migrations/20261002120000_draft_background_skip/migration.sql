-- 005 T2 (FR-06/FR-07): a skipped AI background is recorded on the draft with
-- its reason, so the draft page can say why the post has no AI image. Two
-- nullable TEXT columns, no backfill: an existing draft reads as NULL, which
-- means "no notice". Plain TEXT rather than a Postgres enum, so adding a
-- reason later needs no migration; the allowed values (NO_PROVIDER,
-- PROVIDER_ERROR, DECISION_ERROR) are enforced in
-- src/lib/drafts/backgroundNotice.ts. Item 3 of 005 only (NFR-04).
--
-- ── DOWN PATH (manual; Prisma has no down migrations) ───────────────────────
-- Order-independent: pre-T2 code never reads or writes these columns, so the
-- code can be reverted before or after this runs.
--
--   ALTER TABLE "Draft" DROP COLUMN "backgroundSkipReason", DROP COLUMN "backgroundSkipDetail";
--   DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261002120000_draft_background_skip';

ALTER TABLE "Draft" ADD COLUMN     "backgroundSkipReason" TEXT,
ADD COLUMN     "backgroundSkipDetail" TEXT;
