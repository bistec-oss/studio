-- 024 FR-01: the caption credential route. Additive only: one new enum type and
-- three nullable columns with no default, no backfill and no index, so
-- Postgres rewrites no table and the previous image keeps working against the
-- migrated schema (it never reads or writes the three columns, and its
-- team.create and draftCaption.create omit them). Null on "Team"."captionRoute"
-- means the team never chose a route. The full removal is
-- prisma/rollback/024-caption-credential-route.down.sql.

-- CreateEnum
CREATE TYPE "CaptionRoute" AS ENUM ('CLI', 'API_KEY');

-- AlterTable
ALTER TABLE "Team" ADD COLUMN "captionRoute" "CaptionRoute";

-- AlterTable
ALTER TABLE "Draft" ADD COLUMN "headlineRoute" TEXT;

-- AlterTable
ALTER TABLE "DraftCaption" ADD COLUMN "route" TEXT;
