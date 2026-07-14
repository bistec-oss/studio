-- Brand-kit reference documents (voice/color grounding from PDFs etc.):
-- new REFERENCE_DOC artifact type + parsed-text storage on BrandKitArtifact.
ALTER TYPE "ArtifactType" ADD VALUE 'REFERENCE_DOC';

ALTER TABLE "BrandKitArtifact" ADD COLUMN "parsedText" TEXT;
ALTER TABLE "BrandKitArtifact" ADD COLUMN "truncated" BOOLEAN NOT NULL DEFAULT false;
