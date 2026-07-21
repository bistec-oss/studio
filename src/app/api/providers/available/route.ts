import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withTeamAuth } from '@/lib/api/handler'
import { ProviderSlot } from '@prisma/client'

export const GET = withTeamAuth(async (req: NextRequest, _ctx, user) => {
  const slot = req.nextUrl.searchParams.get('slot')
  if (!slot || !['COPY', 'IMAGE'].includes(slot)) {
    return NextResponse.json({ error: 'slot must be COPY or IMAGE' }, { status: 400 })
  }

  const providers = await prisma.availableProvider.findMany({
    where: { slot: slot as ProviderSlot, isEnabled: true, teamId: user.teamId },
    select: { id: true, providerKey: true, label: true, isDefault: true },
    orderBy: [{ isDefault: 'desc' }, { label: 'asc' }],
  })

  return NextResponse.json(providers)
})
