-- AlterTable
ALTER TABLE "Brief" ADD COLUMN     "brandKitId" TEXT;

-- CreateIndex
CREATE INDEX "Brief_brandKitId_idx" ON "Brief"("brandKitId");

-- AddForeignKey
ALTER TABLE "Brief" ADD CONSTRAINT "Brief_brandKitId_fkey" FOREIGN KEY ("brandKitId") REFERENCES "BrandKit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
