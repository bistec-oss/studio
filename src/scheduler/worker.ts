import { runScheduledJobs } from "../lib/scheduler/jobRunner"
import { runGenerationJobs } from "../lib/scheduler/generationRunner"
import { isCliMode } from "../lib/agent/config"
import { prisma } from "../lib/prisma"

const POLL_INTERVAL_MS = 60_000

// One independent poll loop per job type. Generation can legitimately run for
// many minutes per tick; publishing must stay on its 60s cadence regardless —
// so the loops never share a tick.
async function loop(name: string, run: () => Promise<void>) {
  while (true) {
    try {
      await run()
    } catch (err) {
      console.error(`[${name}] tick error:`, err)
    }
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
  }
}

// Informational startup diagnostic (CLI mode only): each claimed
// ScheduledGeneration job now resolves its own team's Claude credential
// (withClaudeAuth(null, entry.teamId, ...) in generationRunner.ts) instead of
// a shared env token, so a team with none will have its scheduled generations
// fail (via the existing retry/failure path, not a crash) until a team admin
// connects one in Team Settings. This is a plain query, never fatal to
// startup — a DB hiccup here must not stop the scheduler from polling.
async function logTeamsWithoutClaudeToken(): Promise<void> {
  if (!isCliMode()) return
  try {
    const teams = await prisma.team.findMany({
      where: { encryptedClaudeToken: null },
      select: { name: true },
    })
    if (teams.length > 0) {
      console.log(
        `[scheduler] ${teams.length} team(s) have no Claude token — their CLI-mode scheduled ` +
          `generations will fail until a team admin connects one in Team Settings: ` +
          teams.map((t) => t.name).join(", ")
      )
    } else {
      console.log("[scheduler] all teams have a Claude token configured")
    }
  } catch (err) {
    console.error("[scheduler] startup Claude-token check failed (non-fatal):", err)
  }
}

async function main() {
  console.log("[scheduler] starting, poll interval:", POLL_INTERVAL_MS, "ms")

  await logTeamsWithoutClaudeToken()

  await Promise.all([
    loop("scheduler", runScheduledJobs),
    loop("generation", runGenerationJobs),
  ])
}

main().catch(err => {
  console.error("[scheduler] fatal:", err)
  process.exit(1)
})
