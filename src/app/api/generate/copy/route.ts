import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withTeamAuth, parseBody } from '@/lib/api/handler'
import { canAccessContent } from '@/lib/authz/visibility'
import { resolveCopyProvider } from '@/providers/registry'
import { resolveBrandKit } from '@/lib/brandkit/resolve'
import { getActiveCampaignBriefing } from '@/lib/campaign/briefing'
import { buildBriefInput } from '@/lib/agent/briefInput'

const bodySchema = z.object({ briefId: z.string() })

export const POST = withTeamAuth(async (req: NextRequest, _ctx, user) => {
  const body = await parseBody(req, bodySchema)
  if (body.response) return body.response
  const { briefId } = body.data

  const brief = await prisma.brief.findUnique({ where: { id: briefId } })
  if (
    !brief ||
    !canAccessContent(user, { teamId: brief.teamId, ownerId: brief.userId, campaignId: brief.campaignId })
  ) {
    return NextResponse.json({ error: 'Brief not found' }, { status: 404 })
  }

  try {
    const provider = await resolveCopyProvider(brief.teamId, brief.copyProviderKey ?? undefined)

    // Brand voice for copy comes from the same kit precedence as design:
    // explicit brief kit → campaign → project → system default.
    const kit = await resolveBrandKit(brief.teamId, brief.campaignId ?? undefined, brief.brandKitId ?? undefined)
    const campaignBriefing = await getActiveCampaignBriefing(brief.campaignId)

    const copyText = await provider.generateCopy(buildBriefInput(brief, kit, campaignBriefing))
    return NextResponse.json({ copyText })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ code: 'COPY_ERROR', message }, { status: 422 })
  }
})
