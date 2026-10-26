import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'

// F3 (change 004 final fix wave, AC-04): the generation and regenerate-design
// paths write DraftRevision rows outside revisions.ts. Each must stamp the row
// with the render it holds — the same prompt version + font set it stamps on
// the draft (draftRevisions.test.ts covers commit / reject / restore / adopt).
//
// 008 FR-08 / D4: the stamp also carries the model that made the render — the
// DraftRevision row as `model`, the draft as `designModel` (draftStampFields).
// The resolver runs for real on the faked TeamModelPolicy row.

const fake = vi.hoisted(() => {
  const db = {
    draftWrites: [] as Array<{ op: string; data: Record<string, unknown>; where?: Record<string, unknown> }>,
    // 019: how many rows Regenerate design's claim-guarded draft write matches
    // (0 = the claim was lost).
    guardedCount: 1,
    revisionCreates: [] as Array<Record<string, unknown>>,
    draft: null as null | Record<string, unknown>,
    policy: null as null | Record<string, unknown>,
    // 030: the check the mocked design runners report for their render.
    check: 'painted' as string | null,
    // 031: the font check the mocked design runners report for their render.
    fontsMissing: [] as string[],
  }
  const tx = {
    teamModelPolicy: { findUnique: async () => db.policy },
    // CLI mode (@prisma/client loads the local .env, which can set it)
    // queries the credential tier: 'team'.
    userClaudeToken: { findFirst: async () => null },
    draft: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        db.draftWrites.push({ op: 'update', data })
        return { id: 'd1', ...data }
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        db.draftWrites.push({ op: 'create', data })
        return { id: 'd1', ...data }
      },
      findUnique: async () => db.draft,
      // Regenerate design's final write is a claim-guarded updateMany (019).
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        if (!('htmlContent' in data)) return { count: 1 }
        if (db.guardedCount !== 1) return { count: 0 }
        db.draftWrites.push({ op: 'updateMany', where, data })
        return { count: 1 }
      },
    },
    draftCaption: { updateMany: async () => ({ count: 1 }) },
    // 024: the CAPTION surface reads the team's caption route.
    team: { findUnique: async () => null },
    draftRevision: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        db.revisionCreates.push(data)
        return { id: `rev-${db.revisionCreates.length}` }
      },
      findFirst: async () => {
        const nums = db.revisionCreates.map((r) => r.revisionNumber as number)
        return nums.length ? { revisionNumber: Math.max(...nums) } : null
      },
    },
    brandKitTemplate: { findFirst: async () => ({ id: 't1', aspectRatio: 'SQUARE' }) },
  }
  // Both transaction forms: the interactive callback and the batch array.
  const client = {
    ...tx,
    // The interactive form rolls the revision inserts back on a throw, like
    // Postgres (019: a lost claim must leave no revision row).
    $transaction: async (arg: unknown) => {
      if (Array.isArray(arg)) return Promise.all(arg)
      const before = db.revisionCreates.length
      try {
        return await (arg as (t: typeof tx) => Promise<unknown>)(tx)
      } catch (err) {
        db.revisionCreates.length = before
        throw err
      }
    },
  }
  return { db, client }
})
const db = fake.db

vi.mock('@/lib/prisma', () => ({ prisma: fake.client }))
vi.mock('@/lib/renderer/fontSet', () => ({ getFontSetId: () => 'fonts-test' }))
vi.mock('@/lib/brandkit/resolve', () => ({ resolveBrandKit: async () => ({ id: 'kit', name: 'Kit' }) }))
vi.mock('@/lib/campaign/briefing', () => ({ getActiveCampaignBriefing: async () => null }))
vi.mock('@/providers/registry', () => ({
  resolveCopyProvider: async () => ({
    generateCaptions: async (_b: unknown, _t: unknown, model: { arg: string }) => ({
      raw: JSON.stringify({ headline: 'the headline', instagram: 'ig', linkedin: 'li' }),
      modelId: model.arg,
      route: null,
    }),
  }),
}))
vi.mock('@/lib/agent/briefInput', () => ({
  buildBriefInput: () => ({}),
  briefPostStyleStamp: () => null,
  imageRulesAtStamp: () => undefined,
}))
// 027: the facts check has its own tests; here it is a clear result and a no-op refresh.
vi.mock('@/lib/factsCheck/refresh', () => ({
  computeFactsCheck: async () => ({ v: 1, status: 'clear', checkedAt: '2026-10-24T00:00:00.000Z', flagged: [] }),
  refreshFactsCheck: async () => {},
}))
vi.mock('@/lib/agent/pathA', () => ({
  runPathADesign: async () => ({
    htmlContent: '<html>a</html>',
    exportUrl: 'exports/a.png',
    headlineCheck: fake.db.check,
    fontsMissing: fake.db.fontsMissing,
  }),
  assertTemplateMatchesBrief: () => {},
}))
// 009 FR-12: Path B returns the run's composition stamp; every writer carries it.
const KEPT = {
  requestedArchetype: 'product-showcase',
  appliedArchetype: 'product-showcase',
  contractVersion: 1,
  imageQuality: 'high',
}
vi.mock('@/lib/agent/pathB', () => ({
  runPathBDesign: async () => ({
    htmlContent: '<html>b</html>',
    exportUrl: 'exports/b.png',
    backgroundImageUrl: null,
    headlineCheck: fake.db.check,
    fontsMissing: fake.db.fontsMissing,
    composition: {
      requestedArchetype: 'product-showcase',
      appliedArchetype: 'product-showcase',
      contractVersion: 1,
      imageQuality: 'high',
    },
  }),
}))
vi.mock('@/lib/agent/generationErrors', () => ({ humanizeGenerationError: (e: unknown) => String(e) }))
// The route's auth wrapper → a pass-through with a fixed teammate.
vi.mock('@/lib/api/handler', () => ({
  withTeamAuth:
    (handler: (req: unknown, ctx: { params: unknown }, user: unknown) => unknown) =>
    (req: unknown, ctx: { params: unknown }) =>
      handler(req, { params: ctx.params }, { userId: 'u1', teamId: 'team1' }),
}))
vi.mock('@/lib/authz/visibility', () => ({ canAccessContent: () => true }))
// Run the claimed action's work inline so the test can observe its writes.
vi.mock('@/lib/drafts/draftActions', () => ({
  claimDraftAction: async () => ({ action: 'REGENERATE_DESIGN', claimId: 'c1' }),
  // 008 T9: the generation's pre-design heartbeat (a Path A design calls it).
  touchGeneration: async () => {},
  startDraftAction: async (_d: string, _u: string, _t: string, _a: unknown, work: () => Promise<unknown>) => {
    await work()
  },
}))

import { PROMPT_VERSION } from '@/lib/agent/prompts/shared'
import { generateDraftForBrief, runGenerationForDraft } from '@/lib/agent/generateDraft'
import { POST as regenerateDesign } from '@/app/api/drafts/[id]/regenerate-design/route'
import { currentRenderStamp, draftStampFields, restoredRenderStamp } from '@/lib/drafts/revisions'
import { decideModel } from '@/lib/models/resolve'
import { DEFAULT_POLICY } from '@/lib/models/policyRules'

const STAMP = { promptVersion: PROMPT_VERSION, fontSet: 'fonts-test' }
// Path B's system default (FR-04) on a team with no saved policy.
const FREEFORM = { model: 'claude-sonnet-5-5', modelSubstitutedFrom: null }
const DRAFT_FREEFORM = { designModel: 'claude-sonnet-5-5', designModelSubstitutedFrom: null }

const brief = {
  id: 'b1',
  teamId: 'team1',
  userId: 'u1',
  campaignId: null,
  brandKitId: null,
  designMode: 'GENERATE',
  aspectRatio: 'SQUARE',
  copyProviderKey: null,
} as never

beforeEach(() => {
  db.draftWrites = []
  db.guardedCount = 1
  db.revisionCreates = []
  db.draft = null
  db.policy = null
  db.check = 'painted'
  db.fontsMissing = []
})

describe('generation v1 "Original design" revision', () => {
  it('sync path (MCP/ACP, scheduler): the v1 row and the draft carry the same stamp', async () => {
    await generateDraftForBrief(brief, { userId: null, teamId: 'team1', source: 'scheduler' })
    expect(db.revisionCreates).toHaveLength(1)
    expect(db.revisionCreates[0]).toMatchObject({ revisionNumber: 1, instruction: 'Original design', ...STAMP, ...FREEFORM })
    expect(db.draftWrites.find((w) => w.op === 'create')!.data).toMatchObject({ ...STAMP, ...DRAFT_FREEFORM })
    expect(db.draftWrites.find((w) => w.op === 'create')!.data).not.toHaveProperty('model')
    // 009: the run's composition stamp lands on both rows, unchanged.
    expect(db.revisionCreates[0].composition).toEqual(KEPT)
    expect(db.draftWrites.find((w) => w.op === 'create')!.data.composition).toEqual(KEPT)
  })

  it('async path (brief wizard): finalizeDraftV1 stamps the v1 row and the draft', async () => {
    db.draft = { id: 'd1', templateId: null, brief }
    await runGenerationForDraft('d1', { userId: 'u1', teamId: 'team1', source: 'web' })
    expect(db.revisionCreates).toHaveLength(1)
    expect(db.revisionCreates[0]).toMatchObject({ revisionNumber: 1, instruction: 'Original design', ...STAMP, ...FREEFORM })
    const finalize = db.draftWrites.find((w) => w.data.status === 'EXPORTED')!
    expect(finalize.data).toMatchObject({ ...STAMP, ...DRAFT_FREEFORM })
    expect(db.revisionCreates[0].composition).toEqual(KEPT)
    expect(finalize.data.composition).toEqual(KEPT)
  })

  it('a TEMPLATE brief stamps the DESIGN_TEMPLATE model (Haiku by default)', async () => {
    db.draft = { id: 'd1', templateId: 't1', brief: { ...(brief as object), designMode: 'TEMPLATE' } }
    await runGenerationForDraft('d1', { userId: 'u1', teamId: 'team1', source: 'web' })
    expect(db.revisionCreates[0]).toMatchObject({ model: 'claude-haiku-4-5', modelSubstitutedFrom: null })
    // 009: a Path A draft is classic (the evidence's denominator), never null.
    const classic = { requestedArchetype: 'classic', appliedArchetype: 'classic', contractVersion: null, imageQuality: 'default' }
    expect(db.revisionCreates[0].composition).toEqual(classic)
    expect(db.draftWrites.find((w) => w.data.status === 'EXPORTED')!.data.composition).toEqual(classic)
  })
})

// 030 FR-04 / AC-04: generation stamps what the render's check said about the
// headline the design was made from (the validated caption-step headline).
describe('030 rendered-text stamp: generation', () => {
  const painted = { headline: { text: 'the headline', verified: true } }

  it('sync and async generation stamp the revision and the draft from the check', async () => {
    await generateDraftForBrief(brief, { userId: null, teamId: 'team1', source: 'scheduler' })
    expect(db.revisionCreates[0].renderedText).toEqual(painted)
    expect(db.draftWrites.find((w) => w.op === 'create')!.data.renderedText).toEqual(painted)

    db.revisionCreates = []
    db.draftWrites = []
    db.draft = { id: 'd1', templateId: null, brief }
    await runGenerationForDraft('d1', { userId: 'u1', teamId: 'team1', source: 'web' })
    expect(db.revisionCreates[0].renderedText).toEqual(painted)
    expect(db.draftWrites.find((w) => w.data.status === 'EXPORTED')!.data.renderedText).toEqual(painted)
  })

  it('a failed check is stamped unverified with its reason, on both rows', async () => {
    db.check = 'not-found'
    await generateDraftForBrief(brief, { userId: null, teamId: 'team1', source: 'scheduler' })
    const want = { headline: { text: 'the headline', verified: false, reason: 'not-found' } }
    expect(db.revisionCreates[0].renderedText).toEqual(want)
    expect(db.draftWrites.find((w) => w.op === 'create')!.data.renderedText).toEqual(want)
  })

  it('a run that rendered nothing (no check) is stamped not-checked, never painted', async () => {
    db.check = null
    db.draft = { id: 'd1', templateId: 't1', brief: { ...(brief as object), designMode: 'TEMPLATE' } }
    await runGenerationForDraft('d1', { userId: 'u1', teamId: 'team1', source: 'web' })
    expect(db.revisionCreates[0].renderedText).toEqual({
      headline: { text: 'the headline', verified: false, reason: 'not-checked' },
    })
  })
})

// 031 FR-24: generation stamps what the same render found about its fonts, on both rows,
// exactly where renderedText is (null = nothing missing).
describe('031 render notes: generation', () => {
  it('sync and async generation stamp the revision and the draft from the font check', async () => {
    db.fontsMissing = ['Abhaya Libre']
    await generateDraftForBrief(brief, { userId: null, teamId: 'team1', source: 'scheduler' })
    expect(db.revisionCreates[0].renderNotes).toEqual({ fontsMissing: ['Abhaya Libre'] })
    expect(db.draftWrites.find((w) => w.op === 'create')!.data.renderNotes).toEqual({ fontsMissing: ['Abhaya Libre'] })

    db.revisionCreates = []
    db.draftWrites = []
    db.draft = { id: 'd1', templateId: null, brief }
    await runGenerationForDraft('d1', { userId: 'u1', teamId: 'team1', source: 'web' })
    expect(db.revisionCreates[0].renderNotes).toEqual({ fontsMissing: ['Abhaya Libre'] })
    expect(db.draftWrites.find((w) => w.data.status === 'EXPORTED')!.data.renderNotes).toEqual({ fontsMissing: ['Abhaya Libre'] })
  })

  it('nothing missing is SQL NULL on both rows (Path A too)', async () => {
    db.draft = { id: 'd1', templateId: 't1', brief: { ...(brief as object), designMode: 'TEMPLATE' } }
    await runGenerationForDraft('d1', { userId: 'u1', teamId: 'team1', source: 'web' })
    expect(db.revisionCreates[0].renderNotes).toBe(Prisma.DbNull)
    expect(db.draftWrites.find((w) => w.data.status === 'EXPORTED')!.data.renderNotes).toBe(Prisma.DbNull)
  })

  it('a Path A render with a missing font is stamped', async () => {
    db.fontsMissing = ['Poppins']
    db.draft = { id: 'd1', templateId: 't1', brief: { ...(brief as object), designMode: 'TEMPLATE' } }
    await runGenerationForDraft('d1', { userId: 'u1', teamId: 'team1', source: 'web' })
    expect(db.revisionCreates[0].renderNotes).toEqual({ fontsMissing: ['Poppins'] })
  })
})

describe('regenerate-design', () => {
  // A real Request: the route reads its (optional) body (008 FR-17).
  const req = new Request('http://test/x', { method: 'POST' }) as never
  const ctx = { params: { id: 'd1' } } as never

  // 019 AC-04: the final draft write carries the claim, last; a lost claim
  // throws and rolls the revision insert back.
  it('the final draft write is guarded on the claim, and a lost claim lands no revision', async () => {
    db.draft = {
      id: 'd1', teamId: 'team1', brief, headline: 'h', htmlContent: '<html>v1</html>', exportUrl: 'exports/v1.png',
      currentRevisionNumber: 1,
    }
    await regenerateDesign(req, ctx)
    expect(db.draftWrites.at(-1)!.where).toEqual({ id: 'd1', pendingAction: 'REGENERATE_DESIGN', pendingActionClaimId: 'c1' })
    expect(db.revisionCreates).toHaveLength(1)

    db.draftWrites = []
    db.revisionCreates = []
    db.guardedCount = 0
    await expect(regenerateDesign(req, ctx)).rejects.toThrow(/no longer carries/)
    expect(db.revisionCreates).toHaveLength(0)
    expect(db.draftWrites).toEqual([])
  })

  it('the regenerated revision and the draft carry the same (current) stamp', async () => {
    db.draft = {
      id: 'd1', teamId: 'team1', brief, headline: 'h', htmlContent: '<html>v1</html>', exportUrl: 'exports/v1.png',
      currentRevisionNumber: 1, promptVersion: 'pv-old', fontSet: 'fonts-old',
    }
    const res = (await regenerateDesign(req, ctx)) as Response
    expect(res.status).toBe(202)
    expect(db.revisionCreates).toHaveLength(1)
    expect(db.revisionCreates[0]).toMatchObject({ instruction: 'Regenerated design', ...STAMP, ...FREEFORM })
    expect(db.draftWrites.at(-1)!.data).toMatchObject({ ...STAMP, ...DRAFT_FREEFORM })
    // 009: the new run's composition stamp (re-resolved from the brief) is the one stored.
    expect(db.revisionCreates[0].composition).toEqual(KEPT)
    expect(db.draftWrites.at(-1)!.data.composition).toEqual(KEPT)
  })

  it('030: stamps from its check against designHeadline (the stored headline, else the brief topic)', async () => {
    db.draft = {
      id: 'd1', teamId: 'team1', brief, headline: 'Stored headline', htmlContent: '<html>v1</html>',
      exportUrl: 'exports/v1.png', currentRevisionNumber: 1,
    }
    await regenerateDesign(req, ctx)
    const stored = { headline: { text: 'Stored headline', verified: true } }
    expect(db.revisionCreates[0].renderedText).toEqual(stored)
    expect(db.draftWrites.at(-1)!.data.renderedText).toEqual(stored)

    db.revisionCreates = []
    db.draftWrites = []
    db.check = 'ambiguous'
    db.draft = {
      id: 'd1', teamId: 'team1', brief: { ...(brief as object), topic: 'Topic fallback' }, headline: null,
      htmlContent: '<html>v1</html>', exportUrl: 'exports/v1.png', currentRevisionNumber: 1,
    }
    await regenerateDesign(req, ctx)
    const fallback = { headline: { text: 'Topic fallback', verified: false, reason: 'ambiguous' } }
    expect(db.revisionCreates[0].renderedText).toEqual(fallback)
    expect(db.draftWrites.at(-1)!.data.renderedText).toEqual(fallback)
  })

  it('031: stamps the render note from its own font check on the revision and the draft', async () => {
    db.fontsMissing = ['Noto Sans Sinhala']
    db.draft = {
      id: 'd1', teamId: 'team1', brief, headline: 'h', htmlContent: '<html>v1</html>', exportUrl: 'exports/v1.png',
      currentRevisionNumber: 1,
    }
    await regenerateDesign(req, ctx)
    expect(db.revisionCreates[0].renderNotes).toEqual({ fontsMissing: ['Noto Sans Sinhala'] })
    expect(db.draftWrites.at(-1)!.data.renderNotes).toEqual({ fontsMissing: ['Noto Sans Sinhala'] })
  })

  it('008: with no design stamp, resolves DESIGN_FREEFORM from the team default before the claim', async () => {
    db.policy = {
      allowedModels: ['HAIKU', 'SONNET', 'OPUS'],
      requirePersonalTokenForGated: false,
      defaults: [{ surface: 'DESIGN_FREEFORM', model: 'OPUS' }],
    }
    db.draft = {
      id: 'd1', teamId: 'team1', brief, headline: 'h', htmlContent: '<html>v1</html>', exportUrl: 'exports/v1.png',
      currentRevisionNumber: 1, promptVersion: 'pv-old', fontSet: 'fonts-old',
    }
    await regenerateDesign(req, ctx)
    expect(db.revisionCreates[0]).toMatchObject({ model: 'claude-opus-5-5' })
    expect(db.draftWrites.at(-1)!.data).toMatchObject({ designModel: 'claude-opus-5-5' })
  })

  it('a team with no allowed model is a 422 that claims nothing and writes nothing', async () => {
    db.policy = { allowedModels: [], requirePersonalTokenForGated: false, defaults: [] }
    db.draft = {
      id: 'd1', teamId: 'team1', brief, headline: 'h', htmlContent: '<html>v1</html>', exportUrl: 'exports/v1.png',
      currentRevisionNumber: 1, promptVersion: null, fontSet: null,
    }
    const res = (await regenerateDesign(req, ctx)) as Response
    expect(res.status).toBe(422)
    expect((await res.json()).code).toBe('NO_ALLOWED_MODEL')
    expect(db.revisionCreates).toHaveLength(0)
    expect(db.draftWrites).toHaveLength(0)
  })

  // ── 008 FR-09: like for like — Draft.designModel is the stamp tier ────────
  const stamped = (designModel: string | null) => ({
    id: 'd1', teamId: 'team1', brief, headline: 'h', htmlContent: '<html>v1</html>', exportUrl: 'exports/v1.png',
    currentRevisionNumber: 1, promptVersion: 'pv', fontSet: 'f', designModel, designModelSubstitutedFrom: null,
  })

  it("the draft's design stamp wins over the team default (the model that made the current design)", async () => {
    db.policy = {
      allowedModels: ['HAIKU', 'SONNET', 'OPUS'],
      requirePersonalTokenForGated: false,
      defaults: [{ surface: 'DESIGN_FREEFORM', model: 'SONNET' }],
    }
    db.draft = stamped('claude-opus-5-5')
    await regenerateDesign(req, ctx)
    expect(db.revisionCreates[0]).toMatchObject({ model: 'claude-opus-5-5', modelSubstitutedFrom: null })
    expect(db.draftWrites.at(-1)!.data).toMatchObject({ designModel: 'claude-opus-5-5', designModelSubstitutedFrom: null })
  })

  it('AC-17: a stamp since disallowed falls to the default and is recorded as the substitution', async () => {
    db.policy = { allowedModels: ['HAIKU', 'SONNET'], requirePersonalTokenForGated: false, defaults: [] }
    db.draft = stamped('claude-opus-5-5')
    const res = (await regenerateDesign(req, ctx)) as Response
    expect(res.status).toBe(202)
    expect(db.revisionCreates[0]).toMatchObject({ model: 'claude-sonnet-5-5', modelSubstitutedFrom: 'claude-opus-5-5' })
    expect(db.draftWrites.at(-1)!.data).toMatchObject({
      designModel: 'claude-sonnet-5-5',
      designModelSubstitutedFrom: 'claude-opus-5-5',
    })
  })

  it('a retired ID maps to its family and is itself recorded as a substitution', async () => {
    db.draft = stamped('claude-sonnet-4-6')
    await regenerateDesign(req, ctx)
    expect(db.revisionCreates[0]).toMatchObject({ model: 'claude-sonnet-5-5', modelSubstitutedFrom: 'claude-sonnet-4-6' })
  })
})

// ── 008 D4: the model in the RenderStamp ────────────────────────────────────

describe('RenderStamp.model (008 FR-08, D4)', () => {
  const resolved = (() => {
    const r = decideModel('DESIGN_FREEFORM', {
      policy: { ...DEFAULT_POLICY, allowed: ['HAIKU', 'SONNET'] },
      credential: 'n/a',
      mode: 'api',
      storedRequest: 'OPUS',
    })
    if (!r.ok) throw new Error(r.message)
    return r.resolved
  })()

  it('currentRenderStamp(model) carries the arg that crossed the boundary and the refused value', () => {
    expect(currentRenderStamp(resolved, null, null, null, null)).toEqual({
      ...STAMP,
      model: 'claude-sonnet-5-5',
      modelSubstitutedFrom: 'OPUS',
      composition: null, postStyle: null, renderedText: null, renderNotes: null,
    })
    expect(currentRenderStamp(null, null, null, null, null)).toEqual({ ...STAMP, model: null, modelSubstitutedFrom: null, composition: null, postStyle: null, renderedText: null, renderNotes: null })
  })

  it('draftStampFields maps model → designModel, and nothing else changes name', () => {
    expect(draftStampFields(currentRenderStamp(resolved, null, null, null, null))).toEqual({
      ...STAMP,
      designModel: 'claude-sonnet-5-5',
      designModelSubstitutedFrom: 'OPUS',
      // 009: no composition stamp is SQL NULL, not a JSON null.
      composition: Prisma.DbNull,
      postStyle: Prisma.DbNull,
      renderedText: Prisma.DbNull,
      renderNotes: Prisma.DbNull,
    })
  })

  it("restoredRenderStamp copies the revision's own model, whether or not its PNG is re-rendered (A6)", () => {
    const row = { promptVersion: 'pv-old', fontSet: 'fonts-old', model: 'claude-sonnet-4-6', modelSubstitutedFrom: 'HAIKU' }
    expect(restoredRenderStamp(row, false, null)).toEqual({ ...row, composition: null, postStyle: null, renderedText: null, renderNotes: null })
    expect(restoredRenderStamp(row, true, null)).toEqual({ ...row, fontSet: 'fonts-test', composition: null, postStyle: null, renderedText: null, renderNotes: null })
    // A pre-008 row reads as unknown, never as the current model.
    expect(restoredRenderStamp({ promptVersion: 'pv', fontSet: 'f' }, false, null)).toMatchObject({
      model: null,
      modelSubstitutedFrom: null,
    })
  })
})
