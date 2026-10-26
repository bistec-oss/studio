// The 180-day retention sweep (006 FR-11). Relative imports only: the scheduler
// worker is esbuild-bundled and does not resolve the "@/" alias (as heartbeat.ts).
//
// One indexed DELETE per tick, at most BATCH rows, the cutoff computed in SQL
// and taking no input, so there is no gate state to store and nothing a caller
// can widen. A backlog drains over successive 60 s ticks.
import { prisma } from "../prisma"

export const RETENTION_DAYS = 180
export const RETENTION_BATCH = 5000

/** Deletes up to RETENTION_BATCH events older than 180 days; returns how many. */
export async function sweepAnalytics(): Promise<number> {
  return prisma.$executeRaw`
    DELETE FROM "AnalyticsEvent" WHERE id IN (
      SELECT id FROM "AnalyticsEvent"
      WHERE "at" < now() - interval '180 days'
      ORDER BY "at"
      LIMIT 5000)`
}
