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

  const { briefId } = await req.json()

  const brief = await prisma.brief.findUnique({ where: { id: briefId } })
  if (!brief) return NextResponse.json({ error: 'Brief not found' }, { status: 404 })

  // Resolve brand kit (required for Path B)
  const kit = await resolveBrandKit(brief.campaignId ?? undefined)
  if (!kit) {
    return NextResponse.json(
      { code: 'NO_BRAND_KIT', message: 'No brand kit found — configure a brand kit for this campaign, project, or set a system default.' },
      { status: 422 }
    )
  }

  // Fetch feed-to-AI artifact URLs
  const artifacts = await prisma.brandKitArtifact.findMany({
    where: { brandKitId: kit.id, feedToAI: true },
    select: { url: true },
  })
  const artifactUrls = artifacts.map((a) => a.url)

  // Optionally load reference template for style inspiration
  let referenceTemplate: { htmlTemplate: string } | null = null
  if (brief.referenceTemplateId) {
    referenceTemplate = await prisma.brandKitTemplate.findUnique({
      where: { id: brief.referenceTemplateId },
      select: { htmlTemplate: true },
    })
  }

  // Generate copy
  const copyProvider = await resolveCopyProvider(brief.copyProviderKey ?? undefined)
  const briefImages = Array.isArray(brief.briefImages)
    ? (brief.briefImages as Array<{ url: string; intent: string }>)
    : []
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
    briefImages: briefImages.length > 0 ? (briefImages as Array<{ url: string; intent: 'embed' | 'reference' }>) : undefined,
    referenceTemplateId: brief.referenceTemplateId ?? undefined,
  }
  const copyText = await copyProvider.generateCopy(briefInput)

  // Build system prompt
  const colors = kit.colors.join(', ')
  const fonts = kit.fonts.length > 0 ? kit.fonts.map((f) => `${f.name} (${f.url})`).join(', ') : 'system fonts'
  const logoUrl = kit.logoUrl ?? 'none'
  const voicePrompt = kit.voicePrompt ?? 'not specified'

  const artifactLine = artifactUrls.length > 0
    ? `\n- Brand reference images: ${artifactUrls.join(', ')}`
    : ''

  const referenceTemplateLine = referenceTemplate
    ? `\n- Style reference: the following template shows the visual style to inspire your design (do NOT fill or copy it — design from scratch): ${referenceTemplate.htmlTemplate}`
    : ''

  const systemPrompt = `You are a professional social media design agent. Your task is to create a complete, original HTML/CSS social media post design from scratch.

Brand guidelines:
- Colors: ${colors}
- Fonts: ${fonts}
- Logo URL: ${logoUrl}
- Brand voice: ${voicePrompt}${artifactLine}

Design requirements:
- Create a visually striking, on-brand social media post
- Use the brand colors as CSS custom properties
- Apply brand fonts via @font-face (use the provided URLs) or fall back to system fonts
- If the logo URL is provided, include it in the design
- Output dimensions: 1080×1080 pixels (square format)
- Use CSS/SVG for backgrounds, shapes, and geometric elements where possible
- Only call generateImage when authentic photographic imagery genuinely improves the design
- Always call renderHtml as the final step to produce the finished PNG

Image intent rules (IMPORTANT):
- Images tagged "embed": YOU MUST include these in the HTML layout via <img> tags
- Images tagged "reference": use for compositional inspiration only — do NOT embed as <img> tags${referenceTemplateLine}`

  // Build user message
  const imageSection = briefImages.length > 0
    ? `\n\nProvided images (follow intent rules from system prompt):\n${briefImages.map((img) => `- ${img.url} (intent: ${img.intent})`).join('\n')}`
    : ''

  const userMessage = `Create a social media post for the following brief:

Topic: ${brief.topic}
Description: ${brief.description ?? 'none'}
Goal: ${brief.goal}
Tone: ${brief.tone}
Channels: ${brief.channels.join(', ')}

Copy text to use: ${copyText}${imageSection}

Design a complete, original HTML/CSS post. Call renderHtml(html, 1080, 1080) as your final step.`

  try {
    const result = await runDesignAgent({
      systemPrompt,
      userMessage,
      briefId,
      model: 'claude-sonnet-4-6',
      maxToolCalls: 15,
    })

    const draft = await prisma.draft.create({
      data: {
        briefId,
        copyText,
        htmlContent: result.htmlContent,
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
