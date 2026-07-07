import { runScheduledJobs } from "../lib/scheduler/jobRunner"
import { runGenerationJobs } from "../lib/scheduler/generationRunner"
import { isCliMode } from "../lib/agent/config"

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

async function main() {
  console.log("[scheduler] starting, poll interval:", POLL_INTERVAL_MS, "ms")

  // Scheduled generation spawns `claude -p` in CLI mode — a binary the Docker
  // scheduler image does not ship. Warn loudly rather than fail silently per
  // entry; publishing is unaffected.
  if (isCliMode()) {
    console.warn(
      "[generation] ⚠ DESIGN_PROVIDER=cli — scheduled generation requires the `claude` CLI on this host. " +
        "Inside the Docker scheduler container it is NOT installed and every scheduled generation will fail; " +
        "use API mode (DESIGN_PROVIDER=claude-html + ANTHROPIC_API_KEY) or run the worker on a host with the CLI."
    )
  }

  await Promise.all([
    loop("scheduler", runScheduledJobs),
    loop("generation", runGenerationJobs),
  ])
}

main().catch(err => {
  console.error("[scheduler] fatal:", err)
  process.exit(1)
})
