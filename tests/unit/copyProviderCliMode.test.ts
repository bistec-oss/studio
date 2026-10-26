// resolveCopyProvider CLI-mode default (prod fix 2026-07-23): in CLI mode, copy
// generation must default to the local Claude CLI (billed via the OAuth chain in
// withClaudeAuth: personal -> team) WITHOUT requiring a registered COPY provider
// row. A registered API-key COPY provider still OVERRIDES — "whenever configured"
// (explicit providerKey OR a team default row). Outside CLI mode the old behavior
// is unchanged (throw when nothing is configured and no ANTHROPIC_API_KEY).

import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  availableProviderFindFirst: vi.fn(),
  availableProviderFindMany: vi.fn(),
  isCliMode: vi.fn(() => false),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    availableProvider: { findFirst: h.availableProviderFindFirst, findMany: h.availableProviderFindMany },
    // 024: the caption route reads the team's setting (never chosen here).
    team: { findUnique: async () => null },
  },
}))

vi.mock('@/lib/agent/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/agent/config')>()
  // 024: the caption loader reads pipelineMode(), so the mode is mocked there too.
  return { ...actual, isCliMode: h.isCliMode, pipelineMode: () => (h.isCliMode() ? 'cli' : 'api') }
})

// Real (constructable) mock classes — see imageProviderResolution.test.ts note.
vi.mock('@/providers/implementations/copy/openai', () => ({
  OpenAICopyProvider: class { constructor(public apiKey: string) {} },
}))
vi.mock('@/providers/implementations/copy/anthropic', () => ({
  AnthropicCopyProvider: class { constructor(public apiKey: string) {} },
}))
vi.mock('@/providers/implementations/copy/claude-cli', () => ({
  ClaudeCliCopyProvider: class { async generateCaptions() { return { raw: '', modelId: '', route: 'CLI' } } },
}))
vi.mock('@/providers/implementations/image/openai', () => ({
  OpenAIImageProvider: class { constructor(public apiKey: string) {} },
}))

// No env ANTHROPIC_API_KEY — so the CLI-mode branch is what saves resolution,
// not the env fallback.
vi.mock('@/lib/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/env')>()
  return { ...actual, env: { ...actual.env, ANTHROPIC_API_KEY: undefined, OPENAI_API_KEY: undefined } }
})

process.env.TOKEN_ENCRYPTION_KEY = 'b'.repeat(64)

const { encrypt } = await import('@/lib/crypto')
const { resolveCopyProvider } = await import('@/providers/registry')
const { ClaudeCliCopyProvider } = await import('@/providers/implementations/copy/claude-cli')
const { AnthropicCopyProvider } = await import('@/providers/implementations/copy/anthropic')

const TEAM_ID = 'team-1'
const TEAM_KEY = 'sk-ant-team-default-plaintext'

function anthropicRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ap-1', teamId: TEAM_ID, slot: 'COPY', providerKey: 'anthropic-123',
    providerName: 'anthropic', label: 'Anthropic', keyPrefix: '…xxxx',
    encryptedApiKey: encrypt(TEAM_KEY), isEnabled: true, isDefault: true,
    createdAt: new Date(), ...overrides,
  }
}

// 024: the caption route loads the team's enabled COPY rows with one findMany,
// then reads the chosen row's key by id.
function fakeRows(rows: Array<ReturnType<typeof anthropicRow>>) {
  h.availableProviderFindMany.mockResolvedValue(rows)
  h.availableProviderFindFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
    rows.find((r) => r.id === where.id && r.teamId === where.teamId) ?? null,
  )
}

beforeEach(() => {
  h.availableProviderFindFirst.mockReset()
  h.availableProviderFindMany.mockReset().mockResolvedValue([])
  h.isCliMode.mockReturnValue(false)
})

describe('resolveCopyProvider — CLI-mode default (no row required)', () => {
  it('CLI mode + no registered provider ⇒ ClaudeCliCopyProvider (no throw)', async () => {
    h.isCliMode.mockReturnValue(true)
    h.availableProviderFindMany.mockResolvedValue([])
    const provider = await resolveCopyProvider(TEAM_ID)
    expect(provider).toBeInstanceOf(ClaudeCliCopyProvider)
  })

  it('a registered team-default API-key provider OVERRIDES the CLI default (whenever configured)', async () => {
    h.isCliMode.mockReturnValue(true)
    fakeRows([anthropicRow()])
    const provider = await resolveCopyProvider(TEAM_ID)
    expect(provider).toBeInstanceOf(AnthropicCopyProvider)
    expect((provider as unknown as { apiKey: string }).apiKey).toBe(TEAM_KEY)
  })

  it('an explicit providerKey OVERRIDES the CLI default', async () => {
    h.isCliMode.mockReturnValue(true)
    fakeRows([anthropicRow({ id: 'ap-other', providerKey: 'other-key' }), anthropicRow({ isDefault: false })])
    const provider = await resolveCopyProvider(TEAM_ID, 'anthropic-123')
    expect(provider).toBeInstanceOf(AnthropicCopyProvider)
    expect((provider as unknown as { apiKey: string }).apiKey).toBe(TEAM_KEY)
  })
})

describe('resolveCopyProvider — non-CLI mode unchanged', () => {
  it('NOT CLI mode + nothing configured + no ANTHROPIC_API_KEY ⇒ still throws', async () => {
    h.isCliMode.mockReturnValue(false)
    h.availableProviderFindMany.mockResolvedValue([])
    await expect(resolveCopyProvider(TEAM_ID)).rejects.toThrow(/No caption provider is set up/)
  })
})

// 012 FR-21: under MOCK_AI the registry's COPY provider returns the raw mock
// caption reply (testHooks.buildMockCaptionReply), which the real extractor
// then parses — no row lookup, no provider call.
describe('resolveCopyProvider — MOCK_AI caption seam', () => {
  it('returns buildMockCaptionReply for the brief topic and the requested targets, stamped and recorded (008 FR-16)', async () => {
    vi.resetModules()
    vi.stubEnv('MOCK_AI', 'true')
    try {
      const { resolveCopyProvider: resolveMocked } = await import('@/providers/registry')
      const { buildMockCaptionReply } = await import('@/lib/testHooks')
      const { decideModel } = await import('@/lib/models/resolve')
      const { setModelCallSink } = await import('@/lib/models/modelCalls')
      const records: unknown[] = []
      setModelCallSink({ record: (r) => void records.push(r), read: () => [], clear() {} })
      const r = decideModel('CAPTION', {
        requested: 'SONNET',
        policy: { allowed: ['HAIKU', 'SONNET', 'OPUS'], defaults: {}, gateOn: false },
        credential: 'n/a',
        mode: 'api',
      })
      if (!r.ok) throw new Error(r.message)

      const provider = await resolveMocked(TEAM_ID)
      const brief = { topic: 'Launch', description: '', goal: 'g', tone: 't', channels: [] }
      await expect(provider.generateCaptions(brief, ['LINKEDIN'], r.resolved)).resolves.toEqual({
        raw: buildMockCaptionReply('Launch', ['LINKEDIN']),
        modelId: 'claude-sonnet-5-5',
        route: null,
      })
      // The seam short-circuits before the boundary, so it records the model it was handed.
      expect(records).toEqual([
        expect.objectContaining({ surface: 'CAPTION', key: 'SONNET', arg: 'claude-sonnet-5-5', source: 'request', label: 'copy', route: null }),
      ])
      expect(h.availableProviderFindFirst).not.toHaveBeenCalled()
      setModelCallSink(null)
    } finally {
      vi.unstubAllEnvs()
      vi.resetModules()
    }
  })
})
