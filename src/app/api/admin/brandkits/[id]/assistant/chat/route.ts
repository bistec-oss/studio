import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withAdmin, parseBody } from '@/lib/api/handler'
import { runBrandKitChat } from '@/lib/brandkit/assistant'
import { withUserClaudeAuth } from '@/lib/agent/userToken'

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
})

export const POST = withAdmin<Params>(async (req, { params }, user) => {
  const body = await parseBody(req, chatSchema)
  if (body.response) return body.response

  const kit = await prisma.brandKit.findUnique({ where: { id: params.id }, select: { id: true, isDeleted: true } })
  if (!kit || kit.isDeleted) return NextResponse.json({ error: 'Brand kit not found' }, { status: 404 })

  // CLI mode bills the acting user's personal Claude token when connected
  // (shared server token otherwise) — see src/lib/agent/userToken.ts.
  const result = await withUserClaudeAuth(user.userId, () => runBrandKitChat(params.id, body.data.messages))
  return NextResponse.json(result)
})
