import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withTeamAuth, parseBody } from '@/lib/api/handler'
import { canAccessContent } from '@/lib/authz/visibility'
import { createPendingDraft, TemplateNotFoundError } from '@/lib/agent/generateDraft'
import { PathATemplateError } from '@/lib/agent/pathA'
import { startBackgroundGeneration } from '@/lib/agent/backgroundGeneration'

const bodySchema = z.object({ briefId: z.string(), templateId: z.string() })

// Path A (template fill) — ASYNC. Validate the template + create an IN_PROGRESS
// draft synchronously (bad template → 4xx now), then generate in the background
// and return the draft id immediately for the polling preview page. The template
// id is stored on the pending draft so the background run resolves the same one.
export const POST = withTeamAuth(async (req: NextRequest, _ctx, user) => {
  const body = await parseBody(req, bodySchema)
  if (body.response) return body.response
  const { briefId, templateId } = body.data

  const brief = await prisma.brief.findUnique({ where: { id: briefId } })
  if (
    !brief ||
    !canAccessContent(user, { teamId: brief.teamId, ownerId: brief.userId, campaignId: brief.campaignId })
  ) {
    return NextResponse.json({ error: 'Brief not found' }, { status: 404 })
  }

  try {
    const draft = await createPendingDraft(brief, { templateId })
    await startBackgroundGeneration(draft.id, user.userId)
    return NextResponse.json({ draftId: draft.id }, { status: 202 })
  } catch (err) {
    if (err instanceof TemplateNotFoundError) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }
    if (err instanceof PathATemplateError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ code: 'AGENT_ERROR', message }, { status: 422 })
  }
})
