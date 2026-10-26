// 030 FR-12, AC-10: GET /api/library returns `headlineState` per item, the state
// only (neither the headline nor the stamp), from the columns it reads; it parses
// no HTML and renders nothing (the renderer and the mock check throw if reached).

import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  findMany: vi.fn(),
  count: vi.fn(),
  boom: vi.fn(() => {
    throw new Error('the library list must not render or parse')
  }),
}))

vi.mock('@/lib/prisma', () => ({ prisma: { draft: { findMany: h.findMany, count: h.count } } }))
vi.mock('@/lib/api/handler', () => ({
  withTeamAuth:
    (handler: (req: unknown, ctx: unknown, user: unknown) => unknown) =>
    (req: unknown) =>
      handler(req, {}, { userId: 'u1', teamId: 'team1', teamRole: 'ADMIN', isSuperAdmin: false }),
}))
vi.mock('@/lib/authz/visibility', () => ({ draftVisibilityWhere: () => ({}) }))
vi.mock('@/lib/storage/minio', () => ({ resolveExportUrl: async (k: string | null) => (k ? `signed:${k}` : null) }))
vi.mock('@/lib/renderer/puppeteer', () => ({ renderPost: h.boom, renderHtmlToPng: h.boom }))
vi.mock('@/lib/renderedText/mockCheck', () => ({ mockHeadlineCheck: h.boom }))

const { GET } = await import('@/app/api/library/route')

const row = (id: string, headline: string | null, renderedText: unknown) => ({
  id,
  status: 'EXPORTED',
  exportUrl: `exports/${id}.png`,
  createdAt: new Date('2026-10-26T00:00:00Z'),
  headline,
  renderedText,
  brief: { topic: 'T', channels: [], aspectRatio: 'SQUARE', campaign: null },
  posts: [],
})

async function list() {
  const res = (await GET(new Request('http://test/api/library') as never, {} as never)) as Response
  expect(res.status).toBe(200)
  return (await res.json()) as { drafts: Array<Record<string, unknown>> }
}

beforeEach(() => {
  h.findMany.mockReset()
  h.count.mockReset().mockResolvedValue(5)
  h.boom.mockClear()
})

describe('GET /api/library: headlineState (030 AC-10)', () => {
  it('reports the state of each item, from the stamp and the headline it already reads', async () => {
    h.findMany.mockResolvedValue([
      row('fresh', 'H', { headline: { text: 'h', verified: true } }),
      row('stale', 'New', { headline: { text: 'Old', verified: true } }),
      row('unconfirmed', 'H', { headline: { text: 'H', verified: false, reason: 'not-found' } }),
      row('pre030', 'H', null),
      row('nohead', null, { headline: { text: 'H', verified: true } }),
    ])
    const { drafts } = await list()
    expect(drafts.map((d) => [d.id, d.headlineState])).toEqual([
      ['fresh', 'fresh'],
      ['stale', 'stale'],
      ['unconfirmed', 'unconfirmed'],
      ['pre030', 'unknown'],
      ['nohead', 'unknown'],
    ])
  })

  it('returns the state only: neither the headline nor the stamp leaves the route', async () => {
    h.findMany.mockResolvedValue([row('d1', 'Secret headline', { headline: { text: 'Old secret', verified: true } })])
    const { drafts } = await list()
    expect(Object.keys(drafts[0])).not.toContain('headline')
    expect(Object.keys(drafts[0])).not.toContain('renderedText')
    expect(JSON.stringify(drafts)).not.toContain('ecret')
    expect(drafts[0].exportUrl).toBe('signed:exports/d1.png')
  })

  it('reads the two columns in the list select it already makes (no extra query)', async () => {
    h.findMany.mockResolvedValue([])
    await list()
    expect(h.findMany).toHaveBeenCalledTimes(1)
    expect(h.findMany.mock.calls[0][0].select).toMatchObject({ headline: true, renderedText: true })
  })

  it('an unreadable stored stamp is unknown, never a throw', async () => {
    h.findMany.mockResolvedValue([row('d1', 'H', { headline: 'nope' })])
    expect((await list()).drafts[0].headlineState).toBe('unknown')
  })

  it('answers with the renderer and the mock check set to throw', async () => {
    h.findMany.mockResolvedValue([row('d1', 'New', { headline: { text: 'Old', verified: true } })])
    await list()
    expect(h.boom).not.toHaveBeenCalled()
  })
})
