// 027 FR-11 (the loader, refreshFactsCheck and computeFactsCheck; the write points)
// with a fake prisma: READY rows only, a PENDING row skipped, a failed write
// logs and stores an error when it can, never throws. No real database.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { loadFactsSources, type FactsBrief, type SourceLoaders } from '@/lib/factsCheck/sources'
import { computeFactsCheck, refreshFactsCheck, type RefreshDeps } from '@/lib/factsCheck/refresh'
import { parseFactsCheck } from '@/lib/factsCheck'

const BRIEF: FactsBrief = {
  teamId: 't1',
  topic: 'Launch of the academy',
  description: 'Doors open 18:00',
  campaignId: 'c1',
  brandKitId: 'k1',
}

function loaders(over: Partial<SourceLoaders> = {}): SourceLoaders & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    briefing: async (id) => {
      calls.push(`briefing:${id}`)
      return 'Briefing: offer 20%'
    },
    voicePrompt: async () => {
      calls.push('voice')
      return 'Voice: call 076-8030-944'
    },
    documents: async (b) => {
      calls.push(`docs:${b.campaignId}`)
      return ['Doc one', 'Doc two $50']
    },
    ...over,
  }
}

describe('loadFactsSources', () => {
  it('returns the topic, description, briefing, voice and campaign documents in order', async () => {
    expect(await loadFactsSources(BRIEF, {}, loaders())).toEqual([
      'Launch of the academy',
      'Doors open 18:00',
      'Briefing: offer 20%',
      'Voice: call 076-8030-944',
      'Doc one',
      'Doc two $50',
    ])
  })

  it('drops nulls and empties and reads no campaign data without a campaign', async () => {
    const l = loaders({ voicePrompt: async () => null })
    const out = await loadFactsSources({ ...BRIEF, campaignId: null, description: null }, {}, l)
    expect(out).toEqual(['Launch of the academy'])
    expect(l.calls).toEqual([])
  })

  it('does not read what the caller has already resolved', async () => {
    const l = loaders()
    const out = await loadFactsSources(BRIEF, { campaignBriefing: 'B', voicePrompt: 'V' }, l)
    expect(out.slice(2, 4)).toEqual(['B', 'V'])
    expect(l.calls).toEqual(['docs:c1'])
    // an explicit null means "resolved: none", not "read it"
    const none = await loadFactsSources(
      BRIEF,
      { campaignBriefing: null, voicePrompt: null },
      loaders(),
    )
    expect(none).toEqual(['Launch of the academy', 'Doors open 18:00', 'Doc one', 'Doc two $50'])
  })

  it('cuts the total at 200 000 characters', async () => {
    const big = 'x'.repeat(150_000)
    const l = loaders({ documents: async () => [big, big] })
    const out = await loadFactsSources({ ...BRIEF, description: null }, { voicePrompt: null }, l)
    expect(out.join('').length).toBe(200_000)
  })
})

interface FakeState {
  draft: null | { headline: string | null; brief: FactsBrief }
  captions: Array<{ channel: string; text: string; status: string }>
  writes: Array<Record<string, unknown>>
  failWrites: number
}

function fake(state: FakeState): RefreshDeps {
  const db = {
    draft: {
      findUnique: async () => state.draft,
      updateMany: async (args: { where: unknown; data: Record<string, unknown> }) => {
        if (state.failWrites > 0) {
          state.failWrites--
          throw new Error('write failed https://db.internal:5432/x key=secret')
        }
        state.writes.push(args.data)
        return { count: 1 }
      },
    },
  } as unknown as PrismaClient
  return {
    db,
    loadSources: (b) => loadFactsSources(b, {}, loaders()),
    loadCaptions: async () =>
      ({
        captions: state.captions.map((c) => ({
          ...c,
          failureReason: null,
          updatedAt: new Date(),
          model: null,
          modelSubstitutedFrom: null,
          route: null,
        })),
      }) as never,
  }
}

describe('refreshFactsCheck', () => {
  let errors: string[]
  beforeEach(() => {
    errors = []
    vi.spyOn(console, 'error').mockImplementation(
      (...a: unknown[]) => void errors.push(a.join(' ')),
    )
  })
  afterEach(() => vi.restoreAllMocks())

  const base = (): FakeState => ({
    draft: { headline: 'Only $99', brief: BRIEF },
    captions: [
      { channel: 'INSTAGRAM', text: 'Join 1,250 customers', status: 'READY' },
      { channel: 'LINKEDIN', text: 'Call us on 7 June', status: 'READY' },
    ],
    writes: [],
    failWrites: 0,
  })

  it('checks the headline and the READY captions against the sources and stores the result', async () => {
    const s = base()
    await refreshFactsCheck('d1', fake(s))
    expect(s.writes).toHaveLength(1)
    const check = parseFactsCheck(s.writes[0].factsCheck)
    expect(check?.status).toBe('flagged')
    expect(check?.flagged.map((f) => `${f.where}|${f.kind}|${f.value}`)).toEqual([
      'headline|cur|$99',
      'INSTAGRAM|num|1,250',
      'LINKEDIN|date|7 June',
    ])
  })

  it('skips a PENDING or FAILED row and an empty one', async () => {
    const s = base()
    s.captions[0].status = 'PENDING'
    s.captions[1] = { channel: 'LINKEDIN', text: '', status: 'READY' }
    await refreshFactsCheck('d1', fake(s))
    expect(parseFactsCheck(s.writes[0].factsCheck)?.flagged.map((f) => f.where)).toEqual([
      'headline',
    ])
    s.captions[0].status = 'FAILED'
    s.writes.length = 0
    await refreshFactsCheck('d1', fake(s))
    expect(parseFactsCheck(s.writes[0].factsCheck)?.flagged.map((f) => f.where)).toEqual([
      'headline',
    ])
  })

  it('a clear draft stores status clear', async () => {
    const s = base()
    s.draft = { headline: null, brief: BRIEF }
    s.captions = [{ channel: 'INSTAGRAM', text: 'Call 076-8030-944', status: 'READY' }]
    await refreshFactsCheck('d1', fake(s))
    expect(parseFactsCheck(s.writes[0].factsCheck)?.status).toBe('clear')
  })

  it('writes nothing for a missing draft', async () => {
    const s = base()
    s.draft = null
    await refreshFactsCheck('gone', fake(s))
    expect(s.writes).toEqual([])
  })

  it('a failed write logs once (redacted), tries to store status error, and never throws', async () => {
    const s = base()
    s.failWrites = 1
    await expect(refreshFactsCheck('d1', fake(s))).resolves.toBeUndefined()
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/^\[facts-check\] draft d1: /)
    expect(errors[0]).not.toMatch(/db\.internal|secret/)
    const stored = parseFactsCheck(s.writes[0].factsCheck)
    expect(stored?.status).toBe('error')
    expect(stored?.flagged).toEqual([])
    expect(stored?.reason).not.toMatch(/db\.internal|secret/)
  })

  it('a failing sources load stores error; a failing error write is swallowed too', async () => {
    const s = base()
    const deps = fake(s)
    deps.loadSources = async () => {
      throw new Error('sources unavailable')
    }
    await refreshFactsCheck('d1', deps)
    expect(parseFactsCheck(s.writes[0].factsCheck)).toMatchObject({
      status: 'error',
      reason: 'sources unavailable',
    })
    s.writes.length = 0
    s.failWrites = 5
    await expect(refreshFactsCheck('d1', deps)).resolves.toBeUndefined()
    expect(s.writes).toEqual([])
  })

  it('stores no caption or brief text', async () => {
    const s = base()
    await refreshFactsCheck('d1', fake(s))
    const json = JSON.stringify(s.writes[0])
    for (const text of ['Join 1,250 customers', 'Launch of the academy', 'Only $99', 'Call us on'])
      expect(json).not.toContain(text)
  })
})

// ── T4: the write points (027 FR-11, AC-11) ─────────────────────────────────

describe('computeFactsCheck (the synchronous generation’s check)', () => {
  let errors: string[]
  beforeEach(() => {
    errors = []
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void errors.push(a.join(' ')))
  })
  afterEach(() => vi.restoreAllMocks())

  const TEXTS = [
    { where: 'headline' as const, text: 'Only $99' },
    { where: 'INSTAGRAM' as const, text: 'Doors open at 18:00' },
  ]

  it('checks the texts against the sources the loader returns, with the preloaded values passed through', async () => {
    const seen: unknown[] = []
    const check = await computeFactsCheck(
      { brief: BRIEF, texts: TEXTS, preloaded: { campaignBriefing: null, voicePrompt: 'V' } },
      async (b, p) => {
        seen.push([b, p])
        return ['Doors open 18:00']
      },
    )
    expect(seen).toEqual([[BRIEF, { campaignBriefing: null, voicePrompt: 'V' }]])
    expect(check.status).toBe('flagged')
    expect(check.flagged.map((f) => `${f.where}|${f.kind}|${f.value}`)).toEqual(['headline|cur|$99'])
  })

  it('a clear check is stored as clear with no flags', async () => {
    const check = await computeFactsCheck({ brief: BRIEF, texts: TEXTS }, async () => ['Only $99', 'at 18:00'])
    expect(check).toMatchObject({ v: 1, status: 'clear', flagged: [] })
  })

  it('a loader that throws is status error, logged once, redacted, and never thrown', async () => {
    const check = await computeFactsCheck({ brief: BRIEF, texts: TEXTS }, async () => {
      throw new Error('db down https://db.internal:5432/x key=secret')
    })
    expect(check.status).toBe('error')
    expect(check.flagged).toEqual([])
    expect(check.reason).not.toContain('secret')
    expect(check.reason).not.toContain('db.internal')
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('[facts-check]')
  })

  it('stores no caption or brief text, only what a flag needs', async () => {
    const check = await computeFactsCheck({ brief: BRIEF, texts: TEXTS }, async () => ['x'])
    const json = JSON.stringify(check)
    expect(json).not.toContain('Doors open')
    expect(json).not.toContain('Launch of the academy')
  })
})

describe('refreshFactsCheck: a partial override (a store function given its own client)', () => {
  it('overrides only the fields it names, so a caller can pass just its db', async () => {
    const s: FakeState = {
      draft: { headline: 'Only $99', brief: BRIEF },
      captions: [],
      writes: [],
      failWrites: 0,
    }
    const deps = fake(s)
    await refreshFactsCheck('d1', { db: deps.db, loadSources: deps.loadSources, loadCaptions: deps.loadCaptions })
    expect(s.writes).toHaveLength(1)
    // Only the db named: the default captions loader runs on it. A fake db with no
    // caption rows to read fails inside the wrapper and is stored as error, never thrown.
    const s2: FakeState = { draft: { headline: 'h', brief: BRIEF }, captions: [], writes: [], failWrites: 0 }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(refreshFactsCheck('d1', { db: fake(s2).db })).resolves.toBeUndefined()
    expect(parseFactsCheck(s2.writes.at(-1)?.factsCheck)?.status).toBe('error')
    vi.restoreAllMocks()
  })
})

describe('the __MOCK_FACT_ERROR__ seam (MOCK_AI only)', () => {
  const load = async (env: Record<string, string>) => {
    vi.resetModules()
    vi.unstubAllEnvs()
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
    return await import('@/lib/factsCheck/refresh')
  }
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('with MOCK_AI on, the sentinel makes both entry points store status error (the generation and the action go on)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const mod = await load({ MOCK_AI: 'true', DESIGN_PROVIDER: 'claude-html' })
    const brief = { ...BRIEF, topic: 'launch __MOCK_FACT_ERROR__' }
    const computed = await mod.computeFactsCheck({ brief, texts: [{ where: 'headline', text: 'fine' }] }, async () => ['x'])
    expect(computed.status).toBe('error')

    const s: FakeState = { draft: { headline: 'fine', brief }, captions: [], writes: [], failWrites: 0 }
    const deps = fake(s)
    await mod.refreshFactsCheck('d1', deps)
    expect(parseFactsCheck(s.writes.at(-1)?.factsCheck)?.status).toBe('error')
  })

  it('with MOCK_AI off, the sentinel is plain text and the check runs', async () => {
    const mod = await load({})
    const brief = { ...BRIEF, topic: 'launch __MOCK_FACT_ERROR__' }
    const computed = await mod.computeFactsCheck({ brief, texts: [{ where: 'headline', text: 'fine' }] }, async () => ['x'])
    expect(computed.status).toBe('clear')
  })
})
