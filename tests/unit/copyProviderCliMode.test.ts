// resolveCopyProvider CLI-mode default (prod fix 2026-07-23): in CLI mode, copy
// generation must default to the local Claude CLI (billed via the OAuth chain in
// withClaudeAuth: personal -> team) WITHOUT requiring a registered COPY provider
// row. A registered API-key COPY provider still OVERRIDES — "whenever configured"
// (explicit providerKey OR a team default row). Outside CLI mode the old behavior
// is unchanged (throw when nothing is configured and no ANTHROPIC_API_KEY).

import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  availableProviderFindFirst: vi.fn(),
  isCliMode: vi.fn(() => false),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: { availableProvider: { findFirst: h.availableProviderFindFirst } },
}))

vi.mock('@/lib/agent/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/agent/config')>()
  return { ...actual, isCliMode: h.isCliMode }
})

// Real (constructable) mock classes — see imageProviderResolution.test.ts note.
vi.mock('@/providers/implementations/copy/openai', () => ({
  OpenAICopyProvider: class { constructor(public apiKey: string) {} },
}))
vi.mock('@/providers/implementations/copy/anthropic', () => ({
  AnthropicCopyProvider: class { constructor(public apiKey: string) {} },
}))
vi.mock('@/providers/implementations/copy/claude-cli', () => ({
  ClaudeCliCopyProvider: class {},
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

beforeEach(() => {
  h.availableProviderFindFirst.mockReset()
  h.isCliMode.mockReturnValue(false)
})

describe('resolveCopyProvider — CLI-mode default (no row required)', () => {
  it('CLI mode + no registered provider ⇒ ClaudeCliCopyProvider (no throw)', async () => {
    h.isCliMode.mockReturnValue(true)
    h.availableProviderFindFirst.mockResolvedValue(null)
    const provider = await resolveCopyProvider(TEAM_ID)
    expect(provider).toBeInstanceOf(ClaudeCliCopyProvider)
  })

  it('a registered team-default API-key provider OVERRIDES the CLI default (whenever configured)', async () => {
    h.isCliMode.mockReturnValue(true)
    h.availableProviderFindFirst.mockResolvedValue(anthropicRow())
    const provider = await resolveCopyProvider(TEAM_ID)
    expect(provider).toBeInstanceOf(AnthropicCopyProvider)
    expect((provider as unknown as { apiKey: string }).apiKey).toBe(TEAM_KEY)
  })

  it('an explicit providerKey OVERRIDES the CLI default', async () => {
    h.isCliMode.mockReturnValue(true)
    h.availableProviderFindFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      if (where.providerKey === 'anthropic-123' && where.teamId === TEAM_ID) return anthropicRow({ isDefault: false })
      return null
    })
    const provider = await resolveCopyProvider(TEAM_ID, 'anthropic-123')
    expect(provider).toBeInstanceOf(AnthropicCopyProvider)
    expect((provider as unknown as { apiKey: string }).apiKey).toBe(TEAM_KEY)
  })
})

describe('resolveCopyProvider — non-CLI mode unchanged', () => {
  it('NOT CLI mode + nothing configured + no ANTHROPIC_API_KEY ⇒ still throws', async () => {
    h.isCliMode.mockReturnValue(false)
    h.availableProviderFindFirst.mockResolvedValue(null)
    await expect(resolveCopyProvider(TEAM_ID)).rejects.toThrow(/No COPY provider configured/)
  })
})
