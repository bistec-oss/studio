import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// 012 T5: the caption writers (FR-07/FR-09/FR-10). writeCaptions' logging and
// whole-reply failure mapping; the required headline (A6) on the async and
// sync generation paths; retry resetting the caption rows; and
// regenerate-design's Topic fallback. Prisma, the provider and the design
// runners are faked; the extractor, the caption store and generateDraft run
// for real — and so does the 008 resolver (resolveModel → decideModel), on the
// faked TeamModelPolicy row (API mode, so no credential query).

const h = vi.hoisted(() => {
  const db = {
    draft: null as null | Record<string, unknown>,
    draftCreates: [] as Array<Record<string, unknown>>,
    draftUpdates: [] as Array<{ where: unknown; data: Record<string, unknown> }>,
    draftUpdateManys: [] as Array<{ where: unknown; data: Record<string, unknown> }>,
    captionUpdateManys: [] as Array<{ where: Record<string, unknown>; data: Record<string, unknown> }>,
    revisionCreates: [] as Array<Record<string, unknown>>,
    // 008: the team's stored model policy (null = no row, the A2 defaults).
    policy: null as null | Record<string, unknown>,
  }
  const tx = {
    teamModelPolicy: { findUnique: async () => db.policy },
    // credentialTier's query in CLI mode — importing @prisma/client loads the
    // local .env, which can set DESIGN_PROVIDER=cli. No personal token, so
    // 'team'; either mode resolves the same entries here (cliArg = apiId).
    userClaudeToken: { findFirst: async () => null },
    // 024: the CAPTION surface reads the team's caption route (never chosen here).
    team: { findUnique: async () => null },
    draft: {
      findUnique: async () => db.draft,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        db.draftCreates.push(data)
        return { id: 'd-new', ...data }
      },
      update: async (args: { where: unknown; data: Record<string, unknown> }) => {
        db.draftUpdates.push(args)
        return { id: 'd1', ...args.data }
      },
      updateMany: async (args: { where: unknown; data: Record<string, unknown> }) => {
        db.draftUpdateManys.push(args)
        return { count: 1 }
      },
    },
    draftCaption: {
      updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        db.captionUpdateManys.push(args)
        return { count: 1 }
      },
    },
    draftRevision: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        db.revisionCreates.push(data)
        return { id: 'rev' }
      },
      findFirst: async () => ({ revisionNumber: 1 }),
    },
  }
  const client = {
    ...tx,
    $transaction: async (arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : (arg as (t: typeof tx) => Promise<unknown>)(tx),
  }
  return {
    db,
    client,
    reply: '' as string,
    providerError: null as Error | null,
    pathB: vi.fn(async (..._args: unknown[]) => ({
      htmlContent: '<html>b</html>',
      exportUrl: 'exports/b.png',
      backgroundImageUrl: null,
      background: { url: null, skip: 'NOT_NEEDED' },
    })),
    startBackgroundGeneration: vi.fn(async (..._args: unknown[]) => {}),
  }
})
const db = h.db

vi.mock('@/lib/prisma', () => ({ prisma: h.client }))
vi.mock('@/lib/renderer/fontSet', () => ({ getFontSetId: () => 'fonts-test' }))
vi.mock('@/lib/brandkit/resolve', () => ({ resolveBrandKit: async () => ({ id: 'kit', name: 'Kit' }) }))
vi.mock('@/lib/campaign/briefing', () => ({ getActiveCampaignBriefing: async () => null }))
vi.mock('@/providers/registry', () => ({
  resolveCopyProvider: async () => ({
    generateCaptions: async (_b: unknown, _t: unknown, model: { arg: string }) => {
      if (h.providerError) throw h.providerError
      return { raw: h.reply, modelId: model.arg, route: null }
    },
  }),
}))
vi.mock('@/lib/agent/pathA', () => ({
  runPathADesign: async () => ({ htmlContent: '<html>a</html>', exportUrl: 'exports/a.png' }),
  assertTemplateMatchesBrief: () => {},
}))
vi.mock('@/lib/agent/pathB', () => ({ runPathBDesign: h.pathB }))
// 027: the facts check has its own tests; here it is a clear result and a no-op refresh.
vi.mock('@/lib/factsCheck/refresh', () => ({
  computeFactsCheck: async () => ({ v: 1, status: 'clear', checkedAt: '2026-10-24T00:00:00.000Z', flagged: [] }),
  refreshFactsCheck: async () => {},
}))
vi.mock('@/lib/api/handler', () => ({
  withTeamAuth:
    (handler: (req: unknown, ctx: { params: unknown }, user: unknown) => unknown) =>
    (req: unknown, ctx: { params: unknown }) =>
      handler(req, { params: ctx.params }, { userId: 'u1', teamId: 'team1' }),
}))
vi.mock('@/lib/authz/visibility', () => ({ canAccessContent: () => true }))
vi.mock('@/lib/agent/backgroundGeneration', () => ({ startBackgroundGeneration: h.startBackgroundGeneration }))
vi.mock('@/lib/drafts/draftActions', () => ({
  claimDraftAction: async () => ({ action: 'REGENERATE_COPY', claimId: 'c1' }),
  startDraftAction: async (_d: string, _u: string, _t: string, _a: unknown, work: () => Promise<unknown>) => {
    await work()
  },
}))

const { writeCaptions, requireHeadline, HeadlineMissingError, GENERATION_TARGETS } = await import(
  '@/lib/captions/generate'
)
const { humanizeGenerationError } = await import('@/lib/agent/generationErrors')
const { createPendingDraft, runGenerationForDraft, generateDraftForBrief } = await import('@/lib/agent/generateDraft')
const { POST: retry } = await import('@/app/api/drafts/[id]/retry/route')
const { POST: regenerateDesign } = await import('@/app/api/drafts/[id]/regenerate-design/route')
const { CAPTION_PROMPT_VERSION } = await import('@/lib/agent/prompts/caption')
const { decideModel } = await import('@/lib/models/resolve')
const { DEFAULT_POLICY } = await import('@/lib/models/policyRules')

// A CAPTION model as the server resolves it for a team with no saved policy.
const captionModel = (() => {
  const r = decideModel('CAPTION', { policy: DEFAULT_POLICY, credential: 'n/a', mode: 'api' })
  if (!r.ok) throw new Error(r.message)
  return r.resolved
})()
// A saved policy row (TeamModelPolicy + its defaults), as loadTeamPolicy reads it.
const policyRow = (allowedModels: string[], defaults: Array<{ surface: string; model: string }> = []) => ({
  allowedModels,
  requirePersonalTokenForGated: false,
  defaults,
})

const SENTENCE = (reason: string) => `The caption reply had no usable headline (${reason}). Retry to generate again.`

const FULL = { headline: 'Applications are open', instagram: 'IG text', linkedin: 'LI text' }
const json = (o: Record<string, unknown>) => JSON.stringify(o)

const brief = {
  id: 'b1',
  teamId: 'team1',
  userId: 'u1',
  topic: 'The brief topic',
  campaignId: null,
  brandKitId: null,
  designMode: 'GENERATE',
  aspectRatio: 'SQUARE',
  copyProviderKey: null,
} as never
const actor = { userId: 'u1', teamId: 'team1', source: 'web' as const }

type ConsoleSpy = { mock: { calls: unknown[][] }; mockRestore: () => void }
let info: ConsoleSpy
let warn: ConsoleSpy
const logged = (spy: ConsoleSpy): string[] => spy.mock.calls.map((c) => String(c[0]))

beforeEach(() => {
  db.draft = null
  db.draftCreates = []
  db.draftUpdates = []
  db.draftUpdateManys = []
  db.captionUpdateManys = []
  db.revisionCreates = []
  db.policy = null
  h.reply = json(FULL)
  h.providerError = null
  h.pathB.mockClear()
  h.startBackgroundGeneration.mockClear()
  info = vi.spyOn(console, 'info').mockImplementation(() => {})
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  info.mockRestore()
  warn.mockRestore()
})

const provider = () => ({
  generateCaptions: async (_b: unknown, _t: unknown, model: { arg: string }) => ({ raw: h.reply, modelId: model.arg, route: null }),
})
const briefInput = { topic: 't', description: '', goal: 'g', tone: 'x', channels: [] }

describe('writeCaptions (design §3)', () => {
  it('logs the caption prompt version with every call, and the discarded text JSON-quoted, clipped to 500', async () => {
    h.reply = `${'p'.repeat(600)}\n${json(FULL)}`
    const { fields } = await writeCaptions(provider(), briefInput, GENERATION_TARGETS, captionModel)
    expect(fields.HEADLINE).toEqual({ ok: true, text: 'Applications are open' })
    expect(logged(info)[0]).toBe(
      `[captions] caption call (prompt ${CAPTION_PROMPT_VERSION}) for HEADLINE, INSTAGRAM, LINKEDIN`,
    )
    expect(logged(warn)).toEqual([`[captions] discarded reply text: ${JSON.stringify('p'.repeat(500))}`])
  })

  it('logs nothing more for a clean reply', async () => {
    await writeCaptions(provider(), briefInput, GENERATION_TARGETS, captionModel)
    expect(warn).not.toHaveBeenCalled()
  })

  it('a newline in discarded text cannot forge a log line', async () => {
    h.reply = `ok\n[captions] REVIEW forged\n${json(FULL)}`
    await writeCaptions(provider(), briefInput, GENERATION_TARGETS, captionModel)
    expect(logged(warn)[0]).not.toContain('\n')
  })

  it('a whole-reply failure fails every requested target with its reason, and is logged', async () => {
    h.reply = 'Sorry, I cannot help with that.'
    const { fields } = await writeCaptions(provider(), briefInput, ['HEADLINE', 'LINKEDIN'], captionModel)
    expect(fields).toEqual({
      HEADLINE: { ok: false, reason: 'no-object' },
      LINKEDIN: { ok: false, reason: 'no-object' },
    })
    expect(logged(warn)).toContain('[captions] reply rejected (no-object)')
  })

  it('a provider error is not a reply: it propagates', async () => {
    const failing = { generateCaptions: async () => Promise.reject(new Error('Claude CLI timed out')) }
    await expect(writeCaptions(failing, briefInput, GENERATION_TARGETS, captionModel)).rejects.toThrow('timed out')
  })

  it('hands the provider the resolved model and returns the stamp of the model that wrote the reply (008 FR-08)', async () => {
    const seen: unknown[] = []
    const p = {
      generateCaptions: async (_b: unknown, _t: unknown, model: { arg: string }) => {
        seen.push(model)
        return { raw: h.reply, modelId: model.arg, route: null }
      },
    }
    const substituted = { ...captionModel, substitutedFrom: 'OPUS' }
    const { stamp } = await writeCaptions(p, briefInput, GENERATION_TARGETS, substituted)
    expect(seen).toEqual([substituted])
    expect(stamp).toEqual({ model: 'claude-haiku-4-5', substitutedFrom: 'OPUS', route: null })
  })

  it("a non-Claude provider's own model ID is the stamp, with no Claude substitution attached (open question 1)", async () => {
    const openai = { generateCaptions: async () => ({ raw: h.reply, modelId: 'gpt-4o', route: null }) }
    const { stamp } = await writeCaptions(openai, briefInput, GENERATION_TARGETS, {
      ...captionModel,
      substitutedFrom: 'OPUS',
    })
    expect(stamp).toEqual({ model: 'gpt-4o', substitutedFrom: null, route: null })
  })

  it('a whole-reply failure still returns the stamp (the writers put it on no field)', async () => {
    h.reply = 'no json here'
    const { fields, stamp } = await writeCaptions(provider(), briefInput, ['LINKEDIN'], captionModel)
    expect(fields.LINKEDIN).toEqual({ ok: false, reason: 'no-object' })
    expect(stamp.model).toBe('claude-haiku-4-5')
  })
})

describe('HeadlineMissingError (A6, FR-09)', () => {
  it('requireHeadline returns a valid headline and throws the FR-09 sentence otherwise', () => {
    expect(requireHeadline({ HEADLINE: { ok: true, text: 'H' } })).toBe('H')
    expect(() => requireHeadline({ HEADLINE: { ok: false, reason: 'over-limit (120 / 100)' } })).toThrow(
      SENTENCE('over-limit (120 / 100)')
    )
    expect(() => requireHeadline({})).toThrow(HeadlineMissingError)
  })

  it('humanizeGenerationError maps it to the FR-09 sentence', () => {
    expect(humanizeGenerationError(new HeadlineMissingError('missing'))).toBe(SENTENCE('missing'))
  })
})

describe('createPendingDraft', () => {
  it('creates the draft with one PENDING row per registry channel, in the same (nested) write', async () => {
    await createPendingDraft(brief)
    expect(db.draftCreates).toHaveLength(1)
    expect(db.draftCreates[0]).toMatchObject({
      status: 'IN_PROGRESS',
      captions: {
        create: [
          { channel: 'INSTAGRAM', status: 'PENDING' },
          { channel: 'LINKEDIN', status: 'PENDING' },
        ],
      },
    })
    expect(db.draftCreates[0]).not.toHaveProperty('headline')
  })
})

describe('runGenerationForDraft (async)', () => {
  beforeEach(() => {
    db.draft = { id: 'd1', templateId: null, brief }
  })

  it('writes every row and the headline, then designs from the headline — never a caption', async () => {
    await runGenerationForDraft('d1', actor)
    expect(db.captionUpdateManys.map((u) => [u.where, u.data.status, u.data.text])).toEqual([
      [{ draftId: 'd1', channel: 'INSTAGRAM', status: 'PENDING' }, 'READY', 'IG text'],
      [{ draftId: 'd1', channel: 'LINKEDIN', status: 'PENDING' }, 'READY', 'LI text'],
    ])
    expect(db.draftUpdateManys).toEqual([
      {
        where: { id: 'd1' },
        data: {
          headline: 'Applications are open',
          headlineModel: 'claude-haiku-4-5',
          headlineModelSubstitutedFrom: null,
        headlineRoute: null,
        },
      },
    ])
    expect(h.pathB).toHaveBeenCalledTimes(1)
    expect(h.pathB.mock.calls[0][2]).toBe('Applications are open')
    expect(JSON.stringify(h.pathB.mock.calls[0])).not.toContain('IG text')
    expect(db.draftUpdates.at(-1)!.data).toMatchObject({ status: 'EXPORTED' })
  })

  it('no valid headline ⇒ FAILED with the FR-09 sentence, the validated captions kept, no design run', async () => {
    h.reply = json({ instagram: 'IG text', linkedin: 'LI text' })
    await runGenerationForDraft('d1', actor)
    expect(h.pathB).not.toHaveBeenCalled()
    expect(db.captionUpdateManys.map((u) => u.data.status)).toEqual(['READY', 'READY'])
    const failed = db.draftUpdates.at(-1)!.data
    expect(failed).toMatchObject({ status: 'FAILED', failureReason: SENTENCE('missing') })
    // Only registry rows still PENDING are failed; the READY ones above, and a
    // hidden WhatsApp row (026 FR-05), are untouched.
    expect(failed.captions).toEqual({
      updateMany: {
        where: { status: 'PENDING', channel: { in: ['INSTAGRAM', 'LINKEDIN'] } },
        data: { status: 'FAILED', text: '', failureReason: 'generation failed' },
      },
    })
    expect(db.draftUpdates.some((u) => u.data.status === 'EXPORTED')).toBe(false)
  })

  it('a partial reply stores the failed channel as FAILED with no text, and still designs', async () => {
    h.reply = json({ headline: 'H', instagram: 'IG text' })
    await runGenerationForDraft('d1', actor)
    const li = db.captionUpdateManys.find((u) => u.where.channel === 'LINKEDIN')!
    expect(li.data).toMatchObject({ status: 'FAILED', text: '', failureReason: 'missing' })
    expect(h.pathB).toHaveBeenCalledTimes(1)
  })

  it('the caption call itself failing ⇒ FAILED, and the still-PENDING rows fail with the draft', async () => {
    h.providerError = new Error('No Claude credential available')
    await runGenerationForDraft('d1', actor)
    expect(db.captionUpdateManys).toHaveLength(0)
    const failed = db.draftUpdates.at(-1)!.data
    expect(failed.status).toBe('FAILED')
    expect(failed.failureReason).toMatch(/No Claude token is connected/)
    expect(failed.captions).toMatchObject({ updateMany: { where: { status: 'PENDING' } } })
  })
})

describe('generateDraftForBrief (sync: scheduler, MCP, ACP)', () => {
  it('throws HeadlineMissingError before any design is paid for, and creates no draft', async () => {
    h.reply = json({ headline: '   ', instagram: 'IG text', linkedin: 'LI text' })
    await expect(generateDraftForBrief(brief, { userId: null, teamId: 'team1', source: 'scheduler' })).rejects.toThrow(
      SENTENCE('empty'),
    )
    expect(h.pathB).not.toHaveBeenCalled()
    expect(db.draftCreates).toHaveLength(0)
  })

  it('creates the draft with its headline, two rows and revision 1 in one transaction', async () => {
    h.reply = json({ headline: 'H', instagram: 'IG text' })
    await generateDraftForBrief(brief, { userId: null, teamId: 'team1', source: 'scheduler' })
    expect(h.pathB.mock.calls[0][2]).toBe('H')
    expect(db.draftCreates[0]).toMatchObject({
      headline: 'H',
      status: 'EXPORTED',
      captions: {
        create: [
          { channel: 'INSTAGRAM', text: 'IG text', status: 'READY', failureReason: null },
          { channel: 'LINKEDIN', text: '', status: 'FAILED', failureReason: 'missing' },
        ],
      },
    })
    expect(db.revisionCreates).toHaveLength(1)
  })
})

// ── 008: the generation's models and stamps (FR-08, FR-10, FR-11, AC-07) ──────

describe('generation on the resolver (008)', () => {
  const pathBModel = () => h.pathB.mock.calls[0][5] as { key: string; arg: string; source: string; substitutedFrom: string | null }

  beforeEach(() => {
    db.draft = { id: 'd1', templateId: null, brief }
  })

  it('async: CAPTION and DESIGN_FREEFORM resolve to the system defaults with no policy row, and stamp what ran', async () => {
    h.reply = json({ headline: 'H', instagram: 'IG text' })
    await runGenerationForDraft('d1', actor)
    // Caption stamps on the ok rows only; the failed (text-less) row has none.
    const byChannel = Object.fromEntries(
      db.captionUpdateManys.map((u) => [u.where.channel, u.data]),
    )
    expect(byChannel.INSTAGRAM).toMatchObject({
      status: 'READY',
      model: 'claude-haiku-4-5',
      modelSubstitutedFrom: null,
    })
    expect(byChannel.LINKEDIN).toMatchObject({
      status: 'FAILED',
      model: null,
      modelSubstitutedFrom: null,
    })
    expect(db.draftUpdateManys[0].data).toMatchObject({
      headline: 'H',
      headlineModel: 'claude-haiku-4-5',
    })
    // The design ran on the system default and its stamp went to v1 + the draft.
    expect(pathBModel()).toMatchObject({ key: 'SONNET', arg: 'claude-sonnet-5-5', source: 'system', substitutedFrom: null })
    expect(db.revisionCreates[0]).toMatchObject({ model: 'claude-sonnet-5-5', modelSubstitutedFrom: null })
    expect(db.draftUpdates.at(-1)!.data).toMatchObject({
      status: 'EXPORTED',
      designModel: 'claude-sonnet-5-5',
      designModelSubstitutedFrom: null,
    })
    // A Draft write never carries the revision's column names.
    expect(db.draftUpdates.at(-1)!.data).not.toHaveProperty('model')
  })

  it("the team default applies when the brief has no request", async () => {
    db.policy = policyRow(['HAIKU', 'SONNET', 'OPUS'], [{ surface: 'DESIGN_FREEFORM', model: 'OPUS' }])
    await runGenerationForDraft('d1', actor)
    expect(pathBModel()).toMatchObject({ key: 'OPUS', source: 'team' })
    expect(db.revisionCreates[0]).toMatchObject({ model: 'claude-opus-5-5' })
  })

  it("a STORED Brief request that is still allowed runs as the request", async () => {
    db.draft = { id: 'd1', templateId: null, brief: { ...(brief as object), captionModel: 'SONNET', designModel: 'OPUS' } }
    await runGenerationForDraft('d1', actor)
    expect(db.captionUpdateManys[0].data).toMatchObject({ model: 'claude-sonnet-5-5', modelSubstitutedFrom: null })
    expect(pathBModel()).toMatchObject({ key: 'OPUS', source: 'request', substitutedFrom: null })
  })

  it('a STORED Brief request since disallowed falls through, is recorded on the stamps, and never fails the draft (FR-10)', async () => {
    db.policy = policyRow(['HAIKU', 'SONNET'])
    db.draft = { id: 'd1', templateId: null, brief: { ...(brief as object), designModel: 'OPUS' } }
    await runGenerationForDraft('d1', actor)
    expect(pathBModel()).toMatchObject({ key: 'SONNET', source: 'system', substitutedFrom: 'OPUS' })
    expect(db.revisionCreates[0]).toMatchObject({ model: 'claude-sonnet-5-5', modelSubstitutedFrom: 'OPUS' })
    expect(db.draftUpdates.at(-1)!.data).toMatchObject({
      status: 'EXPORTED',
      designModel: 'claude-sonnet-5-5',
      designModelSubstitutedFrom: 'OPUS',
    })
  })

  it('sync: a stored request since disallowed is substituted, not thrown — the scheduler/MCP run completes', async () => {
    db.policy = policyRow(['HAIKU', 'SONNET'])
    const stored = { ...(brief as object), captionModel: 'OPUS', designModel: 'OPUS' } as never
    await expect(generateDraftForBrief(stored, { userId: null, teamId: 'team1', source: 'scheduler' })).resolves.toBeDefined()
    expect(db.draftCreates[0]).toMatchObject({
      headline: 'Applications are open',
      headlineModel: 'claude-haiku-4-5',
      headlineModelSubstitutedFrom: 'OPUS',
      designModel: 'claude-sonnet-5-5',
      designModelSubstitutedFrom: 'OPUS',
    })
    const rows = (db.draftCreates[0].captions as { create: Array<Record<string, unknown>> }).create
    expect(rows.every((r) => r.model === 'claude-haiku-4-5' && r.modelSubstitutedFrom === 'OPUS')).toBe(true)
    expect(db.revisionCreates[0]).toMatchObject({ model: 'claude-sonnet-5-5', modelSubstitutedFrom: 'OPUS' })
  })

  it('a team with no allowed model fails the async draft closed with the resolver message, before any call', async () => {
    db.policy = policyRow([])
    await runGenerationForDraft('d1', actor)
    expect(h.pathB).not.toHaveBeenCalled()
    expect(db.captionUpdateManys).toHaveLength(0)
    const failed = db.draftUpdates.at(-1)!.data
    expect(failed.status).toBe('FAILED')
    expect(failed.failureReason).toMatch(/^No model is allowed for .* on this team/)
  })

  it('the sync path throws it instead, and creates no draft', async () => {
    db.policy = policyRow([])
    await expect(generateDraftForBrief(brief, { userId: null, teamId: 'team1', source: 'scheduler' })).rejects.toThrow(/No model is allowed/)
    expect(db.draftCreates).toHaveLength(0)
  })
})

describe('retry route (FR-10)', () => {
  const req = {} as never
  const ctx = { params: { id: 'd1' } } as never

  it('sets IN_PROGRESS and every caption row back to PENDING in the same update, then reruns', async () => {
    db.draft = { id: 'd1', status: 'FAILED', teamId: 'team1', brief: { userId: 'u1', campaignId: null } }
    const res = (await retry(req, ctx)) as Response
    expect(res.status).toBe(202)
    expect(db.draftUpdates).toHaveLength(1)
    expect(db.draftUpdates[0].data).toEqual({
      status: 'IN_PROGRESS',
      failureReason: null,
      headline: null,
      // 008 FR-08 (T7): the headline's stamp is cleared with it.
      headlineModel: null,
      headlineModelSubstitutedFrom: null,
      captions: {
        updateMany: {
          where: { channel: { in: ['INSTAGRAM', 'LINKEDIN'] } },
          data: { status: 'PENDING', failureReason: null },
        },
        createMany: {
          data: [
            { channel: 'INSTAGRAM', status: 'PENDING' },
            { channel: 'LINKEDIN', status: 'PENDING' },
          ],
          skipDuplicates: true,
        },
      },
    })
    expect(h.startBackgroundGeneration).toHaveBeenCalledWith('d1', 'u1', 'team1')
  })

  it('resets only the registry channels, so a legacy WHATSAPP row is untouched (026 AC-06)', async () => {
    db.draft = {
      id: 'd1',
      status: 'FAILED',
      teamId: 'team1',
      brief: { userId: 'u1', campaignId: null },
    }
    await retry(req, ctx)
    const { updateMany, createMany } = db.draftUpdates[0].data.captions as {
      updateMany: { where: { channel: { in: string[] } } }
      createMany: { data: { channel: string }[] }
    }
    // Apply the reset's filter to a draft holding a legacy WHATSAPP row.
    const rows = ['INSTAGRAM', 'LINKEDIN', 'WHATSAPP']
    const reset = rows.filter((channel) => updateMany.where.channel.in.includes(channel))
    expect(reset).toEqual(['INSTAGRAM', 'LINKEDIN'])
    // A hidden row is never created either.
    expect(createMany.data.map((d) => d.channel)).toEqual(['INSTAGRAM', 'LINKEDIN'])
  })

  it('a non-FAILED draft is left alone (409)', async () => {
    db.draft = { id: 'd1', status: 'EXPORTED', teamId: 'team1', brief: { userId: 'u1', campaignId: null } }
    const res = (await retry(req, ctx)) as Response
    expect(res.status).toBe(409)
    expect(db.draftUpdates).toHaveLength(0)
  })
})

describe('regenerate-design uses designHeadline (FR-09)', () => {
  // A real Request: the route reads its (optional) body (008 FR-17).
  const req = new Request('http://test/x', { method: 'POST' }) as never
  const ctx = { params: { id: 'd1' } } as never
  const draftWith = (headline: string | null) => ({
    id: 'd1', teamId: 'team1', brief, headline, htmlContent: '<html>v1</html>', exportUrl: 'exports/v1.png',
    currentRevisionNumber: 1, promptVersion: null, fontSet: null,
  })

  it('designs from the stored headline', async () => {
    db.draft = draftWith('Stored headline')
    await regenerateDesign(req, ctx)
    expect(h.pathB.mock.calls[0][2]).toBe('Stored headline')
    expect(logged(info).some((l) => l.includes('has no headline'))).toBe(false)
  })

  it('a migrated draft (headline null) falls back to the brief Topic, and logs it', async () => {
    db.draft = draftWith(null)
    await regenerateDesign(req, ctx)
    expect(h.pathB.mock.calls[0][2]).toBe('The brief topic')
    expect(logged(info)).toContain('[captions] draft d1 has no headline — design uses the brief topic')
  })
})
