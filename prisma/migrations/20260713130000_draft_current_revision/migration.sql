-- Add a "current version" pointer to Draft so the design history behaves as an
-- append-only log the user can move back AND forward over.
ALTER TABLE "Draft" ADD COLUMN "currentRevisionNumber" INTEGER;

-- Best-effort backfill for existing drafts: point at their latest revision (if any).
-- Legacy drafts have no v1 "original" revision, so they simply start from their
-- highest existing revision; new drafts get a v1 at generation.
UPDATE "Draft" d
SET "currentRevisionNumber" = (
  SELECT MAX(r."revisionNumber")
  FROM "DraftRevision" r
  WHERE r."draftId" = d."id"
)
WHERE EXISTS (
  SELECT 1 FROM "DraftRevision" r WHERE r."draftId" = d."id"
);
