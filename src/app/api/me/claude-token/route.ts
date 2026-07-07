import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuth, parseBody } from '@/lib/api/handler'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/crypto'
import { validateClaudeToken } from '@/lib/agent/userToken'
import type { ClaudeTokenInfo } from '@/lib/api-types'

// Self-service management of the user's personal Claude OAuth token
// (pasted from `claude setup-token`; used by CLI-mode generation so calls
// bill the user's own Claude subscription). All handlers are withAuth and
// keyed strictly to the session user — no ids are accepted from the client.
// The raw token is validated, encrypted (AES-256-GCM), and never returned;
// responses carry only a masked last-4 suffix.

type TokenRow = {
  status: 'ACTIVE' | 'INVALID'
  keyPrefix: string
  createdAt: Date
  lastValidatedAt: Date | null
}

function toInfo(row: TokenRow | null): ClaudeTokenInfo {
  if (!row) return { connected: false }
  return {
    connected: true,
    status: row.status,
    keyPrefix: row.keyPrefix,
    connectedAt: row.createdAt.toISOString(),
    lastValidatedAt: row.lastValidatedAt?.toISOString() ?? null,
  }
}

const TOKEN_SELECT = { status: true, keyPrefix: true, createdAt: true, lastValidatedAt: true } as const

export const GET = withAuth(async (_req, _ctx, user) => {
  const row = await prisma.userClaudeToken.findUnique({
    where: { userId: user.userId },
    select: TOKEN_SELECT,
  })
  return NextResponse.json(toInfo(row))
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

// Connect or replace (upsert) — validated before anything is stored.
export const PUT = withAuth(async (req: NextRequest, _ctx, user) => {
  const body = await parseBody(req, putSchema)
  if (body.response) return body.response
  const { token } = body.data

  const result = await validateClaudeToken(token)
  if (!result.ok) {
    return NextResponse.json({ error: 'Token validation failed', detail: result.error }, { status: 422 })
  }

  // Masked last-4 suffix only — never a leading slice of the secret.
  const data = {
    encryptedToken: encrypt(token),
    keyPrefix: `…${token.slice(-4)}`,
    status: 'ACTIVE' as const,
    lastValidatedAt: result.skipped ? null : new Date(),
  }
  const row = await prisma.userClaudeToken.upsert({
    where: { userId: user.userId },
    create: { userId: user.userId, ...data },
    update: data,
    select: TOKEN_SELECT,
  })
  return NextResponse.json(toInfo(row))
})

export const DELETE = withAuth(async (_req, _ctx, user) => {
  // deleteMany ⇒ idempotent (a repeated disconnect is a 200, not a 500)
  await prisma.userClaudeToken.deleteMany({ where: { userId: user.userId } })
  return NextResponse.json({ connected: false } satisfies ClaudeTokenInfo)
})
