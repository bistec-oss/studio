import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'
import { draftBrandVoice } from '@/lib/brandkit/voiceDraft'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole('admin')
  if (auth instanceof NextResponse) return auth

  const kit = await prisma.brandKit.findUnique({
    where: { id: params.id },
    include: { prompts: { where: { isActive: true }, take: 1 } },
  })
  if (!kit || kit.isDeleted) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const currentPrompt = kit.prompts[0]?.content
  if (!currentPrompt) {
    return NextResponse.json({ error: 'No active prompt to improve — use /generate first' }, { status: 400 })
  }

  // Drafts via the shared helper: MOCK_AI test seam + provider-registry key
  // resolution live inside it (see src/lib/brandkit/voiceDraft.ts).
  const draft = await draftBrandVoice(
    `You are a brand strategist. Improve the following brand voice prompt for an AI design agent.

Current prompt:
${currentPrompt}

Make it more specific, actionable, and comprehensive. Add concrete guidance on visual composition, spacing, hierarchy, and specific do/don't rules. Keep the same second-person tone. Return only the improved prompt text, no preamble.`,
    {
      mockDraft: `${currentPrompt} [MOCK improved brand voice prompt for E2E tests — deterministic.]`,
    },
  )

  // Return the draft — admin must explicitly save it as a new version
  return NextResponse.json({ draft })
}
