// 012 T6 review NOTEs — the caption routes' edge paths, with the store, the
// action lifecycle and the provider mocked:
//   - regenerate-copy: an empty body is {}; malformed JSON is 400; a throw
//     after the claim (before the run starts) settles the target rows and
//     releases the claim instead of stranding both until the sweep; a failure
//     before the claim claims nothing;
//   - PATCH { headline }: refused (409) while a generation runs.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  draftFindUnique: vi.fn(),
  resolveCopyProvider: vi.fn(),
  loadDraftCaptions: vi.fn(),
  claimCaptionAction: vi.fn(),
  settleCaptionAction: vi.fn(),
  saveHeadlineEdit: vi.fn(),
  startDraftAction: vi.fn(),
  releaseDraftAction: vi.fn(),
  resolveModel: vi.fn(),
  writeCaptions: vi.fn(),
  trackHeadlineEdited: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: { draft: { findUnique: h.draftFindUnique } } }))
// The real handler module pulls in auth (and its env checks); these routes need
// only the wrapper and a JSON read.
vi.mock('@/lib/api/handler', () => {
  const wrap =
    (handler: (req: unknown, ctx: { params: unknown }, user: unknown) => unknown) =>
    (req: unknown, ctx: { params: unknown }) =>
      handler(req, { params: ctx.params }, { userId: 'u1', teamId: 'team1' })
  const parseBody = async (req: Request) => ({ data: await req.json() })
  return { parseBody, withTeamAuth: wrap, withTeamAdmin: wrap }
})
vi.mock('@/lib/authz/visibility', () => ({ canAccessContent: () => true }))
vi.mock('@/providers/registry', () => ({ resolveCopyProvider: h.resolveCopyProvider }))
vi.mock('@/lib/brandkit/resolve', () => ({ resolveBrandKit: async () => null }))
vi.mock('@/lib/campaign/briefing', () => ({ getActiveCampaignBriefing: async () => null }))
vi.mock('@/lib/storage/minio', () => ({ resolveExportUrl: async () => null }))
vi.mock('@/lib/drafts/revisions', () => ({ COMMITTED_REVISION: {}, resolveNotAppliedOutcome: async () => null }))
vi.mock('@/lib/renderedText/track', () => ({ trackHeadlineEdited: h.trackHeadlineEdited }))
vi.mock('@/lib/captions/generate', () => ({ writeCaptions: h.writeCaptions }))
// 008: the route resolves the CAPTION model before its claim. The I/O wrapper
// is a spy; by default it runs the REAL pure decideModel on a policy the test
// sets (API mode, so the credential is 'n/a'), so FR-09's tiers are exercised.
let policy: { allowed: string[]; defaults: Record<string, string>; gateOn: boolean }
vi.mock('@/lib/models/policy', () => ({ resolveModel: h.resolveModel }))
const { decideModel } = await import('@/lib/models/resolve')
vi.mock('@/lib/captions/store', () => ({
  loadDraftCaptions: h.loadDraftCaptions,
  claimCaptionAction: h.claimCaptionAction,
  settleCaptionAction: h.settleCaptionAction,
  saveHeadlineEdit: h.saveHeadlineEdit,
  saveCaptionEdit: vi.fn(),
  settlePendingCaptions: vi.fn(),
}))
vi.mock('@/lib/drafts/draftActions', () => ({
  startDraftAction: h.startDraftAction,
  releaseDraftAction: h.releaseDraftAction,
}))

const { POST: regenerate } = await import('@/app/api/drafts/[id]/regenerate-copy/route')
const { PATCH: patch } = await import('@/app/api/drafts/[id]/route')

const ctx = { params: { id: 'd1' } }
const ALL = ['INSTAGRAM', 'LINKEDIN']
const CLAIM = { action: 'REGENERATE_COPY', claimId: 'claim-1' }

function post(body?: string) {
  return regenerate(new Request('http://test/x', { method: 'POST', body }) as never, ctx as never)
}

function exportedDraft(over: Record<string, unknown> = {}) {
  return {
    id: 'd1',
    teamId: 'team1',
    status: 'EXPORTED',
    pendingAction: null,
    brief: { userId: 'u1', teamId: 'team1', campaignId: null, brandKitId: null, copyProviderKey: null },
    ...over,
  }
}

beforeEach(() => {
  for (const fn of Object.values(h)) fn.mockReset()
  policy = { allowed: ['HAIKU', 'SONNET', 'OPUS'], defaults: {}, gateOn: false }
  h.resolveModel.mockImplementation(async (surface: never, opts: { stamp?: string | null }) =>
    decideModel(surface, { stamp: opts.stamp, policy: policy as never, credential: 'n/a', mode: 'api' }),
  )
  h.draftFindUnique.mockResolvedValue(exportedDraft())
  h.resolveCopyProvider.mockResolvedValue({})
  h.loadDraftCaptions.mockResolvedValue({ captions: [] })
  h.claimCaptionAction.mockResolvedValue(CLAIM)
  // 030: the settle reports whether it wrote the headline.
  h.settleCaptionAction.mockResolvedValue({ headlineWritten: false, headlineBefore: null })
  h.trackHeadlineEdited.mockResolvedValue(undefined)
  h.releaseDraftAction.mockResolvedValue(undefined)
  h.startDraftAction.mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('regenerate-copy — the body', () => {
  it.each([
    ['absent', undefined],
    ['empty', ''],
    ['whitespace', '  \n'],
  ])('an %s body is {} ("Regenerate all")', async (_name, body) => {
    const res = await post(body)
    expect(res.status).toBe(202)
    expect(h.claimCaptionAction).toHaveBeenCalledWith('d1', ALL)
  })

  it('malformed non-empty JSON is still 400, before anything is read', async () => {
    const res = await post('{not json')
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invalid JSON body' })
    expect(h.draftFindUnique).not.toHaveBeenCalled()
  })
})

describe('regenerate-copy — a failure never strands the claim', () => {
  it('a throw after the claim (the run never started) settles the target rows, then releases the claim', async () => {
    const order: string[] = []
    h.startDraftAction.mockRejectedValue(new Error('No Claude credential'))
    h.settleCaptionAction.mockImplementation(async () => {
      order.push('settle')
    })
    h.releaseDraftAction.mockImplementation(async () => {
      order.push('release')
    })

    const res = await post(JSON.stringify({ channel: 'LINKEDIN' }))

    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ code: 'COPY_ERROR', message: 'No Claude credential' })
    expect(h.settleCaptionAction).toHaveBeenCalledWith('d1', CLAIM, ['LINKEDIN'], {
      LINKEDIN: { ok: false, reason: 'No Claude credential' },
    })
    expect(h.releaseDraftAction).toHaveBeenCalledWith('d1', CLAIM, 'No Claude credential')
    // Settled while the claim still holds, so no newer run's rows are touched.
    expect(order).toEqual(['settle', 'release'])
  })

  it('a failure before the claim (provider resolution) claims nothing and settles nothing', async () => {
    h.resolveCopyProvider.mockRejectedValue(new Error('No copy provider'))
    const res = await post('{}')
    expect(res.status).toBe(422)
    expect(h.claimCaptionAction).not.toHaveBeenCalled()
    expect(h.settleCaptionAction).not.toHaveBeenCalled()
    expect(h.releaseDraftAction).not.toHaveBeenCalled()
  })

  it('materializes the rows before claiming them', async () => {
    await post('{}')
    expect(h.loadDraftCaptions.mock.invocationCallOrder[0]).toBeLessThan(
      h.claimCaptionAction.mock.invocationCallOrder[0],
    )
  })

  it('carries the claim from claimCaptionAction to startDraftAction and the unstarted settle (019)', async () => {
    const res = await post(JSON.stringify({ channel: 'LINKEDIN' }))
    expect(res.status).toBe(202)
    expect(h.startDraftAction.mock.calls[0][3]).toBe(CLAIM)
    h.startDraftAction.mockRejectedValue(new Error('x'))
    h.settleCaptionAction.mockClear()
    h.releaseDraftAction.mockClear()
    await post(JSON.stringify({ channel: 'LINKEDIN' }))
    expect(h.settleCaptionAction.mock.calls[0][1]).toBe(CLAIM)
    expect(h.releaseDraftAction.mock.calls[0][1]).toBe(CLAIM)
  })

  it('a lost claim is 409 and releases nothing it does not hold', async () => {
    h.claimCaptionAction.mockResolvedValue(null)
    const res = await post('{}')
    expect(res.status).toBe(409)
    expect(h.startDraftAction).not.toHaveBeenCalled()
    expect(h.releaseDraftAction).not.toHaveBeenCalled()
  })
})

describe('PATCH { headline } — refused while something may write the headline', () => {
  function patchHeadline() {
    return patch(
      new Request('http://test/x', { method: 'PATCH', body: JSON.stringify({ headline: 'Mine' }) }) as never,
      ctx as never,
    )
  }

  it.each([
    ['a generation is running (IN_PROGRESS)', { status: 'IN_PROGRESS', headline: null }],
    ['a retry over a draft that has a headline', { status: 'IN_PROGRESS', headline: 'Old' }],
    ['a caption action holds the draft', { pendingAction: 'REGENERATE_COPY' }],
  ])('409 while %s, and nothing is written', async (_name, over) => {
    h.draftFindUnique.mockResolvedValue(exportedDraft(over))
    const res = await patchHeadline()
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'This caption is being generated' })
    expect(h.saveHeadlineEdit).not.toHaveBeenCalled()
  })
})

// ── 008 T7 (FR-09, FR-08): the regenerate default is the stamps' ────────────

describe('regenerate-copy — 008 FR-09 stamp tier, resolved before the claim', () => {
  const SONNET = 'claude-sonnet-5-5'
  const OPUS = 'claude-opus-5-5'
  const HAIKU = 'claude-haiku-4-5'

  function rows(ig: string | null, li: string | null) {
    return {
      captions: [
        { channel: 'INSTAGRAM', text: 'ig', status: 'READY', model: ig, modelSubstitutedFrom: null },
        { channel: 'LINKEDIN', text: 'li', status: 'READY', model: li, modelSubstitutedFrom: null },
      ],
    }
  }
  // The ResolvedModel the run was handed (writeCaptions' 4th argument).
  const ranWith = () => h.writeCaptions.mock.calls[0][3]

  beforeEach(() => {
    // Run the background work inline so the closure's writes are observable.
    h.startDraftAction.mockImplementation(async (_d: string, _u: string, _t: string, _a: unknown, work: () => Promise<unknown>) => {
      await work()
    })
    h.writeCaptions.mockImplementation(async (_p: unknown, _b: unknown, targets: string[], model: { arg: string; substitutedFrom: string | null }) => ({
      fields: Object.fromEntries(targets.map((t) => [t, { ok: true, text: `new ${t}` }])),
      stamp: { model: model.arg, substitutedFrom: model.substitutedFrom },
    }))
  })

  it('{channel}: the stamp tier is THAT row\'s model only', async () => {
    h.loadDraftCaptions.mockResolvedValue(rows(SONNET, OPUS))
    expect((await post(JSON.stringify({ channel: 'LINKEDIN' }))).status).toBe(202)
    expect(h.resolveModel).toHaveBeenCalledWith('CAPTION', { stamp: OPUS, userId: 'u1', teamId: 'team1' })
    expect(ranWith()).toMatchObject({ key: 'OPUS', source: 'stamp', substitutedFrom: null })
  })

  it('{headline:true}: the stamp tier is Draft.headlineModel', async () => {
    h.draftFindUnique.mockResolvedValue(exportedDraft({ headlineModel: HAIKU }))
    h.loadDraftCaptions.mockResolvedValue(rows(SONNET, SONNET))
    await post(JSON.stringify({ headline: true }))
    expect(h.resolveModel.mock.calls[0][1]).toMatchObject({ stamp: HAIKU })
    expect(ranWith()).toMatchObject({ key: 'HAIKU', source: 'stamp' })
  })

  it('{} with three equal stamps → that stamp (like for like)', async () => {
    h.loadDraftCaptions.mockResolvedValue(rows(SONNET, SONNET))
    await post('{}')
    expect(h.resolveModel.mock.calls[0][1]).toMatchObject({ stamp: SONNET })
    expect(ranWith()).toMatchObject({ key: 'SONNET', source: 'stamp' })
  })

  it.each([
    ['mixed', [SONNET, OPUS]],
    ['one null', [SONNET, null]],
  ] as const)('{} with %s stamps → no stamp tier: the team default, recorded as NO substitution', async (_n, s) => {
    policy.defaults = { CAPTION: 'HAIKU' }
    h.loadDraftCaptions.mockResolvedValue(rows(s[0], s[1]))
    await post('{}')
    expect(h.resolveModel.mock.calls[0][1]).toMatchObject({ stamp: null })
    expect(ranWith()).toMatchObject({ key: 'HAIKU', source: 'team', substitutedFrom: null })
  })

  it('a null-stamp draft with no team default → the system default', async () => {
    h.loadDraftCaptions.mockResolvedValue(rows(null, null))
    await post('{}')
    expect(ranWith()).toMatchObject({ source: 'system', substitutedFrom: null })
  })

  it('a stamp since disallowed falls through and is recorded on the new stamp (AC-17)', async () => {
    policy.allowed = ['HAIKU', 'SONNET']
    h.loadDraftCaptions.mockResolvedValue(rows(SONNET, OPUS))
    await post(JSON.stringify({ channel: 'LINKEDIN' }))
    expect(ranWith()).toMatchObject({ key: 'HAIKU', source: 'system', substitutedFrom: OPUS })
    // The settle receives the reply's stamp, substitution included.
    expect(h.settleCaptionAction).toHaveBeenCalledWith(
      'd1',
      CLAIM,
      ['LINKEDIN'],
      { LINKEDIN: { ok: true, text: 'new LINKEDIN' } },
      { model: HAIKU, substitutedFrom: OPUS },
      // 027: the db default, then the post-style stamp (null: the brief has no style).
      undefined,
      null,
    )
  })

  it('resolves after the rows are loaded (they carry the stamps) and BEFORE the claim', async () => {
    h.loadDraftCaptions.mockResolvedValue(rows(SONNET, SONNET))
    await post('{}')
    expect(h.loadDraftCaptions.mock.invocationCallOrder[0]).toBeLessThan(h.resolveModel.mock.invocationCallOrder[0])
    expect(h.resolveModel.mock.invocationCallOrder[0]).toBeLessThan(h.claimCaptionAction.mock.invocationCallOrder[0])
  })

  it('a failed resolution is the 422 COPY_ERROR shape and claims nothing', async () => {
    policy.allowed = []
    const res = await post('{}')
    expect(res.status).toBe(422)
    expect((await res.json()).code).toBe('COPY_ERROR')
    expect(h.claimCaptionAction).not.toHaveBeenCalled()
    expect(h.startDraftAction).not.toHaveBeenCalled()
  })

  it('the onError settle passes no stamp (a failed run keeps every row stamp)', async () => {
    h.loadDraftCaptions.mockResolvedValue(rows(SONNET, SONNET))
    await post(JSON.stringify({ channel: 'LINKEDIN' }))
    const onError = h.startDraftAction.mock.calls[0][5] as (e: unknown) => Promise<void>
    h.settleCaptionAction.mockClear()
    await onError(new Error('boom'))
    expect(h.settleCaptionAction).toHaveBeenCalledWith('d1', CLAIM, ['LINKEDIN'], { LINKEDIN: { ok: false, reason: 'boom' } })
    expect(h.settleCaptionAction.mock.calls[0]).toHaveLength(4)
  })
})

// ── 030 FR-15: regenerate emits draft.headline_edited only when the settle wrote the headline ──

describe('regenerate-copy — draft.headline_edited (030 FR-15)', () => {
  beforeEach(() => {
    h.startDraftAction.mockImplementation(async (_d: string, _u: string, _t: string, _a: unknown, work: () => Promise<unknown>) => {
      await work()
    })
    h.writeCaptions.mockImplementation(async (_p: unknown, _b: unknown, targets: string[]) => ({
      fields: Object.fromEntries(targets.map((t) => [t, { ok: true, text: `new ${t}` }])),
      stamp: { model: 'm', substitutedFrom: null },
    }))
  })

  it('emits once, via regenerate, with the value before, after the settle that wrote the headline', async () => {
    h.settleCaptionAction.mockResolvedValue({ headlineWritten: true, headlineBefore: 'Old' })
    await post(JSON.stringify({ headline: true }))
    expect(h.trackHeadlineEdited).toHaveBeenCalledTimes(1)
    expect(h.trackHeadlineEdited).toHaveBeenCalledWith({
      draftId: 'd1',
      teamId: 'team1',
      userId: 'u1',
      via: 'regenerate',
      before: 'Old',
    })
    expect(h.settleCaptionAction.mock.invocationCallOrder[0]).toBeLessThan(h.trackHeadlineEdited.mock.invocationCallOrder[0])
  })

  it('emits nothing when the settle wrote no headline', async () => {
    await post(JSON.stringify({ channel: 'LINKEDIN' }))
    expect(h.trackHeadlineEdited).not.toHaveBeenCalled()
  })
})
