// 008 T13 — the `model` body fields (FR-17, AC-25) and the Brief initial
// request's write side (FR-10).
//
// The six FR-17 routes run for real: POST /api/briefs, regenerate-copy (all
// three forms), regenerate-design, refine, and the two assistant chats. The
// resolver (policy.ts → decideModel) runs for real on a faked TeamModelPolicy
// row and UserClaudeToken lookup, in a mode the test sets. Everything past each
// route's boundary is faked so the model that would run is observable: the
// caption writer, the Path B design, the refine attempt loop, the recorder
// (the chats under MOCK_AI) and the Brief row that is written.
//
// The order every route follows: parse → resolve (a refused pick is a 400) →
// claim. So a 400 claims nothing, runs nothing and writes nothing.

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'

const h = vi.hoisted(() => ({
  cli: false,
  draft: null as null | Record<string, unknown>,
  policy: null as null | Record<string, unknown>,
  token: null as null | { id: string },
  // The COPY row a caption run would use (the brief's key, else the team
  // default) — copyProviderIsClaude reads it. Default: the seeded 'cli' row.
  // 024: a row with its own providerKey is reached only through the brief's key
  // (it is not the team default); one without is the default.
  copyRow: { id: 'p1', providerName: 'cli' } as null | { id: string; providerName: string; providerKey?: string },
  copyLookups: vi.fn(),
  draftFindUnique: vi.fn(),
  briefCreate: vi.fn(),
  claimDraft: vi.fn(),
  claimCaption: vi.fn(),
  writeCaptions: vi.fn(),
  pathB: vi.fn(),
  attempts: vi.fn(),
  commit: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    draft: { findUnique: h.draftFindUnique, update: vi.fn() },
    brief: { create: h.briefCreate },
    campaign: { findFirst: async () => ({ id: 'c1', teamId: 'team1' }) },
    brandKit: {
      findUnique: async () => ({ id: 'k1', isDeleted: false, teamId: 'team1' }),
      findFirst: async () => ({ id: 'k1', teamId: 'team1' }),
    },
    brandKitTemplate: { findUnique: async () => null },
    availableProvider: {
      findFirst: async () => h.copyRow,
      // 024: the caption route loads the team's enabled COPY rows in one query.
      findMany: async (args: { where: { slot: string } }) => {
        h.copyLookups(args.where)
        return h.copyRow
          ? [
              {
                id: h.copyRow.id,
                providerKey: h.copyRow.providerKey ?? 'p1',
                providerName: h.copyRow.providerName,
                isDefault: h.copyRow.providerKey === undefined,
                createdAt: new Date(0),
              },
            ]
          : []
      },
    },
    team: { findUnique: async () => null },
    brandKitArtifact: { findMany: async () => [] },
    brandKitDocument: { findMany: async () => [] },
    teamModelPolicy: { findUnique: async () => h.policy },
    userClaudeToken: { findFirst: async () => h.token },
  },
}))
vi.mock('@/lib/api/handler', () => {
  const wrap =
    (handler: (req: unknown, ctx: { params: unknown }, user: unknown) => unknown) =>
    (req: unknown, ctx: { params: unknown }) =>
      handler(req, { params: ctx.params }, { userId: 'u1', teamId: 'team1' })
  return {
    parseBody: async (req: Request) => ({ data: await req.json() }),
    withTeamAuth: wrap,
    withTeamAdmin: wrap,
  }
})
vi.mock('@/lib/authz/visibility', () => ({ canAccessContent: () => true }))
// The mode, deterministically (the local .env may set CLI mode; CI has none).
vi.mock('@/lib/agent/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/agent/config')>()),
  isCliMode: () => h.cli,
  pipelineMode: () => (h.cli ? 'cli' : 'api'),
}))
// The chats short-circuit at their MOCK_AI branch, which records the model.
vi.mock('@/lib/testHooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/testHooks')>()),
  MOCK_AI: true,
}))
vi.mock('@/lib/agent/userToken', () => ({
  withClaudeAuth: (_u: string, _t: string, fn: () => unknown) => fn(),
}))
vi.mock('@/lib/storage/minio', () => ({
  isAllowedAssetUrl: () => true,
  resolveExportUrl: async (k: string | null) => k,
  BUCKET_DOCS: 'docs',
  getPresignedUrl: async () => 'https://minio.invalid/x',
}))
vi.mock('@/lib/renderer/puppeteer', () => ({ sampleImageColors: async () => [] }))
vi.mock('@/lib/brandkit/resolve', () => ({
  resolveBrandKit: async () => ({
    id: 'k1',
    name: 'Kit',
    colors: [],
    fonts: [],
    logos: [],
    artifacts: [],
  }),
}))
vi.mock('@/lib/campaign/briefing', () => ({ getActiveCampaignBriefing: async () => null }))
// The real copyProviderIsClaude (spec open question 1) on the faked COPY row;
// only the provider instance and the key lookup are faked.
vi.mock('@/providers/registry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/providers/registry')>()),
  resolveCopyProvider: async () => ({}),
  resolveAnthropicApiKey: async () => 'sk-ant-FAKE',
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
vi.mock('@/lib/captions/generate', () => ({ writeCaptions: h.writeCaptions }))
vi.mock('@/lib/captions/store', () => ({
  loadDraftCaptions: async () => ({
    captions: ['INSTAGRAM', 'LINKEDIN'].map((channel) => ({
      channel,
      model: 'claude-sonnet-5-5',
    })),
  }),
  claimCaptionAction: h.claimCaption,
  settleCaptionAction: async () => {},
}))
vi.mock('@/lib/agent/pathB', () => ({ runPathBDesign: h.pathB }))
vi.mock('@/lib/agent/background', () => ({
  generateBackgroundForRefine: async () => ({ url: null, skip: 'NOT_NEEDED', detail: null }),
}))
vi.mock('@/lib/agent/prompts/refine', () => ({
  buildRefineSystemPrompt: () => '',
  buildRefineUserMessage: () => '',
}))
vi.mock('@/lib/renderer/domFacts', () => ({ extractDomFacts: async () => ({ elements: [] }) }))
vi.mock('@/lib/drafts/refineVerify', () => ({ verifyRefine: vi.fn(), VERIFIER_PROMPT_VERSION: 'test-verifier' }))
vi.mock('@/lib/agent/designAgent', () => ({ runDesignAgentRefine: vi.fn() }))
vi.mock('@/lib/agent/designAgentCli', () => ({ runDesignAgentCliRefine: vi.fn() }))
vi.mock('@/lib/drafts/refineAttempt', () => ({
  runRefineAttempts: h.attempts,
  settleRefine: vi.fn(),
}))
vi.mock('@/lib/drafts/revisions', () => ({
  commitDraftRevision: h.commit,
  draftModelStamp: () => ({ model: null, modelSubstitutedFrom: null }),
  draftCompositionStamp: () => null,
  draftPostStyleStamp: () => null,
  recordRejectedRender: vi.fn(),
  currentRenderStamp: vi.fn(),
  draftStampFields: vi.fn(),
  withNextRevisionNumber: vi.fn(),
}))
vi.mock('@/lib/drafts/draftActions', () => ({
  claimDraftAction: h.claimDraft,
  touchDraftAction: async () => {},
  releaseDraftAction: async () => {},
  // Run the claimed work inline. Each boundary fake throws once it has seen
  // the model, so nothing past it needs faking; the throw is the work's own.
  startDraftAction: async (
    _d: string,
    _u: string,
    _t: string,
    _a: unknown,
    work: () => Promise<unknown>,
  ) => {
    await work().catch(() => {})
  },
}))

import { setModelCallSink, type ModelCallRecord } from '@/lib/models/modelCalls'
import {
  MODEL_NOT_ALLOWED,
  modelError,
  modelKeyMessage,
  modelKeySchema,
  parseModelField,
  parseRegenerateDesignBody,
  REGENERATE_DESIGN_SHAPE_MESSAGE,
} from '@/lib/models/requests'
import { REGENERATE_BOTH_MESSAGE, REGENERATE_SHAPE_MESSAGE } from '@/lib/captions/requests'
import { CAPTION_PROVIDER_NOT_CLAUDE_MESSAGE, captionProviderNotClaudeError } from '@/lib/models/requests'
import type { ModelKey, UserSurface } from '@/lib/models/catalogue'

const { POST: createBrief } = await import('@/app/api/briefs/route')
const { POST: regenerateCopy } = await import('@/app/api/drafts/[id]/regenerate-copy/route')
const { POST: regenerateDesign } = await import('@/app/api/drafts/[id]/regenerate-design/route')
const { POST: refine } = await import('@/app/api/drafts/[id]/refine/route')
const { POST: briefingChat } = await import('@/app/api/campaigns/[id]/briefing/chat/route')
const { POST: brandKitChat } = await import('@/app/api/admin/brandkits/[id]/assistant/chat/route')

let calls: ModelCallRecord[] = []
setModelCallSink({ record: (r) => calls.push(r), read: () => calls, clear: () => (calls = []) })
afterAll(() => setModelCallSink(null))

const ctx = { params: { id: 'x1' } } as never
type Handler = (req: never, ctx: never) => unknown
const send = (handler: Handler, body: unknown) =>
  handler(
    new Request('http://test/x', {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    }) as never,
    ctx,
  ) as Promise<Response>

const SONNET = 'claude-sonnet-5-5'
const ALL = ['HAIKU', 'SONNET', 'OPUS']
const MESSAGES = [{ role: 'user', content: 'Help me write the briefing' }]
const BRIEF = {
  topic: 'Cloud costs',
  goal: 'awareness',
  tone: 'professional',
  channels: ['LINKEDIN'],
  copyProviderKey: 'p1',
}

/** What ran (or would run) on the model boundary: key + source, or undefined if nothing ran. */
type Seen = { key: string; source: string } | undefined
const pickOf = (m: { key: string; source: string } | undefined): Seen =>
  m ? { key: m.key, source: m.source } : undefined

interface Route {
  name: string
  surface: UserSurface
  /** The default this route resolves with no pick, on the default policy in API mode. */
  defaultKey: ModelKey
  status: number
  call: (model?: unknown) => Promise<Response>
  seen: () => Seen
  /** Anything claimed or written on the route's behalf. */
  touched: () => boolean
}

// One row per FR-17 table entry (regenerate-copy once per form).
const ROUTES: Route[] = [
  {
    name: 'POST /api/briefs (captionModel)',
    surface: 'CAPTION',
    defaultKey: 'HAIKU',
    status: 201,
    call: (model) =>
      send(createBrief as Handler, { ...BRIEF, designMode: 'GENERATE', captionModel: model }),
    seen: () => {
      const data = h.briefCreate.mock.calls[0]?.[0].data
      return data?.captionModel ? { key: data.captionModel, source: 'request' } : undefined
    },
    touched: () => h.briefCreate.mock.calls.length > 0,
  },
  {
    name: 'POST /api/briefs (designModel, Path B)',
    surface: 'DESIGN_FREEFORM',
    defaultKey: 'SONNET',
    status: 201,
    call: (model) =>
      send(createBrief as Handler, { ...BRIEF, designMode: 'GENERATE', designModel: model }),
    seen: () => {
      const data = h.briefCreate.mock.calls[0]?.[0].data
      return data?.designModel ? { key: data.designModel, source: 'request' } : undefined
    },
    touched: () => h.briefCreate.mock.calls.length > 0,
  },
  ...(
    [
      ['{ model? } (Regenerate all)', {}],
      ['{ channel, model? }', { channel: 'LINKEDIN' }],
      ['{ headline: true, model? }', { headline: true }],
    ] as const
  ).map(([form, body]): Route => ({
    name: `regenerate-copy ${form}`,
    surface: 'CAPTION',
    defaultKey: 'SONNET', // like for like: the faked rows (and headline) are stamped Sonnet
    status: 202,
    call: (model) =>
      send(regenerateCopy as Handler, model === undefined ? body : { ...body, model }),
    seen: () => pickOf(h.writeCaptions.mock.calls[0]?.[3]),
    touched: () => h.claimCaption.mock.calls.length > 0,
  })),
  {
    name: 'regenerate-design { model? }',
    surface: 'DESIGN_FREEFORM',
    defaultKey: 'SONNET',
    status: 202,
    call: (model) => send(regenerateDesign as Handler, model === undefined ? {} : { model }),
    seen: () => pickOf(h.pathB.mock.calls[0]?.[5]),
    touched: () => h.claimDraft.mock.calls.length > 0,
  },
  {
    name: 'refine { instruction, model? }',
    surface: 'REFINE',
    defaultKey: 'SONNET',
    status: 202,
    call: (model) => send(refine as Handler, { instruction: 'darker', model }),
    seen: () => pickOf(h.attempts.mock.calls[0]?.[0].model),
    touched: () => h.claimDraft.mock.calls.length > 0,
  },
  {
    name: 'POST /api/campaigns/[id]/briefing/chat',
    surface: 'ASSISTANT_BRIEFING',
    defaultKey: 'SONNET',
    status: 200,
    call: (model) => send(briefingChat as Handler, { messages: MESSAGES, model }),
    seen: () => pickOf(calls[0]),
    touched: () => calls.length > 0,
  },
  {
    name: 'POST /api/admin/brandkits/[id]/assistant/chat',
    surface: 'ASSISTANT_BRANDKIT',
    defaultKey: 'SONNET',
    status: 200,
    call: (model) => send(brandKitChat as Handler, { messages: MESSAGES, model }),
    seen: () => pickOf(calls[0]),
    touched: () => calls.length > 0,
  },
]

const isBrief = (r: Route) => r.name.startsWith('POST /api/briefs')
const fieldOf = (r: Route) =>
  r.name.includes('captionModel')
    ? 'captionModel'
    : r.name.includes('designModel')
      ? 'designModel'
      : 'model'
/** POST /api/briefs takes two picks, so its 400 names the field (T15); the others don't. */
const fieldBody = (r: Route) => (isBrief(r) ? { field: fieldOf(r) } : {})

function draft(over: Record<string, unknown> = {}) {
  return {
    id: 'x1',
    teamId: 'team1',
    status: 'EXPORTED',
    headline: 'A headline',
    headlineModel: SONNET,
    htmlContent: '<html>current</html>',
    designModel: SONNET,
    designModelSubstitutedFrom: null,
    pendingConflict: null,
    brief: {
      id: 'b1',
      userId: 'u1',
      teamId: 'team1',
      campaignId: null,
      brandKitId: null,
      copyProviderKey: null,
      aspectRatio: 'SQUARE',
      designMode: 'GENERATE',
      topic: 'Topic',
    },
    ...over,
  }
}

const policy = (allowed: string[], gate = false) => ({
  allowedModels: allowed,
  requirePersonalTokenForGated: gate,
  defaults: [],
})

beforeEach(() => {
  h.cli = false
  h.policy = null // A2: no row → every model allowed, no gate, no team defaults
  h.token = null
  h.copyRow = { id: 'p1', providerName: 'cli' }
  h.copyLookups.mockReset()
  calls = []
  for (const fn of [
    h.draftFindUnique,
    h.briefCreate,
    h.claimDraft,
    h.claimCaption,
    h.writeCaptions,
    h.pathB,
    h.attempts,
    h.commit,
  ]) {
    fn.mockReset()
  }
  h.draftFindUnique.mockImplementation(async () => draft())
  h.briefCreate.mockImplementation(async ({ data }: { data: object }) => ({ id: 'b-new', ...data }))
  h.claimDraft.mockResolvedValue({ action: 'REFINE', claimId: 'c1' })
  h.claimCaption.mockResolvedValue({ action: 'REGENERATE_COPY', claimId: 'c1' })
  const stop = async () => {
    throw new Error('boundary reached')
  }
  h.writeCaptions.mockImplementation(stop)
  h.pathB.mockImplementation(stop)
  h.attempts.mockImplementation(stop)
  h.commit.mockResolvedValue({ revisionId: 'r2', exportKey: 'exports/r2.png' })
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('the pure helpers', () => {
  it('modelKeySchema is the closed, case-sensitive ModelKey enum', () => {
    for (const key of ALL) expect(modelKeySchema.safeParse(key).success).toBe(true)
    for (const bad of ['opus', 'Opus', 'gpt-4o', SONNET, '', null, 1]) {
      const parsed = modelKeySchema.safeParse(bad)
      expect(parsed.success).toBe(false)
      expect(!parsed.success && parsed.error.issues[0].message).toBe(
        'model must be HAIKU, SONNET or OPUS',
      )
    }
  })

  it("modelError maps a failed resolution to FR-17's 400 body", () => {
    expect(modelError({ message: "Opus 5.5 isn't allowed on this team" })).toStrictEqual({
      error: "Opus 5.5 isn't allowed on this team",
      code: MODEL_NOT_ALLOWED,
    })
    // T15 review: an optional field, only when given (the single-`model` routes pass none).
    expect(modelError({ message: 'm' }, 'designModel')).toStrictEqual({
      error: 'm',
      code: MODEL_NOT_ALLOWED,
      field: 'designModel',
    })
    expect(captionProviderNotClaudeError()).toStrictEqual({
      error: CAPTION_PROVIDER_NOT_CLAUDE_MESSAGE,
      code: MODEL_NOT_ALLOWED,
    })
    expect(captionProviderNotClaudeError('captionModel')).toStrictEqual({
      error: CAPTION_PROVIDER_NOT_CLAUDE_MESSAGE,
      code: MODEL_NOT_ALLOWED,
      field: 'captionModel',
    })
    expect(MODEL_NOT_ALLOWED).toBe('MODEL_NOT_ALLOWED')
  })

  it('parseModelField: absent → no pick; a key → that key; anything else (null included) → the 400 body naming the field', () => {
    expect(parseModelField(undefined)).toStrictEqual({ ok: true, value: undefined })
    expect(parseModelField('OPUS')).toStrictEqual({ ok: true, value: 'OPUS' })
    expect(parseModelField('opus', 'captionModel')).toStrictEqual({
      ok: false,
      body: { error: modelKeyMessage('captionModel'), code: 'MODEL_NOT_ALLOWED' },
    })
    expect(parseModelField(null).ok).toBe(false)
  })

  it('parseRegenerateDesignBody: {} or { model }, strict', () => {
    expect(parseRegenerateDesignBody({})).toStrictEqual({ ok: true, model: undefined })
    expect(parseRegenerateDesignBody({ model: 'HAIKU' })).toStrictEqual({
      ok: true,
      model: 'HAIKU',
    })
    expect(parseRegenerateDesignBody({ model: 'gpt-4o' })).toStrictEqual({
      ok: false,
      body: { error: modelKeyMessage(), code: 'MODEL_NOT_ALLOWED' },
    })
    expect(parseRegenerateDesignBody({ modle: 'HAIKU' })).toStrictEqual({
      ok: false,
      body: { error: REGENERATE_DESIGN_SHAPE_MESSAGE },
    })
    expect(parseRegenerateDesignBody([])).toStrictEqual({
      ok: false,
      body: { error: REGENERATE_DESIGN_SHAPE_MESSAGE },
    })
  })
})

describe('AC-25: every FR-17 route body accepts `model`', () => {
  it.each(ROUTES.map((r) => [r.name, r] as const))(
    '%s: an allowed pick runs, as the explicit request (tier 1)',
    async (_n, route) => {
      // Opus serves every one of these surfaces and is never any route's default here.
      const res = await route.call('OPUS')
      expect(res.status).toBe(route.status)
      expect(route.seen()).toEqual({ key: 'OPUS', source: 'request' })
    },
  )

  it.each(ROUTES.map((r) => [r.name, r] as const))(
    '%s: no pick → the default, exactly as before',
    async (_n, route) => {
      const res = await route.call(undefined)
      expect(res.status).toBe(route.status)
      if (isBrief(route)) {
        // FR-10: nothing to store — null, resolved later by the generation.
        expect(h.briefCreate.mock.calls[0][0].data).toMatchObject({
          captionModel: null,
          designModel: null,
        })
      } else {
        expect(route.seen()?.key).toBe(route.defaultKey)
        expect(route.seen()?.source).not.toBe('request')
      }
    },
  )

  it('POST /api/briefs writes both picks to the Brief (FR-10, the initial request)', async () => {
    const res = await send(createBrief as Handler, {
      ...BRIEF,
      designMode: 'GENERATE',
      captionModel: 'HAIKU',
      designModel: 'OPUS',
    })
    expect(res.status).toBe(201)
    expect(h.briefCreate.mock.calls[0][0].data).toMatchObject({
      captionModel: 'HAIKU',
      designModel: 'OPUS',
    })
  })

  it('an explicit pick wins over the regenerate stamp (FR-09: the stamp is tier 2)', async () => {
    h.draftFindUnique.mockImplementation(async () => draft({ designModel: 'claude-opus-5-5' }))
    await send(regenerateDesign as Handler, { model: 'HAIKU' })
    expect(pickOf(h.pathB.mock.calls[0][5])).toEqual({ key: 'HAIKU', source: 'request' })
  })
})

describe('AC-25: a model outside the closed keys is a 400 — parsed before anything is read', () => {
  it.each(ROUTES.flatMap((r) => ['gpt-4o', 'opus'].map((bad) => [r.name, bad, r] as const)))(
    '%s: model %j → 400 MODEL_NOT_ALLOWED, nothing read, claimed or run',
    async (_n, bad, route) => {
      const res = await route.call(bad)
      expect(res.status).toBe(400)
      expect(await res.json()).toStrictEqual({
        error: modelKeyMessage(fieldOf(route)),
        code: 'MODEL_NOT_ALLOWED',
        ...fieldBody(route),
      })
      expect(h.draftFindUnique).not.toHaveBeenCalled()
      expect(route.touched()).toBe(false)
      expect(route.seen()).toBeUndefined()
    },
  )
})

describe("a pick the team's effective set refuses is FR-17's 400, before the claim", () => {
  it.each(ROUTES.map((r) => [r.name, r] as const))(
    '%s: NOT_ALLOWED → "Opus 5.5 isn\'t allowed on this team"',
    async (_n, route) => {
      h.policy = policy(['HAIKU', 'SONNET'])
      const res = await route.call('OPUS')
      expect(res.status).toBe(400)
      expect(await res.json()).toStrictEqual({
        error: "Opus 5.5 isn't allowed on this team",
        code: 'MODEL_NOT_ALLOWED',
        ...fieldBody(route),
      })
      expect(route.touched()).toBe(false)
      expect(route.seen()).toBeUndefined()
    },
  )

  it.each(ROUTES.map((r) => [r.name, r] as const))(
    '%s: NEEDS_PERSONAL_TOKEN (CLI, the switch on, team credential) → 400; with a personal token it runs',
    async (_n, route) => {
      h.cli = true
      h.policy = policy(ALL, true)
      const res = await route.call('OPUS')
      expect(res.status).toBe(400)
      expect(await res.json()).toStrictEqual({
        error: 'Your team requires a personal Claude token for Opus 5.5 — connect one in Settings',
        code: 'MODEL_NOT_ALLOWED',
        ...fieldBody(route),
      })
      expect(route.touched()).toBe(false)

      h.token = { id: 'tok1' }
      const ok = await route.call('OPUS')
      expect(ok.status).toBe(route.status)
      expect(route.seen()).toEqual({ key: 'OPUS', source: 'request' })
    },
  )

  it('NOT_ELIGIBLE: designModel Opus on a Path A brief → "Opus 5.5 isn\'t available for template fill"; nothing written', async () => {
    const res = await send(createBrief as Handler, {
      ...BRIEF,
      designMode: 'TEMPLATE',
      designModel: 'OPUS',
    })
    expect(res.status).toBe(400)
    expect(await res.json()).toStrictEqual({
      error: "Opus 5.5 isn't available for template fill",
      code: 'MODEL_NOT_ALLOWED',
      field: 'designModel',
    })
    expect(h.briefCreate).not.toHaveBeenCalled()
  })

  it('both picks Opus on a Path A brief: the caption Opus is allowed, the refusal names designModel (T15 review)', async () => {
    const res = await send(createBrief as Handler, {
      ...BRIEF,
      designMode: 'TEMPLATE',
      captionModel: 'OPUS',
      designModel: 'OPUS',
    })
    expect(res.status).toBe(400)
    expect(await res.json()).toStrictEqual({
      error: "Opus 5.5 isn't available for template fill",
      code: 'MODEL_NOT_ALLOWED',
      field: 'designModel',
    })
    expect(h.briefCreate).not.toHaveBeenCalled()
  })

  it('both picks Opus, Opus not allowed: the caption is checked first, so the refusal names captionModel', async () => {
    h.policy = policy(['HAIKU', 'SONNET'])
    const res = await send(createBrief as Handler, {
      ...BRIEF,
      designMode: 'GENERATE',
      captionModel: 'OPUS',
      designModel: 'OPUS',
    })
    expect(res.status).toBe(400)
    expect(await res.json()).toStrictEqual({
      error: "Opus 5.5 isn't allowed on this team",
      code: 'MODEL_NOT_ALLOWED',
      field: 'captionModel',
    })
    expect(h.briefCreate).not.toHaveBeenCalled()
  })

  it('the design pick is checked against the surface of the chosen path: Haiku on Path A is written', async () => {
    const res = await send(createBrief as Handler, {
      ...BRIEF,
      designMode: 'TEMPLATE',
      designModel: 'HAIKU',
    })
    expect(res.status).toBe(201)
    expect(h.briefCreate.mock.calls[0][0].data).toMatchObject({
      designModel: 'HAIKU',
      captionModel: null,
    })
  })
})

describe('without a pick, an unresolvable surface keeps its wave-1 answer (not a 400)', () => {
  beforeEach(() => {
    h.policy = policy([]) // a hand-edited row: nothing allowed → NO_ALLOWED_MODEL
  })

  it.each([
    ['regenerate-design', () => send(regenerateDesign as Handler, undefined)],
    ['refine', () => send(refine as Handler, { instruction: 'darker' })],
    ['briefing chat', () => send(briefingChat as Handler, { messages: MESSAGES })],
    ['brand-kit chat', () => send(brandKitChat as Handler, { messages: MESSAGES })],
  ])('%s → 422 NO_ALLOWED_MODEL, nothing claimed', async (_n, call) => {
    const res = await call()
    expect(res.status).toBe(422)
    expect((await res.json()).code).toBe('NO_ALLOWED_MODEL')
    expect(h.claimDraft).not.toHaveBeenCalled()
  })

  it('regenerate-copy → its 422 COPY_ERROR, nothing claimed', async () => {
    const res = await send(regenerateCopy as Handler, undefined)
    expect(res.status).toBe(422)
    expect((await res.json()).code).toBe('COPY_ERROR')
    expect(h.claimCaption).not.toHaveBeenCalled()
  })

  it('POST /api/briefs resolves nothing without a pick: the brief is created (the generation fails closed later)', async () => {
    const res = await send(createBrief as Handler, { ...BRIEF, designMode: 'GENERATE' })
    expect(res.status).toBe(201)
  })
})

describe('the bodies stay strict', () => {
  it('regenerate-copy: { channel, headline: true, model } is still a 400, and nothing is read', async () => {
    const res = await send(regenerateCopy as Handler, {
      channel: 'LINKEDIN',
      headline: true,
      model: 'HAIKU',
    })
    expect(res.status).toBe(400)
    expect(await res.json()).toStrictEqual({ error: REGENERATE_BOTH_MESSAGE })
    expect(h.draftFindUnique).not.toHaveBeenCalled()
  })

  it('regenerate-copy: an unknown key beside model is still a 400', async () => {
    const res = await send(regenerateCopy as Handler, { model: 'HAIKU', copy: true })
    expect(res.status).toBe(400)
    expect(await res.json()).toStrictEqual({ error: REGENERATE_SHAPE_MESSAGE })
  })

  it('regenerate-design: an absent body is {}; any other key is a 400', async () => {
    expect((await send(regenerateDesign as Handler, undefined)).status).toBe(202)
    const res = await send(regenerateDesign as Handler, { modle: 'HAIKU' })
    expect(res.status).toBe(400)
    expect(await res.json()).toStrictEqual({ error: REGENERATE_DESIGN_SHAPE_MESSAGE })
  })
})

describe('refine: the Override path makes no model call', () => {
  const conflicted = () =>
    draft({
      pendingConflict: {
        conflictId: 'c1',
        pendingHtml: '<html>p</html>',
        explanation: 'x',
        model: SONNET,
      },
    })

  it('a valid pick is ignored: nothing resolved (nothing allowed would refuse it), the stored HTML commits', async () => {
    h.policy = policy([])
    h.draftFindUnique.mockImplementation(async () => conflicted())
    const res = await send(refine as Handler, { overrideConflictId: 'c1', model: 'OPUS' })
    expect(res.status).toBe(200)
    expect(h.commit).toHaveBeenCalledTimes(1)
    expect(h.claimDraft).not.toHaveBeenCalled()
  })

  it('a malformed pick is still a 400', async () => {
    h.draftFindUnique.mockImplementation(async () => conflicted())
    const res = await send(refine as Handler, { overrideConflictId: 'c1', model: 'opus' })
    expect(res.status).toBe(400)
    expect(h.commit).not.toHaveBeenCalled()
  })
})

describe('spec open question 1: a caption pick needs a Claude caption provider', () => {
  const NOT_CLAUDE = { error: CAPTION_PROVIDER_NOT_CLAUDE_MESSAGE, code: 'MODEL_NOT_ALLOWED' }
  const captionRoutes = ROUTES.filter((r) => r.surface === 'CAPTION')

  it('the message is the approved default, word for word', () => {
    expect(CAPTION_PROVIDER_NOT_CLAUDE_MESSAGE).toBe(
      "This team's caption provider is not Claude, so the caption model can't be chosen",
    )
  })

  it.each(captionRoutes.map((r) => [r.name, r] as const))(
    '%s: an OpenAI COPY provider → 400 with the message; nothing claimed, written or run',
    async (_n, route) => {
      h.copyRow = { id: 'p1', providerName: 'OpenAI' }
      const res = await route.call('HAIKU')
      expect(res.status).toBe(400)
      expect(await res.json()).toStrictEqual({ ...NOT_CLAUDE, ...fieldBody(route) })
      expect(route.touched()).toBe(false)
      expect(route.seen()).toBeUndefined()
    },
  )

  it.each(
    captionRoutes.flatMap((r) =>
      [
        ['a cli row', { id: 'p1', providerName: 'cli' }],
        ['an anthropic row', { id: 'p1', providerName: 'anthropic' }],
        ['no row (CLI `claude -p` / the ANTHROPIC_API_KEY fallback)', null],
      ].map(([label, row]) => [r.name, label, row, r] as const),
    ),
  )('%s: %s → the pick is accepted and runs', async (_n, _label, row, route) => {
    h.copyRow = row as typeof h.copyRow
    // A brief with no COPY row is a CLI-mode brief with no key (API mode requires one).
    const noRowBrief = isBrief(route) && row === null
    if (noRowBrief) h.cli = true
    const res = noRowBrief
      ? await send(createBrief as Handler, {
          ...BRIEF,
          copyProviderKey: undefined,
          designMode: 'GENERATE',
          captionModel: 'HAIKU',
        })
      : await route.call('HAIKU')
    expect(res.status).toBe(route.status)
    expect(route.seen()).toEqual({ key: 'HAIKU', source: 'request' })
  })

  it.each(captionRoutes.map((r) => [r.name, r] as const))(
    '%s: no caption pick → an OpenAI team is unaffected (the default runs, as before)',
    async (_n, route) => {
      h.copyRow = { id: 'p1', providerName: 'openai' }
      const res = await route.call(undefined)
      expect(res.status).toBe(route.status)
    },
  )

  it("regenerate-copy checks the draft's own provider: the brief's key, then the team default", async () => {
    h.draftFindUnique.mockImplementation(async () =>
      draft({ brief: { ...(draft().brief as object), copyProviderKey: 'openai-key' } }),
    )
    // Not the team default: the row is reached only through the brief's own key.
    h.copyRow = { id: 'p1', providerName: 'openai', providerKey: 'openai-key' }
    expect((await send(regenerateCopy as Handler, { model: 'HAIKU' })).status).toBe(400)
    expect(h.copyLookups.mock.calls[0][0]).toMatchObject({ slot: 'COPY', teamId: 'team1' })
  })

  it('POST /api/briefs: a design pick alone is unaffected by an OpenAI caption provider', async () => {
    h.copyRow = { id: 'p1', providerName: 'openai' }
    const res = await send(createBrief as Handler, {
      ...BRIEF,
      designMode: 'GENERATE',
      designModel: 'OPUS',
    })
    expect(res.status).toBe(201)
    expect(h.briefCreate.mock.calls[0][0].data).toMatchObject({
      captionModel: null,
      designModel: 'OPUS',
    })
  })
})
