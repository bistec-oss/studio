import { randomUUID } from 'node:crypto'
import type { DraftAction } from '@prisma/client'

// A draft-action claim is a VALUE: the action it took and a token minted by
// that claim (Draft.pendingActionClaimId). Every later write by the run keys
// on both, so a run the stale sweep cleared cannot touch a newer claim of the
// same action (019). This module imports nothing from draftActions, revisions
// or captions/store, so all three can use it without a cycle.
export interface DraftClaim {
  action: DraftAction
  claimId: string
}

export function newClaimId(): string {
  return randomUUID()
}

// The WHERE fragment every guarded write by a claimed run carries.
export function claimWhere(claim: DraftClaim) {
  return { pendingAction: claim.action, pendingActionClaimId: claim.claimId }
}

// What taking a claim writes: the action and its token, together.
export function claimData(claim: DraftClaim) {
  return { pendingAction: claim.action, pendingActionClaimId: claim.claimId }
}

// What releasing a claim writes: the slot and its token, together.
export const CLAIM_RELEASED = { pendingAction: null, pendingActionClaimId: null } as const

// Never logs the token, only the action.
export function logLostClaim(draftId: string, claim: DraftClaim) {
  console.warn(
    `[draft-action] draft ${draftId}: ${claim.action} no longer holds the claim (swept or superseded); settle ignored`,
  )
}

// Thrown by a content write inside a revision transaction when the draft no
// longer carries the run's claim (the sweep cleared it, or a newer claim took
// it). The throw rolls the transaction back, so the stale run lands nothing;
// startDraftAction's catch then misses its own guarded release and logs.
export class DraftClaimLostError extends Error {
  constructor() {
    super('The draft no longer carries this action claim')
    this.name = 'DraftClaimLostError'
  }
}
