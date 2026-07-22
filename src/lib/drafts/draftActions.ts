import type { DraftAction } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { resolveClaudeAuth } from '@/lib/agent/userToken'
import { runWithClaudeAuth } from '@/lib/agent/claudeAuth'

// Lifecycle of an async draft action (regenerate copy/design, refine) — the
// F1 background pattern applied to actions on an existing draft. A route
// validates synchronously, claims the action, kicks off the work, and returns
// 202; the draft page polls pendingAction/pendingActionError to completion.

// Atomically claim the action slot: a conditional update where pendingAction
// IS NULL, so there is no read-then-write race — exactly one concurrent
// request wins. Returns false when an action is already in flight (or the
// draft doesn't exist); the caller responds 409. Claiming also clears the
// error from any previous action run.
export async function claimDraftAction(draftId: string, action: DraftAction): Promise<boolean> {
  const { count } = await prisma.draft.updateMany({
    where: { id: draftId, pendingAction: null },
    data: { pendingAction: action, pendingActionError: null },
  })
  return count === 1
}

// Release the action slot, optionally recording why the run failed.
// updateMany (not update) so a draft deleted mid-action is a silent no-op.
export async function releaseDraftAction(draftId: string, error?: string): Promise<void> {
  await prisma.draft.updateMany({
    where: { id: draftId },
    data: { pendingAction: null, pendingActionError: error ?? null },
  })
}

// Run a claimed action's model work WITHOUT blocking the request, mirroring
// startBackgroundGeneration: the acting credential (personal token, falling
// back to the team token) is resolved to a concrete value HERE (before the
// request's async context unwinds) and pinned onto the background run via
// runWithClaudeAuth, so CLI-mode billing/scoping is correct even though the
// work outlives the request. null ⇒ no credential (CLI-mode calls inside work
// will then hard-fail — see claudeCli.ts).
//
// startDraftAction always releases the claim when the work settles — success
// releases clean, a throw releases with the error message. The work closure
// must NOT call releaseDraftAction itself.
export async function startDraftAction(
  draftId: string,
  userId: string,
  teamId: string,
  work: () => Promise<void>
): Promise<void> {
  const auth = await resolveClaudeAuth(userId, teamId)
  void runWithClaudeAuth(auth, work)
    .then(() => releaseDraftAction(draftId))
    .catch((err) =>
      releaseDraftAction(draftId, err instanceof Error ? err.message : String(err))
    )
    // Belt-and-braces: a release failure (e.g. DB down) must not become an
    // unhandled rejection.
    .catch((e) => {
      console.error(`[draft-action] release for draft ${draftId} failed:`, e)
    })
}
