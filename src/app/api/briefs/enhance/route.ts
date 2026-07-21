import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withTeamAuth, parseBody } from '@/lib/api/handler'
import { enhancePostBrief } from '@/lib/campaign/briefingAssistant'
import { withClaudeAuth } from '@/lib/agent/userToken'

// AI rewrite of a post brief from the wizard's Content step. Editor-accessible
// (unlike the admin-only campaign-briefing enhance): editors write briefs.
const enhanceSchema = z.object({
  topic: z.string().max(120).default(''),
  content: z.string().max(20_000).default(''),
  goal: z.string().max(60).optional(),
  tone: z.string().max(60).optional(),
  campaignId: z.string().optional(),
  brandKitId: z.string().optional(),
})

export const POST = withTeamAuth(async (req, _ctx, user) => {
  const body = await parseBody(req, enhanceSchema)
  if (body.response) return body.response

  const { topic, content, campaignId } = body.data
  if (!topic.trim() && !content.trim()) {
    return NextResponse.json(
      { error: 'Provide a topic or a brief to enhance' },
      { status: 400 }
    )
  }

  if (campaignId) {
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, isDeleted: false, teamId: user.teamId },
      select: { id: true },
    })
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  // CLI mode bills the acting user's personal Claude token when connected
  // (the team token otherwise) — see src/lib/agent/userToken.ts.
  const draft = await withClaudeAuth(user.userId, user.teamId, () => enhancePostBrief(body.data))
  if (!draft) {
    return NextResponse.json({ error: 'The model returned an empty draft — try again' }, { status: 502 })
  }
  return NextResponse.json({ draft })
})
