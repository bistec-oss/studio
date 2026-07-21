import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withTeamAdmin, parseBody } from '@/lib/api/handler'
import { encrypt } from '@/lib/crypto'

export const GET = withTeamAdmin(async (_req, _ctx, user) => {
  const tokens = await prisma.channelToken.findMany({ where: { teamId: user.teamId } })
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

export const POST = withTeamAdmin(async (req: NextRequest, _ctx, user) => {
  const body = await parseBody(req, createSchema)
  if (body.response) return body.response
  const { channel, token, metadata } = body.data

  const teamId = user.teamId

  // ChannelToken now has a real per-team composite unique
  // (@@unique([teamId, channel]), Task 15 migration) — each team gets its
  // own row for a channel, so there is no cross-team conflict to guard
  // against here (the old schema-global `channel @unique` needed the guard
  // this replaced; see git history for that interim workaround).
  await prisma.channelToken.upsert({
    where: { teamId_channel: { teamId, channel } },
    create: { channel, teamId, encryptedToken: encrypt(token), encryptedMetadata: encrypt(metadata) },
    update: { encryptedToken: encrypt(token), encryptedMetadata: encrypt(metadata) },
  })

  return NextResponse.json({ connected: true }, { status: 201 })
})
