import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withTeamAdmin, parseBody } from '@/lib/api/handler'
import { runBrandKitChat } from '@/lib/brandkit/assistant'
import { withClaudeAuth } from '@/lib/agent/userToken'
import { modelError, parseModelField } from '@/lib/models/requests'
import { AssistantModelError } from '@/lib/campaign/briefingAssistant'

type Params = { id: string }

// Stateless multi-turn vision chat: the client owns the transcript and sends it
// whole each turn; grounding is the kit's feedToAI reference-image artifacts.
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
  // 008 FR-17: the header picker's explicit model, checked by parseModelField.
  model: z.unknown().optional(),
})

export const POST = withTeamAdmin<Params>(async (req, { params }, user) => {
  const body = await parseBody(req, chatSchema)
  if (body.response) return body.response
  const pick = parseModelField(body.data.model)
  if (!pick.ok) return NextResponse.json(pick.body, { status: 400 })
  const requested = pick.value

  const kit = await prisma.brandKit.findUnique({
    where: { id: params.id },
    select: { id: true, isDeleted: true, teamId: true },
  })
  if (!kit || kit.isDeleted || kit.teamId !== user.teamId) {
    return NextResponse.json({ error: 'Brand kit not found' }, { status: 404 })
  }

  // CLI mode bills the acting user's personal Claude token when connected
  // (the team token otherwise) — see src/lib/agent/userToken.ts.
  try {
    const result = await withClaudeAuth(user.userId, user.teamId, () =>
      runBrandKitChat(params.id, body.data.messages, user.teamId, user.userId, requested)
    )
    return NextResponse.json(result)
  } catch (err) {
    // 008: nothing ran; say why. A refused explicit pick is FR-17's 400; no
    // model the team can run (no pick) stays the 422.
    if (err instanceof AssistantModelError) {
      if (requested) return NextResponse.json(modelError(err), { status: 400 })
      return NextResponse.json({ code: err.code, message: err.message }, { status: 422 })
    }
    throw err
  }
})
