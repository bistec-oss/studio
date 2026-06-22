-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'EDITOR');

-- CreateEnum
CREATE TYPE "DesignMode" AS ENUM ('TEMPLATE', 'GENERATE');

-- CreateEnum
CREATE TYPE "DraftStatus" AS ENUM ('IN_PROGRESS', 'EXPORTED', 'PUBLISHED', 'FAILED');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('INSTAGRAM', 'LINKEDIN');

-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('PENDING', 'SCHEDULED', 'PUBLISHED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProviderSlot" AS ENUM ('COPY', 'IMAGE');

-- CreateEnum
CREATE TYPE "ArtifactType" AS ENUM ('LOGO', 'FONT', 'COLOR', 'REFERENCE_IMAGE', 'EXAMPLE_POST', 'OTHER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'EDITOR',

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultBrandKitId" TEXT,
    "defaultTone" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brandKitId" TEXT,
    "defaultTone" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectCampaign" (
    "projectId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,

    CONSTRAINT "ProjectCampaign_pkey" PRIMARY KEY ("projectId","campaignId")
);

-- CreateTable
CREATE TABLE "CampaignDraft" (
    "campaignId" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,

    CONSTRAINT "CampaignDraft_pkey" PRIMARY KEY ("campaignId","draftId")
);

-- CreateTable
CREATE TABLE "Brief" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "campaignId" TEXT,
    "topic" TEXT NOT NULL,
    "description" TEXT,
    "goal" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "channels" TEXT[],
    "designMode" "DesignMode" NOT NULL,
    "copyProviderKey" TEXT NOT NULL,
    "imageProviderKey" TEXT,
    "additionalImageUrl" TEXT,
    "briefImages" JSONB,
    "referenceTemplateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Brief_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Draft" (
    "id" TEXT NOT NULL,
    "briefId" TEXT NOT NULL,
    "copyText" TEXT NOT NULL,
    "imageUrl" TEXT,
    "htmlContent" TEXT,
    "templateId" TEXT,
    "exportUrl" TEXT,
    "pendingConflict" JSONB,
    "status" "DraftStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Draft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "status" "PostStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "platformId" TEXT,
    "errorReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandKit" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "colors" JSONB,
    "fonts" JSONB,
    "logoUrl" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandKit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandKitTemplate" (
    "id" TEXT NOT NULL,
    "brandKitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "htmlTemplate" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandKitTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandKitPrompt" (
    "id" TEXT NOT NULL,
    "brandKitId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandKitPrompt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandKitArtifact" (
    "id" TEXT NOT NULL,
    "brandKitId" TEXT NOT NULL,
    "type" "ArtifactType" NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "feedToAI" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandKitArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailableProvider" (
    "id" TEXT NOT NULL,
    "slot" "ProviderSlot" NOT NULL,
    "providerKey" TEXT NOT NULL,
    "providerName" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "encryptedApiKey" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvailableProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftRevision" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "instruction" TEXT NOT NULL,
    "htmlSnapshot" TEXT NOT NULL,
    "exportUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DraftRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE UNIQUE INDEX "BrandKitPrompt_brandKitId_version_key" ON "BrandKitPrompt"("brandKitId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "AvailableProvider_slot_providerKey_key" ON "AvailableProvider"("slot", "providerKey");

-- CreateIndex
CREATE UNIQUE INDEX "DraftRevision_draftId_revisionNumber_key" ON "DraftRevision"("draftId", "revisionNumber");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_defaultBrandKitId_fkey" FOREIGN KEY ("defaultBrandKitId") REFERENCES "BrandKit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_brandKitId_fkey" FOREIGN KEY ("brandKitId") REFERENCES "BrandKit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCampaign" ADD CONSTRAINT "ProjectCampaign_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCampaign" ADD CONSTRAINT "ProjectCampaign_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignDraft" ADD CONSTRAINT "CampaignDraft_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignDraft" ADD CONSTRAINT "CampaignDraft_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Brief" ADD CONSTRAINT "Brief_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Brief" ADD CONSTRAINT "Brief_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Brief" ADD CONSTRAINT "Brief_referenceTemplateId_fkey" FOREIGN KEY ("referenceTemplateId") REFERENCES "BrandKitTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "Brief"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandKitTemplate" ADD CONSTRAINT "BrandKitTemplate_brandKitId_fkey" FOREIGN KEY ("brandKitId") REFERENCES "BrandKit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandKitPrompt" ADD CONSTRAINT "BrandKitPrompt_brandKitId_fkey" FOREIGN KEY ("brandKitId") REFERENCES "BrandKit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandKitArtifact" ADD CONSTRAINT "BrandKitArtifact_brandKitId_fkey" FOREIGN KEY ("brandKitId") REFERENCES "BrandKit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftRevision" ADD CONSTRAINT "DraftRevision_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
