import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { forbiddenIfNotOwner } from '@/lib/auth'
import { withAuth } from '@/lib/api/handler'
import { requiresAdmin } from '@/lib/campaign/queue'

type Params = { id: string; gid: string }

// Re-arm a FAILED or CANCELLED entry: back to PENDING, retry bookkeeping
// reset, due immediately (generateAt: now — the next worker tick picks it up).
export const POST = withAuth<Params>(async (_req, { params }, user) => {
  const existing = await prisma.scheduledGeneration.findFirst({
    where: { id: params.gid, campaignId: params.id },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const forbidden = forbiddenIfNotOwner(user, existing.createdById)
  if (forbidden) return forbidden

  // Re-arming an auto-publish entry re-arms a deferred publish — admin-only.
  if (requiresAdmin(existing.postAction) && user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Auto-publish actions require admin — use HOLD to generate for review.' },
      { status: 403 }
    )
  }

  if (existing.status !== 'FAILED' && existing.status !== 'CANCELLED') {
    return NextResponse.json(
      { error: `Only FAILED or CANCELLED entries can be re-run (status: ${existing.status})` },
      { status: 409 }
    )
  }

  const updated = await prisma.scheduledGeneration.update({
    where: { id: existing.id },
    data: {
      status: 'PENDING',
      retryCount: 0,
      errorReason: null,
      nextRetryAt: null,
      generateAt: new Date(),
    },
    include: { template: { select: { id: true, name: true } } },
  })

  return NextResponse.json(updated)
})
