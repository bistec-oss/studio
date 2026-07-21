import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withTeamAdmin, parseBody } from '@/lib/api/handler'
import { enhanceBriefing } from '@/lib/campaign/briefingAssistant'
import { withUserClaudeAuth } from '@/lib/agent/userToken'

type Params = { id: string }

// Content may be empty — the assistant then drafts from campaign context alone.
const enhanceSchema = z.object({
  content: z.string().max(20_000),
})

export const POST = withTeamAdmin<Params>(async (req, { params }, user) => {
  const body = await parseBody(req, enhanceSchema)
  if (body.response) return body.response

  const campaign = await prisma.campaign.findFirst({
    where: { id: params.id, isDeleted: false },
    select: { id: true, teamId: true },
  })
  if (!campaign || campaign.teamId !== user.teamId) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  // CLI mode bills the acting user's personal Claude token when connected
  // (shared server token otherwise) — see src/lib/agent/userToken.ts.
  const draft = await withUserClaudeAuth(user.userId, () =>
    enhanceBriefing(params.id, body.data.content)
  )
  if (!draft) {
    return NextResponse.json({ error: 'The model returned an empty draft — try again' }, { status: 502 })
  }
  return NextResponse.json({ draft })
})
