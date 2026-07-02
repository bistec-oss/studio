import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { forbiddenIfNotOwner } from '@/lib/auth'
import { withAuth, parseBody } from '@/lib/api/handler'
import { resolveBrandKit } from '@/lib/brandkit/resolve'
import { resolveExportUrl } from '@/lib/storage/minio'
import { resolveCopyProvider } from '@/providers/registry'
import { runPathBDesign } from '@/lib/agent/pathB'
import { buildBriefInput } from '@/lib/agent/briefInput'
import { AgentToolLimitError } from '@/lib/agent/types'
import { PROMPT_VERSION } from '@/lib/agent/prompts/shared'

const bodySchema = z.object({ briefId: z.string() })

export const POST = withAuth(async (req: NextRequest, _ctx, user) => {
  const body = await parseBody(req, bodySchema)
  if (body.response) return body.response
  const { briefId } = body.data

  const brief = await prisma.brief.findUnique({ where: { id: briefId } })
  if (!brief) return NextResponse.json({ error: 'Brief not found' }, { status: 404 })
  const forbidden = forbiddenIfNotOwner(user, brief.userId)
  if (forbidden) return forbidden

  // Resolve brand kit (required for Path B):
  // explicit brief kit → campaign → project → system default.
  const kit = await resolveBrandKit(brief.campaignId ?? undefined, brief.brandKitId ?? undefined)
  if (!kit) {
    return NextResponse.json(
      { code: 'NO_BRAND_KIT', message: 'No brand kit found — configure a brand kit for this campaign, project, or set a system default.' },
      { status: 422 }
    )
  }

  // Generate copy — brand voice comes from the resolved kit.
  const copyProvider = await resolveCopyProvider(brief.copyProviderKey ?? undefined)
  const copyText = await copyProvider.generateCopy(buildBriefInput(brief, kit))

  try {
    const result = await runPathBDesign(brief, kit, copyText)

    const draft = await prisma.draft.create({
      data: {
        briefId,
        copyText,
        htmlContent: result.htmlContent,
        // result.exportUrl is an EXPORTS object key; stored as-is, signed per read.
        exportUrl: result.exportUrl,
        status: 'EXPORTED',
        promptVersion: PROMPT_VERSION,
      },
    })

    return NextResponse.json({ draftId: draft.id, exportUrl: await resolveExportUrl(draft.exportUrl) })
  } catch (err) {
    if (err instanceof AgentToolLimitError) {
      return NextResponse.json({ code: 'AGENT_LIMIT', message: err.message }, { status: 422 })
    }
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ code: 'AGENT_ERROR', message }, { status: 422 })
  }
})
