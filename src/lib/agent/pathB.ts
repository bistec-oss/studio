import { prisma } from '@/lib/prisma'
import type { Brief } from '@prisma/client'
import type { ResolvedBrandKit } from '@/lib/brandkit/resolve'
import { buildBrandKitSystemContext } from '@/lib/brandkit/systemContext'
import type { BriefInput } from '@/providers/interfaces/CopyProvider'
import type { DesignAgentResult } from '@/lib/agent/types'
import { runDesignAgent } from '@/lib/agent/designAgent'
import { runDesignAgentCli } from '@/lib/agent/designAgentCli'

const CLI_MODE = (process.env.DESIGN_PROVIDER ?? '') === 'cli'

// Builds the provider-facing BriefInput from a Brief row. Shared by the copy
// generation paths (assemble-b, regenerate-copy) so the shape stays identical.
export function buildBriefInput(brief: Brief): BriefInput {
  const briefImages = Array.isArray(brief.briefImages)
    ? (brief.briefImages as Array<{ url: string; intent: 'embed' | 'reference' }>)
    : undefined
  return {
    topic: brief.topic,
    description: brief.description ?? '',
    goal: brief.goal,
    tone: brief.tone,
    channels: brief.channels,
    designMode: brief.designMode,
    copyProviderKey: brief.copyProviderKey ?? undefined,
    imageProviderKey: brief.imageProviderKey ?? undefined,
    additionalImageUrl: brief.additionalImageUrl ?? undefined,
    briefImages: briefImages && briefImages.length > 0 ? briefImages : undefined,
    referenceTemplateId: brief.referenceTemplateId ?? undefined,
  }
}

// Runs the Path B (freeform) design pipeline for a given brief + already-generated
// copy, dispatching CLI vs API exactly as assemble-b did. Returns the design
// result (HTML + EXPORTS object key). Throws on agent errors — callers map those
// to responses. Single source of truth for both initial generation (assemble-b)
// and regeneration (regenerate-design), so the two never drift.
export async function runPathBDesign(
  brief: Brief,
  kit: ResolvedBrandKit,
  copyText: string,
): Promise<DesignAgentResult> {
  // Feed-to-AI artifact URLs (brand reference imagery).
  const artifacts = await prisma.brandKitArtifact.findMany({
    where: { brandKitId: kit.id, feedToAI: true },
    select: { url: true },
  })
  const artifactUrls = artifacts.map((a) => a.url)

  // Optional reference template for style inspiration.
  let referenceTemplate: { htmlTemplate: string } | null = null
  if (brief.referenceTemplateId) {
    referenceTemplate = await prisma.brandKitTemplate.findUnique({
      where: { id: brief.referenceTemplateId },
      select: { htmlTemplate: true },
    })
  }

  const artifactLine = artifactUrls.length > 0
    ? `\n- Brand reference images: ${artifactUrls.join(', ')}`
    : ''

  const referenceTemplateLine = referenceTemplate
    ? `\n- Style reference: the following template shows the visual style to inspire your design (do NOT fill or copy it — design from scratch): ${referenceTemplate.htmlTemplate}`
    : ''

  const systemPrompt = `You are a professional social media design agent. Your task is to create a complete, original HTML/CSS social media post design from scratch.

${buildBrandKitSystemContext(kit)}${artifactLine}

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

  const briefImages = Array.isArray(brief.briefImages)
    ? (brief.briefImages as Array<{ url: string; intent: string }>)
    : []
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

  return CLI_MODE
    ? runDesignAgentCli({ systemPrompt, userMessage, briefId: brief.id })
    : runDesignAgent({
        systemPrompt,
        userMessage,
        briefId: brief.id,
        model: 'claude-sonnet-4-6',
        maxToolCalls: 15,
      })
}
