-- 008 FR-06: model selection storage. Additive only: no DROP, no RENAME and no
-- ALTER TYPE … ADD VALUE, so the previous image keeps working against the
-- migrated schema (it never reads these objects; NFR-06). Every new stamp
-- column is nullable TEXT, so pre-008 rows read as "unknown" (004's stamp
-- rule). The full removal is prisma/rollback/008-model-selection.down.sql.
-- Constraint and FK names are the ones Prisma generates for schema.prisma, so
-- a later `prisma migrate diff` is clean.

-- CreateEnum
CREATE TYPE "ModelKey" AS ENUM ('HAIKU', 'SONNET', 'OPUS');

-- CreateEnum
CREATE TYPE "ModelSurface" AS ENUM ('CAPTION', 'DESIGN_TEMPLATE', 'DESIGN_FREEFORM', 'REFINE', 'ASSISTANT_BRIEFING', 'ASSISTANT_BRANDKIT');

-- CreateTable
-- FR-05: one row per team, absent until an admin first saves the policy.
CREATE TABLE "TeamModelPolicy" (
    "teamId" TEXT NOT NULL,
    "allowedModels" "ModelKey"[],
    "requirePersonalTokenForGated" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamModelPolicy_pkey" PRIMARY KEY ("teamId")
);

-- CreateTable
-- FR-05: a missing (teamId, surface) row means "use the system default".
CREATE TABLE "TeamModelDefault" (
    "teamId" TEXT NOT NULL,
    "surface" "ModelSurface" NOT NULL,
    "model" "ModelKey" NOT NULL,

    CONSTRAINT "TeamModelDefault_pkey" PRIMARY KEY ("teamId","surface")
);

-- AlterTable
-- FR-10: the initial generation's explicit request; null = none.
ALTER TABLE "Brief" ADD COLUMN     "captionModel" "ModelKey",
ADD COLUMN     "designModel" "ModelKey";

-- AlterTable
-- FR-08: the stamps. TEXT, not "ModelKey": they record exactly what crossed
-- the boundary, including a retired or non-Claude ID. History is never rewritten.
ALTER TABLE "Draft" ADD COLUMN     "headlineModel" TEXT,
ADD COLUMN     "headlineModelSubstitutedFrom" TEXT,
ADD COLUMN     "designModel" TEXT,
ADD COLUMN     "designModelSubstitutedFrom" TEXT;

-- AlterTable
ALTER TABLE "DraftRevision" ADD COLUMN     "model" TEXT,
ADD COLUMN     "modelSubstitutedFrom" TEXT;

-- AlterTable
ALTER TABLE "DraftCaption" ADD COLUMN     "model" TEXT,
ADD COLUMN     "modelSubstitutedFrom" TEXT;

-- AddForeignKey
ALTER TABLE "TeamModelPolicy" ADD CONSTRAINT "TeamModelPolicy_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamModelDefault" ADD CONSTRAINT "TeamModelDefault_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "TeamModelPolicy"("teamId") ON DELETE CASCADE ON UPDATE CASCADE;
