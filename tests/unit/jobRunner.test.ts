// 012 T7 — publishing through the one caption resolver (FR-14/FR-15/FR-16,
// AC-06). Prisma, MinIO and the two platform publishers are mocked; the real
// job runner, publishToChannel, caption loader and resolver run.
//   - the job runner: a terminal PublishError → FAILED now (retryCount as is,
//     nextRetryAt null, errorReason set); a non-terminal one still backs off;
//   - publishToChannel: each channel gets only its own caption; a refused
//     caption (failed / pending / empty / over the limit) and a channel with no
//     publisher are refused BEFORE the export is signed, with the resolver's
//     reasons (one shared string for "not available");
//   - POST /api/posts: a refused caption is a 422 CAPTION_UNPUBLISHABLE with no
//     Post row, on the immediate and the scheduled path;
//   - the posts GET routes return draft.caption, the post channel's text;
//   - 017: a refused immediate publish, and a refused retry, are 502
//     PUBLISH_FAILED with the FAILED row's postId and status.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Channel } from '@prisma/client'
import { PublishError } from '@/lib/social/types'
import { resolveCaptionForPublish, unavailableReason } from '@/lib/captions/resolve'

const h = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  postFindMany: vi.fn(),
  postFindFirst: vi.fn(),
  postFindUnique: vi.fn(),
  postCreate: vi.fn(),
  postUpdate: vi.fn(),
  postCount: vi.fn(),
  draftFindUnique: vi.fn(),
  draftFindUniqueOrThrow: vi.fn(),
  resolveExportUrl: vi.fn(),
  igPublish: vi.fn(),
  liPublish: vi.fn(),
  captionFindMany: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: h.queryRaw,
    post: {
      findMany: h.postFindMany,
      findFirst: h.postFindFirst,
      findUnique: h.postFindUnique,
      create: h.postCreate,
      update: h.postUpdate,
      count: h.postCount,
    },
    draft: { findUnique: h.draftFindUnique, findUniqueOrThrow: h.draftFindUniqueOrThrow },
    draftCaption: { createMany: vi.fn(), findMany: h.captionFindMany },
  },
}))
vi.mock('@/lib/storage/minio', () => ({ resolveExportUrl: h.resolveExportUrl }))
vi.mock('@/lib/social/instagram', () => ({ publish: h.igPublish }))
vi.mock('@/lib/social/linkedin', () => ({ publish: h.liPublish }))
vi.mock('@/lib/api/handler', () => {
  const wrap =
    (handler: (req: unknown, ctx: { params: unknown }, user: unknown) => unknown) =>
    (req: unknown, ctx: { params: unknown }) =>
      handler(req, { params: ctx?.params }, { userId: 'u1', teamId: 'team1' })
  const parseBody = async (req: Request) => ({ data: await req.json() })
  return { parseBody, withTeamAuth: wrap, withTeamAdmin: wrap }
})
vi.mock('@/lib/authz/visibility', () => ({ canAccessContent: () => true, postVisibilityWhere: () => ({}) }))

const { runScheduledJobs } = await import('@/lib/scheduler/jobRunner')
const { publishToChannel } = await import('@/lib/publish/publishDraft')
const postsRoute = await import('@/app/api/posts/route')
const postByIdRoute = await import('@/app/api/posts/[id]/route')

const IG_TEXT = 'Instagram caption #launch'
const LI_TEXT = 'LinkedIn caption, longer and more formal.'
const SIGNED = 'https://minio.test/signed.png'

type Row = { channel: Channel; text: string; status: 'PENDING' | 'READY' | 'FAILED'; failureReason: string | null }

function row(channel: Channel, text: string, over: Partial<Row> = {}): Row {
  return { channel, text, status: 'READY', failureReason: null, ...over }
}

let rows: Row[]

// One draft row that serves both the routes' plain lookup and the caption
// loader's select. Every registry channel has a row, so the loader fills
// nothing in.
function draftRow() {
  return {
    id: 'd1',
    teamId: 'team1',
    exportUrl: 'exports/d1.png',
    status: 'EXPORTED',
    pendingAction: null,
    updatedAt: new Date(),
    captions: rows.map((r) => ({ ...r, updatedAt: new Date() })),
  }
}

function scheduledPost(over: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    draftId: 'd1',
    teamId: 'team1',
    channel: 'LINKEDIN',
    retryCount: 0,
    draft: { exportUrl: 'exports/d1.png' },
    ...over,
  }
}

function lastUpdate() {
  return h.postUpdate.mock.calls.at(-1)![0] as { where: { id: string }; data: Record<string, unknown> }
}

beforeEach(() => {
  for (const fn of Object.values(h)) fn.mockReset()
  rows = [row('INSTAGRAM', IG_TEXT), row('LINKEDIN', LI_TEXT), row('WHATSAPP', 'WhatsApp *caption*')]
  h.draftFindUnique.mockImplementation(async () => draftRow())
  h.draftFindUniqueOrThrow.mockImplementation(async () => draftRow())
  h.queryRaw.mockResolvedValue([{ id: 'p1' }])
  h.resolveExportUrl.mockResolvedValue(SIGNED)
  h.igPublish.mockResolvedValue({ platformId: 'ig-1' })
  h.liPublish.mockResolvedValue({ platformId: 'li-1' })
  h.postUpdate.mockImplementation(async ({ where, data }) => ({ id: where.id, ...data }))
  h.postCreate.mockImplementation(async ({ data }) => ({ id: 'new-post', ...data }))
  h.postFindFirst.mockResolvedValue(null)
  // The posts list's batch read (017 FR-06): draft d1 holds `rows`; any other draft has none.
  h.captionFindMany.mockImplementation(async ({ where }: { where: { draftId: { in: string[] } } }) =>
    where.draftId.in.flatMap((id) => (id === 'd1' ? rows.map((r) => ({ draftId: id, channel: r.channel, text: r.text })) : [])),
  )
})

describe('runScheduledJobs — terminal vs retryable (AC-06)', () => {
  it('a terminal PublishError fails the post now: retryCount unchanged, nextRetryAt null, reason recorded', async () => {
    rows = rows.map((r) => (r.channel === 'LINKEDIN' ? { ...r, text: '   ' } : r))
    h.postFindMany.mockResolvedValue([scheduledPost({ retryCount: 2 })])
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    await runScheduledJobs()

    const { where, data } = lastUpdate()
    expect(where).toEqual({ id: 'p1' })
    expect(data).toEqual({
      status: 'FAILED',
      errorReason: 'The LinkedIn caption is empty. Write or regenerate it, then publish again.',
      nextRetryAt: null,
    })
    expect(data).not.toHaveProperty('retryCount')
    expect(log.mock.calls.some(([m]) => String(m).includes('p1 → FAILED (terminal)'))).toBe(true)
    expect(h.liPublish).not.toHaveBeenCalled()
    log.mockRestore()
  })

  it('a non-terminal PublishError still retries with backoff', async () => {
    h.liPublish.mockRejectedValue(new PublishError('LINKEDIN', 'LinkedIn is down'))
    h.postFindMany.mockResolvedValue([scheduledPost({ retryCount: 2 })])
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const before = Date.now()

    await runScheduledJobs()

    const { data } = lastUpdate()
    expect(data).toMatchObject({ status: 'SCHEDULED', retryCount: 3, errorReason: 'LinkedIn is down' })
    // retry 3 → 2^3 = 8 minutes
    const wait = (data.nextRetryAt as Date).getTime() - before
    expect(wait).toBeGreaterThanOrEqual(8 * 60_000 - 50)
    expect(wait).toBeLessThan(8 * 60_000 + 5_000)
  })

  it('a missing export stays retryable', async () => {
    h.resolveExportUrl.mockResolvedValue(null)
    h.postFindMany.mockResolvedValue([scheduledPost()])
    vi.spyOn(console, 'log').mockImplementation(() => {})

    await runScheduledJobs()

    expect(lastUpdate().data).toMatchObject({ status: 'SCHEDULED', retryCount: 1, errorReason: 'draft export missing' })
  })

  it('a due WhatsApp post fails closed with the shared reason and is never retried', async () => {
    h.postFindMany.mockResolvedValue([scheduledPost({ channel: 'WHATSAPP' })])
    vi.spyOn(console, 'log').mockImplementation(() => {})

    await runScheduledJobs()

    expect(lastUpdate().data).toEqual({
      status: 'FAILED',
      errorReason: unavailableReason('WHATSAPP'),
      nextRetryAt: null,
    })
    expect(h.resolveExportUrl).not.toHaveBeenCalled()
  })

  it('publishes the caption as it is at publish time, by draft id', async () => {
    h.postFindMany.mockResolvedValue([scheduledPost()])
    vi.spyOn(console, 'log').mockImplementation(() => {})

    await runScheduledJobs()

    expect(h.liPublish).toHaveBeenCalledWith(SIGNED, LI_TEXT, 'team1')
    expect(lastUpdate().data).toMatchObject({ status: 'PUBLISHED', platformId: 'li-1' })
  })
})

describe('publishToChannel — the one resolver', () => {
  it('LinkedIn receives only the LinkedIn caption, Instagram only the Instagram one', async () => {
    await publishToChannel('LINKEDIN', 'exports/d1.png', 'd1', 'team1')
    expect(h.liPublish).toHaveBeenCalledWith(SIGNED, LI_TEXT, 'team1')
    expect(h.igPublish).not.toHaveBeenCalled()

    await publishToChannel('INSTAGRAM', 'exports/d1.png', 'd1', 'team1')
    expect(h.igPublish).toHaveBeenCalledWith(SIGNED, IG_TEXT, 'team1')
  })

  it('WhatsApp fails closed, terminally, with the same reason as resolver rule 1', async () => {
    const err = await publishToChannel('WHATSAPP', 'exports/d1.png', 'd1', 'team1').catch((e) => e)
    expect(err).toBeInstanceOf(PublishError)
    expect(err.terminal).toBe(true)
    expect(err.reason).toBe("WhatsApp publishing isn't available.")
    const rule1 = resolveCaptionForPublish('WHATSAPP', row('WHATSAPP', 'ready text'))
    expect(rule1.ok === false && rule1.reason).toBe(err.reason)
    expect(h.resolveExportUrl).not.toHaveBeenCalled()
  })

  const refusals: Array<[string, Partial<Row>, RegExp]> = [
    ['failed', { status: 'FAILED', text: '', failureReason: 'timeout' }, /^The LinkedIn caption failed to generate \(timeout\)/],
    ['pending', { status: 'PENDING' }, /^The LinkedIn caption is being generated/],
    ['empty', { text: ' \n ' }, /^The LinkedIn caption is empty/],
    ['over the limit', { text: 'x'.repeat(3001) }, /^The LinkedIn caption is 3,001 characters; LinkedIn allows 3,000\.$/],
  ]
  for (const [name, over, reason] of refusals) {
    it(`refuses a ${name} caption before signing the export`, async () => {
      rows = rows.map((r) => (r.channel === 'LINKEDIN' ? { ...r, ...over } : r))
      const err = await publishToChannel('LINKEDIN', 'exports/d1.png', 'd1', 'team1').catch((e) => e)
      expect(err).toBeInstanceOf(PublishError)
      expect(err.terminal).toBe(true)
      expect(err.reason).toMatch(reason)
      expect(h.resolveExportUrl).not.toHaveBeenCalled()
      expect(h.liPublish).not.toHaveBeenCalled()
    })
  }

  it('refuses a draft that is gone (no row) before signing', async () => {
    h.draftFindUnique.mockResolvedValue(null)
    const err = await publishToChannel('LINKEDIN', 'exports/d1.png', 'd1', 'team1').catch((e) => e)
    expect(err.terminal).toBe(true)
    expect(err.reason).toBe('This draft has no LinkedIn caption.')
    expect(h.resolveExportUrl).not.toHaveBeenCalled()
  })
})

describe('POST /api/posts — the up-front caption check (A10)', () => {
  function create(body: Record<string, unknown>) {
    return postsRoute.POST(
      new Request('http://test/api/posts', { method: 'POST', body: JSON.stringify(body) }) as never,
      undefined as never,
    )
  }

  for (const [path, scheduledAt] of [
    ['immediate', undefined],
    ['scheduled', new Date(Date.now() + 3_600_000).toISOString()],
  ] as const) {
    it(`a refused caption is 422 CAPTION_UNPUBLISHABLE with no Post row (${path})`, async () => {
      rows = rows.map((r) =>
        r.channel === 'LINKEDIN' ? { ...r, status: 'FAILED', text: '', failureReason: 'missing' } : r,
      )
      const res = await create({ draftId: 'd1', channel: 'LINKEDIN', scheduledAt })
      expect(res.status).toBe(422)
      const body = await res.json()
      expect(body.code).toBe('CAPTION_UNPUBLISHABLE')
      expect(body.error).toMatch(/LinkedIn caption failed to generate/)
      expect(h.postCreate).not.toHaveBeenCalled()
      expect(h.resolveExportUrl).not.toHaveBeenCalled()
    })
  }

  it('a ready caption still schedules (201, one row)', async () => {
    const res = await create({
      draftId: 'd1',
      channel: 'LINKEDIN',
      scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
    })
    expect(res.status).toBe(201)
    expect(h.postCreate).toHaveBeenCalledTimes(1)
  })

  it('an immediate publish sends the channel caption', async () => {
    const res = await create({ draftId: 'd1', channel: 'INSTAGRAM' })
    expect(res.status).toBe(201)
    expect(h.igPublish).toHaveBeenCalledWith(SIGNED, IG_TEXT, 'team1')
  })
})

describe('posts GET routes — draft.caption', () => {
  it("GET /api/posts/[id] returns the post channel's caption and nothing else", async () => {
    h.postFindUnique.mockResolvedValue({
      id: 'p1',
      teamId: 'team1',
      userId: 'u1',
      channel: 'LINKEDIN',
      draft: { id: 'd1', exportUrl: 'exports/d1.png', brief: { campaignId: null } },
    })
    const res = await postByIdRoute.GET(new Request('http://test') as never, { params: { id: 'p1' } } as never)
    const body = await res.json()
    expect(body.draft).toEqual({ id: 'd1', caption: LI_TEXT, exportUrl: SIGNED })
  })

  it("GET /api/posts gives each post its own channel's caption", async () => {
    h.postFindMany.mockResolvedValue([
      { id: 'p1', channel: 'INSTAGRAM', draft: { id: 'd1', exportUrl: 'k' } },
      { id: 'p2', channel: 'LINKEDIN', draft: { id: 'd1', exportUrl: 'k' } },
    ])
    h.postCount.mockResolvedValue(2)
    const res = await postsRoute.GET(new Request('http://test/api/posts') as never, undefined as never)
    const body = await res.json()
    expect(body.posts.map((p: { draft: { caption: string } }) => p.draft.caption)).toEqual([IG_TEXT, LI_TEXT])
  })

  it('GET /api/posts reads every caption in one query, and a draft with no row reads as empty (017 AC-05)', async () => {
    h.postFindMany.mockResolvedValue([
      { id: 'p1', channel: 'INSTAGRAM', draft: { id: 'd1', exportUrl: 'k' } },
      { id: 'p2', channel: 'LINKEDIN', draft: { id: 'd1', exportUrl: 'k' } },
      { id: 'p3', channel: 'INSTAGRAM', draft: { id: 'd2', exportUrl: 'k' } },
    ])
    h.postCount.mockResolvedValue(3)
    const res = await postsRoute.GET(new Request('http://test/api/posts') as never, undefined as never)
    const body = await res.json()
    expect(body.posts.map((p: { draft: { caption: string } }) => p.draft.caption)).toEqual([IG_TEXT, LI_TEXT, ''])
    expect(h.captionFindMany).toHaveBeenCalledTimes(1)
    expect(h.captionFindMany.mock.calls[0][0].where).toEqual({ draftId: { in: ['d1', 'd2'] } })
    expect(h.draftFindUnique).not.toHaveBeenCalled()
  })
})

// 017 FR-05 (AC-04): the duplicate check runs before the caption check, so a
// double-click on a live post is a 409 even when the caption has since become
// unpublishable.
describe('POST /api/posts — check order (017)', () => {
  it('a live post with a refused caption is 409 with the existing postId, not 422', async () => {
    rows = rows.map((r) => (r.channel === 'INSTAGRAM' ? { ...r, text: '' } : r))
    h.postFindFirst.mockResolvedValue({ id: 'live-1', status: 'PUBLISHED' })
    const res = await postsRoute.POST(
      new Request('http://test/api/posts', {
        method: 'POST',
        body: JSON.stringify({ draftId: 'd1', channel: 'INSTAGRAM' }),
      }) as never,
      undefined as never,
    )
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ postId: 'live-1', status: 'PUBLISHED' })
    expect(h.postCreate).not.toHaveBeenCalled()
  })
})

// 017 FR-01/FR-02 (AC-01, AC-02): a publish the platform refused is a 502
// PUBLISH_FAILED carrying the FAILED row's id and status, not a 2xx.
describe('publish failures are 502 PUBLISH_FAILED (017)', () => {
  const postRetryRoute = () => import('@/app/api/posts/[id]/publish/route')

  it('POST /api/posts: an immediate PublishError is 502, and the FAILED row is still written', async () => {
    h.igPublish.mockRejectedValue(new PublishError('INSTAGRAM', 'Instagram said no'))
    const res = await postsRoute.POST(
      new Request('http://test/api/posts', {
        method: 'POST',
        body: JSON.stringify({ draftId: 'd1', channel: 'INSTAGRAM' }),
      }) as never,
      undefined as never,
    )
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({
      error: 'Instagram said no',
      code: 'PUBLISH_FAILED',
      postId: 'new-post',
      status: 'FAILED',
    })
    expect(h.postCreate).toHaveBeenCalledTimes(1)
    expect(h.postCreate.mock.calls[0][0].data).toMatchObject({ draftId: 'd1', channel: 'INSTAGRAM', status: 'PENDING' })
    expect(lastUpdate()).toEqual({
      where: { id: 'new-post' },
      data: { status: 'FAILED', errorReason: 'Instagram said no' },
    })
  })

  it('POST /api/posts: a successful immediate publish is still 201', async () => {
    const res = await postsRoute.POST(
      new Request('http://test/api/posts', {
        method: 'POST',
        body: JSON.stringify({ draftId: 'd1', channel: 'INSTAGRAM' }),
      }) as never,
      undefined as never,
    )
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ postId: 'new-post', status: 'PUBLISHED' })
  })

  function failedPost() {
    return {
      id: 'p1',
      teamId: 'team1',
      draftId: 'd1',
      channel: 'LINKEDIN',
      status: 'FAILED',
      errorReason: 'first failure',
      draft: { exportUrl: 'exports/d1.png' },
    }
  }

  it('POST /api/posts/[id]/publish: a retry that fails again is 502 in the same shape; the row stays FAILED', async () => {
    h.postFindUnique.mockResolvedValue(failedPost())
    h.liPublish.mockRejectedValue(new PublishError('LINKEDIN', 'LinkedIn said no again'))
    const { POST } = await postRetryRoute()
    const res = await POST(new Request('http://test', { method: 'POST' }) as never, { params: { id: 'p1' } } as never)
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({
      error: 'LinkedIn said no again',
      code: 'PUBLISH_FAILED',
      postId: 'p1',
      status: 'FAILED',
    })
    expect(lastUpdate()).toEqual({
      where: { id: 'p1' },
      data: { status: 'FAILED', errorReason: 'LinkedIn said no again', nextRetryAt: null },
    })
  })

  it('POST /api/posts/[id]/publish: a retry that works is still 200 PUBLISHED', async () => {
    h.postFindUnique.mockResolvedValue(failedPost())
    const { POST } = await postRetryRoute()
    const res = await POST(new Request('http://test', { method: 'POST' }) as never, { params: { id: 'p1' } } as never)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ postId: 'p1', status: 'PUBLISHED' })
  })
})
