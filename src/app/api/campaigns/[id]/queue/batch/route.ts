import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth, parseBody } from '@/lib/api/handler'
import { hasRole } from '@/lib/auth'
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
export const POST = withAuth<Params>(async (req, { params }, user) => {
  const campaign = await prisma.campaign.findFirst({
    where: { id: params.id, isDeleted: false },
    select: { id: true },
  })
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  const body = await parseBody(req, queueBatchSchema)
  if (body.response) return body.response
  const { entries } = body.data

  // Auto-publish entries are a deferred publish — admin-only (same as POST /api/posts
  // and the single-create route). Reject the whole batch if any entry needs it.
  if (entries.some((e) => requiresAdmin(e.postAction)) && !hasRole(user.role, 'admin')) {
    return NextResponse.json(
      { error: 'Auto-publish actions require admin — use HOLD to generate for review.' },
      { status: 403 }
    )
  }

  // Validate every template selection before writing anything.
  for (const entry of entries) {
    const templateError = await validateTemplateSelection(params.id, entry)
    if (templateError) return templateError
  }

  const created = await prisma.$transaction(
    entries.map((entry) =>
      prisma.scheduledGeneration.create({
        data: toEntryCreateData(params.id, user.userId, entry),
        include: ENTRY_INCLUDE,
      })
    )
  )

  return NextResponse.json({ created, count: created.length }, { status: 201 })
})
