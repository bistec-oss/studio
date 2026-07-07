import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { forbiddenIfNotOwner } from '@/lib/auth'
import { withAuth, parseBody } from '@/lib/api/handler'
import { resolveExportUrl } from '@/lib/storage/minio'
import { generateDraftForBrief, NoBrandKitError } from '@/lib/agent/generateDraft'
import { AgentToolLimitError } from '@/lib/agent/types'
import { withUserClaudeAuth } from '@/lib/agent/userToken'

const bodySchema = z.object({ briefId: z.string() })

// Path B (freeform) — a thin HTTP adapter over generateDraftForBrief, the
// shared brief→draft orchestrator (also used by assemble-a, MCP/ACP, and the
// scheduled-generation runner).
export const POST = withAuth(async (req: NextRequest, _ctx, user) => {
  const body = await parseBody(req, bodySchema)
  if (body.response) return body.response
  const { briefId } = body.data

  const brief = await prisma.brief.findUnique({ where: { id: briefId } })
  if (!brief) return NextResponse.json({ error: 'Brief not found' }, { status: 404 })
  const forbidden = forbiddenIfNotOwner(user, brief.userId)
  if (forbidden) return forbidden

  try {
    // CLI mode bills the acting user's personal Claude token when connected
    // (shared server token otherwise) — see src/lib/agent/userToken.ts.
    const { draft } = await withUserClaudeAuth(user.userId, () => generateDraftForBrief(brief))
    return NextResponse.json({ draftId: draft.id, exportUrl: await resolveExportUrl(draft.exportUrl) })
  } catch (err) {
    if (err instanceof NoBrandKitError) {
      return NextResponse.json({ code: 'NO_BRAND_KIT', message: err.message }, { status: 422 })
    }
    if (err instanceof AgentToolLimitError) {
      return NextResponse.json({ code: 'AGENT_LIMIT', message: err.message }, { status: 422 })
    }
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ code: 'AGENT_ERROR', message }, { status: 422 })
  }
})
