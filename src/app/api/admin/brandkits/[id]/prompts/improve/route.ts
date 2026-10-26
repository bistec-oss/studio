import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withTeamAdmin } from '@/lib/api/handler'
import { draftBrandVoice } from '@/lib/brandkit/voiceDraft'
import { withClaudeAuth } from '@/lib/agent/userToken'
import { AssistantModelError } from '@/lib/campaign/briefingAssistant'
import { lostMeasurableRules, measurableSpans } from '@/lib/designData/authoring'
import { buildImprovePrompt } from '@/lib/kitUpgrade/prompt'
import { MOCK_IMPROVE_DROP_RULES } from '@/lib/testHooks'

type Params = { id: string }

function stripMeasurableSpans(text: string): string {
  let out = text
  for (const span of [...measurableSpans(text)].reverse()) {
    out = out.slice(0, span.start) + out.slice(span.end)
  }
  return out
}

export const POST = withTeamAdmin<Params>(async (_req, { params }, user) => {
  const kit = await prisma.brandKit.findUnique({
    where: { id: params.id },
    include: { prompts: { where: { isActive: true }, take: 1 } },
  })
  if (!kit || kit.isDeleted || kit.teamId !== user.teamId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const currentPrompt = kit.prompts[0]?.content
  if (!currentPrompt) {
    return NextResponse.json({ error: 'No active prompt to improve — use /generate first' }, { status: 400 })
  }

  // Drafts via the shared helper: MOCK_AI test seam, model resolution and the
  // mode-agnostic call live inside it (see src/lib/brandkit/voiceDraft.ts).
  // CLI mode bills the acting user's personal Claude token when connected
  // (the team token otherwise) — see src/lib/agent/userToken.ts.
  const promptText = buildImprovePrompt(currentPrompt)
  // 007 FR-11: with the sentinel in the active prompt, the mock rewrite drops
  // every measurable span, so the lost-rule flag is reachable without a model.
  const mockDraft = currentPrompt.includes(MOCK_IMPROVE_DROP_RULES)
    ? stripMeasurableSpans(currentPrompt)
    : `${currentPrompt} [MOCK improved brand voice prompt for E2E tests — deterministic.]`

  let draft: string
  try {
    draft = await withClaudeAuth(user.userId, user.teamId, () =>
      draftBrandVoice(user.teamId, user.userId, promptText, { mockDraft })
    )
  } catch (err) {
    // 008: no model the team can run — nothing ran; say why.
    if (err instanceof AssistantModelError) {
      return NextResponse.json({ code: err.code, message: err.message }, { status: 422 })
    }
    throw err
  }

  // Return the draft — admin must explicitly save it as a new version
  // 007 FR-15: additive. The measurable rules the rewrite no longer carries.
  const lostRules = lostMeasurableRules(currentPrompt, draft)
  return NextResponse.json({ draft, lostRules })
})
