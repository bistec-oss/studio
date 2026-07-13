import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { forbiddenIfNotOwner } from '@/lib/auth'
import { withAuth, withAdmin, parseBody } from '@/lib/api/handler'
import { resolveBrandKit } from '@/lib/brandkit/resolve'
import { resolveExportUrl } from '@/lib/storage/minio'

type Params = { id: string }

// A generation running in-process is bounded by the same 15-min lease the
// scheduled-generation runner uses. If a draft is still IN_PROGRESS well past
// that, the run was almost certainly interrupted (e.g. a server restart), so
// it's swept to FAILED lazily on read — the preview page then shows the inline
// error card + Retry instead of an eternal skeleton.
const STUCK_GENERATION_MS = 15 * 60_000

const STUCK_REASON = 'Generation was interrupted. Please retry.'

// Returns the EFFECTIVE status/reason after a possible sweep, so the response
// reflects the recovery immediately (no extra round-trip).
async function recoverIfStuck(
  id: string,
  status: string,
  failureReason: string | null,
  updatedAt: Date,
): Promise<{ status: string; failureReason: string | null }> {
  if (status !== 'IN_PROGRESS' || Date.now() - updatedAt.getTime() < STUCK_GENERATION_MS) {
    return { status, failureReason }
  }
  await prisma.draft
    .updateMany({
      // Guard on status so we never clobber a run that finished between read and write.
      where: { id, status: 'IN_PROGRESS' },
      data: { status: 'FAILED', failureReason: STUCK_REASON },
    })
    .catch(() => {
      /* best-effort recovery */
    })
  return { status: 'FAILED', failureReason: STUCK_REASON }
}

async function loadDraft(id: string) {
  const draft = await prisma.draft.findUnique({
    where: { id },
    include: {
      brief: true,
      posts: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          channel: true,
          status: true,
          scheduledAt: true,
          publishedAt: true,
        },
      },
      _count: { select: { revisions: true } },
    },
  })
  if (!draft) return null

  // Sweep a draft stranded IN_PROGRESS by an interrupted run → FAILED, so the
  // effective status/reason below reflect the recovery.
  const effective = await recoverIfStuck(draft.id, draft.status, draft.failureReason, draft.updatedAt)

  const kit = await resolveBrandKit(draft.brief.campaignId ?? undefined, draft.brief.brandKitId ?? undefined)

  return {
    ownerId: draft.brief.userId,
    data: {
    id: draft.id,
    briefId: draft.briefId,
    copyText: draft.copyText,
    imageUrl: draft.imageUrl,
    htmlContent: draft.htmlContent,
    // exportUrl is stored as an EXPORTS object key — sign it for the browser.
    exportUrl: await resolveExportUrl(draft.exportUrl),
    status: effective.status,
    failureReason: effective.failureReason,
    createdAt: draft.createdAt,
    revisionCount: draft._count.revisions,
    currentRevisionNumber: draft.currentRevisionNumber,
    brandKitName: kit?.name ?? null,
    brief: {
      id: draft.brief.id,
      topic: draft.brief.topic,
      goal: draft.brief.goal,
      tone: draft.brief.tone,
      channels: draft.brief.channels,
      aspectRatio: draft.brief.aspectRatio,
      designMode: draft.brief.designMode,
    },
    posts: draft.posts,
    },
  }
}

export const GET = withAuth<Params>(async (_req, { params }, user) => {
  const result = await loadDraft(params.id)
  if (!result) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  const forbidden = forbiddenIfNotOwner(user, result.ownerId)
  if (forbidden) return forbidden

  return NextResponse.json(result.data)
})

// Permissive schema + manual type check so the error message stays exactly
// 'copyText is required' (asserted by tests).
const patchSchema = z.object({}).passthrough()

export const PATCH = withAuth<Params>(async (req, { params }, user) => {
  const body = await parseBody(req, patchSchema)
  if (body.response) return body.response
  const { copyText } = body.data as { copyText?: unknown }
  if (typeof copyText !== 'string') {
    return NextResponse.json({ error: 'copyText is required' }, { status: 400 })
  }

  const existing = await prisma.draft.findUnique({
    where: { id: params.id },
    select: { status: true, brief: { select: { userId: true } } },
  })
  if (!existing) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  const forbidden = forbiddenIfNotOwner(user, existing.brief.userId)
  if (forbidden) return forbidden

  // The published caption lives only on the draft — editing it after publish
  // would silently desynchronize the record from what was actually posted.
  if (existing.status === 'PUBLISHED') {
    return NextResponse.json(
      { error: 'This draft has been published — its copy can no longer be edited' },
      { status: 409 }
    )
  }

  await prisma.draft.update({
    where: { id: params.id },
    data: {
      copyText,
      // A copy edit invalidates a prior export.
      ...(existing.status === 'EXPORTED' ? { status: 'IN_PROGRESS' } : {}),
    },
  })

  const result = await loadDraft(params.id)
  return NextResponse.json(result?.data)
})

// Admin-only hard delete: removes the draft with its publish history (Post rows —
// a SCHEDULED post is thereby cancelled), revisions, and the parent Brief when no
// other draft references it. No cascades exist on these relations, so children
// are deleted first, all in one transaction.
export const DELETE = withAdmin<Params>(async (_req, { params }) => {
  const draft = await prisma.draft.findUnique({
    where: { id: params.id },
    select: { id: true, briefId: true },
  })
  if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })

  const briefDeleted = await prisma.$transaction(async (tx) => {
    await tx.post.deleteMany({ where: { draftId: draft.id } })
    await tx.draftRevision.deleteMany({ where: { draftId: draft.id } })
    await tx.draft.delete({ where: { id: draft.id } })

    // Sweep the brief only when it has become an orphan (the schema allows
    // multiple drafts per brief, so count before deleting).
    const remaining = await tx.draft.count({ where: { briefId: draft.briefId } })
    if (remaining === 0) {
      await tx.brief.delete({ where: { id: draft.briefId } })
      return true
    }
    return false
  })

  return NextResponse.json({ deleted: true, briefDeleted })
})
