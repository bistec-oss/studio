import Anthropic from '@anthropic-ai/sdk'
import { resolveAnthropicApiKey } from '@/providers/registry'
import { isCliMode, modelFor } from '@/lib/agent/config'
import { runClaudeCli, stripCodeFences } from '@/lib/agent/claudeCli'
import { getActiveCampaignBriefing } from '@/lib/campaign/briefing'
import { collectCampaignDocsContext } from '@/lib/campaign/documents'
import { resolveBrandKit } from '@/lib/brandkit/resolve'
import { MOCK_AI, buildMockBriefingReply, buildMockBriefingEnhance } from '@/lib/testHooks'

// The AI briefing assistant: a multi-turn chat that converges on a campaign
// briefing draft, and a one-shot "enhance" rewrite of the briefing editor text.
// Both run through the same mode-agnostic model call — Anthropic SDK in API
// mode, `claude -p` in CLI mode (keyless) with the transcript folded into one
// prompt — so the feature works under either DESIGN_PROVIDER. Sonnet, like
// Path B: briefing quality is the product and calls are infrequent.

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

const MAX_TOKENS = 2048
const CLI_TIMEOUT_MS = 120_000

async function runBriefingModel(system: string, messages: ChatMessage[]): Promise<string> {
  if (isCliMode()) {
    // One prompt per turn: the CLI is stateless, so the whole transcript rides
    // along. Doc context is capped (documents.ts) to keep this affordable.
    const transcript = messages
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n')
    const prompt = [
      system,
      '--- Conversation so far ---',
      transcript,
      '--- End of conversation ---',
      'Write the Assistant\'s next reply only. Do not prefix it with "Assistant:".',
    ].join('\n\n')
    return runClaudeCli(prompt, {
      timeoutMs: CLI_TIMEOUT_MS,
      label: 'briefing',
      model: modelFor('B', 'cli'),
    })
  }

  const apiKey = await resolveAnthropicApiKey()
  const client = new Anthropic({ apiKey: apiKey ?? undefined })
  const message = await client.messages.create({
    model: modelFor('B', 'api'),
    max_tokens: MAX_TOKENS,
    system,
    messages,
  })
  const textBlock = message.content.find((b) => b.type === 'text')
  return textBlock && 'text' in textBlock ? textBlock.text : ''
}

// Shared campaign context (brand voice + source documents + current briefing)
// for both assistant prompts.
async function buildCampaignContext(campaignId: string): Promise<string> {
  const [kit, docs, activeBriefing] = await Promise.all([
    resolveBrandKit(campaignId),
    collectCampaignDocsContext(campaignId),
    getActiveCampaignBriefing(campaignId),
  ])

  const sections: string[] = []
  if (kit?.voicePrompt) {
    sections.push(`## Brand voice (${kit.name})\n\n${kit.voicePrompt}`)
  }
  if (docs.text) {
    sections.push(
      `## Source documents provided by the marketing team\n\n${docs.text}` +
        (docs.truncated
          ? '\n\n(Note: the document text above was truncated to fit — treat it as an excerpt.)'
          : '')
    )
  }
  if (activeBriefing) {
    sections.push(`## Current active campaign briefing\n\n${activeBriefing}`)
  }
  return sections.join('\n\n')
}

const BRIEFING_FENCE = /```briefing\s*\n([\s\S]*?)```/g

// Pulls the LAST ```briefing block out of a reply (the assistant may restate
// the draft as the conversation converges — the latest one wins).
export function extractBriefingBlock(text: string): string | null {
  let match: RegExpExecArray | null = null
  for (const m of text.matchAll(BRIEFING_FENCE)) match = m
  const content = match?.[1]?.trim()
  return content ? content : null
}

export interface BriefingChatResult {
  reply: string
  briefingDraft: string | null
}

export async function runBriefingChat(
  campaignId: string,
  messages: ChatMessage[]
): Promise<BriefingChatResult> {
  if (MOCK_AI) {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    const reply = buildMockBriefingReply(lastUser?.content ?? '')
    return { reply, briefingDraft: extractBriefingBlock(reply) }
  }

  const context = await buildCampaignContext(campaignId)
  const system = [
    'You are a marketing strategist helping an admin of bistec-studio write a campaign briefing.',
    'The briefing is free-text context injected into every AI post generation under this campaign, on top of the brand voice: it should cover the campaign\'s goal, audience, key messages, offers/CTAs, tone adjustments, and any do/don\'t rules.',
    'Interview the admin: ask focused questions about gaps, propose concrete wording, and refine based on their answers. Ground everything in the source documents when they are provided.',
    'In EVERY reply after you have enough to work with, include your current best complete briefing draft inside a fenced code block that starts with ```briefing and ends with ``` — the app extracts that block so the admin can apply it to the editor. Keep the draft plain text (no markdown headers inside the block), roughly 100-300 words.',
    context ? `\n# Campaign context\n\n${context}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const reply = await runBriefingModel(system, messages)
  return { reply, briefingDraft: extractBriefingBlock(reply) }
}

export async function enhanceBriefing(campaignId: string, content: string): Promise<string> {
  if (MOCK_AI) return buildMockBriefingEnhance(content)

  const context = await buildCampaignContext(campaignId)
  const system = [
    'You improve campaign briefings for bistec-studio. The briefing is free-text context injected into every AI post generation under the campaign, on top of the brand voice.',
    'Rewrite the briefing the user provides: keep every concrete fact, sharpen vague statements, fill obvious gaps from the campaign context, and structure it so a copywriter and a designer can act on it (goal, audience, key messages, offers/CTAs, tone, do/don\'t rules).',
    'If the user provides no text, draft a briefing from the campaign context alone.',
    'Reply with ONLY the improved briefing as plain text — no preamble, no commentary, no code fences. Roughly 100-300 words.',
    context ? `\n# Campaign context\n\n${context}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const userMessage = content.trim()
    ? `Improve this campaign briefing:\n\n${content}`
    : 'Draft a campaign briefing from the campaign context.'

  const reply = await runBriefingModel(system, [{ role: 'user', content: userMessage }])
  return stripCodeFences(reply).trim()
}
