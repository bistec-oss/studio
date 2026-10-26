-- 031 FR-21, FR-24 (and T12): script fonts on a kit, the render note on a draft and
-- each revision, and the fonts a kit had before an assistant apply changed them.
-- Additive: four nullable JSONB columns; no row is rewritten.
ALTER TABLE "BrandKit" ADD COLUMN "scriptFonts" JSONB;
ALTER TABLE "Draft" ADD COLUMN "renderNotes" JSONB;
ALTER TABLE "DraftRevision" ADD COLUMN "renderNotes" JSONB;
ALTER TABLE "BrandKitPrompt" ADD COLUMN "previousFonts" JSONB;
