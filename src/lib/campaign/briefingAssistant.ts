import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { PostGenerationAction } from '@prisma/client'
import { resolveAnthropicApiKey } from '@/providers/registry'
import { isCliMode, modelFor } from '@/lib/agent/config'
import { runClaudeCli, stripCodeFences } from '@/lib/agent/claudeCli'
import { getActiveCampaignBriefing } from '@/lib/campaign/briefing'
import { collectCampaignDocsContext, collectCampaignDocImageUrls } from '@/lib/campaign/documents'
import { runVisionModel } from '@/lib/agent/vision'
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

// Exported for reuse by the brand-kit assistant (same mode-agnostic text call).
export async function runBriefingModel(system: string, messages: ChatMessage[]): Promise<string> {
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
// for both assistant prompts. `brandKitId` (the brief's own kit selection)
// overrides the campaign chain, matching generation-time precedence.
async function buildCampaignContext(campaignId?: string, brandKitId?: string): Promise<string> {
  const [kit, docs, activeBriefing] = await Promise.all([
    resolveBrandKit(campaignId, brandKitId),
    campaignId ? collectCampaignDocsContext(campaignId) : Promise.resolve({ text: '', truncated: false }),
    campaignId ? getActiveCampaignBriefing(campaignId) : Promise.resolve(null),
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

// ── Auto-scheduling plan (F4) ────────────────────────────────────────────────
// When the admin asks to "generate posts as per a scheme", the model proposes a
// posting plan inside a ```schedule fenced block. The app renders it as an
// editable list the admin approves, then batch-creates ScheduledGeneration rows.
// The model emits only topic/goal/tone/cadence/action per post; channels, size,
// and design path default from the campaign at approval time.
const SCHEDULE_FENCE = /```schedule\s*\n([\s\S]*?)```/g

const schedulePlanItemSchema = z.object({
  topic: z.string().trim().min(1),
  goal: z.string().trim().min(1).default('awareness'),
  tone: z.string().trim().min(1).default('professional'),
  // Cadence as an offset from approval time — the client renders an editable
  // date, so absolute timestamps the model can't know reliably are avoided.
  daysFromNow: z.number().int().min(0).max(365).default(1),
  postAction: z.nativeEnum(PostGenerationAction).default('HOLD'),
})
export type SchedulePlanItem = z.infer<typeof schedulePlanItemSchema>

const schedulePlanSchema = z.object({ posts: z.array(schedulePlanItemSchema).min(1).max(50) })

// Pull the LAST ```schedule block, parse + validate it. Returns null when there
// is no block or the JSON/shape is invalid (a malformed plan is simply ignored
// rather than surfaced — the assistant can be asked to try again).
export function extractSchedulePlan(text: string): SchedulePlanItem[] | null {
  let match: RegExpExecArray | null = null
  for (const m of text.matchAll(SCHEDULE_FENCE)) match = m
  const raw = match?.[1]?.trim()
  if (!raw) return null
  try {
    const parsed = schedulePlanSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data.posts : null
  } catch {
    return null
  }
}

export interface BriefingChatResult {
  reply: string
  briefingDraft: string | null
  schedulePlan: SchedulePlanItem[] | null
}

export async function runBriefingChat(
  campaignId: string,
  messages: ChatMessage[]
): Promise<BriefingChatResult> {
  if (MOCK_AI) {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    const reply = buildMockBriefingReply(lastUser?.content ?? '')
    return {
      reply,
      briefingDraft: extractBriefingBlock(reply),
      schedulePlan: extractSchedulePlan(reply),
    }
  }

  const [context, imageUrls] = await Promise.all([
    buildCampaignContext(campaignId),
    collectCampaignDocImageUrls(campaignId),
  ])
  const system = [
    'You are a marketing strategist helping an admin of bistec-studio plan a campaign.',
    'The briefing is free-text context injected into every AI post generation under this campaign, on top of the brand voice: it should cover the campaign\'s goal, audience, key messages, offers/CTAs, tone adjustments, and any do/don\'t rules.',
    'Interview the admin: ask focused questions about gaps, propose concrete wording, and refine based on their answers. Ground everything in the source documents when they are provided.',
    'When proposing or refining the BRIEFING, include your current best complete briefing draft inside a fenced code block that starts with ```briefing and ends with ``` — the app extracts that block so the admin can apply it to the editor. Keep the draft plain text (no markdown headers inside the block), roughly 100-300 words.',
    'When the admin asks you to PLAN or SCHEDULE a series of posts (a "scheme", e.g. "4 posts a week for the next month, one per service line"), infer a sensible count, cadence, and per-post topics from their request and the campaign context, then propose the plan inside a fenced block that starts with ```schedule and ends with ```. Inside it put ONLY minified-or-pretty JSON of the shape {"posts":[{"topic":string,"goal":string,"tone":string,"daysFromNow":integer,"postAction":"HOLD"|"SCHEDULE_PUBLISH"|"PUBLISH_NOW"}]}. daysFromNow is the whole-day offset from today for that post. Default postAction to "HOLD" unless the admin explicitly asks to auto-publish. Briefly summarise the plan in prose above the block; the app turns the block into an editable, approvable schedule.',
    imageUrls.length > 0
      ? 'Reference images uploaded by the marketing team are attached — treat their content (products, layouts, moods, text) as campaign source material alongside the documents.'
      : '',
    context ? `\n# Campaign context\n\n${context}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  // Uploaded PNG/JPG reference images ground the chat through the vision model;
  // text-only campaigns keep the plain chat call.
  let reply: string
  if (imageUrls.length > 0) {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    const transcript = messages
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n')
    const userMessage = [
      'Conversation so far:',
      transcript,
      '',
      `Write the Assistant's next reply to the latest user message: ${lastUser?.content ?? ''}`,
    ].join('\n')
    reply = await runVisionModel({ system, userMessage, imageUrls, label: 'briefing' })
  } else {
    reply = await runBriefingModel(system, messages)
  }
  return {
    reply,
    briefingDraft: extractBriefingBlock(reply),
    schedulePlan: extractSchedulePlan(reply),
  }
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

export interface EnhancePostBriefInput {
  topic: string
  content: string
  goal?: string
  tone?: string
  campaignId?: string
  brandKitId?: string
}

// One-shot rewrite of a POST brief (the wizard's Content step) — the
// per-post twin of enhanceBriefing. Grounded in the same context the
// generation itself will use: the resolved brand voice plus, when a campaign
// is selected, its active briefing and source documents.
export async function enhancePostBrief(input: EnhancePostBriefInput): Promise<string> {
  if (MOCK_AI) return buildMockBriefingEnhance(input.content)

  const context = await buildCampaignContext(input.campaignId, input.brandKitId)
  const system = [
    'You improve briefs for single social media posts in bistec-studio. The brief is the prompt an AI copywriter and an AI designer act on to produce ONE Instagram/LinkedIn image post.',
    'Rewrite the brief the user provides: keep every concrete fact, sharpen vague statements, make the key message and call-to-action explicit, and add helpful specifics from the campaign context when they clearly apply to this post.',
    'If the user provides only a topic, draft the brief from the topic and the context.',
    'Stay focused on this one post — do not restate the whole campaign briefing.',
    'Reply with ONLY the improved brief as plain text — no preamble, no commentary, no code fences, no headings. Roughly 40-120 words.',
    context ? `\n# Campaign context\n\n${context}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const details = [
    `Topic: ${input.topic}`,
    input.goal ? `Goal: ${input.goal}` : '',
    input.tone ? `Tone: ${input.tone}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const userMessage = input.content.trim()
    ? `${details}\n\nImprove this post brief:\n\n${input.content}`
    : `${details}\n\nDraft a post brief for this topic.`

  const reply = await runBriefingModel(system, [{ role: 'user', content: userMessage }])
  return stripCodeFences(reply).trim()
}
