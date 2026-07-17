// Path B (freeform design) prompt builders — the single source for the API
// tool-use loop, the CLI single-shot runner, and the ACP/MCP surface. Pure
// functions: brief/kit in, prompt strings out.

import type { ResolvedBrandKit } from '@/lib/brandkit/resolve'
import { buildBrandKitSystemContext } from '@/lib/brandkit/systemContext'
import type { PipelineMode } from '@/lib/agent/config'
import type { BriefImage } from '@/lib/agent/briefInput'
import { outputProtocol } from './shared'

export interface PathBPromptOptions {
  kit: ResolvedBrandKit
  mode: PipelineMode
  width: number
  height: number
  artifactUrls?: string[]
  // Style-reference template HTML with inline assets already externalized
  // (structural HTML only — see pathB.ts runner for the extraction rationale).
  referenceTemplateHtml?: string | null
  // Pre-generated AI background image (see agent/background.ts pre-step).
  backgroundImageUrl?: string | null
}

export function buildPathBSystemPrompt(opts: PathBPromptOptions): string {
  const { kit, mode, width, height, artifactUrls = [], referenceTemplateHtml, backgroundImageUrl } = opts

  // data: URIs are unreadable base64 that blow the model context — filter them
  // out here, the single point where artifact URLs are joined into the prompt.
  const referenceUrls = artifactUrls.filter((u) => !u.startsWith('data:'))
  const artifactLine = referenceUrls.length > 0
    ? `\n- Brand reference images: ${referenceUrls.join(', ')}`
    : ''

  const backgroundLine = backgroundImageUrl
    ? `\n- Background image (MUST use): a background image has been pre-generated for this post at ${backgroundImageUrl} — use it as the full-bleed background layer (CSS background-image with background-size: cover, or an absolutely-positioned <img> behind the content). Layer a subtle scrim/gradient overlay where needed so all text stays clearly legible over it.`
    : ''

  const referenceTemplateLine = referenceTemplateHtml
    ? `\n- Style reference: the following template shows the visual style to inspire your design (do NOT fill or copy it — design from scratch). Inlined assets appear as __INLINE_ASSET_n__ placeholders; ignore them and invent your own visuals: ${referenceTemplateHtml}`
    : ''

  return `You are a professional social media design agent. Your task is to create a complete, original HTML/CSS social media post design from scratch.

${buildBrandKitSystemContext(kit)}${artifactLine}

Design requirements:
- Create a visually striking, on-brand social media post
- Use the brand colors as CSS custom properties
- Apply brand fonts via @font-face (use the provided URLs) or fall back to system fonts
- If the logo URL is provided, include it in the design
- Output dimensions: ${width}×${height} pixels${backgroundLine}

Image intent rules (IMPORTANT):
- Images tagged "embed": YOU MUST include these in the HTML layout via <img> tags
- Images tagged "reference": use for compositional inspiration only — do NOT embed as <img> tags${referenceTemplateLine}
${outputProtocol(mode, width, height)}`
}

export interface PathBUserMessageOptions {
  topic: string
  description?: string | null
  goal: string
  tone: string
  channels: string[]
  copyText: string
  mode: PipelineMode
  width: number
  height: number
  briefImages?: BriefImage[]
  // Active campaign briefing — campaign-level context shared by every post in
  // the campaign, rendered above the per-post brief fields.
  campaignBriefing?: string | null
}

export type { BriefImage }

export function buildPathBUserMessage(opts: PathBUserMessageOptions): string {
  const { topic, description, goal, tone, channels, copyText, mode, width, height, briefImages = [], campaignBriefing } = opts

  const imageSection = briefImages.length > 0
    ? `\n\nProvided images (follow intent rules from system prompt):\n${briefImages.map((img) => `- ${img.url} (intent: ${img.intent})`).join('\n')}`
    : ''

  const briefingSection = campaignBriefing
    ? `Campaign briefing (applies to every post in this campaign — follow it alongside the brief below):
${campaignBriefing}

`
    : ''

  const finalStep = mode === 'api'
    ? `Call renderHtml(html, ${width}, ${height}) as your final step.`
    : `Output the complete HTML document.`

  return `${briefingSection}Create a social media post for the following brief:

Topic: ${topic}
Description: ${description || 'none'}
Goal: ${goal}
Tone: ${tone}
Channels: ${channels.join(', ')}

Copy text to use: ${copyText}${imageSection}

Design a complete, original HTML/CSS post. ${finalStep}`
}
