-- CreateEnum
CREATE TYPE "TeamRole" AS ENUM ('ADMIN', 'EDITOR');

-- AlterTable
ALTER TABLE "AvailableProvider" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "BrandKit" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "BrandKitDocument" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "Brief" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "BriefDraft" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "CampaignDocument" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "ChannelToken" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "Draft" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "ScheduledGeneration" ADD COLUMN     "teamId" TEXT;

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "encryptedClaudeToken" TEXT,
    "claudeKeyPrefix" TEXT,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMembership" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "TeamRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserOpenAiKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserOpenAiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Team_name_key" ON "Team"("name");

-- CreateIndex
CREATE INDEX "TeamMembership_userId_idx" ON "TeamMembership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMembership_teamId_userId_key" ON "TeamMembership"("teamId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserOpenAiKey_userId_key" ON "UserOpenAiKey"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_teamId_idx" ON "ApiKey"("teamId");

-- CreateIndex
CREATE INDEX "AvailableProvider_teamId_idx" ON "AvailableProvider"("teamId");

-- CreateIndex
CREATE INDEX "BrandKit_teamId_idx" ON "BrandKit"("teamId");

-- CreateIndex
CREATE INDEX "BrandKitDocument_teamId_idx" ON "BrandKitDocument"("teamId");

-- CreateIndex
CREATE INDEX "Brief_teamId_idx" ON "Brief"("teamId");

-- CreateIndex
CREATE INDEX "BriefDraft_teamId_idx" ON "BriefDraft"("teamId");

-- CreateIndex
CREATE INDEX "Campaign_teamId_idx" ON "Campaign"("teamId");

-- CreateIndex
CREATE INDEX "CampaignDocument_teamId_idx" ON "CampaignDocument"("teamId");

-- CreateIndex
CREATE INDEX "ChannelToken_teamId_idx" ON "ChannelToken"("teamId");

-- CreateIndex
CREATE INDEX "Draft_teamId_idx" ON "Draft"("teamId");

-- CreateIndex
CREATE INDEX "Post_teamId_idx" ON "Post"("teamId");

-- CreateIndex
CREATE INDEX "Project_teamId_idx" ON "Project"("teamId");

-- CreateIndex
CREATE INDEX "ScheduledGeneration_teamId_idx" ON "ScheduledGeneration"("teamId");

-- AddForeignKey
ALTER TABLE "TeamMembership" ADD CONSTRAINT "TeamMembership_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMembership" ADD CONSTRAINT "TeamMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOpenAiKey" ADD CONSTRAINT "UserOpenAiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
