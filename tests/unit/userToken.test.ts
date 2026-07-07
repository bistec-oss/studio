// Per-user Claude token resolver layer: resolution precedence, the
// mark-invalid write, withUserClaudeAuth context wiring, and save-time
// validation across its three branches (MOCK_AI seam / CLI live ping / API
// mode skip). Prisma and the CLI runner are mocked; crypto is real.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  isCliMode: vi.fn(() => true),
  runClaudeCli: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: { userClaudeToken: { findUnique: h.findUnique, updateMany: h.updateMany } },
}))
vi.mock('@/lib/agent/config', () => ({ isCliMode: h.isCliMode }))
vi.mock('@/lib/agent/claudeCli', () => ({ runClaudeCli: h.runClaudeCli }))

// crypto.ts reads TOKEN_ENCRYPTION_KEY via env.ts (snapshotted at load) — set
// it before the imports below so encrypt/decrypt work for real.
process.env.TOKEN_ENCRYPTION_KEY = 'a'.repeat(64)

const { encrypt } = await import('@/lib/crypto')
const { currentClaudeAuth } = await import('@/lib/agent/claudeAuth')
const {
  resolveClaudeAuthForUser,
  withUserClaudeAuth,
  markUserTokenInvalid,
  validateClaudeToken,
} = await import('@/lib/agent/userToken')

const PLAINTEXT = 'sk-ant-oat01-USER-personal-token-abc123'

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

beforeEach(() => {
  h.findUnique.mockReset()
  h.updateMany.mockReset().mockResolvedValue({ count: 1 })
  h.isCliMode.mockReset().mockReturnValue(true)
  h.runClaudeCli.mockReset().mockResolvedValue('pong')
})

describe('resolveClaudeAuthForUser', () => {
  it('CLI mode + ACTIVE row → auth with the decrypted token', async () => {
    h.findUnique.mockResolvedValue(tokenRow())
    const auth = await resolveClaudeAuthForUser('user-1')
    expect(auth).not.toBeNull()
    expect(auth!.token).toBe(PLAINTEXT)
    expect(auth!.userId).toBe('user-1')
  })

  it('INVALID row → null (awaiting reconnect)', async () => {
    h.findUnique.mockResolvedValue(tokenRow({ status: 'INVALID' }))
    expect(await resolveClaudeAuthForUser('user-1')).toBeNull()
  })

  it('deactivated account → null even with an ACTIVE row', async () => {
    h.findUnique.mockResolvedValue(tokenRow({ user: { disabled: true } }))
    expect(await resolveClaudeAuthForUser('user-1')).toBeNull()
  })

  it('no row → null', async () => {
    h.findUnique.mockResolvedValue(null)
    expect(await resolveClaudeAuthForUser('user-1')).toBeNull()
  })

  it('API mode → null WITHOUT touching the DB', async () => {
    h.isCliMode.mockReturnValue(false)
    expect(await resolveClaudeAuthForUser('user-1')).toBeNull()
    expect(h.findUnique).not.toHaveBeenCalled()
  })

  it('auth.onAuthFailure flips the stored row to INVALID (idempotent updateMany)', async () => {
    h.findUnique.mockResolvedValue(tokenRow())
    const auth = await resolveClaudeAuthForUser('user-1')
    await auth!.onAuthFailure()
    expect(h.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: { status: 'INVALID' },
    })
  })
})

describe('markUserTokenInvalid', () => {
  it('is a no-op success when the row was deleted mid-flight', async () => {
    h.updateMany.mockResolvedValue({ count: 0 })
    await expect(markUserTokenInvalid('user-gone')).resolves.toBeUndefined()
  })
})

describe('withUserClaudeAuth', () => {
  it('CLI mode + ACTIVE row → fn sees the auth context', async () => {
    h.findUnique.mockResolvedValue(tokenRow())
    const seen = await withUserClaudeAuth('user-1', async () => currentClaudeAuth())
    expect(seen?.token).toBe(PLAINTEXT)
  })

  it('no row → fn runs with no context (shared credential)', async () => {
    h.findUnique.mockResolvedValue(null)
    const seen = await withUserClaudeAuth('user-1', async () => currentClaudeAuth())
    expect(seen).toBeUndefined()
  })

  it('API mode → fast no-op: fn runs, DB never queried', async () => {
    h.isCliMode.mockReturnValue(false)
    const seen = await withUserClaudeAuth('user-1', async () => currentClaudeAuth())
    expect(seen).toBeUndefined()
    expect(h.findUnique).not.toHaveBeenCalled()
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
