-- CreateEnum
CREATE TYPE "DraftAction" AS ENUM ('REGENERATE_COPY', 'REGENERATE_DESIGN', 'REFINE');

-- AlterTable
ALTER TABLE "Draft" ADD COLUMN     "pendingAction" "DraftAction",
ADD COLUMN     "pendingActionError" TEXT;
