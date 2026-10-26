-- 031 NFR-02: the manual rollback for the three 031 migrations, in REVERSE order
-- (A, then B, then C). Run only the sections whose migration was applied, and
-- stop at the first error. It sits outside prisma/migrations/ on purpose:
-- `migrate deploy` never applies it.
--
--   docker exec -i designer-postgres-1 psql -v ON_ERROR_STOP=1 -U bistec -d <db> \
--     < prisma/rollback/031-v2-final-polish.down.sql
--
-- Run it with an explicit database name; never against bistec_studio by habit.

-- ============================================================================
-- Section A: 20261030120000_apply_text_action
-- ============================================================================
-- Postgres cannot drop an enum value, so this section leaves 'APPLY_TEXT' in
-- the "DraftAction" type. That is harmless: the previous image never reads it.
-- Before running the other sections, clear any claim that holds it, so no row
-- carries a value the previous image does not know:
UPDATE "Draft" SET "pendingAction" = NULL, "pendingActionClaimId" = NULL
WHERE "pendingAction" = 'APPLY_TEXT';

-- Un-record the migration, so a later redeploy's boot `migrate deploy` runs it
-- again. Its statement is not idempotent, so a re-run on a database that still
-- holds the value would fail: drop this DELETE if you will not re-apply.
DELETE FROM "_prisma_migrations"
WHERE "migration_name" = '20261030120000_apply_text_action';

-- ============================================================================
-- Section B: 20261029120000_post_fonts
-- It drops each kit's script fonts, each draft's and revision's render note, and
-- the fonts a prompt version recorded before an assistant apply. The previous
-- image reads none of them. The stored HTML keeps the injected font link and
-- stack entries, which render as before.
-- ============================================================================
ALTER TABLE "BrandKitPrompt" DROP COLUMN IF EXISTS "previousFonts";
ALTER TABLE "DraftRevision" DROP COLUMN IF EXISTS "renderNotes";
ALTER TABLE "Draft" DROP COLUMN IF EXISTS "renderNotes";
ALTER TABLE "BrandKit" DROP COLUMN IF EXISTS "scriptFonts";

DELETE FROM "_prisma_migrations"
WHERE "migration_name" = '20261029120000_post_fonts';

-- ============================================================================
-- Section C: 20261028120000_personal_image_key_provider
-- WARNING: it deletes every personal image key that is not an OpenAI key (the
-- previous image cannot read a Gemini key), so those users must re-enter their
-- key after a rollback. OpenAI rows stay. It also drops each draft's stored
-- image source.
-- ============================================================================
DELETE FROM "UserOpenAiKey" WHERE "provider" <> 'openai';
ALTER TABLE "UserOpenAiKey" DROP COLUMN IF EXISTS "provider";
ALTER TABLE "Draft" DROP COLUMN IF EXISTS "imageSource";

-- Un-record the migration, so a later redeploy's boot `migrate deploy`
-- re-applies it instead of seeing it as applied.
DELETE FROM "_prisma_migrations"
WHERE "migration_name" = '20261028120000_personal_image_key_provider';
