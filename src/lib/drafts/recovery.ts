// Pure decision layer for the lazy draft recovery the draft GET performs. The
// route owns the DB writes; everything that decides WHAT to recover lives here
// so it can be unit-tested without a database (same split as inlineEdit.ts).

// A generation running in-process is bounded by the same 15-min lease the
// scheduled-generation runner uses. If a draft is still IN_PROGRESS well past
// that, the run was almost certainly interrupted (e.g. a server restart).
export const STUCK_GENERATION_MS = 15 * 60_000

export const STUCK_REASON = 'Generation was interrupted. Please retry.'

export const STUCK_ACTION_REASON = 'The action was interrupted. Please try again.'

export interface RecoverableDraft {
  status: string
  pendingAction: string | null
  updatedAt: Date
}

export interface DraftRecoveryPlan {
  /** Stranded IN_PROGRESS past the lease → FAILED with STUCK_REASON. */
  failStuckGeneration: boolean
  /** Stale in-flight async action → cleared with STUCK_ACTION_REASON. */
  clearStuckAction: boolean
  /**
   * Caption rows left PENDING by the run being swept (a stuck generation, or a
   * stale REGENERATE_COPY) → settled as a failed write (012 FR-11), with
   * STUCK_REASON or STUCK_ACTION_REASON. Nothing else writes PENDING rows.
   */
  settlePendingCaptions: boolean
}

// Two lazy sweeps sharing the 15-min bound. The action sweep is independent of
// the generation sweep: an action can go stale on a perfectly healthy draft.
//
// Recovery never reads DraftRevision rows, so rejected refine renders (change
// 004 FR-13) can't affect it.
export function planDraftRecovery(draft: RecoverableDraft, now: number = Date.now()): DraftRecoveryPlan {
  const stale = now - draft.updatedAt.getTime() >= STUCK_GENERATION_MS
  const failStuckGeneration = draft.status === 'IN_PROGRESS' && stale
  const clearStuckAction = draft.pendingAction !== null && stale
  return {
    failStuckGeneration,
    clearStuckAction,
    settlePendingCaptions:
      failStuckGeneration || (clearStuckAction && draft.pendingAction === 'REGENERATE_COPY'),
  }
}
