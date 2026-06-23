import { runScheduledJobs } from "../lib/scheduler/jobRunner"

const POLL_INTERVAL_MS = 60_000

async function main() {
  console.log("[scheduler] starting, poll interval:", POLL_INTERVAL_MS, "ms")
  while (true) {
    try {
      await runScheduledJobs()
    } catch (err) {
      console.error("[scheduler] tick error:", err)
    }
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
  }
}

main().catch(err => {
  console.error("[scheduler] fatal:", err)
  process.exit(1)
})
