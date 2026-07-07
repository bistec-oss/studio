-- CreateEnum
CREATE TYPE "GenerationStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PostGenerationAction" AS ENUM ('HOLD', 'SCHEDULE_PUBLISH', 'PUBLISH_NOW');

-- CreateTable
CREATE TABLE "ScheduledGeneration" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "description" TEXT,
    "goal" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "channels" "Channel"[],
    "aspectRatio" "AspectRatio" NOT NULL DEFAULT 'SQUARE',
    "designMode" "DesignMode" NOT NULL,
    "templateId" TEXT,
    "generateAt" TIMESTAMP(3) NOT NULL,
    "postAction" "PostGenerationAction" NOT NULL DEFAULT 'HOLD',
    "publishAt" TIMESTAMP(3),
    "status" "GenerationStatus" NOT NULL DEFAULT 'PENDING',
    "errorReason" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "briefId" TEXT,
    "draftId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduledGeneration_status_generateAt_idx" ON "ScheduledGeneration"("status", "generateAt");

-- CreateIndex
CREATE INDEX "ScheduledGeneration_status_nextRetryAt_idx" ON "ScheduledGeneration"("status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "ScheduledGeneration_campaignId_idx" ON "ScheduledGeneration"("campaignId");

-- AddForeignKey
ALTER TABLE "ScheduledGeneration" ADD CONSTRAINT "ScheduledGeneration_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledGeneration" ADD CONSTRAINT "ScheduledGeneration_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledGeneration" ADD CONSTRAINT "ScheduledGeneration_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "BrandKitTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledGeneration" ADD CONSTRAINT "ScheduledGeneration_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "Brief"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledGeneration" ADD CONSTRAINT "ScheduledGeneration_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE SET NULL ON UPDATE CASCADE;
