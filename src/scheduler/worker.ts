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

  // Scheduled generation spawns `claude -p` in CLI mode. As of Task 10 there is
  // NO shared env credential tier anymore — every CLI-mode `claude -p` call
  // needs a resolved personal-or-team ClaudeCliAuth in its AsyncLocalStorage
  // context (src/lib/agent/claudeAuth.ts), and this loop never enters one
  // (generateDraftForBrief runs with no ALS context here — see the
  // TODO(Task 14) at the call site in generationRunner.ts). So today, in CLI
  // mode, every scheduled generation will fail with the no-credential
  // ClaudeCliError regardless of any env var. Publishing is unaffected either
  // way (it doesn't call Claude).
  // TODO(Task 14): once each ScheduledGeneration/Post carries a teamId and this
  // loop resolves+logs that team's Claude token presence, replace this whole
  // block with real per-team credential-presence diagnostics.
  if (isCliMode()) {
    console.warn(
      "[generation] ⚠ DESIGN_PROVIDER=cli — scheduled generations have no Claude credential source yet " +
        "(the shared CLAUDE_CODE_OAUTH_TOKEN tier was removed in the team-tenancy rework; per-team " +
        "credential resolution for the scheduler is Task 14, not yet implemented). Every CLI-mode scheduled " +
        "generation will fail until then. Use API mode (DESIGN_PROVIDER=claude-html + a team's OpenAI/Anthropic " +
        "keys) in the meantime, or hold off on scheduling CLI-mode generations."
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
