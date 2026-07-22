import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withTeamAdmin } from '@/lib/api/handler'
import { draftBrandVoice } from '@/lib/brandkit/voiceDraft'

type Params = { id: string }

export const POST = withTeamAdmin<Params>(async (req: NextRequest, { params }, user) => {
  const body = await req.json()
  const { description } = body

  if (!description?.trim()) {
    return NextResponse.json({ error: 'description is required' }, { status: 400 })
  }

  const kit = await prisma.brandKit.findUnique({
    where: { id: params.id },
    include: { artifacts: { where: { feedToAI: true }, select: { name: true, type: true } } },
  })
  if (!kit || kit.isDeleted || kit.teamId !== user.teamId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const colors = Array.isArray(kit.colors) ? (kit.colors as string[]).join(', ') : 'none specified'
  const fonts = Array.isArray(kit.fonts)
    ? (kit.fonts as Array<{ name: string }>).map(f => f.name).join(', ')
    : 'none specified'
  const artifactNames = kit.artifacts.map(a => `${a.name} (${a.type})`).join(', ') || 'none'

  // Drafts via the shared helper: MOCK_AI test seam + provider-registry key
  // resolution live inside it (see src/lib/brandkit/voiceDraft.ts).
  const draft = await draftBrandVoice(
    user.teamId,
    `You are a brand strategist. Write a brand voice prompt for an AI design agent.

Brand name: ${kit.name}
Brand colors: ${colors}
Brand fonts: ${fonts}
Brand artifacts: ${artifactNames}
Admin description: ${description}

Write a detailed system prompt (2–4 paragraphs) that instructs an AI design agent to maintain brand consistency when creating social media posts. Cover: visual style, tone of voice, color usage, typography guidance, and what to avoid. Write the prompt in second person addressed to the AI ("You are...").`,
    {
      // Preserves this route's exact historical MOCK_AI response (E2E asserts on it).
      mockDraft: `You are the brand voice for ${kit.name}. [MOCK generated brand voice prompt for E2E tests — deterministic. Covers visual style, tone of voice, colour usage, typography guidance, and what to avoid.]`,
    },
  )

  // Return the draft — admin must explicitly save it as a new version
  return NextResponse.json({ draft })
})
