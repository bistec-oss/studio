import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { resolveBrandKit } from '@/lib/brandkit/resolve'
import { resolveCopyProvider } from '@/providers/registry'
import type { BriefInput } from '@/providers/interfaces/CopyProvider'
import { runDesignAgent } from '@/lib/agent/designAgent'
import { AgentToolLimitError } from '@/lib/agent/types'

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { briefId, templateId } = await req.json()

  const brief = await prisma.brief.findUnique({ where: { id: briefId } })
  if (!brief) return NextResponse.json({ error: 'Brief not found' }, { status: 404 })

  const template = await prisma.brandKitTemplate.findUnique({ where: { id: templateId } })
  if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

  // Resolve brand kit
  const kit = await resolveBrandKit(brief.campaignId ?? undefined)

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

  // Build prompts
  const colors = kit?.colors.join(', ') ?? 'not specified'
  const fonts = kit?.fonts.map((f) => `${f.name} (${f.url})`).join(', ') ?? 'not specified'
  const logoUrl = kit?.logoUrl ?? 'none'
  const voicePrompt = kit?.voicePrompt ?? 'not specified'

  const systemPrompt = `You are a professional social media design agent. Your task is to fill an HTML/CSS brand template with the provided content.

Brand kit:
- Colors: ${colors}
- Fonts: ${fonts}
- Logo URL: ${logoUrl}
- Brand voice: ${voicePrompt}

Instructions:
- Fill the template with the provided copy text. Replace placeholder text with the actual content.
- Apply brand colors as CSS custom properties where appropriate.
- If the design requires a raster image, call the generateImage tool. Otherwise use CSS gradients or SVG.
- Always call renderHtml as the final step to produce the PNG.
- Output dimensions: 1080×1080 pixels.`

  const imageNote = brief.additionalImageUrl
    ? `\nAdditional image URL to embed: ${brief.additionalImageUrl}`
    : ''

  const userMessage = `Here is the HTML template to fill:
<template>
${template.htmlTemplate}
</template>

Copy text: ${copyText}${imageNote}

Fill the template with this content. Replace all placeholder text with the copy. Call renderHtml(html, 1080, 1080) when done.`

  try {
    const result = await runDesignAgent({
      systemPrompt,
      userMessage,
      briefId,
      model: 'claude-haiku-4-5-20251001',
      maxToolCalls: 15,
    })

    const draft = await prisma.draft.create({
      data: {
        briefId,
        copyText,
        htmlContent: result.htmlContent,
        templateId,
        exportUrl: result.exportUrl,
        status: 'EXPORTED',
      },
    })

    return NextResponse.json({ draftId: draft.id, exportUrl: draft.exportUrl })
  } catch (err) {
    if (err instanceof AgentToolLimitError) {
      return NextResponse.json({ code: 'AGENT_LIMIT', message: err.message }, { status: 422 })
    }
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ code: 'AGENT_ERROR', message }, { status: 422 })
  }
}
