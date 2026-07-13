-- CreateTable
CREATE TABLE "BriefDraft" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topic" TEXT NOT NULL DEFAULT '',
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BriefDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BriefDraft_userId_updatedAt_idx" ON "BriefDraft"("userId", "updatedAt");

-- AddForeignKey
ALTER TABLE "BriefDraft" ADD CONSTRAINT "BriefDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
