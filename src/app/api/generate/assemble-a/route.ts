import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { forbiddenIfNotOwner } from '@/lib/auth'
import { withAuth, parseBody } from '@/lib/api/handler'
import { resolveExportUrl } from '@/lib/storage/minio'
import { generateDraftForBrief, TemplateNotFoundError } from '@/lib/agent/generateDraft'
import { PathATemplateError } from '@/lib/agent/pathA'
import { AgentToolLimitError } from '@/lib/agent/types'

const bodySchema = z.object({ briefId: z.string(), templateId: z.string() })

// Path A (template fill) — a thin HTTP adapter over generateDraftForBrief, the
// shared brief→draft orchestrator (also used by assemble-b, MCP/ACP, and the
// scheduled-generation runner).
export const POST = withAuth(async (req: NextRequest, _ctx, user) => {
  const body = await parseBody(req, bodySchema)
  if (body.response) return body.response
  const { briefId, templateId } = body.data

  const brief = await prisma.brief.findUnique({ where: { id: briefId } })
  if (!brief) return NextResponse.json({ error: 'Brief not found' }, { status: 404 })
  const forbidden = forbiddenIfNotOwner(user, brief.userId)
  if (forbidden) return forbidden

  try {
    const { draft } = await generateDraftForBrief(brief, { templateId })
    return NextResponse.json({ draftId: draft.id, exportUrl: await resolveExportUrl(draft.exportUrl) })
  } catch (err) {
    if (err instanceof TemplateNotFoundError) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }
    if (err instanceof PathATemplateError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    if (err instanceof AgentToolLimitError) {
      return NextResponse.json({ code: 'AGENT_LIMIT', message: err.message }, { status: 422 })
    }
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ code: 'AGENT_ERROR', message }, { status: 422 })
  }
})
