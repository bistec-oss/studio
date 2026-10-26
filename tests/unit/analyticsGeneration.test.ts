// 006 T2: `generation.finished` from both lifecycles (FR-04). The real
// generateDraftForBrief / runGenerationForDraft and the real track() run against
// a prisma fake capturing analyticsEvent.create; the model, design and caption
// seams are faked as in renderStamps.test.ts. One event per generation, the
// caller's source on it, nothing but vocabulary and counts in the payload, and a
// failing insert changes neither the draft writes nor the outcome (AC-08).

import { describe, it, expect, vi, beforeEach } from 'vitest'

const fake = vi.hoisted(() => {
  const db = {
    draftWrites: [] as Array<{ op: string; data: Record<string, unknown> }>,
    draft: null as null | Record<string, unknown>,
    events: [] as Array<Record<string, unknown>>,
    failInsert: false,
    failDesign: false,
    headlineCheck: undefined as string | undefined,
  }
  const tx = {
    teamModelPolicy: { findUnique: async () => null },
    userClaudeToken: { findFirst: async () => null },
    team: { findUnique: async () => null },
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
      updateMany: async () => ({ count: 1 }),
    },
    draftCaption: { updateMany: async () => ({ count: 1 }) },
    draftRevision: { create: async () => ({ id: 'rev-1' }) },
    brandKitTemplate: { findFirst: async () => ({ id: 't1', aspectRatio: 'SQUARE' }) },
    analyticsEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (db.failInsert) throw new Error('insert failed')
        db.events.push(data)
        return {}
      },
    },
    analyticsDrop: { upsert: async () => ({}) },
  }
  const client = {
    ...tx,
    $transaction: async (arg: unknown) => (Array.isArray(arg) ? Promise.all(arg) : (arg as (t: typeof tx) => Promise<unknown>)(tx)),
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
      route: 'CLI',
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
  runPathADesign: async () => ({ htmlContent: '<html>a</html>', exportUrl: 'exports/a.png', headlineCheck: db.headlineCheck }),
  assertTemplateMatchesBrief: () => {},
}))
vi.mock('@/lib/agent/pathB', () => ({
  runPathBDesign: async () => {
    if (db.failDesign) throw new Error('design exploded')
    return {
      htmlContent: '<html>b</html>',
      exportUrl: 'exports/b.png',
      headlineCheck: db.headlineCheck,
      backgroundImageUrl: null,
      background: { url: null, skip: 'NO_PROVIDER' },
      composition: {
        requestedArchetype: 'editorial-split',
        appliedArchetype: 'classic',
        contractVersion: null,
        fallbackReason: 'busy',
        imageQuality: 'default',
      },
    }
  },
}))
vi.mock('@/lib/agent/generationErrors', () => ({ humanizeGenerationError: (e: unknown) => (e instanceof Error ? e.message : String(e)) }))
vi.mock('@/lib/drafts/draftActions', () => ({ touchGeneration: async () => {} }))

import { generateDraftForBrief, runGenerationForDraft } from '@/lib/agent/generateDraft'

const brief = {
  id: 'b1',
  teamId: 'team1',
  userId: 'u1',
  campaignId: null,
  brandKitId: null,
  designMode: 'GENERATE',
  aspectRatio: 'SQUARE',
  imageStyle: 'editorial-split',
  copyProviderKey: null,
} as never

beforeEach(() => {
  db.draftWrites = []
  db.draft = { id: 'd1', templateId: null, brief }
  db.events = []
  db.failInsert = false
  db.failDesign = false
  db.headlineCheck = undefined
})

describe('generation.finished (FR-04)', () => {
  it('async ok: one event, source web, the draft, models and the composition outcome', async () => {
    await runGenerationForDraft('d1', { userId: 'u1', teamId: 'team1', source: 'web' })
    expect(db.events).toHaveLength(1)
    const e = db.events[0] as { name: string; source: string; teamId: string; userId: string; draftId: string; outcome: string; durationMs: number; payload: Record<string, unknown> }
    expect(e).toMatchObject({ name: 'generation.finished', source: 'web', teamId: 'team1', userId: 'u1', draftId: 'd1', outcome: 'ok' })
    expect(e.durationMs).toBeGreaterThanOrEqual(0)
    expect(e.payload).toMatchObject({
      path: 'B',
      aspectRatio: 'SQUARE',
      captionRoute: 'CLI',
      captionModel: { model: 'HAIKU', modelId: 'claude-haiku-4-5' },
      designModel: { model: 'SONNET', modelId: 'claude-sonnet-5-5' },
      requestedArchetype: 'editorial-split',
      appliedArchetype: 'classic',
      fallbackReason: 'busy',
      backgroundSkipped: true,
    })
    expect(typeof e.payload.promptVersion).toBe('string')
  })

  it('async failed: the draft is FAILED first, then one failed event with the reason', async () => {
    db.failDesign = true
    await runGenerationForDraft('d1', { userId: 'u1', teamId: 'team1', source: 'web' })
    expect(db.draftWrites.at(-1)!.data).toMatchObject({ status: 'FAILED' })
    expect(db.events).toHaveLength(1)
    expect(db.events[0]).toMatchObject({ outcome: 'failed', draftId: 'd1' })
    expect((db.events[0].payload as Record<string, unknown>).failureReason).toBe('design exploded')
    // The caption and design models were resolved before the design failed.
    expect((db.events[0].payload as Record<string, unknown>).captionModel).toMatchObject({ model: 'HAIKU' })
  })

  it('a draft that no longer exists emits nothing', async () => {
    db.draft = null
    await runGenerationForDraft('d1', { userId: 'u1', teamId: 'team1', source: 'web' })
    expect(db.events).toHaveLength(0)
  })

  it('sync ok (scheduler / MCP): one event carrying the caller source and the new draft id', async () => {
    await generateDraftForBrief(brief, { userId: null, teamId: 'team1', source: 'scheduler' })
    expect(db.events).toHaveLength(1)
    expect(db.events[0]).toMatchObject({ source: 'scheduler', userId: null, draftId: 'd1', outcome: 'ok' })
    db.events = []
    await generateDraftForBrief(brief, { userId: null, teamId: 'team1', source: 'mcp' })
    expect(db.events[0]).toMatchObject({ source: 'mcp' })
  })

  it('sync failed: one failed event with no draft, and the error still propagates', async () => {
    db.failDesign = true
    await expect(generateDraftForBrief(brief, { userId: null, teamId: 'team1', source: 'mcp' })).rejects.toThrow('design exploded')
    expect(db.events).toHaveLength(1)
    expect(db.events[0]).toMatchObject({ source: 'mcp', draftId: null, outcome: 'failed' })
  })

  it('a TEMPLATE brief reports path A and a classic composition', async () => {
    const templated = { ...(brief as object), designMode: 'TEMPLATE', imageStyle: 'classic' }
    db.draft = { id: 'd1', templateId: 't1', brief: templated }
    await runGenerationForDraft('d1', { userId: 'u1', teamId: 'team1', source: 'web' })
    expect(db.events[0].payload).toMatchObject({
      path: 'A',
      requestedArchetype: 'classic',
      appliedArchetype: 'classic',
      backgroundSkipped: false,
      designModel: { model: 'HAIKU' },
    })
  })

  it('AC-08: a failing insert leaves the draft writes and the sync result identical', async () => {
    const asyncWrites = async () => {
      db.draftWrites = []
      await runGenerationForDraft('d1', { userId: 'u1', teamId: 'team1', source: 'web' })
      return db.draftWrites.map((w) => ({ op: w.op, status: w.data.status ?? null }))
    }
    const base = await asyncWrites()
    db.failInsert = true
    const failing = await asyncWrites()
    expect(failing).toEqual(base)
    expect(failing.at(-1)).toEqual({ op: 'update', status: 'EXPORTED' })

    const sync = async () => (await generateDraftForBrief(brief, { userId: null, teamId: 'team1', source: 'scheduler' })).draft.id
    db.failInsert = false
    const okId = await sync()
    db.failInsert = true
    expect(await sync()).toBe(okId)

    db.failDesign = true
    await expect(sync()).rejects.toThrow('design exploded')
  })
})

// 030 FR-17: the final render's headline check, so the unverified rate of fresh
// generations is measured. Built from the stamp the design carries.
describe('generation.finished headlineCheck (030 FR-17)', () => {
  const run = async () => {
    await runGenerationForDraft('d1', { userId: 'u1', teamId: 'team1', source: 'web' })
    return (db.events[0].payload as Record<string, unknown>).headlineCheck
  }

  it("a verified stamp reports 'painted'", async () => {
    db.headlineCheck = 'painted'
    expect(await run()).toBe('painted')
  })

  it.each(['not-found', 'ambiguous', 'not-visible', 'not-checked'])('an unverified stamp reports its reason: %s', async (reason) => {
    db.headlineCheck = reason
    expect(await run()).toBe(reason)
  })

  it("a design that returned no check is stamped 'not-checked' and says so", async () => {
    expect(await run()).toBe('not-checked')
  })

  it('a Path A design reports it too', async () => {
    db.headlineCheck = 'painted'
    db.draft = { id: 'd1', templateId: 't1', brief: { ...(brief as object), designMode: 'TEMPLATE', imageStyle: 'classic' } }
    expect(await run()).toBe('painted')
  })

  it('is absent when there is no design (a failed run)', async () => {
    db.failDesign = true
    await runGenerationForDraft('d1', { userId: 'u1', teamId: 'team1', source: 'web' })
    expect(db.events).toHaveLength(1)
    expect(db.events[0].payload).not.toHaveProperty('headlineCheck')
  })

  it('the sync lifecycle (scheduler, MCP) carries it as well', async () => {
    db.headlineCheck = 'not-visible'
    await generateDraftForBrief(brief, { userId: null, teamId: 'team1', source: 'scheduler' })
    expect(db.events[0].payload).toMatchObject({ headlineCheck: 'not-visible' })
  })
})
