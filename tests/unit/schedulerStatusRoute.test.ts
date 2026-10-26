// 023 FR-04 / NFR-02: GET /api/scheduler/status returns the two loops in order
// and nothing else, and reads only the heartbeat table.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ findMany: vi.fn(), wrapped: vi.fn() }))

vi.mock('@/lib/prisma', () => ({ prisma: { workerHeartbeat: { findMany: h.findMany } } }))
vi.mock('@/lib/api/handler', () => ({
  withTeamAuth: (handler: (...a: unknown[]) => unknown) => {
    h.wrapped()
    return (req: unknown, ctx: { params: unknown }) =>
      handler(req, { params: ctx.params }, { userId: 'u1', teamId: 'team1' })
  },
}))

const { GET } = await import('@/app/api/scheduler/status/route')

const call = () => (GET as unknown as (req: unknown, ctx: unknown) => Promise<Response>)({}, { params: {} })
const fresh = () => ({ lastTickStartedAt: new Date(Date.now() - 20_000), lastTickEndedAt: new Date(Date.now() - 10_000) })

beforeEach(() => h.findMany.mockReset())

describe('GET /api/scheduler/status', () => {
  it('is wrapped in withTeamAuth', () => {
    expect(h.wrapped).toHaveBeenCalled()
  })

  it('with no rows, both loops are never and the scheduler is offline', async () => {
    h.findMany.mockResolvedValue([])
    const res = await call()
    expect(await res.json()).toEqual({
      loops: [
        { loop: 'scheduler', state: 'never', lastSeenAt: null },
        { loop: 'generation', state: 'never', lastSeenAt: null },
      ],
      offline: true,
    })
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it('with two fresh rows, nothing is offline and the shape is exact', async () => {
    h.findMany.mockResolvedValue([
      { loop: 'generation', ...fresh() },
      { loop: 'scheduler', ...fresh() },
    ])
    const body = await (await call()).json()
    expect(Object.keys(body).sort()).toEqual(['loops', 'offline'])
    expect(body.offline).toBe(false)
    expect(body.loops.map((l: { loop: string }) => l.loop)).toEqual(['scheduler', 'generation'])
    for (const l of body.loops) {
      expect(Object.keys(l).sort()).toEqual(['lastSeenAt', 'loop', 'state'])
      expect(l.state).toBe('online')
      expect(typeof l.lastSeenAt).toBe('string')
    }
  })

  it('selects only the three heartbeat columns', async () => {
    h.findMany.mockResolvedValue([])
    await call()
    expect(h.findMany).toHaveBeenCalledWith({
      select: { loop: true, lastTickStartedAt: true, lastTickEndedAt: true },
    })
  })

  it('a stale loop makes the scheduler offline', async () => {
    h.findMany.mockResolvedValue([
      { loop: 'scheduler', ...fresh() },
      { loop: 'generation', lastTickStartedAt: new Date(Date.now() - 600_000), lastTickEndedAt: new Date(Date.now() - 590_000) },
    ])
    const body = await (await call()).json()
    expect(body.offline).toBe(true)
    expect(body.loops[1].state).toBe('offline')
  })
})
