// 027 T5 follow-up — two queue route rules, with Prisma mocked:
//   - PATCH keeps the stored key, goal and tone unless a style (or a legacy goal)
//     is sent; a legacy null key stays null (FR-06);
//   - re-run accepts a held COMPLETED entry and only that (FR-12).

import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ findFirst: vi.fn(), update: vi.fn(), campaignFind: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    scheduledGeneration: { findFirst: h.findFirst, update: h.update },
    campaign: { findUnique: h.campaignFind },
  },
}))
vi.mock('@/lib/api/handler', () => {
  const wrap =
    (handler: (req: unknown, ctx: { params: unknown }, user: unknown) => unknown) =>
    (req: unknown, ctx: { params: unknown }) =>
      handler(req, { params: ctx?.params }, { userId: 'u1', teamId: 'team1', teamRole: 'ADMIN', isSuperAdmin: false })
  const parseBody = async (req: Request, schema: { safeParse: (v: unknown) => { success: boolean; data?: unknown } }) => {
    const r = schema.safeParse(await req.json())
    return { data: r.data }
  }
  return { parseBody, withTeamAuth: wrap }
})
vi.mock('@/lib/authz/visibility', () => ({ canAccessContent: () => true }))
vi.mock('@/lib/brandkit/resolve', () => ({ resolveBrandKit: async () => null }))

const patch = (await import('@/app/api/campaigns/[id]/queue/[gid]/route')).PATCH as unknown as (
  req: Request,
  ctx: { params: unknown },
) => Promise<Response>
const rerun = (await import('@/app/api/campaigns/[id]/queue/[gid]/rerun/route')).POST as unknown as (
  req: Request,
  ctx: { params: unknown },
) => Promise<Response>

const params = { id: 'c1', gid: 'g1' }
const stored = (over: Record<string, unknown> = {}) => ({
  id: 'g1',
  teamId: 'team1',
  createdById: 'u1',
  status: 'PENDING',
  postAction: 'HOLD',
  postStyle: 'hiring',
  goal: 'Hire people',
  tone: 'bold',
  heldReason: null,
  ...over,
})
const body = (extra: Record<string, unknown>) =>
  new Request('http://x', {
    method: 'PATCH',
    body: JSON.stringify({
      topic: 'edited topic',
      channels: ['INSTAGRAM'],
      designMode: 'GENERATE',
      generateAt: '2030-01-01T00:00:00.000Z',
      ...extra,
    }),
  })

beforeEach(() => {
  for (const fn of Object.values(h)) fn.mockReset()
  h.campaignFind.mockResolvedValue({ defaultPostStyle: 'event', defaultTone: null })
  h.update.mockImplementation(async ({ data }: { data: unknown }) => data)
})

describe('PATCH keeps the stored style unless one is sent', () => {
  it.each([
    ['a styled entry', stored()],
    ['a legacy null entry', stored({ postStyle: null, goal: 'Awareness', tone: 'Friendly' })],
  ])('%s: editing only the topic and time leaves postStyle, goal and tone alone', async (_n, row) => {
    h.findFirst.mockResolvedValue(row)
    const res = await patch(body({}), { params })
    expect(res.status).toBe(200)
    const data = h.update.mock.calls[0][0].data
    expect(data).not.toHaveProperty('postStyle')
    expect(data).not.toHaveProperty('goal')
    expect(data).not.toHaveProperty('tone')
    expect(data.topic).toBe('edited topic')
    expect(h.campaignFind).not.toHaveBeenCalled()
  })

  it('a sent tone alone changes only the tone', async () => {
    h.findFirst.mockResolvedValue(stored())
    await patch(body({ tone: 'casual' }), { params })
    const data = h.update.mock.calls[0][0].data
    expect(data.tone).toBe('casual')
    expect(data).not.toHaveProperty('postStyle')
    expect(data).not.toHaveProperty('goal')
  })

  it('a sent style re-resolves (and a null or blank one counts as not sent)', async () => {
    h.findFirst.mockResolvedValue(stored())
    await patch(body({ postStyle: 'tip' }), { params })
    expect(h.update.mock.calls[0][0].data.postStyle).toBe('tip')
    h.update.mockClear()
    await patch(body({ postStyle: null }), { params })
    expect(h.update.mock.calls[0][0].data).not.toHaveProperty('postStyle')
  })

  it('a sent legacy goal re-resolves; an unknown key is a 400 and writes nothing', async () => {
    h.findFirst.mockResolvedValue(stored({ postStyle: null }))
    await patch(body({ goal: 'announcement' }), { params })
    expect(h.update.mock.calls[0][0].data.postStyle).toBe('announcement')
    h.update.mockClear()
    const res = await patch(body({ postStyle: 'nope' }), { params })
    expect(res.status).toBe(400)
    expect(h.update).not.toHaveBeenCalled()
  })
})

describe('re-run', () => {
  const post = () => new Request('http://x', { method: 'POST', body: '{}' })

  it('a held COMPLETED entry is re-armed and its heldReason cleared', async () => {
    h.findFirst.mockResolvedValue(stored({ status: 'COMPLETED', heldReason: 'Not published: ...' }))
    const res = await rerun(post(), { params })
    expect(res.status).toBe(200)
    expect(h.update.mock.calls[0][0].data).toMatchObject({ status: 'PENDING', heldReason: null, retryCount: 0 })
  })

  it('a normal COMPLETED entry, a PENDING one and a RUNNING one stay refused', async () => {
    for (const status of ['COMPLETED', 'PENDING', 'RUNNING']) {
      h.findFirst.mockResolvedValue(stored({ status, heldReason: null }))
      expect((await rerun(post(), { params })).status).toBe(409)
    }
    expect(h.update).not.toHaveBeenCalled()
  })

  it('FAILED and CANCELLED still re-run', async () => {
    for (const status of ['FAILED', 'CANCELLED']) {
      h.findFirst.mockResolvedValue(stored({ status }))
      expect((await rerun(post(), { params })).status).toBe(200)
    }
  })
})
