import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { forbiddenIfNotOwner } from '@/lib/auth'
import { withAuth } from '@/lib/api/handler'
import { resolveCopyProvider } from '@/providers/registry'
import { resolveBrandKit } from '@/lib/brandkit/resolve'
import { getActiveCampaignBriefing } from '@/lib/campaign/briefing'
import { buildBriefInput } from '@/lib/agent/briefInput'

export const maxDuration = 120

// Regenerates the post copy for a draft by re-running the resolved copy provider
// against the brief, then persists the new copy. Returns both the new and the
// previous copy so the UI can offer an immediate Undo. The design HTML/PNG is
// untouched — copy and design regenerate independently.
export const POST = withAuth<{ id: string }>(async (_req, { params }, user) => {
  const draft = await prisma.draft.findUnique({
    where: { id: params.id },
    include: { brief: true },
  })
  if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  const forbidden = forbiddenIfNotOwner(user, draft.brief.userId)
  if (forbidden) return forbidden

  try {
    const provider = await resolveCopyProvider(draft.brief.copyProviderKey ?? undefined)
    // Brand voice follows the same kit precedence as design generation.
    const kit = await resolveBrandKit(draft.brief.campaignId ?? undefined, draft.brief.brandKitId ?? undefined)
    const campaignBriefing = await getActiveCampaignBriefing(draft.brief.campaignId)
    const copyText = await provider.generateCopy(buildBriefInput(draft.brief, kit, campaignBriefing))

    const previousCopyText = draft.copyText
    await prisma.draft.update({
      where: { id: draft.id },
      data: {
        copyText,
        // A copy change invalidates a prior export (mirrors the PATCH route).
        ...(draft.status === 'EXPORTED' ? { status: 'IN_PROGRESS' } : {}),
      },
    })

    return NextResponse.json({ copyText, previousCopyText })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ code: 'COPY_ERROR', message }, { status: 422 })
  }
})
