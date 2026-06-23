import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getCurrentUser, forbiddenIfNotOwner } from '@/lib/auth'
import { resolveBrandKit } from '@/lib/brandkit/resolve'
import { buildBrandKitSystemContext } from '@/lib/brandkit/systemContext'
import { runDesignAgent } from '@/lib/agent/designAgent'
import { AgentToolLimitError } from '@/lib/agent/types'

export const maxDuration = 120

interface PendingConflict {
  conflictId: string
  pendingHtml: string
  explanation: string
}

interface ConflictMarker {
  conflict: true
  explanation: string
  pendingHtml: string
}

function parseConflict(htmlContent: string): ConflictMarker | null {
  if (!htmlContent.includes('"conflict"') || !htmlContent.includes('true')) return null
  try {
    const parsed = JSON.parse(htmlContent.trim())
    if (parsed && parsed.conflict === true && typeof parsed.explanation === 'string') {
      return parsed as ConflictMarker
    }
  } catch {
    // Not a bare JSON conflict object — treat as normal HTML.
  }
  return null
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { instruction, overrideConflictId } = await req.json()
  if (!overrideConflictId && (typeof instruction !== 'string' || !instruction.trim())) {
    return NextResponse.json({ error: 'instruction is required' }, { status: 400 })
  }

  const draft = await prisma.draft.findUnique({
    where: { id: params.id },
    include: { brief: true },
  })
  if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  const forbidden = forbiddenIfNotOwner(user, draft.brief.userId)
  if (forbidden) return forbidden

  // ── Override path: apply the previously withheld HTML without re-running compliance.
  if (overrideConflictId) {
    const pending = draft.pendingConflict as unknown as PendingConflict | null
    if (!pending || pending.conflictId !== overrideConflictId) {
      return NextResponse.json({ error: 'Conflict not found or already resolved' }, { status: 409 })
    }
    return commitRevision(draft.id, draft.brief.id, instruction || 'Override brand kit conflict', pending.pendingHtml)
  }

  const kit = await resolveBrandKit(draft.brief.campaignId ?? undefined)
  if (!kit) {
    return NextResponse.json(
      { code: 'NO_BRAND_KIT', message: 'No brand kit found for this draft.' },
      { status: 422 }
    )
  }

  const systemPrompt = `You are a design refinement agent. Here is the current HTML design. Apply the user's instruction as a targeted edit — change only what the instruction requires and preserve everything else.

${buildBrandKitSystemContext(kit)}

Compliance instructions:
Before applying any change, check if it conflicts with the brand kit (e.g. introducing off-brand colors, removing the logo, replacing brand fonts). If it does NOT conflict, apply the change and call renderHtml(html, 1080, 1080) as your final step to produce the finished PNG.

If the change WOULD conflict with the brand kit, do NOT apply it and do NOT call renderHtml. Instead, your final text response must be ONLY a single JSON object, with no other text, in exactly this form:
{ "conflict": true, "explanation": "<why this conflicts with the brand kit>", "pendingHtml": "<the full modified HTML as you would have applied it>" }`

  const userMessage = `Current HTML design:

${draft.htmlContent ?? '(no current HTML — start from a blank 1080×1080 canvas)'}

Instruction: ${instruction}`

  const model = draft.brief.designMode === 'TEMPLATE' ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-4-6'

  try {
    const result = await runDesignAgent({
      systemPrompt,
      userMessage,
      briefId: draft.brief.id,
      model,
      maxToolCalls: 15,
    })

    const conflict = parseConflict(result.htmlContent)
    if (conflict) {
      const conflictId = randomUUID()
      await prisma.draft.update({
        where: { id: draft.id },
        data: {
          pendingConflict: {
            conflictId,
            pendingHtml: conflict.pendingHtml,
            explanation: conflict.explanation,
          },
        },
      })
      return NextResponse.json({ conflict: true, explanation: conflict.explanation, conflictId })
    }

    return commitRevision(draft.id, draft.brief.id, instruction, result.htmlContent, result.exportUrl)
  } catch (err) {
    if (err instanceof AgentToolLimitError) {
      return NextResponse.json({ code: 'AGENT_LIMIT', message: err.message }, { status: 422 })
    }
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ code: 'AGENT_ERROR', message }, { status: 422 })
  }
}

async function commitRevision(
  draftId: string,
  briefId: string,
  instruction: string,
  newHtml: string,
  exportUrl?: string
) {
  // The override path has no fresh render — re-render the pending HTML to produce a PNG.
  let finalExportUrl = exportUrl
  if (!finalExportUrl) {
    const { renderHtmlToPng } = await import('@/lib/renderer/puppeteer')
    const { uploadObject, BUCKET_EXPORTS } = await import('@/lib/storage/minio')
    const buffer = await renderHtmlToPng(newHtml, 1080, 1080)
    finalExportUrl = await uploadObject(buffer, BUCKET_EXPORTS, `refine-${draftId}-${Date.now()}.png`, 'image/png')
  }

  // Allocate the revision number, write the revision, and update the draft
  // atomically. Concurrent refines on the same draft can read the same max and
  // collide on @@unique([draftId, revisionNumber]) — catch P2002 and retry with
  // a freshly computed number rather than 500-ing.
  let revision: { id: string } | null = null
  const MAX_ATTEMPTS = 4
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      revision = await prisma.$transaction(async (tx) => {
        const last = await tx.draftRevision.findFirst({
          where: { draftId },
          orderBy: { revisionNumber: 'desc' },
          select: { revisionNumber: true },
        })
        const revisionNumber = (last?.revisionNumber ?? 0) + 1

        const created = await tx.draftRevision.create({
          data: {
            draftId,
            revisionNumber,
            instruction,
            htmlSnapshot: newHtml,
            exportUrl: finalExportUrl,
          },
          select: { id: true },
        })

        await tx.draft.update({
          where: { id: draftId },
          data: {
            htmlContent: newHtml,
            exportUrl: finalExportUrl,
            pendingConflict: Prisma.JsonNull,
          },
        })

        return created
      })
      break
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        attempt < MAX_ATTEMPTS
      ) {
        continue // revision number collided — recompute and retry
      }
      throw err
    }
  }

  return NextResponse.json({ reply: 'Design updated', revisionId: revision!.id, exportUrl: finalExportUrl })
}
