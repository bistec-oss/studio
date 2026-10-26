-- F3 (change 004 final fix wave, AC-04/FR-22): per-revision render stamps.
-- Draft.promptVersion / Draft.fontSet describe the draft's CURRENT render, but
-- restore reuses an older revision's PNG and "Use anyway" adopts a rejected
-- render made earlier, so the draft can only carry the right stamp if each
-- DraftRevision records the prompt version that produced its HTML and the
-- font set that rasterized its PNG. Restore and adopt copy the row's stamp
-- back onto the draft. Nullable, no backfill: a pre-F3 row's stamp is
-- unknown, and restoring/adopting it nulls the draft's stamp (unknown is
-- honest; a stale value is not).
--
-- ── DOWN PATH (manual; Prisma has no down migrations) ───────────────────────
-- Pre-F3 code never reads these columns, so they are harmless to it; dropping
-- them only restores the schema.
--   ALTER TABLE "DraftRevision" DROP COLUMN "fontSet", DROP COLUMN "promptVersion";
--   DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261001120000_revision_render_stamps';

ALTER TABLE "DraftRevision" ADD COLUMN "fontSet" TEXT,
ADD COLUMN "promptVersion" TEXT;
