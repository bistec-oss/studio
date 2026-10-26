// 008 T7 — the refine route on the resolver (FR-08, FR-09, A6, A8, AC-19),
// plus the two other draft-action stamp writers outside the caption and
// revision stores: inline edit (A6) and retry (FR-08).
//
// The route resolves REFINE before its claim (no stamp tier; the system
// default follows the brief's design path), hands the ResolvedModel to both
// attempts, and stamps what it writes: the committed revision, the rejected
// render, and the conflict an Override later commits. Prisma, the attempt loop
// and the revision writers are faked; the resolver (policy.ts → decideModel)
// runs for real on a faked TeamModelPolicy row, in API mode.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  draft: null as null | Record<string, unknown>,
  policy: null as null | Record<string, unknown>,
  draftUpdate: vi.fn(),
  claim: vi.fn(),
  commit: vi.fn(),
  reject: vi.fn(),
  runRefineAttempts: vi.fn(),
  refineApi: vi.fn(),
  result: null as null | Record<string, unknown>,
  bgUrl: null as string | null,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    draft: { findUnique: async () => h.draft, update: h.draftUpdate, updateMany: h.draftUpdate },
    teamModelPolicy: { findUnique: async () => h.policy },
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
vi.mock('@/lib/brandkit/resolve', () => ({ resolveBrandKit: async () => ({ id: 'kit', name: 'Kit', colors: [], fonts: [], logos: [], artifacts: [] }) }))
vi.mock('@/lib/storage/minio', () => ({ resolveExportUrl: async (k: string | null) => k }))
// API mode, deterministically (the local .env may set CLI mode).
vi.mock('@/lib/agent/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/agent/config')>()
  return { ...actual, isCliMode: () => false, pipelineMode: () => 'api' as const }
})
vi.mock('@/lib/agent/designAgent', () => ({ runDesignAgentRefine: h.refineApi }))
vi.mock('@/lib/agent/designAgentCli', () => ({ runDesignAgentCliRefine: vi.fn() }))
vi.mock('@/lib/agent/background', () => ({
  generateBackgroundForRefine: async () =>
    h.bgUrl ? { url: h.bgUrl, skip: null, detail: null } : { url: null, skip: 'NOT_NEEDED', detail: null },
}))
vi.mock('@/lib/drafts/refineVerify', () => ({ verifyRefine: vi.fn(), VERIFIER_PROMPT_VERSION: 'test-verifier' }))
vi.mock('@/lib/agent/backgroundGeneration', () => ({ startBackgroundGeneration: async () => {} }))
vi.mock('@/lib/renderer/domFacts', () => ({ extractDomFacts: async () => ({ elements: [] }) }))
vi.mock('@/lib/drafts/draftActions', () => ({
  claimDraftAction: h.claim,
  touchDraftAction: async () => {},
  // Run the claimed action's work inline so its writes are observable.
  startDraftAction: async (_d: string, _u: string, _t: string, _a: unknown, work: () => Promise<unknown>) => {
    await work()
  },
}))
// The attempt loop: one runRefine (so the model reaching the runner is
// observable), then the scripted result. settleRefine is the real one.
vi.mock('@/lib/drafts/refineAttempt', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/drafts/refineAttempt')>()
  return {
    ...actual,
    runRefineAttempts: async (
      input: { model: unknown },
      deps: { runRefine: (r: { attempt: 1; model: unknown }) => Promise<string> },
    ) => {
      h.runRefineAttempts(input)
      await deps.runRefine({ attempt: 1, model: input.model })
      return h.result
    },
  }
})
vi.mock('@/lib/drafts/revisions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/drafts/revisions')>()
  return { ...actual, commitDraftRevision: h.commit, recordRejectedRender: h.reject }
})

const { POST: refine } = await import('@/app/api/drafts/[id]/refine/route')

const ctx = { params: { id: 'd1' } } as never
const post = (body: Record<string, unknown>) =>
  refine(new Request('http://test/x', { method: 'POST', body: JSON.stringify(body) }) as never, ctx) as Promise<Response>

const SONNET = 'claude-sonnet-5-5'
const HAIKU = 'claude-haiku-4-5'
const OPUS = 'claude-opus-5-5'

function draft(over: Record<string, unknown> = {}) {
  return {
    id: 'd1',
    teamId: 'team1',
    htmlContent: '<html>current</html>',
    designModel: 'claude-opus-5-5',
    designModelSubstitutedFrom: null,
    pendingConflict: null,
    brief: { id: 'b1', userId: 'u1', campaignId: null, brandKitId: null, aspectRatio: 'SQUARE', designMode: 'GENERATE' },
    ...over,
  }
}

const NOT_APPLIED = {
  kind: 'not-applied',
  reason: 'missed twice',
  html: '<html>rejected</html>',
  unusableHtml: null,
  diagnostics: { version: 1, refineCalls: 2, verifierCalls: 0, attempts: [], reasons: [] },
}

beforeEach(() => {
  h.draft = draft()
  h.policy = null
  h.bgUrl = null
  h.result = { kind: 'accepted', html: '<html>refined</html>', refineCalls: 1, verifierCalls: 0, attempts: [] }
  for (const fn of [h.draftUpdate, h.claim, h.commit, h.reject, h.runRefineAttempts, h.refineApi]) fn.mockReset()
  h.claim.mockResolvedValue({ action: 'REFINE', claimId: 'c1' })
  h.draftUpdate.mockResolvedValue({ count: 1 })
  h.commit.mockResolvedValue({ revisionId: 'rev-2', exportKey: 'exports/r.png', revisionNumber: 2 })
  h.reject.mockResolvedValue({ revisionId: 'rej-1', exportKey: null })
  h.refineApi.mockResolvedValue('<html>reply</html>')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

describe('refine resolves REFINE before its claim (A8, no stamp tier)', () => {
  it('Path B → Sonnet: both the attempt loop and the runner get the ResolvedModel; the commit is stamped with it', async () => {
    expect((await post({ instruction: 'darker' })).status).toBe(202)
    const model = h.runRefineAttempts.mock.calls[0][0].model
    expect(model).toMatchObject({ surface: 'REFINE', key: 'SONNET', arg: SONNET, source: 'system' })
    expect(h.refineApi.mock.calls[0][0].model).toBe(model)
    expect(h.commit).toHaveBeenCalledTimes(1)
    expect(h.commit.mock.calls[0][0].model).toBe(model)
  })

  it("Path A → Haiku; the draft's own design stamp (Opus) is NOT a tier for refine", async () => {
    h.draft = draft({ brief: { ...(draft().brief as object), designMode: 'TEMPLATE' } })
    await post({ instruction: 'darker' })
    expect(h.commit.mock.calls[0][0].model).toMatchObject({ key: 'HAIKU', arg: HAIKU, substitutedFrom: null })
  })

  it('a team REFINE default applies on both paths', async () => {
    h.policy = {
      allowedModels: ['HAIKU', 'SONNET', 'OPUS'],
      requirePersonalTokenForGated: false,
      defaults: [{ surface: 'REFINE', model: 'OPUS' }],
    }
    await post({ instruction: 'darker' })
    expect(h.commit.mock.calls[0][0].model).toMatchObject({ key: 'OPUS', arg: OPUS, source: 'team' })
  })

  it('a team with nothing allowed is a 422 with the resolver code; nothing is claimed or written', async () => {
    h.policy = { allowedModels: [], requirePersonalTokenForGated: false, defaults: [] }
    const res = await post({ instruction: 'darker' })
    expect(res.status).toBe(422)
    expect((await res.json()).code).toBe('NO_ALLOWED_MODEL')
    expect(h.claim).not.toHaveBeenCalled()
    expect(h.commit).not.toHaveBeenCalled()
    expect(h.draftUpdate).not.toHaveBeenCalled()
  })

  it('a twice-failed refine records the rejected render with the attempt model', async () => {
    h.result = NOT_APPLIED
    await post({ instruction: 'darker' })
    expect(h.reject).toHaveBeenCalledTimes(1)
    expect(h.reject.mock.calls[0][0].model).toMatchObject({ key: 'SONNET', arg: SONNET })
    expect(h.commit).not.toHaveBeenCalled()
  })

  it('a conflict stores the refine model (and its substitution) with pendingConflict', async () => {
    h.policy = { allowedModels: ['HAIKU', 'SONNET'], requirePersonalTokenForGated: false, defaults: [{ surface: 'REFINE', model: 'HAIKU' }] }
    h.result = { kind: 'conflict', conflict: { conflict: true, explanation: 'off-brand', pendingHtml: '<html>p</html>' }, refineCalls: 1, verifierCalls: 0 }
    await post({ instruction: 'darker' })
    const stored = h.draftUpdate.mock.calls[0][0].data.pendingConflict
    expect(stored).toMatchObject({ explanation: 'off-brand', model: HAIKU, modelSubstitutedFrom: null })
    expect(h.commit).not.toHaveBeenCalled()
  })

  // 019 AC-04: every content write of the refine run carries its claim.
  it('the verified commit, the rejected render and the conflict write all carry the claim (a lost conflict claim logs, never throws)', async () => {
    await post({ instruction: 'darker' })
    expect(h.commit.mock.calls[0][0].claim).toEqual({ action: 'REFINE', claimId: 'c1' })

    h.result = NOT_APPLIED
    await post({ instruction: 'darker' })
    expect(h.reject.mock.calls[0][0].claim).toEqual({ action: 'REFINE', claimId: 'c1' })

    h.result = { kind: 'conflict', conflict: { conflict: true, explanation: 'off-brand', pendingHtml: '<html>p</html>' }, refineCalls: 1, verifierCalls: 0 }
    await post({ instruction: 'darker' })
    expect(h.draftUpdate.mock.calls[0][0].where).toEqual({ id: 'd1', pendingAction: 'REFINE', pendingActionClaimId: 'c1' })

    h.draftUpdate.mockResolvedValue({ count: 0 })
    const warn = vi.spyOn(console, 'warn')
    await expect(post({ instruction: 'darker' })).resolves.toBeDefined()
    expect(warn.mock.calls.some((c) => String(c[0]).includes('no longer holds the claim'))).toBe(true)
  })
})

describe('Override commits with the model the conflict recorded (A6)', () => {
  it('pendingConflict.model (with its substitution) is the commit stamp; nothing is resolved', async () => {
    h.policy = { allowedModels: [], requirePersonalTokenForGated: false, defaults: [] } // would 422 if resolved
    h.draft = draft({
      pendingConflict: { conflictId: 'c1', pendingHtml: '<html>p</html>', explanation: 'x', model: SONNET, modelSubstitutedFrom: 'OPUS' },
    })
    const res = await post({ overrideConflictId: 'c1' })
    expect(res.status).toBe(200)
    expect(h.claim).not.toHaveBeenCalled()
    expect(h.commit.mock.calls[0][0]).toMatchObject({
      html: '<html>p</html>',
      model: { model: SONNET, modelSubstitutedFrom: 'OPUS' },
    })
  })

  it('a conflict that recorded a null model stays null (it was recorded, as unknown)', async () => {
    h.draft = draft({
      pendingConflict: { conflictId: 'c1', pendingHtml: '<html>p</html>', explanation: 'x', model: null, modelSubstitutedFrom: null },
    })
    await post({ overrideConflictId: 'c1' })
    expect(h.commit.mock.calls[0][0].model).toEqual({ model: null, modelSubstitutedFrom: null })
  })
})

// ── inline edit carries the draft's design stamp forward (A6, AC-07) ────────

describe('inline edit (A6)', () => {
  it("a whole-document edit commits with the draft's current designModel, not null and not resolved", async () => {
    const { POST: inlineEdit } = await import('@/app/api/drafts/[id]/inline-edit/route')
    h.policy = { allowedModels: [], requirePersonalTokenForGated: false, defaults: [] } // would fail if resolved
    h.draft = draft({ status: 'EXPORTED', pendingAction: null, designModel: OPUS, designModelSubstitutedFrom: 'SONNET' })
    const res = (await inlineEdit(
      new Request('http://test/x', { method: 'POST', body: JSON.stringify({ html: '<html><body>edited</body></html>' }) }) as never,
      ctx,
    )) as Response
    expect(res.status).toBe(200)
    expect(h.commit.mock.calls[0][0].model).toEqual({ model: OPUS, modelSubstitutedFrom: 'SONNET' })
  })
})

describe('retry (FR-08)', () => {
  it('clears headlineModel / headlineModelSubstitutedFrom together with the headline', async () => {
    const { POST: retry } = await import('@/app/api/drafts/[id]/retry/route')
    h.draft = draft({ status: 'FAILED', headline: 'old', headlineModel: SONNET })
    const res = (await retry(new Request('http://test/x', { method: 'POST' }) as never, ctx)) as Response
    expect(res.status).toBe(202)
    expect(h.draftUpdate.mock.calls[0][0].data).toMatchObject({
      headline: null,
      headlineModel: null,
      headlineModelSubstitutedFrom: null,
    })
  })
})

// ── 009 FR-12: every writer carries the draft's composition stamp ───────────
// (T5 re-stamps a refine that replaced the hero image; here a refine only
// carries, so it never drops the stamp.)

describe('the composition stamp is carried by refine, reject, Override and inline edit (009 FR-12)', () => {
  const KEPT = { requestedArchetype: 'editorial-split', appliedArchetype: 'editorial-split', contractVersion: 1, imageQuality: 'default' }

  it('a verified refine commit carries the draft stamp', async () => {
    h.draft = draft({ composition: KEPT })
    await post({ instruction: 'darker' })
    expect(h.commit.mock.calls[0][0].composition).toEqual(KEPT)
  })

  it('a rejected render carries it too', async () => {
    h.draft = draft({ composition: KEPT })
    h.result = NOT_APPLIED
    await post({ instruction: 'darker' })
    expect(h.reject.mock.calls[0][0].composition).toEqual(KEPT)
  })

  it('an Override commits with it', async () => {
    h.draft = draft({
      composition: KEPT,
      pendingConflict: { conflictId: 'c1', pendingHtml: '<html>p</html>', explanation: 'x', model: SONNET, modelSubstitutedFrom: null },
    })
    await post({ overrideConflictId: 'c1' })
    expect(h.commit.mock.calls[0][0].composition).toEqual(KEPT)
  })

  it('an inline edit commits with it', async () => {
    const { POST: inlineEdit } = await import('@/app/api/drafts/[id]/inline-edit/route')
    h.draft = draft({ composition: KEPT, status: 'EXPORTED', pendingAction: null })
    await inlineEdit(
      new Request('http://test/x', { method: 'POST', body: JSON.stringify({ html: '<html><body>edited</body></html>' }) }) as never,
      ctx,
    )
    expect(h.commit.mock.calls[0][0].composition).toEqual(KEPT)
  })

  it('a pre-009 draft (no stamp) and a corrupt one both carry null: unknown is honest', async () => {
    h.draft = draft()
    await post({ instruction: 'darker' })
    expect(h.commit.mock.calls[0][0].composition).toBeNull()
    h.commit.mockClear()
    h.draft = draft({ composition: { appliedArchetype: 'bogus' } })
    await post({ instruction: 'darker' })
    expect(h.commit.mock.calls[0][0].composition).toBeNull()
  })
})

// ── 009 FR-13: refine carries the contract and re-stamps a replaced image ───

describe('refine and the hero contract (009 FR-13, AC-17)', () => {
  const KEPT = { requestedArchetype: 'editorial-split', appliedArchetype: 'editorial-split', contractVersion: 1, imageQuality: 'high' }
  const CLASSIC = { requestedArchetype: 'classic', appliedArchetype: 'classic', contractVersion: null, imageQuality: 'default' }
  const systemPrompt = () => h.refineApi.mock.calls[0][0].systemPrompt as string

  it('a kept draft gets the stamped contract in the refine system prompt, at the stamped version and size', async () => {
    h.draft = draft({ composition: KEPT })
    await post({ instruction: 'darker' })
    expect(systemPrompt()).toContain('This post uses the Editorial split layout (contract v1)')
    expect(systemPrompt()).toContain('the left 50% of the frame, full height')
  })

  it('a PORTRAIT draft resolves its own size: the top region, not the left one', async () => {
    h.draft = draft({
      composition: { ...KEPT, requestedArchetype: 'product-showcase', appliedArchetype: 'product-showcase' },
      brief: { id: 'b1', userId: 'u1', campaignId: null, brandKitId: null, aspectRatio: 'PORTRAIT', designMode: 'GENERATE' },
    })
    await post({ instruction: 'darker' })
    expect(systemPrompt()).toContain('the top 38% of the frame')
  })

  it('a classic, a pre-009 and an unresolvable stamp get no contract block', async () => {
    for (const composition of [
      CLASSIC,
      undefined,
      { ...KEPT, contractVersion: 9 },
      { ...KEPT, requestedArchetype: 'gone', appliedArchetype: 'gone' },
    ]) {
      h.refineApi.mockClear()
      h.draft = draft(composition === undefined ? {} : { composition })
      await post({ instruction: 'darker' })
      expect(systemPrompt()).not.toContain('This post uses the')
    }
  })

  it('a refine that made a new background re-stamps a kept draft classic with refine-replaced-image (requested and quality kept)', async () => {
    h.draft = draft({ composition: KEPT })
    h.bgUrl = 'http://minio/images/new.png'
    await post({ instruction: 'change the background to a city' })
    expect(h.commit.mock.calls[0][0].composition).toEqual({
      requestedArchetype: 'editorial-split',
      appliedArchetype: 'classic',
      contractVersion: null,
      fallbackReason: 'refine-replaced-image',
      imageQuality: 'high',
    })
  })

  it('the rejected render of such a refine carries the same re-stamp', async () => {
    h.draft = draft({ composition: KEPT })
    h.bgUrl = 'http://minio/images/new.png'
    h.result = NOT_APPLIED
    await post({ instruction: 'change the background to a city' })
    expect(h.reject.mock.calls[0][0].composition).toMatchObject({ appliedArchetype: 'classic', fallbackReason: 'refine-replaced-image' })
  })

  it('a refine with no new background carries the stamp; a classic draft keeps its stamp even with one', async () => {
    h.draft = draft({ composition: KEPT })
    await post({ instruction: 'darker' })
    expect(h.commit.mock.calls[0][0].composition).toEqual(KEPT)
    h.commit.mockClear()
    h.draft = draft({ composition: CLASSIC })
    h.bgUrl = 'http://minio/images/new.png'
    await post({ instruction: 'change the background to a city' })
    expect(h.commit.mock.calls[0][0].composition).toEqual(CLASSIC)
  })

  it('a pre-009 draft stays null when the background is replaced (no stamp is invented)', async () => {
    h.draft = draft()
    h.bgUrl = 'http://minio/images/new.png'
    await post({ instruction: 'change the background to a city' })
    expect(h.commit.mock.calls[0][0].composition).toBeNull()
  })
})
