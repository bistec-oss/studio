import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { withTeamAuth, withTeamAdmin, parseBody } from '@/lib/api/handler'

type Params = { id: string }

async function campaignInTeam(id: string, teamId: string): Promise<boolean> {
  const campaign = await prisma.campaign.findFirst({
    where: { id, isDeleted: false, teamId },
    select: { id: true },
  })
  return Boolean(campaign)
}

// Versions are readable by any signed-in user — editors see the active briefing
// for context in the wizard and on the campaign page; writes are admin-only
// (the briefing steers every post in the campaign, like the brand voice).
// Team tenancy fix: this ran under plain withAuth + a teamId-less
// campaignExists() check — any authenticated user of ANY team could read
// another team's full briefing content (every version) by campaignId.
export const GET = withTeamAuth<Params>(async (_req, { params }, user) => {
  if (!(await campaignInTeam(params.id, user.teamId))) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  const briefings = await prisma.campaignBriefing.findMany({
    where: { campaignId: params.id },
    orderBy: { version: 'desc' },
  })

  return NextResponse.json(briefings)
})

const createSchema = z.object({
  content: z.string().trim().min(1, 'content is required'),
})

export const POST = withTeamAdmin<Params>(async (req, { params }, user) => {
  const { userId } = user

  const campaign = await prisma.campaign.findFirst({
    where: { id: params.id, isDeleted: false },
    select: { id: true, teamId: true },
  })
  if (!campaign || campaign.teamId !== user.teamId) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  const body = await parseBody(req, createSchema)
  if (body.response) return body.response
  const { content } = body.data

  // Allocate the next version, deactivate the current active briefing, and
  // create the new active one atomically. Concurrent saves can read the same
  // max version and collide on @@unique([campaignId, version]); surface that
  // as 409 rather than a raw P2002 500. (Mirrors the BrandKitPrompt route.)
  try {
    const briefing = await prisma.$transaction(async (tx) => {
      const latest = await tx.campaignBriefing.findFirst({
        where: { campaignId: params.id },
        orderBy: { version: 'desc' },
        select: { version: true },
      })
      const nextVersion = (latest?.version ?? 0) + 1

      await tx.campaignBriefing.updateMany({
        where: { campaignId: params.id, isActive: true },
        data: { isActive: false },
      })

      return tx.campaignBriefing.create({
        data: {
          campaignId: params.id,
          content,
          version: nextVersion,
          isActive: true,
          createdBy: userId,
        },
      })
    })

    return NextResponse.json(briefing, { status: 201 })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return NextResponse.json(
        { error: 'A concurrent edit created a new version — please retry.' },
        { status: 409 }
      )
    }
    throw err
  }
})
