// 006 T2: the delete rules (FR-12) and the test seam's gate. There is no foreign
// key from AnalyticsEvent, so the two deletes that must touch it do so
// explicitly, in the same transaction as the delete itself:
//   - a team soft-delete removes only that team's events;
//   - a draft hard-delete keeps its events and nulls their draftId.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({
  teamFindUnique: vi.fn(),
  teamUpdate: vi.fn(),
  eventDeleteMany: vi.fn(),
  eventUpdateMany: vi.fn(),
  eventCreateMany: vi.fn(),
  eventFindMany: vi.fn(),
  dropFindMany: vi.fn(),
  dropDeleteMany: vi.fn(),
  draftFindUnique: vi.fn(),
  draftDelete: vi.fn(),
  draftCount: vi.fn(),
  postDeleteMany: vi.fn(),
  revisionDeleteMany: vi.fn(),
  briefDelete: vi.fn(),
  requireRole: vi.fn(),
  sweep: vi.fn(),
  txLog: [] as string[],
}))

vi.mock('@/lib/analytics/retention', () => ({ sweepAnalytics: h.sweep }))
vi.mock('@/lib/prisma', () => {
  const client = {
    team: { findUnique: h.teamFindUnique, update: h.teamUpdate },
    analyticsEvent: {
      deleteMany: h.eventDeleteMany,
      updateMany: h.eventUpdateMany,
      createMany: h.eventCreateMany,
      findMany: h.eventFindMany,
    },
    analyticsDrop: { findMany: h.dropFindMany, deleteMany: h.dropDeleteMany },
    draft: { findUnique: h.draftFindUnique, delete: h.draftDelete, count: h.draftCount },
    post: { deleteMany: h.postDeleteMany },
    draftRevision: { deleteMany: h.revisionDeleteMany },
    brief: { delete: h.briefDelete },
    // Both forms. The array form is how the team delete is committed; the log
    // proves its statements travelled in ONE transaction.
    $transaction: async (arg: unknown) => {
      if (Array.isArray(arg)) {
        h.txLog.push('batch')
        return Promise.all(arg)
      }
      h.txLog.push('interactive')
      return (arg as (t: typeof client) => Promise<unknown>)(client)
    },
  }
  return { prisma: client }
})
vi.mock('@/lib/api/handler', () => ({
  parseBody: async (req: Request) => ({ data: await req.json() }),
  withSuperAdmin: (handler: unknown) => handler,
  withTeamAuth: (handler: unknown) => handler,
  withTeamAdmin: (handler: (req: unknown, ctx: unknown, user: unknown) => unknown) => (req: unknown, ctx: unknown) =>
    handler(req, ctx, { userId: 'u1', teamId: 'team1' }),
}))
vi.mock('@/lib/auth', () => ({ requireRole: h.requireRole }))

const teamRoute = await import('@/app/api/admin/teams/[id]/route')
const draftRoute = await import('@/app/api/drafts/[id]/route')

beforeEach(() => {
  for (const fn of Object.values(h)) if (typeof fn === 'function' && 'mockReset' in fn) (fn as ReturnType<typeof vi.fn>).mockReset()
  h.txLog = []
  h.eventDeleteMany.mockResolvedValue({ count: 3 })
  h.eventUpdateMany.mockResolvedValue({ count: 2 })
  h.teamUpdate.mockResolvedValue({})
})

describe('team delete (FR-12)', () => {
  const del = () => (teamRoute.DELETE as unknown as (req: Request, ctx: unknown) => Promise<Response>)(new Request('http://x'), { params: { id: 'team-a' } })

  it('soft-deletes the team and removes only that team\'s events, in one transaction', async () => {
    h.teamFindUnique.mockResolvedValue({ id: 'team-a', isDeleted: false })
    const res = await del()
    expect(res.status).toBe(204)
    expect(h.teamUpdate).toHaveBeenCalledWith({
      where: { id: 'team-a' },
      data: { isDeleted: true, deletedAt: expect.any(Date) },
    })
    expect(h.eventDeleteMany).toHaveBeenCalledTimes(1)
    expect(h.eventDeleteMany).toHaveBeenCalledWith({ where: { teamId: 'team-a' } })
    expect(h.txLog).toEqual(['batch'])
  })

  it('an unknown or already-deleted team deletes no events', async () => {
    h.teamFindUnique.mockResolvedValue(null)
    expect((await del()).status).toBe(404)
    h.teamFindUnique.mockResolvedValue({ id: 'team-a', isDeleted: true })
    expect((await del()).status).toBe(404)
    expect(h.eventDeleteMany).not.toHaveBeenCalled()
  })
})

describe('draft delete (FR-12)', () => {
  const del = () => (draftRoute.DELETE as unknown as (req: Request, ctx: unknown) => Promise<Response>)(new Request('http://x'), { params: { id: 'd1' } })

  it('keeps the draft\'s events and nulls their draftId, inside the delete transaction', async () => {
    h.draftFindUnique.mockResolvedValue({ id: 'd1', briefId: 'b1', teamId: 'team1' })
    h.draftCount.mockResolvedValue(1)
    const res = await del()
    expect(res.status).toBe(200)
    expect(h.eventUpdateMany).toHaveBeenCalledWith({ where: { draftId: 'd1' }, data: { draftId: null } })
    expect(h.eventDeleteMany).not.toHaveBeenCalled()
    expect(h.txLog).toEqual(['interactive'])
  })

  it('a draft of another team is a 404 and touches no event', async () => {
    h.draftFindUnique.mockResolvedValue({ id: 'd1', briefId: 'b1', teamId: 'other' })
    expect((await del()).status).toBe(404)
    expect(h.eventUpdateMany).not.toHaveBeenCalled()
  })
})

describe('the test seam gate', () => {
  const env = process.env as Record<string, string | undefined>
  const saved = { NODE_ENV: env.NODE_ENV, MOCK_AI: env.MOCK_AI }
  afterEach(() => {
    env.NODE_ENV = saved.NODE_ENV
    env.MOCK_AI = saved.MOCK_AI
    vi.resetModules()
  })

  // MOCK_AI is read at import time by testHooks, so each case imports a fresh route.
  async function load() {
    vi.resetModules()
    return import('@/app/api/test/analytics-events/route')
  }

  it('is a 404 without MOCK_AI, and in production even with it', async () => {
    env.MOCK_AI = 'false'
    let route = await load()
    expect((await route.GET(new Request('http://x') as never)).status).toBe(404)
    expect((await route.DELETE()).status).toBe(404)

    env.MOCK_AI = 'true'
    env.NODE_ENV = 'production'
    route = await load()
    expect((await route.GET(new Request('http://x') as never)).status).toBe(404)
    expect(h.requireRole).not.toHaveBeenCalled()
  })

  it('with MOCK_AI it is admin-only; POST seeds rows verbatim and sweep runs one retention tick', async () => {
    env.MOCK_AI = 'true'
    env.NODE_ENV = 'test'
    const route = await load()
    h.requireRole.mockResolvedValue({ status: 401 })
    // a non-NextResponse stand-in is treated as authorised
    h.requireRole.mockResolvedValue({ userId: 'u1' })
    h.eventCreateMany.mockResolvedValue({ count: 1 })
    const body = {
      seed: [{ name: 'generation.finished', source: 'web', teamId: 't', at: '2026-01-01T00:00:00.000Z', outcome: 'ok', payload: { path: 'B' } }],
    }
    const res = await route.POST(new Request('http://x', { method: 'POST', body: JSON.stringify(body) }) as never)
    expect(res.status).toBe(200)
    expect(h.eventCreateMany.mock.calls[0][0].data[0]).toMatchObject({ name: 'generation.finished', at: new Date('2026-01-01T00:00:00.000Z'), schemaVersion: 1 })

    h.sweep.mockResolvedValue(7)
    const sweep = await route.POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ sweep: true }) }) as never)
    expect(sweep.status).toBe(200)
    expect(await sweep.json()).toEqual({ deleted: 7 })

    const bad = await route.POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ nope: 1 }) }) as never)
    expect(bad.status).toBe(400)
  })
})
