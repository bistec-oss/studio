import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Brief } from '@prisma/client'
import type { ResolvedBrandKit } from '@/lib/brandkit/resolve'
import {
  buildBackgroundDecisionPrompt,
  buildRefineBackgroundDecisionPrompt,
} from '@/lib/agent/prompts/background'

// resolveImageProvider is resolved FIRST inside decideAndGenerate, before any
// model call — a null resolution (no personal/team OpenAI key configured)
// must short-circuit the whole background step without ever reaching the
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
}))

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

const { parseBackgroundDecision, imageSizeFor, generateBackgroundForBrief, generateBackgroundForRefine } =
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

describe('imageSizeFor', () => {
  it('maps SQUARE to 1024x1024 and PORTRAIT to 1024x1536', () => {
    expect(imageSizeFor('SQUARE')).toBe('1024x1024')
    expect(imageSizeFor('PORTRAIT')).toBe('1024x1536')
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

describe('generateBackgroundForBrief / generateBackgroundForRefine — null provider resolution', () => {
  beforeEach(() => {
    h.resolveImageProvider.mockReset().mockResolvedValue(null)
    h.runClaudeCli.mockClear()
    h.anthropicCreate.mockClear()
  })

  it('generateBackgroundForBrief: no provider configured (personal+team both absent) ⇒ null, decision model never called, no throw', async () => {
    await expect(generateBackgroundForBrief(brief, kit, 'Big news!', null, actor)).resolves.toBeNull()
    // The ctx passed to resolveImageProvider must be the ACTOR's, never the
    // brief's own teamId/userId (brief-team / user-owner).
    expect(h.resolveImageProvider).toHaveBeenCalledWith(
      { teamId: 'team-actor', userId: 'user-actor' },
      undefined
    )
    expect(h.runClaudeCli).not.toHaveBeenCalled()
    expect(h.anthropicCreate).not.toHaveBeenCalled()
  })

  it('generateBackgroundForRefine: no provider configured ⇒ null, decision model never called, no throw', async () => {
    await expect(generateBackgroundForRefine(brief, kit, 'add a background', actor)).resolves.toBeNull()
    expect(h.resolveImageProvider).toHaveBeenCalledWith(
      { teamId: 'team-actor', userId: 'user-actor' },
      undefined
    )
    expect(h.runClaudeCli).not.toHaveBeenCalled()
    expect(h.anthropicCreate).not.toHaveBeenCalled()
  })

  it('a rejected provider resolution is swallowed the same way (never fails the pipeline)', async () => {
    h.resolveImageProvider.mockReset().mockRejectedValue(new Error('db unreachable'))
    await expect(generateBackgroundForBrief(brief, kit, 'Big news!', null, actor)).resolves.toBeNull()
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
    h.anthropicCreate.mockReset().mockResolvedValue({
      content: [{ type: 'text', text: '{"needed": true, "prompt": "a nice background"}' }],
    })
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

    const url = await generateBackgroundForBrief(sharedBrief, kit, 'Big news!', null, {
      userId: ACTOR_ID,
      teamId: TEAM_ID,
    })

    expect(url).toBe(`https://cdn.example.com/personal-${ACTOR_ID}.png`)
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

    const url = await generateBackgroundForRefine(sharedBrief, kit, 'add a background', {
      userId: null,
      teamId: TEAM_ID,
    })

    expect(url).toBe('https://cdn.example.com/team-default.png')
    expect(h.resolveImageProvider).toHaveBeenCalledWith({ teamId: TEAM_ID, userId: null }, undefined)
  })
})
