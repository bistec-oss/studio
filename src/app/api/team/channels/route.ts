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

  // ChannelToken.channel is a schema-global @unique column (not yet
  // per-team), so the upsert below can only ever touch one row per channel
  // across the whole installation. Without this guard, Team B connecting the
  // same channel would silently overwrite Team A's stored credential while
  // GET kept reporting it as "theirs". A null teamId is a pre-tenancy legacy
  // row — it stays claimable (and gets adopted below); any other team's row
  // is a hard conflict. Task 12/15 replaces this with a composite
  // @@unique([teamId, channel]) so each team gets its own row.
  const existing = await prisma.channelToken.findUnique({ where: { channel } })
  if (existing && existing.teamId !== null && existing.teamId !== teamId) {
    return NextResponse.json({ error: 'Channel already connected' }, { status: 409 })
  }

  await prisma.channelToken.upsert({
    where: { channel },
    create: { channel, teamId, encryptedToken: encrypt(token), encryptedMetadata: encrypt(metadata) },
    // A legacy null-teamId row is adopted by whichever team claims it first.
    update: { teamId, encryptedToken: encrypt(token), encryptedMetadata: encrypt(metadata) },
  })

  return NextResponse.json({ connected: true }, { status: 201 })
})
