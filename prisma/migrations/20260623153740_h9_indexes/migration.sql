-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE INDEX "BrandKit_isDefault_isDeleted_idx" ON "BrandKit"("isDefault", "isDeleted");

-- CreateIndex
CREATE INDEX "BrandKitArtifact_brandKitId_idx" ON "BrandKitArtifact"("brandKitId");

-- CreateIndex
CREATE INDEX "BrandKitTemplate_brandKitId_idx" ON "BrandKitTemplate"("brandKitId");

-- CreateIndex
CREATE INDEX "Brief_userId_idx" ON "Brief"("userId");

-- CreateIndex
CREATE INDEX "Brief_campaignId_idx" ON "Brief"("campaignId");

-- CreateIndex
CREATE INDEX "Draft_briefId_idx" ON "Draft"("briefId");

-- CreateIndex
CREATE INDEX "Post_status_scheduledAt_idx" ON "Post"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "Post_draftId_idx" ON "Post"("draftId");

-- CreateIndex
CREATE INDEX "Post_userId_idx" ON "Post"("userId");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
