import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withTeamAuth } from '@/lib/api/handler'
import { resolveBrandKit } from '@/lib/brandkit/resolve'

// Team tenancy fix: this GET ran under plain withAuth with no teamId check at
// all — any authenticated user of ANY team could resolve another team's
// effective brand kit (colors, fonts, logo, voice prompt) by campaignId.
export const GET = withTeamAuth<{ id: string }>(async (_req, { params }, user) => {
  const campaign = await prisma.campaign.findFirst({
    where: { id: params.id, isDeleted: false },
    select: { id: true, teamId: true },
  })
  if (!campaign || campaign.teamId !== user.teamId) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  const resolved = await resolveBrandKit(user.teamId, params.id)
  if (!resolved) return NextResponse.json({ kit: null, source: null })

  return NextResponse.json({ kit: resolved, source: resolved.source })
})
