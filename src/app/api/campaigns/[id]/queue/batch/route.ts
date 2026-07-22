import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withTeamAuth, parseBody } from '@/lib/api/handler'
import {
  queueBatchSchema,
  requiresAdmin,
  validateTemplateSelection,
  toEntryCreateData,
} from '@/lib/campaign/queue'

type Params = { id: string }

const ENTRY_INCLUDE = { template: { select: { id: true, name: true } } } as const

// Batch-create scheduled-generation entries from an AI-proposed, admin-approved
// plan (F4). Validation mirrors the single-create route per entry — same schema,
// same admin gate for auto-publish, same template checks — and all rows insert
// in one transaction so a bad entry rejects the whole plan rather than leaving a
// partial schedule.
// Team tenancy fix: withTeamAuth + a teamId match on the loaded campaign (this
// used to be plain withAuth with no teamId check — see the note in ../route.ts).
export const POST = withTeamAuth<Params>(async (req, { params }, user) => {
  const campaign = await prisma.campaign.findFirst({
    where: { id: params.id, isDeleted: false },
    select: { id: true, teamId: true },
  })
  if (!campaign || campaign.teamId !== user.teamId) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  const body = await parseBody(req, queueBatchSchema)
  if (body.response) return body.response
  const { entries } = body.data

  // Auto-publish entries are a deferred publish — team-admin-only (same as
  // POST /api/posts and the single-create route). Reject the whole batch if
  // any entry needs it.
  if (entries.some((e) => requiresAdmin(e.postAction)) && !(user.teamRole === 'ADMIN' || user.isSuperAdmin)) {
    return NextResponse.json(
      { error: 'Auto-publish actions require admin — use HOLD to generate for review.' },
      { status: 403 }
    )
  }

  // Validate every template selection before writing anything.
  for (const entry of entries) {
    const templateError = await validateTemplateSelection(params.id, entry, campaign.teamId)
    if (templateError) return templateError
  }

  const created = await prisma.$transaction(
    entries.map((entry) =>
      prisma.scheduledGeneration.create({
        data: toEntryCreateData(params.id, user.userId, entry, campaign.teamId),
        include: ENTRY_INCLUDE,
      })
    )
  )

  return NextResponse.json({ created, count: created.length }, { status: 201 })
})
