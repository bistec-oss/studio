-- 023 FR-01: the scheduler heartbeat table. Additive only: one new table and
-- no change to an existing one, so the previous image keeps working against
-- the migrated schema (it never reads or writes the table). The full removal
-- is prisma/rollback/023-scheduler-heartbeat.down.sql.

-- CreateTable
CREATE TABLE "WorkerHeartbeat" (
    "loop" TEXT NOT NULL,
    "lastTickStartedAt" TIMESTAMP(3) NOT NULL,
    "lastTickEndedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerHeartbeat_pkey" PRIMARY KEY ("loop")
);
