import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth, parseBody } from '@/lib/api/handler'
import { hasRole } from '@/lib/auth'
import { queueEntrySchema, requiresAdmin, validateTemplateSelection } from '@/lib/campaign/queue'

type Params = { id: string }

const ENTRY_INCLUDE = { template: { select: { id: true, name: true } } } as const

async function findCampaign(id: string) {
  return prisma.campaign.findFirst({ where: { id, isDeleted: false }, select: { id: true } })
}

export const GET = withAuth<Params>(async (_req, { params }) => {
  if (!(await findCampaign(params.id))) {
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

export const POST = withAuth<Params>(async (req, { params }, user) => {
  if (!(await findCampaign(params.id))) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  const body = await parseBody(req, queueEntrySchema)
  if (body.response) return body.response
  const entry = body.data

  // Auto-publish entries are a deferred publish — admin-only, matching POST /api/posts.
  if (requiresAdmin(entry.postAction) && !hasRole(user.role, 'admin')) {
    return NextResponse.json(
      { error: 'Auto-publish actions require admin — use HOLD to generate for review.' },
      { status: 403 }
    )
  }

  const templateError = await validateTemplateSelection(params.id, entry)
  if (templateError) return templateError

  const created = await prisma.scheduledGeneration.create({
    data: {
      campaignId: params.id,
      createdById: user.userId,
      topic: entry.topic,
      description: entry.description || null,
      goal: entry.goal,
      tone: entry.tone,
      channels: entry.channels,
      aspectRatio: entry.aspectRatio,
      designMode: entry.designMode,
      templateId: entry.designMode === 'TEMPLATE' ? entry.templateId : null,
      generateAt: entry.generateAt,
      postAction: entry.postAction,
      publishAt: entry.postAction === 'SCHEDULE_PUBLISH' ? entry.publishAt : null,
    },
    include: ENTRY_INCLUDE,
  })

  return NextResponse.json(created, { status: 201 })
})
