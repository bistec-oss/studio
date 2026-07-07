import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAdmin } from '@/lib/api/handler'

// Rollback: re-activate an older briefing version (no new version is created).
// Mirrors the BrandKitPrompt activate route.
export const POST = withAdmin<{ id: string; vid: string }>(async (_req, { params }) => {
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
