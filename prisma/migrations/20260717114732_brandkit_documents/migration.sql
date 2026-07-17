-- CreateTable
CREATE TABLE "BrandKitDocument" (
    "id" TEXT NOT NULL,
    "brandKitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "objectKey" TEXT NOT NULL,
    "parsedText" TEXT NOT NULL,
    "truncated" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandKitDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BrandKitDocument_brandKitId_idx" ON "BrandKitDocument"("brandKitId");

-- AddForeignKey
ALTER TABLE "BrandKitDocument" ADD CONSTRAINT "BrandKitDocument_brandKitId_fkey" FOREIGN KEY ("brandKitId") REFERENCES "BrandKit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
