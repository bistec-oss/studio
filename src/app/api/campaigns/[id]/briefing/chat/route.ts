import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withTeamAdmin, parseBody } from '@/lib/api/handler'
import { runBriefingChat } from '@/lib/campaign/briefingAssistant'
import { withClaudeAuth } from '@/lib/agent/userToken'

type Params = { id: string }

// Stateless multi-turn chat: the client owns the transcript and sends it whole
// each turn; only the resulting briefing (applied + saved by the admin through
// the normal versioned flow) ever persists.
const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1).max(8_000),
      })
    )
    .min(1)
    .max(40)
    .refine((msgs) => msgs[msgs.length - 1]?.role === 'user', {
      message: 'The last message must be from the user',
    }),
})

export const POST = withTeamAdmin<Params>(async (req, { params }, user) => {
  const body = await parseBody(req, chatSchema)
  if (body.response) return body.response

  const campaign = await prisma.campaign.findFirst({
    where: { id: params.id, isDeleted: false },
    select: { id: true, teamId: true },
  })
  if (!campaign || campaign.teamId !== user.teamId) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  // CLI mode bills the acting user's personal Claude token when connected
  // (the team token otherwise) — see src/lib/agent/userToken.ts.
  const result = await withClaudeAuth(user.userId, user.teamId, () =>
    runBriefingChat(params.id, body.data.messages)
  )
  return NextResponse.json(result)
})
