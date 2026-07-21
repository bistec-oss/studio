import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withTeamAdmin } from '@/lib/api/handler'

// Rollback: re-activate an older briefing version (no new version is created).
// Mirrors the BrandKitPrompt activate route.
export const POST = withTeamAdmin<{ id: string; vid: string }>(async (_req, { params }, user) => {
  const campaign = await prisma.campaign.findFirst({
    where: { id: params.id, isDeleted: false },
    select: { id: true, teamId: true },
  })
  if (!campaign || campaign.teamId !== user.teamId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const briefing = await prisma.campaignBriefing.findFirst({
    where: { id: params.vid, campaignId: params.id },
  })
  if (!briefing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.$transaction([
    prisma.campaignBriefing.updateMany({
      where: { campaignId: params.id, isActive: true },
      data: { isActive: false },
    }),
    prisma.campaignBriefing.update({
      where: { id: params.vid },
      data: { isActive: true },
    }),
  ])

  return NextResponse.json({ activated: params.vid })
})
