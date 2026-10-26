import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withTeamAuth, parseBody } from '@/lib/api/handler'
import { canAccessContent } from '@/lib/authz/visibility'
import { dimensionsFor } from '@/lib/aspectRatio'
import { claimDraftAction, startDraftAction } from '@/lib/drafts/draftActions'
import { DraftClaimLostError } from '@/lib/drafts/claim'
import {
  commitDraftRevision,
  draftCompositionStamp,
  draftModelStamp,
  draftPostStyleStamp,
  RenderRejectedError,
  RevisionConflictError,
} from '@/lib/drafts/revisions'
import { CompositePlacementError } from '@/lib/composite/render'
import { newActionTrace } from '@/lib/analytics/trace'
import { APPLY_FIELDS, applyFailureNotice, type ApplyFailure } from '@/lib/applyText'
import { precheckApply } from '@/lib/applyText/candidates'
import { spliceText } from '@/lib/applyText/splice'
import { acceptApplyRender } from '@/lib/applyText/accept'
import { trackTextApplied } from '@/lib/applyText/track'
import { parseRenderedText } from '@/lib/renderedText/stamp'
import { headlineState } from '@/lib/renderedText/state'
import { trackHeadlineEdited } from '@/lib/renderedText/track'

const bodySchema = z.object({ field: z.enum(APPLY_FIELDS) }).strict()

// Thrown inside the claimed work: carries the verdict out to the catch, which
// has already tracked it. The message is the sentence the person reads.
class ApplyFailed extends Error {
  constructor(public readonly code: ApplyFailure) {
    super(applyFailureNotice(code))
    this.name = 'ApplyFailed'
  }
}

// Apply to image (031 FR-41, design 8.3): put the draft's current headline into
// the image by replacing the old headline's text in the stored HTML, with no
// model call. Refusals (FR-38) are decided synchronously, return 422 and claim
// nothing. Otherwise the draft is claimed (APPLY_TEXT), the route returns 202,
// and the splice, the render and the one write (commitDraftRevision, which
// appends a revision, so Undo restores the old HTML byte for byte, FR-45) run
// in the background. The in-render check is the only judge of what was painted.
export const POST = withTeamAuth<{ id: string }>(async (req, { params }, user) => {
  const body = await parseBody(req, bodySchema)
  if (body.response) return body.response
  const { field } = body.data
  const method = 'splice' as const

  const draft = await prisma.draft.findUnique({ where: { id: params.id }, include: { brief: true } })
  if (
    !draft ||
    !canAccessContent(user, { teamId: draft.teamId, ownerId: draft.brief.userId, campaignId: draft.brief.campaignId })
  ) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }
  if ((draft.status !== 'EXPORTED' && draft.status !== 'PUBLISHED') || !draft.htmlContent) {
    return NextResponse.json(
      { code: 'DRAFT_NOT_READY', message: 'Apply to image needs a finished design.' },
      { status: 409 },
    )
  }

  const refuse = async (failure: ApplyFailure) => {
    await trackTextApplied({ draftId: draft.id, teamId: draft.teamId, userId: user.userId, field, method, failure })
    return NextResponse.json({ code: failure, message: applyFailureNotice(failure) }, { status: 422 })
  }

  const stamp = parseRenderedText(draft.renderedText)
  const newHeadline = draft.headline
  if (headlineState(stamp, newHeadline) !== 'stale' || !stamp?.headline || newHeadline === null) {
    return refuse('not-stale')
  }
  const oldText = stamp.headline.text
  const html = draft.htmlContent
  const pre = precheckApply(html, oldText, newHeadline)
  if (!pre.ok) return refuse(pre.failure)
  const spliced = spliceText(html, pre.candidate, newHeadline)
  if (!spliced.ok) return refuse(spliced.failure)

  const claim = await claimDraftAction(draft.id, 'APPLY_TEXT')
  if (!claim) {
    return NextResponse.json({ error: 'Another action is already running on this draft' }, { status: 409 })
  }

  const { width, height } = dimensionsFor(draft.brief.aspectRatio)
  const trace = newActionTrace()
  await startDraftAction(
    draft.id,
    user.userId,
    user.teamId,
    claim,
    async () => {
      let failure: ApplyFailure | null = null
      try {
        // The splice was made from the row read before the claim. A design action or a
        // headline edit that settled in between would be overwritten by that older HTML,
        // so the row is read again under the claim and any change is a conflict.
        const now = await prisma.draft.findUnique({ where: { id: draft.id } })
        if (now?.htmlContent !== html || now?.headline !== newHeadline) throw new RevisionConflictError(null)
        await commitDraftRevision({
          draftId: draft.id,
          instruction: 'Apply headline to image',
          html: spliced.html,
          width,
          height,
          claim,
          // The HTML is still the draft's model, composition and post style.
          model: draftModelStamp(draft),
          composition: draftCompositionStamp(draft),
          postStyle: draftPostStyleStamp(draft),
          acceptRender: acceptApplyRender,
          absentText: oldText,
          checkText: newHeadline,
        })
      } catch (err) {
        if (err instanceof RenderRejectedError) failure = err.code
        else if (err instanceof DraftClaimLostError || err instanceof RevisionConflictError) failure = 'conflict'
        else if (err instanceof CompositePlacementError) failure = 'render-failed'
        else {
          console.error(`[apply-text] draft ${draft.id}: the render failed:`, err)
          failure = 'render-failed'
        }
      }
      if (failure) {
        await trackTextApplied({ draftId: draft.id, teamId: draft.teamId, userId: user.userId, field, method, failure })
        // Released with the sentence by startDraftAction (the draft page shows it).
        throw new ApplyFailed(failure)
      }
      await trackTextApplied({ draftId: draft.id, teamId: draft.teamId, userId: user.userId, field, method })
      // `before` is the headline the image showed: the draft's own headline did
      // not change, and the event is skipped when before equals it.
      await trackHeadlineEdited({
        draftId: draft.id,
        teamId: draft.teamId,
        userId: user.userId,
        via: 'apply',
        before: oldText,
      })
    },
    undefined,
    trace,
  )

  return NextResponse.json({ ok: true }, { status: 202 })
})
