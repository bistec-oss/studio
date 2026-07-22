import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withTeamAuth, parseBody } from '@/lib/api/handler'
import { queueEntrySchema, requiresAdmin, validateTemplateSelection, toEntryCreateData } from '@/lib/campaign/queue'

type Params = { id: string }

const ENTRY_INCLUDE = { template: { select: { id: true, name: true } } } as const

async function findCampaign(id: string) {
  return prisma.campaign.findFirst({ where: { id, isDeleted: false }, select: { id: true, teamId: true } })
}

// Team tenancy fix: this whole queue/** subtree ran under plain withAuth with
// no teamId check at all (findCampaign didn't scope by team, and the
// scheduledGeneration lookups below matched on id/campaignId alone) — any
// authenticated user of ANY team could read or write another team's
// scheduled-generation queue by knowing/guessing a campaignId. Missed by the
// Task 8 withTeamAdmin sweep (which covered campaigns/[id]'s own route +
// documents/briefing, but not its queue/** children) and Task 9's per-item
// access pass (scoped to briefs/drafts/posts). Fixed here: withTeamAuth +
// an explicit campaign.teamId / entry.teamId match in every handler in this
// subtree (this file + [gid]/route.ts, [gid]/rerun/route.ts, batch/route.ts).
export const GET = withTeamAuth<Params>(async (_req, { params }, user) => {
  const campaign = await findCampaign(params.id)
  if (!campaign || campaign.teamId !== user.teamId) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  const entries = await prisma.scheduledGeneration.findMany({
    where: { campaignId: params.id },
    include: ENTRY_INCLUDE,
    orderBy: { generateAt: 'asc' },
    take: 500,
  })

  return NextResponse.json(entries)
})

export const POST = withTeamAuth<Params>(async (req, { params }, user) => {
  const campaign = await findCampaign(params.id)
  if (!campaign || campaign.teamId !== user.teamId) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  const body = await parseBody(req, queueEntrySchema)
  if (body.response) return body.response
  const entry = body.data

  // Auto-publish entries are a deferred publish — team-admin-only, matching
  // POST /api/posts's team-admin gate (D5).
  if (requiresAdmin(entry.postAction) && !(user.teamRole === 'ADMIN' || user.isSuperAdmin)) {
    return NextResponse.json(
      { error: 'Auto-publish actions require admin — use HOLD to generate for review.' },
      { status: 403 }
    )
  }

  const templateError = await validateTemplateSelection(params.id, entry, campaign.teamId)
  if (templateError) return templateError

  const created = await prisma.scheduledGeneration.create({
    data: toEntryCreateData(params.id, user.userId, entry, campaign.teamId),
    include: ENTRY_INCLUDE,
  })

  return NextResponse.json(created, { status: 201 })
})
