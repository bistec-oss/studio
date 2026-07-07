// Copy-generation prompt builder shared by all copy providers (Anthropic,
// OpenAI, Claude CLI). Brand identity comes from the resolved brand kit —
// never hardcoded — so per-brief kit selection affects copy tone too.

import type { BriefInput } from '@/providers/interfaces/CopyProvider'

export interface CopyPrompt {
  system: string
  user: string
}

export function buildCopyPrompt(brief: BriefInput): CopyPrompt {
  const channelList = brief.channels.join(', ')
  const brandName = brief.brandName ?? 'the brand'
  const voiceSection = brief.brandVoice
    ? `\n\nBrand voice guidelines:\n${brief.brandVoice}`
    : ''
  const briefingSection = brief.campaignBriefing
    ? `\n\nCampaign briefing (applies to every post in this campaign):\n${brief.campaignBriefing}`
    : ''

  return {
    system: `You are an expert social media copywriter for ${brandName}. Write compelling, on-brand copy for ${channelList} posts.${voiceSection}${briefingSection}`,
    user: `Topic: ${brief.topic}
Description: ${brief.description}
Goal: ${brief.goal}
Tone: ${brief.tone}
Channels: ${channelList}

Write engaging copy for the above brief. Return ONLY the post copy text — no preamble, no explanation, no markdown headings.`,
  }
}
