import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { DraftAction, DraftStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { withTeamAuth, withTeamAdmin, parseBody } from '@/lib/api/handler'
import { canAccessContent } from '@/lib/authz/visibility'
import { resolveBrandKit } from '@/lib/brandkit/resolve'
import { resolveExportUrl } from '@/lib/storage/minio'
import { planDraftRecovery, STUCK_ACTION_REASON, STUCK_REASON } from '@/lib/drafts/recovery'
import { CHAIN_REVISION_COUNT_FILTER } from '@/lib/drafts/revisions'

type Params = { id: string }

// The fields recoverIfStuck reads and writes. Structurally satisfies the pure
// planner's RecoverableDraft, but with the Prisma enum types the writes need.
interface DraftRecoveryRow {
  id: string
  status: DraftStatus
  failureReason: string | null
  pendingAction: DraftAction | null
  pendingActionError: string | null
  updatedAt: Date
  exportUrl: string | null
  htmlContent: string | null
  currentRevisionNumber: number | null
}

// Applies the recovery plan (decided purely in lib/drafts/recovery.ts) and
// returns the EFFECTIVE status/reason + pending-action fields, so the response
// reflects the recovery immediately with no extra round-trip. Every write guards
// on the value that was observed, so a concurrent transition always wins. No
// branch here touches draft CONTENT — only status/reason bookkeeping.
async function recoverIfStuck(draft: DraftRecoveryRow): Promise<{
  status: DraftStatus
  failureReason: string | null
  pendingAction: DraftAction | null
  pendingActionError: string | null
}> {
  const { id, status, pendingAction } = draft
  const plan = planDraftRecovery(draft)
  const effective = {
    status,
    failureReason: draft.failureReason,
    pendingAction,
    pendingActionError: draft.pendingActionError,
  }

  // A live post whose status was clobbered by the old copy-edit flip — restore
  // it instead of letting the generation sweep declare it FAILED.
  if (plan.healStatus) {
    await prisma.draft
      .updateMany({
        where: { id, status, exportUrl: { not: null } },
        data: { status: 'EXPORTED', failureReason: null },
      })
      .catch(() => {
        /* best-effort recovery */
      })
    effective.status = 'EXPORTED'
    effective.failureReason = null
  }

  // A draft stranded IN_PROGRESS by an interrupted run (e.g. a server restart)
  // → FAILED, so the preview page shows the inline error card + Retry instead of
  // an eternal skeleton.
  if (plan.failStuckGeneration) {
    await prisma.draft
      .updateMany({
        where: { id, status: 'IN_PROGRESS' },
        data: { status: 'FAILED', failureReason: STUCK_REASON },
      })
      .catch(() => {
        /* best-effort recovery */
      })
    effective.status = 'FAILED'
    effective.failureReason = STUCK_REASON
  }

  if (plan.clearStuckAction) {
    await prisma.draft
      .updateMany({
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
      // Filtered relation count — this feeds revisionCount on the poll, which
      // labels the version-switch UI, so it must count the CHAIN only. A
      // rejected render is a retained out-of-chain row; counting it would
      // promise the user a version that is not in the list.
      _count: { select: { revisions: CHAIN_REVISION_COUNT_FILTER } },
    },
  })
  if (!draft) return null

  // Heal a draft whose status was clobbered while its design is intact →
  // EXPORTED, sweep one stranded IN_PROGRESS by an interrupted run → FAILED, and
  // clear a stale in-flight action, so the effective fields below reflect the
  // recovery.
  const effective = await recoverIfStuck(draft)

  // Surface a refine brand-kit conflict to the poll WITHOUT the stored
  // pendingHtml — it can be huge and is server-side only (the Override path
  // reads it from the DB).
  const pendingConflict = draft.pendingConflict as unknown as {
    conflictId: string
    explanation: string
  } | null

  const kit = await resolveBrandKit(draft.teamId, draft.brief.campaignId ?? undefined, draft.brief.brandKitId ?? undefined)

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

// Team tenancy fix: this handler used to run under plain withAuth + the
// old ownership helper (a platform-role-only check with no team dimension —
// it let any admin/super-admin bypass ownership entirely), so an admin of
// ANY team could edit ANY other team's draft copy. Task 8/9's sweeps
// covered this file's GET and DELETE but missed PATCH. Now withTeamAuth +
// canAccessContent, matching the GET handler above (the old helper,
// forbiddenIfNotOwner, has since been deleted from src/lib/auth.ts — this
// was its last real caller).
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

  // Copy and design are independent artifacts — the copy is the post CAPTION,
  // the export is the rendered image — so a copy edit must NOT touch
  // Draft.status. This used to flip EXPORTED → IN_PROGRESS to signal "the export
  // is stale", but IN_PROGRESS means "generation is running", and every consumer
  // read it that way: the draft dropped out of the library (it filters on
  // EXPORTED), Refine design and Edit inline vanished, Regenerate copy answered
  // 409 'Draft is not ready for copy regeneration', clearing the copy entirely
  // left the page stuck on an eternal "Writing the copy…" skeleton with no way
  // back, and after 15 minutes the lazy sweep marked the draft FAILED. Nothing
  // was regenerating, so the only escape was to regenerate the whole post.
  // regenerate-copy already leaves status alone (§Q TC-ASYNC-02) — this handler
  // was the straggler. A "your export predates this copy" nudge belongs in the
  // UI, not in the status field.
  await prisma.draft.update({
    where: { id: params.id },
    data: { copyText },
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
    // DELIBERATELY UNFILTERED — the one DraftRevision access that must NOT
    // exclude rejected rows. They are FK children of the draft like any other
    // revision, so a `rejected: false` here would leave them behind and the
    // draft delete below would fail on the foreign key.
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
