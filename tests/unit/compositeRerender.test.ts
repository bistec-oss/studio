// 025 T9 (FR-16, NFR-05, NFR-08): the stamp decides the screenshot on every
// re-render path. Pure helpers first, then the refine route (the model never
// sees the element; the stamped rect names the screen; a replaced image drops
// the composite), the override, and the export and restore routes.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { insertComposite } from '@/lib/composite/insert'
import { CompositePlacementError, COMPOSITE_PLACEMENT_ERROR } from '@/lib/composite/render'
import { compositionStampSchema } from '@/lib/designData'

const RECT = { x: 17, y: 44, w: 72, h: 45 }
const CANVAS = { width: 1080, height: 1080 }
const KEY = 'screenshots/team1/u1/a.png'
const STAMP = compositionStampSchema.parse({
  requestedArchetype: 'device-screen',
  appliedArchetype: 'device-screen',
  contractVersion: 1,
  imageQuality: 'default',
  composites: [{ region: 0, rect: RECT, source: { kind: 'brief-upload', key: KEY } }],
})
const BASE = '<!doctype html><html><body><p>Hello</p></body></html>'
const STORED = insertComposite(BASE, RECT, CANVAS)

const h = vi.hoisted(() => ({
  draft: null as null | Record<string, unknown>,
  claim: vi.fn(),
  commit: vi.fn(),
  reject: vi.fn(),
  refineApi: vi.fn(),
  result: null as null | Record<string, unknown>,
  bgUrl: null as string | null,
  renderDraftHtml: vi.fn(),
  updates: [] as unknown[],
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    draft: {
      findUnique: async () => h.draft,
      update: async (a: unknown) => {
        h.updates.push(a)
        return {}
      },
      updateMany: async () => ({ count: 1 }),
    },
    teamModelPolicy: { findUnique: async () => null },
    userClaudeToken: { findFirst: async () => null },
  },
}))
vi.mock('@/lib/api/handler', () => ({
  parseBody: async (req: Request) => ({ data: await req.json() }),
  withTeamAuth:
    (handler: (req: unknown, ctx: { params: unknown }, user: unknown) => unknown) =>
    (req: unknown, ctx: { params: unknown }) =>
      handler(req, { params: ctx.params }, { userId: 'u1', teamId: 'team1' }),
}))
vi.mock('@/lib/authz/visibility', () => ({ canAccessContent: () => true }))
vi.mock('@/lib/auth', () => ({ getDraftAccessInfo: async () => ({ teamId: 'team1', ownerId: 'u1', campaignId: null }) }))
vi.mock('@/lib/brandkit/resolve', () => ({
  resolveBrandKit: async () => ({ id: 'kit', name: 'Kit', colors: [], fonts: [], logos: [], artifacts: [] }),
}))
vi.mock('@/lib/storage/minio', () => ({
  resolveExportUrl: async (k: string | null) => k,
  uploadObject: async () => {},
  exportKey: (kind: string, id: string) => `exports/${kind}-${id}.png`,
  BUCKET_EXPORTS: 'exports',
}))
vi.mock('@/lib/agent/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/agent/config')>()
  return { ...actual, isCliMode: () => false, pipelineMode: () => 'api' as const }
})
vi.mock('@/lib/agent/designAgent', () => ({ runDesignAgentRefine: h.refineApi }))
vi.mock('@/lib/agent/designAgentCli', () => ({ runDesignAgentCliRefine: vi.fn() }))
vi.mock('@/lib/agent/background', () => ({
  generateBackgroundForRefine: async () => ({ url: h.bgUrl, skip: h.bgUrl ? null : 'NOT_NEEDED', detail: null }),
}))
vi.mock('@/lib/renderer/domFacts', () => ({ extractDomFacts: async () => ({ elements: [] }) }))
vi.mock('@/lib/analytics/track', () => ({ track: async () => {} }))
vi.mock('@/lib/drafts/draftActions', () => ({
  claimDraftAction: h.claim,
  touchDraftAction: async () => {},
  startDraftAction: async (_d: string, _u: string, _t: string, _a: unknown, work: () => Promise<unknown>) => {
    await work()
  },
}))
vi.mock('@/lib/drafts/refineAttempt', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/drafts/refineAttempt')>()
  return {
    ...actual,
    runRefineAttempts: async (
      input: { model: unknown },
      deps: { runRefine: (r: { attempt: 1; model: unknown }) => Promise<string> },
    ) => {
      await deps.runRefine({ attempt: 1, model: input.model })
      return h.result
    },
  }
})
vi.mock('@/lib/drafts/revisions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/drafts/revisions')>()
  return {
    ...actual,
    commitDraftRevision: h.commit,
    recordRejectedRender: h.reject,
    renderDraftHtml: h.renderDraftHtml,
    findCommittedRevision: async () => ({
      revisionNumber: 2,
      htmlSnapshot: STORED,
      exportUrl: null,
      composition: STAMP,
      promptVersion: null,
      fontSet: null,
      model: null,
      modelSubstitutedFrom: null,
    }),
    restoreDraftToRevision: async () => {},
  }
})

const { POST: refine } = await import('@/app/api/drafts/[id]/refine/route')
const { POST: exportPost } = await import('@/app/api/generate/export/route')
const { POST: inlineEdit } = await import('@/app/api/drafts/[id]/inline-edit/route')
const { POST: restore } = await import('@/app/api/drafts/[id]/revisions/[rev]/restore/route')

type Handler = (req: unknown, ctx: unknown) => Promise<Response>
const ctx = { params: { id: 'd1' } } as never
const post = (body: Record<string, unknown>) =>
  (refine as unknown as Handler)(new Request('http://test/x', { method: 'POST', body: JSON.stringify(body) }), ctx)

function draft(over: Record<string, unknown> = {}) {
  return {
    id: 'd1',
    teamId: 'team1',
    htmlContent: STORED,
    composition: STAMP,
    postStyle: null,
    designModel: null,
    designModelSubstitutedFrom: null,
    pendingConflict: null,
    exportUrl: null,
    pendingAction: null,
    currentRevisionNumber: 2,
    brief: { id: 'b1', userId: 'u1', campaignId: null, brandKitId: null, aspectRatio: 'SQUARE', designMode: 'GENERATE' },
    ...over,
  }
}

beforeEach(() => {
  h.draft = draft()
  h.bgUrl = null
  h.updates = []
  h.result = { kind: 'accepted', html: BASE, refineCalls: 1, verifierCalls: 1, attempts: [] }
  for (const fn of [h.claim, h.commit, h.reject, h.refineApi, h.renderDraftHtml]) fn.mockReset()
  h.claim.mockResolvedValue({ action: 'REFINE', claimId: 'c1' })
  h.commit.mockResolvedValue({ revisionId: 'rev-3', exportKey: 'exports/r.png', revisionNumber: 3 })
  h.reject.mockResolvedValue({ revisionId: 'rej-1', exportKey: null })
  h.refineApi.mockResolvedValue('<html>reply</html>')
  h.renderDraftHtml.mockResolvedValue({ png: Buffer.from('png'), headlineCheck: null })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

describe('the placement error text', () => {
  it('is the spec text, verbatim', () => {
    expect(COMPOSITE_PLACEMENT_ERROR).toBe('The product screenshot could not be placed; nothing was changed')
    expect(new CompositePlacementError(new Error('why')).message).toBe(COMPOSITE_PLACEMENT_ERROR)
  })
})

describe('refine on a composite draft', () => {
  it('the model sees the document with no screenshot element and no token', async () => {
    expect((await post({ instruction: 'make the headline bigger' })).status).toBe(202)
    expect(h.refineApi).toHaveBeenCalledTimes(1)
    const opts = h.refineApi.mock.calls[0][0] as { userMessage: string; refine: { slimHtml: string } }
    for (const text of [opts.userMessage, opts.refine.slimHtml]) {
      expect(text).toContain('Hello')
      expect(text).not.toContain('data-composite')
      expect(text).not.toContain('__COMPOSITE_0__')
    }
  })

  it('the prompt names the stamped screen in canvas px, and keeps the screen empty', async () => {
    await post({ instruction: 'make the headline bigger' })
    const { systemPrompt } = h.refineApi.mock.calls[0][0] as { systemPrompt: string }
    // 17% to 89% of 1080 wide, 44% to 89% of 1080 high: the stamped rect, not the contract region.
    expect(systemPrompt).toContain('x 184 to 961, y 475 to 961')
    expect(systemPrompt).toContain('completely empty')
  })

  it('the commit carries the stamp with its composites (the writer then puts the element back)', async () => {
    await post({ instruction: 'make the headline bigger' })
    expect(h.commit).toHaveBeenCalledTimes(1)
    const args = h.commit.mock.calls[0][0] as { composition: typeof STAMP }
    expect(args.composition.composites?.[0].rect).toEqual(RECT)
    expect(args.composition.composites?.[0].source.key).toBe(KEY)
  })

  it('a refine that replaces the image commits a classic refine-replaced-image stamp with no composites', async () => {
    h.bgUrl = 'https://mock.invalid/new-bg.png'
    await post({ instruction: 'new background' })
    const args = h.commit.mock.calls[0][0] as { composition: Record<string, unknown> }
    expect(args.composition).toMatchObject({ appliedArchetype: 'classic', fallbackReason: 'refine-replaced-image' })
    expect(args.composition.composites).toBeUndefined()
  })

  it('a not-applied refine records the rejected render under the same stamp', async () => {
    h.result = {
      kind: 'not-applied',
      reason: 'missed',
      html: BASE,
      unusableHtml: null,
      diagnostics: { version: 1, refineCalls: 2, verifierCalls: 1, attempts: [], reasons: [] },
    }
    await post({ instruction: 'remove the footer' })
    const args = h.reject.mock.calls[0][0] as { composition: typeof STAMP }
    expect(args.composition.composites?.[0].rect).toEqual(RECT)
  })

  it('a placement failure fails the action with the named error text', async () => {
    h.commit.mockRejectedValue(new CompositePlacementError(new Error('covered')))
    await expect(post({ instruction: 'make the headline bigger' })).rejects.toThrow(
      'The product screenshot could not be placed; nothing was changed',
    )
  })

  it('a classic draft prompt and document are unchanged', async () => {
    h.draft = draft({ htmlContent: BASE, composition: null })
    await post({ instruction: 'make the headline bigger' })
    const opts = h.refineApi.mock.calls[0][0] as { userMessage: string; systemPrompt: string }
    expect(opts.userMessage).toContain('Hello')
    expect(opts.systemPrompt).not.toContain('completely empty')
  })
})

describe('the override on a composite draft', () => {
  it('commits under the stamp, and a placement failure answers 422 with the named error', async () => {
    h.draft = draft({
      pendingConflict: { conflictId: 'c1', pendingHtml: BASE, explanation: 'x', model: null, modelSubstitutedFrom: null },
    })
    expect((await post({ overrideConflictId: 'c1' })).status).toBe(200)
    expect((h.commit.mock.calls[0][0] as { composition: typeof STAMP }).composition.composites?.[0].rect).toEqual(RECT)

    h.commit.mockRejectedValue(new CompositePlacementError(new Error('covered')))
    const res = await post({ overrideConflictId: 'c1' })
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: COMPOSITE_PLACEMENT_ERROR, code: 'composite-not-placed' })
  })
})

describe('export and restore render with the stamp', () => {
  const exportReq = () =>
    (exportPost as unknown as Handler)(
      new Request('http://test/x', { method: 'POST', body: JSON.stringify({ draftId: 'd1' }) }),
      ctx,
    )

  it('export passes the draft stamp, and a placement failure answers 422 and writes nothing', async () => {
    expect((await exportReq()).status).toBe(200)
    const call = h.renderDraftHtml.mock.calls[0]
    expect(call[0]).toBe('d1')
    expect(call[2].composites[0].rect).toEqual(RECT)
    // 030 FR-04: an export checks no headline and leaves renderedText out of its write.
    expect(call[5]).toBeNull()
    expect(h.updates).toHaveLength(1)
    expect((h.updates[0] as { data: Record<string, unknown> }).data).not.toHaveProperty('renderedText')

    h.updates = []
    h.renderDraftHtml.mockRejectedValue(new CompositePlacementError(new Error('gone')))
    const res = await exportReq()
    expect(res.status).toBe(422)
    expect((await res.json()).error).toBe(COMPOSITE_PLACEMENT_ERROR)
    expect(h.updates).toEqual([])
  })

  it('a legacy restore re-render uses the revision stamp; a placement failure answers 422', async () => {
    const call = () =>
      (restore as unknown as Handler)(new Request('http://test/x', { method: 'POST' }), {
        params: { id: 'd1', rev: '2' },
      })
    expect((await call()).status).toBe(200)
    expect(h.renderDraftHtml.mock.calls[0][2].composites[0].rect).toEqual(RECT)
    // 030: the re-render checks no headline (the restored row's own stamp is carried).
    expect(h.renderDraftHtml.mock.calls[0][5]).toBeNull()

    h.renderDraftHtml.mockRejectedValue(new CompositePlacementError(new Error('gone')))
    const res = await call()
    expect(res.status).toBe(422)
    expect((await res.json()).code).toBe('composite-not-placed')
  })
})

describe('inline edit on a composite draft', () => {
  const edit = (html: string) =>
    (inlineEdit as unknown as Handler)(
      new Request('http://test/x', { method: 'POST', body: JSON.stringify({ html }) }),
      ctx,
    )

  it('commits under the stamp (the writer restores the canonical element), whatever the editor sent', async () => {
    h.draft = draft({ status: 'EXPORTED' })
    // The editor lost the element: only the text is sent.
    expect((await edit(BASE)).status).toBe(200)
    const args = h.commit.mock.calls[0][0] as { composition: typeof STAMP; html: string; width: number; height: number }
    expect(args.composition.composites?.[0].rect).toEqual(RECT)
    expect([args.width, args.height]).toEqual([1080, 1080])
  })

  it('a placement failure answers 422 with the named error', async () => {
    h.draft = draft({ status: 'EXPORTED' })
    h.commit.mockRejectedValue(new CompositePlacementError(new Error('covered')))
    const res = await edit(BASE)
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: COMPOSITE_PLACEMENT_ERROR, code: 'composite-not-placed' })
  })
})
