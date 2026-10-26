import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'

// 027 FR-05 / FR-09 / FR-11 (AC-04 writers, AC-08 delivery, AC-11 sync write
// point): the generation lifecycles and Regenerate design stamp the post style,
// the caption rules reach the copy provider through buildBriefInput (the real
// one), the facts check lands in the draft's own create, and a stored key that
// does not resolve fails closed before any model call. Fake prisma, the real
// resolver, the real prompt text, the real facts check (its sources loader is
// the only fake). The carry-forward writers are in draftRevisions.test.ts.

const fake = vi.hoisted(() => {
  const db = {
    draftWrites: [] as Array<{ op: string; data: Record<string, unknown>; where?: Record<string, unknown> }>,
    revisionCreates: [] as Array<Record<string, unknown>>,
    draft: null as null | Record<string, unknown>,
    providerCalls: [] as Array<Record<string, unknown>>,
    reply: {} as Record<string, string>,
    sources: [] as string[] | Error,
    sourceCalls: [] as Array<{ brief: unknown; preloaded: unknown }>,
  }
  const tx = {
    teamModelPolicy: { findUnique: async () => null },
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
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        if (!('htmlContent' in data)) return { count: 1 }
        db.draftWrites.push({ op: 'updateMany', where, data })
        return { count: 1 }
      },
    },
    draftCaption: { updateMany: async () => ({ count: 1 }) },
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
  const client = {
    ...tx,
    $transaction: async (arg: unknown) => {
      if (Array.isArray(arg)) return Promise.all(arg)
      return (arg as (t: typeof tx) => Promise<unknown>)(tx)
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
    generateCaptions: async (brief: Record<string, unknown>, _t: unknown, model: { arg: string }) => {
      db.providerCalls.push(brief)
      return { raw: JSON.stringify(db.reply), modelId: model.arg, route: null }
    },
  }),
}))
// The real facts check runs; only the database reads of its sources are faked.
vi.mock('@/lib/factsCheck/sources', () => ({
  loadFactsSources: async (brief: unknown, preloaded: unknown) => {
    db.sourceCalls.push({ brief, preloaded })
    if (db.sources instanceof Error) throw db.sources
    return db.sources
  },
}))
vi.mock('@/lib/agent/pathA', () => ({
  runPathADesign: async () => ({ htmlContent: '<html>a</html>', exportUrl: 'exports/a.png' }),
  assertTemplateMatchesBrief: () => {},
}))
vi.mock('@/lib/agent/pathB', () => ({
  runPathBDesign: async () => ({
    htmlContent: '<html>b</html>',
    exportUrl: 'exports/b.png',
    backgroundImageUrl: null,
    composition: {
      requestedArchetype: 'classic',
      appliedArchetype: 'classic',
      contractVersion: null,
      imageQuality: 'default',
    },
  }),
}))
vi.mock('@/lib/agent/generationErrors', () => ({ humanizeGenerationError: (e: unknown) => (e as Error).message }))
vi.mock('@/lib/api/handler', () => ({
  withTeamAuth:
    (handler: (req: unknown, ctx: { params: unknown }, user: unknown) => unknown) =>
    (req: unknown, ctx: { params: unknown }) =>
      handler(req, { params: ctx.params }, { userId: 'u1', teamId: 'team1' }),
}))
vi.mock('@/lib/authz/visibility', () => ({ canAccessContent: () => true }))
vi.mock('@/lib/drafts/draftActions', () => ({
  claimDraftAction: async () => ({ action: 'REGENERATE_DESIGN', claimId: 'c1' }),
  touchGeneration: async () => {},
  touchDraftAction: async () => {},
  startDraftAction: async (_d: string, _u: string, _t: string, _a: unknown, work: () => Promise<unknown>) => {
    await work()
  },
}))

import { generateDraftForBrief, runGenerationForDraft } from '@/lib/agent/generateDraft'
import { POST as regenerateDesign } from '@/app/api/drafts/[id]/regenerate-design/route'
import { checklistPromptText, POST_STYLES_REVISION } from '@/lib/postStyles'

const STAMP = { key: 'promotion', version: 2, revision: POST_STYLES_REVISION }
const CLEAN = { headline: 'the headline', instagram: 'ig caption', linkedin: 'li caption' }

const brief = (over: Record<string, unknown> = {}) =>
  ({
    id: 'b1',
    teamId: 'team1',
    userId: 'u1',
    campaignId: null,
    brandKitId: null,
    topic: 'Spring sale',
    description: 'Two weeks only',
    goal: 'conversion',
    tone: 'bold',
    channels: ['INSTAGRAM', 'LINKEDIN'],
    designMode: 'GENERATE',
    aspectRatio: 'SQUARE',
    copyProviderKey: null,
    postStyle: 'promotion',
    ...over,
  }) as never

const actor = { userId: null, teamId: 'team1', source: 'scheduler' } as const

beforeEach(() => {
  db.draftWrites = []
  db.revisionCreates = []
  db.draft = null
  db.providerCalls = []
  db.reply = { ...CLEAN }
  db.sources = ['Spring sale', 'Two weeks only']
  db.sourceCalls = []
})

describe('FR-05: the first generation stamps the post style on the draft and its v1 row', () => {
  it('sync path (scheduler, MCP, ACP)', async () => {
    await generateDraftForBrief(brief(), actor)
    expect(db.revisionCreates[0].postStyle).toEqual(STAMP)
    expect(db.draftWrites.find((w) => w.op === 'create')!.data.postStyle).toEqual(STAMP)
  })

  it('async path (the brief wizard): finalizeDraftV1 writes it to both', async () => {
    db.draft = { id: 'd1', templateId: null, brief: brief() }
    await runGenerationForDraft('d1', { userId: 'u1', teamId: 'team1', source: 'web' })
    expect(db.revisionCreates[0].postStyle).toEqual(STAMP)
    expect(db.draftWrites.find((w) => w.data.status === 'EXPORTED')!.data.postStyle).toEqual(STAMP)
  })

  it('a Path A brief is stamped too (the caption rules and the image rules apply to it)', async () => {
    db.draft = { id: 'd1', templateId: 't1', brief: brief({ designMode: 'TEMPLATE' }) }
    await runGenerationForDraft('d1', { userId: 'u1', teamId: 'team1', source: 'web' })
    expect(db.revisionCreates[0].postStyle).toEqual(STAMP)
  })

  it('a brief with no style writes SQL NULL on both (never a JSON null)', async () => {
    await generateDraftForBrief(brief({ postStyle: null }), actor)
    expect(db.revisionCreates[0].postStyle).toBe(Prisma.DbNull)
    expect(db.draftWrites.find((w) => w.op === 'create')!.data.postStyle).toBe(Prisma.DbNull)
  })

  it('a blank stored key is "no style", like null', async () => {
    await generateDraftForBrief(brief({ postStyle: '   ' }), actor)
    expect(db.draftWrites.find((w) => w.op === 'create')!.data.postStyle).toBe(Prisma.DbNull)
    expect(db.providerCalls[0]).not.toHaveProperty('captionRules')
  })
})

describe('FR-09: the caption rules reach the copy provider', () => {
  it('the brief’s style adds exactly the caption-scope text, once', async () => {
    await generateDraftForBrief(brief(), actor)
    expect(db.providerCalls).toHaveLength(1)
    const rules = db.providerCalls[0].captionRules as string
    expect(rules).toBe(checklistPromptText('promotion', 1, 'caption'))
    expect(rules).toContain('Content rules for this post (post style: Promotion')
    // The image-scope bullets are not in the caption rules.
    expect(rules).not.toContain(checklistPromptText('promotion', 1, 'image').split('\n')[1])
  })

  it('a brief with no style sends the BriefInput of before 027: no captionRules key', async () => {
    await generateDraftForBrief(brief({ postStyle: null }), actor)
    expect(db.providerCalls[0]).not.toHaveProperty('captionRules')
  })
})

describe('NFR-04: a stored key that does not resolve fails closed, before any model call', () => {
  it('sync: throws the named error, calls no provider, creates no draft', async () => {
    await expect(generateDraftForBrief(brief({ postStyle: 'nope' }), actor)).rejects.toThrow(
      'Post style "nope" is not available',
    )
    expect(db.providerCalls).toHaveLength(0)
    expect(db.draftWrites.filter((w) => w.op === 'create')).toHaveLength(0)
    expect(db.revisionCreates).toHaveLength(0)
  })

  it('async: the draft fails with the named reason and nothing is generated', async () => {
    db.draft = { id: 'd1', templateId: null, brief: brief({ postStyle: 'nope' }) }
    await runGenerationForDraft('d1', { userId: 'u1', teamId: 'team1', source: 'web' })
    expect(db.providerCalls).toHaveLength(0)
    const failed = db.draftWrites.find((w) => w.data.status === 'FAILED')!
    expect(failed.data.failureReason).toBe('Post style "nope" is not available')
    expect(db.revisionCreates).toHaveLength(0)
  })
})

describe('FR-11: the facts check is written in the draft’s own create (sync)', () => {
  it('a clean reply stores status clear and reads the headline and both captions with the preloaded sources', async () => {
    await generateDraftForBrief(brief(), actor)
    const created = db.draftWrites.find((w) => w.op === 'create')!.data
    expect(created.factsCheck).toMatchObject({ v: 1, status: 'clear', flagged: [] })
    // The loader is handed the brief's own fields and what the run already resolved (the kit has no voice).
    expect(db.sourceCalls).toHaveLength(1)
    expect(db.sourceCalls[0].preloaded).toEqual({ campaignBriefing: null, voicePrompt: null })
  })

  it('an invented value is flagged, with where it was found and no text', async () => {
    db.reply = { headline: 'Only $49 today', instagram: 'Save 35% now', linkedin: 'li caption' }
    await generateDraftForBrief(brief(), actor)
    const check = db.draftWrites.find((w) => w.op === 'create')!.data.factsCheck as {
      status: string
      flagged: Array<{ kind: string; where: string; value: string }>
    }
    expect(check.status).toBe('flagged')
    expect(check.flagged.map((f) => [f.where, f.kind])).toEqual([
      ['headline', 'cur'],
      ['INSTAGRAM', 'pct'],
    ])
    expect(JSON.stringify(check)).not.toContain('Save')
  })

  it('a value the brief states is not flagged (the support rule over the sources)', async () => {
    db.sources = ['Spring sale', 'Only $49 today']
    db.reply = { headline: 'Only $49 today', instagram: 'ig', linkedin: 'li' }
    await generateDraftForBrief(brief(), actor)
    expect(db.draftWrites.find((w) => w.op === 'create')!.data.factsCheck).toMatchObject({ status: 'clear' })
  })

  it('a check that cannot run stores status error and the generation still returns its draft', async () => {
    db.sources = new Error('sources unavailable')
    const result = await generateDraftForBrief(brief(), actor)
    expect(result.draft).toBeTruthy()
    expect(db.draftWrites.find((w) => w.op === 'create')!.data.factsCheck).toMatchObject({
      v: 1,
      status: 'error',
      flagged: [],
    })
  })

  it('the check runs for a brief with no style too (the guard does not depend on the thing that might be missing)', async () => {
    db.reply = { headline: 'Only $49 today', instagram: 'ig', linkedin: 'li' }
    await generateDraftForBrief(brief({ postStyle: null }), actor)
    expect(db.draftWrites.find((w) => w.op === 'create')!.data.factsCheck).toMatchObject({ status: 'flagged' })
  })

  it('the __MOCK_FACT_ERROR__ seam is inert unless MOCK_AI is on (this run: it is off)', async () => {
    await generateDraftForBrief(brief({ topic: 'x __MOCK_FACT_ERROR__' }), actor)
    expect(db.draftWrites.find((w) => w.op === 'create')!.data.factsCheck).toMatchObject({ status: 'clear' })
  })
})

describe('regenerate-design stamps the post style on the new revision and the draft', () => {
  const req = new Request('http://test/x', { method: 'POST' }) as never
  const ctx = { params: { id: 'd1' } } as never
  const draftOf = (b: unknown) => ({
    id: 'd1', teamId: 'team1', brief: b, headline: 'h', htmlContent: '<html>v1</html>', exportUrl: 'exports/v1.png',
    currentRevisionNumber: 1, promptVersion: 'pv', fontSet: 'f', postStyle: { key: 'event', version: 1, revision: 8 },
  })

  it('writes the brief’s key at the current version, replacing the stored stamp', async () => {
    db.draft = draftOf(brief())
    const res = (await regenerateDesign(req, ctx)) as Response
    expect(res.status).toBe(202)
    expect(db.revisionCreates[0].postStyle).toEqual(STAMP)
    expect(db.draftWrites.at(-1)!.data.postStyle).toEqual(STAMP)
  })

  it('a brief with no style writes SQL NULL', async () => {
    db.draft = draftOf(brief({ postStyle: null }))
    await regenerateDesign(req, ctx)
    expect(db.revisionCreates[0].postStyle).toBe(Prisma.DbNull)
    expect(db.draftWrites.at(-1)!.data.postStyle).toBe(Prisma.DbNull)
  })
})
