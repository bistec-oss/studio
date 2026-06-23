-- AlterEnum
ALTER TYPE "PostStatus" ADD VALUE 'PUBLISHING';

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "nextRetryAt" TIMESTAMP(3),
ADD COLUMN     "retryCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Post_status_nextRetryAt_idx" ON "Post"("status", "nextRetryAt");
