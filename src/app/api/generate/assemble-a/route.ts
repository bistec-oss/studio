import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { forbiddenIfNotOwner } from '@/lib/auth'
import { withAuth, parseBody } from '@/lib/api/handler'
import { resolveBrandKit } from '@/lib/brandkit/resolve'
import { resolveExportUrl } from '@/lib/storage/minio'
import { resolveCopyProvider } from '@/providers/registry'
import { runDesignAgent } from '@/lib/agent/designAgent'
import { runDesignAgentCli } from '@/lib/agent/designAgentCli'
import { extractInlineAssets } from '@/lib/agent/inlineAssets'
import { AgentToolLimitError } from '@/lib/agent/types'
import { dimensionsFor } from '@/lib/aspectRatio'
import { isCliMode, modelFor, pipelineMode } from '@/lib/agent/config'
import { buildBriefInput } from '@/lib/agent/briefInput'
import { buildPathASystemPrompt, buildPathAUserMessage } from '@/lib/agent/prompts/pathA'
import { PROMPT_VERSION } from '@/lib/agent/prompts/shared'

const bodySchema = z.object({ briefId: z.string(), templateId: z.string() })

export const POST = withAuth(async (req: NextRequest, _ctx, user) => {
  const body = await parseBody(req, bodySchema)
  if (body.response) return body.response
  const { briefId, templateId } = body.data

  const brief = await prisma.brief.findUnique({ where: { id: briefId } })
  if (!brief) return NextResponse.json({ error: 'Brief not found' }, { status: 404 })
  const forbidden = forbiddenIfNotOwner(user, brief.userId)
  if (forbidden) return forbidden

  const template = await prisma.brandKitTemplate.findUnique({ where: { id: templateId } })
  if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

  // If the brief pinned a brand kit, the template must belong to it — the wizard
  // only offers templates from the selected kit, so a mismatch is a bad request.
  if (brief.brandKitId && template.brandKitId !== brief.brandKitId) {
    return NextResponse.json(
      { error: 'Template does not belong to the brief\'s selected brand kit' },
      { status: 400 }
    )
  }

  // The template must be designed for the brief's chosen size — the wizard filters
  // the picker to matching templates, so a mismatch would mean a stretched render.
  if (template.aspectRatio !== brief.aspectRatio) {
    return NextResponse.json(
      { error: 'Template aspect ratio does not match the brief\'s selected size' },
      { status: 400 }
    )
  }

  // Output canvas for this brief (1080×1080 square or 1080×1350 portrait).
  const { width, height } = dimensionsFor(brief.aspectRatio)

  // Resolve brand kit: explicit brief kit → campaign → project → system default.
  const kit = await resolveBrandKit(brief.campaignId ?? undefined, brief.brandKitId ?? undefined)

  try {
    // Generate copy inline (avoid HTTP round-trip); brand voice comes from the kit.
    const copyProvider = await resolveCopyProvider(brief.copyProviderKey ?? undefined)
    const copyText = await copyProvider.generateCopy(buildBriefInput(brief, kit))

    // Externalize inline data: assets (e.g. base64 logos/backgrounds) before the
    // template enters the prompt. The model sees compact placeholder tokens; the
    // real assets are spliced back in just before rendering. Keeps oversized
    // templates (e.g. "Hearts Talk", 1.81 MB) within the prompt/context limits.
    const { html: slimTemplate, assets: inlineAssets } = extractInlineAssets(template.htmlTemplate)
    const hasInlineAssets = Object.keys(inlineAssets).length > 0

    const mode = pipelineMode()
    const systemPrompt = buildPathASystemPrompt({
      kit,
      mode,
      width,
      height,
      hasInlineAssets,
      additionalImageUrl: brief.additionalImageUrl,
    })
    const userMessage = buildPathAUserMessage({
      slimTemplate,
      copyText,
      mode,
      width,
      height,
      additionalImageUrl: brief.additionalImageUrl,
    })

    const result = isCliMode()
      ? await runDesignAgentCli({
          systemPrompt,
          userMessage,
          briefId,
          inlineAssets,
          width,
          height,
          model: modelFor('A', 'cli'),
        })
      : await runDesignAgent({
          systemPrompt,
          userMessage,
          briefId,
          model: modelFor('A', 'api'),
          maxToolCalls: 15,
          inlineAssets,
          width,
          height,
        })

    const draft = await prisma.draft.create({
      data: {
        briefId,
        copyText,
        htmlContent: result.htmlContent,
        templateId,
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
