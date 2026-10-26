-- 012 FR-04, migration 2: per-channel caption storage. Additive only — no
-- column is renamed or dropped, so the previous container keeps working between
-- `migrate deploy` and cutover (NFR-05). Data never moves here: legacy captions
-- are split by the TypeScript planner (src/lib/captions/backfill.ts at boot,
-- and lazily by src/lib/captions/store.ts loadDraftCaptions).

-- CreateEnum
CREATE TYPE "CaptionStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "CaptionMigration" AS ENUM ('SPLIT', 'UNSPLIT_FALLBACK', 'EMPTY');

-- AlterTable
ALTER TABLE "Draft" ADD COLUMN     "headline" TEXT,
ADD COLUMN     "captionMigration" "CaptionMigration";

-- CreateTable
CREATE TABLE "DraftCaption" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "status" "CaptionStatus" NOT NULL DEFAULT 'PENDING',
    "failureReason" TEXT,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DraftCaption_pkey" PRIMARY KEY ("id"),
    -- A7: FAILED means the channel has no usable text. A failed regenerate over
    -- good text leaves the row READY with failureReason set instead.
    CONSTRAINT "DraftCaption_failed_has_no_text" CHECK ("status" <> 'FAILED' OR "text" = '')
);

-- CreateIndex
CREATE INDEX "DraftCaption_draftId_idx" ON "DraftCaption"("draftId");

-- CreateIndex
CREATE UNIQUE INDEX "DraftCaption_draftId_channel_key" ON "DraftCaption"("draftId", "channel");

-- AddForeignKey
ALTER TABLE "DraftCaption" ADD CONSTRAINT "DraftCaption_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
