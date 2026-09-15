// Async draft-action lifecycle (claim / release / start): the atomic claim's
// conditional where-clause, release semantics for success vs failure, and
// startDraftAction's contract — auth resolved BEFORE the work runs, claim
// always released when the work settles. Prisma and the auth modules are mocked.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  updateMany: vi.fn(),
  resolveClaudeAuth: vi.fn(),
  runWithClaudeAuth: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: { draft: { updateMany: h.updateMany } },
}))
vi.mock('@/lib/agent/userToken', () => ({
  resolveClaudeAuth: h.resolveClaudeAuth,
}))
vi.mock('@/lib/agent/claudeAuth', () => ({
  runWithClaudeAuth: h.runWithClaudeAuth,
}))

const { claimDraftAction, releaseDraftAction, startDraftAction } = await import(
  '@/lib/drafts/draftActions'
)

beforeEach(() => {
  h.updateMany.mockReset().mockResolvedValue({ count: 1 })
  h.resolveClaudeAuth.mockReset().mockResolvedValue(null)
  // Default: transparent pass-through, like the real fn with a null auth.
  h.runWithClaudeAuth.mockReset().mockImplementation((_auth, fn) => fn())
})

// startDraftAction's release runs on an un-awaited promise chain — wait for
// the release write instead of racing it with fixed sleeps.
async function waitForRelease(calls: number) {
  await vi.waitFor(() => expect(h.updateMany).toHaveBeenCalledTimes(calls))
}

describe('claimDraftAction', () => {
  // BOTH outcome channels are cleared on claim: pendingActionError ("the run
  // crashed") and notAppliedReason ("the refine ran fine and did not do what you
  // asked"). They are separate fields by design (FR-14) but go stale together —
  // clearing only the first left a refine's "your design is unchanged" card
  // standing over a design a later regenerate had already replaced.
  it('claims atomically (pendingAction null in the where-clause) and clears both previous outcomes', async () => {
    expect(await claimDraftAction('draft-1', 'REFINE')).toBe(true)
    expect(h.updateMany).toHaveBeenCalledWith({
      where: { id: 'draft-1', pendingAction: null },
      data: { pendingAction: 'REFINE', pendingActionError: null, notAppliedReason: null },
    })
  })

  it('returns false when nothing matched (action already in flight)', async () => {
    h.updateMany.mockResolvedValue({ count: 0 })
    expect(await claimDraftAction('draft-1', 'REGENERATE_COPY')).toBe(false)
  })
})

describe('releaseDraftAction', () => {
  it('records the error message alongside the cleared claim', async () => {
    await releaseDraftAction('draft-1', 'model timed out')
    expect(h.updateMany).toHaveBeenCalledWith({
      where: { id: 'draft-1' },
      data: { pendingAction: null, pendingActionError: 'model timed out' },
    })
  })

  it('clears the error when called without one (success path)', async () => {
    await releaseDraftAction('draft-1')
    expect(h.updateMany).toHaveBeenCalledWith({
      where: { id: 'draft-1' },
      data: { pendingAction: null, pendingActionError: null },
    })
  })
})

describe('startDraftAction', () => {
  it('releases clean when the work succeeds', async () => {
    await startDraftAction('draft-1', 'user-1', 'team-1', async () => {})
    await waitForRelease(1)
    expect(h.updateMany).toHaveBeenCalledWith({
      where: { id: 'draft-1' },
      data: { pendingAction: null, pendingActionError: null },
    })
  })

  it('releases with the error message when the work throws', async () => {
    await startDraftAction('draft-1', 'user-1', 'team-1', async () => {
      throw new Error('refine exploded')
    })
    await waitForRelease(1)
    expect(h.updateMany).toHaveBeenCalledWith({
      where: { id: 'draft-1' },
      data: { pendingAction: null, pendingActionError: 'refine exploded' },
    })
  })

  it('stringifies non-Error throws', async () => {
    await startDraftAction('draft-1', 'user-1', 'team-1', async () => {
      throw 'plain string failure'
    })
    await waitForRelease(1)
    expect(h.updateMany).toHaveBeenCalledWith({
      where: { id: 'draft-1' },
      data: { pendingAction: null, pendingActionError: 'plain string failure' },
    })
  })

  it('resolves auth BEFORE invoking the work, and pins it onto the run', async () => {
    const order: string[] = []
    const auth = { token: 'sk-ant-oat01-user', userId: 'user-1', teamId: 'team-1' }
    h.resolveClaudeAuth.mockImplementation(async () => {
      order.push('auth')
      return auth
    })
    await startDraftAction('draft-1', 'user-1', 'team-1', async () => {
      order.push('work')
    })
    await waitForRelease(1)
    expect(order).toEqual(['auth', 'work'])
    expect(h.resolveClaudeAuth).toHaveBeenCalledWith('user-1', 'team-1')
    expect(h.runWithClaudeAuth).toHaveBeenCalledWith(auth, expect.any(Function))
  })
})
