import { runScheduledJobs } from "../lib/scheduler/jobRunner"
import { runGenerationJobs } from "../lib/scheduler/generationRunner"
import { isCliMode } from "../lib/agent/config"
import { env } from "../lib/env"

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

  // Scheduled generation spawns `claude -p` in CLI mode. The Docker image ships
  // the Claude Code CLI (since the 2026-07-07 per-user-token feature), and the
  // worker ALWAYS uses the shared CLAUDE_CODE_OAUTH_TOKEN — never a user's
  // personal token. Warn when that shared token is missing: a headless
  // container has no logged-in session to fall back to, so every scheduled
  // generation would fail. Publishing is unaffected either way.
  if (isCliMode()) {
    if (env.CLAUDE_CODE_OAUTH_TOKEN) {
      console.log(
        "[generation] DESIGN_PROVIDER=cli — scheduled generations spawn `claude -p` on the shared CLAUDE_CODE_OAUTH_TOKEN."
      )
    } else {
      console.warn(
        "[generation] ⚠ DESIGN_PROVIDER=cli with no CLAUDE_CODE_OAUTH_TOKEN set — headless `claude -p` spawns have " +
          "no credential to run on (a container has no logged-in Claude session), so scheduled generations will fail. " +
          "Set CLAUDE_CODE_OAUTH_TOKEN (from `claude setup-token`) or use API mode (DESIGN_PROVIDER=claude-html + ANTHROPIC_API_KEY)."
      )
    }
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
