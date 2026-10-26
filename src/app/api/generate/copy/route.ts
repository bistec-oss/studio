import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withTeamAuth, parseBody } from '@/lib/api/handler'
import { canAccessContent } from '@/lib/authz/visibility'
import { resolveCopyProvider } from '@/providers/registry'
import { resolveBrandKit } from '@/lib/brandkit/resolve'
import { getActiveCampaignBriefing } from '@/lib/campaign/briefing'
import { buildBriefInput } from '@/lib/agent/briefInput'
import { GENERATION_TARGETS, writeCaptions } from '@/lib/captions/generate'
import { captionRowsFromFields } from '@/lib/captions/store'
import { resolveModel } from '@/lib/models/policy'

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
    // 008 FR-02: this route is the CAPTION surface. No body field picks the
    // model (wave 2 adds none here), so it resolves team → system, as the user.
    const resolved = await resolveModel('CAPTION', { userId: user.userId, teamId: brief.teamId })
    if (!resolved.ok) throw new Error(resolved.message)

    const provider = await resolveCopyProvider(brief.teamId, brief.copyProviderKey ?? undefined)

    // Brand voice for copy comes from the same kit precedence as design:
    // explicit brief kit → campaign → project → system default.
    const kit = await resolveBrandKit(brief.teamId, brief.campaignId ?? undefined, brief.brandKitId ?? undefined)
    const campaignBriefing = await getActiveCampaignBriefing(brief.campaignId)

    // Nothing is persisted (012 FR-10). Each caption reports its own result,
    // so a partial reply still returns the fields that validated.
    const { fields, stamp } = await writeCaptions(
      provider,
      buildBriefInput(brief, kit, campaignBriefing),
      GENERATION_TARGETS,
      resolved.resolved,
    )
    // Nothing is stored here, so the 012 response shape stays exactly
    // {channel, text, status, failureReason}: the 008 stamp fields and the
    // 024 route are dropped.
    const captions = captionRowsFromFields(fields, stamp).map(
      ({ model: _model, modelSubstitutedFrom: _from, route: _route, ...row }) => row,
    )
    return NextResponse.json({
      headline: fields.HEADLINE?.ok ? fields.HEADLINE.text : null,
      captions,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ code: 'COPY_ERROR', message }, { status: 422 })
  }
})
