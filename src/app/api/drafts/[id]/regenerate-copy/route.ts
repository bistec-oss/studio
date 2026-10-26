import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withTeamAuth } from '@/lib/api/handler'
import { canAccessContent } from '@/lib/authz/visibility'
import { copyProviderIsClaude, resolveCopyProvider } from '@/providers/registry'
import { resolveBrandKit } from '@/lib/brandkit/resolve'
import { getActiveCampaignBriefing } from '@/lib/campaign/briefing'
import { briefPostStyleStamp, buildBriefInput } from '@/lib/agent/briefInput'
import { writeCaptions } from '@/lib/captions/generate'
import { parseRegenerateBody } from '@/lib/captions/requests'
import { failedCaptionFields } from '@/lib/captions/actionTargets'
import { trackHeadlineEdited } from '@/lib/renderedText/track'
import { claimCaptionAction, loadDraftCaptions, settleCaptionAction } from '@/lib/captions/store'
import { releaseDraftAction, startDraftAction } from '@/lib/drafts/draftActions'
import { resolveModel } from '@/lib/models/policy'
import { regenerateStampTier, type ResolvedModel } from '@/lib/models/resolve'
import { captionProviderNotClaudeError, modelError } from '@/lib/models/requests'
import { newActionTrace } from '@/lib/analytics/trace'

// Regenerates captions for a draft (012 FR-11; the route name is a kept
// contract): body {} → the three captions ("Regenerate all"), { channel } →
// that caption, { headline: true } → the headline, each with an optional
// `model` pick (008 FR-17). Validation runs
// synchronously, then the model work runs in-process fire-and-forget (the F1
// pattern — see draftActions.ts) and the route returns 202; the draft page
// polls pendingAction and the rows' status to completion. The design HTML/PNG
// is untouched — captions and design regenerate independently, and
// Draft.status never changes.
export const POST = withTeamAuth<{ id: string }>(async (req, { params }, user) => {
  // An empty or absent body is {} ("Regenerate all"), as before 012, when the
  // route took no body. Malformed JSON is still a 400.
  let raw: unknown = {}
  const text = await req.text()
  if (text.trim() !== '') {
    try {
      raw = JSON.parse(text)
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
  }
  const parsed = parseRegenerateBody(raw)
  if (!parsed.ok) {
    const body = 'code' in parsed ? { error: parsed.error, code: parsed.code } : { error: parsed.error }
    return NextResponse.json(body, { status: 400 })
  }
  const { targets, model: requested } = parsed.value

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

  // Regeneration needs existing content to replace — a draft still generating
  // (or one whose generation failed) has none.
  if (draft.status !== 'EXPORTED' && draft.status !== 'PUBLISHED') {
    return NextResponse.json({ error: 'Draft is not ready for caption regeneration' }, { status: 409 })
  }

  // Everything fallible that needs no claim runs first, so its failure (422)
  // leaves nothing claimed.
  let provider: Awaited<ReturnType<typeof resolveCopyProvider>>
  let kit: Awaited<ReturnType<typeof resolveBrandKit>>
  let campaignBriefing: Awaited<ReturnType<typeof getActiveCampaignBriefing>>
  let model: ResolvedModel
  try {
    // Load the rows BEFORE the claim marks them PENDING: the loader fills any
    // registry channel the draft lacks, which the claim would otherwise not
    // mark, leaving the settle no row to write. The rows also carry the stamps
    // below.
    const loaded = await loadDraftCaptions(draft.id)

    // 008 FR-09: the regenerate default is the stamp of what is being replaced
    // — the row's model, the headline's, or for "Regenerate all" the common
    // stamp (mixed or any null → no stamp tier, so the team default). An
    // explicit pick (FR-17) is tier 1, above the stamp. Resolved before the
    // claim, so a refused pick (400) or a team with nothing allowed (422)
    // claims nothing.
    // Spec open question 1: a caption pick needs a Claude caption provider (the
    // one this run would use: the brief's key, else the team default).
    if (requested && !(await copyProviderIsClaude(draft.brief.teamId, draft.brief.copyProviderKey ?? undefined))) {
      return NextResponse.json(captionProviderNotClaudeError(), { status: 400 })
    }
    const stamp = regenerateStampTier(targets, {
      captions: loaded?.captions ?? [],
      headlineModel: draft.headlineModel ?? null,
    })
    const resolved = await resolveModel('CAPTION', { requested, stamp, userId: user.userId, teamId: draft.teamId })
    if (!resolved.ok) {
      if (requested) return NextResponse.json(modelError(resolved), { status: 400 })
      throw new Error(resolved.message)
    }
    model = resolved.resolved

    provider = await resolveCopyProvider(draft.brief.teamId, draft.brief.copyProviderKey ?? undefined)
    // Brand voice follows the same kit precedence as design generation.
    kit = await resolveBrandKit(draft.teamId, draft.brief.campaignId ?? undefined, draft.brief.brandKitId ?? undefined)
    campaignBriefing = await getActiveCampaignBriefing(draft.brief.campaignId)
  } catch (err) {
    return copyError(err)
  }

  // One draft-level claim for every caption action (A2), with the target rows
  // marked PENDING in the same transaction.
  const claim = await claimCaptionAction(draft.id, targets)
  if (!claim) {
    return NextResponse.json({ error: 'Another action is already running on this draft' }, { status: 409 })
  }

  try {
    // CLI mode bills the acting user's personal Claude token when connected
    // (the team token otherwise) — startDraftAction resolves it before the
    // request unwinds and pins it onto the background run. Each row settles per
    // settleCaptionRow (a failure keeps good text, A7); a throw settles every
    // target row as failed (onError) and is recorded on pendingActionError.
    // 008 FR-08: the reply's stamp goes on the fields that validated only; the
    // failure settles pass none, so a row keeps the stamp of the text it keeps.
    const trace = newActionTrace()
    trace.fields.model = { model: model.key, modelId: model.arg, substitutedFrom: model.substitutedFrom }
    await startDraftAction(
      draft.id,
      user.userId,
      user.teamId,
      claim,
      async () => {
        // 027: the brief's post style rules, if it has one (a stored key that does
        // not resolve throws here and settles the rows as failed).
        const briefInput = buildBriefInput(draft.brief, kit, campaignBriefing)
        const { fields, stamp } = await writeCaptions(provider, briefInput, targets, model)
        // The copy ran under the style's current version; the settle writes it to
        // Draft.postStyle (claim-guarded) and recomputes the facts check. Only when
        // some target validated: a run that changed no text keeps the old stamp.
        const anyOk = Object.values(fields).some((f) => f?.ok)
        const settled = await settleCaptionAction(draft.id, claim, targets, fields, stamp, undefined, anyOk ? briefPostStyleStamp(draft.brief) : undefined)
        // 030 FR-15: one event when the settle wrote a headline (after the transaction).
        if (settled.headlineWritten) {
          await trackHeadlineEdited({
            draftId: draft.id,
            teamId: user.teamId,
            userId: user.userId,
            via: 'regenerate',
            before: settled.headlineBefore,
          })
        }
        // A headline has no row to carry a failure, so it is reported on
        // pendingActionError; the stored headline is unchanged.
        const headline = fields.HEADLINE
        if (targets.includes('HEADLINE') && !headline?.ok) {
          throw new Error(`Regenerate headline failed: ${headline?.reason ?? 'missing'}`)
        }
      },
      async (err) => {
        await settleCaptionAction(draft.id, claim, targets, failedCaptionFields(targets, errorMessage(err)))
      },
      trace,
    )
  } catch (err) {
    // The run never started (e.g. the credential lookup threw): settle the rows
    // this request marked PENDING and give the claim back, so the panels don't
    // wait for the 15-minute sweep. Settle first, while the claim still holds.
    // Best-effort: if this fails too, the stale sweep still recovers the draft.
    const message = errorMessage(err)
    try {
      await settleCaptionAction(draft.id, claim, targets, failedCaptionFields(targets, message))
      await releaseDraftAction(draft.id, claim, message)
    } catch (e) {
      console.error(`[draft-action] draft ${draft.id}: releasing the unstarted caption action failed:`, e)
    }
    return copyError(err)
  }

  return NextResponse.json({ ok: true }, { status: 202 })
})

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err))

function copyError(err: unknown) {
  return NextResponse.json({ code: 'COPY_ERROR', message: errorMessage(err) }, { status: 422 })
}
