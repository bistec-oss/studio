import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { forbiddenIfNotOwner } from '@/lib/auth'
import { withAuth, parseBody } from '@/lib/api/handler'
import { queueEntrySchema, requiresAdmin, validateTemplateSelection } from '@/lib/campaign/queue'

type Params = { id: string; gid: string }

const ENTRY_INCLUDE = { template: { select: { id: true, name: true } } } as const

async function findEntry(campaignId: string, gid: string) {
  return prisma.scheduledGeneration.findFirst({
    where: { id: gid, campaignId },
  })
}

// Edit a planned entry. The modal sends the full entry, so this validates via
// the same schema as create. Only PENDING entries are editable — a RUNNING
// entry is claimed by the worker, and COMPLETED/FAILED/CANCELLED are history.
export const PATCH = withAuth<Params>(async (req, { params }, user) => {
  const existing = await findEntry(params.id, params.gid)
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const forbidden = forbiddenIfNotOwner(user, existing.createdById)
  if (forbidden) return forbidden

  if (existing.status !== 'PENDING') {
    return NextResponse.json(
      { error: `Only PENDING entries can be edited (status: ${existing.status})` },
      { status: 409 }
    )
  }

  const body = await parseBody(req, queueEntrySchema)
  if (body.response) return body.response
  const entry = body.data

  // The gate applies to the current AND the requested action — an editor may
  // neither set auto-publish nor edit an entry that already has it.
  if ((requiresAdmin(existing.postAction) || requiresAdmin(entry.postAction)) && user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Auto-publish actions require admin — use HOLD to generate for review.' },
      { status: 403 }
    )
  }

  const templateError = await validateTemplateSelection(params.id, entry)
  if (templateError) return templateError

  const updated = await prisma.scheduledGeneration.update({
    where: { id: existing.id },
    data: {
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

  return NextResponse.json(updated)
})

// Cancel a planned entry (PENDING → CANCELLED). Not a hard delete — the entry
// stays visible in the queue history and can be re-armed via rerun.
export const DELETE = withAuth<Params>(async (_req, { params }, user) => {
  const existing = await findEntry(params.id, params.gid)
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const forbidden = forbiddenIfNotOwner(user, existing.createdById)
  if (forbidden) return forbidden

  if (existing.status !== 'PENDING') {
    return NextResponse.json(
      { error: `Only PENDING entries can be cancelled (status: ${existing.status})` },
      { status: 409 }
    )
  }

  await prisma.scheduledGeneration.update({
    where: { id: existing.id },
    data: { status: 'CANCELLED', nextRetryAt: null },
  })

  return new NextResponse(null, { status: 204 })
})
