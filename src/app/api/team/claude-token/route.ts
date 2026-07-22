import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withTeamAdmin, parseBody } from '@/lib/api/handler'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/crypto'
import { validateClaudeToken } from '@/lib/agent/userToken'
import type { TeamClaudeTokenInfo } from '@/lib/api-types'

// Team-admin management of the TEAM's shared Claude OAuth token — the
// fallback tier below each member's personal token (see
// src/lib/agent/userToken.ts resolveClaudeAuth). Mirrors
// /api/me/claude-token's contract (regex, live-ping validation, AES-256-GCM
// encryption, masked last-4 suffix only) but reads/writes the Team row
// instead of a per-user UserClaudeToken. The Team model has no status column
// for this token — a rejected token is simply cleared (see
// markTeamClaudeTokenInvalid), not flagged INVALID like the personal tier.

type TeamTokenRow = { claudeKeyPrefix: string | null }

function toInfo(row: TeamTokenRow | null): TeamClaudeTokenInfo {
  if (!row?.claudeKeyPrefix) return { connected: false }
  return { connected: true, keyPrefix: row.claudeKeyPrefix }
}

export const GET = withTeamAdmin(async (_req, _ctx, user) => {
  const team = await prisma.team.findUnique({
    where: { id: user.teamId },
    select: { claudeKeyPrefix: true },
  })
  return NextResponse.json(toInfo(team))
})

const putSchema = z.object({
  token: z
    .string()
    .trim()
    .regex(
      /^sk-ant-oat01-[A-Za-z0-9_-]{20,}$/,
      'Paste the full token printed by `claude setup-token` (it starts with sk-ant-oat01-)'
    ),
})

// Connect or replace — validated before anything is stored.
export const PUT = withTeamAdmin(async (req: NextRequest, _ctx, user) => {
  const body = await parseBody(req, putSchema)
  if (body.response) return body.response
  const { token } = body.data

  const result = await validateClaudeToken(token)
  if (!result.ok) {
    return NextResponse.json({ error: 'Token validation failed', detail: result.error }, { status: 422 })
  }

  // Masked last-4 suffix only — never a leading slice of the secret.
  const team = await prisma.team.update({
    where: { id: user.teamId },
    data: {
      encryptedClaudeToken: encrypt(token),
      claudeKeyPrefix: `…${token.slice(-4)}`,
    },
    select: { claudeKeyPrefix: true },
  })
  return NextResponse.json(toInfo(team))
})

export const DELETE = withTeamAdmin(async (_req, _ctx, user) => {
  await prisma.team.update({
    where: { id: user.teamId },
    data: { encryptedClaudeToken: null, claudeKeyPrefix: null },
  })
  return NextResponse.json({ connected: false } satisfies TeamClaudeTokenInfo)
})
