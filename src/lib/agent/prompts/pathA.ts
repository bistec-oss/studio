// Path A (template fill) prompt builders — the single source for both the API
// tool-use loop and the CLI single-shot runner. Pure functions: brief/kit in,
// prompt strings out.

import type { ResolvedBrandKit } from '@/lib/brandkit/resolve'
import { buildBrandKitSystemContext } from '@/lib/brandkit/systemContext'
import type { PipelineMode } from '@/lib/agent/config'
import { onImageHeadline, outputProtocol, placeholderNote, SCRIPT_SUPPORT_NOTE } from './shared'

export interface PathAPromptOptions {
  kit: ResolvedBrandKit | null
  mode: PipelineMode
  width: number
  height: number
  hasInlineAssets: boolean
  additionalImageUrl?: string | null
  // Active campaign briefing — Path A's user message carries only the headline,
  // topic and description, so the briefing's design-relevant direction lands here.
  campaignBriefing?: string | null
}

export function buildPathASystemPrompt(opts: PathAPromptOptions): string {
  const { kit, mode, width, height, hasInlineAssets, additionalImageUrl, campaignBriefing } = opts

  const briefingSection = campaignBriefing
    ? `\n\nCampaign context (applies to every post in this campaign):\n${campaignBriefing}`
    : ''

  const imageInstruction = additionalImageUrl
    ? `\n- A user-provided image is supplied (URL below). You MUST embed it in the template's primary photo/subject slot (e.g. the avatar/photo/headshot area), replacing whatever placeholder graphic — a decorative SVG, a coloured shape, or a sample photo — currently fills that slot. Use an <img> that covers the slot (object-fit: cover) or set it as that element's background-image. This specific URL is allowed.`
    : ''

  return `You are a professional social media design agent. Your task is to fill an HTML/CSS brand template with the provided content.

${kit ? buildBrandKitSystemContext(kit) : ''}${briefingSection}

Instructions:
- Fill the template with the provided on-image headline and brief. Replace placeholder text with the actual content.
- Keep the template's structure, layout, and CSS intact — only swap in the content. The template is already sized for a ${width}×${height} px canvas; do not change its dimensions.
- Apply brand colors as CSS custom properties where appropriate.${imageInstruction}${placeholderNote(hasInlineAssets)}
${SCRIPT_SUPPORT_NOTE}
${outputProtocol(mode, width, height)}`
}

export interface PathAUserMessageOptions {
  slimTemplate: string
  // The on-image headline (012 FR-09) — never a caption.
  headline: string
  // The only source for the template's other text slots.
  topic: string
  description?: string | null
  mode: PipelineMode
  width: number
  height: number
  additionalImageUrl?: string | null
  // 027 FR-09: the image-scope rules of the brief's post style, already
  // rendered. Absent: the message is exactly what it was before 027.
  imageRules?: string
}

export function buildPathAUserMessage(opts: PathAUserMessageOptions): string {
  const { slimTemplate, headline, topic, description, mode, width, height, additionalImageUrl, imageRules } = opts

  const imageNote = additionalImageUrl
    ? `\nUser-provided image URL (embed this into the main photo/subject slot): ${additionalImageUrl}`
    : ''

  const finalStep = mode === 'api'
    ? `Call renderHtml(html, ${width}, ${height}) when done.`
    : `Output the complete filled HTML document.`

  return `Here is the HTML template to fill:
<template>
${slimTemplate}
</template>

${onImageHeadline(headline)}

Put the headline in the template's main headline slot. Fill any other text slots only from the brief topic and description below, and invent no facts, numbers or dates.
Topic: ${topic}
Description: ${description || 'none'}${imageNote}${imageRules ? `

${imageRules}` : ''}

Replace all placeholder text. ${finalStep}`
}
