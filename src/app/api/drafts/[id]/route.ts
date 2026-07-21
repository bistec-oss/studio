import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { DraftAction } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { withTeamAuth, withTeamAdmin, parseBody } from '@/lib/api/handler'
import { canAccessContent } from '@/lib/authz/visibility'
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

const STUCK_ACTION_REASON = 'The action was interrupted. Please try again.'

// Returns the EFFECTIVE status/reason (and pending-action fields) after a
// possible sweep, so the response reflects the recovery immediately (no extra
// round-trip). Two independent lazy sweeps share the 15-min bound: a draft
// stranded IN_PROGRESS by an interrupted generation → FAILED, and a stale
// in-flight async action (regenerate/refine) → cleared with an interruption
// message. The action sweep never touches draft content or status.
async function recoverIfStuck(
  id: string,
  status: string,
  failureReason: string | null,
  pendingAction: DraftAction | null,
  pendingActionError: string | null,
  updatedAt: Date,
): Promise<{
  status: string
  failureReason: string | null
  pendingAction: DraftAction | null
  pendingActionError: string | null
}> {
  const stale = Date.now() - updatedAt.getTime() >= STUCK_GENERATION_MS
  const effective = { status, failureReason, pendingAction, pendingActionError }

  if (status === 'IN_PROGRESS' && stale) {
    await prisma.draft
      .updateMany({
        // Guard on status so we never clobber a run that finished between read and write.
        where: { id, status: 'IN_PROGRESS' },
        data: { status: 'FAILED', failureReason: STUCK_REASON },
      })
      .catch(() => {
        /* best-effort recovery */
      })
    effective.status = 'FAILED'
    effective.failureReason = STUCK_REASON
  }

  if (pendingAction !== null && stale) {
    await prisma.draft
      .updateMany({
        // Guard on the observed action so we never clobber one that finished
        // (or a new one that started) between read and write.
        where: { id, pendingAction },
        data: { pendingAction: null, pendingActionError: STUCK_ACTION_REASON },
      })
      .catch(() => {
        /* best-effort recovery */
      })
    effective.pendingAction = null
    effective.pendingActionError = STUCK_ACTION_REASON
  }

  return effective
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

  // Sweep a draft stranded IN_PROGRESS by an interrupted run → FAILED (and a
  // stale in-flight action → cleared), so the effective fields below reflect
  // the recovery.
  const effective = await recoverIfStuck(
    draft.id,
    draft.status,
    draft.failureReason,
    draft.pendingAction,
    draft.pendingActionError,
    draft.updatedAt,
  )

  // Surface a refine brand-kit conflict to the poll WITHOUT the stored
  // pendingHtml — it can be huge and is server-side only (the Override path
  // reads it from the DB).
  const pendingConflict = draft.pendingConflict as unknown as {
    conflictId: string
    explanation: string
  } | null

  const kit = await resolveBrandKit(draft.brief.campaignId ?? undefined, draft.brief.brandKitId ?? undefined)

  return {
    ownerId: draft.brief.userId,
    teamId: draft.teamId,
    campaignId: draft.brief.campaignId,
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
    pendingAction: effective.pendingAction,
    pendingActionError: effective.pendingActionError,
    conflict: pendingConflict
      ? { conflictId: pendingConflict.conflictId, explanation: pendingConflict.explanation }
      : null,
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

export const GET = withTeamAuth<Params>(async (_req, { params }, user) => {
  const result = await loadDraft(params.id)
  if (
    !result ||
    !canAccessContent(user, { teamId: result.teamId, ownerId: result.ownerId, campaignId: result.campaignId })
  ) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

  return NextResponse.json(result.data)
})

// Permissive schema + manual type check so the error message stays exactly
// 'copyText is required' (asserted by tests).
const patchSchema = z.object({}).passthrough()

// Team tenancy fix: this handler used to run under plain withAuth +
// forbiddenIfNotOwner (a platform-role-only check, no team dimension at
// all) — since forbiddenIfNotOwner lets ANY admin/super-admin bypass
// ownership, an admin of ANY team could edit ANY other team's draft copy.
// Task 8/9's sweeps covered this file's GET and DELETE but missed PATCH.
// Now withTeamAuth + canAccessContent, matching the GET handler above.
export const PATCH = withTeamAuth<Params>(async (req, { params }, user) => {
  const body = await parseBody(req, patchSchema)
  if (body.response) return body.response
  const { copyText } = body.data as { copyText?: unknown }
  if (typeof copyText !== 'string') {
    return NextResponse.json({ error: 'copyText is required' }, { status: 400 })
  }

  const existing = await prisma.draft.findUnique({
    where: { id: params.id },
    select: { status: true, teamId: true, brief: { select: { userId: true, campaignId: true } } },
  })
  if (
    !existing ||
    !canAccessContent(user, { teamId: existing.teamId, ownerId: existing.brief.userId, campaignId: existing.brief.campaignId })
  ) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

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
export const DELETE = withTeamAdmin<Params>(async (_req, { params }, user) => {
  const draft = await prisma.draft.findUnique({
    where: { id: params.id },
    select: { id: true, briefId: true, teamId: true },
  })
  if (!draft || draft.teamId !== user.teamId) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

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
