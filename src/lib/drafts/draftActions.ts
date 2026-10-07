import type { DraftAction } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { resolveClaudeAuth } from '@/lib/agent/userToken'
import { runWithClaudeAuth } from '@/lib/agent/claudeAuth'
import { NOT_APPLIED_CLEARED, discardNotAppliedRender } from '@/lib/drafts/revisions'

// Lifecycle of an async draft action (regenerate copy/design, refine) — the
// F1 background pattern applied to actions on an existing draft. A route
// validates synchronously, claims the action, kicks off the work, and returns
// 202; the draft page polls pendingAction/pendingActionError to completion.

// Atomically claim the action slot: a conditional update where pendingAction
// IS NULL, so there is no read-then-write race — exactly one concurrent
// request wins. Returns false when an action is already in flight (or the
// draft doesn't exist); the caller responds 409.
//
// Claiming does NOT clear the previous run's pendingActionError (T17 fix round
// 1). It used to, and that let a crash vanish: when two requests raced, the
// first winner could crash AFTER its 202 and the second winner's claim erased
// the error before anyone polled it (TC-REG-H7a). Now the error survives, and
// every poll sees it, until the next run SETTLES — success clears it
// (completeDraftAction), a not-applied refine clears it (releaseDraftAction
// with no error), a crash replaces it. Consumers are unaffected: the draft UI
// reads pendingActionError only on the transition of pendingAction to null,
// by which point the settling run has already overwritten it. Every crash is
// also logged by startDraftAction, so it is recorded even after a later
// success clears the field.
//
// Settling is guarded on the action THIS run claimed (release/complete below):
// a run the stale sweep already cleared settles late as a no-op instead of
// clearing, or overwriting the outcome of, a newer action's claim.
export async function claimDraftAction(draftId: string, action: DraftAction): Promise<boolean> {
  const { count } = await prisma.draft.updateMany({
    where: { id: draftId, pendingAction: null },
    data: { pendingAction: action },
  })
  return count === 1
}

// Heartbeat for a long-running claimed action: bumps Draft.updatedAt (which
// the lazy stale-action sweep in drafts/recovery.ts measures against its
// 15-min window) while the claim is still held. Guarded on the claim, so it
// never revives an action the sweep already cleared. See the refine route for
// the arithmetic that makes the sweep unable to fire on a live refine.
export async function touchDraftAction(draftId: string, action: DraftAction): Promise<void> {
  await prisma.draft.updateMany({
    where: { id: draftId, pendingAction: action },
    data: { updatedAt: new Date() },
  })
}

// Release the action slot, optionally recording why the run failed.
// updateMany (not update) so a draft deleted mid-action is a silent no-op.
// Guarded on `action` (the one this run claimed): when the claim is no longer
// ours (swept, then re-claimed) 0 rows match. That is logged, never thrown.
export async function releaseDraftAction(
  draftId: string,
  action: DraftAction,
  error?: string,
): Promise<void> {
  const { count } = await prisma.draft.updateMany({
    where: { id: draftId, pendingAction: action },
    data: { pendingAction: null, pendingActionError: error ?? null },
  })
  if (count === 0) logLostClaim(draftId, action)
}

function logLostClaim(draftId: string, action: DraftAction) {
  console.warn(
    `[draft-action] draft ${draftId}: ${action} no longer holds the claim (swept or superseded); settle ignored`,
  )
}

// Release the action slot after a SUCCESSFUL run. A success also clears the
// not-applied outcome of an earlier refine (change 004 FR-14: "cleared by the
// next successful action" — regenerate-design/copy included; a DB side effect
// only, their request/response shapes are unchanged) and stamps the rejected
// render it referenced as discarded, so a late "Use anyway" on it 409s.
// A batch (not interactive) transaction: two statements in order, no read and
// no held connection, since this runs on every action completion.
// Both statements are guarded on the claimed `action`, so a late settle from a
// swept run neither stamps nor clears a newer action's not-applied outcome.
export async function completeDraftAction(draftId: string, action: DraftAction): Promise<void> {
  const [, draft] = await prisma.$transaction([
    discardNotAppliedRender(prisma, draftId, action),
    prisma.draft.updateMany({
      where: { id: draftId, pendingAction: action },
      data: { pendingAction: null, pendingActionError: null, ...NOT_APPLIED_CLEARED },
    }),
  ])
  if (draft.count === 0) logLostClaim(draftId, action)
}

// What a work closure may return. 'not-applied' = the refine completed
// cleanly but recorded a not-applied outcome (revisions.recordRejectedRender),
// which the success release must keep: the claim is released without an error
// and without clearing it.
export type DraftActionCompletion = 'not-applied'

// Run a claimed action's model work WITHOUT blocking the request, mirroring
// startBackgroundGeneration: the acting credential (personal token, falling
// back to the team token) is resolved to a concrete value HERE (before the
// request's async context unwinds) and pinned onto the background run via
// runWithClaudeAuth, so CLI-mode billing/scoping is correct even though the
// work outlives the request. null ⇒ no credential (CLI-mode calls inside work
// will then hard-fail — see claudeCli.ts).
//
// startDraftAction always releases the claim when the work settles — success
// releases clean (completeDraftAction), a 'not-applied' completion releases
// clean but keeps the outcome it recorded, a throw releases with the error
// message. The work closure must NOT call releaseDraftAction itself.
export async function startDraftAction(
  draftId: string,
  userId: string,
  teamId: string,
  action: DraftAction,
  work: () => Promise<void | DraftActionCompletion>
): Promise<void> {
  const auth = await resolveClaudeAuth(userId, teamId)
  void runWithClaudeAuth(auth, work)
    .then((completion) => (completion === 'not-applied' ? releaseDraftAction(draftId, action) : completeDraftAction(draftId, action)))
    .catch((err) => {
      // Logged as well as recorded: the next run to settle overwrites
      // pendingActionError, so without this a crashed run can vanish without
      // trace.
      console.error(`[draft-action] draft ${draftId} failed:`, err)
      return releaseDraftAction(draftId, action, err instanceof Error ? err.message : String(err))
    })
    // Belt-and-braces: a release failure (e.g. DB down) must not become an
    // unhandled rejection.
    .catch((e) => {
      console.error(`[draft-action] release for draft ${draftId} failed:`, e)
    })
}
