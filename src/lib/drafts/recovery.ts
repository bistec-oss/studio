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
  failureReason: string | null
  pendingAction: string | null
  updatedAt: Date
  exportUrl: string | null
  htmlContent: string | null
  currentRevisionNumber: number | null
}

export interface DraftRecoveryPlan {
  /** Clobbered status on a draft with a finished design → restore to EXPORTED. */
  healStatus: boolean
  /** Stranded IN_PROGRESS past the lease → FAILED with STUCK_REASON. */
  failStuckGeneration: boolean
  /** Stale in-flight async action → cleared with STUCK_ACTION_REASON. */
  clearStuckAction: boolean
}

// A draft that already holds a rendered design was never a generation in
// flight: exportUrl is only ever written together with status EXPORTED
// (finalizeDraftV1, /api/generate/export, commitDraftRevision, revision
// restore). So an IN_PROGRESS — or interruption-swept FAILED — draft carrying a
// finished design + revision pointer is a live post whose STATUS was clobbered,
// not a broken run.
//
// Recovery never reads DraftRevision rows — only the pointer. That is safe
// against rejected refine renders (change 004 FR-13) because a rejected row has
// no revisionNumber, so currentRevisionNumber can never refer to one, and a
// twice-failed refine leaves the pointer and status untouched (FR-12).
export function hasFinishedDesign(draft: {
  exportUrl: string | null
  htmlContent: string | null
  currentRevisionNumber: number | null
}): boolean {
  return (
    draft.exportUrl !== null && draft.htmlContent !== null && draft.currentRevisionNumber !== null
  )
}

// Was this draft's status clobbered while its design stayed intact?
//
// This is the fingerprint of the copy-edit bug: PATCH /api/drafts/[id] used to
// flip an EXPORTED draft to IN_PROGRESS on any copy edit ("the export is
// stale"). IN_PROGRESS means "generation is running", so every consumer misread
// it — the draft vanished from the library (it filters on EXPORTED), Refine
// design and Edit inline disappeared, Regenerate copy answered 409 'Draft is not
// ready for copy regeneration', and 15 minutes later failStuckGeneration
// declared the (nonexistent) generation interrupted and marked the draft FAILED.
// The flip is gone, but stranded drafts remain, so they are healed on read
// rather than forcing a full regeneration.
export function isStatusClobbered(draft: RecoverableDraft): boolean {
  if (!hasFinishedDesign(draft)) return false
  if (draft.status === 'IN_PROGRESS') return true
  return draft.status === 'FAILED' && draft.failureReason === STUCK_REASON
}

// One immediate heal and two lazy sweeps sharing the 15-min bound. The heal is
// NOT time-gated (there is no run to wait for) and it suppresses the generation
// sweep — a clobbered status must be restored, never failed. The action sweep is
// independent of both: an action can go stale on a perfectly healthy draft.
export function planDraftRecovery(draft: RecoverableDraft, now: number = Date.now()): DraftRecoveryPlan {
  const stale = now - draft.updatedAt.getTime() >= STUCK_GENERATION_MS
  const healStatus = isStatusClobbered(draft)
  return {
    healStatus,
    failStuckGeneration: !healStatus && draft.status === 'IN_PROGRESS' && stale,
    clearStuckAction: draft.pendingAction !== null && stale,
  }
}
