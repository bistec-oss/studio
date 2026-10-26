-- 025 FR-11: the brief's product screenshot, {kind, key, width, height}. Additive and nullable.
ALTER TABLE "Brief" ADD COLUMN "compositeSource" JSONB;
