import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { forbiddenIfNotOwner } from '@/lib/auth'
import { withAuth } from '@/lib/api/handler'
import { startBackgroundGeneration } from '@/lib/agent/backgroundGeneration'

type Params = { id: string }

// Re-run generation for a FAILED draft in place (the preview page's inline
// "Retry"). Resets the draft to IN_PROGRESS and fires generation in the
// background again; the page's poll resumes and skeletons re-appear. Only a
// FAILED draft can be retried — a live (EXPORTED/PUBLISHED) draft is left alone,
// and an already-IN_PROGRESS one is presumed still running.
export const POST = withAuth<Params>(async (_req, { params }, user) => {
  const draft = await prisma.draft.findUnique({
    where: { id: params.id },
    select: { id: true, status: true, brief: { select: { userId: true } } },
  })
  if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  const forbidden = forbiddenIfNotOwner(user, draft.brief.userId)
  if (forbidden) return forbidden

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
  await startBackgroundGeneration(params.id, user.userId)

  return NextResponse.json({ ok: true }, { status: 202 })
})
