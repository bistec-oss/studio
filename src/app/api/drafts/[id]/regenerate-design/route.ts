import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { withTeamAuth } from '@/lib/api/handler'
import { canAccessContent } from '@/lib/authz/visibility'
import { resolveBrandKit } from '@/lib/brandkit/resolve'
import { getActiveCampaignBriefing } from '@/lib/campaign/briefing'
import { runPathBDesign } from '@/lib/agent/pathB'
import { PROMPT_VERSION } from '@/lib/agent/prompts/shared'
import { withNextRevisionNumber } from '@/lib/drafts/revisions'
import { claimDraftAction, startDraftAction } from '@/lib/drafts/draftActions'

// Regenerates the freeform (Path B) design for a draft: produces a brand-new
// design variant from the same brief + existing copy. Validation runs
// synchronously, then the model work runs in-process fire-and-forget (the F1
// pattern — see draftActions.ts) and the route returns 202; the draft page
// polls pendingAction/pendingActionError to completion. Before overwriting,
// the CURRENT design is snapshotted as a DraftRevision so the user can return
// to it via the revision history. Path B only — Path A is a template fill.
export const POST = withTeamAuth<{ id: string }>(async (_req, { params }, user) => {
  const draft = await prisma.draft.findUnique({
    where: { id: params.id },
    include: { brief: true },
  })
  if (
    !draft ||
    !canAccessContent(user, { teamId: draft.teamId, ownerId: draft.brief.userId, campaignId: draft.brief.campaignId })
  ) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

  if (draft.brief.designMode !== 'GENERATE') {
    return NextResponse.json(
      { code: 'NOT_PATH_B', message: 'Design regeneration is only available for Path B (freeform) drafts.' },
      { status: 400 }
    )
  }

  const kit = await resolveBrandKit(draft.brief.campaignId ?? undefined, draft.brief.brandKitId ?? undefined)
  if (!kit) {
    return NextResponse.json(
      { code: 'NO_BRAND_KIT', message: 'No brand kit found for this draft.' },
      { status: 422 }
    )
  }

  const campaignBriefing = await getActiveCampaignBriefing(draft.brief.campaignId)

  const claimed = await claimDraftAction(draft.id, 'REGENERATE_DESIGN')
  if (!claimed) {
    return NextResponse.json({ error: 'Another action is already running on this draft' }, { status: 409 })
  }

  // CLI mode bills the acting user's personal Claude token when connected
  // (shared server token otherwise) — startDraftAction resolves it before the
  // request unwinds and pins it onto the background run. A throw below is
  // recorded on Draft.pendingActionError; the draft itself is left untouched.
  await startDraftAction(draft.id, user.userId, user.teamId, async () => {
    // Run the new design first — if it fails, the draft is left untouched.
    const result = await runPathBDesign(draft.brief, kit, draft.copyText, campaignBriefing)

    // The Undo target is whatever revision is currently live. The design history
    // is an append-only log, so the live state is already the current revision —
    // we do NOT snapshot "the previous" here (doing so, plus overwriting live with
    // an unrecorded new design, is exactly what lost the regenerated design on Undo).
    let previousRevisionNumber: number | null = draft.currentRevisionNumber ?? null

    // Legacy guard: a draft created before currentRevisionNumber existed may have
    // live content not captured as a revision. Snapshot it so Undo has a target.
    if (previousRevisionNumber === null && draft.htmlContent) {
      previousRevisionNumber = await withNextRevisionNumber(draft.id, async (tx, revisionNumber) => {
        await tx.draftRevision.create({
          data: {
            draftId: draft.id,
            revisionNumber,
            instruction: 'Design before regenerate',
            htmlSnapshot: draft.htmlContent!,
            exportUrl: draft.exportUrl ?? '',
          },
        })
        return revisionNumber
      })
    }

    // Append the NEW design as a revision and point the draft at it — so the user
    // can jump forward to it again after an Undo, not just back.
    await withNextRevisionNumber(draft.id, async (tx, revisionNumber) => {
      await tx.draftRevision.create({
        data: {
          draftId: draft.id,
          revisionNumber,
          instruction: 'Regenerated design',
          htmlSnapshot: result.htmlContent,
          exportUrl: result.exportUrl,
        },
      })
      await tx.draft.update({
        where: { id: draft.id },
        data: {
          htmlContent: result.htmlContent,
          exportUrl: result.exportUrl,
          // New background (or null when the pre-step skipped — clears the stale one).
          imageUrl: result.backgroundImageUrl,
          status: 'EXPORTED',
          currentRevisionNumber: revisionNumber,
          pendingConflict: Prisma.JsonNull,
          promptVersion: PROMPT_VERSION,
        },
      })
      return revisionNumber
    })
  })

  return NextResponse.json({ ok: true }, { status: 202 })
})
