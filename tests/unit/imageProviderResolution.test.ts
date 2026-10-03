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
const { IMAGE_PROVIDERS, pickServingImageProvider } = await import('@/providers/imageCapabilities')

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

// ── 005 T1: compat filter + tier 4 fallback (FR-01, FR-04) ──────────────────
// An in-memory evaluator for the findFirst calls the resolver makes, so the
// resolver runs against real fixture rows (WHERE + ORDER BY applied the way
// Postgres would) instead of a per-call stub. Every fixture row carries its own
// plaintext key, so the instantiated provider identifies which row served.

type Fixture = {
  id: string
  providerName: string
  isEnabled: boolean
  isDefault: boolean
  createdAt: Date
}

function keyFor(id: string) {
  return `sk-row-${id}-plaintext`
}

function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([field, cond]) => {
    if (cond && typeof cond === 'object' && 'in' in cond) {
      return (cond as { in: unknown[] }).in.includes(row[field])
    }
    return row[field] === cond
  })
}

type OrderBy = Array<Record<string, 'asc' | 'desc'>>

// Loads the fixtures as the team's rows. Returns the ids of the rows the
// resolver's queries returned, in call order: hits[0] is the row it served.
function useRows(fixtures: Fixture[]): string[] {
  const db: Array<Record<string, unknown>> = fixtures.map((f) =>
    providerRow({ ...f, providerKey: `key-${f.id}`, encryptedApiKey: encrypt(keyFor(f.id)) }),
  )
  const hits: string[] = []
  h.availableProviderFindFirst.mockImplementation(
    async ({ where, orderBy }: { where: Record<string, unknown>; orderBy?: OrderBy }) => {
      let found = db.filter((r) => matches(r, where))
      if (orderBy) {
        found = [...found].sort((a, b) => {
          for (const clause of orderBy) {
            const [field, dir] = Object.entries(clause)[0]
            const av = a[field] as Date | string
            const bv = b[field] as Date | string
            const cmp = av < bv ? -1 : av > bv ? 1 : 0
            if (cmp !== 0) return dir === 'asc' ? cmp : -cmp
          }
          return 0
        })
      }
      const hit = found[0] ?? null
      if (hit) hits.push(hit.id as string)
      return hit
    },
  )
  return hits
}

async function servedKey(providerKey?: string): Promise<string | null> {
  const provider = await resolveImageProvider({ teamId: TEAM_ID, userId: null }, providerKey)
  return provider ? (provider as unknown as { apiKey: string }).apiKey : null
}

const JAN = new Date('2026-01-01T00:00:00Z')
const FEB = new Date('2026-02-01T00:00:00Z')
const MAR = new Date('2026-03-01T00:00:00Z')

describe('resolveImageProvider — tier 4 fallback (FR-01)', () => {
  beforeEach(() => {
    h.userOpenAiKeyFindUnique.mockResolvedValue(null)
  })

  it('AC-01: one enabled non-default row + a scheduler-style call (no providerKey, userId null) resolves that row', async () => {
    useRows([{ id: 'only', providerName: 'openai', isEnabled: true, isDefault: false, createdAt: JAN }])
    expect(await servedKey()).toBe(keyFor('only'))
  })

  it('AC-02: two enabled non-default rows resolve the OLDER one', async () => {
    useRows([
      { id: 'newer', providerName: 'openai', isEnabled: true, isDefault: false, createdAt: MAR },
      { id: 'older', providerName: 'openai', isEnabled: true, isDefault: false, createdAt: JAN },
    ])
    expect(await servedKey()).toBe(keyFor('older'))
  })

  it('AC-03: an enabled default wins even when an older enabled row exists', async () => {
    useRows([
      { id: 'older', providerName: 'openai', isEnabled: true, isDefault: false, createdAt: JAN },
      { id: 'def', providerName: 'openai', isEnabled: true, isDefault: true, createdAt: FEB },
    ])
    expect(await servedKey()).toBe(keyFor('def'))
  })

  it('tier 4 orders by createdAt then id, and filters to IMAGE + team + enabled', async () => {
    useRows([{ id: 'only', providerName: 'openai', isEnabled: true, isDefault: false, createdAt: JAN }])
    await servedKey()
    const tier4 = h.availableProviderFindFirst.mock.calls.find(
      (c) => c[0].where.isDefault === undefined && c[0].where.providerKey === undefined,
    )
    expect(tier4).toBeTruthy()
    expect(tier4![0].orderBy).toEqual([{ createdAt: 'asc' }, { id: 'asc' }])
    expect(tier4![0].where).toMatchObject({ slot: 'IMAGE', teamId: TEAM_ID, isEnabled: true })
  })

  it('a disabled default is not served; the oldest enabled row is', async () => {
    useRows([
      { id: 'def-off', providerName: 'openai', isEnabled: false, isDefault: true, createdAt: JAN },
      { id: 'on', providerName: 'openai', isEnabled: true, isDefault: false, createdAt: FEB },
    ])
    expect(await servedKey()).toBe(keyFor('on'))
  })

  it('AC-04 fallback half: with the default row deleted, the oldest remaining enabled row serves', async () => {
    // The same fixtures minus the deleted default row.
    useRows([
      { id: 'newer', providerName: 'openai', isEnabled: true, isDefault: false, createdAt: MAR },
      { id: 'older', providerName: 'openai', isEnabled: true, isDefault: false, createdAt: FEB },
    ])
    expect(await servedKey()).toBe(keyFor('older'))
  })

  it('returns null when the team has no enabled image-capable row', async () => {
    useRows([
      { id: 'off', providerName: 'openai', isEnabled: false, isDefault: false, createdAt: JAN },
      { id: 'ant', providerName: 'anthropic', isEnabled: true, isDefault: false, createdAt: JAN },
    ])
    expect(await servedKey()).toBeNull()
  })
})

describe('resolveImageProvider — incompatible rows are skipped, never instantiated (FR-04, AC-06)', () => {
  beforeEach(() => {
    h.userOpenAiKeyFindUnique.mockResolvedValue(null)
  })

  it('a legacy anthropic IMAGE default is skipped and the next compatible row serves', async () => {
    useRows([
      { id: 'ant-def', providerName: 'anthropic', isEnabled: true, isDefault: true, createdAt: JAN },
      { id: 'oai', providerName: 'openai', isEnabled: true, isDefault: false, createdAt: FEB },
    ])
    expect(await servedKey()).toBe(keyFor('oai'))
  })

  it('an explicit providerKey naming an incompatible row is skipped (no "Unsupported provider" throw)', async () => {
    useRows([
      { id: 'ant', providerName: 'anthropic', isEnabled: true, isDefault: false, createdAt: JAN },
      { id: 'oai', providerName: 'openai', isEnabled: true, isDefault: true, createdAt: FEB },
    ])
    expect(await servedKey('key-ant')).toBe(keyFor('oai'))
  })

  it('an incompatible oldest row is skipped by the tier 4 fallback', async () => {
    useRows([
      { id: 'groq', providerName: 'groq', isEnabled: true, isDefault: false, createdAt: JAN },
      { id: 'oai', providerName: 'openai', isEnabled: true, isDefault: false, createdAt: FEB },
    ])
    expect(await servedKey()).toBe(keyFor('oai'))
  })

  it('tiers 2, 3 and 4 all carry the image-provider filter', async () => {
    useRows([])
    await servedKey('explicit-key')
    expect(h.availableProviderFindFirst).toHaveBeenCalledTimes(3)
    for (const call of h.availableProviderFindFirst.mock.calls) {
      expect(call[0].where.providerName).toEqual({ in: [...IMAGE_PROVIDERS] })
    }
  })
})

describe('resolveImageProvider tiers 3+4 agree with pickServingImageProvider', () => {
  const cases: Array<{ name: string; rows: Fixture[] }> = [
    { name: 'no rows', rows: [] },
    { name: 'default only', rows: [{ id: 'd', providerName: 'openai', isEnabled: true, isDefault: true, createdAt: JAN }] },
    {
      name: 'default newer than a plain row',
      rows: [
        { id: 'p', providerName: 'openai', isEnabled: true, isDefault: false, createdAt: JAN },
        { id: 'd', providerName: 'gemini', isEnabled: true, isDefault: true, createdAt: MAR },
      ],
    },
    {
      name: 'no default, mixed ages',
      rows: [
        { id: 'c', providerName: 'gemini', isEnabled: true, isDefault: false, createdAt: MAR },
        { id: 'a', providerName: 'openai', isEnabled: true, isDefault: false, createdAt: FEB },
        { id: 'b', providerName: 'openai', isEnabled: false, isDefault: false, createdAt: JAN },
      ],
    },
    {
      name: 'createdAt tie broken by id',
      rows: [
        { id: 'y', providerName: 'openai', isEnabled: true, isDefault: false, createdAt: JAN },
        { id: 'x', providerName: 'openai', isEnabled: true, isDefault: false, createdAt: JAN },
      ],
    },
    {
      name: 'incompatible default + disabled default + compatible plain rows',
      rows: [
        { id: 'ant', providerName: 'anthropic', isEnabled: true, isDefault: true, createdAt: JAN },
        { id: 'off', providerName: 'openai', isEnabled: false, isDefault: true, createdAt: JAN },
        { id: 'late', providerName: 'openai', isEnabled: true, isDefault: false, createdAt: MAR },
        { id: 'early', providerName: 'gemini', isEnabled: true, isDefault: false, createdAt: FEB },
      ],
    },
    {
      name: 'only incompatible or disabled rows',
      rows: [
        { id: 'cli', providerName: 'cli', isEnabled: true, isDefault: true, createdAt: JAN },
        { id: 'off', providerName: 'openai', isEnabled: false, isDefault: false, createdAt: JAN },
      ],
    },
  ]

  for (const c of cases) {
    it(c.name, async () => {
      h.userOpenAiKeyFindUnique.mockResolvedValue(null)
      const hits = useRows(c.rows)
      // Until T8 lands a Gemini implementation, a chosen gemini row is found
      // but can't be instantiated; compare the CHOSEN row, not the instance.
      await resolveImageProvider({ teamId: TEAM_ID, userId: null }).catch(() => null)
      expect(hits[0] ?? null).toBe(pickServingImageProvider(c.rows)?.id ?? null)
    })
  }
})
