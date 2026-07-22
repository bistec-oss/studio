// Claude credential resolver layer: resolution precedence (personal → team →
// null), the mark-invalid writes for both tiers, withClaudeAuth context
// wiring, and save-time validation across its three branches (MOCK_AI seam /
// CLI live ping / API mode skip). Prisma and the CLI runner are mocked;
// crypto is real.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  teamFindUnique: vi.fn(),
  teamUpdateMany: vi.fn(),
  isCliMode: vi.fn(() => true),
  runClaudeCli: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    userClaudeToken: { findUnique: h.findUnique, updateMany: h.updateMany },
    team: { findUnique: h.teamFindUnique, updateMany: h.teamUpdateMany },
  },
}))
vi.mock('@/lib/agent/config', () => ({ isCliMode: h.isCliMode }))
vi.mock('@/lib/agent/claudeCli', () => ({ runClaudeCli: h.runClaudeCli }))

// crypto.ts reads TOKEN_ENCRYPTION_KEY via env.ts (snapshotted at load) — set
// it before the imports below so encrypt/decrypt work for real.
process.env.TOKEN_ENCRYPTION_KEY = 'a'.repeat(64)

const { encrypt } = await import('@/lib/crypto')
const { currentClaudeAuth } = await import('@/lib/agent/claudeAuth')
const {
  resolveClaudeAuth,
  withClaudeAuth,
  markUserTokenInvalid,
  markTeamClaudeTokenInvalid,
  validateClaudeToken,
} = await import('@/lib/agent/userToken')

const PLAINTEXT = 'sk-ant-oat01-USER-personal-token-abc123'
const TEAM_PLAINTEXT = 'sk-ant-oat01-TEAM-shared-token-xyz789'
const TEAM_ID = 'team-1'

function tokenRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tok-1',
    userId: 'user-1',
    encryptedToken: encrypt(PLAINTEXT),
    keyPrefix: '…c123',
    status: 'ACTIVE',
    lastValidatedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    user: { disabled: false },
    ...overrides,
  }
}

function teamRow(overrides: Record<string, unknown> = {}) {
  return {
    encryptedClaudeToken: encrypt(TEAM_PLAINTEXT),
    ...overrides,
  }
}

beforeEach(() => {
  h.findUnique.mockReset()
  h.updateMany.mockReset().mockResolvedValue({ count: 1 })
  h.teamFindUnique.mockReset().mockResolvedValue(null)
  h.teamUpdateMany.mockReset().mockResolvedValue({ count: 1 })
  h.isCliMode.mockReset().mockReturnValue(true)
  h.runClaudeCli.mockReset().mockResolvedValue('pong')
})

describe('resolveClaudeAuth — personal tier', () => {
  it('CLI mode + ACTIVE row (userId given) → auth with the decrypted personal token', async () => {
    h.findUnique.mockResolvedValue(tokenRow())
    const auth = await resolveClaudeAuth('user-1', TEAM_ID)
    expect(auth).not.toBeNull()
    expect(auth!.token).toBe(PLAINTEXT)
    expect(auth!.userId).toBe('user-1')
    expect(auth!.teamId).toBe(TEAM_ID)
  })

  it('personal token wins over an existing team token, without eagerly querying the team', async () => {
    h.findUnique.mockResolvedValue(tokenRow())
    h.teamFindUnique.mockResolvedValue(teamRow())
    const auth = await resolveClaudeAuth('user-1', TEAM_ID)
    expect(auth!.token).toBe(PLAINTEXT)
    expect(h.teamFindUnique).not.toHaveBeenCalled()
  })

  it("the personal auth's resolveFallback lazily resolves the team tier", async () => {
    h.findUnique.mockResolvedValue(tokenRow())
    h.teamFindUnique.mockResolvedValue(teamRow())
    const auth = await resolveClaudeAuth('user-1', TEAM_ID)
    const fallback = await auth!.resolveFallback!()
    expect(fallback).not.toBeNull()
    expect(fallback!.token).toBe(TEAM_PLAINTEXT)
    expect(fallback!.userId).toBeNull()
    expect(fallback!.teamId).toBe(TEAM_ID)
  })

  it('INVALID row → falls through to the team tier (null when the team has none)', async () => {
    h.findUnique.mockResolvedValue(tokenRow({ status: 'INVALID' }))
    expect(await resolveClaudeAuth('user-1', TEAM_ID)).toBeNull()
    expect(h.teamFindUnique).toHaveBeenCalled()
  })

  it('deactivated account → falls through to the team tier', async () => {
    h.findUnique.mockResolvedValue(tokenRow({ user: { disabled: true } }))
    expect(await resolveClaudeAuth('user-1', TEAM_ID)).toBeNull()
  })

  it('no personal row → falls through to the team tier', async () => {
    h.findUnique.mockResolvedValue(null)
    expect(await resolveClaudeAuth('user-1', TEAM_ID)).toBeNull()
  })

  it('API mode → null WITHOUT touching the DB', async () => {
    h.isCliMode.mockReturnValue(false)
    expect(await resolveClaudeAuth('user-1', TEAM_ID)).toBeNull()
    expect(h.findUnique).not.toHaveBeenCalled()
    expect(h.teamFindUnique).not.toHaveBeenCalled()
  })

  it('auth.onAuthFailure flips the stored personal row to INVALID (idempotent updateMany)', async () => {
    h.findUnique.mockResolvedValue(tokenRow())
    const auth = await resolveClaudeAuth('user-1', TEAM_ID)
    await auth!.onAuthFailure()
    expect(h.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: { status: 'INVALID' },
    })
  })
})

describe('resolveClaudeAuth — team tier', () => {
  it('resolveClaudeAuth(null, teamId) → the team token when the team row has one', async () => {
    h.teamFindUnique.mockResolvedValue(teamRow())
    const auth = await resolveClaudeAuth(null, TEAM_ID)
    expect(auth).not.toBeNull()
    expect(auth!.token).toBe(TEAM_PLAINTEXT)
    expect(auth!.userId).toBeNull()
    expect(auth!.teamId).toBe(TEAM_ID)
    // No personal user given ⇒ never queries the personal-token table.
    expect(h.findUnique).not.toHaveBeenCalled()
  })

  it('resolveClaudeAuth(null, teamId) → null when the team has no token', async () => {
    h.teamFindUnique.mockResolvedValue(teamRow({ encryptedClaudeToken: null }))
    expect(await resolveClaudeAuth(null, TEAM_ID)).toBeNull()
  })

  it('resolveClaudeAuth(null, teamId) → null when neither tier exists (no team row)', async () => {
    h.teamFindUnique.mockResolvedValue(null)
    expect(await resolveClaudeAuth(null, TEAM_ID)).toBeNull()
  })

  it('personal over team: given both a personal AND a team token, resolveClaudeAuth returns personal', async () => {
    h.findUnique.mockResolvedValue(tokenRow())
    h.teamFindUnique.mockResolvedValue(teamRow())
    const auth = await resolveClaudeAuth('user-1', TEAM_ID)
    expect(auth!.userId).toBe('user-1')
    expect(auth!.token).toBe(PLAINTEXT)
  })

  it("the team auth has no further resolveFallback (it's the last tier)", async () => {
    h.teamFindUnique.mockResolvedValue(teamRow())
    const auth = await resolveClaudeAuth(null, TEAM_ID)
    expect(auth!.resolveFallback).toBeUndefined()
  })

  it('team onAuthFailure clears both Team columns (idempotent updateMany)', async () => {
    h.teamFindUnique.mockResolvedValue(teamRow())
    const auth = await resolveClaudeAuth(null, TEAM_ID)
    await auth!.onAuthFailure()
    expect(h.teamUpdateMany).toHaveBeenCalledWith({
      where: { id: TEAM_ID },
      data: { encryptedClaudeToken: null, claudeKeyPrefix: null },
    })
  })
})

describe('markUserTokenInvalid', () => {
  it('is a no-op success when the row was deleted mid-flight', async () => {
    h.updateMany.mockResolvedValue({ count: 0 })
    await expect(markUserTokenInvalid('user-gone')).resolves.toBeUndefined()
  })
})

describe('markTeamClaudeTokenInvalid', () => {
  it('clears both token columns via updateMany (idempotent)', async () => {
    h.teamUpdateMany.mockResolvedValue({ count: 0 })
    await expect(markTeamClaudeTokenInvalid(TEAM_ID)).resolves.toBeUndefined()
    expect(h.teamUpdateMany).toHaveBeenCalledWith({
      where: { id: TEAM_ID },
      data: { encryptedClaudeToken: null, claudeKeyPrefix: null },
    })
  })
})

describe('withClaudeAuth', () => {
  it('CLI mode + ACTIVE personal row → fn sees the personal auth context', async () => {
    h.findUnique.mockResolvedValue(tokenRow())
    const seen = await withClaudeAuth('user-1', TEAM_ID, async () => currentClaudeAuth())
    expect(seen?.token).toBe(PLAINTEXT)
    expect(seen?.userId).toBe('user-1')
  })

  it('no personal row, team has a token → fn sees the team auth context', async () => {
    h.findUnique.mockResolvedValue(null)
    h.teamFindUnique.mockResolvedValue(teamRow())
    const seen = await withClaudeAuth('user-1', TEAM_ID, async () => currentClaudeAuth())
    expect(seen?.token).toBe(TEAM_PLAINTEXT)
    expect(seen?.userId).toBeNull()
  })

  it('userId null (e.g. no acting user) resolves straight to the team tier', async () => {
    h.teamFindUnique.mockResolvedValue(teamRow())
    const seen = await withClaudeAuth(null, TEAM_ID, async () => currentClaudeAuth())
    expect(seen?.token).toBe(TEAM_PLAINTEXT)
  })

  it('neither tier → fn runs with no context', async () => {
    h.findUnique.mockResolvedValue(null)
    h.teamFindUnique.mockResolvedValue(null)
    const seen = await withClaudeAuth('user-1', TEAM_ID, async () => currentClaudeAuth())
    expect(seen).toBeUndefined()
  })

  it('API mode → fast no-op: fn runs, DB never queried', async () => {
    h.isCliMode.mockReturnValue(false)
    const seen = await withClaudeAuth('user-1', TEAM_ID, async () => currentClaudeAuth())
    expect(seen).toBeUndefined()
    expect(h.findUnique).not.toHaveBeenCalled()
    expect(h.teamFindUnique).not.toHaveBeenCalled()
  })
})

describe('validateClaudeToken', () => {
  it('CLI mode → live ping under the candidate token (no retry semantics)', async () => {
    const result = await validateClaudeToken(PLAINTEXT)
    expect(result.ok).toBe(true)
    expect(h.runClaudeCli).toHaveBeenCalledWith(
      'Reply with exactly: pong',
      expect.objectContaining({ authToken: PLAINTEXT, model: 'haiku', label: 'token-validate' })
    )
  })

  it('CLI mode + ping failure → fail closed with an actionable error', async () => {
    h.runClaudeCli.mockRejectedValue(new Error('Claude CLI exited with code 1: 401'))
    const result = await validateClaudeToken(PLAINTEXT)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('claude setup-token')
  })

  it('API mode → stored unvalidated: { ok, skipped }, no CLI spawn', async () => {
    h.isCliMode.mockReturnValue(false)
    const result = await validateClaudeToken(PLAINTEXT)
    expect(result).toEqual({ ok: true, skipped: true })
    expect(h.runClaudeCli).not.toHaveBeenCalled()
  })
})

describe('validateClaudeToken under MOCK_AI (E2E seam)', () => {
  // testHooks reads MOCK_AI from process.env at module load — re-import both
  // modules with the env stubbed to exercise the seam branch.
  async function freshValidate() {
    vi.resetModules()
    const mod = await import('@/lib/agent/userToken')
    return mod.validateClaudeToken
  }

  it('passes a well-formed token and fails one containing "invalid", without the CLI', async () => {
    vi.stubEnv('MOCK_AI', 'true')
    try {
      const validate = await freshValidate()
      expect((await validate('sk-ant-oat01-good')).ok).toBe(true)
      const bad = await validate('sk-ant-oat01-invalid-token')
      expect(bad.ok).toBe(false)
      expect(h.runClaudeCli).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllEnvs()
      vi.resetModules()
    }
  })
})
