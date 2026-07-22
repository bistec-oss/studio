// DB-backed MCP/ACP API key auth (Task 13): resolveApiKey looks up a
// SHA-256 hash of the presented key against ApiKey.keyHash and requires
// revokedAt: null; generateApiKey mints a new bstk_ credential whose hash
// is what gets persisted. No plaintext ever touches the DB or a log line.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHash } from 'node:crypto'

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    apiKey: { findUnique: mocks.findUnique },
  },
}))

import { resolveApiKey, generateApiKey } from '@/mcp/auth'

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

describe('generateApiKey', () => {
  it('produces a bstk_-prefixed plaintext, its SHA-256 hash, and a masked prefix ending in the same last 4 chars', () => {
    const { plaintext, keyHash, keyPrefix } = generateApiKey()
    expect(plaintext).toMatch(/^bstk_/)
    expect(keyHash).toBe(sha256(plaintext))
    expect(keyHash).toMatch(/^[0-9a-f]{64}$/)
    expect(keyPrefix).toBe(`bstk_…${plaintext.slice(-4)}`)
  })

  it('mints a different key every call', () => {
    const a = generateApiKey()
    const b = generateApiKey()
    expect(a.plaintext).not.toBe(b.plaintext)
    expect(a.keyHash).not.toBe(b.keyHash)
  })
})

describe('resolveApiKey', () => {
  beforeEach(() => vi.clearAllMocks())

  it('hash round-trip: a key generateApiKey minted resolves to its stored team + id', async () => {
    const { plaintext, keyHash } = generateApiKey()
    mocks.findUnique.mockImplementation(async ({ where }: { where: { keyHash: string } }) => {
      if (where.keyHash === keyHash) {
        return { id: 'key-1', teamId: 'team-1', revokedAt: null }
      }
      return null
    })

    await expect(resolveApiKey(plaintext)).resolves.toEqual({ teamId: 'team-1', keyId: 'key-1' })
    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { keyHash },
      select: { id: true, teamId: true, revokedAt: true },
    })
  })

  it('rejects a revoked key even though the hash matches', async () => {
    mocks.findUnique.mockResolvedValue({ id: 'key-1', teamId: 'team-1', revokedAt: new Date() })
    await expect(resolveApiKey('bstk_whatever')).resolves.toBeNull()
  })

  it('returns null for an unknown key (no row matches the hash)', async () => {
    mocks.findUnique.mockResolvedValue(null)
    await expect(resolveApiKey('bstk_does-not-exist')).resolves.toBeNull()
  })

  it('returns null for null/undefined input WITHOUT querying the database', async () => {
    await expect(resolveApiKey(null)).resolves.toBeNull()
    await expect(resolveApiKey(undefined)).resolves.toBeNull()
    expect(mocks.findUnique).not.toHaveBeenCalled()
  })

  it('returns null for an empty string WITHOUT querying the database', async () => {
    await expect(resolveApiKey('')).resolves.toBeNull()
    expect(mocks.findUnique).not.toHaveBeenCalled()
  })
})
