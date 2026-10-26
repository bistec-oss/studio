// 006 T2: the settle-point emitters of draft actions, publishing and the
// publish scheduler. The real track() runs against a prisma fake that captures
// analyticsEvent.create, so each case asserts the ROW an operation would store:
// exactly one per operation and outcome (FR-04), the right source (FR-04), and
// that a failing insert changes neither the action's domain writes nor its
// return value (AC-08, unit half).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Channel } from '@prisma/client'
import { PublishError } from '@/lib/social/types'

const h = vi.hoisted(() => ({
  draftUpdateMany: vi.fn(),
  revisionUpdateMany: vi.fn(),
  resolveClaudeAuth: vi.fn(),
  runWithClaudeAuth: vi.fn(),
  eventCreate: vi.fn(),
  dropUpsert: vi.fn(),
  queryRaw: vi.fn(),
  postFindMany: vi.fn(),
  postFindUnique: vi.fn(),
  postCreate: vi.fn(),
  postUpdate: vi.fn(),
  draftFindUnique: vi.fn(),
  draftFindUniqueOrThrow: vi.fn(),
  resolveExportUrl: vi.fn(),
  igPublish: vi.fn(),
  liPublish: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: h.queryRaw,
    // Batch form only (completeDraftAction).
    $transaction: async (ops: Array<Promise<unknown>>) => Promise.all(ops),
    draft: {
      updateMany: h.draftUpdateMany,
      findUnique: h.draftFindUnique,
      findUniqueOrThrow: h.draftFindUniqueOrThrow,
    },
    draftRevision: { updateMany: h.revisionUpdateMany },
    post: {
      findMany: h.postFindMany,
      findUnique: h.postFindUnique,
      create: h.postCreate,
      update: h.postUpdate,
    },
    analyticsEvent: { create: h.eventCreate },
    analyticsDrop: { upsert: h.dropUpsert },
  },
}))
vi.mock('@/lib/agent/userToken', () => ({ resolveClaudeAuth: h.resolveClaudeAuth }))
vi.mock('@/lib/agent/claudeAuth', () => ({ runWithClaudeAuth: h.runWithClaudeAuth }))
vi.mock('@/lib/storage/minio', () => ({ resolveExportUrl: h.resolveExportUrl }))
vi.mock('@/lib/social/instagram', () => ({ publish: h.igPublish }))
vi.mock('@/lib/social/linkedin', () => ({ publish: h.liPublish }))
vi.mock('@/lib/api/handler', () => ({
  withTeamAdmin:
    (handler: (req: unknown, ctx: { params: unknown }, user: unknown) => unknown) =>
    (req: unknown, ctx: { params: unknown }) =>
      handler(req, { params: ctx?.params }, { userId: 'u1', teamId: 'team1' }),
}))

const { startDraftAction } = await import('@/lib/drafts/draftActions')
const { newActionTrace } = await import('@/lib/analytics/trace')
const { createAndPublishPost } = await import('@/lib/publish/publishDraft')
const { runScheduledJobs } = await import('@/lib/scheduler/jobRunner')
const retryRoute = await import('@/app/api/posts/[id]/publish/route')

const CLAIM = { action: 'REFINE', claimId: 'tok-1' } as const

type StoredEvent = {
  name: string
  source: string
  teamId: string
  userId: string | null
  draftId: string | null
  durationMs: number | null
  outcome: string | null
  payload: Record<string, unknown>
}
const events = () => h.eventCreate.mock.calls.map((c) => (c[0] as { data: StoredEvent }).data)
const only = () => {
  expect(events()).toHaveLength(1)
  return events()[0]
}
const failInserts = () => h.eventCreate.mockRejectedValue(new Error('insert failed'))

beforeEach(() => {
  for (const fn of Object.values(h)) fn.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  h.draftUpdateMany.mockResolvedValue({ count: 1 })
  h.revisionUpdateMany.mockResolvedValue({ count: 1 })
  h.resolveClaudeAuth.mockResolvedValue(null)
  h.runWithClaudeAuth.mockImplementation((_a: unknown, fn: () => unknown) => fn())
  h.eventCreate.mockResolvedValue({})
  h.dropUpsert.mockResolvedValue({})
})

// startDraftAction releases on an un-awaited chain: wait for the whole run.
async function settled() {
  await vi.waitFor(() => expect(h.draftUpdateMany).toHaveBeenCalled())
  // The emission follows the release write; let the chain finish.
  await new Promise((r) => setTimeout(r, 20))
}

describe('draft_action.settled (FR-04, FR-05)', () => {
  it('ok: one event with the action, the duration and the trace fields', async () => {
    const trace = newActionTrace()
    trace.fields.model = { model: 'SONNET', modelId: 'claude-sonnet-5-5' }
    await startDraftAction('d1', 'u1', 'team1', CLAIM, async () => {}, undefined, trace)
    await settled()
    const e = only()
    expect(e).toMatchObject({
      name: 'draft_action.settled',
      source: 'web',
      teamId: 'team1',
      userId: 'u1',
      draftId: 'd1',
      outcome: 'ok',
    })
    expect(e.payload).toMatchObject({ action: 'REFINE', model: { model: 'SONNET' } })
    expect(e.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('not-applied: a clean release, outcome not-applied', async () => {
    await startDraftAction('d1', 'u1', 'team1', CLAIM, async () => 'not-applied', undefined, newActionTrace())
    await settled()
    expect(only().outcome).toBe('not-applied')
  })

  it('conflict: the trace marker turns a clean completion into outcome conflict', async () => {
    const trace = newActionTrace()
    await startDraftAction('d1', 'u1', 'team1', CLAIM, async () => { trace.outcome = 'conflict' }, undefined, trace)
    await settled()
    expect(only().outcome).toBe('conflict')
  })

  it('failed: the redacted message is the failureReason, and the release still carries it', async () => {
    await startDraftAction(
      'd1',
      'u1',
      'team1',
      CLAIM,
      async () => {
        throw new Error('model timed out')
      },
      undefined,
      newActionTrace(),
    )
    await settled()
    const e = only()
    expect(e.outcome).toBe('failed')
    expect(e.payload.failureReason).toBe('model timed out')
    expect(h.draftUpdateMany.mock.calls.at(-1)![0].data).toMatchObject({ pendingActionError: 'model timed out' })
  })

  it('no trace, no event (callers that do not opt in emit nothing)', async () => {
    await startDraftAction('d1', 'u1', 'team1', CLAIM, async () => {})
    await settled()
    expect(events()).toHaveLength(0)
  })

  it('a settle that lost its claim emits nothing (the swept event covered it)', async () => {
    h.draftUpdateMany.mockResolvedValue({ count: 0 })
    await startDraftAction('d1', 'u1', 'team1', CLAIM, async () => {}, undefined, newActionTrace())
    await settled()
    expect(events()).toHaveLength(0)
  })

  it('AC-08: a failing insert leaves the domain writes identical (ok and failed)', async () => {
    const run = async (work: () => Promise<void>) => {
      h.draftUpdateMany.mockClear()
      h.eventCreate.mockClear()
      await startDraftAction('d1', 'u1', 'team1', CLAIM, work, undefined, newActionTrace())
      await settled()
      return h.draftUpdateMany.mock.calls.map((c) => c[0])
    }
    const okWith = await run(async () => {})
    failInserts()
    const okFailing = await run(async () => {})
    expect(okFailing).toEqual(okWith)
    h.eventCreate.mockResolvedValue({})
    const boom = async () => {
      throw new Error('boom')
    }
    const failWith = await run(boom)
    failInserts()
    const failFailing = await run(boom)
    expect(failFailing).toEqual(failWith)
    // The loss is counted, not thrown.
    await vi.waitFor(() => expect(h.dropUpsert).toHaveBeenCalled())
  })
})

// ── publish ──────────────────────────────────────────────────────────────

const IG = 'Instagram caption #launch'
const LI = 'LinkedIn caption, longer and more formal.'
const SIGNED = 'https://minio.test/signed.png'

type CaptionRow = { channel: Channel; text: string; status: 'READY'; failureReason: null; updatedAt: Date }
function draftRow() {
  const caps: CaptionRow[] = [
    { channel: 'INSTAGRAM', text: IG, status: 'READY', failureReason: null, updatedAt: new Date() },
    { channel: 'LINKEDIN', text: LI, status: 'READY', failureReason: null, updatedAt: new Date() },
  ]
  return { id: 'd1', teamId: 'team1', exportUrl: 'exports/d1.png', status: 'EXPORTED', pendingAction: null, updatedAt: new Date(), captions: caps }
}

function publishSetup() {
  h.draftFindUnique.mockImplementation(async () => draftRow())
  h.draftFindUniqueOrThrow.mockImplementation(async () => draftRow())
  h.resolveExportUrl.mockResolvedValue(SIGNED)
  h.igPublish.mockResolvedValue({ platformId: 'ig-1' })
  h.liPublish.mockResolvedValue({ platformId: 'li-1' })
  h.postUpdate.mockImplementation(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({ id: where.id, ...data }))
  h.postCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'new-post', ...data }))
}

describe('publish.settled from createAndPublishPost (FR-04)', () => {
  beforeEach(publishSetup)
  const opts = (source: 'web' | 'mcp' = 'web') => ({ draftId: 'd1', channel: 'LINKEDIN' as Channel, userId: 'u1', source })

  it('published: one event, terminal, the caller source', async () => {
    const out = await createAndPublishPost(opts('mcp'))
    expect(out.post.status).toBe('PUBLISHED')
    const e = only()
    expect(e).toMatchObject({ name: 'publish.settled', source: 'mcp', teamId: 'team1', userId: 'u1', draftId: 'd1', outcome: 'published' })
    expect(e.payload).toMatchObject({ channel: 'LINKEDIN', terminal: true })
  })

  it('failed with a terminal PublishError: the reason is recorded, terminal true', async () => {
    h.liPublish.mockRejectedValue(new PublishError('LINKEDIN', 'rejected for good', { terminal: true }))
    const out = await createAndPublishPost(opts())
    expect(out.error).toBeInstanceOf(PublishError)
    const e = only()
    expect(e.outcome).toBe('failed')
    expect(e.payload).toMatchObject({ terminal: true, errorReason: 'rejected for good' })
  })

  it('failed with a retryable PublishError: terminal false', async () => {
    h.liPublish.mockRejectedValue(new PublishError('LINKEDIN', 'LinkedIn is down'))
    await createAndPublishPost(opts())
    expect(only().payload).toMatchObject({ terminal: false, errorReason: 'LinkedIn is down' })
  })

  it('an unexpected throw still emits one failed event, then rethrows', async () => {
    h.liPublish.mockRejectedValue(new Error('socket hang up'))
    await expect(createAndPublishPost(opts())).rejects.toThrow('socket hang up')
    expect(only()).toMatchObject({ outcome: 'failed', payload: { terminal: true, errorReason: 'Unexpected publish error' } })
  })

  it('AC-08: a failing insert leaves the Post writes and the return value identical', async () => {
    const run = async () => {
      h.postUpdate.mockClear()
      const out = await createAndPublishPost(opts())
      return { out: { status: out.post.status, error: out.error?.reason }, writes: h.postUpdate.mock.calls.map((c) => c[0].data) }
    }
    const base = await run()
    failInserts()
    const failing = await run()
    expect(failing.out).toEqual(base.out)
    expect(failing.writes).toHaveLength(base.writes.length)
    expect(failing.writes[0]).toMatchObject({ status: 'PUBLISHED' })
    h.eventCreate.mockResolvedValue({})
    h.liPublish.mockRejectedValue(new PublishError('LINKEDIN', 'x', { terminal: true }))
    const failBase = await run()
    failInserts()
    const failFailing = await run()
    expect(failFailing).toEqual(failBase)
  })
})

describe('publish.settled from the scheduler tick (FR-04)', () => {
  beforeEach(() => {
    publishSetup()
    h.queryRaw.mockResolvedValue([{ id: 'p1' }])
  })
  const post = (over: Record<string, unknown> = {}) => ({
    id: 'p1',
    draftId: 'd1',
    teamId: 'team1',
    channel: 'LINKEDIN',
    retryCount: 0,
    draft: { exportUrl: 'exports/d1.png' },
    ...over,
  })

  it('published: source scheduler, no user', async () => {
    h.postFindMany.mockResolvedValue([post()])
    await runScheduledJobs()
    expect(only()).toMatchObject({ source: 'scheduler', userId: null, outcome: 'published', payload: { terminal: true, channel: 'LINKEDIN' } })
  })

  it('retry-scheduled: non-terminal, with the next retry count', async () => {
    h.liPublish.mockRejectedValue(new PublishError('LINKEDIN', 'LinkedIn is down'))
    h.postFindMany.mockResolvedValue([post({ retryCount: 2 })])
    await runScheduledJobs()
    expect(only()).toMatchObject({ outcome: 'retry-scheduled', payload: { terminal: false, retryCount: 3, errorReason: 'LinkedIn is down' } })
  })

  it('failed: a terminal refusal, and a failure after the last retry, are both terminal', async () => {
    h.liPublish.mockRejectedValue(new PublishError('LINKEDIN', 'refused', { terminal: true }))
    h.postFindMany.mockResolvedValue([post()])
    await runScheduledJobs()
    expect(only()).toMatchObject({ outcome: 'failed', payload: { terminal: true, errorReason: 'refused' } })

    h.eventCreate.mockClear()
    h.liPublish.mockRejectedValue(new PublishError('LINKEDIN', 'still down'))
    h.postFindMany.mockResolvedValue([post({ retryCount: 5 })])
    await runScheduledJobs()
    expect(only()).toMatchObject({ outcome: 'failed', payload: { terminal: true, errorReason: 'still down' } })
  })

  it('one event per post in a batch', async () => {
    h.postFindMany.mockResolvedValue([post(), post({ id: 'p2', channel: 'INSTAGRAM' })])
    await runScheduledJobs()
    expect(events().map((e) => e.payload.channel)).toEqual(['LINKEDIN', 'INSTAGRAM'])
  })

  it('AC-08: a failing insert leaves every post write identical', async () => {
    const run = async () => {
      h.postUpdate.mockClear()
      h.postFindMany.mockResolvedValue([post(), post({ id: 'p2', retryCount: 1 })])
      await runScheduledJobs()
      return h.postUpdate.mock.calls.map((c) => c[0])
    }
    h.liPublish.mockRejectedValueOnce(new PublishError('LINKEDIN', 'LinkedIn is down')).mockResolvedValue({ platformId: 'li-2' })
    const base = await run()
    failInserts()
    h.liPublish.mockReset().mockRejectedValueOnce(new PublishError('LINKEDIN', 'LinkedIn is down')).mockResolvedValue({ platformId: 'li-2' })
    const failing = await run()
    expect(failing.map((c) => ({ ...c, data: { ...c.data, nextRetryAt: undefined, publishedAt: undefined } }))).toEqual(
      base.map((c) => ({ ...c, data: { ...c.data, nextRetryAt: undefined, publishedAt: undefined } })),
    )
  })
})

describe('publish.settled from the retry route (FR-04)', () => {
  beforeEach(publishSetup)
  const call = () =>
    retryRoute.POST(new Request('http://x', { method: 'POST' }) as never, { params: { id: 'p1' } } as never)
  beforeEach(() => {
    h.postFindUnique.mockResolvedValue({
      id: 'p1',
      draftId: 'd1',
      teamId: 'team1',
      channel: 'LINKEDIN',
      status: 'FAILED',
      retryCount: 2,
      draft: { exportUrl: 'exports/d1.png' },
    })
  })

  it('a successful retry emits published; a failing one emits failed with the reason', async () => {
    const res = await call()
    expect(res.status).toBe(200)
    expect(only()).toMatchObject({ source: 'web', userId: 'u1', outcome: 'published', payload: { terminal: true } })

    h.eventCreate.mockClear()
    h.liPublish.mockRejectedValue(new PublishError('LINKEDIN', 'LinkedIn is down'))
    const res2 = await call()
    expect(res2.status).toBe(502)
    expect(only()).toMatchObject({ outcome: 'failed', payload: { terminal: false, errorReason: 'LinkedIn is down' } })
  })
})

// ── 030 FR-16: publish.settled carries headlineState from every caller ─────────

describe('publish.settled headlineState (030 FR-16, AC-19)', () => {
  const STALE = { headline: 'New line', renderedText: { headline: { text: 'Old line', verified: true } } }
  const UNCONFIRMED = { headline: 'H', renderedText: { headline: { text: 'H', verified: false, reason: 'not-visible' } } }
  const FRESH = { headline: 'H', renderedText: { headline: { text: 'h', verified: true } } }

  describe('the immediate path and the MCP/ACP tool (createAndPublishPost)', () => {
    beforeEach(publishSetup)
    const run = (source: 'web' | 'mcp') =>
      createAndPublishPost({ draftId: 'd1', channel: 'LINKEDIN' as Channel, userId: 'u1', source })

    it.each([
      ['stale', STALE],
      ['unconfirmed', UNCONFIRMED],
      ['fresh', FRESH],
      ['unknown', { headline: 'H', renderedText: null }],
    ])('a %s draft: the event carries it, on a published and a failed outcome', async (state, over) => {
      h.draftFindUniqueOrThrow.mockImplementation(async () => ({ ...draftRow(), ...over }))
      await createAndPublishPost({ draftId: 'd1', channel: 'LINKEDIN' as Channel, userId: 'u1', source: 'web' })
      expect(only().payload).toMatchObject({ headlineState: state })

      h.eventCreate.mockClear()
      h.liPublish.mockRejectedValue(new PublishError('LINKEDIN', 'rejected', { terminal: true }))
      await run('mcp')
      expect(only()).toMatchObject({ source: 'mcp', outcome: 'failed', payload: { headlineState: state } })
    })

    it('reads the two fields in the draft load it already makes (no extra query)', async () => {
      await run('web')
      expect(h.draftFindUniqueOrThrow).toHaveBeenCalledTimes(1)
      expect(h.draftFindUniqueOrThrow.mock.calls[0][0].select).toMatchObject({ headline: true, renderedText: true })
    })
  })

  describe('the scheduler tick', () => {
    beforeEach(() => {
      publishSetup()
      h.queryRaw.mockResolvedValue([{ id: 'p1' }])
    })
    const post = (draft: Record<string, unknown>) => ({
      id: 'p1',
      draftId: 'd1',
      teamId: 'team1',
      channel: 'LINKEDIN',
      retryCount: 0,
      draft: { exportUrl: 'exports/d1.png', ...draft },
    })

    it('selects the two fields on the claimed post draft', async () => {
      h.postFindMany.mockResolvedValue([post(STALE)])
      await runScheduledJobs()
      expect(h.postFindMany.mock.calls[0][0].include.draft.select).toMatchObject({ headline: true, renderedText: true })
    })

    it.each([
      ['stale', STALE],
      ['unconfirmed', UNCONFIRMED],
      ['fresh', FRESH],
    ])('published and retry-scheduled outcomes carry %s', async (state, over) => {
      h.postFindMany.mockResolvedValue([post(over)])
      await runScheduledJobs()
      expect(only()).toMatchObject({ source: 'scheduler', outcome: 'published', payload: { headlineState: state } })

      h.eventCreate.mockClear()
      h.liPublish.mockRejectedValue(new PublishError('LINKEDIN', 'LinkedIn is down'))
      h.postFindMany.mockResolvedValue([post(over)])
      await runScheduledJobs()
      expect(only()).toMatchObject({ outcome: 'retry-scheduled', payload: { headlineState: state } })
    })

    it('a pre-030 draft (no stamp) reports unknown', async () => {
      h.postFindMany.mockResolvedValue([post({ headline: 'H', renderedText: null })])
      await runScheduledJobs()
      expect(only().payload).toMatchObject({ headlineState: 'unknown' })
    })
  })

  describe('the retry route', () => {
    beforeEach(publishSetup)
    const call = () =>
      retryRoute.POST(new Request('http://x', { method: 'POST' }) as never, { params: { id: 'p1' } } as never)
    const failedPost = (draft: Record<string, unknown>) => ({
      id: 'p1',
      draftId: 'd1',
      teamId: 'team1',
      channel: 'LINKEDIN',
      status: 'FAILED',
      retryCount: 2,
      draft: { exportUrl: 'exports/d1.png', ...draft },
    })

    it('selects the two fields on the post draft it already includes', async () => {
      h.postFindUnique.mockResolvedValue(failedPost(STALE))
      await call()
      expect(h.postFindUnique.mock.calls[0][0].include.draft.select).toMatchObject({ headline: true, renderedText: true })
    })

    it.each([
      ['stale', STALE],
      ['unconfirmed', UNCONFIRMED],
      ['fresh', FRESH],
    ])('published and failed outcomes carry %s', async (state, over) => {
      h.postFindUnique.mockResolvedValue(failedPost(over))
      expect((await call()).status).toBe(200)
      expect(only().payload).toMatchObject({ headlineState: state })

      h.eventCreate.mockClear()
      h.liPublish.mockRejectedValue(new PublishError('LINKEDIN', 'LinkedIn is down'))
      expect((await call()).status).toBe(502)
      expect(only()).toMatchObject({ outcome: 'failed', payload: { headlineState: state } })
    })
  })
})
