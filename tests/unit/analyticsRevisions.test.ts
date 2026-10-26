// 006 T2: the swept events and the revision events (FR-04, FR-06). The real
// routes and the real track() run; the revision store and storage are faked.
//   - the lazy stuck sweep (GET /api/drafts/[id]) emits generation.swept or
//     draft_action.swept once, only when its guarded write changed a row;
//   - inline edit (both modes), the refine Override, adopt and restore each
//     emit exactly one revision event after their write succeeded, none when
//     the write is refused;
//   - a failing insert changes neither a response nor a write (AC-08).

import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  draft: null as null | Record<string, unknown>,
  updateMany: vi.fn(),
  revisionFindFirst: vi.fn(),
  eventCreate: vi.fn(),
  dropUpsert: vi.fn(),
  commit: vi.fn(),
  restore: vi.fn(),
  findCommitted: vi.fn(),
  access: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    draft: { findUnique: async () => h.draft, updateMany: h.updateMany },
    draftRevision: { findFirst: h.revisionFindFirst },
    analyticsEvent: { create: h.eventCreate },
    analyticsDrop: { upsert: h.dropUpsert },
  },
}))
vi.mock('@/lib/api/handler', () => ({
  parseBody: async (req: Request) => ({ data: await req.json() }),
  withTeamAuth:
    (handler: (req: unknown, ctx: { params: unknown }, user: unknown) => unknown) =>
    (req: unknown, ctx: { params: unknown }) =>
      handler(req, { params: ctx.params }, { userId: 'u1', teamId: 'team1' }),
  withTeamAdmin: (handler: unknown) => handler,
}))
vi.mock('@/lib/authz/visibility', () => ({ canAccessContent: () => true }))
vi.mock('@/lib/auth', () => ({ getDraftAccessInfo: h.access }))
vi.mock('@/lib/storage/minio', () => ({
  resolveExportUrl: async (k: string | null) => k,
  uploadObject: async () => {},
  exportKey: () => 'k',
  BUCKET_EXPORTS: 'exports',
}))
vi.mock('@/lib/renderer/puppeteer', () => ({ renderHtmlToPng: async () => Buffer.from('') }))
vi.mock('@/lib/brandkit/resolve', () => ({ resolveBrandKit: async () => null }))
vi.mock('@/providers/registry', () => ({ copyProviderIsClaude: async () => true }))
vi.mock('@/lib/captions/store', () => ({
  loadDraftCaptions: async () => ({ captions: [] }),
  settlePendingCaptions: async () => {},
  saveCaptionEdit: async () => true,
  saveHeadlineEdit: async () => true,
}))
vi.mock('@/lib/drafts/revisions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/drafts/revisions')>()
  return {
    ...actual,
    commitDraftRevision: h.commit,
    restoreDraftToRevision: h.restore,
    findCommittedRevision: h.findCommitted,
    resolveNotAppliedOutcome: async () => null,
  }
})

const draftRoute = await import('@/app/api/drafts/[id]/route')
const inlineEdit = await import('@/app/api/drafts/[id]/inline-edit/route')
const adopt = await import('@/app/api/drafts/[id]/rejected/[revisionId]/adopt/route')
const restore = await import('@/app/api/drafts/[id]/revisions/[rev]/restore/route')
const refine = await import('@/app/api/drafts/[id]/refine/route')

type Stored = { name: string; source: string; teamId: string; userId: string | null; draftId: string | null; outcome: string; durationMs: number | null; payload: Record<string, unknown> }
const events = () => h.eventCreate.mock.calls.map((c) => (c[0] as { data: Stored }).data)

const post = (body: unknown = {}) => new Request('http://test/x', { method: 'POST', body: JSON.stringify(body) }) as never
const get = () => new Request('http://test/x') as never

function draft(over: Record<string, unknown> = {}) {
  return {
    id: 'd1',
    teamId: 'team1',
    briefId: 'b1',
    status: 'EXPORTED',
    pendingAction: null,
    pendingActionClaimId: null,
    pendingActionError: null,
    failureReason: null,
    pendingConflict: null,
    htmlContent: '<html><body>x</body></html>',
    exportUrl: 'exports/d1.png',
    currentRevisionNumber: 3,
    notAppliedRevisionId: null,
    designModel: 'claude-sonnet-5-5',
    designModelSubstitutedFrom: null,
    headline: 'h',
    updatedAt: new Date(),
    createdAt: new Date(),
    posts: [],
    _count: { revisions: 3 },
    brief: { id: 'b1', userId: 'u1', campaignId: null, brandKitId: null, aspectRatio: 'SQUARE', designMode: 'GENERATE', topic: 't', goal: null, tone: null, channels: [] },
    ...over,
  }
}

const OLD = () => new Date(Date.now() - 30 * 60_000)

beforeEach(() => {
  for (const fn of Object.values(h)) if (typeof fn === 'function' && 'mockReset' in fn) (fn as ReturnType<typeof vi.fn>).mockReset()
  h.draft = draft()
  h.updateMany.mockResolvedValue({ count: 1 })
  h.eventCreate.mockResolvedValue({})
  h.dropUpsert.mockResolvedValue({})
  h.commit.mockResolvedValue({ revisionId: 'rev-9', revisionNumber: 4, exportKey: 'exports/r.png' })
  h.restore.mockResolvedValue(undefined)
  h.access.mockResolvedValue({ teamId: 'team1', ownerId: 'u1', campaignId: null })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('swept events (FR-04)', () => {
  const call = () => draftRoute.GET(get(), { params: { id: 'd1' } } as never) as Promise<Response>

  it('a stranded generation emits generation.swept once, with its age', async () => {
    h.draft = draft({ status: 'IN_PROGRESS', updatedAt: OLD(), htmlContent: null, exportUrl: null })
    const res = await call()
    expect((await res.json()).status).toBe('FAILED')
    expect(events()).toHaveLength(1)
    expect(events()[0]).toMatchObject({ name: 'generation.swept', source: 'web', teamId: 'team1', draftId: 'd1', outcome: 'failed', durationMs: null })
    expect(events()[0].payload.ageMs).toBeGreaterThanOrEqual(30 * 60_000 - 1000)
  })

  it('a stale action emits draft_action.swept with the action', async () => {
    h.draft = draft({ pendingAction: 'REGENERATE_DESIGN', pendingActionClaimId: 'tok', updatedAt: OLD() })
    await call()
    expect(events()).toHaveLength(1)
    expect(events()[0]).toMatchObject({ name: 'draft_action.swept', outcome: 'failed', payload: { action: 'REGENERATE_DESIGN' } })
  })

  it('no event when the guarded write changed nothing (a concurrent settle or sweep won)', async () => {
    h.updateMany.mockResolvedValue({ count: 0 })
    h.draft = draft({ status: 'IN_PROGRESS', updatedAt: OLD() })
    await call()
    h.draft = draft({ pendingAction: 'REFINE', pendingActionClaimId: 'tok', updatedAt: OLD() })
    await call()
    expect(events()).toHaveLength(0)
  })

  it('a live draft and a fresh action emit nothing', async () => {
    await call()
    h.draft = draft({ pendingAction: 'REFINE', pendingActionClaimId: 'tok' })
    await call()
    expect(events()).toHaveLength(0)
  })

  it('AC-08: a failing insert still returns the recovered state and the same writes', async () => {
    h.draft = draft({ status: 'IN_PROGRESS', updatedAt: OLD() })
    const base = await (await call()).json()
    const baseWrites = h.updateMany.mock.calls.map((c) => c[0])
    h.updateMany.mockClear()
    h.eventCreate.mockRejectedValue(new Error('insert failed'))
    const failing = await (await call()).json()
    expect(failing.status).toBe(base.status)
    expect(failing.failureReason).toBe(base.failureReason)
    expect(h.updateMany.mock.calls.map((c) => c[0])).toEqual(baseWrites)
  })
})

describe('revision events (FR-06)', () => {
  const inline = (body: unknown) => inlineEdit.POST(post(body), { params: { id: 'd1' } } as never) as Promise<Response>

  it('inline edit, whole document: one revision.edited with mode document', async () => {
    const res = await inline({ html: '<html><body>edited</body></html>' })
    expect(res.status).toBe(200)
    expect(events()).toHaveLength(1)
    expect(events()[0]).toMatchObject({ name: 'revision.edited', source: 'web', teamId: 'team1', userId: 'u1', draftId: 'd1', outcome: 'ok', payload: { mode: 'document' } })
  })

  it('inline edit, element: mode element; a stale base emits nothing', async () => {
    h.draft = draft({ htmlContent: '<html><body><p>hello</p></body></html>', currentRevisionNumber: 3 })
    const element = {
      mode: 'element',
      locator: { path: [0], tag: 'p', text: 'hello', baseRevisionNumber: 3 },
      edit: { kind: 'text', value: 'bye' },
    }
    const ok = await inline(element)
    expect(ok.status).toBe(200)
    expect(events()).toHaveLength(1)
    expect(events()[0].payload).toEqual({ mode: 'element' })

    h.eventCreate.mockClear()
    const stale = await inline({ ...element, locator: { ...element.locator, baseRevisionNumber: 2 } })
    expect(stale.status).toBe(409)
    expect(events()).toHaveLength(0)
  })

  it('a blocked inline edit (an action is running) emits nothing', async () => {
    h.draft = draft({ pendingAction: 'REFINE' })
    expect((await inline({ html: '<html></html>' })).status).toBe(409)
    expect(events()).toHaveLength(0)
  })

  it('adopt: one revision.adopted; an ineligible render emits nothing', async () => {
    h.draft = draft({ notAppliedRevisionId: 'rej-1' })
    h.revisionFindFirst.mockResolvedValue({
      id: 'rej-1',
      instruction: 'x',
      htmlSnapshot: '<html/>',
      exportUrl: 'exports/rej.png',
      rejectedAt: new Date(),
      adoptedAt: null,
      discardedAt: null,
    })
    const call = () => adopt.POST(post(), { params: { id: 'd1', revisionId: 'rej-1' } } as never) as Promise<Response>
    expect((await call()).status).toBe(200)
    expect(events()).toHaveLength(1)
    expect(events()[0]).toMatchObject({ name: 'revision.adopted', outcome: 'ok', draftId: 'd1', payload: {} })

    h.eventCreate.mockClear()
    h.revisionFindFirst.mockResolvedValue({ id: 'rej-1', instruction: 'x', htmlSnapshot: '', exportUrl: 'e', rejectedAt: new Date(), adoptedAt: new Date(), discardedAt: null })
    expect((await call()).status).toBe(409)
    expect(events()).toHaveLength(0)
  })

  it('restore: one revision.restored with from and to', async () => {
    h.findCommitted.mockResolvedValue({ revisionNumber: 1, htmlSnapshot: '<html/>', exportUrl: 'exports/v1.png' })
    const res = (await restore.POST(post(), { params: { id: 'd1', rev: '1' } } as never)) as Response
    expect(res.status).toBe(200)
    expect(events()).toHaveLength(1)
    expect(events()[0]).toMatchObject({ name: 'revision.restored', outcome: 'ok', payload: { from: 3, to: 1 } })
  })

  it('restore refused (busy) emits nothing', async () => {
    h.draft = draft({ pendingAction: 'REFINE' })
    const res = (await restore.POST(post(), { params: { id: 'd1', rev: '1' } } as never)) as Response
    expect(res.status).toBe(409)
    expect(events()).toHaveLength(0)
  })

  it('refine Override: one revision.override after the commit; an unknown conflict emits nothing', async () => {
    h.draft = draft({ pendingConflict: { conflictId: 'c1', pendingHtml: '<html/>', explanation: 'x', model: null, modelSubstitutedFrom: null } })
    const call = (id: string) => refine.POST(post({ instruction: 'use anyway', overrideConflictId: id }), { params: { id: 'd1' } } as never) as Promise<Response>
    expect((await call('c1')).status).toBe(200)
    expect(events()).toHaveLength(1)
    expect(events()[0]).toMatchObject({ name: 'revision.override', outcome: 'ok', draftId: 'd1', userId: 'u1' })

    h.eventCreate.mockClear()
    expect((await call('nope')).status).toBe(409)
    expect(events()).toHaveLength(0)
  })

  it('AC-08: a failing insert changes no response and no write', async () => {
    const run = async () => {
      h.commit.mockClear()
      const out: Array<[number, unknown]> = []
      const a = await inline({ html: '<html><body>edited</body></html>' })
      out.push([a.status, await a.json()])
      h.findCommitted.mockResolvedValue({ revisionNumber: 1, htmlSnapshot: '<html/>', exportUrl: 'exports/v1.png' })
      const r = (await restore.POST(post(), { params: { id: 'd1', rev: '1' } } as never)) as Response
      out.push([r.status, await r.json()])
      return { out, commits: h.commit.mock.calls.length, restores: h.restore.mock.calls.length }
    }
    const base = await run()
    h.restore.mockClear()
    h.eventCreate.mockRejectedValue(new Error('insert failed'))
    const failing = await run()
    expect(failing.out).toEqual(base.out)
    expect(failing.commits).toBe(base.commits)
    expect(failing.restores).toBe(1)
    await vi.waitFor(() => expect(h.dropUpsert).toHaveBeenCalled())
  })
})
