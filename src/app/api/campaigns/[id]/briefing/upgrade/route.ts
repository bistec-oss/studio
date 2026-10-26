import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { parseBody, withTeamAdmin } from '@/lib/api/handler'
import { withClaudeAuth } from '@/lib/agent/userToken'
import { AssistantModelError } from '@/lib/campaign/briefingAssistant'
import { resolveBrandKit } from '@/lib/brandkit/resolve'
import { runRuleUpgrade } from '@/lib/kitUpgrade/upgrade'

type Params = { id: string }

const bodySchema = z
  .object({
    text: z.string().min(1).max(20_000),
    baseVersion: z.number().int().min(0),
  })
  .strict()

// 031 FR-29: the briefing host of the 007 design-rule upgrade. Turns vague
// design phrases in a draft campaign briefing into measurable rules; nothing is
// saved here, the author reviews each edit. Mirrors the kit upgrade route.
export const POST = withTeamAdmin<Params>(async (req, { params }, user) => {
  const campaign = await prisma.campaign.findFirst({
    where: { id: params.id, isDeleted: false, teamId: user.teamId },
    select: { id: true },
  })
  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  const body = await parseBody(req, bodySchema)
  if (body.response) return body.response

  const activeBriefing = await prisma.campaignBriefing.findFirst({
    where: { campaignId: campaign.id, isActive: true },
    select: { version: true },
  })
  const activeVersion = activeBriefing?.version ?? 0
  if (body.data.baseVersion !== activeVersion) {
    return NextResponse.json({ code: 'STALE_BASE', activeVersion }, { status: 409 })
  }

  const kit = await resolveBrandKit(user.teamId, campaign.id)
  const roleKit = { colors: kit?.colors ?? [], fonts: kit?.fonts ?? [] }

  try {
    const result = await withClaudeAuth(user.userId, user.teamId, () =>
      runRuleUpgrade({
        roleKit,
        text: body.data.text,
        teamId: user.teamId,
        userId: user.userId,
        surface: 'ASSISTANT_BRIEFING',
        label: 'briefing-upgrade',
        logRef: { name: 'campaign', id: campaign.id },
      }),
    )
    if (result.status === 'parse-failed') {
      return NextResponse.json(
        {
          code: 'UPGRADE_PARSE_FAILED',
          message: 'The assistant reply could not be read. Try again.',
        },
        { status: 502 },
      )
    }
    if (result.status === 'edits') {
      return NextResponse.json({
        outcome: 'edits',
        baseVersion: body.data.baseVersion,
        edits: result.edits,
        rejected: result.rejected,
        candidates: result.candidates,
      })
    }
    return NextResponse.json({
      outcome: 'none',
      reason: result.reason,
      rejected: result.rejected,
      candidates: result.candidates,
    })
  } catch (err) {
    // 008: no model the team can run; nothing ran, say why.
    if (err instanceof AssistantModelError) {
      return NextResponse.json({ code: err.code, message: err.message }, { status: 422 })
    }
    throw err
  }
})
