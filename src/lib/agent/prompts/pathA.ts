// Path A (template fill) prompt builders — the single source for both the API
// tool-use loop and the CLI single-shot runner. Pure functions: brief/kit in,
// prompt strings out.

import type { ResolvedBrandKit } from '@/lib/brandkit/resolve'
import { buildBrandKitSystemContext } from '@/lib/brandkit/systemContext'
import type { PipelineMode } from '@/lib/agent/config'
import { outputProtocol, placeholderNote } from './shared'

export interface PathAPromptOptions {
  kit: ResolvedBrandKit | null
  mode: PipelineMode
  width: number
  height: number
  hasInlineAssets: boolean
  additionalImageUrl?: string | null
  // Active campaign briefing — Path A gets no other brief context (copy already
  // encodes it), so the briefing's design-relevant direction lands here.
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
- Fill the template with the provided copy text. Replace placeholder text with the actual content.
- Keep the template's structure, layout, and CSS intact — only swap in the content. The template is already sized for a ${width}×${height} px canvas; do not change its dimensions.
- Apply brand colors as CSS custom properties where appropriate.${imageInstruction}${placeholderNote(hasInlineAssets)}
${outputProtocol(mode, width, height)}`
}

export interface PathAUserMessageOptions {
  slimTemplate: string
  copyText: string
  mode: PipelineMode
  width: number
  height: number
  additionalImageUrl?: string | null
}

export function buildPathAUserMessage(opts: PathAUserMessageOptions): string {
  const { slimTemplate, copyText, mode, width, height, additionalImageUrl } = opts

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

Copy text: ${copyText}${imageNote}

Fill the template with this content. Replace all placeholder text with the copy. ${finalStep}`
}
