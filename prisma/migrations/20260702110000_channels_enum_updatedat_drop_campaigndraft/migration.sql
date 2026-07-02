-- A7: drop the dead CampaignDraft join table (never written by any code path)
DROP TABLE "CampaignDraft";

-- F3/A18: Brief.channels TEXT[] -> "Channel"[], uppercasing existing rows
-- (legacy rows stored lowercase 'instagram'/'linkedin'). Subqueries aren't
-- allowed in ALTER ... USING, so uppercase first, then cast elementwise.
UPDATE "Brief"
SET "channels" = COALESCE(
  (SELECT array_agg(UPPER(c)) FROM unnest("channels") AS c),
  '{}'
);

ALTER TABLE "Brief"
  ALTER COLUMN "channels" DROP DEFAULT,
  ALTER COLUMN "channels" TYPE "Channel"[]
    USING ("channels"::text[]::"Channel"[]);

-- A18: updatedAt on the two state-machine models. DEFAULT now() backfills
-- existing rows; Prisma's @updatedAt maintains it from here on.
ALTER TABLE "Draft" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Post" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
