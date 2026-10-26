-- 031 FR-10, FR-13: the provider of a personal image key, and where a draft's image came from.
-- Additive. Existing personal keys are OpenAI keys, so the default backfills them; no row is rewritten.
ALTER TABLE "UserOpenAiKey" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'openai';
ALTER TABLE "Draft" ADD COLUMN "imageSource" JSONB;
