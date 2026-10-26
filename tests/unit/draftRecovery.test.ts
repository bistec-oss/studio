import { describe, it, expect } from 'vitest'
import {
  planDraftRecovery,
  STUCK_GENERATION_MS,
  type RecoverableDraft,
} from '@/lib/drafts/recovery'

// The draft GET's lazy recovery: sweep a genuinely interrupted generation to
// FAILED, clear a stale in-flight async action.

const NOW = new Date('2026-07-28T12:00:00Z').getTime()
const fresh = new Date(NOW - 1_000)
const ancient = new Date(NOW - STUCK_GENERATION_MS - 1_000)

function draft(over: Partial<RecoverableDraft> = {}): RecoverableDraft {
  return {
    status: 'EXPORTED',
    pendingAction: null,
    updatedAt: fresh,
    ...over,
  }
}

describe('planDraftRecovery', () => {
  it('fails a generation stranded past the lease', () => {
    const plan = planDraftRecovery(draft({ status: 'IN_PROGRESS', updatedAt: ancient }), NOW)
    expect(plan.failStuckGeneration).toBe(true)
  })

  it('does not fail a generation that is still within the lease', () => {
    const plan = planDraftRecovery(draft({ status: 'IN_PROGRESS' }), NOW)
    expect(plan.failStuckGeneration).toBe(false)
  })

  it('treats the lease boundary as stale', () => {
    const plan = planDraftRecovery(
      draft({ status: 'IN_PROGRESS', updatedAt: new Date(NOW - STUCK_GENERATION_MS) }),
      NOW,
    )
    expect(plan.failStuckGeneration).toBe(true)
  })

  it('never fails a stale draft that is not IN_PROGRESS', () => {
    for (const status of ['EXPORTED', 'PUBLISHED', 'FAILED']) {
      expect(planDraftRecovery(draft({ status, updatedAt: ancient }), NOW).failStuckGeneration).toBe(false)
    }
  })

  it('clears a stale action, independently of the generation sweep', () => {
    const plan = planDraftRecovery(draft({ pendingAction: 'REFINE', updatedAt: ancient }), NOW)
    expect(plan.clearStuckAction).toBe(true)
    expect(plan.failStuckGeneration).toBe(false)
  })

  it('keeps a fresh in-flight action', () => {
    const plan = planDraftRecovery(draft({ pendingAction: 'REGENERATE_COPY' }), NOW)
    expect(plan.clearStuckAction).toBe(false)
  })

  it('does nothing to a healthy exported draft, stale or not', () => {
    const none = { failStuckGeneration: false, clearStuckAction: false, settlePendingCaptions: false }
    expect(planDraftRecovery(draft(), NOW)).toEqual(none)
    expect(planDraftRecovery(draft({ updatedAt: ancient }), NOW)).toEqual(none)
  })
})

// 012 AC-07 (FR-11): the sweep's caption half. An interrupted run leaves
// caption rows PENDING with nothing writing them; they settle as a failed
// write. Only a sweep of a run that writes captions qualifies.
describe('planDraftRecovery — settlePendingCaptions', () => {
  it('is true for a stale REGENERATE_COPY', () => {
    expect(planDraftRecovery(draft({ pendingAction: 'REGENERATE_COPY', updatedAt: ancient }), NOW).settlePendingCaptions).toBe(true)
  })

  it('is true for a swept stuck generation', () => {
    const plan = planDraftRecovery(draft({ status: 'IN_PROGRESS', updatedAt: ancient }), NOW)
    expect(plan.failStuckGeneration).toBe(true)
    expect(plan.settlePendingCaptions).toBe(true)
  })

  it('is false for a stale REGENERATE_DESIGN or REFINE (they write no caption)', () => {
    expect(planDraftRecovery(draft({ pendingAction: 'REGENERATE_DESIGN', updatedAt: ancient }), NOW).settlePendingCaptions).toBe(false)
    expect(planDraftRecovery(draft({ pendingAction: 'REFINE', updatedAt: ancient }), NOW).settlePendingCaptions).toBe(false)
  })

  it('is false for a fresh REGENERATE_COPY (still running) and a fresh IN_PROGRESS generation', () => {
    expect(planDraftRecovery(draft({ pendingAction: 'REGENERATE_COPY' }), NOW).settlePendingCaptions).toBe(false)
    expect(planDraftRecovery(draft({ status: 'IN_PROGRESS' }), NOW).settlePendingCaptions).toBe(false)
  })
})
