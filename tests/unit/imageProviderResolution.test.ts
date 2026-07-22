// resolveImageProvider resolution order: personal UserOpenAiKey (ACTIVE, when
// userId given) → explicit providerKey row scoped to the team → team default
// row → null (no throw, no env fallback). Also covers resolveCopyProvider's
// removed env.OPENAI_API_KEY fallback. Prisma and the provider implementations
// are mocked; crypto is real (mirrors tests/unit/userToken.test.ts).

import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  userOpenAiKeyFindUnique: vi.fn(),
  availableProviderFindFirst: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    userOpenAiKey: { findUnique: h.userOpenAiKeyFindUnique },
    availableProvider: { findFirst: h.availableProviderFindFirst },
  },
}))

// Capture constructor args instead of exercising the real OpenAI SDK client.
// Real classes (not vi.fn().mockImplementation(arrowFn)) — an arrow function
// has no [[Construct]] slot, so `new OpenAIImageProvider(...)` in registry.ts
// would throw "is not a constructor" if the mock were arrow-based.
vi.mock('@/providers/implementations/image/openai', () => ({
  OpenAIImageProvider: class {
    apiKey: string
    constructor(apiKey: string) {
      this.apiKey = apiKey
    }
  },
}))
vi.mock('@/providers/implementations/copy/openai', () => ({
  OpenAICopyProvider: class {
    apiKey: string
    constructor(apiKey: string) {
      this.apiKey = apiKey
    }
  },
}))
vi.mock('@/providers/implementations/copy/anthropic', () => ({
  AnthropicCopyProvider: class {
    apiKey: string
    constructor(apiKey: string) {
      this.apiKey = apiKey
    }
  },
}))
vi.mock('@/providers/implementations/copy/claude-cli', () => ({
  ClaudeCliCopyProvider: class {},
}))
// Deterministic regardless of the host machine's real .env — the env.ts
// singleton is parsed once at import, so this must be mocked (not stubbed)
// for the "no env fallback" assertion below to be reliable. Preserve every
// other field (crypto.ts also reads env.TOKEN_ENCRYPTION_KEY through this
// same module) — only null out the two provider keys.
vi.mock('@/lib/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/env')>()
  return { ...actual, env: { ...actual.env, ANTHROPIC_API_KEY: undefined, OPENAI_API_KEY: undefined } }
})

// crypto.ts reads TOKEN_ENCRYPTION_KEY via env.ts (snapshotted at load) — set
// it before the imports below so encrypt/decrypt work for real.
process.env.TOKEN_ENCRYPTION_KEY = 'b'.repeat(64)

const { encrypt } = await import('@/lib/crypto')
const { resolveImageProvider, resolveCopyProvider, resolveAnthropicApiKey } = await import('@/providers/registry')

const TEAM_ID = 'team-1'
const OTHER_TEAM_ID = 'team-2'
const USER_ID = 'user-1'

const PERSONAL_KEY = 'sk-personal-plaintext-key-000000'
const TEAM_EXPLICIT_KEY = 'sk-team-explicit-plaintext-key'
const TEAM_DEFAULT_KEY = 'sk-team-default-plaintext-key'

function personalKeyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'key-1',
    userId: USER_ID,
    encryptedKey: encrypt(PERSONAL_KEY),
    keyPrefix: `…${PERSONAL_KEY.slice(-4)}`,
    status: 'ACTIVE',
    createdAt: new Date(),
    ...overrides,
  }
}

function providerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ap-1',
    teamId: TEAM_ID,
    slot: 'IMAGE',
    providerKey: 'openai-image',
    providerName: 'openai',
    label: 'OpenAI Images',
    keyPrefix: '…xxxx',
    encryptedApiKey: encrypt(TEAM_DEFAULT_KEY),
    isEnabled: true,
    isDefault: true,
    createdAt: new Date(),
    ...overrides,
  }
}

function copyProviderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ap-copy-1',
    teamId: TEAM_ID,
    slot: 'COPY',
    providerKey: 'explicit-copy',
    providerName: 'anthropic',
    label: 'Anthropic',
    keyPrefix: '…xxxx',
    encryptedApiKey: encrypt(TEAM_EXPLICIT_KEY),
    isEnabled: true,
    isDefault: false,
    createdAt: new Date(),
    ...overrides,
  }
}

beforeEach(() => {
  h.userOpenAiKeyFindUnique.mockReset()
  h.availableProviderFindFirst.mockReset()
})

describe('resolveImageProvider — personal tier', () => {
  it('personal ACTIVE key wins over a team default row', async () => {
    h.userOpenAiKeyFindUnique.mockResolvedValue(personalKeyRow())
    h.availableProviderFindFirst.mockResolvedValue(providerRow())

    const provider = await resolveImageProvider({ teamId: TEAM_ID, userId: USER_ID })
    expect(provider).not.toBeNull()
    expect((provider as unknown as { apiKey: string }).apiKey).toBe(PERSONAL_KEY)
    // Personal wins ⇒ never needed to look at AvailableProvider at all.
    expect(h.availableProviderFindFirst).not.toHaveBeenCalled()
  })

  it('personal ACTIVE key wins even over an explicit providerKey scoped to the team', async () => {
    h.userOpenAiKeyFindUnique.mockResolvedValue(personalKeyRow())
    h.availableProviderFindFirst.mockResolvedValue(providerRow({ providerKey: 'explicit-key' }))

    const provider = await resolveImageProvider({ teamId: TEAM_ID, userId: USER_ID }, 'explicit-key')
    expect((provider as unknown as { apiKey: string }).apiKey).toBe(PERSONAL_KEY)
  })

  it('an INVALID personal row is skipped — falls through to team resolution', async () => {
    h.userOpenAiKeyFindUnique.mockResolvedValue(personalKeyRow({ status: 'INVALID' }))
    h.availableProviderFindFirst.mockResolvedValue(providerRow())

    const provider = await resolveImageProvider({ teamId: TEAM_ID, userId: USER_ID })
    expect((provider as unknown as { apiKey: string }).apiKey).toBe(TEAM_DEFAULT_KEY)
  })

  it('no userId given ⇒ never queries the personal-key table', async () => {
    h.availableProviderFindFirst.mockResolvedValue(providerRow())

    await resolveImageProvider({ teamId: TEAM_ID })
    expect(h.userOpenAiKeyFindUnique).not.toHaveBeenCalled()
  })
})

describe('resolveImageProvider — team tier', () => {
  it('no personal key ⇒ an explicit providerKey scoped to the team is used', async () => {
    h.userOpenAiKeyFindUnique.mockResolvedValue(null)
    h.availableProviderFindFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      if (where.providerKey === 'explicit-key' && where.teamId === TEAM_ID) {
        return providerRow({ providerKey: 'explicit-key', isDefault: false, encryptedApiKey: encrypt(TEAM_EXPLICIT_KEY) })
      }
      return null
    })

    const provider = await resolveImageProvider({ teamId: TEAM_ID, userId: null }, 'explicit-key')
    expect((provider as unknown as { apiKey: string }).apiKey).toBe(TEAM_EXPLICIT_KEY)
  })

  it('an explicit providerKey row belonging to a FOREIGN team is not found — falls through to team default', async () => {
    h.userOpenAiKeyFindUnique.mockResolvedValue(null)
    h.availableProviderFindFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      // Simulate a real WHERE clause: a row scoped to OTHER_TEAM_ID never
      // matches a query filtered by where.teamId === TEAM_ID.
      if (where.providerKey === 'explicit-key' && where.teamId === OTHER_TEAM_ID) {
        return providerRow({ teamId: OTHER_TEAM_ID, providerKey: 'explicit-key' })
      }
      if (where.isDefault === true && where.teamId === TEAM_ID) {
        return providerRow({ encryptedApiKey: encrypt(TEAM_DEFAULT_KEY) })
      }
      return null
    })

    const provider = await resolveImageProvider({ teamId: TEAM_ID, userId: null }, 'explicit-key')
    expect((provider as unknown as { apiKey: string }).apiKey).toBe(TEAM_DEFAULT_KEY)
  })

  it('no personal key, no providerKey ⇒ the team default row is used', async () => {
    h.userOpenAiKeyFindUnique.mockResolvedValue(null)
    h.availableProviderFindFirst.mockResolvedValue(providerRow())

    const provider = await resolveImageProvider({ teamId: TEAM_ID, userId: USER_ID })
    expect((provider as unknown as { apiKey: string }).apiKey).toBe(TEAM_DEFAULT_KEY)
  })

  it('every AvailableProvider query is scoped to ctx.teamId', async () => {
    h.userOpenAiKeyFindUnique.mockResolvedValue(null)
    h.availableProviderFindFirst.mockResolvedValue(null)

    await resolveImageProvider({ teamId: TEAM_ID, userId: null }, 'explicit-key')
    for (const call of h.availableProviderFindFirst.mock.calls) {
      expect(call[0].where.teamId).toBe(TEAM_ID)
    }
  })
})

describe('resolveImageProvider — no provider configured', () => {
  it('returns null (no throw) when neither personal nor team has anything', async () => {
    h.userOpenAiKeyFindUnique.mockResolvedValue(null)
    h.availableProviderFindFirst.mockResolvedValue(null)

    await expect(resolveImageProvider({ teamId: TEAM_ID, userId: USER_ID })).resolves.toBeNull()
  })

  it('returns null without a userId and no team provider configured', async () => {
    h.availableProviderFindFirst.mockResolvedValue(null)
    await expect(resolveImageProvider({ teamId: TEAM_ID })).resolves.toBeNull()
  })
})

describe('resolveCopyProvider — env.OPENAI_API_KEY fallback removed', () => {
  it('throws (does not silently fall back to env) when no default COPY provider is configured', async () => {
    h.availableProviderFindFirst.mockResolvedValue(null)
    await expect(resolveCopyProvider(TEAM_ID)).rejects.toThrow(/No COPY provider configured/)
  })

  it('is team-scoped: the default-COPY-provider lookup is filtered by teamId (team-tenancy fix)', async () => {
    h.availableProviderFindFirst.mockResolvedValue(null)
    await expect(resolveCopyProvider(TEAM_ID)).rejects.toThrow(/No COPY provider configured/)
    for (const call of h.availableProviderFindFirst.mock.calls) {
      expect(call[0].where.teamId).toBe(TEAM_ID)
    }
  })
})

describe('resolveCopyProvider — explicit providerKey (team-scoped)', () => {
  it('an explicit providerKey scoped to the caller\'s team resolves that provider', async () => {
    h.availableProviderFindFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      if (where.slot === 'COPY' && where.providerKey === 'explicit-copy' && where.teamId === TEAM_ID) {
        return copyProviderRow()
      }
      return null
    })

    const provider = await resolveCopyProvider(TEAM_ID, 'explicit-copy')
    expect((provider as unknown as { apiKey: string }).apiKey).toBe(TEAM_EXPLICIT_KEY)
  })

  it('an explicit providerKey row belonging to a FOREIGN team is not found — never resolves to it (falls through and throws, no default configured)', async () => {
    h.availableProviderFindFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      // Simulate a real WHERE clause: a row scoped to OTHER_TEAM_ID never
      // matches a query filtered by where.teamId === TEAM_ID — this is the
      // exact cross-tenant leak the team-tenancy fix closed (registry.ts
      // used to query with no teamId filter at all).
      if (where.slot === 'COPY' && where.providerKey === 'explicit-copy' && where.teamId === OTHER_TEAM_ID) {
        return copyProviderRow({ teamId: OTHER_TEAM_ID })
      }
      return null
    })

    await expect(resolveCopyProvider(TEAM_ID, 'explicit-copy')).rejects.toThrow(/No COPY provider configured/)
  })
})

describe('resolveAnthropicApiKey — team-scoped default lookup (team-tenancy fix, Task 19b)', () => {
  it('is team-scoped: the default-COPY lookup is filtered by teamId', async () => {
    h.availableProviderFindFirst.mockResolvedValue(null)
    await resolveAnthropicApiKey(TEAM_ID)
    for (const call of h.availableProviderFindFirst.mock.calls) {
      expect(call[0].where.teamId).toBe(TEAM_ID)
    }
  })

  it("resolves the caller's team default anthropic-provider key", async () => {
    h.availableProviderFindFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      if (where.teamId === TEAM_ID && where.isDefault === true) {
        return copyProviderRow({ providerName: 'anthropic', encryptedApiKey: encrypt(TEAM_DEFAULT_KEY) })
      }
      return null
    })

    const key = await resolveAnthropicApiKey(TEAM_ID)
    expect(key).toBe(TEAM_DEFAULT_KEY)
  })

  it('a FOREIGN team default anthropic provider is never resolved — the exact cross-tenant credential leak this fixes', async () => {
    h.availableProviderFindFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      // Before the fix, this lookup had no teamId filter at all, so team A
      // could resolve — and bill — team B's registered Anthropic key here.
      if (where.teamId === OTHER_TEAM_ID && where.isDefault === true) {
        return copyProviderRow({ teamId: OTHER_TEAM_ID, providerName: 'anthropic', encryptedApiKey: encrypt(TEAM_DEFAULT_KEY) })
      }
      return null
    })

    // No env fallback configured (mocked to undefined above) ⇒ null, not
    // the foreign team's key.
    await expect(resolveAnthropicApiKey(TEAM_ID)).resolves.toBeNull()
  })
})
