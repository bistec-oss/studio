-- Team tenancy, part B: backfill pre-team rows into a default team, then make
-- teamId non-null everywhere and swap the two provider-level unique
-- constraints for per-team composites.
--
-- The backfill below MUST run before the `SET NOT NULL` statements further
-- down — every row created before Migration A / Task 6 stamped teamId at
-- create sites still has teamId IS NULL, and `ALTER COLUMN ... SET NOT NULL`
-- would fail against any remaining NULL. Embedding it here (rather than
-- relying on a standalone script run between migrations A and B) keeps
-- `prisma migrate deploy` self-contained on every machine.
--
-- Idempotent: fixed ids + `WHERE NOT EXISTS` / `ON CONFLICT DO NOTHING` /
-- `WHERE "teamId" IS NULL` mean re-running this file (e.g. a partial deploy
-- retried) is a no-op the second time.

-- Backfill: default team absorbs all pre-team rows (idempotent)
INSERT INTO "Team" ("id", "name", "createdAt")
SELECT 'team_bistec_default', 'Bistec', now()
WHERE NOT EXISTS (SELECT 1 FROM "Team" WHERE "name" = 'Bistec');

INSERT INTO "TeamMembership" ("id", "teamId", "userId", "role", "createdAt")
SELECT 'tm_' || u."id", t."id", u."id",
       CASE WHEN u."role" IN ('ADMIN','SUPER_ADMIN') THEN 'ADMIN'::"TeamRole" ELSE 'EDITOR'::"TeamRole" END,
       now()
FROM "User" u CROSS JOIN (SELECT "id" FROM "Team" WHERE "name" = 'Bistec') t
ON CONFLICT ("teamId","userId") DO NOTHING;

UPDATE "Project" SET "teamId" = (SELECT "id" FROM "Team" WHERE "name" = 'Bistec') WHERE "teamId" IS NULL;
UPDATE "Campaign" SET "teamId" = (SELECT "id" FROM "Team" WHERE "name" = 'Bistec') WHERE "teamId" IS NULL;
UPDATE "BrandKit" SET "teamId" = (SELECT "id" FROM "Team" WHERE "name" = 'Bistec') WHERE "teamId" IS NULL;
UPDATE "Brief" SET "teamId" = (SELECT "id" FROM "Team" WHERE "name" = 'Bistec') WHERE "teamId" IS NULL;
UPDATE "Draft" SET "teamId" = (SELECT "id" FROM "Team" WHERE "name" = 'Bistec') WHERE "teamId" IS NULL;
UPDATE "Post" SET "teamId" = (SELECT "id" FROM "Team" WHERE "name" = 'Bistec') WHERE "teamId" IS NULL;
UPDATE "ScheduledGeneration" SET "teamId" = (SELECT "id" FROM "Team" WHERE "name" = 'Bistec') WHERE "teamId" IS NULL;
UPDATE "BriefDraft" SET "teamId" = (SELECT "id" FROM "Team" WHERE "name" = 'Bistec') WHERE "teamId" IS NULL;
UPDATE "CampaignDocument" SET "teamId" = (SELECT "id" FROM "Team" WHERE "name" = 'Bistec') WHERE "teamId" IS NULL;
UPDATE "BrandKitDocument" SET "teamId" = (SELECT "id" FROM "Team" WHERE "name" = 'Bistec') WHERE "teamId" IS NULL;
UPDATE "AvailableProvider" SET "teamId" = (SELECT "id" FROM "Team" WHERE "name" = 'Bistec') WHERE "teamId" IS NULL;
UPDATE "ChannelToken" SET "teamId" = (SELECT "id" FROM "Team" WHERE "name" = 'Bistec') WHERE "teamId" IS NULL;

-- DropIndex: old provider-level unique constraints (pre-team scoping)
DROP INDEX "AvailableProvider_slot_providerKey_key";

-- DropIndex
DROP INDEX "ChannelToken_channel_key";

-- AlterTable: teamId is now guaranteed non-null by the backfill above
ALTER TABLE "AvailableProvider" ALTER COLUMN "teamId" SET NOT NULL;

-- AlterTable
ALTER TABLE "BrandKit" ALTER COLUMN "teamId" SET NOT NULL;

-- AlterTable
ALTER TABLE "BrandKitDocument" ALTER COLUMN "teamId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Brief" ALTER COLUMN "teamId" SET NOT NULL;

-- AlterTable
ALTER TABLE "BriefDraft" ALTER COLUMN "teamId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Campaign" ALTER COLUMN "teamId" SET NOT NULL;

-- AlterTable
ALTER TABLE "CampaignDocument" ALTER COLUMN "teamId" SET NOT NULL;

-- AlterTable
ALTER TABLE "ChannelToken" ALTER COLUMN "teamId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Draft" ALTER COLUMN "teamId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Post" ALTER COLUMN "teamId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Project" ALTER COLUMN "teamId" SET NOT NULL;

-- AlterTable
ALTER TABLE "ScheduledGeneration" ALTER COLUMN "teamId" SET NOT NULL;

-- CreateIndex: new per-team composite uniques
CREATE UNIQUE INDEX "AvailableProvider_teamId_slot_providerKey_key" ON "AvailableProvider"("teamId", "slot", "providerKey");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelToken_teamId_channel_key" ON "ChannelToken"("teamId", "channel");
