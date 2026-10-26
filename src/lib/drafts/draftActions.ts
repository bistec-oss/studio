import type { DraftAction } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { resolveClaudeAuth } from '@/lib/agent/userToken'
import { runWithClaudeAuth } from '@/lib/agent/claudeAuth'
import { NOT_APPLIED_CLEARED, discardNotAppliedRender } from '@/lib/drafts/revisions'
import { CLAIM_RELEASED, claimData, claimWhere, logLostClaim, newClaimId, type DraftClaim } from '@/lib/drafts/claim'
import { track } from '@/lib/analytics/track'
import { newUsage, usageFields, withUsage, type ActionTrace } from '@/lib/analytics/trace'

// Lifecycle of an async draft action (regenerate copy/design, refine) — the
// F1 background pattern applied to actions on an existing draft. A route
// validates synchronously, claims the action, kicks off the work, and returns
// 202; the draft page polls pendingAction/pendingActionError to completion.

// Atomically claim the action slot: a conditional update where pendingAction
// IS NULL, so there is no read-then-write race — exactly one concurrent
// request wins. Returns the claim (the action and a fresh token, 019) or null
// when an action is already in flight (or the draft doesn't exist); the caller
// responds 409. The WHERE ignores whatever token an earlier run left behind.
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
// Settling is guarded on the claim THIS run took (action and token; release/
// complete below): a run the stale sweep already cleared settles late as a
// no-op instead of clearing, or overwriting the outcome of, a newer claim, even
// a newer claim of the same action.
export async function claimDraftAction(draftId: string, action: DraftAction): Promise<DraftClaim | null> {
  const claim: DraftClaim = { action, claimId: newClaimId() }
  const { count } = await prisma.draft.updateMany({
    where: { id: draftId, pendingAction: null },
    data: claimData(claim),
  })
  return count === 1 ? claim : null
}

// Heartbeat for a long-running claimed action: bumps Draft.updatedAt (which
// the lazy stale-action sweep in drafts/recovery.ts measures against its
// 15-min window) while the claim is still held. Guarded on the claim, so it
// never revives an action the sweep already cleared. See the refine route for
// the arithmetic that makes the sweep unable to fire on a live refine.
export async function touchDraftAction(draftId: string, claim: DraftClaim): Promise<void> {
  await prisma.draft.updateMany({
    where: { id: draftId, ...claimWhere(claim) },
    data: { updatedAt: new Date() },
  })
}

// The same heartbeat for an async generation (008 FR-12), which the lazy sweep
// fails as stuck once IN_PROGRESS for STUCK_GENERATION_MS without an update.
// runGenerationForDraft calls it right before the design (src/lib/models/
// budget.ts holds the segment arithmetic). Guarded on IN_PROGRESS, so it never
// revives a draft the sweep already failed.
export async function touchGeneration(draftId: string): Promise<void> {
  await prisma.draft.updateMany({
    where: { id: draftId, status: 'IN_PROGRESS' },
    data: { updatedAt: new Date() },
  })
}

// Release the action slot, optionally recording why the run failed.
// updateMany (not update) so a draft deleted mid-action is a silent no-op.
// Guarded on the claim this run took: when it is no longer ours (swept, then
// re-claimed) 0 rows match. That is logged, never thrown. The token is nulled
// with the action. Returns whether the write landed (006: a settle that lost
// its claim emits no analytics event, the swept event covered it).
export async function releaseDraftAction(
  draftId: string,
  claim: DraftClaim,
  error?: string,
): Promise<boolean> {
  const { count } = await prisma.draft.updateMany({
    where: { id: draftId, ...claimWhere(claim) },
    data: { ...CLAIM_RELEASED, pendingActionError: error ?? null },
  })
  if (count === 0) logLostClaim(draftId, claim)
  return count !== 0
}

// Release the action slot after a SUCCESSFUL run. A success also clears the
// not-applied outcome of an earlier refine (change 004 FR-14: "cleared by the
// next successful action" — regenerate-design/copy included; a DB side effect
// only, their request/response shapes are unchanged) and stamps the rejected
// render it referenced as discarded, so a late "Use anyway" on it 409s.
// A batch (not interactive) transaction: two statements in order, no read and
// no held connection, since this runs on every action completion.
// Both statements are guarded on the claim, so a late settle from a
// swept run neither stamps nor clears a newer action's not-applied outcome.
// Returns whether the claim write landed (see releaseDraftAction).
export async function completeDraftAction(draftId: string, claim: DraftClaim): Promise<boolean> {
  const [, draft] = await prisma.$transaction([
    discardNotAppliedRender(prisma, draftId, claim),
    prisma.draft.updateMany({
      where: { id: draftId, ...claimWhere(claim) },
      data: { ...CLAIM_RELEASED, pendingActionError: null, ...NOT_APPLIED_CLEARED },
    }),
  ])
  if (draft.count === 0) logLostClaim(draftId, claim)
  return draft.count !== 0
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
//
// `onError` (optional) runs on a throw BEFORE the release, while the claim is
// still held — a caption action uses it to settle the rows it marked PENDING
// (012 design §5). Its own failure is logged and never skips the release.
//
// `trace` (optional, 006): the carrier for the action's analytics fields. When
// given, ONE `draft_action.settled` event is emitted after the settle write
// landed (a settle that lost its claim emits nothing). The emission sits
// outside the settle's try, so it can never turn a success into a release with
// an error, and track never throws in production.
export async function startDraftAction(
  draftId: string,
  userId: string,
  teamId: string,
  claim: DraftClaim,
  work: () => Promise<void | DraftActionCompletion>,
  onError?: (err: unknown) => Promise<void>,
  trace?: ActionTrace,
): Promise<void> {
  const auth = await resolveClaudeAuth(userId, teamId)
  if (trace) trace.startedAt = Date.now()
  const run = async () => {
    const usage = newUsage()
    let settled: boolean
    let outcome: 'ok' | 'not-applied' | 'conflict' | 'failed'
    let failureReason: string | undefined
    try {
      const completion = await runWithClaudeAuth(auth, () => withUsage(usage, work))
      if (completion === 'not-applied') {
        settled = await releaseDraftAction(draftId, claim)
        outcome = 'not-applied'
      } else {
        settled = await completeDraftAction(draftId, claim)
        outcome = trace?.outcome === 'conflict' ? 'conflict' : 'ok'
      }
    } catch (err) {
      // Logged as well as recorded: the next run to settle overwrites
      // pendingActionError, so without this a crashed run can vanish without
      // trace.
      console.error(`[draft-action] draft ${draftId} failed:`, err)
      if (onError) {
        await onError(err).catch((e) => console.error(`[draft-action] onError for draft ${draftId} failed:`, e))
      }
      failureReason = err instanceof Error ? err.message : String(err)
      settled = await releaseDraftAction(draftId, claim, failureReason)
      outcome = 'failed'
    }
    if (trace && settled) {
      await track('draft_action.settled', {
        source: 'web',
        teamId,
        userId,
        draftId,
        durationMs: Date.now() - trace.startedAt,
        outcome,
        payload: { ...trace.fields, ...usageFields(usage), action: claim.action, ...(failureReason ? { failureReason } : {}) },
      })
    }
  }
  // Belt-and-braces: a release failure (e.g. DB down) must not become an
  // unhandled rejection.
  void run().catch((e) => {
    console.error(`[draft-action] release for draft ${draftId} failed:`, e)
  })
}
