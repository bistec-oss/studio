import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { forbiddenIfNotOwner } from '@/lib/auth'
import { withAuth } from '@/lib/api/handler'
import { resolveCopyProvider } from '@/providers/registry'
import { resolveBrandKit } from '@/lib/brandkit/resolve'
import { getActiveCampaignBriefing } from '@/lib/campaign/briefing'
import { buildBriefInput } from '@/lib/agent/briefInput'
import { claimDraftAction, startDraftAction } from '@/lib/drafts/draftActions'

// Regenerates the post copy for a draft by re-running the resolved copy provider
// against the brief. Validation runs synchronously, then the model work runs
// in-process fire-and-forget (the F1 pattern — see draftActions.ts) and the
// route returns 202; the draft page polls pendingAction/pendingActionError to
// completion (the client captures the previous copy for Undo before firing).
// The design HTML/PNG is untouched — copy and design regenerate independently,
// and Draft.status never changes.
export const POST = withAuth<{ id: string }>(async (_req, { params }, user) => {
  const draft = await prisma.draft.findUnique({
    where: { id: params.id },
    include: { brief: true },
  })
  if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  const forbidden = forbiddenIfNotOwner(user, draft.brief.userId)
  if (forbidden) return forbidden

  // Copy regeneration needs existing content to replace — a draft still
  // generating (or one whose generation failed) has none.
  if (draft.status !== 'EXPORTED' && draft.status !== 'PUBLISHED') {
    return NextResponse.json({ error: 'Draft is not ready for copy regeneration' }, { status: 409 })
  }

  try {
    const provider = await resolveCopyProvider(draft.brief.copyProviderKey ?? undefined)
    // Brand voice follows the same kit precedence as design generation.
    const kit = await resolveBrandKit(draft.brief.campaignId ?? undefined, draft.brief.brandKitId ?? undefined)
    const campaignBriefing = await getActiveCampaignBriefing(draft.brief.campaignId)

    const claimed = await claimDraftAction(draft.id, 'REGENERATE_COPY')
    if (!claimed) {
      return NextResponse.json({ error: 'Another action is already running on this draft' }, { status: 409 })
    }

    // CLI mode bills the acting user's personal Claude token when connected
    // (shared server token otherwise) — startDraftAction resolves it before the
    // request unwinds and pins it onto the background run. A throw below is
    // recorded on Draft.pendingActionError; the previous copy is left untouched.
    await startDraftAction(draft.id, user.userId, async () => {
      const copyText = await provider.generateCopy(buildBriefInput(draft.brief, kit, campaignBriefing))
      await prisma.draft.update({
        where: { id: draft.id },
        data: { copyText },
      })
    })

    return NextResponse.json({ ok: true }, { status: 202 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ code: 'COPY_ERROR', message }, { status: 422 })
  }
})
