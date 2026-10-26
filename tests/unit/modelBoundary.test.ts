// 008 T10 — AC-12 (FR-07, NFR-03): the boundary seam records the expected
// `arg` for every surface, in both modes, with CLAUDE_CLI_MODEL set and unset.
//
// Each of the 9 surfaces is driven through its REAL call-site function down to
// the REAL boundary (claudeCli.ts's spawn, anthropicCall.ts's createMessage)
// and the REAL resolver (policy.ts → decideModel). Only the edges are faked:
// `child_process.spawn`, the Anthropic client, Prisma (the team's policy row
// and the caller's personal token), the renderer/storage, and the pipeline
// mode. MOCK_AI is forced off, so no mock branch can stand in for a boundary.
//
// For each surface, in each scenario:
//   (a) CLI, env unset   → argv `--model <system default cliArg>` + one record;
//   (b) CLI, env OPUS    → Opus wherever it is eligible; DESIGN_TEMPLATE and
//                          the three internal surfaces stay on Haiku;
//   (c) API, env unset/set → the SDK request's `model` is the system default apiId;
//   (d) a team default of OPUS on DESIGN_FREEFORM → Opus in both modes;
//   (e) the timer armed at the boundary equals the entry's surface timeout.
//
// Where the product resolves inside the call site (assistants, internal
// surfaces) the test calls that entry point. Where it resolves one level up,
// in a route or the generation runner (CAPTION, DESIGN_*, REFINE), it calls the
// real resolveModel exactly as that caller does and passes the result to the
// real boundary-facing function — the runner's own wiring is pinned by
// captionWriters / renderStamps / draftActionModels.

import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest'

const h = vi.hoisted(() => ({
  mode: 'cli' as 'api' | 'cli',
  envCliModel: undefined as string | undefined,
  policyRow: null as null | {
    allowedModels: string[]
    requirePersonalTokenForGated: boolean
    defaults: Array<{ surface: string; model: string }>
  },
  // The text every fake reply carries (spawn stdout / SDK text block).
  reply: 'ok',
  spawnCalls: [] as Array<{ args: string[] }>,
  create: vi.fn(),
  extract: vi.fn(),
}))

vi.mock('child_process', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    spawn: vi.fn((_cmd: string, args: string[]) => {
      h.spawnCalls.push({ args })
      const child = Object.assign(new EventEmitter(), {
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        stdin: { write: vi.fn(), end: vi.fn(), on: vi.fn() },
        pid: 4242,
        kill: vi.fn(),
      })
      setImmediate(() => {
        child.stdout.emit('data', Buffer.from(h.reply))
        child.emit('close', 0)
      })
      return child
    }),
  }
})

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: (args: unknown, opts: unknown) => h.create(args, opts) }
  },
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    teamModelPolicy: { findUnique: async () => h.policyRow },
    // No personal token: the caller's credential tier is 'team' in CLI mode.
    userClaudeToken: { findFirst: async () => null },
    // 024: the CAPTION surface reads the team's caption route.
    team: { findUnique: async () => null },
  },
}))

// The mode is pinned per scenario, so the suite runs the same with or without
// a local .env (DESIGN_PROVIDER=cli here, nothing in CI).
vi.mock('@/lib/agent/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/agent/config')>()),
  isCliMode: () => h.mode === 'cli',
  pipelineMode: () => h.mode,
}))

// env.ts snapshots process.env at load; CLAUDE_CLI_MODEL is read through this
// proxy (already validated to a ModelKey, as env.ts would leave it).
vi.mock('@/lib/env', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/env')>()
  const env = new Proxy(mod.env, {
    get: (target, prop, receiver) =>
      prop === 'CLAUDE_CLI_MODEL' ? h.envCliModel : Reflect.get(target, prop, receiver),
  })
  return { ...mod, env }
})

vi.mock('@/lib/testHooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/testHooks')>()),
  MOCK_AI: false,
}))

vi.mock('@/providers/registry', () => ({
  resolveAnthropicApiKey: async () => 'sk-ant-api03-FAKE-unit-test',
  // A provider exists, so the background step reaches its decision call.
  resolveImageProviderWithSource: async () => ({
    provider: { providerName: 'openai', generateImage: vi.fn() },
    tier: 'team',
    providerName: 'openai',
  }),
}))
vi.mock('@/lib/brandkit/resolve', () => ({ resolveBrandKit: async () => null }))
vi.mock('@/lib/renderer/domFacts', () => ({ extractDomFacts: h.extract }))
vi.mock('@/lib/renderer/puppeteer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/renderer/puppeteer')>()),
  renderHtmlToPng: vi.fn(async () => Buffer.from('png')),
  // 030: runDesignAgentCli renders through renderPost. Unmocked, it launched a
  // real Chromium, which on the CI unit runner did not start inside 5 s.
  renderPost: vi.fn(async () => ({ png: Buffer.from('png'), headlineCheck: 'painted' as const })),
}))
vi.mock('@/lib/storage/minio', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/minio')>()),
  uploadObject: vi.fn(async () => {}),
}))
vi.mock('@/lib/agent/tools', () => ({
  toolRenderHtml: vi.fn(async () => ({ key: 'exports/k.png', url: 'u' })),
  toolGenerateImage: vi.fn(),
  toolGetBrandKitContext: vi.fn(async () => ({ colors: [] })),
}))

process.env.CLAUDE_CLI_DEBUG = '0'

const { CATALOGUE, entryFor, tableDefault } = await import('@/lib/models/catalogue')
const { resolveModel } = await import('@/lib/models/policy')
const { setModelCallSink } = await import('@/lib/models/modelCalls')
const { runWithClaudeAuth } = await import('@/lib/agent/claudeAuth')
const { ClaudeCliCopyProvider } = await import('@/providers/implementations/copy/claude-cli')
const { AnthropicCopyProvider } = await import('@/providers/implementations/copy/anthropic')
const { runDesignAgent, runDesignAgentRefine } = await import('@/lib/agent/designAgent')
const { runDesignAgentCli, runDesignAgentCliRefine } = await import('@/lib/agent/designAgentCli')
const { enhancePostBrief } = await import('@/lib/campaign/briefingAssistant')
const { draftBrandVoice } = await import('@/lib/brandkit/voiceDraft')
const { generateBackgroundForBrief } = await import('@/lib/agent/background')
const { verifyRefine } = await import('@/lib/drafts/refineVerify')
const { validateClaudeToken } = await import('@/lib/agent/userToken')

type ModelKey = import('@/lib/models/catalogue').ModelKey
type Surface = import('@/lib/models/catalogue').Surface
type UserSurface = import('@/lib/models/catalogue').UserSurface
type ModelCallRecord = import('@/lib/models/modelCalls').ModelCallRecord
type Brief = import('@prisma/client').Brief
type ResolvedBrandKit = import('@/lib/brandkit/resolve').ResolvedBrandKit

const TEAM = 'team-1'
const USER = 'user-1'
const HTML = '<!doctype html><html><body>x</body></html>'

async function resolved(surface: UserSurface) {
  const r = await resolveModel(surface, { userId: USER, teamId: TEAM, designPath: 'B' })
  if (!r.ok) throw new Error(r.message)
  return r.resolved
}

function el(tag: string, imageSources: string[] = []) {
  return {
    tag,
    id: null,
    classes: [],
    text: '',
    imageSources,
    fontSizePx: 16,
    box: { width: 400, height: 400 },
    style: {
      color: 'rgb(0, 0, 0)',
      backgroundColor: 'rgba(0, 0, 0, 0)',
      fontFamily: 'Inter',
      fontWeight: '400',
      fontStyle: 'normal',
      letterSpacing: 'normal',
    },
  }
}
function facts(elements: ReturnType<typeof el>[]) {
  return {
    text: '',
    imageSources: elements.flatMap((e) => e.imageSources),
    elementCount: elements.length,
    elements,
  }
}

const brief = {
  topic: 'Launch',
  description: 'A launch post',
  goal: 'awareness',
  tone: 'friendly',
  aspectRatio: 'SQUARE',
  imageProviderKey: null,
} as unknown as Brief
const kit: ResolvedBrandKit = {
  id: 'kit-1',
  name: 'Kit',
  colors: ['#000000'],
  fonts: [],
  logoUrl: null,
  logos: [],
  voicePrompt: null,
  source: 'default',
} as unknown as ResolvedBrandKit

// One row per surface: its real call site and a reply that call accepts.
const SURFACES: Array<{ surface: Surface; reply: string; run: () => Promise<unknown> }> = [
  {
    surface: 'CAPTION',
    reply: 'caption text',
    run: async () => {
      const model = await resolved('CAPTION')
      const provider =
        h.mode === 'cli' ? new ClaudeCliCopyProvider() : new AnthropicCopyProvider('sk-ant-api03-FAKE-unit-test')
      return provider.generateCaptions(
        { topic: 't', description: 'd', goal: 'g', tone: 'friendly', channels: ['INSTAGRAM'] },
        ['INSTAGRAM'],
        model,
      )
    },
  },
  ...(['DESIGN_TEMPLATE', 'DESIGN_FREEFORM'] as const).map((surface) => ({
    surface,
    reply: HTML,
    run: async () => {
      const model = await resolved(surface)
      const opts = { systemPrompt: 's', userMessage: 'u', briefId: 'b1', model, headline: 'h' }
      return h.mode === 'cli' ? runDesignAgentCli(opts) : runDesignAgent(opts)
    },
  })),
  {
    surface: 'REFINE',
    reply: HTML,
    run: async () => {
      const model = await resolved('REFINE')
      return h.mode === 'cli'
        ? runDesignAgentCliRefine({ systemPrompt: 's', userMessage: 'u', model })
        : runDesignAgentRefine({
            systemPrompt: 's',
            userMessage: 'u',
            briefId: 'b1',
            model,
            refine: { attempt: 1, instruction: 'i', slimHtml: HTML },
          })
    },
  },
  {
    surface: 'ASSISTANT_BRIEFING',
    reply: 'a sharper brief',
    run: () => enhancePostBrief({ topic: 't', content: 'c' }, TEAM, USER),
  },
  {
    surface: 'ASSISTANT_BRANDKIT',
    reply: 'a brand voice',
    run: () => draftBrandVoice(TEAM, USER, 'draft a voice'),
  },
  {
    surface: 'INTERNAL_BACKGROUND',
    reply: '{"needed": false, "prompt": ""}',
    run: () => generateBackgroundForBrief(brief, kit, 'Headline', null, { userId: USER, teamId: TEAM }),
  },
  {
    surface: 'INTERNAL_VERIFIER',
    reply: '{"applied": true, "reason": "a figure appears"}',
    run: () => {
      h.extract.mockImplementation(async (html: string) =>
        html.includes('before') ? facts([el('div')]) : facts([el('div'), el('img', ['https://minio.example.com/p.png'])]),
      )
      return verifyRefine({
        instruction: 'include a person',
        classes: ['add'],
        supersedes: [],
        constrains: [],
        beforeHtml: '<html><body>before</body></html>',
        afterHtml: '<html><body>after</body></html>',
        width: 1080,
        height: 1080,
        teamId: TEAM,
      })
    },
  },
  {
    surface: 'INTERNAL_TOKEN_PING',
    reply: 'pong',
    run: () => validateClaudeToken('sk-ant-oat01-FAKE-candidate'),
  },
]

const INTERNAL = new Set<Surface>(['INTERNAL_BACKGROUND', 'INTERNAL_VERIFIER', 'INTERNAL_TOKEN_PING'])

// The expected key, computed from the catalogue rather than restated.
function expectedKey(surface: Surface, envKey: ModelKey | null, mode: 'api' | 'cli'): ModelKey {
  if (INTERNAL.has(surface)) return 'HAIKU' // A14: fixed, never the env or a policy
  const table = tableDefault(surface as UserSurface, 'B')
  if (mode === 'cli' && envKey && entryFor(envKey)!.surfaces[surface]) return envKey
  return table
}
const argOf = (key: ModelKey, mode: 'api' | 'cli') => (mode === 'cli' ? entryFor(key)!.cliArg : entryFor(key)!.apiId)
const timeoutOf = (key: ModelKey, surface: Surface) => entryFor(key)!.surfaces[surface]!.timeoutMs

let records: ModelCallRecord[]
let timers: number[]
let timeoutSpy: ReturnType<typeof vi.spyOn>
let logSpies: Array<ReturnType<typeof vi.spyOn>>

beforeEach(() => {
  h.mode = 'cli'
  h.envCliModel = undefined
  h.policyRow = null
  h.spawnCalls.length = 0
  h.create.mockReset()
  h.extract.mockReset()
  records = []
  setModelCallSink({ record: (r) => void records.push(r), read: () => records, clear: () => (records = []) })
  // Every timer armed during the call: the spawn's kill timer and
  // createMessage's abort timer are among them (e).
  timers = []
  const realSetTimeout = globalThis.setTimeout
  timeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, ms?: number) => {
    timers.push(ms ?? 0)
    return realSetTimeout(fn, ms)
  }) as typeof setTimeout)
  // createMessage's design-loop deadline is startedAt + timeout: freeze the
  // clock so the armed delay is exactly the timeout.
  vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000)
  logSpies = (['log', 'info', 'warn'] as const).map((k) => vi.spyOn(console, k).mockImplementation(() => {}))
})

afterEach(() => {
  setModelCallSink(null)
  timeoutSpy.mockRestore()
  vi.mocked(Date.now).mockRestore()
  for (const s of logSpies) s.mockRestore()
})

async function runSurface(row: (typeof SURFACES)[number]) {
  h.reply = row.reply
  h.create.mockResolvedValue({
    content: [{ type: 'text', text: row.reply }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 1, output_tokens: 1 },
  })
  const auth = { token: 'sk-ant-oat01-FAKE-unit-test', userId: USER, teamId: TEAM, onAuthFailure: async () => {} }
  return runWithClaudeAuth(auth, row.run)
}

function cliModelArg(): string[] {
  expect(h.spawnCalls).toHaveLength(1)
  const args = h.spawnCalls[0].args
  expect(args.filter((a) => a === '--model')).toHaveLength(1)
  return args.slice(args.indexOf('--model'), args.indexOf('--model') + 2)
}

function expectOneRecord(surface: Surface, key: ModelKey, mode: 'api' | 'cli') {
  expect(records).toHaveLength(1)
  expect(records[0]).toMatchObject({ surface, key, arg: argOf(key, mode), mode })
}

describe('AC-12: every surface reaches its boundary with its resolved arg', () => {
  it('covers all 9 surfaces (6 user + 3 internal)', () => {
    expect(SURFACES.map((s) => s.surface).sort()).toEqual(
      [
        'CAPTION',
        'DESIGN_TEMPLATE',
        'DESIGN_FREEFORM',
        'REFINE',
        'ASSISTANT_BRIEFING',
        'ASSISTANT_BRANDKIT',
        'INTERNAL_BACKGROUND',
        'INTERNAL_VERIFIER',
        'INTERNAL_TOKEN_PING',
      ].sort(),
    )
  })

  describe.each(SURFACES)('$surface', (row) => {
    it('(a) CLI, CLAUDE_CLI_MODEL unset: --model <system default cliArg>, one record, the surface timeout', async () => {
      await runSurface(row)
      const key = expectedKey(row.surface, null, 'cli')
      expect(cliModelArg()).toEqual(['--model', argOf(key, 'cli')])
      expectOneRecord(row.surface, key, 'cli')
      // (e)
      expect(timers).toContain(timeoutOf(key, row.surface))
    })

    it('(b) CLI, CLAUDE_CLI_MODEL=OPUS: Opus where eligible, else the table default; internal surfaces stay Haiku', async () => {
      h.envCliModel = 'OPUS'
      await runSurface(row)
      const key = expectedKey(row.surface, 'OPUS', 'cli')
      if (INTERNAL.has(row.surface) || row.surface === 'DESIGN_TEMPLATE') expect(key).toBe('HAIKU')
      else expect(key).toBe('OPUS')
      expect(cliModelArg()).toEqual(['--model', argOf(key, 'cli')])
      expectOneRecord(row.surface, key, 'cli')
      expect(timers).toContain(timeoutOf(key, row.surface))
    })

    it.each([undefined, 'OPUS'])('(c) API mode, CLAUDE_CLI_MODEL=%s: the SDK request model is the system default apiId', async (envKey) => {
      h.mode = 'api'
      h.envCliModel = envKey
      const result = await runSurface(row)
      expect(h.spawnCalls).toHaveLength(0)
      if (row.surface === 'INTERNAL_TOKEN_PING') {
        // The ping is CLI-only by nature: in API mode a token is stored
        // unvalidated and no model is called (userToken.ts).
        expect(result).toEqual({ ok: true, skipped: true })
        expect(h.create).not.toHaveBeenCalled()
        expect(records).toEqual([])
        return
      }
      const key = expectedKey(row.surface, null, 'api')
      expect(h.create).toHaveBeenCalledTimes(1)
      expect(h.create.mock.calls[0][0]).toMatchObject({ model: argOf(key, 'api') })
      expect((h.create.mock.calls[0][1] as { signal?: unknown })?.signal).toBeInstanceOf(AbortSignal)
      expectOneRecord(row.surface, key, 'api')
      // (e) createMessage's abort timer
      expect(timers).toContain(timeoutOf(key, row.surface))
    })
  })

  describe('(d) a team default of OPUS on the DESIGN_FREEFORM row', () => {
    const freeform = SURFACES.find((s) => s.surface === 'DESIGN_FREEFORM')!
    beforeEach(() => {
      h.policyRow = {
        allowedModels: CATALOGUE.map((e) => e.key),
        requirePersonalTokenForGated: false,
        defaults: [{ surface: 'DESIGN_FREEFORM', model: 'OPUS' }],
      }
    })

    it.each(['cli', 'api'] as const)('%s mode: the recorded arg is Opus, on its own timeout', async (mode) => {
      h.mode = mode
      await runSurface(freeform)
      expectOneRecord('DESIGN_FREEFORM', 'OPUS', mode)
      expect(records[0].source).toBe('team')
      if (mode === 'cli') expect(cliModelArg()).toEqual(['--model', argOf('OPUS', 'cli')])
      else expect(h.create.mock.calls[0][0]).toMatchObject({ model: argOf('OPUS', 'api') })
      expect(timers).toContain(timeoutOf('OPUS', 'DESIGN_FREEFORM'))
    })

    it('…and it beats CLAUDE_CLI_MODEL (the env is only the system default)', async () => {
      h.envCliModel = 'HAIKU'
      await runSurface(freeform)
      expectOneRecord('DESIGN_FREEFORM', 'OPUS', 'cli')
    })
  })
})

// 031 FR-01: vitest workers are killed without an 'exit' event, so remove the
// spawn cwd this file created.
afterAll(async () => {
  const m = (await import('@/lib/agent/claudeCli')) as { cleanupSpawnCwd?: () => void }
  m.cleanupSpawnCwd?.()
})
