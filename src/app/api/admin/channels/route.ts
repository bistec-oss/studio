import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withAdmin, parseBody } from '@/lib/api/handler'
import { encrypt } from '@/lib/crypto'

export const GET = withAdmin(async () => {
  const tokens = await prisma.channelToken.findMany()
  const map: Record<string, { connected: boolean; updatedAt?: string }> = {
    INSTAGRAM: { connected: false },
    LINKEDIN: { connected: false },
  }
  for (const t of tokens) {
    map[t.channel] = { connected: true, updatedAt: t.updatedAt.toISOString() }
  }

  return NextResponse.json(map)
})

const createSchema = z.object({
  channel: z.enum(['INSTAGRAM', 'LINKEDIN'], {
    errorMap: () => ({ message: 'channel must be INSTAGRAM or LINKEDIN' }),
  }),
  // Tokens are encrypted verbatim — validate presence without altering the value.
  token: z.string().refine((v) => v.trim().length > 0, 'token is required'),
  metadata: z.string().refine((v) => v.trim().length > 0, 'metadata is required'),
})

export const POST = withAdmin(async (req: NextRequest) => {
  const body = await parseBody(req, createSchema)
  if (body.response) return body.response
  const { channel, token, metadata } = body.data

  await prisma.channelToken.upsert({
    where: { channel },
    create: { channel, encryptedToken: encrypt(token), encryptedMetadata: encrypt(metadata) },
    update: { encryptedToken: encrypt(token), encryptedMetadata: encrypt(metadata) },
  })

  return NextResponse.json({ connected: true }, { status: 201 })
})
