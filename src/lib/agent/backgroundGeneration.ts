import { runGenerationForDraft } from '@/lib/agent/generateDraft'
import { resolveClaudeAuth } from '@/lib/agent/userToken'
import { runWithClaudeAuth } from '@/lib/agent/claudeAuth'

// Kick off generation for an already-created IN_PROGRESS draft WITHOUT blocking
// the request. The interactive brief flow (assemble-a/b) and the retry route
// call this, then return the draft id so the client navigates to the polling
// preview page while generation continues in-process.
//
// Why in-process fire-and-forget: the app runs as a long-lived Node server
// (next start / standalone, same as the scheduler worker loops), so an un-awaited
// promise keeps executing after the response is sent — giving instant skeleton
// feedback with no worker-poll latency. A server restart mid-generation would
// strand a draft in IN_PROGRESS; the draft GET route sweeps such stale drafts to
// FAILED so the Retry button can recover them.
//
// The acting credential (personal token, falling back to the team token) is
// resolved to a concrete value HERE (before the request's async context
// unwinds) and pinned onto the background run via runWithClaudeAuth, so
// CLI-mode billing/scoping is correct even though the generation outlives the
// request. null ⇒ no credential (CLI-mode calls will then hard-fail).
export async function startBackgroundGeneration(
  draftId: string,
  userId: string,
  teamId: string
): Promise<void> {
  const auth = await resolveClaudeAuth(userId, teamId)
  // The IMAGE-provider actor is the same acting teammate as the Claude auth
  // above — background image generation must resolve THEIR personal OpenAI
  // key (or the team default), never the brief owner's.
  const actor = { userId, teamId }
  // runGenerationForDraft catches its own errors and records FAILED on the draft,
  // so this should never reject; the .catch is a belt-and-braces guard against an
  // unexpected throw becoming an unhandled rejection.
  void runWithClaudeAuth(auth, () => runGenerationForDraft(draftId, actor)).catch((e) => {
    console.error(`[generation] background run for draft ${draftId} crashed:`, e)
  })
}
