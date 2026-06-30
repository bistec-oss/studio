import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser, forbiddenIfNotOwner } from '@/lib/auth'
import { resolveBrandKit } from '@/lib/brandkit/resolve'
import { buildBrandKitSystemContext } from '@/lib/brandkit/systemContext'
import { resolveExportUrl } from '@/lib/storage/minio'
import { resolveCopyProvider } from '@/providers/registry'
import type { BriefInput } from '@/providers/interfaces/CopyProvider'
import { runDesignAgent } from '@/lib/agent/designAgent'
import { runDesignAgentCli, CLI_INSTRUCTION } from '@/lib/agent/designAgentCli'
import { extractInlineAssets } from '@/lib/agent/inlineAssets'
import { AgentToolLimitError } from '@/lib/agent/types'
import { dimensionsFor } from '@/lib/aspectRatio'

const CLI_MODE = (process.env.DESIGN_PROVIDER ?? '') === 'cli'

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { briefId, templateId } = await req.json()

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

  // Generate copy inline (avoid HTTP round-trip)
  const copyProvider = await resolveCopyProvider(brief.copyProviderKey ?? undefined)
  const briefImages = Array.isArray(brief.briefImages)
    ? (brief.briefImages as Array<{ url: string; intent: 'embed' | 'reference' }>)
    : undefined
  const briefInput: BriefInput = {
    topic: brief.topic,
    description: brief.description ?? '',
    goal: brief.goal,
    tone: brief.tone,
    channels: brief.channels,
    designMode: brief.designMode,
    copyProviderKey: brief.copyProviderKey ?? undefined,
    imageProviderKey: brief.imageProviderKey ?? undefined,
    additionalImageUrl: brief.additionalImageUrl ?? undefined,
    briefImages: briefImages ?? undefined,
    referenceTemplateId: brief.referenceTemplateId ?? undefined,
  }
  const copyText = await copyProvider.generateCopy(briefInput)

  // Externalize inline data: assets (e.g. base64 logos/backgrounds) before the
  // template enters the prompt. The model sees compact placeholder tokens; the
  // real assets are spliced back in just before rendering. Keeps oversized
  // templates (e.g. "Hearts Talk", 1.81 MB) within the prompt/context limits.
  const { html: slimTemplate, assets: inlineAssets } = extractInlineAssets(template.htmlTemplate)
  const hasInlineAssets = Object.keys(inlineAssets).length > 0

  const placeholderNote = hasInlineAssets
    ? `\n- The template contains image placeholders like __INLINE_ASSET_0__ inside src="" or CSS url(). Keep every such token EXACTLY as-is — do not modify, remove, or replace them. They are restored to real images after rendering.`
    : ''

  const imageInstruction = brief.additionalImageUrl
    ? `\n- A user-provided image is supplied (URL below). You MUST embed it in the template's primary photo/subject slot (e.g. the avatar/photo/headshot area), replacing whatever placeholder graphic — a decorative SVG, a coloured shape, or a sample photo — currently fills that slot. Use an <img> that covers the slot (object-fit: cover) or set it as that element's background-image. This specific URL is allowed.`
    : ''

  // Build prompts
  const systemPrompt = `You are a professional social media design agent. Your task is to fill an HTML/CSS brand template with the provided content.

${buildBrandKitSystemContext(kit)}

Instructions:
- Fill the template with the provided copy text. Replace placeholder text with the actual content.
- Apply brand colors as CSS custom properties where appropriate.
- If the design requires a raster image (and none is provided), call the generateImage tool. Otherwise use CSS gradients or SVG.
- Always call renderHtml as the final step to produce the PNG.
- Output dimensions: ${width}×${height} pixels.${imageInstruction}${placeholderNote}`

  const imageNote = brief.additionalImageUrl
    ? `\nUser-provided image URL (embed this into the main photo/subject slot): ${brief.additionalImageUrl}`
    : ''

  const userMessage = `Here is the HTML template to fill:
<template>
${slimTemplate}
</template>

Copy text: ${copyText}${imageNote}

Fill the template with this content. Replace all placeholder text with the copy. Call renderHtml(html, ${width}, ${height}) when done.`

  try {
    const result = CLI_MODE
      ? await runDesignAgentCli({
          systemPrompt,
          userMessage,
          briefId,
          inlineAssets,
          cliInstruction: CLI_INSTRUCTION.templateFill,
          width,
          height,
        })
      : await runDesignAgent({
          systemPrompt,
          userMessage,
          briefId,
          model: 'claude-haiku-4-5-20251001',
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
}
