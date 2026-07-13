import { runGenerationForDraft } from '@/lib/agent/generateDraft'
import { resolveClaudeAuthForUser } from '@/lib/agent/userToken'
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
// The user's personal Claude CLI token is resolved to a concrete value HERE
// (before the request's async context unwinds) and pinned onto the background
// run via runWithClaudeAuth, so CLI-mode billing is correct even though the
// generation outlives the request. null ⇒ shared server credential.
export async function startBackgroundGeneration(draftId: string, userId: string): Promise<void> {
  const auth = await resolveClaudeAuthForUser(userId)
  // runGenerationForDraft catches its own errors and records FAILED on the draft,
  // so this should never reject; the .catch is a belt-and-braces guard against an
  // unexpected throw becoming an unhandled rejection.
  void runWithClaudeAuth(auth, () => runGenerationForDraft(draftId)).catch((e) => {
    console.error(`[generation] background run for draft ${draftId} crashed:`, e)
  })
}
