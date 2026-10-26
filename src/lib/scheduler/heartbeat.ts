import { prisma } from "../prisma"

// Best-effort heartbeat writers for the scheduler worker (023 FR-03). Relative
// imports only: the Dockerfile bundles the worker with esbuild. A failing write
// is logged and swallowed; it must never stall or stop a poll loop.

export async function recordTickStart(loop: string): Promise<void> {
  try {
    const now = new Date()
    await prisma.workerHeartbeat.upsert({
      where: { loop },
      create: { loop, lastTickStartedAt: now },
      update: { lastTickStartedAt: now },
    })
  } catch (err) {
    console.error(`[heartbeat] ${loop} write failed (non-fatal):`, err)
  }
}

export async function recordTickEnd(loop: string): Promise<void> {
  try {
    const now = new Date()
    await prisma.workerHeartbeat.upsert({
      where: { loop },
      create: { loop, lastTickStartedAt: now, lastTickEndedAt: now },
      update: { lastTickEndedAt: now },
    })
  } catch (err) {
    console.error(`[heartbeat] ${loop} write failed (non-fatal):`, err)
  }
}

// Wraps one tick: start, the job, then the end whether the job resolved or
// threw. A throw is rethrown after the end write, so the worker's own per-tick
// catch still logs it.
export async function runTick(loop: string, run: () => Promise<void>): Promise<void> {
  await recordTickStart(loop)
  try {
    await run()
  } finally {
    await recordTickEnd(loop)
  }
}
