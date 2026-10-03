import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import type { Brief } from '@prisma/client'
import type { ResolvedBrandKit } from '@/lib/brandkit/resolve'
import {
  buildBackgroundDecisionPrompt,
  buildRefineBackgroundDecisionPrompt,
} from '@/lib/agent/prompts/background'
import {
  BACKGROUND_SKIP_CLEARED,
  backgroundSkippedFor,
  cleanSkipDetail,
  clipSkipDetail,
  generationSkipFields,
  MODERATION_RE,
  redactSkipDetail,
  refineSkipFields,
  SKIP_DETAIL_MAX,
} from '@/lib/drafts/backgroundNotice'

// For generation, resolveImageProvider is resolved FIRST inside the background
// step, before any model call — a null resolution (no personal/team key
// configured) must short-circuit the whole step without ever reaching the
// decision model. Guard the model-calling seams so a wiring regression fails
// loudly (assertion) instead of silently making a real network call.
const h = vi.hoisted(() => ({
  resolveImageProvider: vi.fn(),
  // No generic pinned to the initial (throwing) implementation — later tests
  // reassign a resolving implementation via .mockResolvedValue/.mockImplementation.
  runClaudeCli: vi.fn().mockImplementation(() => {
    throw new Error('runClaudeCli should not be called when the image provider is null')
  }),
  anthropicCreate: vi.fn().mockImplementation(() => {
    throw new Error('Anthropic.messages.create should not be called when the image provider is null')
  }),
  persistDataUrlImage: vi.fn(),
  // commitDraftRevision's draft writes (the refine writer, FR-07).
  draftUpdates: [] as Array<Record<string, unknown>>,
}))

// A minimal transaction fake for commitDraftRevision (exportKey supplied, so
// it never renders): the next-number read, the revision insert, the
// not-applied discard, then the final draft write this file asserts on.
vi.mock('@/lib/prisma', () => {
  const tx = {
    draftRevision: {
      findFirst: async () => ({ revisionNumber: 1 }),
      create: async () => ({ id: 'rev-2' }),
      updateMany: async () => ({ count: 0 }),
    },
    draft: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        h.draftUpdates.push(data)
        return {}
      },
    },
  }
  return { prisma: { $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) } }
})

vi.mock('@/providers/registry', () => ({ resolveImageProvider: h.resolveImageProvider }))
vi.mock('@/lib/agent/claudeCli', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/agent/claudeCli')>()
  return { ...actual, runClaudeCli: h.runClaudeCli }
})
// A real class (not vi.fn().mockImplementation(arrowFn)) — an arrow function
// has no [[Construct]] slot, so `new Anthropic(...)` in background.ts would
// throw "is not a constructor" if the mock were arrow-based.
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: h.anthropicCreate }
  },
}))
vi.mock('@/lib/storage/minio', () => ({ persistDataUrlImage: h.persistDataUrlImage }))

const { parseBackgroundDecision, generateBackgroundForBrief, generateBackgroundForRefine } =
  await import('@/lib/agent/background')

const kit: ResolvedBrandKit = {
  id: 'kit-1',
  name: 'Bistec',
  colors: ['#14377D', '#2CB34A'],
  fonts: [{ name: 'Lato', url: 'https://fonts.example.com/lato.woff2' }],
  logoUrl: 'https://cdn.example.com/logo.svg',
  logos: [{ label: 'Primary logo', url: 'https://cdn.example.com/logo.svg', primary: true }],
  voicePrompt: 'Warm, confident, human.',
  source: 'system',
}

function decisionReply(text: string) {
  return { content: [{ type: 'text', text }] }
}

function providerReturning(url: string) {
  return { generateImage: vi.fn(async () => ({ url })) }
}

describe('parseBackgroundDecision', () => {
  it('parses a bare JSON decision', () => {
    expect(parseBackgroundDecision('{"needed": true, "prompt": "deep navy abstract waves"}')).toEqual({
      needed: true,
      prompt: 'deep navy abstract waves',
    })
  })

  it('parses a fenced JSON decision (models sometimes wrap despite instructions)', () => {
    const raw = '```json\n{"needed": false, "prompt": ""}\n```'
    expect(parseBackgroundDecision(raw)).toEqual({ needed: false, prompt: '' })
  })

  it('tolerates surrounding prose by isolating the outermost object', () => {
    const raw = 'Here is my decision: {"needed": true, "prompt": "sunrise gradient"} — done.'
    expect(parseBackgroundDecision(raw)).toEqual({ needed: true, prompt: 'sunrise gradient' })
  })

  it('defaults a missing prompt to empty string', () => {
    expect(parseBackgroundDecision('{"needed": false}')).toEqual({ needed: false, prompt: '' })
  })

  it('returns null for non-JSON output', () => {
    expect(parseBackgroundDecision('I think a background would be nice.')).toBeNull()
  })

  it('returns null when the shape is wrong (needed not boolean)', () => {
    expect(parseBackgroundDecision('{"needed": "yes", "prompt": "x"}')).toBeNull()
  })
})

describe('background decision prompts', () => {
  it('generation prompt is biased toward yes and bans text in the image', () => {
    const p = buildBackgroundDecisionPrompt({
      kit,
      topic: 'Q3 launch',
      description: 'Announce the launch',
      goal: 'awareness',
      tone: 'professional',
      copyText: 'Big news!',
    })
    expect(p.system).toContain('default to "needed": true')
    expect(p.system).toContain('NO text')
    expect(p.system).toContain('#14377D') // brand kit context flows through
    expect(p.user).toContain('Q3 launch')
  })

  it('refine prompt is neutral: only when the instruction asks for a background', () => {
    const p = buildRefineBackgroundDecisionPrompt({
      kit,
      topic: 'Q3 launch',
      instruction: 'make the headline bigger',
    })
    expect(p.system).toContain('ONLY when the instruction')
    expect(p.user).toContain('make the headline bigger')
  })

  it('builders are pure — same input, same output', () => {
    const opts = { kit, topic: 't', instruction: 'i' }
    expect(buildRefineBackgroundDecisionPrompt(opts)).toEqual(buildRefineBackgroundDecisionPrompt(opts))
  })
})

// The brief's OWNER (userId 'user-owner') is deliberately different from the
// ACTOR passed to every call below ('user-actor') — these fixtures exist to
// catch a regression back to deriving the image-provider ctx from brief.userId
// (the bug the reviewer caught: a teammate refining a shared brief resolved
// the brief OWNER's personal key instead of their own).
const brief = {
  id: 'brief-1',
  teamId: 'brief-team', // also deliberately different from the actor's teamId
  userId: 'user-owner',
  topic: 'Q3 launch',
  description: 'Announce the launch',
  goal: 'awareness',
  tone: 'professional',
  aspectRatio: 'SQUARE',
  imageProviderKey: null,
} as unknown as Brief

const actor = { userId: 'user-actor', teamId: 'team-actor' }

describe('generateBackgroundForBrief — skip reasons (FR-06)', () => {
  beforeEach(() => {
    h.resolveImageProvider.mockReset().mockResolvedValue(null)
    h.runClaudeCli.mockClear()
    h.anthropicCreate.mockClear()
    h.persistDataUrlImage.mockReset()
  })

  it('no provider configured (personal+team both absent) ⇒ NO_PROVIDER, decision model never called', async () => {
    await expect(generateBackgroundForBrief(brief, kit, 'Big news!', null, actor)).resolves.toEqual({
      url: null,
      skip: 'NO_PROVIDER',
    })
    // The ctx passed to resolveImageProvider must be the ACTOR's, never the
    // brief's own teamId/userId (brief-team / user-owner).
    expect(h.resolveImageProvider).toHaveBeenCalledWith(
      { teamId: 'team-actor', userId: 'user-actor' },
      undefined
    )
    expect(h.runClaudeCli).not.toHaveBeenCalled()
    expect(h.anthropicCreate).not.toHaveBeenCalled()
  })

  it('a rejected provider resolution ⇒ PROVIDER_ERROR with the error as detail (never fails the pipeline)', async () => {
    h.resolveImageProvider.mockReset().mockRejectedValue(new Error('db unreachable'))
    await expect(generateBackgroundForBrief(brief, kit, 'Big news!', null, actor)).resolves.toEqual({
      url: null,
      skip: 'PROVIDER_ERROR',
      detail: 'db unreachable',
    })
    expect(h.anthropicCreate).not.toHaveBeenCalled()
  })

  it('a decision reply that is not valid JSON ⇒ DECISION_ERROR', async () => {
    h.resolveImageProvider.mockResolvedValue(providerReturning('https://cdn.example.com/x.png'))
    h.anthropicCreate.mockResolvedValueOnce(decisionReply('I think a background would be nice.'))
    const result = await generateBackgroundForBrief(brief, kit, 'Big news!', null, actor)
    expect(result).toMatchObject({ url: null, skip: 'DECISION_ERROR' })
  })

  it('the decision call itself throwing ⇒ DECISION_ERROR (stage before the parse), even when the message says "provider"', async () => {
    h.resolveImageProvider.mockResolvedValue(providerReturning('https://cdn.example.com/x.png'))
    h.anthropicCreate.mockRejectedValueOnce(new Error('image provider exploded'))
    await expect(generateBackgroundForBrief(brief, kit, 'Big news!', null, actor)).resolves.toEqual({
      url: null,
      skip: 'DECISION_ERROR',
      detail: 'image provider exploded',
    })
  })

  it('needed:false ⇒ NOT_NEEDED, the provider is never asked for an image', async () => {
    const provider = providerReturning('https://cdn.example.com/x.png')
    h.resolveImageProvider.mockResolvedValue(provider)
    h.anthropicCreate.mockResolvedValueOnce(decisionReply('{"needed": false, "prompt": ""}'))
    await expect(generateBackgroundForBrief(brief, kit, 'Big news!', null, actor)).resolves.toEqual({
      url: null,
      skip: 'NOT_NEEDED',
    })
    expect(provider.generateImage).not.toHaveBeenCalled()
  })

  it('needed:true with an empty prompt ⇒ NOT_NEEDED', async () => {
    h.resolveImageProvider.mockResolvedValue(providerReturning('https://cdn.example.com/x.png'))
    h.anthropicCreate.mockResolvedValueOnce(decisionReply('{"needed": true, "prompt": "   "}'))
    await expect(generateBackgroundForBrief(brief, kit, 'Big news!', null, actor)).resolves.toMatchObject({
      skip: 'NOT_NEEDED',
    })
  })

  it('generateImage throwing ⇒ PROVIDER_ERROR (stage after the parse), even when the message says "decision"', async () => {
    h.resolveImageProvider.mockResolvedValue({
      generateImage: async () => {
        throw new Error('decision was fine but the image request was rejected')
      },
    })
    h.anthropicCreate.mockResolvedValueOnce(decisionReply('{"needed": true, "prompt": "waves"}'))
    await expect(generateBackgroundForBrief(brief, kit, 'Big news!', null, actor)).resolves.toEqual({
      url: null,
      skip: 'PROVIDER_ERROR',
      detail: 'decision was fine but the image request was rejected',
    })
  })

  it('persisting the image failing ⇒ PROVIDER_ERROR', async () => {
    h.resolveImageProvider.mockResolvedValue(providerReturning('data:image/png;base64,AAAA'))
    h.persistDataUrlImage.mockRejectedValueOnce(new Error('Unsupported image content-type from provider: image/svg+xml'))
    h.anthropicCreate.mockResolvedValueOnce(decisionReply('{"needed": true, "prompt": "waves"}'))
    await expect(generateBackgroundForBrief(brief, kit, 'Big news!', null, actor)).resolves.toMatchObject({
      url: null,
      skip: 'PROVIDER_ERROR',
    })
  })

  it('a long provider error is clipped to 300 chars in detail', async () => {
    h.resolveImageProvider.mockResolvedValue({
      generateImage: async () => {
        throw new Error('x'.repeat(5000))
      },
    })
    h.anthropicCreate.mockResolvedValueOnce(decisionReply('{"needed": true, "prompt": "waves"}'))
    const result = await generateBackgroundForBrief(brief, kit, 'Big news!', null, actor)
    expect(result.url).toBeNull()
    if (result.url !== null) throw new Error('unreachable')
    expect(result.detail!.length).toBeLessThanOrEqual(SKIP_DETAIL_MAX)
  })

  it('a produced background ⇒ { url } (a data: URL is persisted first)', async () => {
    h.resolveImageProvider.mockResolvedValue(providerReturning('data:image/png;base64,AAAA'))
    h.persistDataUrlImage.mockResolvedValueOnce('http://minio.example.com/generated-images/background-1.png')
    h.anthropicCreate.mockResolvedValueOnce(decisionReply('{"needed": true, "prompt": "waves"}'))
    await expect(generateBackgroundForBrief(brief, kit, 'Big news!', null, actor)).resolves.toEqual({
      url: 'http://minio.example.com/generated-images/background-1.png',
    })
    expect(h.persistDataUrlImage).toHaveBeenCalledWith('data:image/png;base64,AAAA', 'background')
  })
})

describe('generateBackgroundForRefine — refine semantics (FR-07)', () => {
  beforeEach(() => {
    h.resolveImageProvider.mockReset().mockResolvedValue(null)
    h.runClaudeCli.mockClear()
    h.anthropicCreate.mockReset()
    h.persistDataUrlImage.mockReset()
  })

  it('instruction did not ask for a background ⇒ NOT_NEEDED, the provider is never asked for an image', async () => {
    const provider = providerReturning('https://cdn.example.com/x.png')
    h.resolveImageProvider.mockResolvedValue(provider)
    h.anthropicCreate.mockResolvedValueOnce(decisionReply('{"needed": false}'))
    const result = await generateBackgroundForRefine(brief, kit, 'make the headline bigger', actor)
    expect(result).toEqual({ url: null, skip: 'NOT_NEEDED' })
    expect(provider.generateImage).not.toHaveBeenCalled()
    expect(refineSkipFields(result)).toBeUndefined()
  })

  it('a provider-less team ⇒ NO_PROVIDER, the decision is NEVER called, and the skip is left unchanged', async () => {
    // Resolution runs first (with the actor's ctx); nothing resolves, so no
    // Haiku call is spent on a decision whose answer could not be acted on.
    const result = await generateBackgroundForRefine(brief, kit, 'add a city skyline background', actor)
    expect(result).toEqual({ url: null, skip: 'NO_PROVIDER' })
    expect(h.resolveImageProvider).toHaveBeenCalledWith({ teamId: 'team-actor', userId: 'user-actor' }, undefined)
    expect(h.anthropicCreate).not.toHaveBeenCalled()
    expect(h.runClaudeCli).not.toHaveBeenCalled()
    expect(refineSkipFields(result)).toBeUndefined()
  })

  it('a resolver that throws is held until the decision: not wanted ⇒ NOT_NEEDED (nothing recorded)', async () => {
    h.resolveImageProvider.mockRejectedValue(new Error('db unreachable'))
    h.anthropicCreate.mockResolvedValueOnce(decisionReply('{"needed": false}'))
    const result = await generateBackgroundForRefine(brief, kit, 'make the headline bigger', actor)
    expect(result).toEqual({ url: null, skip: 'NOT_NEEDED' })
    expect(refineSkipFields(result)).toBeUndefined()
  })

  it('a resolver that throws is held until the decision: wanted ⇒ PROVIDER_ERROR with the resolver error', async () => {
    h.resolveImageProvider.mockRejectedValue(new Error('db unreachable'))
    h.anthropicCreate.mockResolvedValueOnce(decisionReply('{"needed": true, "prompt": "a city skyline"}'))
    await expect(generateBackgroundForRefine(brief, kit, 'add a background', actor)).resolves.toEqual({
      url: null,
      skip: 'PROVIDER_ERROR',
      detail: 'db unreachable',
    })
  })

  it('wanted a background and generation failed ⇒ PROVIDER_ERROR', async () => {
    h.anthropicCreate.mockResolvedValueOnce(decisionReply('{"needed": true, "prompt": "a city skyline"}'))
    h.resolveImageProvider.mockResolvedValue({
      generateImage: async () => {
        throw new Error('rate limited')
      },
    })
    await expect(generateBackgroundForRefine(brief, kit, 'add a background', actor)).resolves.toEqual({
      url: null,
      skip: 'PROVIDER_ERROR',
      detail: 'rate limited',
    })
  })

  it('without MOCK_AI a seam sentinel in the instruction changes nothing: the real decision and provider run', async () => {
    expect(process.env.MOCK_AI).not.toBe('true')
    const provider = providerReturning('https://cdn.example.com/real.png')
    h.resolveImageProvider.mockResolvedValue(provider)
    h.anthropicCreate.mockResolvedValueOnce(decisionReply('{"needed": true, "prompt": "a beach"}'))
    await expect(
      generateBackgroundForRefine(brief, kit, 'Swap it for a beach __MOCK_BG_FAIL__', actor),
    ).resolves.toEqual({ url: 'https://cdn.example.com/real.png' })
    expect(h.anthropicCreate).toHaveBeenCalledTimes(1)
    expect(provider.generateImage).toHaveBeenCalledTimes(1)
  })

  it('passes the provider-mapped size to generateImage (FR-12)', async () => {
    for (const [providerName, aspectRatio, size] of [
      ['openai', 'STORY', '1024x1536'],
      ['gemini', 'PORTRAIT', '4:5'],
      ['gemini', 'STORY', '9:16'],
    ] as const) {
      const provider = { providerName, generateImage: vi.fn(async () => ({ url: 'https://cdn.example.com/x.png' })) }
      h.resolveImageProvider.mockResolvedValue(provider)
      h.anthropicCreate.mockResolvedValueOnce(decisionReply('{"needed": true, "prompt": "a beach"}'))
      await generateBackgroundForBrief({ ...brief, aspectRatio } as typeof brief, kit, 'Big news!', null, actor)
      expect(provider.generateImage).toHaveBeenCalledWith('a beach', expect.anything(), size)
    }
  })

  it('the decision failing ⇒ DECISION_ERROR (never throws)', async () => {
    h.resolveImageProvider.mockResolvedValue(providerReturning('https://cdn.example.com/x.png'))
    h.anthropicCreate.mockRejectedValueOnce(new Error('overloaded'))
    await expect(generateBackgroundForRefine(brief, kit, 'add a background', actor)).resolves.toEqual({
      url: null,
      skip: 'DECISION_ERROR',
      detail: 'overloaded',
    })
  })
})

// The reviewer's specific regression test: distinguish the ACTING teammate
// from the brief's OWNER. Teammate B (the actor) refining/regenerating
// teammate A's (the owner's) shared brief must resolve B's identity, never
// A's — a personal-key lookup keyed on the wrong id would silently bill or
// use the wrong person's OpenAI account.
describe('generateBackgroundForBrief / generateBackgroundForRefine — actor vs. brief owner', () => {
  const OWNER_ID = 'user-owner' // brief.userId — must NEVER be consulted here
  const ACTOR_ID = 'user-actor-b' // the acting teammate
  const TEAM_ID = 'team-shared'

  const sharedBrief = { ...brief, userId: OWNER_ID, teamId: TEAM_ID } as unknown as Brief

  beforeEach(() => {
    h.resolveImageProvider.mockReset()
    h.runClaudeCli.mockReset()
    // The decision step must run this time (a resolved provider is available),
    // so give the Anthropic-mode decision call a valid strict-JSON answer.
    h.anthropicCreate.mockReset().mockResolvedValue(decisionReply('{"needed": true, "prompt": "a nice background"}'))
  })

  it("actor B (ACTIVE personal key) refining owner A's brief → B's identity resolves, not A's", async () => {
    h.resolveImageProvider.mockImplementation(
      async (ctx: { teamId: string; userId?: string | null }) => {
        if (ctx.userId === ACTOR_ID) {
          return { generateImage: async () => ({ url: `https://cdn.example.com/personal-${ctx.userId}.png` }) }
        }
        // In particular, a ctx keyed on the brief OWNER must never reach here.
        throw new Error(`unexpected resolveImageProvider ctx: ${JSON.stringify(ctx)}`)
      }
    )

    const result = await generateBackgroundForBrief(sharedBrief, kit, 'Big news!', null, {
      userId: ACTOR_ID,
      teamId: TEAM_ID,
    })

    expect(result).toEqual({ url: `https://cdn.example.com/personal-${ACTOR_ID}.png` })
    expect(h.resolveImageProvider).toHaveBeenCalledWith({ teamId: TEAM_ID, userId: ACTOR_ID }, undefined)
    for (const call of h.resolveImageProvider.mock.calls) {
      expect(call[0].userId).not.toBe(OWNER_ID)
    }
  })

  it('no acting user (userId: null, e.g. an unattended scheduler run) → the owner tier is never consulted; the team default applies', async () => {
    h.resolveImageProvider.mockImplementation(
      async (ctx: { teamId: string; userId?: string | null }) => {
        if (ctx.userId === null) {
          return { generateImage: async () => ({ url: 'https://cdn.example.com/team-default.png' }) }
        }
        throw new Error(`unexpected resolveImageProvider ctx: ${JSON.stringify(ctx)}`)
      }
    )

    const result = await generateBackgroundForRefine(sharedBrief, kit, 'add a background', {
      userId: null,
      teamId: TEAM_ID,
    })

    expect(result).toEqual({ url: 'https://cdn.example.com/team-default.png' })
    expect(h.resolveImageProvider).toHaveBeenCalledWith({ teamId: TEAM_ID, userId: null }, undefined)
  })
})

// ── NFR-06: the background mock seam ─────────────────────────────────────────
// MOCK_AI is read once at module load, so these cases re-import background.ts
// (and testHooks.ts) with MOCK_AI=true. The registry stays the vi.mock above:
// the point of the seam is that resolution RUNS (that mock is called with the
// actor's ctx), and only the resolved provider's generateImage is replaced.
describe('background mock seam (MOCK_AI + __MOCK_BG__ sentinels)', () => {
  const previous = process.env.MOCK_AI
  let seam: typeof import('@/lib/agent/background')
  let hooks: typeof import('@/lib/testHooks')

  beforeEach(async () => {
    process.env.MOCK_AI = 'true'
    vi.resetModules()
    seam = await import('@/lib/agent/background')
    hooks = await import('@/lib/testHooks')
    h.resolveImageProvider.mockReset()
    h.anthropicCreate.mockClear()
    h.runClaudeCli.mockClear()
    h.persistDataUrlImage.mockReset().mockImplementation(async (url: string) =>
      url.startsWith('data:image/png;base64,') ? 'http://minio.example.com/generated-images/background-mock.png' : Promise.reject(new Error('bad'))
    )
  })
  afterAll(() => {
    if (previous === undefined) delete process.env.MOCK_AI
    else process.env.MOCK_AI = previous
    vi.resetModules()
  })

  const seamBrief = (topic: string) => ({ ...brief, topic }) as unknown as Brief

  it('shouldMockBackground: only with MOCK_AI and a __MOCK_BG__ prefix sentinel', () => {
    expect(hooks.shouldMockBackground('Launch __MOCK_BG__')).toBe(true)
    expect(hooks.shouldMockBackground('Launch __MOCK_BG_FAIL__')).toBe(true)
    expect(hooks.shouldMockBackground('Launch __MOCK_BG_NOT_NEEDED__')).toBe(true)
    expect(hooks.shouldMockBackground('Launch')).toBe(false)
  })

  it('the fixture is a valid PNG data URL (persistDataUrlImage-compatible)', () => {
    const m = hooks.MOCK_BACKGROUND_DATA_URL.match(/^data:([^;]+);base64,(.+)$/)
    expect(m?.[1]).toBe('image/png')
    const bytes = Buffer.from(m![2], 'base64')
    expect(bytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  })

  it('no sentinel ⇒ today\'s early return: NOT_NEEDED, nothing resolved, no model call', async () => {
    await expect(seam.generateBackgroundForBrief(seamBrief('Plain'), kit, 'c', null, actor)).resolves.toEqual({
      url: null,
      skip: 'NOT_NEEDED',
    })
    await expect(seam.generateBackgroundForRefine(seamBrief('Plain'), kit, 'add a background', actor)).resolves.toEqual({
      url: null,
      skip: 'NOT_NEEDED',
    })
    expect(h.resolveImageProvider).not.toHaveBeenCalled()
    expect(h.anthropicCreate).not.toHaveBeenCalled()
  })

  it('__MOCK_BG__: resolution runs for real, the decision model is skipped, the fixture replaces generateImage', async () => {
    const real = providerReturning('https://real-provider.example.com/should-not-be-used.png')
    h.resolveImageProvider.mockResolvedValue(real)
    const result = await seam.generateBackgroundForBrief(seamBrief('Launch __MOCK_BG__'), kit, 'c', null, actor)
    expect(result).toEqual({ url: 'http://minio.example.com/generated-images/background-mock.png' })
    expect(h.resolveImageProvider).toHaveBeenCalledWith({ teamId: 'team-actor', userId: 'user-actor' }, undefined)
    expect(real.generateImage).not.toHaveBeenCalled()
    expect(h.persistDataUrlImage).toHaveBeenCalledWith(hooks.MOCK_BACKGROUND_DATA_URL, 'background')
    expect(h.anthropicCreate).not.toHaveBeenCalled()
    expect(h.runClaudeCli).not.toHaveBeenCalled()
  })

  it('__MOCK_BG__ with nothing resolvable ⇒ NO_PROVIDER', async () => {
    h.resolveImageProvider.mockResolvedValue(null)
    await expect(seam.generateBackgroundForBrief(seamBrief('Launch __MOCK_BG__'), kit, 'c', null, actor)).resolves.toEqual({
      url: null,
      skip: 'NO_PROVIDER',
    })
  })

  it('__MOCK_BG_FAIL__ ⇒ the fixture throws ⇒ PROVIDER_ERROR', async () => {
    h.resolveImageProvider.mockResolvedValue(providerReturning('https://x.example.com/x.png'))
    await expect(seam.generateBackgroundForBrief(seamBrief('Launch __MOCK_BG_FAIL__'), kit, 'c', null, actor)).resolves.toMatchObject({
      url: null,
      skip: 'PROVIDER_ERROR',
    })
  })

  it('__MOCK_BG_NOT_NEEDED__ ⇒ NOT_NEEDED with a provider present', async () => {
    const real = providerReturning('https://x.example.com/x.png')
    h.resolveImageProvider.mockResolvedValue(real)
    await expect(seam.generateBackgroundForBrief(seamBrief('Launch __MOCK_BG_NOT_NEEDED__'), kit, 'c', null, actor)).resolves.toEqual({
      url: null,
      skip: 'NOT_NEEDED',
    })
    expect(real.generateImage).not.toHaveBeenCalled()
  })

  it('refine reads the sentinel from the brief topic when the instruction has none', async () => {
    h.resolveImageProvider.mockResolvedValue(null)
    await expect(seam.generateBackgroundForRefine(seamBrief('Launch __MOCK_BG__'), kit, 'make it pop', actor)).resolves.toEqual({
      url: null,
      skip: 'NO_PROVIDER',
    })
    h.resolveImageProvider.mockResolvedValue(providerReturning('https://x.example.com/x.png'))
    await expect(seam.generateBackgroundForRefine(seamBrief('Launch __MOCK_BG_NOT_NEEDED__'), kit, 'make it pop', actor)).resolves.toEqual({
      url: null,
      skip: 'NOT_NEEDED',
    })
  })

  it('a sentinel in the refine INSTRUCTION wins over the topic', async () => {
    const real = providerReturning('https://real-provider.example.com/should-not-be-used.png')
    h.resolveImageProvider.mockResolvedValue(real)
    // The draft was generated with a background (__MOCK_BG__ topic); this refine fails.
    const failed = await seam.generateBackgroundForRefine(seamBrief('Launch __MOCK_BG__'), kit, 'Swap it for a beach __MOCK_BG_FAIL__', actor)
    expect(failed).toEqual({ url: null, skip: 'PROVIDER_ERROR', detail: 'Mock image provider failure (__MOCK_BG_FAIL__ sentinel)' })
    expect(refineSkipFields(failed)).toEqual({
      backgroundSkipReason: 'PROVIDER_ERROR',
      backgroundSkipDetail: 'Mock image provider failure (__MOCK_BG_FAIL__ sentinel)',
    })
    await expect(
      seam.generateBackgroundForRefine(seamBrief('Launch __MOCK_BG__'), kit, 'Bigger headline __MOCK_BG_NOT_NEEDED__', actor),
    ).resolves.toEqual({ url: null, skip: 'NOT_NEEDED' })
    // An instruction sentinel turns the seam on for a plain topic too.
    await expect(seam.generateBackgroundForRefine(seamBrief('Plain'), kit, 'Add one __MOCK_BG__', actor)).resolves.toEqual({
      url: 'http://minio.example.com/generated-images/background-mock.png',
    })
    expect(real.generateImage).not.toHaveBeenCalled()
    expect(h.anthropicCreate).not.toHaveBeenCalled()
  })

  it('backgroundSeamText: the instruction when it carries a sentinel, else the topic', () => {
    expect(hooks.backgroundSeamText('x __MOCK_BG_FAIL__', 'y __MOCK_BG__')).toBe('x __MOCK_BG_FAIL__')
    expect(hooks.backgroundSeamText('make it pop', 'y __MOCK_BG__')).toBe('y __MOCK_BG__')
    expect(hooks.backgroundSeamText('make it pop', 'Plain')).toBe('Plain')
  })
})

// ── FR-07: the writer rules + the poll's notice table ────────────────────────
describe('generationSkipFields — generation / regenerate-design / Path A', () => {
  it('a produced background clears the fields', () => {
    expect(generationSkipFields({ url: 'https://x/bg.png' })).toEqual(BACKGROUND_SKIP_CLEARED)
  })
  it('NOT_NEEDED clears the fields (a design choice, not a failure)', () => {
    expect(generationSkipFields({ url: null, skip: 'NOT_NEEDED' })).toEqual(BACKGROUND_SKIP_CLEARED)
  })
  it('Path A (no background step: null) clears the fields', () => {
    expect(generationSkipFields(null)).toEqual(BACKGROUND_SKIP_CLEARED)
  })
  it.each(['NO_PROVIDER', 'PROVIDER_ERROR', 'DECISION_ERROR'] as const)('%s sets the reason and the detail', (reason) => {
    expect(generationSkipFields({ url: null, skip: reason, detail: 'why' })).toEqual({
      backgroundSkipReason: reason,
      backgroundSkipDetail: 'why',
    })
  })
  it('a skip with no detail stores detail null', () => {
    expect(generationSkipFields({ url: null, skip: 'NO_PROVIDER' })).toEqual({
      backgroundSkipReason: 'NO_PROVIDER',
      backgroundSkipDetail: null,
    })
  })
})

describe('refineSkipFields — refine only touches the skip when it wanted a background', () => {
  it('a produced background clears the fields', () => {
    expect(refineSkipFields({ url: 'https://x/bg.png' })).toEqual(BACKGROUND_SKIP_CLEARED)
  })
  it('wanted one and the provider failed (PROVIDER_ERROR) ⇒ sets the reason and the detail', () => {
    expect(refineSkipFields({ url: null, skip: 'PROVIDER_ERROR', detail: 'd' })).toEqual({
      backgroundSkipReason: 'PROVIDER_ERROR',
      backgroundSkipDetail: 'd',
    })
  })
  // NO_PROVIDER: refine resolves first and never decided. NOT_NEEDED: not
  // asked for. DECISION_ERROR: the decision gave no answer, so nothing was asked.
  it.each(['NO_PROVIDER', 'NOT_NEEDED', 'DECISION_ERROR'] as const)('%s ⇒ undefined (leave the fields unchanged)', (reason) => {
    expect(refineSkipFields({ url: null, skip: reason })).toBeUndefined()
    expect(refineSkipFields({ url: null, skip: reason, detail: 'd' })).toBeUndefined()
  })
  it('a stored detail is redacted', () => {
    expect(refineSkipFields({ url: null, skip: 'PROVIDER_ERROR', detail: '401 bad key sk-proj-abc123' })).toEqual({
      backgroundSkipReason: 'PROVIDER_ERROR',
      backgroundSkipDetail: '401 bad key <redacted>',
    })
  })
})

describe('backgroundSkippedFor — the poll payload', () => {
  // The notice's title is "No AI background"; no body may repeat it.
  const TITLE = /no ai background/i

  it('nothing stored ⇒ null', () => {
    expect(backgroundSkippedFor(null, null)).toBeNull()
  })
  it('NOT_NEEDED (never stored, but defensive) and unknown values ⇒ null', () => {
    expect(backgroundSkippedFor('NOT_NEEDED', null)).toBeNull()
    expect(backgroundSkippedFor('SOMETHING_ELSE', null)).toBeNull()
  })
  it('NO_PROVIDER ⇒ the fixed fix-it message, leading with the cause', () => {
    expect(backgroundSkippedFor('NO_PROVIDER', null)).toEqual({
      reason: 'NO_PROVIDER',
      message:
        'No image provider is set up. Add an OpenAI key in Settings, or ask a team admin to add an image provider in Team settings.',
    })
  })
  it('PROVIDER_ERROR carries the detail', () => {
    expect(backgroundSkippedFor('PROVIDER_ERROR', '429 rate limited')).toEqual({
      reason: 'PROVIDER_ERROR',
      message: 'The image provider returned an error (429 rate limited), so the post was designed without one.',
    })
  })
  it('PROVIDER_ERROR with no detail reads cleanly', () => {
    expect(backgroundSkippedFor('PROVIDER_ERROR', null)!.message).toBe(
      'The image provider returned an error, so the post was designed without one.',
    )
  })
  it('DECISION_ERROR ⇒ the fixed message, provider/model text never echoed', () => {
    expect(backgroundSkippedFor('DECISION_ERROR', 'overloaded_error')).toEqual({
      reason: 'DECISION_ERROR',
      message: 'The step that plans the background failed, so the post was designed without one.',
    })
  })
  it.each([
    ['NO_PROVIDER', null],
    ['PROVIDER_ERROR', '429 rate limited'],
    ['PROVIDER_ERROR', null],
    ['PROVIDER_ERROR', 'moderation_blocked'],
    ['DECISION_ERROR', null],
  ] as const)('%s (%s): the body does not repeat the title', (reason, detail) => {
    expect(backgroundSkippedFor(reason, detail)!.message).not.toMatch(TITLE)
  })
  it('detail longer than the limit is clipped before it reaches the message', () => {
    const msg = backgroundSkippedFor('PROVIDER_ERROR', 'y'.repeat(1000))!.message
    expect(msg.length).toBeLessThan(SKIP_DETAIL_MAX + 120)
  })
  it('a stored detail is redacted again on read (rows written before redaction)', () => {
    const msg = backgroundSkippedFor('PROVIDER_ERROR', 'Incorrect API key provided: sk-proj-AbC123')!.message
    expect(msg).toBe(
      'The image provider returned an error (Incorrect API key provided: <redacted>), so the post was designed without one.',
    )
  })
  it('clipSkipDetail clips to SKIP_DETAIL_MAX (300)', () => {
    expect(SKIP_DETAIL_MAX).toBe(300)
    expect(clipSkipDetail('z'.repeat(301)).length).toBe(300)
    expect(clipSkipDetail('short')).toBe('short')
  })
})

describe('MODERATION_RE — refusals read as refused; transport and account errors do not', () => {
  const REFUSED = 'The image request was refused by the provider, so the post was designed without one.'

  it.each([
    '400 Your request was rejected as a result of our safety system. moderation_blocked',
    'moderation_blocked',
    'Gemini blocked the prompt: SAFETY',
    'Blocked by content policy',
    'content_policy_violation',
    'The image request was refused',
    'request refused by upstream filter',
    'Flagged by moderation',
  ])('refusal: %s', (detail) => {
    expect(MODERATION_RE.test(detail)).toBe(true)
    expect(backgroundSkippedFor('PROVIDER_ERROR', detail)!.message).toBe(REFUSED)
  })

  it.each([
    'ECONNREFUSED',
    'connect ECONNREFUSED 127.0.0.1:9000',
    'Your account is blocked',
    'Connection refused',
    '429 rate limited',
    'Incorrect API key provided',
  ])('not a refusal: %s', (detail) => {
    expect(MODERATION_RE.test(detail)).toBe(false)
    expect(backgroundSkippedFor('PROVIDER_ERROR', detail)!.message).not.toBe(REFUSED)
  })

  it('a connection error keeps its own (redacted) text', () => {
    expect(backgroundSkippedFor('PROVIDER_ERROR', 'connect ECONNREFUSED 127.0.0.1:9000')!.message).toBe(
      'The image provider returned an error (connect ECONNREFUSED <host>), so the post was designed without one.',
    )
  })
})

describe('redactSkipDetail — no credential or internal endpoint reaches a draft viewer', () => {
  it.each([
    ['Incorrect API key provided: sk-proj-AbC_12.3-x', 'Incorrect API key provided: <redacted>'],
    ['bad key sk-****************abcd', 'bad key <redacted>'],
    ['API key not valid: AIzaSyD-abc_123XYZ', 'API key not valid: <redacted>'],
    ['request failed ?key=AIzaSecret&alt=json', 'request failed ?key=<redacted>&alt=json'],
    ['api_key=abc123 rejected', 'api_key=<redacted> rejected'],
    ['POST https://generativelanguage.googleapis.com/v1beta/models/x:generate?key=abc failed', 'POST <url> failed'],
    ['fetch failed (http://minio:9000/generated-images/bg.png)', 'fetch failed (<url>)'],
    ['connect ECONNREFUSED 127.0.0.1:9000', 'connect ECONNREFUSED <host>'],
    ['getaddrinfo ENOTFOUND minio.internal:9000', 'getaddrinfo ENOTFOUND <host>'],
    ['upstream localhost:3001 closed', 'upstream <host> closed'],
    ['429 rate limited', '429 rate limited'],
    ['Mock image provider failure (__MOCK_BG_FAIL__ sentinel)', 'Mock image provider failure (__MOCK_BG_FAIL__ sentinel)'],
  ])('%s', (raw, redacted) => {
    expect(redactSkipDetail(raw)).toBe(redacted)
  })

  it('cleanSkipDetail redacts BEFORE clipping, so a key straddling the limit never leaks a prefix', () => {
    const raw = `${'x'.repeat(280)} sk-proj-${'A'.repeat(40)}`
    const cleaned = cleanSkipDetail(raw)
    expect(cleaned).not.toContain('sk-')
    expect(raw.slice(0, SKIP_DETAIL_MAX)).toContain('sk-proj-') // clipping alone would have leaked it
    expect(cleaned.endsWith('<redacted>')).toBe(true)
    expect(cleaned.length).toBeLessThanOrEqual(SKIP_DETAIL_MAX)
  })

  it('generation: a provider error is redacted at the source, before it is returned', async () => {
    h.resolveImageProvider.mockReset().mockResolvedValue({
      generateImage: async () => {
        throw new Error('401 Incorrect API key provided: sk-proj-Secret123 (https://api.openai.com/v1/images)')
      },
    })
    h.anthropicCreate.mockReset().mockResolvedValueOnce(decisionReply('{"needed": true, "prompt": "waves"}'))
    await expect(generateBackgroundForBrief(brief, kit, 'Big news!', null, actor)).resolves.toEqual({
      url: null,
      skip: 'PROVIDER_ERROR',
      detail: '401 Incorrect API key provided: <redacted> (<url>)',
    })
  })
})

describe('commitDraftRevision — the refine skip write rides the same draft write', () => {
  const base = { draftId: 'd1', instruction: 'add a background', html: '<html></html>', width: 1080, height: 1080, exportKey: 'exports/x.png' }

  beforeEach(() => {
    h.draftUpdates.length = 0
  })

  it('backgroundSkip set ⇒ both fields written next to imageUrl', async () => {
    const { commitDraftRevision } = await import('@/lib/drafts/revisions')
    await commitDraftRevision({
      ...base,
      backgroundSkip: { backgroundSkipReason: 'PROVIDER_ERROR', backgroundSkipDetail: 'rate limited' },
    })
    expect(h.draftUpdates).toHaveLength(1)
    expect(h.draftUpdates[0]).toMatchObject({ backgroundSkipReason: 'PROVIDER_ERROR', backgroundSkipDetail: 'rate limited' })
  })

  it('a produced background ⇒ imageUrl set and the fields cleared', async () => {
    const { commitDraftRevision } = await import('@/lib/drafts/revisions')
    await commitDraftRevision({ ...base, backgroundImageUrl: 'https://x/bg.png', backgroundSkip: BACKGROUND_SKIP_CLEARED })
    expect(h.draftUpdates[0]).toMatchObject({ imageUrl: 'https://x/bg.png', ...BACKGROUND_SKIP_CLEARED })
  })

  it('backgroundSkip omitted (override, inline edit, a refine that did not want one) ⇒ the fields are not touched', async () => {
    const { commitDraftRevision } = await import('@/lib/drafts/revisions')
    await commitDraftRevision(base)
    expect(h.draftUpdates[0]).not.toHaveProperty('backgroundSkipReason')
    expect(h.draftUpdates[0]).not.toHaveProperty('backgroundSkipDetail')
  })
})
