import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withTeamAuth } from '@/lib/api/handler'
import { canAccessContent } from '@/lib/authz/visibility'
import { startBackgroundGeneration } from '@/lib/agent/backgroundGeneration'

type Params = { id: string }

// Re-run generation for a FAILED draft in place (the preview page's inline
// "Retry"). Resets the draft to IN_PROGRESS and fires generation in the
// background again; the page's poll resumes and skeletons re-appear. Only a
// FAILED draft can be retried — a live (EXPORTED/PUBLISHED) draft is left alone,
// and an already-IN_PROGRESS one is presumed still running.
export const POST = withTeamAuth<Params>(async (_req, { params }, user) => {
  const draft = await prisma.draft.findUnique({
    where: { id: params.id },
    select: { id: true, status: true, teamId: true, brief: { select: { userId: true, campaignId: true } } },
  })
  if (
    !draft ||
    !canAccessContent(user, { teamId: draft.teamId, ownerId: draft.brief.userId, campaignId: draft.brief.campaignId })
  ) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

  if (draft.status !== 'FAILED') {
    return NextResponse.json(
      { error: 'Only a failed draft can be retried' },
      { status: 409 },
    )
  }

  await prisma.draft.update({
    where: { id: params.id },
    data: { status: 'IN_PROGRESS', failureReason: null },
  })
  await startBackgroundGeneration(params.id, user.userId, user.teamId)

  return NextResponse.json({ ok: true }, { status: 202 })
})
