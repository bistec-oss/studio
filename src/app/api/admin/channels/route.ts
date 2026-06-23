import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'
import { encrypt } from '@/lib/crypto'

export async function GET(req: NextRequest) {
  const auth = await requireRole('admin')
  if (auth instanceof NextResponse) return auth

  const tokens = await prisma.channelToken.findMany()
  const map: Record<string, { connected: boolean; updatedAt?: string }> = {
    INSTAGRAM: { connected: false },
    LINKEDIN: { connected: false },
  }
  for (const t of tokens) {
    map[t.channel] = { connected: true, updatedAt: t.updatedAt.toISOString() }
  }

  return NextResponse.json(map)
}

export async function POST(req: NextRequest) {
  const auth = await requireRole('admin')
  if (auth instanceof NextResponse) return auth

  const body = await req.json()
  const { channel, token, metadata } = body

  if (!channel || !['INSTAGRAM', 'LINKEDIN'].includes(channel)) {
    return NextResponse.json({ error: 'channel must be INSTAGRAM or LINKEDIN' }, { status: 400 })
  }
  if (!token?.trim()) return NextResponse.json({ error: 'token is required' }, { status: 400 })
  if (!metadata?.trim()) return NextResponse.json({ error: 'metadata is required' }, { status: 400 })

  await prisma.channelToken.upsert({
    where: { channel },
    create: { channel, encryptedToken: encrypt(token), encryptedMetadata: encrypt(metadata) },
    update: { encryptedToken: encrypt(token), encryptedMetadata: encrypt(metadata) },
  })

  return NextResponse.json({ connected: true }, { status: 201 })
}
