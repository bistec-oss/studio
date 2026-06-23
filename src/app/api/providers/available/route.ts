import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { ProviderSlot } from '@prisma/client'

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const slot = req.nextUrl.searchParams.get('slot')
  if (!slot || !['COPY', 'IMAGE'].includes(slot)) {
    return NextResponse.json({ error: 'slot must be COPY or IMAGE' }, { status: 400 })
  }

  const providers = await prisma.availableProvider.findMany({
    where: { slot: slot as ProviderSlot, isEnabled: true },
    select: { id: true, providerKey: true, label: true, isDefault: true },
    orderBy: [{ isDefault: 'desc' }, { label: 'asc' }],
  })

  return NextResponse.json(providers)
}
