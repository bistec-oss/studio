import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuth, parseBody } from '@/lib/api/handler'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/crypto'
import type { OpenAiKeyInfo } from '@/lib/api-types'

// Self-service management of the user's personal OpenAI API key (used for
// image generation ahead of the team's configured IMAGE provider — see
// resolveImageProvider in src/providers/registry.ts). All handlers are
// withAuth and keyed strictly to the session user — no ids are accepted from
// the client. The raw key is validated by shape only (there is no free OpenAI
// endpoint to live-validate against, unlike claude setup-token), encrypted
// (AES-256-GCM), and never returned; responses carry only a masked last-4
// suffix. A failed generation flips status to INVALID out-of-band (see
// markUserOpenAiKeyInvalid, src/lib/agent/openAiKey.ts).

type KeyRow = {
  status: string
  keyPrefix: string
}

function toInfo(row: KeyRow | null): OpenAiKeyInfo {
  if (!row) return { connected: false }
  return {
    connected: true,
    status: row.status === 'INVALID' ? 'INVALID' : 'ACTIVE',
    keyPrefix: row.keyPrefix,
  }
}

const KEY_SELECT = { status: true, keyPrefix: true } as const

export const GET = withAuth(async (_req, _ctx, user) => {
  const row = await prisma.userOpenAiKey.findUnique({
    where: { userId: user.userId },
    select: KEY_SELECT,
  })
  return NextResponse.json(toInfo(row))
})

const putSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^sk-[A-Za-z0-9_-]{20,}$/, 'Paste a valid OpenAI API key (it starts with sk-)'),
})

// Connect or replace (upsert) — shape-validated only, then stored ACTIVE.
export const PUT = withAuth(async (req: NextRequest, _ctx, user) => {
  const body = await parseBody(req, putSchema)
  if (body.response) return body.response
  const { key } = body.data

  // Masked last-4 suffix only — never a leading slice of the secret.
  const data = {
    encryptedKey: encrypt(key),
    keyPrefix: `…${key.slice(-4)}`,
    status: 'ACTIVE',
  }
  const row = await prisma.userOpenAiKey.upsert({
    where: { userId: user.userId },
    create: { userId: user.userId, ...data },
    update: data,
    select: KEY_SELECT,
  })
  return NextResponse.json(toInfo(row))
})

export const DELETE = withAuth(async (_req, _ctx, user) => {
  // deleteMany ⇒ idempotent (a repeated disconnect is a 200, not a 500)
  await prisma.userOpenAiKey.deleteMany({ where: { userId: user.userId } })
  return NextResponse.json({ connected: false } satisfies OpenAiKeyInfo)
})
