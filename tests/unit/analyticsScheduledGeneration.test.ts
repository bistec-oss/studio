// 006 T2: `scheduled_generation.settled` from the scheduled-generation runner
// (FR-04). One event per entry per settle: completed, retry, failed. The real
// track() runs against a prisma fake capturing analyticsEvent.create; the
// orchestrator is faked, so generation.finished is covered in
// analyticsGeneration.test.ts.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  findMany: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  briefFindUnique: vi.fn(),
  generateDraftForBrief: vi.fn(),
  eventCreate: vi.fn(),
  dropUpsert: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: h.queryRaw,
    scheduledGeneration: { findMany: h.findMany, update: h.update, updateMany: h.updateMany },
    brief: { findUnique: h.briefFindUnique, create: vi.fn() },
    post: { create: vi.fn() },
    analyticsEvent: { create: h.eventCreate },
    analyticsDrop: { upsert: h.dropUpsert },
  },
}))
vi.mock('@/lib/agent/generateDraft', () => ({ generateDraftForBrief: h.generateDraftForBrief }))
vi.mock('@/lib/publish/publishDraft', () => ({ findLivePost: vi.fn() }))
vi.mock('@/lib/agent/userToken', () => ({
  withClaudeAuth: (_u: unknown, _t: unknown, fn: () => unknown) => fn(),
}))

const { runGenerationJobs } = await import('@/lib/scheduler/generationRunner')

const entry = (over: Record<string, unknown> = {}) => ({
  id: 'sg-1',
  teamId: 'team-1',
  briefId: 'brief-1',
  createdById: 'user-1',
  campaignId: null,
  channels: ['INSTAGRAM'],
  postAction: 'HOLD',
  publishAt: null,
  templateId: null,
  retryCount: 0,
  ...over,
})

type Stored = { name: string; source: string; teamId: string; userId: string | null; draftId: string | null; outcome: string; durationMs: number; payload: Record<string, unknown> }
const events = () => h.eventCreate.mock.calls.map((c) => (c[0] as { data: Stored }).data)

beforeEach(() => {
  for (const fn of Object.values(h)) fn.mockReset()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  h.update.mockResolvedValue({})
  h.updateMany.mockResolvedValue({ count: 1 })
  h.eventCreate.mockResolvedValue({})
  h.dropUpsert.mockResolvedValue({})
  h.queryRaw.mockResolvedValue([{ id: 'sg-1' }])
  h.briefFindUnique.mockResolvedValue({ id: 'brief-1', teamId: 'team-1' })
})

describe('scheduled_generation.settled (FR-04)', () => {
  it('completed: source scheduler, no user, the new draft', async () => {
    h.findMany.mockResolvedValue([entry({ retryCount: 1 })])
    h.generateDraftForBrief.mockResolvedValue({ draft: { id: 'draft-1' }, backgroundImageUrl: null })
    await runGenerationJobs()
    expect(events()).toHaveLength(1)
    expect(events()[0]).toMatchObject({
      name: 'scheduled_generation.settled',
      source: 'scheduler',
      teamId: 'team-1',
      userId: null,
      draftId: 'draft-1',
      outcome: 'completed',
      payload: { retryCount: 1 },
    })
    expect(events()[0].durationMs).toBeGreaterThanOrEqual(0)
  })

  it('retry: the next retry count and the reason', async () => {
    h.findMany.mockResolvedValue([entry({ retryCount: 1 })])
    h.generateDraftForBrief.mockRejectedValue(new Error('model timed out'))
    await runGenerationJobs()
    expect(events()).toHaveLength(1)
    expect(events()[0]).toMatchObject({ outcome: 'retry', draftId: null, payload: { retryCount: 2, errorReason: 'model timed out' } })
  })

  it('failed: after the last retry, terminal', async () => {
    h.findMany.mockResolvedValue([entry({ retryCount: 3 })])
    h.generateDraftForBrief.mockRejectedValue(new Error('still failing'))
    await runGenerationJobs()
    expect(events()).toHaveLength(1)
    expect(events()[0]).toMatchObject({ outcome: 'failed', payload: { retryCount: 3, errorReason: 'still failing' } })
    expect(h.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }))
  })

  it('the reason is redacted before it is stored', async () => {
    h.findMany.mockResolvedValue([entry()])
    h.generateDraftForBrief.mockRejectedValue(new Error('auth failed with sk-ant-abcdefghijklmnopqrstuvwxyz0123'))
    await runGenerationJobs()
    expect(String(events()[0].payload.errorReason)).not.toContain('sk-ant-abcdefghijklmnopqrstuvwxyz0123')
  })

  it('AC-08: a failing insert leaves every entry write identical', async () => {
    const run = async () => {
      h.update.mockClear()
      h.findMany.mockResolvedValue([entry(), entry({ id: 'sg-2', retryCount: 3 })])
      h.queryRaw.mockResolvedValue([{ id: 'sg-1' }, { id: 'sg-2' }])
      h.generateDraftForBrief.mockReset().mockResolvedValueOnce({ draft: { id: 'draft-1' } }).mockRejectedValueOnce(new Error('nope'))
      await runGenerationJobs()
      return h.update.mock.calls.map((c) => ({ where: c[0].where, status: c[0].data.status, retryCount: c[0].data.retryCount }))
    }
    const base = await run()
    h.eventCreate.mockRejectedValue(new Error('insert failed'))
    const failing = await run()
    expect(failing).toEqual(base)
    expect(base.map((b) => b.status)).toEqual(['COMPLETED', 'FAILED'])
  })
})
