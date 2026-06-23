import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'

export async function DELETE(req: NextRequest, { params }: { params: { channel: string } }) {
  const auth = await requireRole('admin')
  if (auth instanceof NextResponse) return auth

  const channel = params.channel.toUpperCase()
  if (!['INSTAGRAM', 'LINKEDIN'].includes(channel)) {
    return NextResponse.json({ error: 'Invalid channel' }, { status: 400 })
  }

  const existing = await prisma.channelToken.findUnique({ where: { channel: channel as 'INSTAGRAM' | 'LINKEDIN' } })
  if (!existing) return NextResponse.json({ error: 'No token found for this channel' }, { status: 404 })

  await prisma.channelToken.delete({ where: { channel: channel as 'INSTAGRAM' | 'LINKEDIN' } })
  return new NextResponse(null, { status: 204 })
}
