-- 006 FR-01: the product event store. Additive only: one enum and two new
-- tables, no foreign keys and no change to an existing table, so the previous
-- image keeps working against the migrated schema (it never touches them).
-- The full removal is prisma/rollback/006-product-observability.down.sql.


-- CreateEnum
CREATE TYPE "AnalyticsSource" AS ENUM ('web', 'scheduler', 'mcp');

-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "source" "AnalyticsSource" NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT,
    "draftId" TEXT,
    "durationMs" INTEGER,
    "outcome" TEXT,
    "payload" JSONB NOT NULL,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsDrop" (
    "name" TEXT NOT NULL,
    "dropped" INTEGER NOT NULL DEFAULT 0,
    "rejected" INTEGER NOT NULL DEFAULT 0,
    "lastAt" TIMESTAMPTZ(3) NOT NULL,
    "lastReason" TEXT NOT NULL,

    CONSTRAINT "AnalyticsDrop_pkey" PRIMARY KEY ("name")
);

-- CreateIndex
CREATE INDEX "AnalyticsEvent_at_idx" ON "AnalyticsEvent"("at");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_name_at_idx" ON "AnalyticsEvent"("name", "at");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_teamId_at_idx" ON "AnalyticsEvent"("teamId", "at");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_draftId_idx" ON "AnalyticsEvent"("draftId");

