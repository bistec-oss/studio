import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withTeamAdmin, parseBody } from '@/lib/api/handler'
import { prisma } from '@/lib/prisma'
import { generateApiKey } from '@/mcp/auth'
import type { TeamApiKeySummary, TeamApiKeyCreated } from '@/lib/api-types'

// Team-admin management of the team's MCP/ACP machine credentials
// (src/mcp/auth.ts resolveApiKey). Mirrors the shape of /api/team/claude-token
// and /api/team/channels — team-admin-only, masked values in every response
// except the one-time plaintext returned right after minting.

export const GET = withTeamAdmin(async (_req, _ctx, user) => {
  const rows = await prisma.apiKey.findMany({
    where: { teamId: user.teamId },
    select: { id: true, label: true, keyPrefix: true, createdAt: true, revokedAt: true },
    orderBy: { createdAt: 'desc' },
  })
  const keys: TeamApiKeySummary[] = rows.map((r) => ({
    id: r.id,
    label: r.label,
    keyPrefix: r.keyPrefix,
    createdAt: r.createdAt.toISOString(),
    revokedAt: r.revokedAt ? r.revokedAt.toISOString() : null,
  }))
  return NextResponse.json({ keys })
})

const createSchema = z.object({
  label: z.string().trim().min(1, 'label is required').max(200),
})

export const POST = withTeamAdmin(async (req: NextRequest, _ctx, user) => {
  const body = await parseBody(req, createSchema)
  if (body.response) return body.response
  const { label } = body.data

  // The plaintext never touches the database — only the hash + a masked
  // last-4 prefix persist. This is the only place the plaintext is ever
  // returned to a caller.
  const { plaintext, keyHash, keyPrefix } = generateApiKey()
  const row = await prisma.apiKey.create({
    data: { teamId: user.teamId, label, keyHash, keyPrefix },
    select: { id: true },
  })

  return NextResponse.json(
    { id: row.id, label, plaintext } satisfies TeamApiKeyCreated,
    { status: 201 }
  )
})
