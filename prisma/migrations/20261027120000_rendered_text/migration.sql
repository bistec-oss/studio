-- 030 FR-01: the text a render visibly painted ({ headline: { text, verified, reason? } }),
-- on the draft and on each revision. Additive and nullable; null = rendered before 030. No backfill.
ALTER TABLE "Draft" ADD COLUMN "renderedText" JSONB;
ALTER TABLE "DraftRevision" ADD COLUMN "renderedText" JSONB;
