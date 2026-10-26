import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuth, parseBody } from '@/lib/api/handler'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/crypto'
import type { OpenAiKeyInfo } from '@/lib/api-types'
import { validImageKey } from '@/providers/keyPrefix'

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
  provider: string
}

function toInfo(row: KeyRow | null): OpenAiKeyInfo {
  if (!row) return { connected: false }
  return {
    connected: true,
    status: row.status === 'INVALID' ? 'INVALID' : 'ACTIVE',
    keyPrefix: row.keyPrefix,
    provider: row.provider === 'gemini' ? 'gemini' : 'openai',
  }
}

const KEY_SELECT = { status: true, keyPrefix: true, provider: true } as const

export const GET = withAuth(async (_req, _ctx, user) => {
  const row = await prisma.userOpenAiKey.findUnique({
    where: { userId: user.userId },
    select: KEY_SELECT,
  })
  return NextResponse.json(toInfo(row))
})

// 031 FR-11: the provider comes from the key's prefix (one detector,
// providers/keyPrefix.ts) and is never defaulted: an Anthropic key, a random
// string or a malformed AIza key is a 400 and nothing is stored.
const putSchema = z.object({
  key: z
    .string()
    .trim()
    .refine((k) => validImageKey(k) !== null, 'Paste an OpenAI key (starts with sk-) or a Gemini key (starts with AIza).'),
})

// Connect or replace (upsert) — shape-validated only, then stored ACTIVE with its detected provider.
export const PUT = withAuth(async (req: NextRequest, _ctx, user) => {
  const body = await parseBody(req, putSchema)
  if (body.response) return body.response
  const { key } = body.data

  // Masked last-4 suffix only — never a leading slice of the secret.
  const data = {
    encryptedKey: encrypt(key),
    keyPrefix: `…${key.slice(-4)}`,
    status: 'ACTIVE',
    provider: validImageKey(key) as 'openai' | 'gemini',
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
