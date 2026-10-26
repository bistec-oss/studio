// Caption-generation prompt builder shared by all copy providers (Anthropic,
// OpenAI, Claude CLI). Brand identity comes from the resolved brand kit —
// never hardcoded — so per-brief kit selection affects caption tone too.
//
// One call writes every requested target: a caption per channel plus,
// optionally, the on-image headline. The per-channel briefs, length guidance and
// key list all come from the CAPTION_CHANNELS registry, never written here. The
// reply is extracted by extractCaptionReply (src/lib/captions/extract.ts), which
// is why the prompt asks for one JSON object with exactly these keys.

import type { BriefInput } from '@/providers/interfaces/CopyProvider'
import { CAPTION_CHANNELS, type CaptionTarget } from '@/lib/channels'
import { captionReplyKeys } from '@/lib/captions/extract'
import { HEADLINE_MAX } from '@/lib/captions/headline'
import { derivedPromptVersion } from '@/lib/postStyles'

// Bump when caption prompt content changes materially; logged with every
// caption call. Separate from PROMPT_VERSION, which versions the design prompts.
// 2026-10-25.1: post styles (027): derived from the post-style dataset, like
// PROMPT_VERSION, and the user prompt carries the style's caption rules.
export const CAPTION_PROMPT_VERSION_BASE = '2026-10-25.1'
export const CAPTION_PROMPT_VERSION = derivedPromptVersion(CAPTION_PROMPT_VERSION_BASE)

// Room for two captions plus a headline, including non-Latin scripts at about
// one token per character.
export const CAPTION_MAX_TOKENS = 8192

export interface CaptionPrompt {
  system: string
  user: string
}

const count = (n: number) => n.toLocaleString('en-US')

function systemPrompt(brief: BriefInput, task: string): string {
  const brandName = brief.brandName ?? 'the brand'
  const voiceSection = brief.brandVoice
    ? `\n\nBrand voice guidelines:\n${brief.brandVoice}`
    : ''
  const briefingSection = brief.campaignBriefing
    ? `\n\nCampaign briefing (applies to every post in this campaign):\n${brief.campaignBriefing}`
    : ''
  return `You are an expert social media copywriter for ${brandName}. ${task}${voiceSection}${briefingSection}`
}

export function buildCaptionPrompt(brief: BriefInput, targets: readonly CaptionTarget[]): CaptionPrompt {
  const channels = CAPTION_CHANNELS.filter((s) => targets.includes(s.channel))

  const bullets: string[] = []
  if (targets.includes('HEADLINE')) {
    bullets.push(
      `- "headline": the short line printed on the post image: one line, at most ${HEADLINE_MAX} characters, no hashtags, no emoji, no markdown.`
    )
  }
  for (const s of channels) {
    const length = s.hardLimit !== null ? `At most ${count(s.hardLimit)} characters.` : ''
    bullets.push(`- "${s.jsonKey}" (${s.label}): ${s.brief}${length ? ` ${length}` : ''}`)
  }

  // 027 FR-09: the post style's caption rules, after Tone and before the task.
  const rulesBlock = brief.captionRules ? `

${brief.captionRules}` : ''

  const keys = captionReplyKeys(targets)
    .map((k) => `"${k}"`)
    .join(', ')
  const labels = channels.map((s) => s.label).join(', ')

  return {
    system: systemPrompt(
      brief,
      `Write compelling, on-brand captions${labels ? ` for ${labels}` : ''}, each tailored to its channel.`
    ),
    user: `Topic: ${brief.topic}
Description: ${brief.description}
Goal: ${brief.goal}
Tone: ${brief.tone}${rulesBlock}

Write the following for the brief above:
${bullets.join('\n')}

Reply with exactly one JSON object whose keys are exactly ${keys}, each a string. No other keys. Escape newlines as \\n. The reply must contain that JSON object and nothing else: no preamble, no explanation, no code fences.`,
  }
}
