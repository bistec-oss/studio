import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withTeamAdmin } from '@/lib/api/handler'

export const DELETE = withTeamAdmin<{ channel: string }>(async (_req, { params }, user) => {
  const channel = params.channel.toUpperCase()
  if (!['INSTAGRAM', 'LINKEDIN'].includes(channel)) {
    return NextResponse.json({ error: 'Invalid channel' }, { status: 400 })
  }

  const existing = await prisma.channelToken.findUnique({ where: { channel: channel as 'INSTAGRAM' | 'LINKEDIN' } })
  if (!existing || existing.teamId !== user.teamId) {
    return NextResponse.json({ error: 'No token found for this channel' }, { status: 404 })
  }

  await prisma.channelToken.delete({ where: { channel: channel as 'INSTAGRAM' | 'LINKEDIN' } })
  return new NextResponse(null, { status: 204 })
})
