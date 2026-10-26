// 024 FR-03 / AC-04 / AC-14 (unit half): resolveCopyProvider and
// copyProviderIsClaude follow the selector's decision. Prisma and the provider
// classes are faked; pipelineMode is mocked (the copyProviderCliMode.test.ts
// pattern); crypto is real.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'

const h = vi.hoisted(() => ({
  mode: 'api' as 'api' | 'cli',
  setting: null as null | 'CLI' | 'API_KEY',
  rows: [] as Array<Record<string, unknown>>,
  findMany: vi.fn(),
  findFirst: vi.fn(),
  serverKey: undefined as string | undefined,
  cliBuilt: 0,
  cliError: null as Error | null,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    team: { findUnique: async () => ({ captionRoute: h.setting }) },
    availableProvider: { findMany: h.findMany, findFirst: h.findFirst },
  },
}))
vi.mock('@/lib/agent/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/agent/config')>()),
  isCliMode: () => h.mode === 'cli',
  pipelineMode: () => h.mode,
}))
vi.mock('@/lib/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/env')>()
  return {
    ...actual,
    env: {
      ...actual.env,
      get ANTHROPIC_API_KEY() {
        return h.serverKey
      },
      OPENAI_API_KEY: undefined,
    },
  }
})
vi.mock('@/providers/implementations/copy/openai', () => ({
  OpenAICopyProvider: class {
    constructor(public apiKey: string) {}
  },
}))
vi.mock('@/providers/implementations/copy/anthropic', () => ({
  AnthropicCopyProvider: class {
    constructor(
      public apiKey: string,
      public route: string = 'API_KEY',
    ) {}
  },
}))
vi.mock('@/providers/implementations/copy/claude-cli', () => ({
  ClaudeCliCopyProvider: class {
    constructor() {
      h.cliBuilt += 1
    }
    async generateCaptions() {
      if (h.cliError) throw h.cliError
      return { raw: '', modelId: '', route: 'CLI' }
    }
  },
}))
vi.mock('@/providers/implementations/image/openai', () => ({
  OpenAIImageProvider: class {},
}))

process.env.TOKEN_ENCRYPTION_KEY = 'b'.repeat(64)

const { encrypt } = await import('@/lib/crypto')
const { resolveCopyProvider, copyProviderIsClaude } = await import('@/providers/registry')
const { RouteNotReadyError, API_KEY_NOT_READY_MESSAGE } = await import('@/lib/models/route')
const { ClaudeCliCopyProvider } = await import('@/providers/implementations/copy/claude-cli')
const { AnthropicCopyProvider } = await import('@/providers/implementations/copy/anthropic')

const TEAM = 'team-1'
const ROW_KEY = 'sk-ant-row-plaintext'

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'row-secret-id',
    teamId: TEAM,
    slot: 'COPY',
    providerKey: 'anthropic-1',
    providerName: 'anthropic',
    isEnabled: true,
    isDefault: true,
    createdAt: new Date(0),
    encryptedApiKey: encrypt(ROW_KEY),
    ...over,
  }
}

function setRows(rows: Array<ReturnType<typeof row>>) {
  h.rows = rows
}

let info: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  h.mode = 'api'
  h.setting = null
  h.rows = []
  h.serverKey = undefined
  h.cliBuilt = 0
  h.cliError = null
  h.findMany.mockReset().mockImplementation(async () => h.rows)
  h.findFirst.mockReset().mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
    h.rows.find((r) => r.id === where.id && r.teamId === where.teamId) ?? null,
  )
  info = vi.spyOn(console, 'info').mockImplementation(() => {})
})
afterEach(() => info.mockRestore())

describe('resolveCopyProvider — a chosen API_KEY route (AC-04)', () => {
  it.each(['cli', 'api'] as const)(
    'builds the SDK provider from the anthropic row\'s key in %s mode, and never the CLI provider',
    async (mode) => {
      h.mode = mode
      h.setting = 'API_KEY'
      setRows([row()])
      const provider = await resolveCopyProvider(TEAM, 'whatever-the-brief-says')
      expect(provider).toBeInstanceOf(AnthropicCopyProvider)
      expect(provider).toMatchObject({ apiKey: ROW_KEY, route: 'API_KEY' })
      expect(h.cliBuilt).toBe(0)
    },
  )

  it('with the row removed it throws the route-named error, builds nothing and never uses the server key', async () => {
    for (const mode of ['cli', 'api'] as const) {
      h.mode = mode
      h.setting = 'API_KEY'
      h.serverKey = 'sk-ant-server-key'
      setRows([row({ providerName: 'openai' })])
      const err = await resolveCopyProvider(TEAM).catch((e) => e)
      expect(err).toBeInstanceOf(RouteNotReadyError)
      expect(err.message).toBe(API_KEY_NOT_READY_MESSAGE)
      expect(h.cliBuilt).toBe(0)
      // No key row is read at all: the decision stopped before the resolver's own query.
      expect(h.findFirst).not.toHaveBeenCalled()
    }
  })

  it('a team-scoped, key-free row query: the loader never selects encryptedApiKey', async () => {
    h.setting = 'API_KEY'
    setRows([row()])
    await resolveCopyProvider(TEAM)
    expect(h.findMany).toHaveBeenCalledTimes(1)
    const arg = h.findMany.mock.calls[0][0]
    expect(arg.where).toEqual({ slot: 'COPY', teamId: TEAM, isEnabled: true })
    expect(arg.select).not.toHaveProperty('encryptedApiKey')
    await copyProviderIsClaude(TEAM)
    expect(h.findMany.mock.calls[1][0].select).not.toHaveProperty('encryptedApiKey')
  })

  it('logs route, chosen and team: never a key or a row id', async () => {
    h.setting = 'API_KEY'
    setRows([row()])
    await resolveCopyProvider(TEAM)
    const lines = info.mock.calls.map((c: unknown[]) => String(c[0]))
    expect(lines).toContain(`[captions] route=API_KEY chosen=true team=${TEAM}`)
    for (const line of lines) {
      expect(line).not.toContain(ROW_KEY)
      expect(line).not.toContain('row-secret-id')
      expect(line).not.toMatch(/sk-ant|…/)
    }
  })
})

describe('resolveCopyProvider — a chosen CLI route (AC-04)', () => {
  it('in CLI mode returns the CLI provider and never decrypts an anthropic row', async () => {
    h.mode = 'cli'
    h.setting = 'CLI'
    setRows([row()])
    const provider = await resolveCopyProvider(TEAM, 'anthropic-1')
    expect(provider).toBeInstanceOf(ClaudeCliCopyProvider)
    expect(h.findFirst).not.toHaveBeenCalled()
  })

  it('in API mode it is not ready (a spawn would have no credential)', async () => {
    h.mode = 'api'
    h.setting = 'CLI'
    await expect(resolveCopyProvider(TEAM)).rejects.toBeInstanceOf(RouteNotReadyError)
    expect(h.cliBuilt).toBe(0)
  })

  it('the decorator rewrites only the no-credential error, keeping the original text and cause', async () => {
    h.mode = 'cli'
    h.setting = 'CLI'
    const provider = await resolveCopyProvider(TEAM)
    const original = new Error('No Claude credential configured for this run')
    h.cliError = original
    const err = await provider.generateCaptions({} as never, [], {} as never).catch((e) => e)
    expect(err.message).toBe(
      'Captions are set to the CLI route, but no Claude credential is available: No Claude credential configured for this run',
    )
    expect(err.cause).toBe(original)
    expect(err.message).toMatch(/no claude credential/i)

    const other = new Error('Claude CLI timed out')
    h.cliError = other
    await expect(provider.generateCaptions({} as never, [], {} as never)).rejects.toBe(other)
  })

  it('a never-chosen team on the CLI default keeps the original error unchanged (NFR-01)', async () => {
    h.mode = 'cli'
    h.setting = null
    const provider = await resolveCopyProvider(TEAM)
    const original = new Error('No Claude credential configured for this run')
    h.cliError = original
    await expect(provider.generateCaptions({} as never, [], {} as never)).rejects.toBe(original)
  })
})

describe('resolveCopyProvider — never chosen resolves as before', () => {
  it('a default anthropic row, an explicit brief key, the CLI default, the server key and the error', async () => {
    setRows([row()])
    expect(await resolveCopyProvider(TEAM)).toMatchObject({ apiKey: ROW_KEY })

    setRows([row({ isDefault: false }), row({ id: 'r2', providerKey: 'mine', encryptedApiKey: encrypt('sk-mine') })])
    expect(await resolveCopyProvider(TEAM, 'mine')).toMatchObject({ apiKey: 'sk-mine' })

    setRows([])
    h.mode = 'cli'
    expect(await resolveCopyProvider(TEAM)).toBeInstanceOf(ClaudeCliCopyProvider)

    h.mode = 'api'
    h.serverKey = 'sk-server'
    expect(await resolveCopyProvider(TEAM)).toMatchObject({ apiKey: 'sk-server', route: 'SERVER_KEY' })

    h.serverKey = undefined
    await expect(resolveCopyProvider(TEAM)).rejects.toThrow(/No caption provider is set up/)
  })
})

describe('AC-14: machine callers resolve the team route', () => {
  it("the scheduler's 'env-default' brief key and MCP's absent key resolve the same chosen row", async () => {
    h.setting = 'API_KEY'
    setRows([row()])
    const scheduler = await resolveCopyProvider(TEAM, 'env-default')
    const mcp = await resolveCopyProvider(TEAM, undefined)
    expect(scheduler).toMatchObject({ apiKey: ROW_KEY, route: 'API_KEY' })
    expect(mcp).toMatchObject({ apiKey: ROW_KEY, route: 'API_KEY' })
  })

  it('a chosen CLI route resolves the CLI provider for them too', async () => {
    h.mode = 'cli'
    h.setting = 'CLI'
    expect(await resolveCopyProvider(TEAM, 'env-default')).toBeInstanceOf(ClaudeCliCopyProvider)
  })

  it('no per-caller branch exists in resolveCopyProvider', () => {
    const src = readFileSync('src/providers/registry.ts', 'utf8')
    const body = src.slice(
      src.indexOf('export async function resolveCopyProvider'),
      src.indexOf('// Resolve a raw Anthropic API key'),
    )
    expect(body).not.toMatch(/userId|scheduler|mcp|acp/i)
  })
})

describe('copyProviderIsClaude', () => {
  it('is false only for an openai row under a never-chosen team', async () => {
    setRows([row({ providerName: 'openai' })])
    expect(await copyProviderIsClaude(TEAM)).toBe(false)
    h.setting = 'API_KEY'
    expect(await copyProviderIsClaude(TEAM)).toBe(true)
    h.setting = null
    setRows([row({ providerName: 'anthropic' })])
    expect(await copyProviderIsClaude(TEAM)).toBe(true)
    setRows([])
    expect(await copyProviderIsClaude(TEAM)).toBe(true) // no provider at all: the picker stays visible
  })
})

describe('resolveCopyProvider — the MOCK_AI seam decides before it short-circuits', () => {
  async function mocked() {
    vi.resetModules()
    vi.stubEnv('MOCK_AI', 'true')
    return import('@/providers/registry')
  }
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('a chosen route that is not ready throws in the mock, as in prod', async () => {
    h.setting = 'API_KEY'
    setRows([])
    const { resolveCopyProvider: resolveMocked } = await mocked()
    await expect(resolveMocked(TEAM)).rejects.toThrow(/API key route/)
  })

  it('a never-chosen team with nothing configured is ignored by the mock, and reports route null', async () => {
    setRows([])
    const { resolveCopyProvider: resolveMocked } = await mocked()
    const provider = await resolveMocked(TEAM)
    const { decideModel } = await import('@/lib/models/resolve')
    const r = decideModel('CAPTION', {
      policy: { allowed: ['HAIKU', 'SONNET', 'OPUS'], defaults: {}, gateOn: false },
      credential: 'n/a',
      mode: 'api',
    })
    if (!r.ok) throw new Error(r.message)
    const reply = await provider.generateCaptions({ topic: 't' } as never, ['LINKEDIN'], r.resolved)
    expect(reply.route).toBeNull()
  })

  it('a chosen ready route stamps and records its route', async () => {
    h.setting = 'API_KEY'
    setRows([row()])
    const { resolveCopyProvider: resolveMocked } = await mocked()
    const { setModelCallSink } = await import('@/lib/models/modelCalls')
    const { decideModel } = await import('@/lib/models/resolve')
    const records: Array<Record<string, unknown>> = []
    setModelCallSink({ record: (rec) => void records.push(rec as never), read: () => [], clear() {} })
    const r = decideModel('CAPTION', {
      policy: { allowed: ['HAIKU', 'SONNET', 'OPUS'], defaults: {}, gateOn: false },
      credential: 'n/a',
      mode: 'api',
    })
    if (!r.ok) throw new Error(r.message)
    const provider = await resolveMocked(TEAM)
    const reply = await provider.generateCaptions({ topic: 't' } as never, ['LINKEDIN'], r.resolved)
    expect(reply.route).toBe('API_KEY')
    expect(records).toEqual([expect.objectContaining({ label: 'copy', route: 'API_KEY' })])
    setModelCallSink(null)
  })
})
