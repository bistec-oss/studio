import { createHash, randomBytes } from 'node:crypto'
import { prisma } from '@/lib/prisma'

// DB-backed MCP/ACP auth (Task 13). Replaces the old BISTEC_API_KEYS /
// BISTEC_ADMIN_API_KEYS comma-separated env allow-lists (fully deleted from
// this module — the schema entries in src/lib/env.ts are removed in
// Task 18) with per-team ApiKey rows. The admin/non-admin two-tier split is
// also gone: a valid key simply grants that key's team scope; callers
// (ACP routes, the MCP stdio server) gate on "is there a resolved key" and
// thread `teamId` into whatever the tool creates.

export interface ResolvedApiKey {
  teamId: string
  keyId: string
}

function hashKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex')
}

// Resolves a presented credential to the team it belongs to. Keys are never
// stored in plaintext, so this is a lookup by the SHA-256 hex digest (backed
// by ApiKey.keyHash's unique index) rather than a comparison loop — no
// timing-sensitive constant-time compare is needed. A revoked row (and an
// unknown/empty/nullish input) both resolve to null.
export async function resolveApiKey(apiKey: string | null | undefined): Promise<ResolvedApiKey | null> {
  if (!apiKey) return null
  const row = await prisma.apiKey.findUnique({
    where: { keyHash: hashKey(apiKey) },
    select: { id: true, teamId: true, revokedAt: true },
  })
  if (!row || row.revokedAt) return null
  return { teamId: row.teamId, keyId: row.id }
}

// Mints a new machine credential. The plaintext is returned to the caller
// exactly once (the key-management POST route) and is never persisted or
// logged — only its hash and a last-4-chars prefix are stored.
export function generateApiKey(): { plaintext: string; keyHash: string; keyPrefix: string } {
  const plaintext = `bstk_${randomBytes(32).toString('base64url')}`
  const keyHash = hashKey(plaintext)
  const keyPrefix = `bstk_…${plaintext.slice(-4)}`
  return { plaintext, keyHash, keyPrefix }
}
