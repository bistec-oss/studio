import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withTeamAuth } from '@/lib/api/handler'
import { canAccessContent } from '@/lib/authz/visibility'
import { requiresAdmin } from '@/lib/campaign/queue'

type Params = { id: string; gid: string }

// Re-arm a FAILED or CANCELLED entry: back to PENDING, retry bookkeeping
// reset, due immediately (generateAt: now — the next worker tick picks it up).
// Team tenancy fix: withTeamAuth + canAccessContent (this used to be plain
// withAuth with no teamId check at all — see the note in ../../route.ts).
export const POST = withTeamAuth<Params>(async (_req, { params }, user) => {
  const existing = await prisma.scheduledGeneration.findFirst({
    where: { id: params.gid, campaignId: params.id },
  })
  if (
    !existing ||
    !canAccessContent(user, { teamId: existing.teamId, ownerId: existing.createdById, campaignId: params.id })
  ) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Re-arming an auto-publish entry re-arms a deferred publish — team-admin-only.
  if (requiresAdmin(existing.postAction) && !(user.teamRole === 'ADMIN' || user.isSuperAdmin)) {
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
