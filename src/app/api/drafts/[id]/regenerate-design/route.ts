import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { withTeamAuth } from '@/lib/api/handler'
import { canAccessContent } from '@/lib/authz/visibility'
import { resolveBrandKit } from '@/lib/brandkit/resolve'
import { getActiveCampaignBriefing } from '@/lib/campaign/briefing'
import { runPathBDesign } from '@/lib/agent/pathB'
import { stampFromCheck } from '@/lib/renderedText/stamp'
import { renderNotesFrom } from '@/lib/fonts/renderNotes'
import { currentRenderStamp, draftStampFields, revisionStampFields, withNextRevisionNumber, discardOnLostClaim } from '@/lib/drafts/revisions'
import { briefPostStyleStamp } from '@/lib/agent/briefInput'
import { resolveModel } from '@/lib/models/policy'
import { modelError, parseRegenerateDesignBody } from '@/lib/models/requests'
import { claimWhere, DraftClaimLostError } from '@/lib/drafts/claim'
import { claimDraftAction, startDraftAction, touchDraftAction } from '@/lib/drafts/draftActions'
import { generationSkipFields } from '@/lib/drafts/backgroundNotice'
import { generationImageSource } from '@/lib/drafts/imageSourceFields'
import { newActionTrace } from '@/lib/analytics/trace'
import { designHeadline, headlineFallbackMessage } from '@/lib/captions/headline'

// Regenerates the freeform (Path B) design for a draft: produces a brand-new
// design variant from the same brief + on-image headline. Validation runs
// synchronously, then the model work runs in-process fire-and-forget (the F1
// pattern — see draftActions.ts) and the route returns 202; the draft page
// polls pendingAction/pendingActionError to completion. Before overwriting,
// the CURRENT design is snapshotted as a DraftRevision so the user can return
// to it via the revision history. Path B only — Path A is a template fill.
// Body: {} (an empty body reads as {}) or { model } — an explicit pick (008
// FR-17), refused with a 400 before the claim.
export const POST = withTeamAuth<{ id: string }>(async (req, { params }, user) => {
  let raw: unknown = {}
  const text = await req.text()
  if (text.trim() !== '') {
    try {
      raw = JSON.parse(text)
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
  }
  const parsed = parseRegenerateDesignBody(raw)
  if (!parsed.ok) return NextResponse.json(parsed.body, { status: 400 })
  const requested = parsed.model

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
      { code: 'NOT_PATH_B', message: 'Design regeneration is only available for Freeform drafts.' },
      { status: 400 }
    )
  }

  const kit = await resolveBrandKit(draft.teamId, draft.brief.campaignId ?? undefined, draft.brief.brandKitId ?? undefined)
  if (!kit) {
    return NextResponse.json(
      { code: 'NO_BRAND_KIT', message: 'No brand kit found for this draft.' },
      { status: 422 }
    )
  }

  const campaignBriefing = await getActiveCampaignBriefing(draft.brief.campaignId)

  // The design reads the on-image headline, never a caption (012 FR-09). A
  // draft without one falls back to the brief Topic, logged.
  const headline = designHeadline(draft, draft.brief)

  // 008 FR-09: like for like — the stamp tier is the model that made the
  // current design (after a refine, the refine's), then team → system. A
  // stamp no longer allowed falls through and is recorded as a substitution.
  // An explicit pick (FR-17) is tier 1, above the stamp. Resolved before the
  // claim, so a refused pick (400) or a team with nothing allowed (422)
  // claims nothing.
  const resolvedModel = await resolveModel('DESIGN_FREEFORM', {
    requested,
    stamp: draft.designModel ?? null,
    userId: user.userId,
    teamId: draft.teamId,
  })
  if (!resolvedModel.ok) {
    if (requested) return NextResponse.json(modelError(resolvedModel), { status: 400 })
    return NextResponse.json({ code: resolvedModel.code, message: resolvedModel.message }, { status: 422 })
  }
  const model = resolvedModel.resolved

  const claim = await claimDraftAction(draft.id, 'REGENERATE_DESIGN')
  if (!claim) {
    return NextResponse.json({ error: 'Another action is already running on this draft' }, { status: 409 })
  }

  // CLI mode bills the acting user's personal Claude token when connected
  // (the team token otherwise) — startDraftAction resolves it before the
  // request unwinds and pins it onto the background run. A throw below is
  // recorded on Draft.pendingActionError; the draft itself is left untouched.
  const trace = newActionTrace()
  trace.fields.model = { model: model.key, modelId: model.arg, substitutedFrom: model.substitutedFrom }
  await startDraftAction(draft.id, user.userId, user.teamId, claim, async () => {
    if (headline.fallback) console.info(headlineFallbackMessage(draft.id))
    // Run the new design first — if it fails, the draft is left untouched.
    // actor is the acting teammate (NOT the brief owner) — the image-provider
    // resolution must follow whoever clicked Regenerate.
    const result = await runPathBDesign(
      draft.brief,
      kit,
      headline.text,
      campaignBriefing,
      { userId: user.userId, teamId: user.teamId },
      model,
      // 008 FR-12: the stale-sweep heartbeat between the background step and
      // the design, so neither segment carries the other (budget.ts).
      { onBeforeDesign: () => touchDraftAction(draft.id, claim) },
    )
    // F3 (AC-04): this render's stamp, resolved once and written to both the
    // new revision row and the draft (008: with the model that made it).
    // 027: and the post style the brief's key resolved to for this run (the
    // image rules runPathBDesign applied), at the dataset's current version.
    // 030: and the headline the real render painted, checked against the
    // headline this design was made from.
    const stamp = currentRenderStamp(
      model,
      result.composition,
      briefPostStyleStamp(draft.brief),
      stampFromCheck(headline.text, result.headlineCheck ?? 'not-checked'),
      // 031 FR-24: and what the same render found about its fonts.
      renderNotesFrom(result.fontsMissing),
    )

    // The Undo target is whatever revision is currently live. The design history
    // is an append-only log, so the live state is already the current revision —
    // we do NOT snapshot "the previous" here (doing so, plus overwriting live with
    // an unrecorded new design, is exactly what lost the regenerated design on Undo).
    // Every writer of htmlContent also sets currentRevisionNumber, so a draft
    // with a design always has its live state in the log already.

    // Append the NEW design as a revision and point the draft at it — so the user
    // can jump forward to it again after an Undo, not just back.
    // 031 FR-02: a lost claim rolls the write back, so the export THIS run
    // uploaded (result.exportUrl, minted by runPathBDesign) is unused.
    try {
      await withNextRevisionNumber(draft.id, async (tx, revisionNumber) => {
        await tx.draftRevision.create({
          data: {
            draftId: draft.id,
            revisionNumber,
            instruction: 'Regenerated design',
            htmlSnapshot: result.htmlContent,
            exportUrl: result.exportUrl,
            ...revisionStampFields(stamp),
          },
        })
        // 019: the guarded final write (last, see revisions.ts LOCK ORDER). A run
        // the sweep cleared, or a newer claim superseded, throws and rolls back
        // the revision insert above.
        const { count } = await tx.draft.updateMany({
          where: { id: draft.id, ...claimWhere(claim) },
          data: {
            htmlContent: result.htmlContent,
            exportUrl: result.exportUrl,
            // New background (or null when the pre-step skipped — clears the stale one).
            imageUrl: result.backgroundImageUrl,
            // 005 FR-07: this design was made from scratch, so its skip (or
            // none) replaces whatever the previous render recorded.
            ...generationSkipFields(result.background),
            imageSource: generationImageSource(result.background),
            status: 'EXPORTED',
            currentRevisionNumber: revisionNumber,
            pendingConflict: Prisma.JsonNull,
            ...draftStampFields(stamp),
          },
        })
        if (count !== 1) throw new DraftClaimLostError()
        return revisionNumber
      })
    } catch (err) {
      await discardOnLostClaim(err, result.exportUrl || null, 'a lost claim')
      throw err
    }
  }, undefined, trace)

  return NextResponse.json({ ok: true }, { status: 202 })
})
