// 006 T4: POST /api/events (FR-08, AC-09 server half) and the two server-side
// wizard emitters: brief.abandoned (TTL sweep and Discard) in briefDrafts.ts and
// brief.submitted in POST /api/briefs. The funnel shaping is in analyticsQueries.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'

const h = vi.hoisted(() => ({
  track: vi.fn(),
  count: vi.fn(),
  draftFindFirst: vi.fn(),
  draftFindMany: vi.fn(),
  draftDeleteMany: vi.fn(),
  draftCreate: vi.fn(),
  briefCreate: vi.fn(),
  deleteObject: vi.fn(),
  user: { userId: 'u1', teamId: 'team1', teamRole: 'EDITOR', isSuperAdmin: false },
}))

vi.mock('@/lib/analytics/track', () => ({ track: h.track, count: h.count }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    briefDraft: {
      findFirst: h.draftFindFirst,
      findMany: h.draftFindMany,
      deleteMany: h.draftDeleteMany,
      create: h.draftCreate,
    },
    brief: { create: h.briefCreate },
    availableProvider: { findFirst: vi.fn().mockResolvedValue(null) },
    campaign: { findFirst: vi.fn().mockResolvedValue(null) },
    brandKit: { findFirst: vi.fn().mockResolvedValue(null) },
    brandKitTemplate: { findUnique: vi.fn().mockResolvedValue(null) },
  },
}))
vi.mock('@/lib/storage/minio', () => ({
  BUCKET_IMAGES: 'images',
  deleteObject: h.deleteObject,
  isAllowedAssetUrl: () => true,
}))
vi.mock('@/lib/api/handler', () => ({
  withTeamAuth: (handler: (req: unknown, ctx: unknown, user: unknown) => unknown) => (req: unknown, ctx: unknown) =>
    handler(req, ctx, h.user),
  parseBody: async (req: Request) => ({ data: await req.json() }),
}))
vi.mock('@/providers/captionRoute', () => ({
  loadCaptionRoute: vi.fn().mockResolvedValue({ ok: true, chosen: false }),
}))
vi.mock('@/providers/registry', () => ({ copyProviderIsClaude: vi.fn().mockResolvedValue(true) }))
vi.mock('@/lib/agent/config', () => ({ isCliMode: () => true }))

const eventsRoute = await import('@/app/api/events/route')
const briefsRoute = await import('@/app/api/briefs/route')
const drafts = await import('@/lib/brief/briefDrafts')
const { resetRateLimit } = await import('@/lib/analytics/rateLimit')

type Handler = (req: Request, ctx: unknown) => Promise<Response>
const post = (body: unknown, raw?: string) =>
  (eventsRoute.POST as unknown as Handler)(
    new Request('http://x/api/events', { method: 'POST', body: raw ?? JSON.stringify(body) }),
    { params: {} },
  )

beforeEach(() => {
  for (const fn of [h.track, h.count, h.draftFindFirst, h.draftFindMany, h.draftDeleteMany, h.draftCreate, h.briefCreate, h.deleteObject]) fn.mockReset()
  h.track.mockResolvedValue(undefined)
  h.count.mockResolvedValue(undefined)
  h.deleteObject.mockResolvedValue(undefined)
  h.draftDeleteMany.mockResolvedValue({ count: 1 })
  resetRateLimit()
})

describe('POST /api/events', () => {
  it('stores a wizard.step with the session team, user and source; ignores any such field in the body', async () => {
    const res = await post({
      name: 'wizard.step',
      teamId: 'evil-team',
      userId: 'evil-user',
      source: 'mcp',
      draftId: 'd9',
      payload: { step: 2, teamId: 'evil-team', extra: 'x' },
    })
    expect(res.status).toBe(204)
    expect(h.track).toHaveBeenCalledTimes(1)
    expect(h.track).toHaveBeenCalledWith('wizard.step', {
      source: 'web',
      teamId: 'team1',
      userId: 'u1',
      payload: { step: 2 },
    })
  })

  it('keeps an owned brief draft id, and writes nothing for a foreign or missing one (404)', async () => {
    h.draftFindFirst.mockResolvedValueOnce({ id: 'bd1' })
    expect((await post({ name: 'wizard.step', payload: { step: 1, briefDraftId: 'bd1' } })).status).toBe(204)
    expect(h.draftFindFirst).toHaveBeenCalledWith({ where: { id: 'bd1', userId: 'u1' }, select: { id: true } })
    expect(h.track.mock.calls[0][1].payload).toEqual({ step: 1, briefDraftId: 'bd1' })

    h.track.mockClear()
    h.draftFindFirst.mockResolvedValueOnce(null)
    expect((await post({ name: 'wizard.step', payload: { step: 1, briefDraftId: 'foreign' } })).status).toBe(404)
    expect(h.track).not.toHaveBeenCalled()
  })

  it('accepts only the client list: a server event name, a missing name and a bad payload are 400', async () => {
    for (const name of ['brief.submitted', 'generation.finished', 'nope', undefined, 7]) {
      expect((await post({ name, payload: { step: 1 } })).status).toBe(400)
    }
    expect((await post({ name: 'wizard.step', payload: { step: 9 } })).status).toBe(400)
    expect((await post({ name: 'wizard.step', payload: { step: 'x' } })).status).toBe(400)
    expect((await post(null, 'not json')).status).toBe(400)
    expect((await post([1, 2])).status).toBe(400)
    expect(h.track).not.toHaveBeenCalled()
  })

  it('rejects a body over 2 KB with 413, measured on the raw bytes, before parsing', async () => {
    expect(eventsRoute.MAX_BODY_BYTES).toBe(2048)
    const padded = JSON.stringify({ name: 'wizard.step', payload: { step: 1 }, pad: 'x'.repeat(2100) })
    expect((await post(null, padded)).status).toBe(413)
    // multi-byte characters count as bytes, not characters
    const wide = JSON.stringify({ name: 'wizard.step', payload: { step: 1 }, pad: 'é'.repeat(1100) })
    expect(wide.length).toBeLessThan(2048)
    expect((await post(null, wide)).status).toBe(413)
    // not parsed, so not even a 400 for invalid JSON
    expect((await post(null, '{'.repeat(3000))).status).toBe(413)
    expect(h.track).not.toHaveBeenCalled()
  })

  // A streamed request body, with probes for whether it was pulled and cancelled.
  const streamed = (chunks: Uint8Array[], headers: Record<string, string> = {}) => {
    const probe = { pulled: 0, cancelled: false }
    let i = 0
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        probe.pulled++
        if (i < chunks.length) controller.enqueue(chunks[i++])
        else controller.close()
      },
      cancel() {
        probe.cancelled = true
      },
    })
    const req = new Request('http://x/api/events', { method: 'POST', body, headers, duplex: 'half' } as RequestInit)
    return { probe, call: () => (eventsRoute.POST as unknown as Handler)(req, { params: {} }) }
  }
  const bytes = (n: number) => new TextEncoder().encode('x'.repeat(n))

  it('a declared Content-Length over the cap is 413 without reading the body', async () => {
    const { probe, call } = streamed([bytes(10)], { 'content-length': '5000' })
    expect((await call()).status).toBe(413)
    expect(probe.pulled).toBeLessThanOrEqual(1) // the runtime may prefetch one chunk; the route reads none
    expect(h.track).not.toHaveBeenCalled()
  })

  it('a body with no or a lying length is cut off and cancelled once it passes 2048 bytes', async () => {
    const chunks = Array.from({ length: 50 }, () => bytes(1000))
    const none = streamed(chunks)
    expect((await none.call()).status).toBe(413)
    expect(none.probe.cancelled).toBe(true)
    expect(none.probe.pulled).toBeLessThan(10)
    const lying = streamed(chunks, { 'content-length': '10' })
    expect((await lying.call()).status).toBe(413)
    expect(lying.probe.cancelled).toBe(true)
    expect(h.track).not.toHaveBeenCalled()
  })

  it('a body of exactly 2048 bytes is accepted, 2049 is not', async () => {
    const make = (total: number) => {
      const head = '{"name":"wizard.step","payload":{"step":1},"pad":"'
      const tail = '"}'
      return new TextEncoder().encode(head + 'x'.repeat(total - head.length - tail.length) + tail)
    }
    const ok = make(2048)
    expect(ok.byteLength).toBe(2048)
    const accepted = streamed([ok.slice(0, 1000), ok.slice(1000)])
    expect((await accepted.call()).status).toBe(204)
    expect(h.track).toHaveBeenCalledTimes(1)
    expect((await streamed([make(2049)]).call()).status).toBe(413)
  })

  it('drops the 61st event in a minute with the same 204, counted as dropped and never stored', async () => {
    for (let i = 0; i < 60; i++) expect((await post({ name: 'wizard.step', payload: { step: 1 } })).status).toBe(204)
    expect(h.track).toHaveBeenCalledTimes(60)
    expect((await post({ name: 'wizard.step', payload: { step: 1 } })).status).toBe(204)
    expect(h.track).toHaveBeenCalledTimes(60)
    expect(h.count).toHaveBeenCalledWith('dropped', 'wizard.step', 'rate-limit')
  })

  it('is wrapped in withTeamAuth, so no session is the wrapper 401', () => {
    expect(readFileSync('src/app/api/events/route.ts', 'utf8')).toContain('export const POST = withTeamAuth(')
  })
})

describe('brief.abandoned', () => {
  const payload = (step: number) => ({
    step,
    campaignId: '',
    aspectRatio: 'SQUARE',
    brandKitId: '',
    designMode: 'TEMPLATE',
    templateId: '',
    referenceTemplateId: '',
    topic: 'SECRET TOPIC TEXT',
    prompt: 'SECRET DESCRIPTION TEXT',
    goal: 'awareness',
    tone: 'professional',
    images: [],
  })

  it('a TTL sweep emits one expired event per row, with the last step and no brief text', async () => {
    h.draftFindMany.mockResolvedValueOnce([
      { id: 'a', userId: 'u1', teamId: 'team1', payload: payload(3) },
      { id: 'b', userId: 'u1', teamId: 'team2', payload: { broken: true } },
    ])
    await drafts.sweepExpiredBriefDrafts('u1')
    expect(h.track).toHaveBeenCalledTimes(2)
    expect(h.track).toHaveBeenNthCalledWith(1, 'brief.abandoned', {
      source: 'web', teamId: 'team1', userId: 'u1', payload: { reason: 'expired', step: 3 },
    })
    expect(h.track).toHaveBeenNthCalledWith(2, 'brief.abandoned', {
      source: 'web', teamId: 'team2', userId: 'u1', payload: { reason: 'expired', step: null },
    })
    expect(JSON.stringify(h.track.mock.calls)).not.toContain('SECRET')
  })

  it('Discard emits discarded; the Generate-success delete (keepImages) emits nothing', async () => {
    h.draftFindFirst.mockResolvedValue({ id: 'a', userId: 'u1', teamId: 'team1', payload: payload(2) })
    expect(await drafts.deleteBriefDraft('u1', 'a')).toBe(true)
    expect(h.track).toHaveBeenCalledWith('brief.abandoned', {
      source: 'web', teamId: 'team1', userId: 'u1', payload: { reason: 'discarded', step: 2 },
    })
    h.track.mockClear()
    expect(await drafts.deleteBriefDraft('u1', 'a', { keepImages: true })).toBe(true)
    expect(h.track).not.toHaveBeenCalled()
  })

  it('a foreign id emits nothing, and eviction past the cap is not an abandonment', async () => {
    h.draftFindFirst.mockResolvedValue(null)
    expect(await drafts.deleteBriefDraft('u1', 'x')).toBe(false)
    expect(h.track).not.toHaveBeenCalled()

    const rows = Array.from({ length: 5 }, (_, i) => ({ id: `r${i}`, userId: 'u1', teamId: 'team1', payload: payload(1) }))
    h.draftFindMany.mockResolvedValueOnce(rows)
    h.draftCreate.mockResolvedValue({ id: 'new' })
    const res = await drafts.saveBriefDraft('u1', undefined, { ...payload(1), topic: 't', prompt: 'p' } as never, 'team1')
    expect(res.ok).toBe(true)
    expect(h.draftDeleteMany).toHaveBeenCalled()
    expect(h.track).not.toHaveBeenCalled()
  })
})

describe('brief.submitted', () => {
  const submit = (extra: Record<string, unknown> = {}) =>
    (briefsRoute.POST as unknown as Handler)(
      new Request('http://x/api/briefs', {
        method: 'POST',
        body: JSON.stringify({
          topic: 'SECRET TOPIC',
          description: 'SECRET DESCRIPTION',
          goal: 'awareness',
          tone: 'professional',
          channels: ['instagram'],
          designMode: 'GENERATE',
          aspectRatio: 'PORTRAIT',
          ...extra,
        }),
      }),
      { params: {} },
    )

  it('emits path, size, image style and resumed after the brief is created; no brief text', async () => {
    h.briefCreate.mockResolvedValue({ id: 'b1', aspectRatio: 'PORTRAIT' })
    const res = await submit({ resumed: true })
    expect(res.status).toBe(201)
    expect(h.track).toHaveBeenCalledWith('brief.submitted', {
      source: 'web',
      teamId: 'team1',
      userId: 'u1',
      payload: { path: 'B', aspectRatio: 'PORTRAIT', imageStyle: 'classic', resumed: true, postStyle: null },
    })
    expect(JSON.stringify(h.track.mock.calls)).not.toContain('SECRET')
  })

  it('carries the stored post style key, and null for a key outside the dataset (027 FR-14)', async () => {
    h.briefCreate.mockResolvedValue({ id: 'b1', aspectRatio: 'PORTRAIT', postStyle: 'launch' })
    await submit({})
    expect(h.track.mock.calls[0][1].payload.postStyle).toBe('launch')
    h.track.mockClear()
    h.briefCreate.mockResolvedValue({ id: 'b1', aspectRatio: 'PORTRAIT', postStyle: 'ghost' })
    await submit({})
    expect(h.track.mock.calls[0][1].payload.postStyle).toBeNull()
  })

  it('resumed is false unless it is exactly true, and a refused brief emits nothing', async () => {
    h.briefCreate.mockResolvedValue({ id: 'b1', aspectRatio: 'PORTRAIT' })
    await submit({ resumed: 'yes' })
    expect(h.track.mock.calls[0][1].payload.resumed).toBe(false)
    h.track.mockClear()
    expect((await submit({ topic: '' })).status).toBe(400)
    expect(h.track).not.toHaveBeenCalled()
  })
})
