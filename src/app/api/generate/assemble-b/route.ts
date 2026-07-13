import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { forbiddenIfNotOwner } from '@/lib/auth'
import { withAuth, parseBody } from '@/lib/api/handler'
import { createPendingDraft, NoBrandKitError } from '@/lib/agent/generateDraft'
import { startBackgroundGeneration } from '@/lib/agent/backgroundGeneration'

const bodySchema = z.object({ briefId: z.string() })

// Path B (freeform) — ASYNC. Validate + create an IN_PROGRESS draft synchronously
// (bad input → 4xx now), then run the heavy generation in the background and
// return the draft id immediately so the wizard can navigate to the polling
// preview page. Non-interactive callers (MCP/ACP, scheduler) still use the
// synchronous generateDraftForBrief.
export const POST = withAuth(async (req: NextRequest, _ctx, user) => {
  const body = await parseBody(req, bodySchema)
  if (body.response) return body.response
  const { briefId } = body.data

  const brief = await prisma.brief.findUnique({ where: { id: briefId } })
  if (!brief) return NextResponse.json({ error: 'Brief not found' }, { status: 404 })
  const forbidden = forbiddenIfNotOwner(user, brief.userId)
  if (forbidden) return forbidden

  try {
    const draft = await createPendingDraft(brief)
    // Fire-and-forget: keeps running in-process after this response returns, on
    // the acting user's CLI token (shared token otherwise). Errors are caught
    // inside and recorded on the draft (status FAILED) for the inline error card.
    await startBackgroundGeneration(draft.id, user.userId)
    return NextResponse.json({ draftId: draft.id }, { status: 202 })
  } catch (err) {
    if (err instanceof NoBrandKitError) {
      return NextResponse.json({ code: 'NO_BRAND_KIT', message: err.message }, { status: 422 })
    }
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ code: 'AGENT_ERROR', message }, { status: 422 })
  }
})
