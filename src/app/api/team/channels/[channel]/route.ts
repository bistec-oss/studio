import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withTeamAdmin } from '@/lib/api/handler'

export const DELETE = withTeamAdmin<{ channel: string }>(async (_req, { params }, user) => {
  const channel = params.channel.toUpperCase()
  if (!['INSTAGRAM', 'LINKEDIN'].includes(channel)) {
    return NextResponse.json({ error: 'Invalid channel' }, { status: 400 })
  }

  const key = { teamId_channel: { teamId: user.teamId, channel: channel as 'INSTAGRAM' | 'LINKEDIN' } }
  const existing = await prisma.channelToken.findUnique({ where: key })
  if (!existing) {
    return NextResponse.json({ error: 'No token found for this channel' }, { status: 404 })
  }

  await prisma.channelToken.delete({ where: key })
  return new NextResponse(null, { status: 204 })
})
