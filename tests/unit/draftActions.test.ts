// Async draft-action lifecycle (claim / release / start): the atomic claim's
// conditional where-clause, release semantics for success vs failure, and
// startDraftAction's contract — auth resolved BEFORE the work runs, claim
// always released when the work settles. Prisma and the auth modules are mocked.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  updateMany: vi.fn(),
  findUnique: vi.fn(),
  revisionUpdateMany: vi.fn(),
  resolveClaudeAuth: vi.fn(),
  runWithClaudeAuth: vi.fn(),
}))

vi.mock('@/lib/prisma', () => {
  const client = {
    draft: { updateMany: h.updateMany, findUnique: h.findUnique },
    draftRevision: { updateMany: h.revisionUpdateMany },
    // Batch form only: the statements were issued in order; await them all.
    $transaction: async (ops: Array<Promise<unknown>>) => Promise.all(ops),
  }
  return { prisma: client }
})
vi.mock('@/lib/agent/userToken', () => ({
  resolveClaudeAuth: h.resolveClaudeAuth,
}))
vi.mock('@/lib/agent/claudeAuth', () => ({
  runWithClaudeAuth: h.runWithClaudeAuth,
}))

const { claimDraftAction, completeDraftAction, releaseDraftAction, startDraftAction, touchDraftAction } = await import(
  '@/lib/drafts/draftActions'
)

beforeEach(() => {
  h.updateMany.mockReset().mockResolvedValue({ count: 1 })
  h.findUnique.mockReset()
  h.revisionUpdateMany.mockReset().mockResolvedValue({ count: 1 })
  // A failed run is logged (startDraftAction) — keep the test output clean.
  vi.spyOn(console, 'error').mockImplementation(() => {})
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
  it('claims atomically (pendingAction null in the where-clause) and does NOT wipe the previous error', async () => {
    expect(await claimDraftAction('draft-1', 'REFINE')).toBe(true)
    expect(h.updateMany).toHaveBeenCalledWith({
      where: { id: 'draft-1', pendingAction: null },
      data: { pendingAction: 'REFINE' },
    })
  })

  // T17 fix round 1 (TC-REG-H7a): a winner that crashes after its 202 must not
  // be erased by the next winner's claim before anyone polls it.
  it('a crashed run keeps its error through the next claim; only the next run settling replaces it', async () => {
    const row = { pendingAction: null as string | null, pendingActionError: null as string | null }
    h.updateMany.mockImplementation(async ({ where, data }: { where: { pendingAction?: string | null }; data: Partial<typeof row> }) => {
      if ('pendingAction' in where && where.pendingAction !== row.pendingAction) return { count: 0 }
      Object.assign(row, data)
      return { count: 1 }
    })
    await claimDraftAction('draft-1', 'REFINE')
    await startDraftAction('draft-1', 'user-1', 'team-1', 'REFINE', async () => {
      throw new Error('Transaction API error: Unable to start a transaction in the given time.')
    })
    await vi.waitFor(() => expect(row.pendingAction).toBeNull())
    expect(await claimDraftAction('draft-1', 'REFINE')).toBe(true)
    // The second run is in flight — every poll still sees the first run's crash.
    expect(row).toEqual({ pendingAction: 'REFINE', pendingActionError: expect.stringMatching(/Unable to start a transaction/) })
  })

  it('returns false when nothing matched (action already in flight)', async () => {
    h.updateMany.mockResolvedValue({ count: 0 })
    expect(await claimDraftAction('draft-1', 'REGENERATE_COPY')).toBe(false)
  })
})

describe('touchDraftAction (stale-sweep heartbeat)', () => {
  it('bumps updatedAt only while this claim is still held', async () => {
    await touchDraftAction('draft-1', 'REFINE')
    expect(h.updateMany).toHaveBeenCalledWith({
      where: { id: 'draft-1', pendingAction: 'REFINE' },
      data: { updatedAt: expect.any(Date) },
    })
  })
})

describe('releaseDraftAction', () => {
  it('records the error message alongside the cleared claim', async () => {
    await releaseDraftAction('draft-1', 'REFINE', 'model timed out')
    expect(h.updateMany).toHaveBeenCalledWith({
      where: { id: 'draft-1', pendingAction: 'REFINE' },
      data: { pendingAction: null, pendingActionError: 'model timed out' },
    })
  })

  it('clears the error when called without one (success path)', async () => {
    await releaseDraftAction('draft-1', 'REFINE')
    expect(h.updateMany).toHaveBeenCalledWith({
      where: { id: 'draft-1', pendingAction: 'REFINE' },
      data: { pendingAction: null, pendingActionError: null },
    })
  })
})

describe('startDraftAction', () => {
  it('releases clean when the work succeeds — and clears any earlier not-applied outcome (FR-14)', async () => {
    await startDraftAction('draft-1', 'user-1', 'team-1', 'REFINE', async () => {})
    await waitForRelease(1)
    expect(h.updateMany).toHaveBeenCalledWith({
      where: { id: 'draft-1', pendingAction: 'REFINE' },
      data: { pendingAction: null, pendingActionError: null, notAppliedReason: null, notAppliedRevisionId: null },
    })
    // One read-free batch: no findUnique on the completion path.
    expect(h.findUnique).not.toHaveBeenCalled()
  })

  it('a success stamps the rejected render the cleared outcome referenced as discarded (never an adopted one)', async () => {
    await startDraftAction('draft-1', 'user-1', 'team-1', 'REFINE', async () => {})
    await waitForRelease(1)
    expect(h.revisionUpdateMany).toHaveBeenCalledWith({
      where: {
        draftId: 'draft-1',
        rejectedAt: { not: null },
        adoptedAt: null,
        discardedAt: null,
        notAppliedOn: { some: { id: 'draft-1', pendingAction: 'REFINE' } },
      },
      data: { discardedAt: expect.any(Date) },
    })
    // Stamped BEFORE the draft stops referencing it.
    expect(h.revisionUpdateMany.mock.invocationCallOrder[0]).toBeLessThan(h.updateMany.mock.invocationCallOrder[0])
  })

  it("a 'not-applied' completion releases clean but KEEPS the outcome the refine just recorded", async () => {
    await startDraftAction('draft-1', 'user-1', 'team-1', 'REFINE', async () => 'not-applied' as const)
    await waitForRelease(1)
    expect(h.updateMany).toHaveBeenCalledWith({
      where: { id: 'draft-1', pendingAction: 'REFINE' },
      data: { pendingAction: null, pendingActionError: null },
    })
    expect(h.revisionUpdateMany).not.toHaveBeenCalled()
  })

  it('releases with the error message when the work throws', async () => {
    await startDraftAction('draft-1', 'user-1', 'team-1', 'REFINE', async () => {
      throw new Error('refine exploded')
    })
    await waitForRelease(1)
    expect(h.updateMany).toHaveBeenCalledWith({
      where: { id: 'draft-1', pendingAction: 'REFINE' },
      data: { pendingAction: null, pendingActionError: 'refine exploded' },
    })
  })

  it('stringifies non-Error throws', async () => {
    await startDraftAction('draft-1', 'user-1', 'team-1', 'REFINE', async () => {
      throw 'plain string failure'
    })
    await waitForRelease(1)
    expect(h.updateMany).toHaveBeenCalledWith({
      where: { id: 'draft-1', pendingAction: 'REFINE' },
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
    await startDraftAction('draft-1', 'user-1', 'team-1', 'REFINE', async () => {
      order.push('work')
    })
    await waitForRelease(1)
    expect(order).toEqual(['auth', 'work'])
    expect(h.resolveClaudeAuth).toHaveBeenCalledWith('user-1', 'team-1')
    expect(h.runWithClaudeAuth).toHaveBeenCalledWith(auth, expect.any(Function))
  })
})

// F2 (change 004 final fix wave): a late settle from a run the stale sweep
// already cleared must not touch a NEWER action's claim or outcome. Every
// settle write is guarded on the action THIS run claimed.
describe('settling is guarded on the claimed action', () => {
  function statefulRow(initial: { pendingAction: string | null; pendingActionError: string | null }) {
    const row = { ...initial }
    h.updateMany.mockImplementation(
      async ({ where, data }: { where: { pendingAction?: string | null }; data: Partial<typeof row> }) => {
        if ('pendingAction' in where && where.pendingAction !== row.pendingAction) return { count: 0 }
        Object.assign(row, data)
        return { count: 1 }
      },
    )
    return row
  }

  it('a REFINE settle against a newer REGENERATE_COPY claim changes nothing, and does not throw', async () => {
    const row = statefulRow({ pendingAction: 'REGENERATE_COPY', pendingActionError: 'earlier crash' })
    await releaseDraftAction('draft-1', 'REFINE', 'late failure')
    await completeDraftAction('draft-1', 'REFINE')
    expect(row).toEqual({ pendingAction: 'REGENERATE_COPY', pendingActionError: 'earlier crash' })
  })

  it('a late startDraftAction success from a swept run leaves the newer claim alone', async () => {
    const row = statefulRow({ pendingAction: 'REGENERATE_DESIGN', pendingActionError: null })
    await startDraftAction('draft-1', 'user-1', 'team-1', 'REFINE', async () => {})
    await vi.waitFor(() => expect(h.updateMany).toHaveBeenCalled())
    expect(row).toEqual({ pendingAction: 'REGENERATE_DESIGN', pendingActionError: null })
  })

  it('the live claim still settles', async () => {
    const row = statefulRow({ pendingAction: 'REFINE', pendingActionError: 'old' })
    await completeDraftAction('draft-1', 'REFINE')
    expect(row).toMatchObject({ pendingAction: null, pendingActionError: null })
  })
})
