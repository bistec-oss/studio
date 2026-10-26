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

const { claimDraftAction, completeDraftAction, releaseDraftAction, startDraftAction, touchDraftAction, touchGeneration } = await import(
  '@/lib/drafts/draftActions'
)

// The claims the runs under test hold (019): an action and the token its claim minted.
const REFINE_CLAIM = { action: 'REFINE', claimId: 'tok-1' } as const
const COPY_CLAIM = { action: 'REGENERATE_COPY', claimId: 'tok-c' } as const

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

// A draft row that applies the guarded updateMany calls the way Postgres would:
// a WHERE on pendingAction and/or pendingActionClaimId must match the row.
type Row = { pendingAction: string | null; pendingActionClaimId: string | null; pendingActionError: string | null }
function statefulRow(initial: Row) {
  const row = { ...initial }
  h.updateMany.mockImplementation(async ({ where, data }: { where: Partial<Row>; data: Partial<Row> }) => {
    for (const k of ['pendingAction', 'pendingActionClaimId'] as const) {
      if (k in where && where[k] !== row[k]) return { count: 0 }
    }
    Object.assign(row, data)
    return { count: 1 }
  })
  return row
}

describe('claimDraftAction', () => {
  it('claims atomically (pendingAction null in the where-clause), mints the token, and does NOT wipe the previous error', async () => {
    const claim = await claimDraftAction('draft-1', 'REFINE')
    expect(claim).toEqual({ action: 'REFINE', claimId: expect.any(String) })
    // The WHERE ignores whatever token an earlier run left; the data writes the new one.
    expect(h.updateMany).toHaveBeenCalledWith({
      where: { id: 'draft-1', pendingAction: null },
      data: { pendingAction: 'REFINE', pendingActionClaimId: claim!.claimId },
    })
  })

  it('two claims carry different tokens', async () => {
    const a = await claimDraftAction('draft-1', 'REFINE')
    const b = await claimDraftAction('draft-1', 'REFINE')
    expect(a!.claimId).not.toBe(b!.claimId)
  })

  // T17 fix round 1 (TC-REG-H7a): a winner that crashes after its 202 must not
  // be erased by the next winner's claim before anyone polls it.
  it('a crashed run keeps its error through the next claim; only the next run settling replaces it', async () => {
    const row = statefulRow({ pendingAction: null, pendingActionClaimId: null, pendingActionError: null })
    const first = await claimDraftAction('draft-1', 'REFINE')
    await startDraftAction('draft-1', 'user-1', 'team-1', first!, async () => {
      throw new Error('Transaction API error: Unable to start a transaction in the given time.')
    })
    await vi.waitFor(() => expect(row.pendingAction).toBeNull())
    expect(await claimDraftAction('draft-1', 'REFINE')).not.toBeNull()
    // The second run is in flight — every poll still sees the first run's crash.
    expect(row).toMatchObject({ pendingAction: 'REFINE', pendingActionError: expect.stringMatching(/Unable to start a transaction/) })
  })

  it('returns null when nothing matched (action already in flight)', async () => {
    h.updateMany.mockResolvedValue({ count: 0 })
    expect(await claimDraftAction('draft-1', 'REGENERATE_COPY')).toBeNull()
  })
})

describe('touchDraftAction (stale-sweep heartbeat)', () => {
  it('bumps updatedAt only while this claim is still held', async () => {
    await touchDraftAction('draft-1', REFINE_CLAIM)
    expect(h.updateMany).toHaveBeenCalledWith({
      where: { id: 'draft-1', pendingAction: 'REFINE', pendingActionClaimId: 'tok-1' },
      data: { updatedAt: expect.any(Date) },
    })
  })
})

// 008 FR-12: the async generation's pre-design heartbeat. Its place in the
// pipeline is tests/unit/actionHeartbeats.test.ts.
describe('touchGeneration (async-generation heartbeat)', () => {
  it('bumps updatedAt only while the draft is still IN_PROGRESS', async () => {
    await touchGeneration('draft-1')
    expect(h.updateMany).toHaveBeenCalledWith({
      where: { id: 'draft-1', status: 'IN_PROGRESS' },
      data: { updatedAt: expect.any(Date) },
    })
  })
})

describe('releaseDraftAction', () => {
  it('records the error message alongside the cleared claim', async () => {
    await releaseDraftAction('draft-1', REFINE_CLAIM, 'model timed out')
    expect(h.updateMany).toHaveBeenCalledWith({
      where: { id: 'draft-1', pendingAction: 'REFINE', pendingActionClaimId: 'tok-1' },
      data: { pendingAction: null, pendingActionClaimId: null, pendingActionError: 'model timed out' },
    })
  })

  it('clears the error when called without one (success path)', async () => {
    await releaseDraftAction('draft-1', REFINE_CLAIM)
    expect(h.updateMany).toHaveBeenCalledWith({
      where: { id: 'draft-1', pendingAction: 'REFINE', pendingActionClaimId: 'tok-1' },
      data: { pendingAction: null, pendingActionClaimId: null, pendingActionError: null },
    })
  })
})

describe('startDraftAction', () => {
  it('releases clean when the work succeeds — and clears any earlier not-applied outcome (FR-14)', async () => {
    await startDraftAction('draft-1', 'user-1', 'team-1', REFINE_CLAIM, async () => {})
    await waitForRelease(1)
    expect(h.updateMany).toHaveBeenCalledWith({
      where: { id: 'draft-1', pendingAction: 'REFINE', pendingActionClaimId: 'tok-1' },
      data: { pendingAction: null, pendingActionClaimId: null, pendingActionError: null, notAppliedReason: null, notAppliedRevisionId: null },
    })
    // One read-free batch: no findUnique on the completion path.
    expect(h.findUnique).not.toHaveBeenCalled()
  })

  it('a success stamps the rejected render the cleared outcome referenced as discarded (never an adopted one)', async () => {
    await startDraftAction('draft-1', 'user-1', 'team-1', REFINE_CLAIM, async () => {})
    await waitForRelease(1)
    expect(h.revisionUpdateMany).toHaveBeenCalledWith({
      where: {
        draftId: 'draft-1',
        rejectedAt: { not: null },
        adoptedAt: null,
        discardedAt: null,
        notAppliedOn: { some: { id: 'draft-1', pendingAction: 'REFINE', pendingActionClaimId: 'tok-1' } },
      },
      data: { discardedAt: expect.any(Date) },
    })
    // Stamped BEFORE the draft stops referencing it.
    expect(h.revisionUpdateMany.mock.invocationCallOrder[0]).toBeLessThan(h.updateMany.mock.invocationCallOrder[0])
  })

  it("a 'not-applied' completion releases clean but KEEPS the outcome the refine just recorded", async () => {
    await startDraftAction('draft-1', 'user-1', 'team-1', REFINE_CLAIM, async () => 'not-applied' as const)
    await waitForRelease(1)
    expect(h.updateMany).toHaveBeenCalledWith({
      where: { id: 'draft-1', pendingAction: 'REFINE', pendingActionClaimId: 'tok-1' },
      data: { pendingAction: null, pendingActionClaimId: null, pendingActionError: null },
    })
    expect(h.revisionUpdateMany).not.toHaveBeenCalled()
  })

  it('releases with the error message when the work throws', async () => {
    await startDraftAction('draft-1', 'user-1', 'team-1', REFINE_CLAIM, async () => {
      throw new Error('refine exploded')
    })
    await waitForRelease(1)
    expect(h.updateMany).toHaveBeenCalledWith({
      where: { id: 'draft-1', pendingAction: 'REFINE', pendingActionClaimId: 'tok-1' },
      data: { pendingAction: null, pendingActionClaimId: null, pendingActionError: 'refine exploded' },
    })
  })

  it('stringifies non-Error throws', async () => {
    await startDraftAction('draft-1', 'user-1', 'team-1', REFINE_CLAIM, async () => {
      throw 'plain string failure'
    })
    await waitForRelease(1)
    expect(h.updateMany).toHaveBeenCalledWith({
      where: { id: 'draft-1', pendingAction: 'REFINE', pendingActionClaimId: 'tok-1' },
      data: { pendingAction: null, pendingActionClaimId: null, pendingActionError: 'plain string failure' },
    })
  })

  it('resolves auth BEFORE invoking the work, and pins it onto the run', async () => {
    const order: string[] = []
    const auth = { token: 'sk-ant-oat01-user', userId: 'user-1', teamId: 'team-1' }
    h.resolveClaudeAuth.mockImplementation(async () => {
      order.push('auth')
      return auth
    })
    await startDraftAction('draft-1', 'user-1', 'team-1', REFINE_CLAIM, async () => {
      order.push('work')
    })
    await waitForRelease(1)
    expect(order).toEqual(['auth', 'work'])
    expect(h.resolveClaudeAuth).toHaveBeenCalledWith('user-1', 'team-1')
    expect(h.runWithClaudeAuth).toHaveBeenCalledWith(auth, expect.any(Function))
  })
})

// 012 design §5: a caption action settles the rows it marked PENDING when its
// work throws, BEFORE the claim is released (so no newer run can have marked
// rows PENDING yet), and a failing onError never strands the claim.
describe('startDraftAction — onError', () => {
  it('runs onError with the thrown error before the release', async () => {
    const order: string[] = []
    h.updateMany.mockImplementation(async () => {
      order.push('release')
      return { count: 1 }
    })
    const onError = vi.fn(async (err: unknown) => {
      order.push('onError:' + (err as Error).message)
    })
    await startDraftAction('draft-1', 'user-1', 'team-1', COPY_CLAIM, async () => {
      throw new Error('provider timed out')
    }, onError)
    await waitForRelease(1)
    expect(order).toEqual(['onError:provider timed out', 'release'])
    expect(h.updateMany).toHaveBeenCalledWith({
      where: { id: 'draft-1', pendingAction: 'REGENERATE_COPY', pendingActionClaimId: 'tok-c' },
      data: { pendingAction: null, pendingActionClaimId: null, pendingActionError: 'provider timed out' },
    })
  })

  it('still releases with the original error when onError itself fails', async () => {
    await startDraftAction('draft-1', 'user-1', 'team-1', COPY_CLAIM, async () => {
      throw new Error('provider timed out')
    }, async () => {
      throw new Error('db down')
    })
    await waitForRelease(1)
    expect(h.updateMany).toHaveBeenCalledWith({
      where: { id: 'draft-1', pendingAction: 'REGENERATE_COPY', pendingActionClaimId: 'tok-c' },
      data: { pendingAction: null, pendingActionClaimId: null, pendingActionError: 'provider timed out' },
    })
  })

  it('is not called when the work succeeds', async () => {
    const onError = vi.fn(async () => {})
    await startDraftAction('draft-1', 'user-1', 'team-1', COPY_CLAIM, async () => {}, onError)
    await waitForRelease(1)
    expect(onError).not.toHaveBeenCalled()
  })
})

// F2 (change 004 final fix wave), tightened by 019: a late settle from a run
// the stale sweep already cleared must not touch a NEWER claim or outcome, even
// a newer claim of the SAME action. Every settle write is guarded on the claim
// (action and token) THIS run took.
describe('settling is guarded on the claimed action', () => {
  it('a REFINE settle against a newer REGENERATE_COPY claim changes nothing, and does not throw', async () => {
    const row = statefulRow({ pendingAction: 'REGENERATE_COPY', pendingActionClaimId: 'tok-c', pendingActionError: 'earlier crash' })
    await releaseDraftAction('draft-1', REFINE_CLAIM, 'late failure')
    await completeDraftAction('draft-1', REFINE_CLAIM)
    expect(row).toEqual({ pendingAction: 'REGENERATE_COPY', pendingActionClaimId: 'tok-c', pendingActionError: 'earlier crash' })
  })

  it('a late startDraftAction success from a swept run leaves the newer claim alone', async () => {
    const row = statefulRow({ pendingAction: 'REGENERATE_DESIGN', pendingActionClaimId: 'tok-d', pendingActionError: null })
    await startDraftAction('draft-1', 'user-1', 'team-1', REFINE_CLAIM, async () => {})
    await vi.waitFor(() => expect(h.updateMany).toHaveBeenCalled())
    expect(row).toEqual({ pendingAction: 'REGENERATE_DESIGN', pendingActionClaimId: 'tok-d', pendingActionError: null })
  })

  it('the live claim still settles, and clears both the claim and the token', async () => {
    const row = statefulRow({ pendingAction: 'REFINE', pendingActionClaimId: 'tok-1', pendingActionError: 'old' })
    await completeDraftAction('draft-1', REFINE_CLAIM)
    expect(row).toMatchObject({ pendingAction: null, pendingActionClaimId: null, pendingActionError: null })
  })

  it('a release of the live claim nulls the token too, with the error', async () => {
    const row = statefulRow({ pendingAction: 'REFINE', pendingActionClaimId: 'tok-1', pendingActionError: null })
    await releaseDraftAction('draft-1', REFINE_CLAIM, 'failed')
    expect(row).toEqual({ pendingAction: null, pendingActionClaimId: null, pendingActionError: 'failed' })
  })
})

// 019 AC-02: R1 claims REFINE (tok-1), the sweep clears it, R2 claims REFINE
// (tok-2). The action enum matches, the token does not, so none of R1's late
// writes land on R2's claim.
describe('a late settle from a swept run does not touch a new claim of the SAME action (019)', () => {
  const R2 = { pendingAction: 'REFINE', pendingActionClaimId: 'tok-2', pendingActionError: null } as const
  let warn: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('touch, release with an error, and complete each leave R2 untouched and log a lost claim', async () => {
    const row = statefulRow({ ...R2 })
    await touchDraftAction('draft-1', REFINE_CLAIM)
    await releaseDraftAction('draft-1', REFINE_CLAIM, 'late failure')
    await completeDraftAction('draft-1', REFINE_CLAIM)
    expect(row).toEqual(R2)
    // release and complete each log once; the touch is a silent no-op.
    expect(warn).toHaveBeenCalledTimes(2)
    for (const [line] of warn.mock.calls) {
      expect(line).toContain('REFINE no longer holds the claim')
      expect(line).not.toContain('tok-')
    }
  })

  it('complete does not stamp R2\'s not-applied render as discarded', async () => {
    h.revisionUpdateMany.mockImplementation(async ({ where }: { where: { notAppliedOn: { some: { pendingActionClaimId?: string } } } }) =>
      ({ count: where.notAppliedOn.some.pendingActionClaimId === R2.pendingActionClaimId ? 1 : 0 }),
    )
    const row = statefulRow({ ...R2 })
    await completeDraftAction('draft-1', REFINE_CLAIM)
    expect(h.revisionUpdateMany.mock.calls[0][0].where.notAppliedOn).toEqual({
      some: { id: 'draft-1', pendingAction: 'REFINE', pendingActionClaimId: 'tok-1' },
    })
    expect(row).toEqual(R2)
  })

  it('a startDraftAction success from the swept run leaves R2 alone', async () => {
    const row = statefulRow({ ...R2 })
    await startDraftAction('draft-1', 'user-1', 'team-1', REFINE_CLAIM, async () => {})
    await vi.waitFor(() => expect(h.updateMany).toHaveBeenCalled())
    expect(row).toEqual(R2)
  })

  it('a startDraftAction throw from the swept run never writes its error onto R2', async () => {
    const row = statefulRow({ ...R2 })
    await startDraftAction('draft-1', 'user-1', 'team-1', REFINE_CLAIM, async () => {
      throw new Error('stale run exploded')
    })
    await vi.waitFor(() => expect(h.updateMany).toHaveBeenCalled())
    expect(row).toEqual(R2)
  })

  it('a not-applied completion from the swept run leaves R2 alone', async () => {
    const row = statefulRow({ ...R2 })
    await startDraftAction('draft-1', 'user-1', 'team-1', REFINE_CLAIM, async () => 'not-applied' as const)
    await vi.waitFor(() => expect(h.updateMany).toHaveBeenCalled())
    expect(row).toEqual(R2)
  })
})
